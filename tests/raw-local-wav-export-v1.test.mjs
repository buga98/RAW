import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const code=readFileSync(new URL("../raw-local-wav-export-v1.js",import.meta.url),"utf8");
function library(){
 const context={Float32Array,Uint8Array,DataView,Blob,setTimeout:()=>{},window:{}};
 vm.runInNewContext(code,context);
 return context.window.RAWLocalPrintV1;
}
function audio(data,{sampleRate=48000}={}){
 const channels=data.map(ch=>Float32Array.from(ch));
 return {sampleRate,numberOfChannels:channels.length,length:channels[0].length,
  getChannelData:i=>channels[i]};
}
const wav=(result)=>Buffer.concat(result.chunks.map(c=>Buffer.from(c)));
test("mono 24-bit RIFF/WAVE header and exact PCM frames",()=>{
 const lib=library();
 const result=lib.encodeWav(audio([[-1,0,1,0.5]],{sampleRate:48000}));
 const bytes=wav(result);
 assert.equal(bytes.toString("ascii",0,4),"RIFF");
 assert.equal(bytes.readUInt32LE(4),bytes.length-8);
 assert.equal(bytes.toString("ascii",8,12),"WAVE");
 assert.equal(bytes.toString("ascii",12,16),"fmt ");
 assert.equal(bytes.readUInt16LE(20),1);
 assert.equal(bytes.readUInt16LE(22),1);
 assert.equal(bytes.readUInt32LE(24),48000);
 assert.equal(bytes.readUInt32LE(28),48000*3);
 assert.equal(bytes.readUInt16LE(32),3);
 assert.equal(bytes.readUInt16LE(34),24);
 assert.equal(bytes.toString("ascii",36,40),"data");
 assert.equal(bytes.readUInt32LE(40),12);
 assert.equal(bytes.length,56);
 assert.deepEqual([...bytes.subarray(44,47)],[0,0,128]); // min -1
 assert.deepEqual([...bytes.subarray(47,50)],[0,0,0]);
 assert.deepEqual([...bytes.subarray(50,53)],[255,255,127]); // max +1
 assert.equal(result.hardwareProcessed,false);
 assert.equal(result.analogVerified,false);
});
test("stereo 16-bit interleave and preserve both channels",()=>{
 const res=library().encodeWav(audio([[1,0,-1],[0,-1,1]],{sampleRate:44100}),{bits:16});
 const b=wav(res);
 assert.equal(b.readUInt16LE(22),2);
 assert.equal(b.readUInt16LE(34),16);
 assert.equal(b.readUInt16LE(32),4);
 assert.equal(b.readUInt32LE(28),44100*4);
 assert.deepEqual(Array.from({length:6},(_,i)=>b.readInt16LE(44+2*i)),
  [32767,0,0,-32768,-32768,32767]);
});
test("sample-accurate region boundaries and length",()=>{
 const src=audio([Array.from({length:1000},(_,i)=>i/1000)],{sampleRate:10000});
 const res=library().encodeWav(src,{start:.021,end:.046,bits:24});
 assert.equal(res.startFrame,210);
 assert.equal(res.endFrame,460);
 assert.equal(res.frames,250);
 assert.equal(res.byteLength,44+250*3);
});
test("zero and invalid region are rejected",()=>{
 const src=audio([[0,1,0]],{sampleRate:48000}),lib=library();
 for(const option of [
  {start:2,end:3},{start:-1,end:0},{start:0,end:0},{start:NaN,end:1},
  {start:1/48000,end:1/48000},{start:0,end:Infinity}
 ])assert.throws(()=>lib.encodeWav(src,option));
});
test("only 16/24-bit output and mono/stereo decoded data are accepted",()=>{
 const lib=library();
 assert.throws(()=>lib.encodeWav(audio([[0]]),{bits:32}),e=>e.code==="INVALID_BITS");
 assert.throws(()=>lib.encodeWav(audio([[0],[0],[0]])),e=>e.code==="INVALID_AUDIO");
 assert.throws(()=>lib.encodeWav({sampleRate:48000,length:1,numberOfChannels:1,getChannelData:()=>[0]}),
  e=>e.code==="INVALID_AUDIO");
});
test("non-finite/clipped samples encoded safely",()=>{
 const src=audio([[2,-2,NaN,Infinity]],{sampleRate:48000});
 const res=library().encodeWav(src,{bits:16}),out=wav(res);
 assert.deepEqual(Array.from({length:4},(_,i)=>out.readInt16LE(44+2*i)),[32767,-32768,0,0]);
});
test("safe Windows filenames never contain path separators or reserved names",()=>{
 const safe=library().safeName;
 for(const input of ["../CON.wav","C:\\\\Windows\\\\SYSTEM32.mp3","<evil>???.wav","..\\x.wav","NUL.mp3"]){
  const result=safe(input);
  assert.match(result,/_LOCAL_SOURCE_REGION\.wav$/);
  assert.doesNotMatch(result,/[\\/:*?"<>|]/);
  assert.equal(result.startsWith("."),false);
 }
});
test("local file decode closes context, yields downloadable WAV with honest manifest",async()=>{
 const lib=library();
 let closed=false;
 class FakeAudioContext{
  async decodeAudioData(data){assert.equal(data.byteLength,4);return audio([[0,1,-1]],{sampleRate:48000});}
  async close(){closed=true;}
 }
 const file={name:"Vokal 1.wav",size:4,async arrayBuffer(){return new Uint8Array(4).buffer;}};
 const result=await lib.createExport(file,{bits:24},FakeAudioContext);
 assert.equal(closed,true);
 assert.equal(result.blob.size,44+9);
 assert.equal(result.manifest.hardwareProcessed,false);
 assert.equal(result.manifest.analogVerified,false);
 assert.equal(result.manifest.kind,"LOCAL_SOURCE_REGION");
 assert.equal(result.filename,"Vokal_1_LOCAL_SOURCE_REGION.wav");
});
test("unsupported or oversized input blocked before decoder",async()=>{
 const lib=library();
 const huge={name:"audio.wav",size:129*1024*1024,async arrayBuffer(){throw Error("must not read")}};
 await assert.rejects(()=>lib.createExport(huge),e=>e.code==="SOURCE_TOO_LARGE");
 const weird={name:"audio.exe",size:4,async arrayBuffer(){throw Error("must not read")}};
 await assert.rejects(()=>lib.createExport(weird),e=>e.code==="UNSUPPORTED_SOURCE");
});
test("file length mismatch and corrupt decoder return predictable failures",async()=>{
 const lib=library();
 class BrokenContext{
  async decodeAudioData(){throw Error("not a wave");}
  async close(){}
 }
 const file={name:"broken.wav",size:4,async arrayBuffer(){return new Uint8Array(4).buffer;}};
 await assert.rejects(()=>lib.createExport(file,{},BrokenContext),e=>e.code==="DECODE_FAILED");
});
