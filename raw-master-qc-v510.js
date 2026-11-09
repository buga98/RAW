/* RAW V5.10 — locally verified digital WAV QC receipt.
 * The SHA-256 and WAV structure are real measurements; level checks are
 * sample-peak/RMS ONLY, never certified LUFS, true-peak or analog mastering.
 * No network, filesystem, session, billing, hardware or production delivery.
 */
(function(global){
"use strict";
const MAX=128*1024*1024;
const fail=(code,msg)=>{const e=new Error(msg);e.code=code;throw e;};
const finite=n=>typeof n==="number"&&Number.isFinite(n);
const hex=a=>Array.from(new Uint8Array(a),v=>v.toString(16).padStart(2,"0")).join("");
function wavHeader(bytes,length){
 if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<44||!Number.isSafeInteger(length))
  fail("WAV_HEADER","Missing digital WAV header");
 const b=new Uint8Array(bytes),v=new DataView(bytes);
 const ascii=(start,n)=>String.fromCharCode(...b.subarray(start,start+n));
 if(ascii(0,4)!=="RIFF"||ascii(8,4)!=="WAVE"||
    ascii(12,4)!=="fmt "||ascii(36,4)!=="data"||
    v.getUint32(16,true)!==16||v.getUint16(20,true)!==1||
    v.getUint32(4,true)!==length-8||
    v.getUint32(40,true)!==length-44)
  fail("WAV_HEADER","WAV header or bytes invalid");
 const channels=v.getUint16(22,true),rate=v.getUint32(24,true),
  bits=v.getUint16(34,true),alignment=channels*bits/8;
 if(channels!==2||![16,24].includes(bits)||rate<8000||rate>192000||
    v.getUint16(32,true)!==alignment||
    v.getUint32(28,true)!==rate*alignment||
    (length-44)%alignment!==0)
  fail("WAV_HEADER","Unsupported or corrupted stereo PCM WAV format");
 return {channels,rate,bits,frames:(length-44)/alignment};
}
async function inspect({result,blob,sourceName="",cryptoRef=global.crypto,
 now=()=>new Date().toISOString()}={}){
 if(result?.kind!=="RAW_LOCAL_DIGITAL_PREMASTER_V59"||
    result.hardwareProcessed!==false||result.analogCaptured!==false||
    result.physicalReadback!==false||result.verifiedAnalogMaster!==false||
    result.masterAvailable!==false||result.digitalWavAvailable!==true||
    !Number.isSafeInteger(result.frames)||result.frames<1||
    !Number.isSafeInteger(result.sampleRate)||!Number.isSafeInteger(result.outputBits)||
    !result.settings||!result.inputMeter||!result.outputMeter||
    !finite(result.settings.ceilingDb)||
    !cryptoRef?.subtle?.digest||typeof now!=="function")
  fail("UNTRUSTED_DIGITAL_OUTPUT","Expected isolated V5.9 digital DSP output");
 if(!blob||!Number.isSafeInteger(blob.size)||blob.size<46||blob.size>MAX||
    typeof blob.slice!=="function"||typeof blob.arrayBuffer!=="function"||
    blob.size!==result.byteLength)
  fail("DIGITAL_FILE_INVALID","Missing or incomplete local digital WAV");
 const header=wavHeader(await blob.slice(0,44).arrayBuffer(),blob.size);
 if(header.frames!==result.frames||header.rate!==result.sampleRate||
    header.bits!==result.outputBits)
  fail("WAV_MISMATCH","WAV format does not match digital PCM receipt");
 const bytes=await blob.arrayBuffer();
 if(bytes.byteLength!==blob.size)fail("WAV_MISMATCH","Digital WAV data length changed");
 const sha256=hex(await cryptoRef.subtle.digest("SHA-256",bytes));
 if(!/^[a-f0-9]{64}$/.test(sha256))fail("HASH_INVALID","WAV checksum failed");
 const input=result.inputMeter,output=result.outputMeter;
 const diagnostics=[];
 const add=(code,status,description)=>diagnostics.push(Object.freeze({code,status,description}));
 const measured=output.peakDbfs;
 const ceiling=result.settings.ceilingDb;
 if((measured!==null&&!finite(measured))||
    !Number.isSafeInteger(output.clippedFrames)||output.clippedFrames<0)
  fail("METER_INVALID","Untrusted digital meter data");
 if(measured!==null&&measured>ceiling+0.015)
  add("OUTPUT_OVER_CEILING","FAIL","Sample peak exceeds selected digital sample ceiling");
 else add("SAMPLE_PEAK_CEILING","PASS","Digital PCM sample peak does not exceed selected ceiling");
 if(output.clippedFrames>0)
  add("OUTPUT_CLIPPING","FAIL","Output PCM contains samples at or above full scale");
 else add("NO_OUTPUT_SAMPLE_CLIPPING","PASS","No sample-frame clipping detected");
 if(input.clippedFrames>0)
  add("SOURCE_CLIPPING","REVIEW","Source contains at least one clipped PCM sample frame");
 if(output.rmsDbfs===null||!finite(output.rmsDbfs)||output.rmsDbfs<-60)
  add("QUIET_OUTPUT","REVIEW","Output appears extremely quiet; verify input and settings");
 if(Array.isArray(output.dcOffset)&&
    output.dcOffset.some(value=>finite(value)&&Math.abs(value)>0.01))
  add("DC_OFFSET","REVIEW","Substantial channel DC offset; verify source and filter");
 if(finite(output.correlation)&&output.correlation<-.25)
  add("NEGATIVE_STEREO_CORRELATION","REVIEW","Negative stereo correlation; inspect mono compatibility");
 if(Array.isArray(output.channelRmsDbfs)&&output.channelRmsDbfs.length===2&&
    output.channelRmsDbfs.every(finite)&&
    Math.abs(output.channelRmsDbfs[0]-output.channelRmsDbfs[1])>4)
  add("STEREO_IMBALANCE","REVIEW","Left/right channel RMS difference exceeds 4 dB");
 const overall=diagnostics.some(x=>x.status==="FAIL")?"FAIL":
  diagnostics.some(x=>x.status==="REVIEW")?"REVIEW":"PASS";
 const sanitizedName=String(sourceName||"original source").slice(0,120);
 return Object.freeze({
  kind:"RAW_LOCAL_DIGITAL_QC_V510",version:1,
  createdAt:String(now()).slice(0,64),sourceName:sanitizedName,
  outputBytes:blob.size,sha256,sampleRate:header.rate,
  frames:header.frames,bits:header.bits,channels:header.channels,
  settings:Object.freeze({...result.settings}),
  inputMeter:input,outputMeter:output,
  peakSafetyAttenuationDb:result.peakSafetyAttenuationDb,
  maxCompressorReductionDb:result.maxCompressorReductionDb,
  diagnostics:Object.freeze(diagnostics),overall,
  downloadAllowed:overall!=="FAIL",
  measurementBasis:"SAMPLE_PEAK_AND_UNWEIGHTED_RMS_NOT_LUFS_OR_TRUE_PEAK",
  localDigitalOnly:true,analogCaptured:false,physicalReadback:false,
  hardwareProcessed:false,verifiedAnalogMaster:false,
  masterAvailable:false,billingTouched:false
 });
}
function jsonFileName(name){
 const stem=global.RAWDigitalPremasterV59?.safeFilename?.(name)||
  "RAW_DIGITAL_PREMASTER_V59.wav";
 return stem.replace(/\.wav$/i,"_QC_V510.json");
}
global.RAWMasterQCV510=Object.freeze({inspect,jsonFileName});
})(typeof window!=="undefined"?window:globalThis);
