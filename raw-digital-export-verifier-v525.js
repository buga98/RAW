/* RAW V5.25 — independent, OFFLINE comparison of a downloaded digital WAV and QC JSON.
 * This checks byte integrity only: a user-editable JSON is NOT a signature or an
 * authenticated artifact, and passing does NOT prove an analog/mastering capture.
 */
(function(global){
"use strict";
const MAX_WAV=128*1024*1024,MAX_QC=512*1024;
const HASH=/^[0-9a-f]{64}$/;
function fail(code,message){const error=new Error(message);error.code=code;throw error;}
function header(data,total){
 if(!(data instanceof Uint8Array)||data.byteLength!==44||!Number.isSafeInteger(total))
  fail("WAV_HEADER","Missing canonical RAW PCM WAV header");
 const v=new DataView(data.buffer,data.byteOffset,data.byteLength);
 const ascii=(off,count)=>String.fromCharCode(...data.subarray(off,off+count));
 if(ascii(0,4)!=="RIFF"||ascii(8,4)!=="WAVE"||ascii(12,4)!=="fmt "||
    ascii(36,4)!=="data"||v.getUint32(16,true)!==16||
    v.getUint16(20,true)!==1||v.getUint32(4,true)!==total-8||
    v.getUint32(40,true)!==total-44)
  fail("WAV_HEADER","WAV RIFF/fmt/data layout or lengths are invalid");
 const channels=v.getUint16(22,true),bits=v.getUint16(34,true),
  sampleRate=v.getUint32(24,true),align=channels*bits/8;
 if(channels!==2||![16,24].includes(bits)||sampleRate<8000||sampleRate>192000||
    v.getUint16(32,true)!==align||v.getUint32(28,true)!==sampleRate*align||
    (total-44)%align!==0||(total-44)/align<1)
  fail("WAV_FORMAT","Expected complete stereo 16/24-bit PCM WAV, 8–192 kHz");
 return Object.freeze({channels,bits,sampleRate,frames:(total-44)/align,bytes:total});
}
const hex=buffer=>Array.from(new Uint8Array(buffer),v=>v.toString(16).padStart(2,"0")).join("");
function validateReceipt(qc,wav,sha){
 if(!qc||typeof qc!=="object"||Array.isArray(qc)||
    qc.kind!=="RAW_LOCAL_DIGITAL_QC_V510"||
    qc.localDigitalOnly!==true||qc.analogCaptured!==false||
    qc.physicalReadback!==false||qc.hardwareProcessed!==false||
    qc.verifiedAnalogMaster!==false||qc.masterAvailable!==false||
    qc.downloadAllowed!==true||!["PASS","REVIEW"].includes(qc.overall))
  fail("QC_UNTRUSTED","Expected an accepted LOCAL DIGITAL QC receipt");
 if(!HASH.test(qc.sha256||"")||qc.sha256!==sha)
  fail("SHA256_MISMATCH","Downloaded WAV SHA-256 does not match QC JSON");
 if(qc.outputBytes!==wav.bytes||qc.bits!==wav.bits||
    qc.sampleRate!==wav.sampleRate||qc.frames!==wav.frames||
    qc.channels!==wav.channels||qc.settings?.bits!==wav.bits)
  fail("QC_MISMATCH","WAV header/frame count does not match QC receipt");
 const handoff=qc.deliveryHandoff;
 if(!handoff||handoff.kind!=="RAW_LOCAL_DIGITAL_HANDOFF_V521"||
    handoff.downloadAllowed!==true||handoff.readiness==="BLOCKED"||
    handoff.sha256!==sha||handoff.bits!==wav.bits||
    handoff.sampleRate!==wav.sampleRate||
    handoff.analogCaptured!==false||handoff.hardwareProcessed!==false||
    handoff.verifiedAnalogMaster!==false||handoff.platformCertified!==false)
  fail("HANDOFF_MISMATCH","Local digital handoff profile is missing or mismatched");
 if(handoff.id==="pcm16"&&wav.bits!==16||
    handoff.id==="archive24"&&wav.bits!==24||
    !["custom","pcm16","archive24"].includes(handoff.id))
  fail("HANDOFF_MISMATCH","PCM handoff profile does not match downloaded WAV");
 return handoff;
}
async function verifyFiles({wavFile,qcFile,cryptoRef=global.crypto}={}){
 if(!wavFile||typeof wavFile.arrayBuffer!=="function"||
    typeof wavFile.slice!=="function"||!Number.isSafeInteger(wavFile.size)||
    wavFile.size<46||wavFile.size>MAX_WAV)
  fail("WAV_SIZE","Choose one downloaded digital WAV (max 128 MiB)");
 if(!qcFile||typeof qcFile.text!=="function"||
    !Number.isSafeInteger(qcFile.size)||qcFile.size<2||qcFile.size>MAX_QC)
  fail("QC_SIZE","Choose its QC JSON (max 512 KiB)");
 if(!cryptoRef?.subtle?.digest)
  fail("CRYPTO_MISSING","Local SHA-256 API unavailable");
 const head=new Uint8Array(await wavFile.slice(0,44).arrayBuffer());
 const wav=header(head,wavFile.size);
 let qc;
 try{qc=JSON.parse(await qcFile.text());}
 catch{fail("QC_JSON","QC report is not valid JSON");}
 const bytes=await wavFile.arrayBuffer();
 if(bytes.byteLength!==wavFile.size)fail("WAV_CHANGED","WAV length changed during reading");
 const sha=hex(await cryptoRef.subtle.digest("SHA-256",bytes));
 const handoff=validateReceipt(qc,wav,sha);
 return Object.freeze({
  kind:"RAW_LOCAL_EXPORT_VERIFIED_V525",result:"MATCH",
  sha256:sha,bytes:wav.bytes,frames:wav.frames,
  sampleRate:wav.sampleRate,bits:wav.bits,channels:wav.channels,
  qcStatus:qc.overall,profile:handoff.id,
  integrityVerified:true,identityAuthenticated:false,
  qcCryptographicallySigned:false,localDigitalOnly:true,
  analogCaptured:false,hardwareProcessed:false,verifiedAnalogMaster:false,
  certifiedTruePeak:false,platformCertified:false
 });
}
global.RAWDigitalExportVerifierV525=Object.freeze({
 verifyFiles,header,validateReceipt,MAX_WAV,MAX_QC
});
})(typeof window!=="undefined"?window:globalThis);
