/* RAW Local Print V1 — offline-only export of the selected SOURCE waveform region.
 * Explicitly NOT a studio print, analog master, Web Audio EQ bounce, or hardware readback.
 * Never uses a network request or a physical-device control command. */
(function(global){
"use strict";
const MAX_SOURCE_BYTES=128*1024*1024;
const MAX_WAV_BYTES=256*1024*1024;
const CHUNK_FRAMES=32768;
function fail(code,detail){const e=new Error(detail);e.code=code;throw e;}
function safeName(name){
 const root=String(name||"audio").replace(/\.[^.]+$/,"").normalize("NFKC")
   .replace(/[^\p{L}\p{N}._-]+/gu,"_").replace(/^\.+/,"").replace(/_+/g,"_").slice(0,64);
 const clean=root&& !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(root)?root:"audio";
 return clean+"_LOCAL_SOURCE_REGION.wav";
}
function validateBuffer(audio){
 if(!audio||!Number.isSafeInteger(audio.length)||audio.length<=0||
    !Number.isSafeInteger(audio.sampleRate)||audio.sampleRate<8000||audio.sampleRate>192000||
    ![1,2].includes(audio.numberOfChannels)||typeof audio.getChannelData!=="function")
   fail("INVALID_AUDIO","Expected mono/stereo decoded AudioBuffer at 8–192 kHz");
 const channels=[];
 for(let i=0;i<audio.numberOfChannels;i++){
  const data=audio.getChannelData(i);
  if(!(data instanceof Float32Array)||data.length!==audio.length)
   fail("INVALID_AUDIO","Decoded channel data has an invalid length");
  channels.push(data);
 }
 return channels;
}
function encodeWav(audio,{start=0,end=null,bits=24}={}){
 const channels=validateBuffer(audio),rate=audio.sampleRate,total=audio.length;
 if(bits!==16&&bits!==24)fail("INVALID_BITS","Only 16-bit and 24-bit PCM WAV supported");
 const stop=end===null?total/rate:end;
 if(typeof start!=="number"||typeof stop!=="number"||
   !Number.isFinite(start)||!Number.isFinite(stop)||
   start<0||stop>total/rate+1/rate||stop<=start)
  fail("INVALID_REGION","Region boundaries must fit within the source file");
 const first=Math.min(total,Math.round(start*rate));
 const last=Math.min(total,Math.round(stop*rate));
 const frames=last-first,blockAlign=channels.length*(bits/8);
 if(frames<=0)fail("EMPTY_REGION","The region does not contain an audio sample");
 const pcmBytes=frames*blockAlign,wavBytes=44+pcmBytes;
 if(!Number.isSafeInteger(wavBytes)||wavBytes>MAX_WAV_BYTES)
  fail("EXPORT_TOO_LARGE","Selected region exceeds 256 MiB WAV export limit");
 const header=new Uint8Array(44),h=new DataView(header.buffer);
 const ascii=(off,txt)=>{for(let n=0;n<txt.length;n++)header[off+n]=txt.charCodeAt(n);};
 ascii(0,"RIFF");h.setUint32(4,36+pcmBytes,true);ascii(8,"WAVE");
 ascii(12,"fmt ");h.setUint32(16,16,true);h.setUint16(20,1,true);
 h.setUint16(22,channels.length,true);h.setUint32(24,rate,true);
 h.setUint32(28,rate*blockAlign,true);h.setUint16(32,blockAlign,true);
 h.setUint16(34,bits,true);ascii(36,"data");h.setUint32(40,pcmBytes,true);
 const chunks=[header];
 for(let offset=first;offset<last;offset+=CHUNK_FRAMES){
  const endFrame=Math.min(last,offset+CHUNK_FRAMES),size=(endFrame-offset)*blockAlign;
  const pcm=new Uint8Array(size);let pos=0;
  for(let i=offset;i<endFrame;i++){
   for(const samples of channels){
    const raw=samples[i],v=Number.isFinite(raw)?Math.max(-1,Math.min(1,raw)):0;
    if(bits===16){
     const n=v<0?Math.round(v*32768):Math.round(v*32767);
     pcm[pos++]=n&255;pcm[pos++]=(n>>8)&255;
    }else{
     const n=v<0?Math.round(v*8388608):Math.round(v*8388607);
     pcm[pos++]=n&255;pcm[pos++]=(n>>8)&255;pcm[pos++]=(n>>16)&255;
    }
   }
  }
  chunks.push(pcm);
 }
 return {
  chunks,byteLength:wavBytes,frames,channels:channels.length,sampleRate:rate,bits,
  startFrame:first,endFrame:last,
  kind:"LOCAL_SOURCE_REGION",hardwareProcessed:false,analogVerified:false,
  resultLabel:"Local decoded source region — not an analog master"
 };
}
async function decodeFile(file,AudioContextCtor){
 if(!file||typeof file.arrayBuffer!=="function"||!Number.isSafeInteger(file.size)||
    file.size<1||file.size>MAX_SOURCE_BYTES)
  fail("SOURCE_TOO_LARGE","Choose a local audio file of at most 128 MiB");
 if(!/\.(wav|wave|aif|aiff|mp3)$/i.test(String(file.name||"")))
  fail("UNSUPPORTED_SOURCE","Choose WAV, AIFF, or MP3");
 if(typeof AudioContextCtor!=="function")fail("NO_AUDIO_DECODER","AudioContext not available");
 let ctx;
 try{
  ctx=new AudioContextCtor();
  const buffer=await file.arrayBuffer();
  if(buffer.byteLength!==file.size)fail("SOURCE_CHANGED","File length changed while reading");
  return await ctx.decodeAudioData(buffer);
 }catch(e){
  if(e.code)throw e;
  fail("DECODE_FAILED","Unable to decode local audio file: "+String(e.message||"unknown"));
 }finally{
  try{await ctx?.close();}catch{}
 }
}
async function createExport(file,{start=0,end=null,bits=24}={},AudioContextCtor=global.AudioContext||global.webkitAudioContext){
 const decoded=await decodeFile(file,AudioContextCtor);
 const encoded=encodeWav(decoded,{start,end,bits});
 const blob=new Blob(encoded.chunks,{type:"audio/wav"});
 if(blob.size!==encoded.byteLength)fail("ENCODE_FAILED","PCM size mismatch");
 return {blob,filename:safeName(file.name),
  manifest:{version:1,kind:"LOCAL_SOURCE_REGION",origin:String(file.name||"audio").slice(0,150),
   filename:safeName(file.name),sampleRate:encoded.sampleRate,channels:encoded.channels,
   bits:encoded.bits,startFrame:encoded.startFrame,endFrame:encoded.endFrame,
   frames:encoded.frames,bytes:encoded.byteLength,
   hardwareProcessed:false,analogVerified:false,
   label:"UNPROCESSED SOURCE REGION · NOT ANALOG MASTER"}};
}
function download(result,documentRef=global.document,urlRef=global.URL){
 if(!result?.blob||!result?.filename||!documentRef||!urlRef?.createObjectURL)
  fail("DOWNLOAD_UNAVAILABLE","File download is unavailable");
 const url=urlRef.createObjectURL(result.blob);
 const anchor=documentRef.createElement("a");
 anchor.href=url;anchor.download=result.filename;anchor.hidden=true;
 documentRef.body.append(anchor);
 try{anchor.click();}finally{
  anchor.remove();
  // Delay revocation so the desktop download handler can take ownership.
  global.setTimeout(()=>urlRef.revokeObjectURL(url),30000);
 }
}
global.RAWLocalPrintV1={encodeWav,createExport,download,safeName,
 MAX_SOURCE_BYTES,MAX_WAV_BYTES};
})(typeof window!=="undefined"?window:globalThis);
