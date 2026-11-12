// RAW v5.46 — read-only Windows installer inventory.
// No Cubase process manipulation, no plugin code loading, no vendor API, no
// registry modification, and no real hardware commands.
import {readdirSync,existsSync} from "node:fs";
import {join,basename} from "node:path";
import {createRequire} from "node:module";

if(process.platform!=="win32"){
 console.log("RAW V5.46 WINDOWS SCAN: run on the Cubase Studio Windows PC");
 process.exit(0);
}
const dirs=[
 join(process.env.CommonProgramFiles||"C:\\Program Files\\Common Files","VST3"),
 join(process.env.CommonProgramFiles_x86||"C:\\Program Files (x86)\\Common Files","VST3"),
 join(process.env.APPDATA||"C:\\Users\\Public","VST3")
];
const hits=new Map();
function visit(dir,depth){
 if(depth>3||!existsSync(dir))return;
 let entries;
 try{entries=readdirSync(dir,{withFileTypes:true});}catch{return;}
 for(const e of entries){
  if(e.isSymbolicLink())continue;
  const full=join(dir,e.name);
  if(e.name.toLowerCase().endsWith(".vst3")){
   if(/bettermaker|bmm|equalizer|ngbus|ngtube|wesaudio/i.test(e.name)){
    hits.set(full,e.name); // file name only, never print owner paths
   }
   continue;
  }
  if(e.isDirectory())visit(full,depth+1);
 }
}
for(const dir of dirs)visit(dir,0);
console.log("RAW V5.46 READ-ONLY VST3 CANDIDATES:");
if(!hits.size)console.log("NO MATCHING VST3 FILE NAMES — inspect Cubase Plugin Manager manually");
for(const name of hits.values())console.log("CANDIDATE (NOT VST VALIDATION): "+name);
try{
 const require=createRequire(import.meta.url);
 const ports=require("easymidi").getOutputs();
 console.log("RAW_TO_CUBASE MIDI OUT: "+(ports.includes("RAW_TO_CUBASE")?"PRESENT":"MISSING"));
}catch(e){
 console.log("MIDI PORT SCAN UNAVAILABLE: "+String(e.code||e.message).slice(0,110));
}
console.log("VST3 presence cannot prove host acceptance, plugin automation or physical hardware.");
