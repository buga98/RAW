/* V5.35 Windows local read-only inventory.
 * Does not enumerate serials/PNPDeviceID, run GCon, probe network, change
 * registry, control gear, start audio, or contact Firebase/Stripe.
 */
import {spawn} from "node:child_process";
import {existsSync} from "node:fs";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {assessHardwareReadinessV535} from "../raw-v535-hardware-readiness.mjs";

const POWERSHELL="$ErrorActionPreference='Stop'\n$pnpOk=$false\n$pnp=@()\ntry {\n $pnp=@(Get-PnpDevice -PresentOnly -ErrorAction Stop |\n  Where-Object { $_.FriendlyName -match '(?i)Bettermaker|ng[\\s_-]*Bus[\\s_-]*Comp|ng[\\s_-]*Tube[\\s_-]*Comp' } |\n  Select-Object -First 64 |\n  ForEach-Object { @{name=[string]$_.FriendlyName;status=[string]$_.Status} })\n $pnpOk=$true\n} catch {}\n$audioCount=$null\ntry { $audioCount=@(Get-CimInstance Win32_SoundDevice -ErrorAction Stop | Where-Object {$_.Status -eq 'OK'}).Count } catch {}\n[pscustomobject]@{deviceEnumerationOk=$pnpOk;pnpEntries=@($pnp);audioEndpointCount=$audioCount} | ConvertTo-Json -Compress -Depth 4";
function safeResult(json){
 const obj=JSON.parse(json);
 if(obj===null||typeof obj!=="object"||Array.isArray(obj))
  throw Error("INVALID_SCAN_FORMAT");
 const pnp=Array.isArray(obj.pnpEntries)?obj.pnpEntries:
  obj.pnpEntries?[obj.pnpEntries]:[];
 return {deviceEnumerationOk:obj.deviceEnumerationOk===true,pnpEntries:pnp,
  audioEndpointCount:obj.audioEndpointCount===null?null:obj.audioEndpointCount};
}
export function runPowerShellInventoryV535({
 platform=process.platform,run=spawn,timeoutMs=12_000
}={}){
 if(platform!=="win32")return Promise.resolve({
  deviceEnumerationOk:false,pnpEntries:[],audioEndpointCount:null
 });
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<500||timeoutMs>60_000)
  throw Error("INVALID_TIMEOUT");
 return new Promise((resolveDone,reject)=>{
  let child;
  try{
   child=run("powershell.exe",["-NoLogo","-NoProfile","-NonInteractive",
    "-EncodedCommand",Buffer.from(POWERSHELL,"utf16le").toString("base64")],
    {shell:false,windowsHide:true,stdio:["ignore","pipe","pipe"]});
  }catch(e){return reject(e);}
  let stdout="",ended=false;
  const timer=setTimeout(()=>{if(!ended){child.kill?.();reject(Error("SCAN_TIMEOUT"));ended=true;}},timeoutMs);
  timer.unref?.();
  child.stdout?.on("data",buf=>{
   stdout+=buf.toString("utf8");
   if(stdout.length>256_000&&!ended){
    ended=true;clearTimeout(timer);child.kill?.();reject(Error("SCAN_OUTPUT_LIMIT"));
   }
  });
  // Intentionally ignore stderr contents; no sensitive OS output is returned.
  child.stderr?.on("data",()=>{});
  child.on("error",e=>{if(!ended){ended=true;clearTimeout(timer);reject(e);}});
  child.on("close",code=>{
   if(ended)return;ended=true;clearTimeout(timer);
   if(code!==0)return reject(Error("SCAN_COMMAND_FAILED"));
   try{resolveDone(safeResult(stdout));}catch{return reject(Error("SCAN_PARSE_FAILED"));}
  });
 });
}
export async function scanStudioReadinessV535({
 platform=process.platform,run=spawn,env=process.env,exists=existsSync
}={}){
 let inventory;
 try{inventory=await runPowerShellInventoryV535({platform,run});}
 catch{inventory={deviceEnumerationOk:false,pnpEntries:[],audioEndpointCount:null};}
 const roots=[env["ProgramFiles(x86)"],env.ProgramFiles].filter(v=>typeof v==="string"&&v.length>0);
 const gconManagerInstalled=platform==="win32"&&roots.some(root=>
  exists(join(root,"WesAudio","GConManager.exe")));
 return assessHardwareReadinessV535({platform,...inventory,gconManagerInstalled});
}
const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 const result=await scanStudioReadinessV535();
 console.log("RAW V5.35 — READ-ONLY HARDWARE INVENTORY (NOT A PHYSICAL CONTROL TEST)");
 console.log("OS device enumeration: "+(result.deviceEnumerationSucceeded?"OK":"NOT AVAILABLE"));
 console.log("WesAudio GConManager installed: "+(result.gconManagerInstalled?"YES":"NOT DETECTED"));
 console.log("OS active audio endpoints: "+(result.audioEndpointCount??"UNKNOWN"));
 for(const d of result.devices)
  console.log(d.label+": "+(d.candidateDetected?"POTENTIAL OS DEVICE NAME":"NOT VERIFIED")+
   " | PHYSICAL READBACK NOT VERIFIED");
 console.log("STUDIO CONTROL: NOT ENABLED · ANALOG AUDIO: NOT VERIFIED · RAW BILLING: DISABLED");
 console.log("Readiness evidence is local-only and never contains hardware serials.");
}
