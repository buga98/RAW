// RAW V5.51 Bettermaker completeness inventory: no MIDI output, no Cubase mutation.
// Distinguish RAW routes from verified original plugin features.
import {createRequire} from "node:module";
import {writeFileSync,mkdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";
const require=createRequire(import.meta.url);
const FULL=require("../raw-v547-full-controls.js");
export const BM_FEATURES=Object.freeze([
 {name:"EQ1/4 bell or shelf selection",kind:"vendor-feature",status:"requires-vst-inspection"},
 {name:"HPF 12/24 dB/oct slope",kind:"vendor-feature",status:"requires-vst-inspection"},
 {name:"HPF resonance extended frequency behavior",kind:"vendor-feature",status:"requires-vst-inspection"},
 {name:"Frequency Search",kind:"vendor-feature",status:"requires-vst-inspection"},
 {name:"Gain Lock",kind:"vendor-feature",status:"requires-vst-inspection"},
 {name:"Note mode",kind:"vendor-feature",status:"requires-vst-inspection"},
 {name:"Auto-Q",kind:"vendor-feature",status:"requires-vst-inspection"},
 {name:"Stereo/dual-mono/M-S focus and channel independence",kind:"vendor-feature",status:"requires-vst-inspection"},
 {name:"Per-section enable/disable and true bypass",kind:"vendor-feature",status:"requires-vst-inspection"},
 {name:"Onboard 399 named preset slots/save/load",kind:"vendor-feature",status:"requires-vst-inspection"},
 {name:"Peak/RMS meters and RTA live measurements",kind:"vendor-feature",status:"requires-vst-inspection"},
 {name:"Plugin -> physical unit bidirectional USB sync",kind:"hardware-feature",status:"requires-physical-unit"},
 {name:"Analog audio path DA/AD loop and round-trip",kind:"hardware-feature",status:"requires-physical-unit"}
].map(x=>Object.freeze(x)));
export function buildAudit(){
 const controls=FULL.profiles.bettermaker_eq.controls;
 const found=new Set();
 const routes=Object.entries(controls).map(([parameter,def])=>{
  const ccKey=String(def.cc);
  if(found.has(ccKey))throw Error("DUPLICATE_BM_CC_"+ccKey);
  found.add(ccKey);
  if(def.kind==="numeric"&&!(def.min<def.max))throw Error("INVALID_RANGE_"+parameter);
  return {
   id:parameter,kind:def.kind,cc:def.cc,
   lsb:def.kind==="numeric"?def.cc+32:null,
   rawMin:def.min??null,rawMax:def.max??null,
   rawChoices:def.values??null,
   vendorParameter:null,vendorExposed:"unknown",cubaseMapped:"unknown",
   pluginReadback:"not-implemented",physicalVerified:false,
   status:parameter==="eq1Freq"?"partially-live-verified":
     parameter==="eq1Gain"?"partially-live-verified":"unverified"
  };
 });
 const counts=routes.reduce((a,r)=>(a[r.kind]=(a[r.kind]||0)+1,a),{});
 return {project:"RAW Bettermaker MEQ",version:"v5.51-audit",
  disclaimer:"RAW routing existence does not prove VST or physical hardware controllability.",
  counts:{routes:routes.length,...counts},
  routes,additionalVendorFeatures:BM_FEATURES};
}
export function toCsv(audit){
 const cols=["id","kind","cc","lsb","rawMin","rawMax","vendorParameter","vendorExposed","cubaseMapped","pluginReadback","physicalVerified","status"];
 const esc=v=>'"'+String(v??"").replaceAll('"','""')+'"';
 return [cols.map(esc).join(","),...audit.routes.map(r=>cols.map(k=>esc(r[k])).join(","))].join("\r\n")+"\r\n";
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const base=resolve(process.argv[2]||"bettermaker-audit-output");
 mkdirSync(base,{recursive:true});
 const audit=buildAudit();
 writeFileSync(resolve(base,"bettermaker-audit.json"),JSON.stringify(audit,null,2)+"\n");
 writeFileSync(resolve(base,"bettermaker-audit.csv"),toCsv(audit),"utf8");
 console.log("BETTERMAKER AUDIT",audit.counts);
 console.log("Export:",resolve(base,"bettermaker-audit.csv"));
 console.log("WARNING: mappings are UNKNOWN until manually verified in original Cubase VST.");
}
