/* RAW v5.43 acceptance input adapter.
 * Deterministic TRUE RIFF/PCM fixture, plus strict local WAV byte decoder.
 * The application still decodes user WAV through its own Web Audio UI path;
 * this Node adapter exists only for offline acceptance and never accesses gear.
 */
import {readFileSync} from "node:fs";

export const LIMIT_BYTES=128*1024*1024;
export const MAX_FRAMES=16000000;
const error=(code)=>{const e=new Error(code);e.code=code;throw e;};
const ascii=(bytes,start,len)=>String.fromCharCode(...bytes.subarray(start,start+len));
function validateSize(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<44||bytes.length>LIMIT_BYTES)
  error("RAW_V543_WAV_FILE_SIZE");
}
export function decodePcmWav(bytes){
 validateSize(bytes);
 const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(ascii(bytes,0,4)!=="RIFF"||ascii(bytes,8,4)!=="WAVE"||
    data.getUint32(4,true)!==bytes.length-8)error("RAW_V543_RIFF_HEADER");
 let position=12,format=null,pcm=null;
 while(position+8<=bytes.length){
  const id=ascii(bytes,position,4),length=data.getUint32(position+4,true);
  position+=8;
  if(length>bytes.length-position)error("RAW_V543_RIFF_CHUNK_LENGTH");
  if(id==="fmt "){
   if(format||length<16)error("RAW_V543_WAV_FMT");
   const codec=data.getUint16(position,true);
   format={
    codec,channels:data.getUint16(position+2,true),
    sampleRate:data.getUint32(position+4,true),
    byteRate:data.getUint32(position+8,true),
    align:data.getUint16(position+12,true),
    bits:data.getUint16(position+14,true)
   };
  }else if(id==="data"){
   if(pcm)error("RAW_V543_WAV_MULTIPLE_DATA_CHUNKS");
   pcm={offset:position,length};
  }
  position+=length+(length%2);
  if(position>bytes.length)error("RAW_V543_RIFF_PADDING");
 }
 if(!format||!pcm)error("RAW_V543_WAV_MISSING_PCM");
 const {codec,channels,sampleRate,align,bits,byteRate}=format;
 if(codec!==1||channels!==2||![16,24].includes(bits)||
    !Number.isSafeInteger(sampleRate)||sampleRate<8000||sampleRate>192000||
    align!==channels*bits/8||byteRate!==sampleRate*align)
  error("RAW_V543_WAV_UNSUPPORTED_FORMAT");
 if(pcm.length%align!==0)error("RAW_V543_WAV_FRAME_ALIGNMENT");
 const frames=pcm.length/align;
 if(!Number.isSafeInteger(frames)||frames<1||frames>MAX_FRAMES)
  error("RAW_V543_WAV_TOO_MANY_FRAMES");
 const samples=[new Float32Array(frames),new Float32Array(frames)];
 const scale=bits===16?32768:8388608,step=bits/8;
 for(let i=0;i<frames;i++)for(let c=0;c<2;c++){
  const start=pcm.offset+i*align+c*step;
  let signed;
  if(bits===16)signed=data.getInt16(start,true);
  else{
   const raw=bytes[start]|(bytes[start+1]<<8)|(bytes[start+2]<<16);
   signed=raw&0x800000?raw-0x1000000:raw;
  }
  samples[c][i]=signed/scale;
 }
 return Object.freeze({
  channels:samples,frames,sampleRate,bits,sourceBytes:bytes.length,
  numberOfChannels:2,length:frames,
  getChannelData:c=>samples[c],
  format:"RIFF_STEREO_PCM_NOT_COMPRESSED",
  decoder:"RAW_V543_NODE_ACCEPTANCE_ONLY"
 });
}
export function generateFixture({frames=60000,sampleRate=48000,bits=24}={}){
 if(!Number.isSafeInteger(frames)||frames<512||frames>120000||
    !Number.isSafeInteger(sampleRate)||sampleRate<8000||sampleRate>192000||
    ![16,24].includes(bits))error("RAW_V543_BAD_FIXTURE_OPTIONS");
 const align=2*bits/8;
 const bytes=new Uint8Array(44+frames*align);
 const view=new DataView(bytes.buffer);
 const word=(offset,text)=>{for(let i=0;i<text.length;i++)bytes[offset+i]=text.charCodeAt(i);};
 word(0,"RIFF");view.setUint32(4,bytes.length-8,true);word(8,"WAVE");
 word(12,"fmt ");view.setUint32(16,16,true);
 view.setUint16(20,1,true);view.setUint16(22,2,true);
 view.setUint32(24,sampleRate,true);
 view.setUint32(28,sampleRate*align,true);
 view.setUint16(32,align,true);view.setUint16(34,bits,true);
 word(36,"data");view.setUint32(40,frames*align,true);
 const max=(1<<(bits-1))-1,minimum=-(1<<(bits-1));
 for(let i=0;i<frames;i++){
  const t=i/sampleRate;
  const phase=i/(frames-1);
  const fade=Math.min(1,phase*50,(1-phase)*50);
  // Two independent test channels and varying envelope catch stereo, fades,
  // silence, DSP dynamics, and end-of-file errors without external samples.
  for(let c=0;c<2;c++){
   const amp=(.26+.13*Math.sin(2*Math.PI*.8*t))*fade;
   const low=Math.sin(2*Math.PI*(c===0?220:330)*t);
   const high=Math.sin(2*Math.PI*(c===0?2300:3100)*t);
   const value=Math.max(minimum,Math.min(max,Math.round((low*.78+high*.22)*amp*(max+1))));
   const pos=44+i*align+c*bits/8;
   bytes[pos]=value&255;bytes[pos+1]=(value>>8)&255;
   if(bits===24)bytes[pos+2]=(value>>16)&255;
  }
 }
 return bytes;
}
export function loadLocalWav(path){
 const bytes=readFileSync(path);
 return {bytes,decoded:decodePcmWav(bytes)};
}
