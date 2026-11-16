// RAW V5.56: passive, append-only JSONL logger for actual Cubase MIDI Remote
// VST host callbacks. No audio, no token, and no network data leave this PC.
import {V556_MAGIC,V556_READBACK_PORT} from "./raw-v556-generate-bettermaker-live-readback.mjs";
import {resolveV554BankOrder} from "./raw-v554-generate-bettermaker-verified-bank.mjs";
import {readFileSync,appendFileSync,mkdirSync,writeFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);

export function parseV556Sysex(evt){
 const bytes=Array.isArray(evt)?evt:evt?.bytes;
 if(!Array.isArray(bytes)||bytes.at(-1)!==247||!V556_MAGIC.every((x,i)=>bytes[i]===x))return null;
 if(bytes.slice(V556_MAGIC.length,-1).some(x=>x<32||x>126))return null;
 const body=String.fromCharCode(...bytes.slice(V556_MAGIC.length,-1));
 const match=/^RAW556\|(T|P|D)\|(\d{1,2})\|([^|]*)\|([^|]*)$/.exec(body);
 if(!match)return null;
 const slot=Number(match[2]);
 if(slot<1||slot>86)return null;
 const kind={T:"title",P:"normalized",D:"display"}[match[1]];
 const normalized=kind==="normalized"?Number(match[3]):null;
 if(kind==="normalized"&&(!Number.isFinite(normalized)||normalized<0||normalized>1))return null;
 return {kind,slot,first:match[3],second:match[4],normalized};
}

export function makeV556LogProcessor(capture,{append,clock=()=>new Date().toISOString(),print=()=>{}}){
 const mappings=resolveV554BankOrder(capture);
 const bySlot=new Map(mappings.map(m=>[m.hostSlot,m]));
 const titles=new Map();
 const last=new Map();
 const latest=new Map();
 let received=0,accepted=0,ignored=0;
 const onMessage=(evt)=>{
  received++;
  const msg=parseV556Sysex(evt);
  if(!msg){ignored++;return null}
  const mapping=bySlot.get(msg.slot);
  if(!mapping){ignored++;return null}
  if(msg.kind==="title"){
   const title={objectTitle:msg.first,parameterTitle:msg.second};
   titles.set(msg.slot,title);
   if(title.objectTitle!=="Mastering Equalizer"||title.parameterTitle.toLowerCase()!==mapping.hostTitle.toLowerCase()){
    ignored++;
    print("V556 BLOCKED: slot "+msg.slot+" wrong plugin/parameter: "+JSON.stringify(title));
    return null;
   }
  }
  const title=titles.get(msg.slot);
  // No value logging until a *real* title callback confirms original VST.
  if(!title||title.objectTitle!=="Mastering Equalizer"||title.parameterTitle.toLowerCase()!==mapping.hostTitle.toLowerCase()){
   ignored++;return null
  }
  const key=msg.slot+":"+msg.kind;
  const value=msg.first+"|"+msg.second;
  if(last.get(key)===value){ignored++;return null}
  last.set(key,value);
  const record={
   timestamp:clock(),source:"cubase-midi-remote-v556",event:msg.kind,
   plugin:"Mastering Equalizer",hostSlot:msg.slot,
   label:mapping.label,hostTitle:mapping.hostTitle,
   ...(msg.kind==="title"?{objectTitle:msg.first,parameterTitle:msg.second}:{}),
   ...(msg.kind==="normalized"?{normalized:msg.normalized}:{}),
   ...(msg.kind==="display"?{display:msg.first,unit:msg.second}:{}),
   readbackVerified:true,hardwareVerified:false
  };
  append(JSON.stringify(record)+"\n");
  accepted++;
  const prev=latest.get(msg.slot)||{label:mapping.label};
  if(msg.kind==="normalized")prev.normalized=msg.normalized;
  if(msg.kind==="display"){prev.display=msg.first;prev.unit=msg.second}
  latest.set(msg.slot,prev);
  print(msg.kind.toUpperCase()+"  "+mapping.label+"  "+(msg.kind==="normalized"?String(msg.normalized):msg.kind==="display"?(msg.first+" "+msg.second):"verified original plugin"));
  return record;
 };
 return {onMessage,snapshot:()=>Object.fromEntries([...latest.values()].map(v=>[v.label,{...v}])),
  stats:()=>({received,accepted,ignored,verifiedSlots:titles.size,activeSlots:[...titles.values()].filter(t=>t.objectTitle==="Mastering Equalizer").length})};
}

function cli(){
 const argv=process.argv.slice(2);
 const arg=k=>{const i=argv.indexOf(k);return i<0?undefined:argv[i+1]};
 if(argv.includes("--help")){console.log("node scripts/raw-v556-log-bettermaker.mjs --capture <V553 JSON> [--out <file.jsonl>] [--port RAW_BM_V556_READBACK]");return}
 const capturePath=arg("--capture");
 if(!capturePath)throw Error("REQUIRED --capture <V553 JSON>");
 const capture=JSON.parse(readFileSync(resolve(capturePath),"utf8"));
 const out=resolve(arg("--out")||"raw-v556-bettermaker-events.jsonl");
 const port=arg("--port")||V556_READBACK_PORT;
 mkdirSync(dirname(out),{recursive:true});
 const easymidi=require("easymidi");
 if(!easymidi.getInputs().includes(port))throw Error("MISSING loopMIDI INPUT "+port+"; available: "+easymidi.getInputs().join(", "));
 const input=new easymidi.Input(port);
 const log=makeV556LogProcessor(capture,{
  append:line=>appendFileSync(out,line,"utf8"),
  print:msg=>console.log(msg)
 });
 let closed=false;
 const save=()=>{
  if(closed)return;
  closed=true;
  const target=out.replace(/\.jsonl$/,"")+"-latest.json";
  writeFileSync(target,JSON.stringify({version:"V5.56",timestamp:new Date().toISOString(),statistics:log.stats(),parameters:log.snapshot()},null,2)+"\n");
  console.log("V556 SAVED",out,"and",target,log.stats());
  input.close();
 };
 input.on("sysex",evt=>log.onMessage(evt));
 process.on("SIGINT",()=>{save();process.exit(0)});
 process.on("SIGTERM",()=>{save();process.exit(0)});
 console.log("V556 LIVE LOGGING:",port);
 console.log("APPEND-ONLY:",out);
 console.log("Change a real Bettermaker VST control manually in Cubase; log writes automatically.");
 console.log("ONLY original Mastering Equalizer titles are accepted. Ctrl+C saves latest state.");
}
if(process.argv[1]&&/raw-v556-log-bettermaker\.mjs$/i.test(process.argv[1])){
 try{cli()}catch(err){console.error("V556 LOGGER STOP:",err.message);process.exitCode=1}
}
