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
                try:
                    payload = resource_bytes(3, frame["id"])
                    frame["actual_size"] = len(payload)
                    frame["raw_data"] = payload
                    frame["data"] = payload if len(payload) == frame["size"] else None
                except IconAuditError:
                    frame["actual_size"] = -1
                    frame["raw_data"] = None
                    frame["data"] = None
            groups.append(group)
        return groups
    finally:
        k32.FreeLibrary(handle)


def compare_frames(expected, groups):
    reports = []
    for number, group in enumerate(groups, 1):
        consumed = set()
        matched = 0
        for item in expected:
            for i, actual in enumerate(group):
                if i in consumed or actual["data"] is None:
                    continue
                if (item["width"], item["height"], item["data"]) == (actual["width"], actual["height"], actual["data"]):
                    consumed.add(i)
                    matched += 1
                    break
        invalid_count = sum(
            frame["data"] is None for frame in group
        )
        broken = []
        for frame in group:
            if frame["data"] is not None:
                continue
            ref = next(
                (x for x in expected
                 if x["width"] == frame["width"] and x["height"] == frame["height"]),
                None,
            )
            same_bytes = (ref is not None and
                          frame.get("raw_data") == ref["data"])
            broken.append(
                f'{frame["width"]}x{frame["height"]}:id{frame["id"]}:'
                f'declared={frame["size"]}:actual={frame["actual_size"]}:'
                f'expected={len(ref["data"]) if ref else "n/a"}:'
                f'payloadMatch={same_bytes}'
            )
        reports.append(
            f"group{number}={matched}/{len(expected)} exact, "
            f"{len(group)} frames, {invalid_count} inconsistent IDs/sizes: "
            + ", ".join(broken[:8])
        )
        if matched == len(expected) and len(group) == len(expected):
            return number, matched
    raise IconAuditError(
        "RAW_V540_PE_ICON_MISMATCH: " + "; ".join(reports)
    )



