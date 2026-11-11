/* RAW V5.31 — exact, integer microRAW billing.
 * 1 RAW = 1 euro. 1 euro cent = 10_000 microRAW.
 * Values remain integers in Firestore, and UI may interpolate each second.
 * Never round or debit per UI-second: calculate cumulative cost.
 */
export const RAW_MICROS_PER_TOKEN_V531=1_000_000;
export const RAW_MICROS_PER_CENT_V531=10_000;
export const RAW_MS_PER_HOUR_V531=3_600_000;
export const RAW_MAX_BALANCE_MICROS_V531=1_000_000_000_000; // 1 million RAW
export const RAW_MAX_RUN_MS_V531=4*RAW_MS_PER_HOUR_V531;
export const RAW_MAX_RATE_CENTS_HOUR_V531=30_000;
export const RAW_DEFAULT_SAMPLE_RATES_V531=Object.freeze({
 bettermaker:1800,ngBusComp:1500,ngTubeComp:2300
}); // examples ONLY: final prices set by trusted studio owner
const valid=n=>Number.isSafeInteger(n)&&n>=0;
export function rawTopUpMicrosV531(amountCents){
 if(!valid(amountCents)||amountCents<500||amountCents>50_000||
  amountCents%100!==0)throw new RangeError("INVALID_EUR_TOPUP");
 return amountCents*RAW_MICROS_PER_CENT_V531;
}
export function rawCostMicrosV531(rateCentsPerHour,elapsedMs){
 if(!valid(rateCentsPerHour)||rateCentsPerHour===0||
  rateCentsPerHour>RAW_MAX_RATE_CENTS_HOUR_V531||
  !valid(elapsedMs)||elapsedMs>RAW_MAX_RUN_MS_V531)
  throw new RangeError("INVALID_BILLING_INTERVAL");
 return Math.floor(
  rateCentsPerHour*RAW_MICROS_PER_CENT_V531*elapsedMs/RAW_MS_PER_HOUR_V531
 );
}
export function rawSumRateCentsV531(deviceRates){
 if(!Array.isArray(deviceRates)||deviceRates.length<1||deviceRates.length>12)
  throw new RangeError("INVALID_DEVICE_RATES");
 let total=0;
 for(const rate of deviceRates){
  if(!valid(rate)||rate===0||rate>RAW_MAX_RATE_CENTS_HOUR_V531)
   throw new RangeError("INVALID_DEVICE_RATE");
  total+=rate;
 }
 if(total>RAW_MAX_RATE_CENTS_HOUR_V531)
  throw new RangeError("INVALID_TOTAL_RATE");
 return total;
}
export function rawFormatTokensV531(micros,digits=4){
 if(!valid(micros)||micros>RAW_MAX_BALANCE_MICROS_V531||
    !Number.isSafeInteger(digits)||digits<0||digits>6)
  throw new RangeError("INVALID_RAW_BALANCE");
 return (micros/RAW_MICROS_PER_TOKEN_V531).toFixed(digits);
}
