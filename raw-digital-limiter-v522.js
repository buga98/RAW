/* RAW V5.22 — LOCAL DIGITAL lookahead / 4x intersample-aware LIMITER LAB.
 * This is real stereo PCM gain reduction and NOT Bettermaker/WesAudio emulation.
 * It uses an offline 4x windowed-sinc peak estimate, linked gain control,
 * zero-buffer-shift full-file lookahead, smooth gain recovery, and a final
 * constant intersample safety trim. This is NOT a certified BS.1770 Annex 2
 * true-peak limiter; validate against external reference audio before release.
 * No hardware, DAW, network, billing, or file IO.
 */
(function(global){
"use strict";
const MAX_FRAMES=16000000,PHASES=[0.25,0.5,0.75],RADIUS=8;
const reject=(code,msg)=>{const e=new Error(msg);e.code=code;throw e;};
const linear=db=>Math.pow(10,db/20);
const db=linear=>linear>0?20*Math.log10(linear):null;
const taps=PHASES.map(phase=>{
 let sum=0;const values=[];
 for(let n=-RADIUS;n<=RADIUS;n++){
  const delta=n-phase;
  const sinc=Math.abs(delta)<1e-12?1:Math.sin(Math.PI*delta)/(Math.PI*delta);
  const window=0.5+0.5*Math.cos(Math.PI*delta/(RADIUS+1));
  const value=sinc*window;values.push(value);sum+=value;
 }
 return Float64Array.from(values,n=>n/sum);
});
function optionsOf(options={}){
 if(!options||typeof options!=="object"||Array.isArray(options))
  reject("LIMITER_OPTIONS","Invalid digital limiter settings");
 const expected=["driveDb","lookaheadMs","releaseMs","ceilingDb"];
 if(Object.keys(options).some(k=>!expected.includes(k)))
  reject("LIMITER_OPTIONS","Unknown limiter option");
 const config={driveDb:0,lookaheadMs:5,releaseMs:120,ceilingDb:-1,...options};
 const ranges={driveDb:[0,12],lookaheadMs:[1,10],releaseMs:[20,1000],ceilingDb:[-12,-0.1]};
 for(const [name,[a,b]] of Object.entries(ranges))
  if(typeof config[name]!=="number"||!Number.isFinite(config[name])||
     config[name]<a||config[name]>b)
   reject("LIMITER_OPTIONS",name+" out of range");
 return Object.freeze(config);
}
function validate(channels,rate){
 if(!Array.isArray(channels)||channels.length!==2||
    !channels.every(ch=>ch instanceof Float32Array)||
    !Number.isSafeInteger(channels[0]?.length)||channels[0].length<1||
    channels[0].length!==channels[1].length||channels[0].length>MAX_FRAMES||
    !Number.isSafeInteger(rate)||rate<8000||rate>192000)
  reject("LIMITER_PCM","Expected bounded 2-channel Float32 PCM");
}
function sampleAt(ch,index){
 return ch[Math.min(ch.length-1,Math.max(0,index))];
}
function peakAt(channels,i,drive=1){
 let peak=Math.max(Math.abs(channels[0][i]),Math.abs(channels[1][i]));
 for(let c=0;c<2;c++){
  const data=channels[c];
  for(const coeffs of taps){
   let value=0;
   for(let k=0;k<coeffs.length;k++)
    value+=sampleAt(data,i+k-RADIUS)*coeffs[k];
   peak=Math.max(peak,Math.abs(value));
  }
 }
 return peak*drive;
}
async function apply(channels,rate,settings={},control={}){
 validate(channels,rate);
 const s=optionsOf(settings);
 if(!control||typeof control!=="object"||Array.isArray(control))
  reject("LIMITER_CONTROL","Invalid limiter controls");
 const {isCancelled=()=>false,onProgress=()=>{},yieldEveryFrames=32768}=control;
 if(typeof isCancelled!=="function"||typeof onProgress!=="function"||
    !Number.isSafeInteger(yieldEveryFrames)||yieldEveryFrames<512||
    yieldEveryFrames>262144)reject("LIMITER_CONTROL","Invalid bounded processing controls");
 const cancel=()=>{if(isCancelled())reject("CANCELLED","Digital limiter cancelled");};
 const frames=channels[0].length,lookaheadFrames=Math.max(1,Math.round(rate*s.lookaheadMs/1000));
 const release=Math.exp(-1/(rate*s.releaseMs/1000));
 const drive=linear(s.driveDb),ceiling=linear(s.ceilingDb);
 const peaks=new Float32Array(frames),indices=new Uint32Array(frames);
 const processed=[new Float32Array(frames),new Float32Array(frames)];
 const yieldStep=()=>new Promise(resolve=>setTimeout(resolve,0));
 const progress=(phase,current)=>{try{onProgress(Object.freeze({phase,done:current,total:frames}));}catch{}};
 cancel();
 // Read-only analysis pass. All parameter validation happens before this pass.
 for(let off=0;off<frames;off+=yieldEveryFrames){
  cancel();
  const end=Math.min(frames,off+yieldEveryFrames);
  for(let i=off;i<end;i++){
   if(!Number.isFinite(channels[0][i])||!Number.isFinite(channels[1][i]))
    reject("NON_FINITE","Limiter input contains non-finite PCM");
   peaks[i]=peakAt(channels,i,drive);
   if(!Number.isFinite(peaks[i]))
    reject("NON_FINITE","Limiter oversampled estimate overflowed");
  }
  progress("4X_PEAK_SCAN",end);
  if(end<frames)await yieldStep();
 }
 // Full-file lookahead needs no physical audio delay: process each sample
 // against the maximum predicted peak in [i, i+lookaheadFrames].
 let head=0,tail=0,right=-1,envelopeGain=1,minGain=1,limitedFrames=0;
 for(let off=0;off<frames;off+=yieldEveryFrames){
  cancel();
  const end=Math.min(frames,off+yieldEveryFrames);
  for(let i=off;i<end;i++){
   const ahead=Math.min(frames-1,i+lookaheadFrames);
   while(right<ahead){
    right++;
    while(tail>head&&peaks[indices[tail-1]]<=peaks[right])tail--;
    indices[tail++]=right;
   }
   while(head<tail&&indices[head]<i)head++;
   const prediction=peaks[indices[head]];
   const desired=prediction>ceiling?ceiling/prediction:1;
   if(desired<envelopeGain)envelopeGain=desired;
   else envelopeGain=desired+(envelopeGain-desired)*release;
   envelopeGain=Math.min(1,Math.max(0,envelopeGain));
   minGain=Math.min(minGain,envelopeGain);
   if(envelopeGain<0.99999)limitedFrames++;
   const amp=drive*envelopeGain;
   processed[0][i]=channels[0][i]*amp;
   processed[1][i]=channels[1][i]*amp;
   if(!Number.isFinite(processed[0][i])||!Number.isFinite(processed[1][i]))
    reject("NON_FINITE","Limiter output overflowed");
  }
  progress("LINKED_LOOKAHEAD",end);
  if(end<frames)await yieldStep();
 }
 // 4x estimate on the actual dynamically gain-shaped output. Sudden gain
 // changes can create new intersample overs; when they do, use a global
 // safety trim rather than clipping or claiming certified dBTP compliance.
 let estimatedPeak=0;
 for(let off=0;off<frames;off+=yieldEveryFrames){
  cancel();
  const end=Math.min(frames,off+yieldEveryFrames);
  for(let i=off;i<end;i++)estimatedPeak=Math.max(estimatedPeak,peakAt(processed,i));
  progress("OUTPUT_4X_VERIFY",end);
  if(end<frames)await yieldStep();
 }
 const safety=estimatedPeak>ceiling?ceiling/estimatedPeak:1;
 if(safety<1){
  for(let off=0;off<frames;off+=yieldEveryFrames){
   cancel();
   const end=Math.min(frames,off+yieldEveryFrames);
   for(let i=off;i<end;i++){
    processed[0][i]*=safety;processed[1][i]*=safety;
   }
   progress("CONSTANT_INTERSAMPLE_SAFETY",end);
   if(end<frames)await yieldStep();
  }
 }
 cancel();
 return Object.freeze({
  kind:"RAW_LOCAL_LOOKAHEAD_LIMITER_V522",channels:processed,
  enabled:true,driveDb:s.driveDb,lookaheadMs:s.lookaheadMs,
  releaseMs:s.releaseMs,ceilingDb:s.ceilingDb,
  gainReductionMaxDb:-db(minGain)||0,limitedFrames,
  constantIntersampleSafetyDb:db(safety)||0,
  estimatedTruePeakBeforeSafetyDbtp:db(estimatedPeak),
  estimatedTruePeakAfterSafetyDbtp:db(estimatedPeak*safety),
  oversamplingFactor:4,sampleRate:rate,frames,
  actualPcmProcessed:true,hardwareProcessed:false,analogCaptured:false,
  certifiedTruePeakLimiter:false,referenceValidated:false,
  wholeTrackDelayFrames:0
 });
}
global.RAWDigitalLimiterV522=Object.freeze({apply,optionsOf});
})(typeof window!=="undefined"?window:globalThis);