def repair_group_size_metadata(exe: Path, expected):
    """Repair ONLY stale byte-length metadata for an otherwise exact RAW icon.

    rcedit may replace an old 256px PNG (19,436 B) with RAW's 84,972 B PNG
    but leave the RT_GROUP_ICON dwBytesInRes size from the old icon.
    This operation preserves every RT_ICON byte and updates the group entry
    only after ALL icon payloads have matched our source ICO byte-for-byte.
    """
    groups = inspect_pe_icon_resources(exe)
    if len(groups) != 1:
        raise IconAuditError(
            f"RAW_V540_REPAIR_REQUIRES_SINGLE_GROUP:{len(groups)}"
        )
    group = groups[0]
    if len(group) != len(expected):
        raise IconAuditError("RAW_V540_REPAIR_FRAME_COUNT_MISMATCH")
    wanted = {(f["width"], f["height"]): f for f in expected}
    if len(wanted) != len(expected):
        raise IconAuditError("RAW_V540_REPAIR_DUPLICATE_ICON_SIZES")
    fixes = []
    for index, frame in enumerate(group):
        ref = wanted.get((frame["width"], frame["height"]))
        if ref is None or frame.get("raw_data") != ref["data"]:
            raise IconAuditError(
                f"RAW_V540_REPAIR_FRAME_BYTES_NOT_ORIGINAL:{frame['width']}x{frame['height']}"
            )
        if frame["size"] != len(ref["data"]):
            fixes.append((index, frame["size"], len(ref["data"])))
    if not fixes:
        compare_frames(expected, groups)
        print("[RAW V5.40] All PE group frame sizes already correct.")
        return

    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    pointer = ctypes.c_void_p
    hmodule = wintypes.HMODULE
    k32.LoadLibraryExW.argtypes = [wintypes.LPCWSTR, pointer, wintypes.DWORD]
    k32.LoadLibraryExW.restype = hmodule
    k32.FreeLibrary.argtypes = [hmodule]
    k32.FreeLibrary.restype = wintypes.BOOL
    callback_type = ctypes.WINFUNCTYPE(
        wintypes.BOOL, hmodule, pointer, pointer, pointer
    )
    lang_callback_type = ctypes.WINFUNCTYPE(
        wintypes.BOOL, hmodule, pointer, pointer, wintypes.WORD, pointer
    )
    k32.EnumResourceNamesW.argtypes = [hmodule, pointer, callback_type, pointer]
    k32.EnumResourceNamesW.restype = wintypes.BOOL
    k32.EnumResourceLanguagesW.argtypes = [
        hmodule, pointer, pointer, lang_callback_type, pointer
    ]
    k32.EnumResourceLanguagesW.restype = wintypes.BOOL
    k32.FindResourceExW.argtypes = [
        hmodule, pointer, pointer, wintypes.WORD
    ]
    k32.FindResourceExW.restype = pointer
    k32.SizeofResource.argtypes = [hmodule, pointer]
    k32.SizeofResource.restype = wintypes.DWORD
    k32.LoadResource.argtypes = [hmodule, pointer]
    k32.LoadResource.restype = pointer
    k32.LockResource.argtypes = [pointer]
    k32.LockResource.restype = pointer

    handle = k32.LoadLibraryExW(str(exe.resolve()), None, 0x00000002)
    if not handle:
        raise IconAuditError("RAW_V540_REPAIR_RESOURCE_OPEN_FAILED")
    try:
        names = []

        @callback_type
        def name_cb(_h, _type, name, _param):
            names.append(name)
            return True

        if not k32.EnumResourceNamesW(handle, pointer(14), name_cb, None):
            raise IconAuditError("RAW_V540_REPAIR_GROUP_NAME_MISSING")
        if len(names) != 1 or names[0] is None or names[0] > 0xFFFF:
            raise IconAuditError("RAW_V540_REPAIR_UNSUPPORTED_GROUP_NAME")
        name_id = names[0]
        languages = []

        @lang_callback_type
        def language_cb(_h, _type, _name, lang, _param):
            languages.append(lang)
            return True

        if not k32.EnumResourceLanguagesW(
            handle, pointer(14), pointer(name_id), language_cb, None
        ):
            raise IconAuditError("RAW_V540_REPAIR_GROUP_LANGUAGE_MISSING")
        if len(languages) != 1:
            raise IconAuditError(
                f"RAW_V540_REPAIR_GROUP_LANGUAGE_AMBIGUOUS:{languages}"
            )
        language = languages[0]
        res = k32.FindResourceExW(
            handle, pointer(14), pointer(name_id), language
        )
        size = k32.SizeofResource(handle, res) if res else 0
        loaded = k32.LoadResource(handle, res) if res else None
        locked = k32.LockResource(loaded) if loaded else None
        if not size or not locked:
            raise IconAuditError("RAW_V540_REPAIR_GROUP_READ_FAILED")
        original = ctypes.string_at(locked, size)
    finally:
        k32.FreeLibrary(handle)

    # No image bytes modified: only the 32-bit dwBytesInRes fields.
    updated = bytearray(original)
    if len(updated) < 6 + len(group) * 14:
        raise IconAuditError("RAW_V540_REPAIR_GROUP_TRUNCATED")
    for index, prior_size, actual_size in fixes:
        found = struct.unpack_from("<I", updated, 6 + index * 14 + 8)[0]
        if found != prior_size:
            raise IconAuditError("RAW_V540_REPAIR_STALE_GROUP_GUARD")
        struct.pack_into("<I", updated, 6 + index * 14 + 8, actual_size)

    k32.BeginUpdateResourceW.argtypes = [wintypes.LPCWSTR, wintypes.BOOL]
    k32.BeginUpdateResourceW.restype = pointer
    k32.UpdateResourceW.argtypes = [
        pointer, pointer, pointer, wintypes.WORD, pointer, wintypes.DWORD
    ]
    k32.UpdateResourceW.restype = wintypes.BOOL
    k32.EndUpdateResourceW.argtypes = [pointer, wintypes.BOOL]
    k32.EndUpdateResourceW.restype = wintypes.BOOL

    transaction = k32.BeginUpdateResourceW(str(exe.resolve()), False)
    if not transaction:
        raise IconAuditError(
            f"RAW_V540_REPAIR_UPDATE_OPEN_FAILED:{ctypes.get_last_error()}"
        )
    committed = False
    try:
        buffer = ctypes.create_string_buffer(bytes(updated))
        if not k32.UpdateResourceW(
            transaction, pointer(14), pointer(name_id),
            language, buffer, len(updated)
        ):
            raise IconAuditError(
                f"RAW_V540_REPAIR_RESOURCE_WRITE_FAILED:{ctypes.get_last_error()}"
            )
        if not k32.EndUpdateResourceW(transaction, False):
            raise IconAuditError(
                f"RAW_V540_REPAIR_COMMIT_FAILED:{ctypes.get_last_error()}"
            )
        committed = True
    finally:
        if not committed:
            k32.EndUpdateResourceW(transaction, True)

    compare_frames(expected, inspect_pe_icon_resources(exe))
    for index, before, after in fixes:
        dimension = group[index]["width"]
        print(
            f"[RAW V5.40] Corrected RT_GROUP_ICON {dimension}px entry "
            f"length: {before} -> {after} bytes; image data unchanged."
        )


def main():
    cli = argparse.ArgumentParser(description="Verify the RAW EXE icon resource.")
    cli.add_argument("--exe", required=True, type=Path)
    cli.add_argument("--ico", required=True, type=Path)
    cli.add_argument("--repair", action="store_true", help="Fix exact-byte ICO size fields only")
    args = cli.parse_args()
    if not args.exe.is_file() or not args.ico.is_file():
        raise IconAuditError("RAW_V540_PE_INPUT_MISSING")
    expected = parse_icon_file(args.ico.read_bytes())
    if args.repair:
        repair_group_size_metadata(args.exe, expected)
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
