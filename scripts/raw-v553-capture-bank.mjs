// RAW V5.53: capture Cubase parameter-bank titles without copying Script Console.
// Windows 1 only. Read-only: listens on separate loopMIDI input and saves JSON.
import {createRequire} from "node:module";
import {writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {V551_BINDINGS} from "./raw-v551-generate-bettermaker-vst-surface.mjs";
import {V553_CAPTURE_PORT} from "./raw-v553-generate-bettermaker-bank-capture.mjs";
const require=createRequire(import.meta.url);
const MAGIC=[0xF0,0x7D,0x52,0x41,0x57,0x35,0x35,0x33];
export function parseV553Sysex(event){
 const bytes=Array.isArray(event)?event:(event?.bytes??[]);
 if(!Array.isArray(bytes)||bytes.at(-1)!==0xF7||!MAGIC.every((b,i)=>bytes[i]===b)) return null;
 const body=String.fromCharCode(...bytes.slice(MAGIC.length,-1));
 const match=/^RAW553\|(\d+)\|([^|]*)\|(.*)$/.exec(body);
 if(!match) return null;
 const slot=Number(match[1]);
 if(!Number.isInteger(slot)||slot<1||slot>86)return null;
 return {slot,expected:V551_BINDINGS[slot-1].label,objectTitle:match[2],actual:match[3]};
}
const portArg=process.argv.indexOf("--port");
const port=portArg>=0?process.argv[portArg+1]:V553_CAPTURE_PORT;
const outArg=process.argv.indexOf("--out");
const outputPath=resolve(outArg>=0?process.argv[outArg+1]:"raw-v553-bettermaker-capture.json");
if(process.argv.includes("--help")){
 console.log("Usage: node scripts/raw-v553-capture-bank.mjs [--port RAW_BM_V553_CAPTURE] [--out path.json]");
 process.exit(0);
}
if(process.argv[1] && /raw-v553-capture-bank\.mjs$/i.test(process.argv[1])){
 let easymidi;
 try {easymidi=require("easymidi")}catch(err){console.error("Missing easymidi: run npm ci in this worktree.");process.exit(1)}
 if(!easymidi.getInputs().includes(port)){console.error("loopMIDI input not found:",port,"Available:",easymidi.getInputs());process.exit(1)}
 const got=new Map();
 const input=new easymidi.Input(port);
 // Persist immediately so aborting with Ctrl+C does not lose received records.
 const save=()=>{
   const entries=[...got.values()].sort((a,b)=>a.slot-b.slot);
   writeFileSync(outputPath,JSON.stringify({version:"V5.53",port,count:entries.length,entries},null,2)+"\n");
 };
 input.on("sysex",evt=>{
  const parsed=parseV553Sysex(evt);
  if(!parsed)return;
  if(!parsed.actual || !parsed.objectTitle)return; // ignore blank host records before plugin focus
  got.set(parsed.slot,parsed);save();
  console.log("BANK",parsed.slot,"expected:",parsed.expected,"actual:",parsed.actual,"("+got.size+"/86)");
  if(got.size===86){ console.log("COMPLETE:",outputPath);input.close();process.exit(0); }
 });
 process.on("SIGINT",()=>{save();console.log("SAVED:",got.size,"records to",outputPath);input.close();process.exit(0)});
 console.log("V5.53 CAPTURE LISTENING:",port);
 console.log("Now focus original Bettermaker on Audio 01, select V553 surface or Reload Scripts.");
 console.log("Waiting for title data; Ctrl+C saves partial results to",outputPath);
}
