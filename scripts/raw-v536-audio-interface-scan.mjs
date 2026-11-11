/* V5.36 — read-only local Windows ASIO/endpoint survey.
 * Only device NAMES, never serials, paths, PnP IDs or IPs.
 * No opening audio streams or talking to drivers.
 */
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
const PS=[
 "$ErrorActionPreference='Stop'",
 "$names=@()",
 "foreach($key in @('HKLM:\\SOFTWARE\\ASIO','HKLM:\\SOFTWARE\\WOW6432Node\\ASIO')) {",
 "  try {",
 "    $names+=@(Get-ChildItem -LiteralPath $key -ErrorAction Stop |",
 "      Select-Object -ExpandProperty PSChildName | ForEach-Object {[string]$_})",
 "  } catch {}",
 "}",
 "$endpoints=@()",
 "try { $endpoints=@(Get-CimInstance Win32_SoundDevice -ErrorAction Stop |",
 "  Where-Object {$_.Status -eq 'OK'} |",
 "  Select-Object -ExpandProperty Name | ForEach-Object {[string]$_}) } catch {}",
 "[pscustomobject]@{asioNames=@($names | Sort-Object -Unique | Select-Object -First 32);",
 " audioNames=@($endpoints | Sort-Object -Unique | Select-Object -First 32)} |",
 " ConvertTo-Json -Compress -Depth 3"
].join("\n");
export function validateAudioSurveyV536(value){
 if(!value||typeof value!=="object"||Array.isArray(value))
  throw Error("INVALID_AUDIO_SURVEY");
 const normalize=values=>{
  const arr=Array.isArray(values)?values:(values===null||values===undefined?[]:[values]);
  if(arr.length>32||arr.some(s=>typeof s!=="string"||s.length>128||
   /[\r\n\t]/.test(s)))throw Error("INVALID_AUDIO_SURVEY");
  return [...new Set(arr.map(x=>x.trim()).filter(Boolean))];
 };
 return Object.freeze({source:"READ_ONLY_WINDOWS_REGISTRY_AND_CIM",
  asioDrivers:Object.freeze(normalize(value.asioNames)),
  audioEndpoints:Object.freeze(normalize(value.audioNames)),
  driverDetected:normalize(value.asioNames).length>0,
  physicalAudioInterfaceVerified:false,analogRoutingVerified:false,
  realDeviceControlVerified:false,rawBillingEnabled:false});
}
export function scanAudioInterfacesV536({platform=process.platform,run=spawn}={}){
 if(platform!=="win32")return Promise.resolve(validateAudioSurveyV536({
  asioNames:[],audioNames:[]
 }));
 return new Promise((ok,reject)=>{
  let child,done=false,output="";
  try{
   child=run("powershell.exe",["-NoProfile","-NonInteractive","-EncodedCommand",
    Buffer.from(PS,"utf16le").toString("base64")],
    {stdio:["ignore","pipe","pipe"],shell:false,windowsHide:true});
  }catch(error){return reject(error);}
  const timeout=setTimeout(()=>{
   if(done)return;done=true;child.kill?.();reject(Error("AUDIO_SURVEY_TIMEOUT"));
  },12000);
  timeout.unref?.();
  child.stdout?.on("data",buf=>{
   output+=String(buf);
   if(output.length>64000&&!done){
    done=true;clearTimeout(timeout);child.kill?.();reject(Error("AUDIO_SURVEY_TOO_LARGE"));
   }
  });
  child.stderr?.on("data",()=>{});
  child.on("error",err=>{
   if(!done){done=true;clearTimeout(timeout);reject(err);}
  });
  child.on("close",code=>{
   if(done)return;done=true;clearTimeout(timeout);
   if(code!==0)return reject(Error("AUDIO_SURVEY_FAILED"));
   try{ok(validateAudioSurveyV536(JSON.parse(output)));}
   catch{reject(Error("AUDIO_SURVEY_INVALID"));}
  });
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const r=await scanAudioInterfacesV536();
  console.log("RAW V5.36 · READ-ONLY LOCAL WINDOWS AUDIO/ASIO INVENTORY");
  console.log("ASIO driver entries: "+(r.asioDrivers.join(" | ")||"NOT DETECTED"));
  console.log("Windows active audio endpoints: "+(r.audioEndpoints.join(" | ")||"NOT DETECTED"));
  console.log("A driver name proves neither physical connection nor correct routing.");
  console.log("NO AUDIO STREAM OPENED · NO PHYSICAL HARDWARE CONTROL · NO BILLING");
 }catch(error){console.error("SCAN UNAVAILABLE: "+error.message);process.exitCode=1;}
}
