import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,rmSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {runAcceptance} from "../scripts/raw-v543-mastering-acceptance.mjs";
import {decodePcmWav,generateFixture,MAX_FRAMES} from "../scripts/raw-v543-wav-io.mjs";

const hash=b=>createHash("sha256").update(b).digest("hex");

test("V5.43: actual RAW modules complete mastering from real WAV through disk .rawproj, 24/16 WAV + QC verification",{
 timeout:150000
},async t=>{
 const out=mkdtempSync(join(tmpdir(),"raw-v543-acceptance-"));
 t.after(()=>rmSync(out,{recursive:true,force:true}));
 const result=await runAcceptance({
  inputBytes:generateFixture({frames:32000,rate:48000}),
  outputDir:out
 });
 const report=result.report;
 assert.equal(report.suite,"RAW_MASTERING_ACCEPTANCE_V543");
 assert.equal(report.status,"PASS");
 assert.ok(report.total>=9);
 assert.equal(report.total,report.passed);
 assert.ok(report.steps.every(x=>x.status==="PASS"));
 for(const label of ["IMPORT_REAL_RIFF_PCM","THREE_LOCAL_DEVICE_SNAPSHOTS",
   "SAVE_PORTABLE_PROJECT_WITH_WAV_AND_CHAIN",
   "RECALL_DRY_RUN_PREVIEW_AND_STALE_GUARD",
   "REOPEN_FROM_DISK_VERIFY_WAV_AND_RACK",
   "RENDER_QC_SHA256_24_BIT","RENDER_QC_SHA256_16_BIT",
   "A_B_DRY_VS_PROCESSED_WAVEFORM",
   "NEGATIVE_PATHS_CANCEL_TAMPER_AND_UNTRUSTED_PROVENANCE"])
   assert.ok(report.steps.some(x=>x.label===label),label);
 const p24=join(out,"RAW_Acceptance_24bit.wav");
 const p16=join(out,"RAW_Acceptance_16bit.wav");
 assert.ok(existsSync(join(out,"Mastering_Acceptance.rawproj")));
 assert.ok(existsSync(p24));
 assert.ok(existsSync(p16));
 for(const [path,bits,key] of [[p24,24,"archive24"],[p16,16,"pcm16"]]){
  const bytes=readFileSync(path);
  const rendered=decodePcmWav(bytes);
  assert.equal(rendered.bits,bits);
  assert.equal(rendered.frames,32000);
  assert.equal(rendered.numberOfChannels,2);
  assert.equal(rendered.sampleRate,48000);
  assert.equal(hash(bytes),report.outputs[key].sha256);
  assert.equal(report.outputs[key].qcStatus==="FAIL",false);
  assert.equal(report.outputs[key].handoffStatus==="BLOCKED",false);
  assert.ok(report.outputs[key].samplePeakDbfs<=-0.985);
 }
 const diskReport=JSON.parse(readFileSync(result.reportPath,"utf8"));
 assert.equal(diskReport.total,report.total);
 assert.equal(diskReport.boundaries.rackControlsAffectDsp,false);
 assert.equal(diskReport.boundaries.hardwareConnected,false);
 assert.equal(diskReport.boundaries.electronGuiExercised,false);
 assert.equal(diskReport.boundaries.certifiedLUFS,false);
 assert.equal(diskReport.boundaries.certifiedTruePeak,false);
});

