// V5.57 observed-only VST calibration; NEVER sends MIDI.
// Display and process callbacks must be matched per slot, time, and plugin title.
import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
export function buildCalibration(capture,logs){
 if(capture?.version!=="V5.53"||capture.count!==86||capture.entries?.length!==86)throw Error("FULL_V553_CAPTURE_REQUIRED");
 const names=new Map(capture.entries.map(e=>[e.slot,e]));
 if(names.size!==86||[...names.values()].some(e=>e.objectTitle!=="Mastering Equalizer"))throw Error("CAPTURE_INVALID");
 const seen=new Map(),warnings=[];let paired=0,lines=0,skipped=0;
 logs.forEach((txt,file)=>{
  const authorized=new Set(),pending=new Map();
  txt.split(/\r?\n/).forEach((s,line)=>{
   if(!s.trim())return;
   lines++;
   let r;try{r=JSON.parse(s)}catch{warnings.push({file,line:line+1,issue:"INVALID_JSON"});skipped++;return}
   const actual=names.get(r.hostSlot)?.actual;
   if(!actual||r.plugin!=="Mastering Equalizer"||r.hostTitle!==actual||r.label!==actual||r.readbackVerified!==true){skipped++;return}
   if(r.event==="title"){
    if(r.objectTitle==="Mastering Equalizer"&&r.parameterTitle===actual)authorized.add(r.hostSlot);
    else{authorized.delete(r.hostSlot);pending.delete(r.hostSlot)}
    return;
   }
   if(!authorized.has(r.hostSlot)){skipped++;return}
   if(r.event==="normalized"){
    if(typeof r.normalized!=="number"||r.normalized<0||r.normalized>1||!Number.isFinite(r.normalized)){skipped++;return}
    const pos=Math.round(r.normalized*255);
    if(Math.abs(pos/255-r.normalized)>0.0001){
     warnings.push({file,line:line+1,label:actual,issue:"UNKNOWN_NORMALIZED_GRID"});skipped++;pending.delete(r.hostSlot);return;
    }
    pending.set(r.hostSlot,{pos,time:Date.parse(r.timestamp)});return;
   }
   if(r.event==="display"){
    const p=pending.get(r.hostSlot);pending.delete(r.hostSlot);
    const t=Date.parse(r.timestamp);
    if(!p||!Number.isFinite(t)||!Number.isFinite(p.time)||t<p.time||t-p.time>2000){skipped++;return}
    const display=String(r.display??"").trim();if(!display){skipped++;return}
    const key=r.hostSlot+":"+p.pos;
    if(!seen.has(key))seen.set(key,{label:actual,slot:r.hostSlot,position:p.pos,normalized:p.pos/255,displays:new Map()});
    const point=seen.get(key);point.displays.set(display,(point.displays.get(display)||0)+1);paired++;
   }
  });
 });
 const parameters={};let conflicts=0,verified=0;
 for(const p of seen.values()){
  if(!parameters[p.label])parameters[p.label]={hostSlot:p.slot,verified:[],conflicts:[]};
  const observations=[...p.displays].map(([display,count])=>({display,count}));
  const entry={position:p.position,normalized:p.normalized,observations};
  if(observations.length===1){entry.display=observations[0].display;parameters[p.label].verified.push(entry);verified++}
  else{parameters[p.label].conflicts.push(entry);conflicts++}
 }
 for(const p of Object.values(parameters)){p.verified.sort((a,b)=>a.position-b.position);p.conflicts.sort((a,b)=>a.position-b.position)}
 return {version:"V5.57",status:"OBSERVED_HOST_ONLY_NOT_HARDWARE_OR_ROUNDTRIP_VERIFIED",
  totals:{lines,paired,verifiedPositions:verified,conflictPositions:conflicts,parametersObserved:Object.keys(parameters).length,skipped},
  parameters,warnings};
}
export function lookupExact(calibration,label,display){
 const p=calibration?.parameters?.[label];
 if(!p)throw Error("UNKNOWN_PARAMETER");
 const observed=p.verified.filter(row=>row.display===display);
 if(!observed.length)throw Error("DISPLAY_NOT_OBSERVED_IN_LOG");
 const chosen=observed[Math.floor((observed.length-1)/2)];
 return {label,display,normalized:chosen.normalized,position:chosen.position,
   alternateObservedPositions:observed.map(x=>x.position),status:"REQUIRES_LIVE_ROUNDTRIP"};
}
function run(){
 const args=process.argv.slice(2),arg=k=>{const i=args.indexOf(k);return i<0?null:args[i+1]};
 const i=args.indexOf("--logs"),end=args.findIndex((x,j)=>j>i&&x.startsWith("--"));
 const files=i<0?[]:args.slice(i+1,end===-1?undefined:end);
 if(!arg("--capture")||!arg("--out")||!files.length)throw Error("Usage: --capture <V553.json> --logs <one or more V556.jsonl> --out <calibration.json> [--label NAME --display VALUE]");
 const capture=JSON.parse(readFileSync(resolve(arg("--capture")),"utf8"));
 const result=buildCalibration(capture,files.map(f=>readFileSync(resolve(f),"utf8")));
 writeFileSync(resolve(arg("--out")),JSON.stringify(result,null,2)+"\n");
 console.log("V557 CALIBRATION (offline):",result.totals);
 console.log("Saved:",resolve(arg("--out")));
 if(arg("--label")&&arg("--display"))console.log("LOOKUP:",lookupExact(result,arg("--label"),arg("--display")));
}
if(process.argv[1]&&/raw-v557-exact-calibration\.mjs$/i.test(process.argv[1])){
 try{run()}catch(e){console.error("V557 STOP:",e.message);process.exitCode=1}
}
