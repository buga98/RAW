import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {Readable} from "node:stream";
import {readFileSync} from "node:fs";
import {
 createRawDigitalPublisherV535,createRawDigitalDeliveryV535,
 RAW_V535_DOWNLOAD_TTL_MS
} from "../raw-v535-digital-delivery.mjs";
const ID="dig_"+"a".repeat(32),ID2="dig_"+"b".repeat(32);
const START=Date.UTC(2026,10,11,12,0);
const pathFor=(owner="alice",id=ID)=>"raw-digital-v535/"+owner+"/"+id+".wav";
function wave({bits=24,channels=2,frames=64,rate=48000}={}){
 const align=bits*channels/8,dataLength=frames*align;
 const wav=Buffer.alloc(44+dataLength);
 wav.write("RIFF",0);wav.writeUInt32LE(wav.length-8,4);
 wav.write("WAVEfmt ",8);wav.writeUInt32LE(16,16);
 wav.writeUInt16LE(1,20);wav.writeUInt16LE(channels,22);
 wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*align,28);
 wav.writeUInt16LE(align,32);wav.writeUInt16LE(bits,34);
 wav.write("data",36);wav.writeUInt32LE(dataLength,40);
 for(let i=44;i<wav.length;i++)wav[i]=(i*13)%256;
 return wav;
}
class FakeDb{
 constructor(){this.data=new Map();}
 collection(name){
  const db=this;
  return {doc(id){
   const key=name+"/"+id;
   return {
    create:async item=>{
     if(db.data.has(key))throw Error("DUPLICATE_ARTIFACT");
     db.data.set(key,structuredClone(item));
    },
    get:async()=>({exists:db.data.has(key),data:()=>structuredClone(db.data.get(key))})
   };
  }};
 }
}
class FakeBucket{
 constructor(){this.data=new Map();this.signed=[];this.reads=0;}
 set(path,buffer,{generation="1731234567891234",contentType="audio/wav"}={}){
  this.data.set(path,{buffer,generation,contentType});
 }
 file(path,{generation}={}){
  const bucket=this;
  return {
   async getMetadata(){
    const obj=bucket.data.get(path);
    if(!obj)throw Error("OBJECT_NOT_FOUND");
    return [{size:String(obj.buffer.length),generation:obj.generation,
     contentType:obj.contentType}];
   },
   createReadStream(){
    const obj=bucket.data.get(path);
    if(!obj)throw Error("OBJECT_NOT_FOUND");
    bucket.reads++;
    return Readable.from([obj.buffer.subarray(0,15),obj.buffer.subarray(15)]);
   },
   async getSignedUrl(config){
    const obj=bucket.data.get(path);
    if(!obj||generation!==obj.generation)throw Error("STALE_GENERATION");
    bucket.signed.push({path,generation,config});
    return ["https://storage.googleapis.com/example/"+path+"?generation="+generation];
   }
  };
 }
}
function fixture(){
 const db=new FakeDb(),bucket=new FakeBucket();
 const identity={async verify(value){
  if(value==="Bearer alice")return{uid:"alice"};
  if(value==="Bearer bob")return{uid:"bob"};
  throw Error("AUTH_INVALID");
 }};
 let authorized=true,now=START;
 const publish=createRawDigitalPublisherV535({
  db,bucket,verifyProducer:async()=>authorized,now:()=>now
 });
 const deliver=createRawDigitalDeliveryV535({db,bucket,identity,now:()=>now});
 return {db,bucket,publish,deliver,
  setAuth:value=>{authorized=value;},clock:value=>{now=value;}};
}
const expectCode=code=>error=>error?.code===code;
test("V5.35: server streams entire WAV, calculates SHA-256 and publishes immutable digital-only manifest",async()=>{
 const f=fixture(),buf=wave();
 f.bucket.set(pathFor(),buf);
 const item=await f.publish.publish({ownerUid:"alice",artifactId:ID,producerReceipt:{}});
 assert.equal(item.sha256,createHash("sha256").update(buf).digest("hex"));
 assert.equal(item.frames,64);
 assert.equal(item.bits,24);
 assert.equal(item.sampleRate,48000);
 assert.equal(item.digitalOnly,true);
 assert.equal(item.analogCaptured,false);
 assert.equal(f.bucket.reads,1);
 const stored=f.db.data.get("rawDigitalDeliveriesV535/"+ID);
 assert.equal(stored.qcStatus,"DIGITAL_INTEGRITY_PASS");
 assert.equal(stored.objectGeneration,"1731234567891234");
 await assert.rejects(f.publish.publish({ownerUid:"alice",artifactId:ID}),
  /DUPLICATE_ARTIFACT/);
});
test("V5.35: verified owner receives generation-pinned signed URL for only their digital output",async()=>{
 const f=fixture(),buf=wave({bits:16,frames:40});
 f.bucket.set(pathFor(),buf);
 await f.publish.publish({ownerUid:"alice",artifactId:ID});
 const result=await f.deliver.authorizeDownload({
  authorization:"Bearer alice",artifactId:ID
 });
 assert.equal(result.digitalOnly,true);
 assert.equal(result.analogCaptured,false);
 assert.equal(result.sha256,createHash("sha256").update(buf).digest("hex"));
 assert.equal(result.expiresAtMs,START+RAW_V535_DOWNLOAD_TTL_MS);
 assert.equal(f.bucket.signed.length,1);
 assert.equal(f.bucket.signed[0].generation,"1731234567891234");
 assert.equal(f.bucket.signed[0].config.action,"read");
 assert.equal(f.bucket.signed[0].config.version,"v4");
 assert.match(f.bucket.signed[0].config.responseDisposition,/RAW-digital/);
 assert.equal(result.bits,16);
});
test("V5.35: another user, invalid artifact IDs or unpublished outputs cannot be downloaded",async()=>{
 const f=fixture();
 f.bucket.set(pathFor(),wave());
 await f.publish.publish({ownerUid:"alice",artifactId:ID});
 await assert.rejects(f.deliver.authorizeDownload({
  authorization:"Bearer bob",artifactId:ID
 }),expectCode("DIGITAL_ARTIFACT_NOT_FOUND"));
 await assert.rejects(f.deliver.authorizeDownload({
  authorization:"Bearer alice",artifactId:"../../secret"
 }),expectCode("DIGITAL_ARTIFACT_NOT_FOUND"));
 await assert.rejects(f.deliver.authorizeDownload({
  authorization:"Bearer alice",artifactId:ID2
 }),expectCode("DIGITAL_ARTIFACT_NOT_FOUND"));
 assert.equal(f.bucket.signed.length,0);
});
test("V5.35: any generation change invalidates signed download even if size is identical",async()=>{
 const f=fixture(),buf=wave();
 f.bucket.set(pathFor(),buf,{generation:"1731234567891234"});
 await f.publish.publish({ownerUid:"alice",artifactId:ID});
 const corrupted=Buffer.from(buf);corrupted[50]^=0x7f;
 f.bucket.set(pathFor(),corrupted,{generation:"1731234567891235"});
 await assert.rejects(f.deliver.authorizeDownload({
  authorization:"Bearer alice",artifactId:ID
 }),expectCode("DIGITAL_OBJECT_CHANGED"));
 assert.equal(f.bucket.signed.length,0);
});
test("V5.35: producer signature gate denies browser-managed master publication",async()=>{
 const f=fixture();
 f.bucket.set(pathFor(),wave());
 f.setAuth(false);
 await assert.rejects(f.publish.publish({
  ownerUid:"alice",artifactId:ID,producerReceipt:{fakeHardware:true}
 }),expectCode("DIGITAL_PRODUCER_NOT_AUTHORIZED"));
 assert.equal(f.bucket.reads,0);
 assert.equal(f.db.data.size,0);
});
test("V5.35: forged analog status, QC or owner/path metadata cannot enable download",async()=>{
 const f=fixture();
 f.bucket.set(pathFor(),wave());
 await f.publish.publish({ownerUid:"alice",artifactId:ID});
 const ref="rawDigitalDeliveriesV535/"+ID;
 const base=structuredClone(f.db.data.get(ref));
 for(const changes of [
  {analogCaptured:true},{digitalOnly:false},{status:"pending"},
  {qcStatus:"PASS"},{integrityVerified:false},{ownerUid:"bob"},
  {objectPath:"raw-digital-v535/bob/"+ID+".wav"}
 ]){
  f.db.data.set(ref,{...base,...changes});
  await assert.rejects(f.deliver.authorizeDownload({
   authorization:"Bearer alice",artifactId:ID
  }),expectCode(Object.hasOwn(changes,"ownerUid")
     ?"DIGITAL_ARTIFACT_NOT_FOUND":"DIGITAL_ARTIFACT_UNVERIFIED"));
 }
 assert.equal(f.bucket.signed.length,0);
});
test("V5.35: malformed/truncated/unsupported WAVs fail without creating deliverable",async()=>{
 const invalids=[
  wave({bits:32}),wave({channels:1}),wave({rate:22050}),
  wave().subarray(0,50),
  Buffer.from(wave())
 ];
 invalids[4].write("RIFX",0);
 for(const wav of invalids){
  const f=fixture();f.bucket.set(pathFor(),wav);
  await assert.rejects(f.publish.publish({ownerUid:"alice",artifactId:ID}),
   error=>["DIGITAL_WAV_NOT_CANONICAL","DIGITAL_PCM_NOT_SUPPORTED",
    "DIGITAL_OBJECT_TRUNCATED"].includes(error?.code));
  assert.equal(f.db.data.size,0);
 }
});

test("V5.35: staging Cloud Function authorizes digital downloads, all direct Storage and Firestore access denied",()=>{
 const root=new URL("../",import.meta.url);
 const read=name=>readFileSync(new URL(name,root),"utf8");
 const f=read("functions-v532/index.mjs");
 const builder=read("scripts/raw-v532-package-functions.mjs");
 const storageRules=read("config/storage-v535-STAGING.rules");
 const firestoreRules=read("config/firestore-v532-STAGING.rules");
 const config=JSON.parse(read("firebase-v532-staging.json"));
 assert.match(f,/rawV535DigitalDownload=onRequest/);
 assert.match(f,/createRawDigitalDeliveryV535/);
 assert.match(f,/identity:identity\(\)/);
 assert.match(f,/assertRawStagingReadV532\(config\(\)\)/);
 assert.match(builder,/raw-v535-digital-delivery\.mjs/);
 assert.equal(config.storage.rules,"config/storage-v535-STAGING.rules");
 assert.match(storageRules,/allow read, write: if false/);
 assert.match(firestoreRules,/rawDigitalDeliveriesV535/);
 assert.doesNotMatch(f,/publishVerifiedDigital/);
});
