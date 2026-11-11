/* RAW V5.33 — studio processing safety policy, simulated contract only.
 * Billing access MUST NOT be issued from UI flags or on booking alone.
 * A real studio agent needs independent local physical watchdog and STOP ACK.
 */
import {RawAccessError} from "./raw-v529-identity.mjs";
import {rawCostMicrosV531,RAW_MAX_BALANCE_MICROS_V531} from "./raw-v531-token-math.mjs";
const error=(code,status=403)=>{throw new RawAccessError(code,status);};
export const RAW_STUDIO_MAX_PROOF_GAP_MS_V533=10_000;
export const RAW_STUDIO_AGENT_STOP_DEADLINE_MS_V533=2_000;
export function rawSafeProcessingAllowanceV533({
 balanceMicros,rateCentsPerHour,checkpointMs=RAW_STUDIO_MAX_PROOF_GAP_MS_V533
}={}){
 if(!Number.isSafeInteger(balanceMicros)||balanceMicros<0||
   balanceMicros>RAW_MAX_BALANCE_MICROS_V531||
   !Number.isSafeInteger(checkpointMs)||checkpointMs<100||checkpointMs>10_000)
  error("INVALID_STUDIO_ALLOWANCE",400);
 // Zero-balance or unable-to-pay-next-checkpoint must never arm hardware.
 let required;
 try{required=rawCostMicrosV531(rateCentsPerHour,checkpointMs);}
 catch{error("INVALID_STUDIO_RATE",400);}
 if(balanceMicros<required||required===0)
  return Object.freeze({allowed:false,reason:"INSUFFICIENT_SAFE_RESERVE",
   requiredMicros:required});
 return Object.freeze({allowed:true,checkpointMs,requiredMicros:required});
}
export function requireIndependentHardwareWatchdogV533(descriptor){
 if(!descriptor||typeof descriptor!=="object"||
    descriptor.mode!=="physical"||descriptor.independentStopOnDisconnect!==true||
    descriptor.stopDeadlineMs>RAW_STUDIO_AGENT_STOP_DEADLINE_MS_V533||
    !Number.isSafeInteger(descriptor.stopDeadlineMs)||descriptor.stopDeadlineMs<=0||
    descriptor.physicalAckVerified!==true)
  error("PHYSICAL_WATCHDOG_NOT_VERIFIED",503);
 return Object.freeze({verified:true});
}
