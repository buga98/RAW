// RAW v5.49 experimental Bettermaker EQ1 frequency calibration.
// Observed pairs: RAW command Hz -> actual ORIGINAL Cubase VST Hz.
// Calibrated in a single reported Cubase setup, 2026-11-14.
// Not a vendor specification or universal guarantee.
export const EQ1_OBSERVATIONS=Object.freeze([
  [50,43],[100,75],[173,118],[250,166],[350,254],
  [400,321],[420,357],[440,396],[460,445],[470,470]
].map(pair=>Object.freeze(pair)));

export const EQ1_CALIBRATED_MIN=43;
export const EQ1_CALIBRATED_MAX=470;

export function inverseEq1Frequency(targetHz){
  if(typeof targetHz!=="number"||!Number.isFinite(targetHz)||
     targetHz<EQ1_CALIBRATED_MIN||targetHz>EQ1_CALIBRATED_MAX)
    throw new RangeError("EQ1_FREQUENCY_OUTSIDE_MEASURED_CALIBRATION_43_TO_470_HZ");
  for(let i=1;i<EQ1_OBSERVATIONS.length;i++){
    const [raw0,actual0]=EQ1_OBSERVATIONS[i-1];
    const [raw1,actual1]=EQ1_OBSERVATIONS[i];
    if(targetHz<=actual1){
      const ratio=(targetHz-actual0)/(actual1-actual0);
      return raw0+ratio*(raw1-raw0);
    }
  }
  throw new RangeError("EQ1_FREQUENCY_NOT_CALIBRATED");
}
