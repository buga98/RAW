/* RAW V5.36 — offline WAV round-trip file analyzer for a FUTURE real studio.
 * Generates a quiet stereo calibration WAV. Measures a separately supplied
 * exported capture WAV, not a physical interface itself. NO audio output,
 * hardware control, cloud communication, billable work or analog proof.
 */
import {createHash} from "node:crypto";
export const CALIBRATION_V536=Object.freeze({
 sampleRate:48000,channels:2,durationSeconds:6,formatBits:24,
 markerSeconds:Object.freeze([1,1.5]),markerHz:Object.freeze([1000,1500]),
 markerDurationMs:20,amplitude:0.1,maxCaptureSeconds:20
});
const fmtError=(s)=>Object.assign(new Error(s),{code:"CALIBRATION_WAV_INVALID"});
function assertBuffer(b,max=64*1024*1024){
 if(!Buffer.isBuffer(b)||b.length<44||b.length>max)throw fmtError("WAV must be between 44 B and 64 MiB");
}
const hash=b=>createHash("sha256").update(b).digest("hex");
function markerAt(frame,channel){
 const info=CALIBRATION_V536;const at=Math.round(info.markerSeconds[channel]*info.sampleRate);
 const pos=frame-at,N=info.sampleRate*info.markerDurationMs/1000;
 if(pos<0||pos>=N)return 0;
 const envelope=Math.sin(Math.PI*pos/(N-1))**2;
 return info.amplitude*envelope*Math.sin(2*Math.PI*info.markerHz[channel]*pos/info.sampleRate);
}
function pcmWord(x){const a=Math.max(-1,Math.min(1,x));return a<0?Math.round(a*8388608):Math.round(a*8388607);}
export function createCalibrationWavV536(){
 const {sampleRate,durationSeconds,channels}=CALIBRATION_V536;
 const frames=sampleRate*durationSeconds,bytes=frames*channels*3;
 const b=Buffer.alloc(44+bytes);
 b.write("RIFF",0,"ascii");b.writeUInt32LE(36+bytes,4);b.write("WAVE",8,"ascii");
 b.write("fmt ",12,"ascii");b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(channels,22);b.writeUInt32LE(sampleRate,24);
 b.writeUInt32LE(sampleRate*channels*3,28);b.writeUInt16LE(channels*3,32);
 b.writeUInt16LE(24,34);b.write("data",36,"ascii");b.writeUInt32LE(bytes,40);
 for(let i=0;i<frames;i++)for(let ch=0;ch<2;ch++){
  const n=pcmWord(markerAt(i,ch)),off=44+(i*2+ch)*3;
  b[off]=n&255;b[off+1]=(n>>8)&255;b[off+2]=(n>>16)&255;
 }
 return Object.freeze({wav:b,sha256:hash(b),frames,
  kind:"RAW_STUDIO_CALIBRATION_SOURCE_V536",
  physicalReadback:false,analogCaptured:false,notMaster:true});
}
export function parseCalibrationCaptureV536(buffer){
 assertBuffer(buffer);
 if(buffer.toString("ascii",0,4)!=="RIFF"||
    buffer.toString("ascii",8,12)!=="WAVE"||
    buffer.readUInt32LE(4)+8>buffer.length)
  throw fmtError("Expected RIFF WAVE");
 let pos=12,fmt=null,data=null;
 while(pos+8<=buffer.length){
  const type=buffer.toString("ascii",pos,pos+4);
  const len=buffer.readUInt32LE(pos+4);
  const start=pos+8,end=start+len;
  if(!Number.isSafeInteger(end)||end>buffer.length)throw fmtError("WAV chunk exceeds file");
  if(type==="fmt "){
   if(fmt||len<16)throw fmtError("Invalid WAV fmt chunk");
   fmt={audioFormat:buffer.readUInt16LE(start),channels:buffer.readUInt16LE(start+2),
    sampleRate:buffer.readUInt32LE(start+4),byteRate:buffer.readUInt32LE(start+8),
    blockAlign:buffer.readUInt16LE(start+12),bits:buffer.readUInt16LE(start+14)};
  }
  if(type==="data"){if(data)throw fmtError("Multiple data chunks");data={start,len};}
  pos=end+(len%2);
 }
 if(!fmt||!data||fmt.channels!==2||fmt.sampleRate!==48000||
    !((fmt.audioFormat===1&&[16,24].includes(fmt.bits))||
      (fmt.audioFormat===3&&fmt.bits===32))||
    fmt.blockAlign!==fmt.channels*(fmt.bits/8)||
    fmt.byteRate!==fmt.sampleRate*fmt.blockAlign||
    data.len%fmt.blockAlign!==0)
  throw fmtError("Require stereo 48 kHz PCM16/24 or IEEE float32 WAV");
 const frames=data.len/fmt.blockAlign;
 if(frames<48000||frames>CALIBRATION_V536.maxCaptureSeconds*fmt.sampleRate)
  throw fmtError("Capture must be 1–20 seconds");
 const channels=[new Float32Array(frames),new Float32Array(frames)];
 let peaks=[0,0],clip=[0,0],rms=[0,0],dc=[0,0];
 for(let i=0;i<frames;i++)for(let ch=0;ch<2;ch++){
  const at=data.start+i*fmt.blockAlign+ch*(fmt.bits/8);
  let v;
  if(fmt.audioFormat===3)v=buffer.readFloatLE(at);
  else if(fmt.bits===16)v=buffer.readInt16LE(at)/32768;
  else {let x=buffer[at]|(buffer[at+1]<<8)|(buffer[at+2]<<16);
   if(x&0x800000)x-=0x1000000;v=x/8388608;}
  if(!Number.isFinite(v)||Math.abs(v)>16)throw fmtError("Invalid float samples");
  channels[ch][i]=v;peaks[ch]=Math.max(peaks[ch],Math.abs(v));
  rms[ch]+=v*v;dc[ch]+=v;if(Math.abs(v)>=0.999)clip[ch]++;
 }
 rms=rms.map(v=>Math.sqrt(v/frames));dc=dc.map(v=>v/frames);
 return Object.freeze({sampleRate:fmt.sampleRate,frames,channels,
  bits:fmt.bits,audioFormat:fmt.audioFormat,peaks,clippedFrames:clip,rms,dc,
  captureSha256:hash(buffer)});
}
function matchMarker(capture,markerChannel){
 const cfg=CALIBRATION_V536;
 const start=Math.round(cfg.markerSeconds[markerChannel]*cfg.sampleRate);
 const window=Math.round(cfg.sampleRate*cfg.markerDurationMs/1000);
 const maxDelay=Math.min(cfg.sampleRate,Math.max(0,capture.length-start-window));
 let best={score:0,delayFrames:null,signedGain:null};
 // Limit search to 1s positive delay. DAW recording must be exported from
 // the same session timeline (preserve leading silence).
 let src2=0;
 for(let tap=0;tap<window;tap+=7){const s=markerAt(start+tap,markerChannel);src2+=s*s;}
 for(let delay=0;delay<=maxDelay;delay+=4){
  let dot=0,cap2=0;
  for(let tap=0;tap<window;tap+=7){
   const s=markerAt(start+tap,markerChannel),x=capture[start+delay+tap];
   dot+=s*x;cap2+=x*x;
  }
  if(cap2<1e-5||!src2)continue;
  const score=Math.abs(dot)/Math.sqrt(src2*cap2);
  const gain=dot/src2;
  if(score>best.score&&Math.abs(gain)>=0.04)
   best={score,delayFrames:delay,signedGain:gain};
 }
 return best;
}
export function assessExternalCaptureV536(captureBuffer){
 const cap=parseCalibrationCaptureV536(captureBuffer);
 const matches=[
  [matchMarker(cap.channels[0],0),matchMarker(cap.channels[1],0)],
  [matchMarker(cap.channels[0],1),matchMarker(cap.channels[1],1)]
 ];
 const valid=(a,b)=>a.score>=0.78&&b.score>=0.78&&
  a.delayFrames!==null&&b.delayFrames!==null&&
  Math.abs(a.delayFrames-b.delayFrames)<=240;
 const normal=valid(matches[0][0],matches[1][1]);
 const swapped=valid(matches[0][1],matches[1][0]);
 const normScore=matches[0][0].score+matches[1][1].score;
 const swapScore=matches[0][1].score+matches[1][0].score;
 const order=normal&&(!swapped||normScore>swapScore+0.1)?"NORMAL":
  swapped&&(!normal||swapScore>normScore+0.1)?"SWAPPED":"UNCONFIRMED";
 const selected=order==="NORMAL"?[matches[0][0],matches[1][1]]:
  order==="SWAPPED"?[matches[0][1],matches[1][0]]:null;
 const latency=selected?Math.round(
  (selected[0].delayFrames+selected[1].delayFrames)/2)/cfgRate():null;
 const db=g=>g===null||g===0?null:20*Math.log10(Math.abs(g));
 return Object.freeze({
  kind:"RAW_EXTERNAL_CAPTURE_FILE_QA_V536",
  source:"IMPORTED_WAV_ONLY",sampleRate:cap.sampleRate,frames:cap.frames,
  captureSha256:cap.captureSha256,
  captureFormat:cap.audioFormat===1?"PCM"+cap.bits:"FLOAT32",
  channelOrder:order,estimatedLatencyMs:latency===null?null:latency*1000,
  polarity: selected?selected.map(x=>x.signedGain<0?"INVERTED":"NORMAL"):null,
  relativeGainDb:selected?selected.map(x=>db(x.signedGain)):null,
  matchedScore:selected?selected.map(x=>Number(x.score.toFixed(4))):null,
  peakDbfs:cap.peaks.map(db),rmsDbfs:cap.rms.map(db),
  dcOffset:cap.dc,clippedFrames:cap.clippedFrames,
  clippingDetected:cap.clippedFrames.some(x=>x>0),
  candidateRouteDetected:order!=="UNCONFIRMED",
  analogVerified:false,hardwareReadbackVerified:false,
  authorizedStudioCapture:false,billable:false,notMaster:true,
  warning:"WAV import confirms file contents only, NOT physical analog provenance."
 });
}
function cfgRate(){return CALIBRATION_V536.sampleRate;}
