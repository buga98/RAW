// RAW V5.59.2 diagnostic only: record complete per-slot V556 callbacks
// around ONE supervised 14-bit CC send. Does not assert a verified MATCH.
import {parseV556Sysex} from "./raw-v556-log-bettermaker.mjs";

export function makeTraceObserver(slot,label,clock=()=>Date.now()){
 let verified=false;let received=0,parsed=0,other=0,armed=false,sendAt=null;
 const events=[];
 const ingest=evt=>{
  received++;
  const m=parseV556Sysex(evt);
  if(!m){other++;return}
  parsed++;
  if(m.slot!==slot){other++;return}
  const at=clock();
  if(m.kind==="title"){
   verified=m.first==="Mastering Equalizer"&&m.second===label;
   events.push({at,phase:armed?"AFTER_SEND":"BEFORE_SEND",kind:"title",plugin:m.first,label:m.second,verified});
   return;
  }
  events.push({at,phase:armed?"AFTER_SEND":"BEFORE_SEND",kind:m.kind,
   ...(m.kind==="normalized"?{normalized:m.normalized}:{display:m.first,unit:m.second}),titleVerified:verified});
 };
 const arm=()=>{
  if(!verified)throw Error("V5592_ORIGINAL_PLUGIN_NOT_VERIFIED");
  if(armed)throw Error("V5592_ALREADY_ARMED");
  armed=true;sendAt=clock();
  events.push({at:sendAt,phase:"SEND",kind:"marker"});
 };
 return {ingest,arm,verified:()=>verified,events:()=>events.slice(),
  stats:()=>({received,parsed,other,verified,armed,sendAt})};
}
export function analyzeTrace(events,expected,sendAt){
 const post=events.filter(e=>e.phase==="AFTER_SEND"&&e.at>=sendAt);
 const process=post.filter(e=>e.kind==="normalized"&&e.titleVerified);
 const displays=post.filter(e=>e.kind==="display"&&e.titleVerified);
 const latestProcess=process.at(-1)||null,latestDisplay=displays.at(-1)||null;
 const position=latestProcess?Math.round(latestProcess.normalized*255):null;
 const grid=latestProcess?Math.abs(latestProcess.normalized-position/255)<0.0001:false;
 const samePosition=grid&&position===expected.expectedPosition;
 const sameDisplay=latestDisplay?.display===expected.display;
 const transitions=[];
 for(const e of post)if(e.kind==="normalized"||e.kind==="display")transitions.push(e);
 // Diagnostic is not a strict ordered correlated read transaction.
 return {status:!process.length||!displays.length?"INCOMPLETE_DIAGNOSTIC":
    samePosition&&sameDisplay?"LAST_CALLBACKS_MATCH_UNCONFIRMED":"LAST_CALLBACKS_MISMATCH",
  expected:{position:expected.expectedPosition,display:expected.display},
  latest:{position,normalized:latestProcess?.normalized??null,display:latestDisplay?.display??null},
  samePosition,sameDisplay,processCallbacks:process.length,displayCallbacks:displays.length,
  titleChangesAfterSend:post.filter(e=>e.kind==="title").length,
  timeBetweenLastKindsMs:latestProcess&&latestDisplay?Math.abs(latestProcess.at-latestDisplay.at):null,
  warning:"Callback order and source causality not independently proven; trace is diagnostic only",
  transitions};
}
