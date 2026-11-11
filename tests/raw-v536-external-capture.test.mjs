import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {
 CALIBRATION_V536,createCalibrationWavV536,parseCalibrationCaptureV536,
 assessExternalCaptureV536
} from "../raw-v536-external-capture.mjs";
function writeStereoWav(left,right,{bits=24,float=false}={}){
 assert.equal(left.length,right.length);
 const frames=left.length,depth=float?4:bits/8,fmt=float?3:1;
 const b=Buffer.alloc(44+frames*2*depth);
 b.write("RIFF",0);b.writeUInt32LE(b.length-8,4);b.write("WAVEfmt ",8);
 b.writeUInt32LE(16,16);b.writeUInt16LE(fmt,20);b.writeUInt16LE(2,22);
 b.writeUInt32LE(48000,24);b.writeUInt32LE(48000*2*depth,28);
 b.writeUInt16LE(2*depth,32);b.writeUInt16LE(float?32:bits,34);
 b.write("data",36);b.writeUInt32LE(frames*2*depth,40);
 for(let i=0;i<frames;i++)for(let ch=0;ch<2;ch++){
  const x=[left,right][ch][i],p=44+(i*2+ch)*depth;
  if(float)b.writeFloatLE(x,p);
  else if(bits===16)b.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(x*32767))),p);
  else {
   const n=Math.max(-8388608,Math.min(8388607,Math.round(x*8388607)));
   b[p]=n&255;b[p+1]=(n>>8)&255;b[p+2]=(n>>16)&255;
  }
 }
 return b;
}
function captured({delay=0,gain=[1,1],swap=false,clipped=false,float=false}={}){
 const src=parseCalibrationCaptureV536(createCalibrationWavV536().wav);
 const frames=src.frames+delay,channels=[new Float32Array(frames),new Float32Array(frames)];
 for(let ch=0;ch<2;ch++){
  const inChannel=src.channels[swap?1-ch:ch];
  for(let i=0;i<src.frames;i++)
   channels[ch][i+delay]=inChannel[i]*gain[ch];
 }
 if(clipped)channels[0][Math.floor(frames/2)]=1;
 return writeStereoWav(channels[0],channels[1],{float});
}
test("V5.36: create safe low level stereo 48k 24-bit 6s source with SHA256",()=>{
 const r=createCalibrationWavV536();
 assert.equal(r.wav.length,44+48000*6*2*3);
 assert.equal(r.wav.toString("ascii",0,4),"RIFF");
 assert.equal(r.sha256,createHash("sha256").update(r.wav).digest("hex"));
 const p=parseCalibrationCaptureV536(r.wav);
 assert.equal(p.frames,6*48000);
 assert.equal(p.sampleRate,48000);
 assert.ok(p.peaks[0]<=0.101&&p.peaks[1]<=0.101);
 assert.equal(p.clippedFrames[0]+p.clippedFrames[1],0);
 assert.equal(r.analogCaptured,false);
});
test("V5.36: externally imported PCM capture identifies normal stereo 384-frame delay",()=>{
 const r=assessExternalCaptureV536(captured({delay:384,gain:[0.8,0.7]}));
 assert.equal(r.channelOrder,"NORMAL");
 assert.ok(Math.abs(r.estimatedLatencyMs-8)<0.5);
 assert.equal(r.candidateRouteDetected,true);
 assert.equal(r.analogVerified,false);
 assert.equal(r.hardwareReadbackVerified,false);
 assert.equal(r.billable,false);
 assert.equal(r.notMaster,true);
 assert.ok(r.relativeGainDb.every(x=>x<0));
});
test("V5.36: exported swapped channels are detected and not called analog verified",()=>{
 const r=assessExternalCaptureV536(captured({delay:240,swap:true}));
 assert.equal(r.channelOrder,"SWAPPED");
 assert.ok(Math.abs(r.estimatedLatencyMs-5)<0.5);
 assert.equal(r.analogVerified,false);
});
test("V5.36: silence has no fake loopback route and cannot unlock anything",()=>{
 const len=6*48000,z=new Float32Array(len);
 const r=assessExternalCaptureV536(writeStereoWav(z,z));
 assert.equal(r.channelOrder,"UNCONFIRMED");
 assert.equal(r.candidateRouteDetected,false);
 assert.equal(r.estimatedLatencyMs,null);
 assert.equal(r.analogVerified,false);
});
test("V5.36: clip detection works without approving hardware",()=>{
 const r=assessExternalCaptureV536(captured({clipped:true}));
 assert.equal(r.clippingDetected,true);
 assert.ok(r.clippedFrames[0]>0);
 assert.equal(r.billable,false);
});
test("V5.36: floated and 16bit captured WAV supported when DAW exports them",()=>{
 const src=parseCalibrationCaptureV536(createCalibrationWavV536().wav);
 for(const props of [{bits:16},{float:true}]){
  const capture=writeStereoWav(src.channels[0],src.channels[1],props);
  const r=assessExternalCaptureV536(capture);
  assert.equal(r.channelOrder,"NORMAL");
  assert.equal(r.analogVerified,false);
 }
});
test("V5.36: malformed, missing or wrong-channel WAV fails without physical proof",()=>{
 const src=createCalibrationWavV536().wav;
 const noRiff=Buffer.from(src);noRiff.write("FAKE",0);
 assert.throws(()=>parseCalibrationCaptureV536(noRiff),{code:"CALIBRATION_WAV_INVALID"});
 const badRate=Buffer.from(src);badRate.writeUInt32LE(44100,24);
 assert.throws(()=>parseCalibrationCaptureV536(badRate),{code:"CALIBRATION_WAV_INVALID"});
 const badChannels=Buffer.from(src);badChannels.writeUInt16LE(1,22);
 assert.throws(()=>parseCalibrationCaptureV536(badChannels),{code:"CALIBRATION_WAV_INVALID"});
});
test("V5.36: offline CLI is never an audio interface/physical device or Cloud endpoint",async()=>{
 const {readFileSync}=await import("node:fs");
 const script=readFileSync(new URL("../scripts/raw-v536-calibration-cli.mjs",import.meta.url),"utf8");
 assert.match(script,/flag:"wx"/);
 assert.match(script,/createCalibrationWavV536/);
 assert.match(script,/assessExternalCaptureV536/);
 assert.doesNotMatch(script,/WebSocket|firebase|stripe|easymidi|child_process|ffmpeg|spawn\(/i);
});
