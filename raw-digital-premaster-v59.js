/* RAW V5.9 — real OFFLINE DIGITAL premaster DSP, NOT analog gear emulation.
 * Browser-safe / Node VM testable: no network, IPC, hardware or file access.
 * Source buffers are never modified; the processed WAV is explicitly DIGITAL.
 */
(function(global){
"use strict";
const MAX_FRAMES=16000000,MAX_WAV_BYTES=128*1024*1024;
const DEFAULTS=Object.freeze({
 lowCutHz:25,lowShelfDb:0,presenceDb:0,airDb:0,
 thresholdDb:-18,ratio:1,attackMs:20,releaseMs:180,makeupDb:0,
 stereoWidthPercent:100,midTrimDb:0,sideTrimDb:0,
 limiterEnabled:false,limiterDriveDb:0,limiterLookaheadMs:5,limiterReleaseMs:120,
 ceilingDb:-1,bits:24,dither:true
});
const SETTINGS=Object.keys(DEFAULTS);
const reject=(code,msg)=>{const e=new Error(msg);e.code=code;throw e;};
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const gain=db=>Math.pow(10,db/20);
const db=value=>value>0?20*Math.log10(value):null;
function settingsOf(input={}){
 if(!input||typeof input!=="object"||Array.isArray(input))reject("CONFIG","Invalid digital mastering settings");
 for(const key of Object.keys(input))
  if(!SETTINGS.includes(key))reject("CONFIG","Unknown mastering setting: "+key);
 const x={...DEFAULTS,...input};
 const ranges={lowCutHz:[0,120],lowShelfDb:[-12,12],presenceDb:[-12,12],
  airDb:[-12,12],thresholdDb:[-36,0],ratio:[1,8],attackMs:[0.2,200],
  releaseMs:[20,2000],makeupDb:[-12,12],ceilingDb:[-12,-0.1],
  stereoWidthPercent:[0,200],midTrimDb:[-6,6],sideTrimDb:[-6,6],
  limiterDriveDb:[0,12],limiterLookaheadMs:[1,10],limiterReleaseMs:[20,1000]};
 for(const [key,[min,max]] of Object.entries(ranges))
  if(typeof x[key]!=="number"||!Number.isFinite(x[key])||
     x[key]<min||x[key]>max)reject("CONFIG",key+" out of range");
 if(![16,24].includes(x.bits)||typeof x.dither!=="boolean"||
    typeof x.limiterEnabled!=="boolean")
  reject("CONFIG","WAV bits, dither or limiter enabled flag invalid");
 return Object.freeze(x);
}
function audioInfo(audio){
 if(!audio||!Number.isSafeInteger(audio.length)||audio.length<1||
    audio.length>MAX_FRAMES||!Number.isSafeInteger(audio.sampleRate)||
    audio.sampleRate<8000||audio.sampleRate>192000||
    audio.numberOfChannels!==2||typeof audio.getChannelData!=="function")
  reject("AUDIO_INVALID","Expected bounded stereo decoded AudioBuffer 8–192 kHz");
 const chans=[audio.getChannelData(0),audio.getChannelData(1)];
 if(chans.some(x=>!(x instanceof Float32Array)||x.length!==audio.length))
  reject("AUDIO_INVALID","Invalid stereo channel sample buffers");
 return {channels:chans,frames:audio.length,sampleRate:audio.sampleRate};
}
// RBJ audio EQ cookbook Biquad coefficients, digital-only, not device-accurate modeling.
function biquad(type,rate,freq,dbGain=0,Q=0.7071){
 const f=clamp(freq,5,rate*0.45);
 const w0=2*Math.PI*f/rate,c=Math.cos(w0),sn=Math.sin(w0);
 const A=Math.pow(10,dbGain/40),alpha=sn/(2*Q);
 let b0,b1,b2,a0,a1,a2;
 if(type==="highpass"){
  b0=(1+c)/2;b1=-(1+c);b2=(1+c)/2;
  a0=1+alpha;a1=-2*c;a2=1-alpha;
 }else if(type==="peak"){
  b0=1+alpha*A;b1=-2*c;b2=1-alpha*A;
  a0=1+alpha/A;a1=-2*c;a2=1-alpha/A;
 }else if(type==="lowShelf"||type==="highShelf"){
  // RBJ slope S=1, with alpha = sin(w0)/sqrt(2) at S=1.
  const alphaShelf=sn/Math.sqrt(2),k=2*Math.sqrt(A)*alphaShelf;
  if(type==="lowShelf"){
   b0=A*((A+1)-(A-1)*c+k);b1=2*A*((A-1)-(A+1)*c);
   b2=A*((A+1)-(A-1)*c-k);
   a0=(A+1)+(A-1)*c+k;a1=-2*((A-1)+(A+1)*c);
   a2=(A+1)+(A-1)*c-k;
  }else{
   b0=A*((A+1)+(A-1)*c+k);b1=-2*A*((A-1)+(A+1)*c);
   b2=A*((A+1)+(A-1)*c-k);
   a0=(A+1)-(A-1)*c+k;a1=2*((A-1)-(A+1)*c);
   a2=(A+1)-(A-1)*c-k;
  }
 }else reject("FILTER","Unknown EQ filter");
 return [b0/a0,b1/a0,b2/a0,a1/a0,a2/a0];
}
function filter(coeff){
 let z1=0,z2=0;
 return sample=>{
  const output=coeff[0]*sample+z1;
  z1=coeff[1]*sample-coeff[3]*output+z2;
  z2=coeff[2]*sample-coeff[4]*output;
  return output;
 };
}
function analyze(channels,rate){
 const frames=channels[0].length;
 if(!frames)return Object.freeze({frames:0,peakDbfs:null,rmsDbfs:null,clippedFrames:0});
 const sums=[0,0],squares=[0,0],peaks=[0,0],dc=[0,0];
 let cross=0,clipCount=0;
 for(let i=0;i<frames;i++){
  const l=channels[0][i],r=channels[1][i];
  if(!Number.isFinite(l)||!Number.isFinite(r))
   reject("NON_FINITE","Non-finite audio samples");
  sums[0]+=l;sums[1]+=r;
  squares[0]+=l*l;squares[1]+=r*r;cross+=l*r;
  peaks[0]=Math.max(peaks[0],Math.abs(l));
  peaks[1]=Math.max(peaks[1],Math.abs(r));
  if(Math.abs(l)>=1||Math.abs(r)>=1)clipCount++;
 }
 const stereoPeak=Math.max(...peaks);
 const combinedRms=Math.sqrt((squares[0]+squares[1])/(frames*2));
 const denom=Math.sqrt(squares[0]*squares[1]);
 return Object.freeze({
  frames,durationSeconds:frames/rate,peakDbfs:db(stereoPeak),
  rmsDbfs:db(combinedRms),clippedFrames:clipCount,
  channelPeakDbfs:Object.freeze(peaks.map(db)),
  channelRmsDbfs:Object.freeze(squares.map(v=>db(Math.sqrt(v/frames)))),
  dcOffset:Object.freeze(sums.map(v=>v/frames)),
  correlation:denom>1e-16?clamp(cross/denom,-1,1):null,
  measurement:"SAMPLE_PEAK_AND_UNWEIGHTED_RMS_NOT_LUFS_OR_TRUE_PEAK"
 });
}
function makeFilters(rate,settings){
 const definitions=[];
 if(settings.lowCutHz>0)definitions.push(biquad("highpass",rate,settings.lowCutHz));
 if(settings.lowShelfDb!==0)definitions.push(biquad("lowShelf",rate,110,settings.lowShelfDb));
 if(settings.presenceDb!==0)definitions.push(biquad("peak",rate,3000,settings.presenceDb,0.78));
 if(settings.airDb!==0)definitions.push(biquad("highShelf",rate,12000,settings.airDb));
 return [[...definitions.map(filter)],[...definitions.map(filter)]];
}
function delayYield(){return new Promise(resolve=>setTimeout(resolve,0));}
async function render(audio,options={},control={}){
 const s=settingsOf(options);
 const {channels:input,frames,sampleRate:rate}=audioInfo(audio);
 if(!control||typeof control!=="object"||Array.isArray(control))
  reject("RENDER_CONTROL","Invalid rendering control");
 const {onProgress=()=>{},isCancelled=()=>false,yieldEveryFrames=32768}=control;
 if(typeof onProgress!=="function"||typeof isCancelled!=="function"||
    !Number.isSafeInteger(yieldEveryFrames)||yieldEveryFrames<512||
    yieldEveryFrames>262144)reject("RENDER_CONTROL","Invalid bounded rendering options");
 const isGone=()=>isCancelled()===true;
 if(isGone())reject("CANCELLED","Offline rendering cancelled");
 const size=44+frames*2*s.bits/8;
 if(size>MAX_WAV_BYTES||!Number.isSafeInteger(size))
  reject("EXPORT_TOO_LARGE","Digital WAV would exceed 128 MiB");
 // Validate the full input before creating any new artifact. Never mutate audio.
 const inputMeter=analyze(input,rate);
 if(isGone())reject("CANCELLED","Offline rendering cancelled");
 let output=[new Float32Array(frames),new Float32Array(frames)];
 const filters=makeFilters(rate,s);
 const attack=Math.exp(-1/(rate*s.attackMs/1000));
 const release=Math.exp(-1/(rate*s.releaseMs/1000));
 const makeup=gain(s.makeupDb);
 const midSideActive=s.stereoWidthPercent!==100||s.midTrimDb!==0||s.sideTrimDb!==0;
 const midMultiplier=gain(s.midTrimDb),sideMultiplier=gain(s.sideTrimDb)*s.stereoWidthPercent/100;
 let envelope=0;
 let mostGainReductionDb=0,rawPeak=0;
 for(let start=0;start<frames;start+=yieldEveryFrames){
  if(isGone())reject("CANCELLED","Offline rendering cancelled");
  const end=Math.min(frames,start+yieldEveryFrames);
  for(let i=start;i<end;i++){
   let a=input[0][i],b=input[1][i];
   for(const run of filters[0])a=run(a);
   for(const run of filters[1])b=run(b);
   // V5.20: real M/S processing on DSP samples. Defaults are an exact
   // stereo bypass; width=0 collapses to mono. Symmetric M/S conversion
   // retains L+R mono fold-down whenever mid trim is 0 dB.
   if(midSideActive){
    const mid=(a+b)*0.5*midMultiplier;
    const side=(a-b)*0.5*sideMultiplier;
    a=mid+side;b=mid-side;
   }
   const level=Math.max(Math.abs(a),Math.abs(b));
   const coef=level>envelope?attack:release;
   envelope=coef*envelope+(1-coef)*level;
   const envDb=db(envelope)??-180;
   const reduction=s.ratio===1?0:Math.max(0,
      (envDb-s.thresholdDb)*(1-1/s.ratio));
   mostGainReductionDb=Math.max(mostGainReductionDb,reduction);
   const amplitude=makeup*gain(-reduction);
   a*=amplitude;b*=amplitude;
   if(!Number.isFinite(a)||!Number.isFinite(b))
    reject("DSP_OVERFLOW","DSP generated a non-finite sample");
   output[0][i]=a;output[1][i]=b;
   rawPeak=Math.max(rawPeak,Math.abs(a),Math.abs(b));
  }
  try{onProgress(Object.freeze({phase:"DSP",framesDone:end,totalFrames:frames,percent:Math.round(end/frames*80)}));}catch{}
  if(end<frames)await delayYield();
 }
 if(isGone())reject("CANCELLED","Offline rendering cancelled");
 // V5.22: separate real PCM lookahead limiter, enabled ONLY by user toggle.
 // Physical gear, virtual rack and the older default DSP are unchanged.
 let limiterState=Object.freeze({enabled:false,
  certifiedTruePeakLimiter:false,actualPcmProcessed:false});
 if(s.limiterEnabled){
  if(typeof global.RAWDigitalLimiterV522?.apply!=="function")
   reject("LIMITER_UNAVAILABLE","V5.22 digital lookahead limiter is not loaded");
  const limit=await global.RAWDigitalLimiterV522.apply(output,rate,{
   driveDb:s.limiterDriveDb,lookaheadMs:s.limiterLookaheadMs,
   releaseMs:s.limiterReleaseMs,ceilingDb:s.ceilingDb
  },{
   isCancelled:isGone,yieldEveryFrames,
   onProgress:report=>{
    try{onProgress(Object.freeze({phase:"LIMITER_"+report.phase,
     framesDone:report.done,totalFrames:frames,percent:84}));}catch{}
   }
  });
  if(isGone())reject("CANCELLED","Offline rendering cancelled");
  output=limit.channels;
  limiterState=Object.freeze({
   enabled:true,driveDb:limit.driveDb,lookaheadMs:limit.lookaheadMs,
   releaseMs:limit.releaseMs,ceilingDb:limit.ceilingDb,
   gainReductionMaxDb:limit.gainReductionMaxDb,
   limitedFrames:limit.limitedFrames,
   constantIntersampleSafetyDb:limit.constantIntersampleSafetyDb,
   estimatedTruePeakAfterSafetyDbtp:limit.estimatedTruePeakAfterSafetyDbtp,
   oversamplingFactor:4,actualPcmProcessed:true,
   certifiedTruePeakLimiter:false,referenceValidated:false,
   hardwareProcessed:false
  });
  const meter=analyze(output,rate);
  rawPeak=meter.peakDbfs===null?0:gain(meter.peakDbfs);
 }
 // Transparent global peak safety attenuation, not a certified true-peak limiter.
 // Never hard-clip / truncate PCM to fake loudness or true-peak compliance.
 const ceiling=gain(s.ceilingDb);
 const attenuation=rawPeak>ceiling?ceiling/rawPeak:1;
 if(attenuation<1){
  for(let start=0;start<frames;start+=yieldEveryFrames){
   if(isGone())reject("CANCELLED","Offline rendering cancelled");
   const end=Math.min(frames,start+yieldEveryFrames);
   for(let i=start;i<end;i++){
    output[0][i]*=attenuation;output[1][i]*=attenuation;
   }
   try{onProgress(Object.freeze({phase:"PEAK_SAFETY",framesDone:end,totalFrames:frames,percent:80+Math.round(end/frames*10)}));}catch{}
   if(end<frames)await delayYield();
  }
 }
 const outputMeter=analyze(output,rate);
 if(isGone())reject("CANCELLED","Offline rendering cancelled");
 const encoded=encodeWav({channels:output,sampleRate:rate,bits:s.bits,dither:s.dither});
 if(isGone())reject("CANCELLED","Offline rendering cancelled");
 try{onProgress(Object.freeze({phase:"ENCODED",framesDone:frames,totalFrames:frames,percent:100}));}catch{}
 return Object.freeze({
  kind:"RAW_LOCAL_DIGITAL_PREMASTER_V59",settings:s,sampleRate:rate,frames,
  channels:output,inputMeter,outputMeter,
  peakSafetyAttenuationDb:db(attenuation)??null,
  maxCompressorReductionDb:mostGainReductionDb,
  limiter:limiterState,
  midSideProcessed:midSideActive,
  midSideSettings:Object.freeze({widthPercent:s.stereoWidthPercent,
   midTrimDb:s.midTrimDb,sideTrimDb:s.sideTrimDb}),
  byteLength:encoded.byteLength,
  chunks:encoded.chunks,outputBits:s.bits,outputDither:s.dither,
  localDigitalProcessing:true,simulationOnly:false,analogCaptured:false,
  physicalReadback:false,hardwareProcessed:false,verifiedAnalogMaster:false,
  digitalWavAvailable:true,masterAvailable:false
 });
}
// Deterministic TPDF dither prior to integer quantization. Does not modify output floats.
function encodeWav({channels,sampleRate,bits=24,dither=true}={}){
 if(!Array.isArray(channels)||channels.length!==2||
    !channels.every(x=>x instanceof Float32Array)||
    channels[0].length!==channels[1].length||channels[0].length<1||
    !Number.isSafeInteger(sampleRate)||sampleRate<8000||sampleRate>192000||
    ![16,24].includes(bits)||typeof dither!=="boolean")
  reject("WAV_INPUT","Expected stereo 16/24-bit PCM export");
 const frames=channels[0].length;
 const bps=bits/8,align=2*bps,totalBytes=44+frames*align;
 if(totalBytes>MAX_WAV_BYTES||!Number.isSafeInteger(totalBytes))
  reject("EXPORT_TOO_LARGE","Digital PCM WAV exceeds export limit");
 const header=new Uint8Array(44),view=new DataView(header.buffer);
 const ascii=(i,word)=>{for(let j=0;j<word.length;j++)header[i+j]=word.charCodeAt(j);};
 ascii(0,"RIFF");view.setUint32(4,36+frames*align,true);ascii(8,"WAVE");
 ascii(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);
 view.setUint16(22,2,true);view.setUint32(24,sampleRate,true);
 view.setUint32(28,sampleRate*align,true);view.setUint16(32,align,true);
 view.setUint16(34,bits,true);ascii(36,"data");view.setUint32(40,frames*align,true);
 const chunks=[header];
 const scalar=bits===16?32768:8388608;
 const minimum=-scalar,maximum=scalar-1;
 let rng=0xC0FFEE21;
 const random=()=>{
  rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;
  return (rng>>>0)/4294967296;
 };
 for(let off=0;off<frames;off+=16384){
  const count=Math.min(frames-off,16384),data=new Uint8Array(count*align);
  let at=0;
  for(let i=off;i<off+count;i++)for(let ch=0;ch<2;ch++){
   const sample=channels[ch][i];
   if(!Number.isFinite(sample))reject("NON_FINITE","Cannot export non-finite PCM");
   const noise=dither?random()-random():0;
   const value=clamp(Math.round(sample*scalar+noise),minimum,maximum);
   data[at++]=value&255;data[at++]=(value>>8)&255;
   if(bits===24)data[at++]=(value>>16)&255;
  }
  chunks.push(data);
 }
 return Object.freeze({chunks,byteLength:totalBytes,frames,
  sampleRate,bits,dither,kind:"RAW_LOCAL_DIGITAL_PCM_WAV_V59",
  hardwareProcessed:false,analogCaptured:false,verifiedAnalogMaster:false});
}
function safeFilename(name){
 const clean=String(name||"track").replace(/\.[^.]+$/,"").normalize("NFKC")
  .replace(/[^\p{L}\p{N}._-]/gu,"_").replace(/^\.+/,"")
  .replace(/_+/g,"_").slice(0,64);
 const stem=clean&&!/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(clean)?clean:"track";
 return stem+"_RAW_DIGITAL_PREMASTER_V59.wav";
}
global.RAWDigitalPremasterV59=Object.freeze({render,analyze,encodeWav,
 settingsOf,safeFilename,DEFAULTS,MAX_FRAMES,MAX_WAV_BYTES});
})(typeof window!=="undefined"?window:globalThis);
