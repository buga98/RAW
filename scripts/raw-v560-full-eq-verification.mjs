// RAW V5.60: offline 24-EQ matrix; optional ONE supervised control test via V5.59.3.
// --test-label requires explicit --midi --confirm-test-project; never auto-run all 24.
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {V555_SAFE_LABELS} from "./raw-v555-bettermaker-calibration-core.mjs";
import {makeEqAudit} from "./raw-v560-eq-audit-core.mjs";
const args=process.argv.slice(2);
const val=k=>{const i=args.indexOf(k);return i<0?null:args[i+1]};
const yes=k=>args.includes(k);
const read=k=>JSON.parse(readFileSync(resolve(val(k)),"utf8"));
function loadReports(path){
 if(!path)return [];
 try{return readFileSync(resolve(path),"utf8").split(/\r?\n/).filter(Boolean).map((line,i)=>{
  try{return JSON.parse(line)}catch{throw Error("V560_INVALID_REPORT_JSONL_LINE_"+(i+1))}
 })}catch(e){if(e.code==="ENOENT")return [];throw e}
}
function main(){
 if(!val("--capture")||!val("--calibration"))throw Error("Usage: --capture V553.json --calibration V557.json [--results V559.jsonl] [--out V560.json] [--test-label 'EQ2 L bandwidth' --midi --confirm-test-project]");
 const cap=read("--capture"),cal=read("--calibration");
 const reportFile=val("--results")||"raw-v560-stable-cycles.jsonl";
 let reports=loadReports(reportFile);
 const label=val("--test-label");
 let liveExit=null;
 if((yes("--midi")||yes("--confirm-test-project"))&&!label)throw Error("V560_MIDI_FLAGS_REQUIRE_EXPLICIT_TEST_LABEL");
 if(label){
  if(!V555_SAFE_LABELS.includes(label))throw Error("V560_ONLY_24_EQ_CONTROLS");
  const preview=makeEqAudit(cap,cal,reports).controls.find(c=>c.label===label);
  if(preview.availability!=="READY_FOR_SUPERVISED_TEST")throw Error("V560_NOT_ENOUGH_OBSERVED_VALUES_FOR_"+label);
  console.log("V560 SELECTED CONTROL:",label,"targets",preview.candidateSequence.join(" -> "));
  if(!yes("--midi"))console.log("V560 DRY RUN, no MIDI sent. Add --midi --confirm-test-project for a supervised live test.");
  else{
   if(!yes("--confirm-test-project"))throw Error("V560_MISSING_TEST_PROJECT_CONFIRMATION");
   const runner=fileURLToPath(new URL("./raw-v559-repeatability-pilot.mjs",import.meta.url));
   const result=spawnSync(process.execPath,[runner,"--capture",resolve(val("--capture")),
      "--calibration",resolve(val("--calibration")),"--label",label,
      "--displays",preview.candidateSequence.join(";"),
      "--out",resolve(reportFile),"--midi","--confirm-test-project"],
    {stdio:"inherit",windowsHide:false});
   if(result.error)throw result.error;
   liveExit=result.status;
   reports=loadReports(reportFile);
   console.log("V560 LIVE EXIT:",result.status);
  }
 }
 const audit=makeEqAudit(cap,cal,reports);
 const out=resolve(val("--out")||"raw-v560-eq-audit.json");
 mkdirSync(dirname(out),{recursive:true});
 writeFileSync(out,JSON.stringify(audit,null,2)+"\n");
 console.log("V560 EQ MATRIX:",audit.summary);
 for(const row of audit.controls)console.log(
  (row.roundtrip.status==="STABLE_CYCLE_VERIFIED"?"PASS":
   row.availability==="READY_FOR_SUPERVISED_TEST"?"READY":"NEEDS_DATA").padEnd(10),
  row.label.padEnd(20),"host",String(row.hostSlot).padStart(2),
  "points",String(row.measuredPositions).padStart(3),"conflicts",row.conflictPositions);
 console.log("V560 REPORT:",out);
 if(label&&yes("--midi")&&(liveExit!==0||audit.controls.find(c=>c.label===label)?.roundtrip.status!=="STABLE_CYCLE_VERIFIED"))process.exitCode=2;
}
try{main()}catch(e){console.error("V560 STOP:",e.message);process.exitCode=1}
