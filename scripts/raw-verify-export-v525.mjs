#!/usr/bin/env node
// RAW V5.25 — independent disk-based digital PCM export verifier.
// Uses a streamed Node SHA-256 digest, not the in-memory Electron DSP result.
// QC JSON is user-editable and unsigned; this is consistency, NOT authenticity.
import {open,readFile,stat} from "node:fs/promises";
import {createReadStream} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";

const MAX_WAV=128*1024*1024,MAX_QC=512*1024;
function fail(code,message){const e=new Error(message);e.code=code;throw e;}
function parseHeader(buf,length){
 if(buf.length!==44)fail("WAV_HEADER","WAV header is incomplete");
 const four=(offset)=>buf.toString("ascii",offset,offset+4);
 if(four(0)!=="RIFF"||four(8)!=="WAVE"||four(12)!=="fmt "||
    four(36)!=="data"||buf.readUInt32LE(16)!==16||
    buf.readUInt16LE(20)!==1||buf.readUInt32LE(4)!==length-8||
    buf.readUInt32LE(40)!==length-44)
  fail("WAV_HEADER","Expected canonical PCM WAV with matching RIFF/data lengths");
 const channels=buf.readUInt16LE(22),bits=buf.readUInt16LE(34),
  rate=buf.readUInt32LE(24),align=channels*bits/8,frames=(length-44)/align;
 if(channels!==2||![16,24].includes(bits)||rate<8000||rate>192000||
    buf.readUInt16LE(32)!==align||buf.readUInt32LE(28)!==rate*align||
    !Number.isSafeInteger(frames)||frames<1)
  fail("WAV_FORMAT","Expected complete stereo 16/24-bit PCM WAV");
 return {channels,bits,sampleRate:rate,frames,bytes:length};
}
export async function verifyExport(wavPath,qcPath){
 if(typeof wavPath!=="string"||typeof qcPath!=="string"||!wavPath||!qcPath)
  fail("ARGUMENTS","Supply both a downloaded WAV path and its QC JSON path");
 const [wavStats,qcStats]=await Promise.all([stat(wavPath),stat(qcPath)]);
 if(!wavStats.isFile()||wavStats.size<46||wavStats.size>MAX_WAV)
  fail("WAV_SIZE","WAV must be a file between 46 bytes and 128 MiB");
 if(!qcStats.isFile()||qcStats.size<2||qcStats.size>MAX_QC)
  fail("QC_SIZE","QC JSON must be a file between 2 bytes and 512 KiB");
 const fd=await open(wavPath,"r");
 const bytes=Buffer.alloc(44);
 try{
  const {bytesRead}=await fd.read(bytes,0,44,0);
  if(bytesRead!==44)fail("WAV_HEADER","WAV truncated during inspection");
 }finally{await fd.close();}
 const wav=parseHeader(bytes,wavStats.size);
 let qc;
 try{qc=JSON.parse(await readFile(qcPath,"utf8"));}
 catch{fail("QC_JSON","QC report is not valid JSON");}
 const hash=createHash("sha256");
 for await(const chunk of createReadStream(wavPath,{highWaterMark:256*1024})){
  hash.update(chunk);
 }
 const sha256=hash.digest("hex");
 // Detect replacement or truncation during a file read, not just at initial stat.
 const after=await stat(wavPath);
 if(after.size!==wavStats.size||after.mtimeMs!==wavStats.mtimeMs)
  fail("WAV_CHANGED","File changed while verifying");
 if(qc?.kind!=="RAW_LOCAL_DIGITAL_QC_V510"||qc.localDigitalOnly!==true||
    qc.analogCaptured!==false||qc.hardwareProcessed!==false||
    qc.physicalReadback!==false||qc.verifiedAnalogMaster!==false||
    qc.masterAvailable!==false||qc.downloadAllowed!==true||
    !["PASS","REVIEW"].includes(qc.overall))
  fail("QC_UNTRUSTED","Not an accepted local digital RAW QC receipt");
 if(qc.sha256!==sha256)fail("SHA256_MISMATCH","QC hash and disk WAV hash differ");
 if(qc.outputBytes!==wav.bytes||qc.bits!==wav.bits||
    qc.frames!==wav.frames||qc.channels!==wav.channels||
    qc.sampleRate!==wav.sampleRate||qc.settings?.bits!==wav.bits)
  fail("QC_MISMATCH","WAV structure does not match QC metadata");
 const h=qc.deliveryHandoff;
 if(h?.kind!=="RAW_LOCAL_DIGITAL_HANDOFF_V521"||h.downloadAllowed!==true||
    h.readiness==="BLOCKED"||h.sha256!==sha256||
    h.bits!==wav.bits||h.sampleRate!==wav.sampleRate||
    h.analogCaptured!==false||h.hardwareProcessed!==false||
    h.verifiedAnalogMaster!==false||h.platformCertified!==false||
    !["custom","archive24","pcm16"].includes(h.id)||
    (h.id==="archive24"&&wav.bits!==24)||
    (h.id==="pcm16"&&wav.bits!==16))
  fail("HANDOFF_MISMATCH","Digital handoff profile does not match disk WAV");
 return Object.freeze({kind:"RAW_LOCAL_DISK_CHECK_V525",result:"MATCH",
  sha256,...wav,profile:h.id,qcStatus:qc.overall,
  integrityVerified:true,qcCryptographicallySigned:false,
  analogCaptured:false,verifiedAnalogMaster:false});
}
async function main(){
 if(process.argv.length!==4){
  process.stderr.write('Usage: node scripts/raw-verify-export-v525.mjs "file.wav" "file_QC_V510.json"\n');
  process.exitCode=2;return;
 }
 try{
  const report=await verifyExport(process.argv[2],process.argv[3]);
  process.stdout.write("RAW OFFLINE DIGITAL FILE MATCH\n"+JSON.stringify(report,null,2)+"\n");
 }catch(error){
  process.stderr.write("RAW FILE CHECK FAILED: "+String(error.code||"ERROR")+
   " · "+String(error.message||error)+"\n");
  process.exitCode=1;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 await main();
