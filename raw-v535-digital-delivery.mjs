/* RAW V5.35 — verified DIGITAL WAV delivery from private Cloud Storage.
 * Only independent server-side streaming SHA-256 verification can publish a
 * file. Owner receives a short-lived read-only signed GCS URL.
 * No analog-master claim, no payment or hardware authorization.
 * NEVER install this in an untrusted browser or expose publisher endpoint.
 */
import {createHash} from "node:crypto";
import {RawAccessError} from "./raw-v529-identity.mjs";
const fail=(code,status=403)=>{throw new RawAccessError(code,status);};
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const ID=/^dig_[a-f0-9]{32}$/;
const SHA=/^[a-f0-9]{64}$/;
const BYTES_MAX=4*1024*1024*1024-1;
const LINK_MS=5*60*1000;
const valid=(value,re)=>typeof value==="string"&&re.test(value);
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const safePath=(ownerUid,artifactId)=>{
 if(!valid(ownerUid,UID)||!valid(artifactId,ID))
  fail("INVALID_DIGITAL_ARTIFACT",400);
 return "raw-digital-v535/"+ownerUid+"/"+artifactId+".wav";
};
const parseLength=value=>{
 const number=Number(value);
 if(!integer(number)||number<44||number>BYTES_MAX||
    typeof value==="string"&&String(number)!==value)
  fail("DIGITAL_OBJECT_SIZE_INVALID",503);
 return number;
};
function parseCanonicalWav(header,byteLength){
 if(header.length!==44||
   header.toString("ascii",0,4)!=="RIFF"||
   header.toString("ascii",8,12)!=="WAVE"||
   header.toString("ascii",12,16)!=="fmt "||
   header.readUInt32LE(16)!==16||
   header.readUInt16LE(20)!==1||
   header.toString("ascii",36,40)!=="data"||
   header.readUInt32LE(4)+8!==byteLength)
  fail("DIGITAL_WAV_NOT_CANONICAL",422);
 const channels=header.readUInt16LE(22);
 const sampleRate=header.readUInt32LE(24);
 const bits=header.readUInt16LE(34);
 const frameBytes=channels*bits/8;
 const dataBytes=header.readUInt32LE(40);
 if(channels!==2||![16,24].includes(bits)||
    ![44100,48000,96000].includes(sampleRate)||
    header.readUInt16LE(32)!==frameBytes||
    header.readUInt32LE(28)!==sampleRate*frameBytes||
    dataBytes!==byteLength-44||dataBytes<=0||
    !Number.isInteger(dataBytes/frameBytes))
  fail("DIGITAL_PCM_NOT_SUPPORTED",422);
 return Object.freeze({channels,sampleRate,bits,frames:dataBytes/frameBytes});
}
export const RAW_V535_DOWNLOAD_TTL_MS=LINK_MS;
export function createRawDigitalPublisherV535({db,bucket,verifyProducer,now=()=>Date.now()}={}){
 if(!db||typeof db.collection!=="function"||!bucket||
    typeof bucket.file!=="function"||typeof verifyProducer!=="function")
  fail("DIGITAL_PUBLISHER_DISABLED",503);
 const col=db.collection("rawDigitalDeliveriesV535");
 return Object.freeze({
  async publish({ownerUid,artifactId,producerReceipt}={}){
   const path=safePath(ownerUid,artifactId);
   // Trusted agent/pipeline must authenticate independently of renderer user.
   if(await verifyProducer({ownerUid,artifactId,producerReceipt})!==true)
    fail("DIGITAL_PRODUCER_NOT_AUTHORIZED",403);
   const file=bucket.file(path);
   if(!file||typeof file.createReadStream!=="function"||
      typeof file.getMetadata!=="function")
    fail("DIGITAL_OBJECT_UNAVAILABLE",503);
   const [meta]=await file.getMetadata();
   const expectedLength=parseLength(meta?.size);
   if(!["audio/wav","audio/x-wav","application/octet-stream"]
       .includes(meta?.contentType))
    fail("DIGITAL_CONTENT_TYPE_INVALID",422);
   const header=Buffer.alloc(44);
   let got=0,bytes=0;
   const hash=createHash("sha256");
   for await(const rawChunk of file.createReadStream()){
    const chunk=Buffer.isBuffer(rawChunk)?rawChunk:Buffer.from(rawChunk);
    bytes+=chunk.length;
    if(bytes>BYTES_MAX||bytes>expectedLength)
     fail("DIGITAL_OBJECT_TOO_LARGE",422);
    if(got<44){
     const n=Math.min(44-got,chunk.length);
     chunk.copy(header,got,0,n);got+=n;
    }
    hash.update(chunk);
   }
   if(got!==44||bytes!==expectedLength)
    fail("DIGITAL_OBJECT_TRUNCATED",422);
   const wav=parseCanonicalWav(header,bytes);
   const sha256=hash.digest("hex");
   const createdAtMs=now();
   if(!integer(createdAtMs))fail("SERVER_CLOCK_INVALID",503);
   const document={ownerUid,artifactId,objectPath:path,sha256,
    bytes,channels:wav.channels,bits:wav.bits,
    sampleRate:wav.sampleRate,frames:wav.frames,
    status:"ready",integrityVerified:true,
    qcStatus:"DIGITAL_INTEGRITY_PASS",digitalOnly:true,
    analogCaptured:false,createdAtMs};
   // Create-only immutable document; never overwrite another user's output.
   await col.doc(artifactId).create(document);
   return Object.freeze({artifactId,sha256,bytes,
    ...wav,digitalOnly:true,analogCaptured:false});
  }
 });
}
export function createRawDigitalDeliveryV535({db,bucket,identity,now=()=>Date.now()}={}){
 if(!db||typeof db.collection!=="function"||
    !bucket||typeof bucket.file!=="function"||
    !identity||typeof identity.verify!=="function")
  fail("DIGITAL_DELIVERY_DISABLED",503);
 const col=db.collection("rawDigitalDeliveriesV535");
 return Object.freeze({
  async authorizeDownload({authorization,artifactId}={}){
   // Identity is always verified by Firebase Admin server, never by renderer.
   const actor=await identity.verify(authorization);
   if(!valid(actor?.uid,UID)||!valid(artifactId,ID))
    fail("DIGITAL_ARTIFACT_NOT_FOUND",404);
   const snap=await col.doc(artifactId).get();
   const item=snap.exists?snap.data():null;
   if(!item||item.ownerUid!==actor.uid)
    fail("DIGITAL_ARTIFACT_NOT_FOUND",404);
   if(item.status!=="ready"||item.integrityVerified!==true||
      item.qcStatus!=="DIGITAL_INTEGRITY_PASS"||
      item.digitalOnly!==true||item.analogCaptured!==false||
      !valid(item.sha256,SHA)||!integer(item.bytes)||
      !integer(item.frames)||item.frames<=0||
      item.channels!==2||![16,24].includes(item.bits)||
      ![44100,48000,96000].includes(item.sampleRate)||
      item.objectPath!==safePath(actor.uid,artifactId))
    fail("DIGITAL_ARTIFACT_UNVERIFIED",409);
   const file=bucket.file(item.objectPath);
   const [meta]=await file.getMetadata();
   if(parseLength(meta?.size)!==item.bytes)
    fail("DIGITAL_OBJECT_CHANGED",503);
   const timestamp=now();
   if(!integer(timestamp))fail("SERVER_CLOCK_INVALID",503);
   if(typeof file.getSignedUrl!=="function")
    fail("DIGITAL_SIGNER_UNAVAILABLE",503);
   const expiresAtMs=timestamp+LINK_MS;
   const [url]=await file.getSignedUrl({
    version:"v4",action:"read",expires:expiresAtMs,
    responseType:"audio/wav",
    responseDisposition:"attachment; filename=\"RAW-digital-"+artifactId+".wav\""
   });
   if(typeof url!=="string"||!url.startsWith("https://"))
    fail("DIGITAL_SIGNED_URL_INVALID",503);
   return Object.freeze({downloadUrl:url,expiresAtMs,
    sha256:item.sha256,bytes:item.bytes,
    channels:item.channels,bits:item.bits,
    sampleRate:item.sampleRate,frames:item.frames,
    digitalOnly:true,analogCaptured:false});
  }
 });
}
