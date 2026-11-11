import test from "node:test";
import assert from "node:assert/strict";
import {
 rawSafeProcessingAllowanceV533,requireIndependentHardwareWatchdogV533,
 RAW_STUDIO_MAX_PROOF_GAP_MS_V533
} from "../raw-v533-safety-policy.mjs";
import {createRawStudioSupervisorV533} from "../raw-v533-studio-supervisor.mjs";
const req={runId:"run_0001",sessionId:"session_0001",ownerUid:"alice",
 leaseId:"lease_0001",deviceIds:["bettermaker","ngBusComp"]};
const watchdog={mode:"physical",independentStopOnDisconnect:true,
 stopDeadlineMs:1000,physicalAckVerified:true};
function fixture(){
 const events=[];
 let enabled=true,proof=true,ack=true,watchdogEnabled=true;
 let meterFailure=false,stopResult={status:"finished",stopRequired:true};
 let balanceMicros=200000;
 const agent={
  async describe(){events.push("describe");return watchdogEnabled?watchdog:{mode:"simulation"};},
  async start(x){events.push("physical-start");return{
   started:enabled,acknowledged:ack,runId:x.runId,leaseId:x.leaseId};},
  async readback(x){events.push("physical-readback");return{
   physicalProcessing:proof,runId:x.runId,leaseId:x.leaseId,ownerUid:x.ownerUid};},
  async stop(x){events.push("physical-stop");return{
   stopped:enabled,acknowledged:ack,runId:x.runId,leaseId:x.leaseId,
   stoppedAtMs:1_800_000_000_000};}
 };
 const meter={
  async start(){events.push("meter-start");if(meterFailure)throw Error("DB_UNAVAILABLE");
   return {status:"active"};},
  async checkpoint(){events.push("meter-tick");if(meterFailure)throw Error("DB_UNAVAILABLE");
   return stopResult;},
  async finish(){events.push("meter-finish");if(meterFailure)throw Error("DB_UNAVAILABLE");
   return {status:"finished"};}
 };
 return {events,supervisor:createRawStudioSupervisorV533({agent,meter,
  getFunding:async()=>({balanceMicros,rateCentsPerHour:5600})}),
  setEnabled:v=>{enabled=v;},setProof:v=>{proof=v;},setAck:v=>{ack=v;},
  setWatchdog:v=>{watchdogEnabled=v;},setMeterFailure:v=>{meterFailure=v;},
  setBalance:v=>{balanceMicros=v;},
  setTick:x=>{stopResult=x;}};
}
test("V5.33: insufficient credits cannot arm 10-second device processing",()=>{
 const needed=rawSafeProcessingAllowanceV533({
  balanceMicros:150_000,rateCentsPerHour:5600
 });
 assert.equal(needed.allowed,false);
 assert.equal(needed.reason,"INSUFFICIENT_SAFE_RESERVE");
 assert.equal(rawSafeProcessingAllowanceV533({
  balanceMicros:200_000,rateCentsPerHour:5600
 }).allowed,true);
 assert.equal(RAW_STUDIO_MAX_PROOF_GAP_MS_V533,10_000);
 assert.throws(()=>rawSafeProcessingAllowanceV533({
  balanceMicros:-1,rateCentsPerHour:5600}),{code:"INVALID_STUDIO_ALLOWANCE"});
});
test("V5.33: no physical START when next interval cannot be prepaid",async()=>{
 const f=fixture();f.setBalance(1000);
 await assert.rejects(f.supervisor.start(req),{code:"INSUFFICIENT_SAFE_RESERVE"});
 assert.equal(f.events.includes("physical-start"),false);
 assert.equal(f.events.includes("meter-start"),false);
});
test("V5.33: reject software simulators pretending to be physical watchdog",()=>{
 assert.throws(()=>requireIndependentHardwareWatchdogV533(
  {mode:"simulation",independentStopOnDisconnect:true}
 ),{code:"PHYSICAL_WATCHDOG_NOT_VERIFIED"});
 assert.throws(()=>requireIndependentHardwareWatchdogV533(
  {...watchdog,stopDeadlineMs:5000}
 ),{code:"PHYSICAL_WATCHDOG_NOT_VERIFIED"});
 assert.equal(requireIndependentHardwareWatchdogV533(watchdog).verified,true);
});
test("V5.33: hardware agent ACK + physical readback must precede monetary metering",async()=>{
 const f=fixture();
 await f.supervisor.start(req);
 assert.deepEqual(f.events,["describe","physical-start","physical-readback","meter-start"]);
});
test("V5.33: when wallet transaction fails after hardware start, physical STOP is demanded",async()=>{
 const f=fixture();f.setMeterFailure(true);
 await assert.rejects(f.supervisor.start(req),/DB_UNAVAILABLE/);
 assert.deepEqual(f.events,["describe","physical-start","physical-readback","meter-start","physical-stop"]);
});
test("V5.33: no charge when physical agent ACK or watchdog is missing",async()=>{
 const f=fixture();f.setWatchdog(false);
 await assert.rejects(f.supervisor.start(req),{code:"PHYSICAL_WATCHDOG_NOT_VERIFIED"});
 assert.deepEqual(f.events,["describe"]);
 const n=fixture();n.setAck(false);
 await assert.rejects(n.supervisor.start(req),{code:"PHYSICAL_START_NOT_CONFIRMED"});
 assert.equal(n.events.includes("meter-start"),false);
});
test("V5.33: checkpoints always force stop on exhausted RAW or stale signal",async()=>{
 const f=fixture();
 await f.supervisor.checkpoint(req);
 assert.deepEqual(f.events,["physical-readback","meter-tick","physical-stop"]);
 const l=fixture();l.setProof(false);
 await assert.rejects(l.supervisor.checkpoint(req),{code:"PHYSICAL_PROCESSING_NOT_CONFIRMED"});
 assert.deepEqual(l.events,["physical-readback","physical-stop"]);
});
test("V5.33: missing STOP acknowledgement blocks any claim of safe finished studio",async()=>{
 const f=fixture();f.setAck(false);
 await assert.rejects(f.supervisor.finish(req),{code:"PHYSICAL_STOP_NOT_CONFIRMED"});
 assert.equal(f.events.includes("meter-finish"),false);
 const g=fixture();await g.supervisor.finish(req);
 assert.deepEqual(g.events,["physical-stop","meter-finish"]);
});
test("V5.33: a failed checkpoint must demand physical STOP, not keep billing",async()=>{
 const f=fixture();f.setMeterFailure(true);
 await assert.rejects(f.supervisor.checkpoint(req),/DB_UNAVAILABLE/);
 assert.deepEqual(f.events,["physical-readback","meter-tick","physical-stop"]);
});
