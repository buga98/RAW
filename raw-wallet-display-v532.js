/* V5.32 — read-only RAW balance presentation.
 * NEVER infer paid tokens from legacy users/{uid}.credits.
 * Source of truth: verified rawWalletsV531/{uid}.balanceMicros.
 */
(function(global){
 "use strict";
 const MAX=1_000_000_000_000;
 const valid=value=>Number.isSafeInteger(value)&&value>=0&&value<=MAX;
 const label=(balanceMicros,{testMode=false}={})=>{
  if(testMode===true)return "TEST — bez naplate";
  if(!valid(balanceMicros))return "RAW saldo nije dostupan";
  return (balanceMicros/1_000_000).toFixed(4)+" RAW";
 };
 global.RAWTokenDisplayV532=Object.freeze({label,valid});
})(typeof window!=="undefined"?window:globalThis);
