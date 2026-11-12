#!/usr/bin/env node
/* RAW v5.43 Mastering Acceptance Suite.
 * Exercises real shipped LOCAL DIGITAL DSP, EQ/comp model snapshots, portable
 * project, QC SHA256, delivery handoff and downloaded WAV verifier end-to-end.
 * This NEVER accesses real analog hardware, devices, network, studio, auth,
 * booking, billing, or installed Electron GUI. Synthetic input is real RIFF PCM.
 */
import {readFileSync,writeFileSync,mkdirSync,rmSync,existsSync} from "node:fs";
import {resolve,join,dirname,basename} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath,pathToFileURL} from "node:url";
import {createHash,webcrypto} from "node:crypto";
import {File,Blob} from "node:buffer";
import vm from "node:vm";
import assert from "node:assert/strict";
import {generateFixture,decodePcmWav,loadLocalWav} from "./raw-v543-wav-io.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const modules=[
 "bettermaker-engine-v3.js","bettermaker-manual-v4.js",
 "ngbuscomp-control-v1.js","ngtubecomp-control-v1.js",
 "raw-chain-archive-v1.js","raw-chain-recall-planner-v2.js",
 "raw-portable-project-v1.js",
 "raw-digital-limiter-v522.js","raw-digital-premaster-v59.js",
 "raw-master-qc-v510.js","raw-digital-handoff-v521.js",
 "raw-digital-export-verifier-v525.js"
];
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const safe=x=>JSON.parse(JSON.stringify(x));
function loadRuntime(){
 const window={crypto:webcrypto,File,Blob};
 const context=vm.createContext({
  window,Float32Array,Float64Array,Uint8Array,Uint32Array,
  DataView,ArrayBuffer,TextEncoder,TextDecoder,Blob,File,
  URL,setTimeout,clearTimeout,console
 });
 for(const filename of modules){
  const source=readFileSync(join(root,filename),"utf8");
  vm.runInContext(source,context,{filename,timeout:15000});
 }
 return window;
}
function models(w){
 const meq=new w.RAWBettermakerEngineV3.StudioEQ();
 const manual=new w.RAWBettermakerManualV4.ManualMEQ(meq);
 const bus=new w.RAWNgBusCompV1.Model();
 const tube=new w.RAWNgTubeCompV1.Model();
 assert.equal(meq.set("eq1Gain",2.5),true);
 assert.equal(meq.set("eq2Freq",1100),true);
 assert.equal(bus.parameter("L","threshold",-12),true);
 assert.equal(tube.parameter("L","thd",32),true);
 return {meq,manual,bus,tube};
}
function rack(w,devices,label="Acceptance rack"){
 return w.RAWChainArchiveV1.capture({
  chainOrder:["bettermaker_eq","ngbuscomp","ngtubecomp"],
  ...devices,label
 });
}
function ensure(predicate,code){
 if(!predicate)throw Object.assign(new Error(code),{code});
}
function corruptedCopy(bytes){
 const changed=Uint8Array.from(bytes);
 changed[changed.length-3]^=0x01;
 return changed;
}
function file(bytes,name,type="application/octet-stream"){
 return new File([bytes],name,{type});
}
const BASE_SETTINGS={
 lowCutHz:25,lowShelfDb:1.3,presenceDb:.8,airDb:.6,
 thresholdDb:-22,ratio:2,attackMs:15,releaseMs:140,
 makeupDb:1.2,stereoWidthPercent:95,
 limiterEnabled:true,limiterDriveDb:1.5,limiterLookaheadMs:3,
 limiterReleaseMs:110,ceilingDb:-1,bits:24,dither:true
};
async function perform({inputBytes,outputDir,onStep=()=>{}}={}){
 const began=new Date().toISOString(),steps=[],exports={};
 let w=loadRuntime(),sourceBytes=inputBytes||generateFixture();
 let decoded=decodePcmWav(sourceBytes);
 const inputDigest=sha(sourceBytes),name=inputBytes?"RAW_acceptance_user.wav":"RAW_acceptance_fixture.wav";
 // The optional user input filename is deliberately not serialized into any report.
 const test=async(label,fn)=>{
  const started=Date.now();
  try{
   const details=await fn();
   const recorded={label,status:"PASS",durationMs:Date.now()-started,
    ...(details?{details:label==="THREE_LOCAL_DEVICE_SNAPSHOTS"
      ? {devices:safe(details.devices),hardwareReadback:false}
      :safe(details)}:{})};
   steps.push(recorded);
   onStep(recorded);
   console.log("[RAW V5.43] PASS "+label);
   return details;
  }catch(e){
   const recorded={label,status:"FAIL",durationMs:Date.now()-started,
    code:String(e.code||"ACCEPTANCE_FAILED").slice(0,70),
    error:String(e.message||e).slice(0,240)};
   steps.push(recorded);
   onStep(recorded);
   console.error("[RAW V5.43] FAIL "+label+": "+String(e.message||e));
   throw e;
  }
 };
 await test("IMPORT_REAL_RIFF_PCM",()=>{
  assert.equal(decoded.numberOfChannels,2);
  assert.equal(decoded.frames,decoded.channels[0].length);
  assert.equal(decoded.sampleRate>0,true);
  ensure(sourceBytes.length>44,"SOURCE_EMPTY");
  return {frames:decoded.frames,rate:decoded.sampleRate,sourceBits:decoded.bits,
   sha256:inputDigest,decoder:"NODE_OFFLINE_ACCEPTANCE"};
 });
 const devices=models(w);
 const savedRack=await test("THREE_LOCAL_DEVICE_SNAPSHOTS",()=>{
  const captured=rack(w,devices);
  ensure(captured.deviceStates.bettermaker_eq&&captured.deviceStates.ngbuscomp&&
    captured.deviceStates.ngtubecomp,"RACK_MISSING_DEVICE");
  ensure(captured.provenance.hardwareApplied===false&&
    captured.provenance.physicalReadback===false,"FAKE_HARDWARE_PROVENANCE");
  ensure(captured.deviceStates.bettermaker_eq.engine.A.eq1Gain===2.5,"MEQ_GAIN_NOT_STORED");
  return {devices:captured.chainOrder,hardwareReadback:false,archive:captured};
 });
 // Persistent project: real .rawproj file with exact audio source and full
 // model snapshot; simulate closing the app by destroying our runtime context.
 const archive=savedRack.archive;
 let projectPath=join(outputDir,"Mastering_Acceptance.rawproj");
 await test("SAVE_PORTABLE_PROJECT_WITH_WAV_AND_CHAIN",async()=>{
  const packed=await w.RAWPortableProjectV1.create({
   projectName:"Mastering acceptance",
   notes:"Local digital audio test, NO analog processing",
   rack:archive,history:[{when:began,label:"Before DSP",archive}],
   sources:[file(sourceBytes,name,"audio/wav")]
  },{cryptoRef:webcrypto});
  ensure(packed.audioEmbedded&&packed.checksumPerAudio,"PROJECT_NOT_SELF_CONTAINED");
  mkdirSync(outputDir,{recursive:true});
  writeFileSync(projectPath,new Uint8Array(await packed.blob.arrayBuffer()),{flag:"w"});
  return {projectBytes:packed.blob.size,sources:packed.manifest.sources.length,
   sourceSha256:packed.manifest.sources[0].sha256};
 });
 const changedRack=await test("RECALL_DRY_RUN_PREVIEW_AND_STALE_GUARD",()=>{
  devices.meq.set("eq1Gain",-3);
  devices.bus.parameter("L","threshold",-15);
  const current=rack(w,devices,"Current unsaved rack");
  const plan=w.RAWChainRecallPlannerV2.createPlan(archive,current);
  ensure(plan.summary.changed>=2&&plan.safety.dryRun===true&&
    plan.safety.appliesToLiveModels===false,"RECALL_NOT_READ_ONLY");
  ensure(w.RAWChainRecallPlannerV2.isStillCurrent(plan,current),"RECALL_BASELINE_REJECTED");
  devices.meq.set("eq1Gain",5);
  const stale=rack(w,devices,"Modified after preview");
  ensure(!w.RAWChainRecallPlannerV2.isStillCurrent(plan,stale),"STALE_RECALL_ALLOWED");
  ensure(devices.meq.values.eq1Gain===5,"LIVE_MODEL_MODIFIED_BY_DRY_RUN");
  return {differences:plan.summary.changed,stalePreviewBlocked:true,
   liveControlsUnchanged:true};
 });
 // Fresh VM isolates all model state and proves reopen does not simply
 // return the object that was already in memory.
 w=null;
 const reopened=await test("REOPEN_FROM_DISK_VERIFY_WAV_AND_RACK",async()=>{
  const runtime=loadRuntime();
  const saved=readFileSync(projectPath);
  const rawproj=file(saved,"Mastering_Acceptance.rawproj");
  const project=await runtime.RAWPortableProjectV1.parse(rawproj,{cryptoRef:webcrypto,FileCtor:File});
  ensure(project.verifiedSourceDigests===true,"PROJECT_NOT_HASH_VERIFIED");
  const recovered=new Uint8Array(await project.sources[0].arrayBuffer());
  ensure(sha(recovered)===inputDigest,"REOPENED_WAV_CHANGED");
  const comparison=runtime.RAWChainArchiveV1.compare(archive,project.manifest.rack);
  ensure(comparison.differences.length===0,"REOPENED_RACK_CHANGED");
  ensure(project.manifest.provenance.hardwareApplied===false&&
    project.manifest.provenance.masterIncluded===false,
   "REOPENED_PROJECT_UNSAFE_PROVENANCE");
  w=runtime;
  decoded=decodePcmWav(recovered);
  return {projectBytes:saved.length,sourceSha256:sha(recovered),
   rackDiff:comparison.differences.length,hardwareApplied:false};
 });
 const digests={};
 for(const profile of ["archive24","pcm16"]){
  const settings=w.RAWDigitalHandoffV521.apply(profile,BASE_SETTINGS);
  const task="RENDER_QC_SHA256_"+(profile==="archive24"?"24_BIT":"16_BIT");
  await test(task,async()=>{
   const source=decoded;
   const untouched=source.channels.map(ch=>new Float32Array(ch));
   let progress=0;
   const result=await w.RAWDigitalPremasterV59.render(source,settings,{
    yieldEveryFrames:8192,
    onProgress:p=>{progress=p.percent;}
   });
   ensure(progress===100,"RENDER_DID_NOT_COMPLETE");
   for(let i=0;i<source.channels.length;i++){
    ensure(untouched[i].every((v,j)=>Object.is(v,source.channels[i][j])),
      "DSP_MUTATED_ORIGINAL_WAV");
   }
   const blob=new Blob(result.chunks,{type:"audio/wav"});
   const qc=await w.RAWMasterQCV510.inspect({
    result,blob,sourceName:name,cryptoRef:webcrypto
   });
   ensure(qc.overall!=="FAIL"&&qc.downloadAllowed===true,"DIGITAL_QC_REJECTED");
   const handoff=w.RAWDigitalHandoffV521.evaluate({id:profile,result,qc});
   ensure(handoff.downloadAllowed===true&&handoff.readiness!=="BLOCKED",
    "DIGITAL_HANDOFF_REJECTED");
   ensure(result.hardwareProcessed===false&&result.analogCaptured===false&&
    result.verifiedAnalogMaster===false&&handoff.platformCertified===false,
    "ANALOG_OR_PLATFORM_VERIFICATION_FAKED");
   const receipt={...qc,deliveryHandoff:handoff};
   const outfile=join(outputDir,profile==="archive24"?"RAW_Acceptance_24bit.wav":"RAW_Acceptance_16bit.wav");
   const qcfile=outfile.replace(/\.wav$/i,"_QC.json");
   const rawOutput=new Uint8Array(await blob.arrayBuffer());
   writeFileSync(outfile,rawOutput);
   writeFileSync(qcfile,JSON.stringify(receipt,null,2)+"\n");
   const downloaded=file(readFileSync(outfile),basename(outfile),"audio/wav");
   const downloadedQC=file(readFileSync(qcfile),basename(qcfile),"application/json");
   const verified=await w.RAWDigitalExportVerifierV525.verifyFiles({
    wavFile:downloaded,qcFile:downloadedQC,cryptoRef:webcrypto
   });
   ensure(verified.result==="MATCH"&&verified.integrityVerified===true&&
    verified.bits===result.outputBits&&verified.frames===source.frames,
    "REOPENED_EXPORTED_WAV_NOT_VERIFIED");
   ensure(verified.sha256===qc.sha256&&
    sha(readFileSync(outfile))===qc.sha256,"DISK_WAV_SHA_MISMATCH");
   const measured=w.RAWDigitalPremasterV59.analyze(result.channels,result.sampleRate);
   ensure(measured.clippedFrames===0&&
     measured.peakDbfs<=settings.ceilingDb+0.015,"OUTPUT_SAMPLE_CLIPPING");
   ensure(qc.measurementBasis==="SAMPLE_PEAK_AND_UNWEIGHTED_RMS_NOT_LUFS_OR_TRUE_PEAK",
    "METER_OVERCLAIMS_CERTIFICATION");
   exports[profile]={sha256:qc.sha256,bits:verified.bits,
    frames:verified.frames,rate:verified.sampleRate,bytes:verified.bytes,
    samplePeakDbfs:measured.peakDbfs,rmsDbfs:measured.rmsDbfs,
    qcStatus:qc.overall,handoffStatus:handoff.readiness};
   digests[profile]={result,receipt,outfile,qcfile};
   return exports[profile];
  });
 }
 await test("A_B_DRY_VS_PROCESSED_WAVEFORM",async()=>{
  const dry=await w.RAWDigitalPremasterV59.render(decoded,{
   lowCutHz:0,lowShelfDb:0,presenceDb:0,airDb:0,
   ratio:1,makeupDb:0,stereoWidthPercent:100,limiterEnabled:false,
   ceilingDb:-.1,bits:24,dither:false
  });
  const wet=digests.archive24.result;
  let squared=0;
  for(let i=0;i<decoded.frames;i++){
   const delta=wet.channels[0][i]-dry.channels[0][i];
   squared+=delta*delta;
  }
  const rmsDifference=Math.sqrt(squared/decoded.frames);
  ensure(rmsDifference>.0001,"PROCESSING_SOUNDS_LIKE_BYPASS");
  ensure(dry.analogCaptured===false&&wet.hardwareProcessed===false,
    "FALSE_HARDWARE_AB_CLAIM");
  return {rmsDifference:Number(rmsDifference.toFixed(6)),
   interpretation:"Digital PCM comparison only, NOT Bettermaker/WesAudio analog A/B"};
 });
 await test("NEGATIVE_PATHS_CANCEL_TAMPER_AND_UNTRUSTED_PROVENANCE",async()=>{
  const settings=w.RAWDigitalHandoffV521.apply("archive24",BASE_SETTINGS);
  await assert.rejects(()=>w.RAWDigitalPremasterV59.render(decoded,settings,{
   isCancelled:()=>true
  }),e=>e.code==="CANCELLED");
  await assert.rejects(()=>w.RAWDigitalPremasterV59.render(decoded,{
   ...settings,hardwareVerified:true
  }),e=>e.code==="CONFIG");
  const output=digests.archive24;
  const actual=readFileSync(output.outfile);
  const tampered=file(corruptedCopy(actual),"TAMPER.wav","audio/wav");
  await assert.rejects(()=>w.RAWDigitalExportVerifierV525.verifyFiles({
   wavFile:tampered,qcFile:file(readFileSync(output.qcfile),"QC.json","application/json"),
   cryptoRef:webcrypto
  }),e=>e.code==="SHA256_MISMATCH");
  const modified=file(corruptedCopy(readFileSync(projectPath)),"tampered.rawproj");
  await assert.rejects(()=>w.RAWPortableProjectV1.parse(modified,{cryptoRef:webcrypto,FileCtor:File}),
   e=>e.code==="SOURCE_CHECKSUM");
  await assert.rejects(()=>w.RAWMasterQCV510.inspect({
   result:{...output.result,hardwareProcessed:true},
   blob:file(readFileSync(output.outfile),"fake.wav","audio/wav"),
   cryptoRef:webcrypto
  }),e=>e.code==="UNTRUSTED_DIGITAL_OUTPUT");
  return {renderCancelBlocked:true,invalidOptionsBlocked:true,
   outputTamperBlocked:true,projectTamperBlocked:true,
   physicalHardwareFalseClaimBlocked:true};
 });
 return {
  report:{
   suite:"RAW_MASTERING_ACCEPTANCE_V543",version:1,
   startedAt:began,completedAt:new Date().toISOString(),
   status:"PASS",total:steps.length,passed:steps.length,
   source:{name:inputBytes?"USER_LOCAL_WAV":"SYNTHETIC_REAL_PCM_WAV",
    sha256:inputDigest,frames:decoded.frames,rate:decoded.sampleRate,bits:decoded.bits},
   steps,
   outputs:exports,
   boundaries:{
    sourceDecodedBy:"NODE_ACCEPTANCE_PCM_DECODER_NOT_WEB_AUDIO",
    actualDspModules:true,actualFileDiskIO:true,actualPortableProject:true,
    actualSHA256Verification:true,
    digitalPCMProcessed:true,localDeviceModelsArchived:true,
    rackControlsAffectDsp:false,
    electronGuiExercised:false,actualCustomerRecording:!!inputBytes,
    hardwareConnected:false,hardwareReadback:false,analogCaptured:false,
    certifiedLUFS:false,certifiedTruePeak:false,platformCertified:false,
    productionBillingTested:false
   }
  },outputDir
 };
}
export async function runAcceptance(opts={}){
 const outputDir=resolve(opts.outputDir||join(root,"artifacts","raw-v543-acceptance"));
 const began=new Date().toISOString(),recordedSteps=[];
 try{
  const result=await perform({...opts,outputDir,
   onStep:step=>recordedSteps.push(step)});
  mkdirSync(outputDir,{recursive:true});
  const reportPath=join(outputDir,"RAW_V543_ACCEPTANCE_REPORT.json");
  writeFileSync(reportPath,JSON.stringify(result.report,null,2)+"\n");
  console.log("[RAW V5.43] ACCEPTANCE PASS "+result.report.passed+"/"+result.report.total);
  console.log("[RAW V5.43] Report: "+reportPath);
  console.log("[RAW V5.43] This is OFFLINE DIGITAL acceptance, NOT physical hardware validation.");
  return {...result,reportPath};
 }catch(e){
  mkdirSync(outputDir,{recursive:true});
  const failedReport={
   suite:"RAW_MASTERING_ACCEPTANCE_V543",version:1,
   startedAt:began,completedAt:new Date().toISOString(),status:"FAIL",
   total:recordedSteps.length,passed:recordedSteps.filter(x=>x.status==="PASS").length,
   failed:recordedSteps.filter(x=>x.status==="FAIL").length,steps:recordedSteps,
   failure:{code:String(e.code||"ACCEPTANCE_FAILED").slice(0,70),
    message:String(e.message||e).slice(0,240)},
   boundaries:{hardwareConnected:false,analogCaptured:false,productionBillingTested:false}
  };
  writeFileSync(join(outputDir,"RAW_V543_ACCEPTANCE_REPORT.json"),JSON.stringify(failedReport,null,2)+"\n");
  throw e;
 }
}
// npm versions differ in how they forward --input after the npm "--"
// delimiter. Accept an explicit --input FILE, or a single positional FILE
// when npm has stripped --input. Both forms remain strictly LOCAL FILE I/O.
export function parseArgs(argv){
 if(!Array.isArray(argv))throw Error("RAW_V543_USAGE");
 const args=[...argv],out={};
 while(args.length){
  const arg=args.shift();
  if(arg==="--input"||arg==="--output"){
   if(!args.length)throw Error("RAW_V543_USAGE");
   const value=args.shift();
   if(typeof value!=="string"||!value.trim()||value.startsWith("--"))
    throw Error("RAW_V543_USAGE");
   const key=arg==="--input"?"inputPath":"outputDir";
   if(Object.hasOwn(out,key))throw Error("RAW_V543_USAGE");
   out[key]=value;
  }else if(typeof arg==="string"&&arg.trim()&&!arg.startsWith("-")){
   if(Object.hasOwn(out,"inputPath"))throw Error("RAW_V543_USAGE");
   out.inputPath=arg;
  }else throw Error("RAW_V543_USAGE");
 }
 return out;
}
async function main(){
 const args=parseArgs(process.argv.slice(2));
 if(args.inputPath){
  // Entirely local file read; no network or automatic upload.
  const input=loadLocalWav(resolve(args.inputPath));
  await runAcceptance({inputBytes:input.bytes,outputDir:args.outputDir});
 }else await runAcceptance({outputDir:args.outputDir});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(e=>{console.error("[RAW V5.43] ACCEPTANCE FAIL:",e.code||e.message);process.exitCode=1;});
}
