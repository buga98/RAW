/* RAW V5.17 — ITU-R BS.1770-5 Annex 1 stereo K-weighted integrated loudness.
 * Implements 400ms blocks, 75% overlap, -70 LUFS absolute gate and -10 LU
 * relative gate. 48k reference coefficients from BS.1770; other sample rates
 * derived by bilinear frequency-mapping of the same prototype sections.
 * Offline DIGITAL analysis only; no peak limiting, no analog hardware and
 * NOT a separately accredited / reference-vector certified LUFS meter.
 */
(function(global){
"use strict";
const REF_RATE=48000,MAX_FRAMES=16000000;
const SHELF={b:[1.53512485958697,-2.69169618940638,1.19839281085285],
 a:[1,-1.69065929318241,0.73248077421585]};
const RLB={b:[1,-2,1],a:[1,-1.99004745483398,0.99007225036621]};
const db=power=>power>0?-0.691+10*Math.log10(power):null;
const error=(code,message)=>{const e=new Error(message);e.code=code;throw e;};
function mapRate(section,rate){
 const r=rate/REF_RATE;
 const transform=a=>{
  const [x,y,z]=a;
  const c2=(x-y+z)*r*r, c1=2*(x-z)*r, c0=x+y+z;
  return [c2+c1+c0,2*(c0-c2),c2-c1+c0];
 };
 const b=transform(section.b),a=transform(section.a);
 if(!Number.isFinite(a[0])||Math.abs(a[0])<1e-8)
  error("FILTER_UNSTABLE","Cannot derive K weighting for sample rate");
 return [b[0]/a[0],b[1]/a[0],b[2]/a[0],a[1]/a[0],a[2]/a[0]];
}
function section(coeff){
 let z1=0,z2=0;
 return x=>{
  const y=coeff[0]*x+z1;
  z1=coeff[1]*x-coeff[3]*y+z2;
  z2=coeff[2]*x-coeff[4]*y;
  return y;
 };
}
function check(channels,sampleRate){
 if(!Array.isArray(channels)||channels.length!==2||
    !channels.every(x=>x instanceof Float32Array)||
    !Number.isSafeInteger(channels[0]?.length)||
    channels[0].length!==channels[1].length||
    channels[0].length<1||channels[0].length>MAX_FRAMES||
    !Number.isSafeInteger(sampleRate)||sampleRate<8000||sampleRate>192000)
  error("INVALID_STEREO","Expected bounded stereo 8–192 kHz PCM");
}
const sleep=()=>new Promise(resolve=>setTimeout(resolve,0));
async function measure(channels,sampleRate,{isCancelled=()=>false,
 onProgress=()=>{},yieldEveryFrames=65536}={}){
 check(channels,sampleRate);
 if(typeof isCancelled!=="function"||typeof onProgress!=="function"||
    !Number.isSafeInteger(yieldEveryFrames)||yieldEveryFrames<1024||yieldEveryFrames>262144)
  error("INVALID_CONTROL","Invalid BS.1770 measurement controls");
 const cancel=()=>{if(isCancelled())error("CANCELLED","Loudness measurement cancelled");};
 cancel();
 const blockFrames=Math.round(sampleRate*0.4);
 const stepFrames=Math.round(blockFrames*0.25);
 const shortFrames=Math.round(sampleRate*3);
 const window=new Float64Array(blockFrames),shortWindow=new Float64Array(shortFrames);
 const filters=[[section(mapRate(SHELF,sampleRate)),section(mapRate(RLB,sampleRate))],
  [section(mapRate(SHELF,sampleRate)),section(mapRate(RLB,sampleRate))]];
 let energySum=0,shortSum=0,maxMomentary=null,maxShortTerm=null;
 let lastMomentary=null,lastShortTerm=null;
 const gatedPowers=[];
 const frames=channels[0].length;
 for(let offset=0;offset<frames;offset+=yieldEveryFrames){
  cancel();
  const end=Math.min(frames,offset+yieldEveryFrames);
  for(let i=offset;i<end;i++){
   let power=0;
   for(let ch=0;ch<2;ch++){
    let x=channels[ch][i];
    if(!Number.isFinite(x))error("NON_FINITE","Invalid PCM sample for loudness analysis");
    x=filters[ch][1](filters[ch][0](x));
    if(!Number.isFinite(x))error("FILTER_OVERFLOW","K weighting overflowed");
    power+=x*x;
   }
   const position=i%blockFrames;
   energySum+=power-window[position];
   window[position]=power;
   const shortAt=i%shortFrames;
   shortSum+=power-shortWindow[shortAt];
   shortWindow[shortAt]=power;
   if(i+1>=blockFrames&&(i+1-blockFrames)%stepFrames===0){
    const value=Math.max(0,energySum/blockFrames),level=db(value);
    gatedPowers.push(value);
    lastMomentary=level;
    if(level!==null&&(maxMomentary===null||level>maxMomentary))
     maxMomentary=level;
   }
   if(i+1>=shortFrames&&(i+1-shortFrames)%Math.round(sampleRate*0.1)===0){
    lastShortTerm=db(Math.max(0,shortSum/shortFrames));
    if(lastShortTerm!==null&&
      (maxShortTerm===null||lastShortTerm>maxShortTerm))
     maxShortTerm=lastShortTerm;
   }
  }
  try{onProgress(Object.freeze({processed:end,total:frames}));}catch{}
  if(end<frames)await sleep();
 }
 cancel();
 const absolute=gatedPowers.filter(value=>{
  const level=db(value);return level!==null&&level>-70;
 });
 if(!absolute.length)return Object.freeze({
  integratedLufs:null,maxMomentaryLufs:maxMomentary,
  maxShortTermLufs:maxShortTerm,finalMomentaryLufs:lastMomentary,
  finalShortTermLufs:lastShortTerm,absoluteGateBlocks:0,relativeGateBlocks:0,
  totalBlocks:gatedPowers.length,sampleRate,frames,
  method:"BS1770_5_STEREO_K_WEIGHTED_GATED",
  status:"BELOW_ABSOLUTE_GATE",referenceCertified:false,
  analogCaptured:false,physicalReadback:false
 });
 const avg=absolute.reduce((a,b)=>a+b,0)/absolute.length;
 const threshold=db(avg)-10;
 const relative=absolute.filter(v=>db(v)>threshold);
 const mean=relative.reduce((a,b)=>a+b,0)/relative.length;
 return Object.freeze({
  integratedLufs:db(mean),maxMomentaryLufs:maxMomentary,
  maxShortTermLufs:maxShortTerm,finalMomentaryLufs:lastMomentary,
  finalShortTermLufs:lastShortTerm,
  absoluteGateBlocks:absolute.length,relativeGateBlocks:relative.length,
  totalBlocks:gatedPowers.length,sampleRate,frames,
  method:"BS1770_5_STEREO_K_WEIGHTED_GATED",
  status:"MEASURED_REFERENCE_VALIDATION_PENDING",
  referenceCertified:false,analogCaptured:false,physicalReadback:false
 });
}
global.RAWProfessionalLoudnessV517=Object.freeze({measure,mapRate});
})(typeof window!=="undefined"?window:globalThis);
