#!/usr/bin/env python3
"""Audit REAL RT_GROUP_ICON/RT_ICON bytes in a Windows EXE against RAW icon.ico.

Uses Windows resource APIs, NOT System.Drawing/Icon.ExtractAssociatedIcon.
That GDI+ method can return a different icon variant/alpha mask on different
Windows builds or display-scale settings. Never reports success based on a
Windows icon cache or a generic fallback; every expected ICO frame must exist
byte-for-byte in the EXE's own PE resource table.
"""
import argparse
import ctypes
from ctypes import wintypes
import hashlib
from pathlib import Path
import struct
import sys


class IconAuditError(Exception):
    pass


def parse_icon_file(data: bytes):
    if len(data) < 6:
        raise IconAuditError("RAW_V540_ICO_TRUNCATED")
    reserved, kind, count = struct.unpack_from("<HHH", data)
    if reserved != 0 or kind != 1 or not 1 <= count <= 32:
        raise IconAuditError("RAW_V540_ICO_HEADER_INVALID")
    if len(data) < 6 + 16 * count:
        raise IconAuditError("RAW_V540_ICO_DIRECTORY_TRUNCATED")
    frames = []
    for index in range(count):
        entry = struct.unpack_from("<BBBBHHII", data, 6 + index * 16)
        width, height, _, _, planes, bits, size, offset = entry
        if not size or offset < 6 + count * 16 or offset + size > len(data):
            raise IconAuditError("RAW_V540_ICO_FRAME_INVALID")
        frames.append({
            "width": width or 256,
            "height": height or 256,
            "planes": planes,
            "bits": bits,
            "data": data[offset: offset + size],
        })
    if not any(f["width"] == 32 and f["height"] == 32 for f in frames):
        raise IconAuditError("RAW_V540_ICO_32_MISSING")
    if not any(f["width"] == 256 and f["height"] == 256 for f in frames):
        raise IconAuditError("RAW_V540_ICO_256_MISSING")
    return frames


def parse_resource_group(data: bytes):
    if len(data) < 6:
        raise IconAuditError("RAW_V540_PE_GROUP_TRUNCATED")
    reserved, kind, count = struct.unpack_from("<HHH", data)
    if reserved != 0 or kind != 1 or not 1 <= count <= 32:
        raise IconAuditError("RAW_V540_PE_GROUP_INVALID")
    if len(data) < 6 + count * 14:
        raise IconAuditError("RAW_V540_PE_GROUP_ENTRIES_TRUNCATED")
    frames = []
    for index in range(count):
        width, height, _, _, planes, bits, size, resource_id = struct.unpack_from(
            "<BBBBHHIH", data, 6 + 14 * index
        )
        frames.append({
            "width": width or 256,
            "height": height or 256,
            "planes": planes,
            "bits": bits,
            "size": size,
            "id": resource_id,
        })
    return frames


def inspect_pe_icon_resources(exe: Path):
    if sys.platform != "win32":
        raise IconAuditError("RAW_V540_PE_WINDOWS_ONLY")
    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    hmodule = wintypes.HMODULE
    pointer = ctypes.c_void_p
    k32.LoadLibraryExW.argtypes = [wintypes.LPCWSTR, pointer, wintypes.DWORD]
    k32.LoadLibraryExW.restype = hmodule
    k32.FreeLibrary.argtypes = [hmodule]
    k32.FreeLibrary.restype = wintypes.BOOL
    k32.FindResourceW.argtypes = [hmodule, pointer, pointer]
    k32.FindResourceW.restype = pointer
    k32.SizeofResource.argtypes = [hmodule, pointer]
    k32.SizeofResource.restype = wintypes.DWORD
    k32.LoadResource.argtypes = [hmodule, pointer]
    k32.LoadResource.restype = pointer
    k32.LockResource.argtypes = [pointer]
    k32.LockResource.restype = pointer

    callback_type = ctypes.WINFUNCTYPE(
        wintypes.BOOL, hmodule, pointer, pointer, pointer
    )
    k32.EnumResourceNamesW.argtypes = [
        hmodule, pointer, callback_type, pointer
    ]
    k32.EnumResourceNamesW.restype = wintypes.BOOL

    # LOAD_LIBRARY_AS_DATAFILE: maps resources without executing app code.
    handle = k32.LoadLibraryExW(str(exe.resolve()), None, 0x00000002)
    if not handle:
        raise IconAuditError(
            f"RAW_V540_PE_OPEN_FAILED (Win32 {ctypes.get_last_error()})"
        )
    try:
        names = []

        @callback_type
        def collect_name(_module, _type, resource_name, _user):
            names.append(resource_name)
            return True

        if not k32.EnumResourceNamesW(handle, pointer(14), collect_name, None):
            raise IconAuditError("RAW_V540_PE_GROUP_ICON_MISSING")

        def resource_bytes(resource_type, resource_name):
            found = k32.FindResourceW(
                handle, pointer(resource_name), pointer(resource_type)
            )
            if not found:
                raise IconAuditError(
                    f"RAW_V540_PE_RESOURCE_MISSING:{resource_type}:{resource_name}"
                )
            size = k32.SizeofResource(handle, found)
            resource = k32.LoadResource(handle, found)
            address = k32.LockResource(resource) if resource else None
            if not size or not address:
                raise IconAuditError(
                    f"RAW_V540_PE_RESOURCE_UNREADABLE:{resource_type}:{resource_name}"
                )
            return ctypes.string_at(address, size)

        groups = []
        for name in names:
            group = parse_resource_group(resource_bytes(14, name))
            for frame in group:
                frame["data"] = resource_bytes(3, frame["id"])
                if len(frame["data"]) != frame["size"]:
                    raise IconAuditError("RAW_V540_PE_ICON_BYTE_COUNT_MISMATCH")
            groups.append(group)
        return groups
    finally:
        k32.FreeLibrary(handle)


def compare_frames(expected, groups):
    for number, group in enumerate(groups, 1):
        if len(expected) != len(group):
            continue
        consumed = set()
        matched = 0
        for item in expected:
            for i, actual in enumerate(group):
                if i in consumed:
                    continue
                if (item["width"], item["height"], item["data"]) == (actual["width"], actual["height"], actual["data"]):
                    consumed.add(i)
                    matched += 1
                    break
        if matched == len(expected):
            return number, matched
    raise IconAuditError(
        "RAW_V540_PE_ICON_MISMATCH: expected exact RAW ICO frames "
        + f"({len(expected)} frames); inspected {len(groups)} PE groups"
    )


def main():
    cli = argparse.ArgumentParser(description="Verify the RAW EXE icon resource.")
    cli.add_argument("--exe", required=True, type=Path)
    cli.add_argument("--ico", required=True, type=Path)
    args = cli.parse_args()
    if not args.exe.is_file() or not args.ico.is_file():
        raise IconAuditError("RAW_V540_PE_INPUT_MISSING")
    expected = parse_icon_file(args.ico.read_bytes())
    groups = inspect_pe_icon_resources(args.exe)
    group_id, matched = compare_frames(expected, groups)
    print(
        f"[RAW V5.40] PE RT_ICON verified: {matched}/{len(expected)} original "
        f"RAW ICO frames match exactly (resource group {group_id})."
    )
    print(
        "[RAW V5.40] ICO SHA256: "
        + hashlib.sha256(args.ico.read_bytes()).hexdigest().upper()
    )


if __name__ == "__main__":
    try:
        main()
    except (IconAuditError, OSError, ValueError, struct.error) as error:
        print(f"RAW_ICON_AUDIT_FAILED: {error}", file=sys.stderr)
        sys.exit(1)
