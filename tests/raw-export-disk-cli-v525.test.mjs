import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {verifyExport} from "../scripts/raw-verify-export-v525.mjs";

const cli=fileURLToPath(new URL("../scripts/raw-verify-export-v525.mjs",import.meta.url));
async function fixture(fn,{bits=24,sampleRate=48000}={}){
 const dir=await mkdtemp(join(tmpdir(),"raw-v525-"));
 try{
  const frames=128,align=bits/8*2,bytes=Buffer.alloc(44+frames*align);
  bytes.write("RIFF",0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write("WAVE",8);
  bytes.write("fmt ",12);bytes.writeUInt32LE(16,16);
  bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(2,22);
  bytes.writeUInt32LE(sampleRate,24);bytes.writeUInt32LE(sampleRate*align,28);
  bytes.writeUInt16LE(align,32);bytes.writeUInt16LE(bits,34);
  bytes.write("data",36);bytes.writeUInt32LE(bytes.length-44,40);
  bytes[45]=123;bytes[50]=56;
  const sha256=createHash("sha256").update(bytes).digest("hex");
  const wav=join(dir,"Song.wav"),json=join(dir,"Song_QC_V510.json");
  const qc={
   kind:"RAW_LOCAL_DIGITAL_QC_V510",version:1,localDigitalOnly:true,
   analogCaptured:false,hardwareProcessed:false,physicalReadback:false,
   verifiedAnalogMaster:false,masterAvailable:false,downloadAllowed:true,
   overall:"PASS",sha256,outputBytes:bytes.length,frames,channels:2,
   bits,sampleRate,settings:{bits,ceilingDb:-1},
   deliveryHandoff:{
    kind:"RAW_LOCAL_DIGITAL_HANDOFF_V521",readiness:"REVIEW",downloadAllowed:true,
    id:bits===24?"archive24":"pcm16",sha256,bits,sampleRate,
    analogCaptured:false,hardwareProcessed:false,
    verifiedAnalogMaster:false,platformCertified:false
   }
  };
  await writeFile(wav,bytes);await writeFile(json,JSON.stringify(qc));
  await fn({dir,wav,json,bytes,qc});
 }finally{await rm(dir,{recursive:true,force:true});}
}
test("streaming independent disk check accepts 24-bit / 48 kHz and 16-bit / 44.1 kHz",async()=>{
 for(const opts of [{bits:24,sampleRate:48000},{bits:16,sampleRate:44100}]){
  await fixture(async({wav,json,qc})=>{
   const result=await verifyExport(wav,json);
   assert.equal(result.result,"MATCH");
   assert.equal(result.sha256,qc.sha256);
   assert.equal(result.bits,opts.bits);
   assert.equal(result.sampleRate,opts.sampleRate);
   assert.equal(result.qcCryptographicallySigned,false);
   const command=spawnSync(process.execPath,[cli,wav,json],{encoding:"utf8"});
   assert.equal(command.status,0,command.stderr);
   assert.match(command.stdout,/RAW OFFLINE DIGITAL FILE MATCH/);
  },opts);
 }
});
test("disk modification with identical WAV byte length is always rejected",async()=>{
 await fixture(async({wav,json,bytes})=>{
  const changed=Buffer.from(bytes);changed[70]^=0x42;await writeFile(wav,changed);
  await assert.rejects(verifyExport(wav,json),e=>e.code==="SHA256_MISMATCH");
  const command=spawnSync(process.execPath,[cli,wav,json],{encoding:"utf8"});
  assert.equal(command.status,1);
  assert.match(command.stderr,/SHA256_MISMATCH/);
 });
});
test("metadata/header forge and invalid JSON never report integrity match",async()=>{
 await fixture(async({wav,json,qc})=>{
  await writeFile(json,JSON.stringify({...qc,frames:999}));
  await assert.rejects(verifyExport(wav,json),e=>e.code==="QC_MISMATCH");
  await writeFile(json,"{");
  await assert.rejects(verifyExport(wav,json),e=>e.code==="QC_JSON");
  await writeFile(json,JSON.stringify(qc));
  const changed=await readFile(wav);changed[0]=0;await writeFile(wav,changed);
  await assert.rejects(verifyExport(wav,json),e=>e.code==="WAV_HEADER");
 });
});
test("missing parameters return CLI usage failure without reading arbitrary data",()=>{
 const command=spawnSync(process.execPath,[cli],{encoding:"utf8"});
 assert.equal(command.status,2);
 assert.match(command.stderr,/Usage:/);
});