test("V5.43: PCM WAV parser handles real RIFF padding and rejects malformed, compressed, oversized or unsafe audio",()=>{
 const data=generateFixture({frames:1200,sampleRate:44100,bits:16});
 const decoded=decodePcmWav(data);
 assert.equal(decoded.sampleRate,44100);
 assert.equal(decoded.bits,16);
 assert.equal(decoded.frames,1200);
 // RIFF files often contain odd-sized metadata blocks with one pad byte.
 const padded=new Uint8Array(data.length+12);
 padded.set(data.slice(0,12),0);
 padded.set(Uint8Array.from([74,85,78,75,3,0,0,0,42,43,44,0]),12);
 padded.set(data.slice(12),24);
 new DataView(padded.buffer).setUint32(4,padded.length-8,true);
 const parsedWithJunk=decodePcmWav(padded);
 assert.equal(parsedWithJunk.frames,1200);
 assert.equal(parsedWithJunk.sampleRate,44100);
 assert.equal(decoded.channels.length,2);
 assert.ok(decoded.channels[0].some(x=>x!==0));
 const invalid=Uint8Array.from(data);
 invalid[0]=0x00;
 assert.throws(()=>decodePcmWav(invalid),e=>e.code==="RAW_V543_RIFF_HEADER");
 const incorrectLength=Uint8Array.from(data);
 new DataView(incorrectLength.buffer).setUint32(4,1,true);
 assert.throws(()=>decodePcmWav(incorrectLength),e=>e.code==="RAW_V543_RIFF_HEADER");
 const compressed=Uint8Array.from(data);
 new DataView(compressed.buffer).setUint16(20,3,true);
 assert.throws(()=>decodePcmWav(compressed),e=>e.code==="RAW_V543_WAV_UNSUPPORTED_FORMAT");
 const mono=Uint8Array.from(data);
 new DataView(mono.buffer).setUint16(22,1,true);
 assert.throws(()=>decodePcmWav(mono),e=>e.code==="RAW_V543_WAV_UNSUPPORTED_FORMAT");
 const short=Uint8Array.from(data.slice(0,-1));
 assert.throws(()=>decodePcmWav(short),e=>e.code==="RAW_V543_RIFF_HEADER");
 const junk=Uint8Array.from(data);
 new DataView(junk.buffer).setUint32(40,1,true);
 assert.throws(()=>decodePcmWav(junk),
  e=>e.code==="RAW_V543_RIFF_CHUNK_LENGTH"||e.code==="RAW_V543_WAV_FRAME_ALIGNMENT");
 assert.throws(()=>generateFixture({frames:MAX_FRAMES+1}),e=>e.code==="RAW_V543_BAD_FIXTURE_OPTIONS");
});

test("V5.43: corrupted input fails and writes an honest JSON FAIL report without a fake PASS",async t=>{
 const output=mkdtempSync(join(tmpdir(),"raw-v543-invalid-"));
 t.after(()=>rmSync(output,{recursive:true,force:true}));
 await assert.rejects(()=>runAcceptance({
  inputBytes:Uint8Array.from([0,1,2,3,4,5]),outputDir:output
 }),e=>e.code==="RAW_V543_WAV_FILE_SIZE");
 const report=JSON.parse(readFileSync(join(output,"RAW_V543_ACCEPTANCE_REPORT.json"),"utf8"));
 assert.equal(report.status,"FAIL");
 assert.equal(report.passed,0);
 assert.equal(report.failed,0);
 assert.equal(report.total,0);
 assert.deepEqual(report.steps,[]);
 assert.equal(report.failure.code,"RAW_V543_WAV_FILE_SIZE");
 assert.equal(report.boundaries.hardwareConnected,false);
});

test("V5.43: no private recordings, studio/physical hardware, production billing or network access in acceptance runner",()=>{
 const runner=readFileSync(new URL("../scripts/raw-v543-mastering-acceptance.mjs",import.meta.url),"utf8");
 const decoder=readFileSync(new URL("../scripts/raw-v543-wav-io.mjs",import.meta.url),"utf8");
 assert.match(runner,/RAW_TEST_MODE|LOCAL DIGITAL|LOCAL DIGITAL|LOCAL DIGITAL|local|Local/i);
 assert.match(runner,/RAWPortableProjectV1\.parse/);
 assert.match(runner,/RAWMasterQCV510\.inspect/);
 assert.match(runner,/RAWDigitalExportVerifierV525\.verifyFiles/);
 assert.match(runner,/RAWChainRecallPlannerV2\.isStillCurrent/);
 assert.match(runner,/RAWDigitalPremasterV59\.render/);
 assert.match(runner,/hardwareConnected:false/);
 assert.match(runner,/rackControlsAffectDsp:false/);
 assert.doesNotMatch(runner+decoder,/\b(?:fetch|WebSocket|XMLHttpRequest|ipcRenderer|easymidi|serialport|Stripe)\s*\(/i);
});
