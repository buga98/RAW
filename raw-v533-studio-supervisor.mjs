/* RAW V5.33 — verified studio-agent API coordinator (NO real hardware adapter).
 * Physical operation must be ACKed by a trusted agent before metering starts.
 * Stop is required on bill exhaustion, proof loss, and normal finish.
 * An independent local watchdog is mandatory: cloud cannot stop hardware
 * after an Internet cut or power loss.
 */
import {RawAccessError} from "./raw-v529-identity.mjs";
import {requireIndependentHardwareWatchdogV533} from "./raw-v533-safety-policy.mjs";
const NAME=/^[A-Za-z0-9_-]{4,96}$/;
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const valid=(x,re)=>typeof x==="string"&&re.test(x);
const fail=(code,status=503)=>{throw new RawAccessError(code,status);};
export function createRawStudioSupervisorV533({agent,meter}={}){
 if(!agent||!meter||
  ["describe","start","readback","stop"].some(x=>typeof agent[x]!=="function")||
  ["start","checkpoint","finish"].some(x=>typeof meter[x]!=="function"))
  fail("TRUSTED_STUDIO_AGENT_REQUIRED");
 async function stopVerified(request){
  let receipt;
  try{receipt=await agent.stop(request);}
  catch{fail("PHYSICAL_STOP_NOT_CONFIRMED");}
  if(receipt?.stopped!==true||receipt?.acknowledged!==true||
     receipt?.leaseId!==request.leaseId||
     receipt?.runId!==request.runId)
   fail("PHYSICAL_STOP_NOT_CONFIRMED");
  return receipt;
 }
 async function proof(request){
  const read=await agent.readback(request);
  if(read?.physicalProcessing!==true||
     read?.leaseId!==request.leaseId||
     read?.runId!==request.runId||
     read?.ownerUid!==request.ownerUid)
   fail("PHYSICAL_PROCESSING_NOT_CONFIRMED");
 }
 function requestCheck(req,deviceIds=false){
  if(!req||!valid(req.runId,NAME)||!valid(req.ownerUid,UID)||
     !valid(req.leaseId,NAME)||!valid(req.sessionId,NAME))
   fail("INVALID_STUDIO_REQUEST",400);
  if(deviceIds&&(!Array.isArray(req.deviceIds)||req.deviceIds.length===0))
   fail("INVALID_STUDIO_DEVICES",400);
 }
 return Object.freeze({
  async start(req){
   requestCheck(req,true);
   requireIndependentHardwareWatchdogV533(await agent.describe(req));
   const ack=await agent.start(req);
   if(ack?.started!==true||ack?.acknowledged!==true||
      ack?.runId!==req.runId||ack?.leaseId!==req.leaseId)
    fail("PHYSICAL_START_NOT_CONFIRMED");
   try{
    await proof(req);
    return await meter.start(req);
   }catch(error){
    // If we start real hardware but cannot begin billing, STOP is mandatory.
    await stopVerified(req);
    throw error;
   }
  },
  async checkpoint(req){
   requestCheck(req);
   try{
    await proof(req);
    const result=await meter.checkpoint(req);
    if(result?.stopRequired===true)await stopVerified(req);
    return result;
   }catch(error){
    // A lost proof/failed Firestore writes must fail closed locally.
    await stopVerified(req);
    throw error;
   }
  },
  async finish(req){
   requestCheck(req);
   const stop=await stopVerified(req);
   // STOP receipt precedes final billing; no extra time after physical STOP.
   if(!Number.isSafeInteger(stop.stoppedAtMs)||stop.stoppedAtMs<0)
    fail("PHYSICAL_STOP_TIME_INVALID");
   // V5.31 meter currently supplies its own now(); this must be reconciled
   // with trusted stop timestamp before enabling real billing.
   return meter.finish(req);
  }
 });
}
