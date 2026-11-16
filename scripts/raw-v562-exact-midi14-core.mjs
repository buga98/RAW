// V5.62: derive EXACT per-display raw14 overrides only from real V5.61 live reports.
// V5.57 original 8-bit observation map is never changed. No MIDI is sent.
import {makeV558Plan} from "./raw-v558-closed-loop-core.mjs";
export function buildExactMidi14(capture,calibration,evidence){
 if(!Array.isArray(evidence))throw Error("V562_EVIDENCE_ARRAY_REQUIRED");
 const entries=new Map(),rejected=[],conflicted=new Set();
 for(let i=0;i<evidence.length;i++){
  const e=evidence[i],id=i+1;
  try{
   if(!e||e.version!=="V5.61"||e.sent!==true||e.hardwareVerified!==false)
    throw Error("NOT_V561_LIVE_HOST_EVIDENCE");
   const p=makeV558Plan(capture,calibration,e.label,e.display);
   if(p.expectedPosition!==e.position)throw Error("OBSERVED_POSITION_MISMATCH");
   if(!Number.isInteger(e.offset)||e.offset<0||e.offset>2)throw Error("UNAPPROVED_OFFSET");
   if(!Number.isInteger(e.raw14)||e.raw14!==p.midi.raw+e.offset||e.raw14>16383)
    throw Error("RAW14_NOT_FROM_KNOWN_PROBE");
   if(!e.settled||e.settled.ready!==true||e.settled.status!=="MATCH"||
      e.settled.quietForMs<900||e.settled.elapsedMs<1400)
    throw Error("MISSING_STABLE_READBACK");
   if(!e.feedback||e.feedback.status!=="MATCH"||e.feedback.titleValidated!==true||
      e.feedback.source!=="cubase-midi-remote-v556"||e.feedback.hardwareVerified!==false||
      e.feedback.samePosition!==true||e.feedback.sameDisplay!==true||
      e.feedback.expected?.position!==e.position||e.feedback.actual?.position!==e.position||
      e.feedback.expected?.display!==e.display||e.feedback.actual?.display!==e.display)
    throw Error("READBACK_NOT_EXACT");
   if(!Array.isArray(e.timeline)||!e.timeline.some(x=>x.kind==="normalized")||
      !e.timeline.some(x=>x.kind==="display"&&x.display===e.display))
    throw Error("MISSING_ORIGINAL_CALLBACK_TIMELINE");
   const key=e.label+"\u0000"+e.display;
   const existing=entries.get(key);
   if(conflicted.has(key))throw Error("CONFLICTING_EXACT_RAW14_EVIDENCE");
   if(existing&&existing.raw14!==e.raw14){entries.delete(key);conflicted.add(key);throw Error("CONFLICTING_EXACT_RAW14_EVIDENCE");}
   const row=existing||{label:e.label,display:e.display,hostSlot:p.hostSlot,position:e.position,
    normalizedGrid:p.expectedNormalized,baseRaw:p.midi.raw,raw14:e.raw14,
    midiChannel:p.midi.channel,cc:p.midi.cc,ccLsb:p.midi.ccLsb,
    evidenceCount:0,evidenceTimestamps:[],status:"EXACT_HOST_ROUNDTRIP_VERIFIED",hardwareVerified:false};
   row.evidenceCount++;
   if(typeof e.timestamp==="string")row.evidenceTimestamps.push(e.timestamp);
   entries.set(key,row);
  }catch(err){rejected.push({evidence:id,label:e?.label||null,display:e?.display||null,reason:err.message})}
 }
 const accepted=[...entries.values()].sort((a,b)=>a.label.localeCompare(b.label)||a.position-b.position);
 return {version:"V5.62",status:"EXACT_MIDI14_PER_OBSERVED_DISPLAY_HOST_ONLY",
  metrics:{acceptedEntries:accepted.length,acceptedEvidence:accepted.reduce((n,e)=>n+e.evidenceCount,0),
   rejectedEvidence:rejected.length},entries:accepted,rejected,
  warning:"Only confirmed display/parameter positions. Not full-range, audio, or physical hardware verification."};
}
export function lookupExactMidi14(database,label,display){
 if(database?.version!=="V5.62")throw Error("V562_BAD_DATABASE_VERSION");
 const found=database.entries?.filter(x=>x.label===label&&x.display===display&&x.status==="EXACT_HOST_ROUNDTRIP_VERIFIED");
 if(found?.length!==1)throw Error("V562_EXACT_VALUE_NOT_VERIFIED");
 return Object.freeze({...found[0]});
}
