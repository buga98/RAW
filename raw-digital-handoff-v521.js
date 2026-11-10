/* RAW V5.21 — offline DIGITAL PCM handoff profiles, not platform certifications.
 * Preserve original decoded sample rate; no fake "CD 44.1k" or platform LUFS.
 * Existing SHA-verified digital QC is mandatory. No analog/hardware access.
 */
(function(global){
"use strict";
const PROFILES=Object.freeze([
 Object.freeze({
  id:"custom",label:"CUSTOM · ručne postavke",bits:null,ceilingDb:null,
  description:"Korisnik odabire PCM dubinu i sample-peak ceiling; bez tvrdnje o isporuci."
 }),
 Object.freeze({
  id:"archive24",label:"STUDIO ARCHIVE · 24-bit WAV",bits:24,ceilingDb:-1,
  description:"24-bit PCM, izvorni sample rate, TPDF dither i sample-peak kontrola; nije standardna potvrda."
 }),
 Object.freeze({
  id:"pcm16",label:"DIGITAL PCM · 16-bit WAV",bits:16,ceilingDb:-1,
  description:"16-bit PCM, izvorni sample rate i TPDF dither; nije automatski CD master (44.1 kHz)."
 })
]);
const fail=(code,msg)=>{const e=new Error(msg);e.code=code;throw e;};
function byId(id){
 const item=PROFILES.find(x=>x.id===id);
 if(!item)fail("PROFILE_UNKNOWN","Unrecognized offline digital export profile");
 return item;
}
function apply(id,settings,codec=global.RAWDigitalPremasterV59){
 const preset=byId(id);
 if(!codec?.settingsOf)fail("DSP_UNAVAILABLE","Digital mastering settings are required");
 const current=codec.settingsOf(settings);
 if(id==="custom")return current;
 return codec.settingsOf({...current,bits:preset.bits,
  ceilingDb:preset.ceilingDb,dither:true});
}
function evaluate({id="custom",result,qc}={}){
 const profile=byId(id);
 if(!result||result.kind!=="RAW_LOCAL_DIGITAL_PREMASTER_V59"||
    result.hardwareProcessed!==false||result.verifiedAnalogMaster!==false||
    result.analogCaptured!==false||result.masterAvailable!==false||
    !result.settings||!qc||qc.kind!=="RAW_LOCAL_DIGITAL_QC_V510"||
    qc.hardwareProcessed!==false||qc.verifiedAnalogMaster!==false||
    !/^[0-9a-f]{64}$/.test(qc.sha256||"")||
    !Number.isSafeInteger(result.sampleRate)||!Number.isSafeInteger(result.frames)||
    result.sampleRate!==qc.sampleRate||result.frames!==qc.frames||
    result.outputBits!==qc.bits||result.outputBits!==result.settings.bits||
    qc.outputBytes!==result.byteLength)
  fail("UNVERIFIED_PCM","Verified local digital WAV and matching SHA-256 QC are required");
 const reasons=[],notes=[];
 if(qc.downloadAllowed!==true||qc.overall==="FAIL"){
  reasons.push("Digital QC failed or blocked this WAV");
 }
 if(profile.bits!==null&&result.outputBits!==profile.bits)
  reasons.push("Bit depth does not match the selected PCM profile");
 if(profile.ceilingDb!==null&&
    Math.abs(result.settings.ceilingDb-profile.ceilingDb)>0.0001)
  reasons.push("Sample-peak ceiling differs from the selected PCM profile");
 if(profile.bits!==null&&result.outputDither!==true)
  reasons.push("Selected PCM profile expects TPDF dither");
 if(result.outputMeter?.clippedFrames>0)
  reasons.push("Sample clipping cannot be accepted");
 if(qc.overall==="REVIEW")notes.push("Digital QC has review flags");
 const tp=qc.intersamplePeakEstimate?.output?.estimatedTruePeakDbtp;
 if(typeof tp==="number"&&Number.isFinite(tp)&&
    tp>result.settings.ceilingDb+0.1)
  notes.push("Estimated 4x intersample peak exceeds the chosen ceiling; NOT certified true peak");
 if(result.sampleRate!==44100)
  notes.push("Preserves input sample rate "+result.sampleRate+" Hz; NOT a 44.1 kHz CD audio master");
 notes.push("LUFS and 4x intersample estimates lack external reference certification");
 notes.push("NO platform compliance or analog hardware delivery claim");
 const readiness=reasons.length?"BLOCKED":notes.length?"REVIEW":"READY";
 return Object.freeze({
  kind:"RAW_LOCAL_DIGITAL_HANDOFF_V521",
  id:profile.id,label:profile.label,description:profile.description,
  readiness,downloadAllowed:reasons.length===0,
  reasons:Object.freeze(reasons),notes:Object.freeze(notes),
  bits:result.outputBits,sampleRate:result.sampleRate,
  sha256:qc.sha256,integrityVerified:true,
  sampleRateConverted:false,loudnessTargetEnforced:false,
  certifiedTruePeakLimited:false,platformCertified:false,
  analogCaptured:false,hardwareProcessed:false,verifiedAnalogMaster:false
 });
}
function outputFilename(sourceName,id="custom",codec=global.RAWDigitalPremasterV59){
 const profile=byId(id);
 if(typeof codec?.safeFilename!=="function")fail("DSP_UNAVAILABLE","Safe WAV naming unavailable");
 const name=codec.safeFilename(sourceName);
 if(profile.id==="custom")return name;
 const tag=profile.id==="archive24"?"_STUDIO_ARCHIVE_24":"_DIGITAL_PCM_16";
 return name.replace(/\.wav$/i,tag+".wav");
}
global.RAWDigitalHandoffV521=Object.freeze({PROFILES,byId,apply,evaluate,outputFilename});
})(typeof window!=="undefined"?window:globalThis);
