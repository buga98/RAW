/* RAW v5.40: embed the SAME icon used by Electron's taskbar window.
 * UNSIGNED private beta only. No winCodeSign extraction, no admin rights,
 * no signing certificate, remote services, or studio/device operations.
 *
 * electron-builder 26 calls this after packaging the app, before NSIS is built.
 * The default NSIS desktop/Start shortcuts inherit their icon from this EXE.
 */
"use strict";

const {existsSync,statSync}=require("node:fs");
const {join}=require("node:path");

module.exports=async function rawUnifiedIconAfterPack(context){
  if(context?.electronPlatformName!=="win32")return;
  if(context.packager?.appInfo?.productFilename!=="RAW Desktop Beta")
    throw Error("RAW_V540_UNEXPECTED_PRODUCT");
  const exe=join(context.appOutDir,"RAW Desktop Beta.exe");
  const icon=join(__dirname,"build","icon.ico");

  if(!existsSync(icon)||statSync(icon).size<5000)
    throw Error("RAW_V540_WINDOWS_ICON_MISSING");
  if(!existsSync(exe)||statSync(exe).size<1000000)
    throw Error("RAW_V540_WINDOWS_EXE_MISSING");

  // Use Electron's independent, vendored rcedit.exe resource editor.
  // Unlike electron-builder's winCodeSign .7z bundle this does NOT unpack
  // macOS .dylib symbolic links (which failed on the owner's Windows account).
  const {rcedit}=await import("rcedit");
  await rcedit(exe,{
    icon,
    "version-string":{
      FileDescription:"RAW Mastering - Remote Audio Workstation (Local Beta)",
      ProductName:"RAW Desktop Beta",
      CompanyName:"RAW",
      InternalName:"RAW Mastering",
      OriginalFilename:"RAW Desktop Beta.exe"
    },
    "file-version":"0.1.0.0",
    "product-version":"0.1.0.0"
  });
  console.log("[RAW V5.40] Original taskbar artwork embedded into Windows application EXE.");
};
