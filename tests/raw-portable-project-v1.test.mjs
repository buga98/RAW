import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {webcrypto} from "node:crypto";
import {File} from "node:buffer";
import vm from "node:vm";

const scripts=["raw-chain-archive-v1.js","raw-portable-project-v1.js",
 "bettermaker-engine-v3.js","bettermaker-manual-v4.js",
 "ngbuscomp-control-v1.js","ngtubecomp-control-v1.js"];
function fixture(){
 const context={window:{crypto:webcrypto,File,Blob},TextEncoder,TextDecoder,
  Blob,File,Uint8Array,DataView,Date};
 // Keep the VM's native JSON intrinsic; injecting host JSON changes object prototypes.
 vm.createContext(context);
 for(const name of scripts)
  vm.runInContext(readFileSync(new URL("../"+name,import.meta.url),"utf8"),context);
 const w=context.window;
 const meq=new w.RAWBettermakerEngineV3.StudioEQ(),
  manual=new w.RAWBettermakerManualV4.ManualMEQ(meq),
  bus=new w.RAWNgBusCompV1.Model(),
  tube=new w.RAWNgTubeCompV1.Model();
 const rack=w.RAWChainArchiveV1.capture({
  chainOrder:["bettermaker_eq","ngbuscomp","ngtubecomp"],
  meq,manual,bus,tube,label:"Test rack"
 });
 const audio=new File([Uint8Array.from([82,73,70,70,0,0,0,0,87,65,86,69])],
  "Track One.wav",{type:"audio/wav"});
 const second=new File([Uint8Array.from([1,2,3,4,5,6,7,8,9])],
  "Track 2.mp3",{type:"audio/mpeg"});
 const api=w.RAWPortableProjectV1;
 return {api,rack,audio,second,File,window:w};
}
async function make(h,opts={}){
 return h.api.create({projectName:"Track A",notes:"Revision 1",
   rack:h.rack,sources:[h.audio,h.second],
   history:[{when:new Date().toISOString(),label:"Before EQ",archive:h.rack}],...opts});
}
test("save and reopen a complete portable project with both original audio sources",async()=>{
 const h=fixture(),pack=await make(h);
 assert.match(pack.filename,/\.rawproj$/);
 assert.equal(pack.audioEmbedded,true);
 assert.equal(pack.analogMaster,false);
 assert.equal(pack.manifest.sources.length,2);
 assert.equal(pack.manifest.checkpoints.length,1);
 const input=new h.File([pack.blob],"test.rawproj");
 const opened=await h.api.parse(input);
 assert.equal(opened.verifiedSourceDigests,true);
 assert.equal(opened.audioStaged,false);
 assert.equal(opened.physicalHardwareVerified,false);
 assert.equal(opened.manifest.projectName,"Track A");
 assert.equal(opened.manifest.rack.deviceStates.ngtubecomp.preset,"A");
 assert.equal(opened.sources.length,2);
 assert.equal(opened.sources[0].name,"Track One.wav");
 assert.equal(opened.sources[1].name,"Track 2.mp3");
 assert.deepEqual([...new Uint8Array(await opened.sources[0].arrayBuffer())],
  [...new Uint8Array(await h.audio.arrayBuffer())]);
 assert.deepEqual([...new Uint8Array(await opened.sources[1].arrayBuffer())],
  [...new Uint8Array(await h.second.arrayBuffer())]);
});
test("per-source SHA-256 checksums identify corrupted embedded audio",async()=>{
 const h=fixture(),saved=await make(h),raw=new Uint8Array(await saved.blob.arrayBuffer());
 raw[raw.length-2]^=0x55;
 await assert.rejects(()=>h.api.parse(new h.File([raw],"tampered.rawproj")),
  e=>e.code==="SOURCE_CHECKSUM");
});
test("bad magic, truncated payload and incorrect manifest lengths are refused",async()=>{
 const h=fixture(),saved=await make(h);
 const data=new Uint8Array(await saved.blob.arrayBuffer());
 const wrong=data.slice();wrong[0]=0;
 await assert.rejects(()=>h.api.parse(new h.File([wrong],"wrong.rawproj")),
  e=>e.code==="PROJECT_MAGIC");
 await assert.rejects(()=>h.api.parse(new h.File([data.slice(0,-1)],"truncated.rawproj")),
  e=>e.code==="PROJECT_LENGTH");
 const broken=data.slice();
 new DataView(broken.buffer).setUint32("RAWPROJECTV1\n".length,0xFFFFFFFF,true);
 await assert.rejects(()=>h.api.parse(new h.File([broken],"invalid.rawproj")),
  e=>e.code==="MANIFEST_SIZE");
});
test("manifest false hardware/master claims cannot be imported",async()=>{
 const h=fixture(),pack=await make(h),raw=new Uint8Array(await pack.blob.arrayBuffer());
 const old=new DataView(raw.buffer).getUint32("RAWPROJECTV1\n".length,true);
 const start="RAWPROJECTV1\n".length+4;
 const meta=JSON.parse(new TextDecoder().decode(raw.slice(start,start+old)));
 meta.provenance.masterIncluded=true;
 const utf8=new TextEncoder().encode(JSON.stringify(meta));
 const hdr=raw.slice(0,start);
 new DataView(hdr.buffer).setUint32("RAWPROJECTV1\n".length,utf8.byteLength,true);
 const changed=new h.File([hdr,utf8,raw.slice(start+old)],"forged.rawproj");
 await assert.rejects(()=>h.api.parse(changed),
  e=>e.code==="MANIFEST_PROVENANCE");
});
test("manifest cannot include project credentials, unknown data or links",async()=>{
 const h=fixture(),pack=await make(h),raw=new Uint8Array(await pack.blob.arrayBuffer());
 const old=new DataView(raw.buffer).getUint32("RAWPROJECTV1\n".length,true);
 const start="RAWPROJECTV1\n".length+4;
 const meta=JSON.parse(new TextDecoder().decode(raw.slice(start,start+old)));
 meta.clientToken="secret";
 const utf8=new TextEncoder().encode(JSON.stringify(meta));
 const hdr=raw.slice(0,start);
 new DataView(hdr.buffer).setUint32("RAWPROJECTV1\n".length,utf8.byteLength,true);
 await assert.rejects(()=>h.api.parse(new h.File([hdr,utf8,raw.slice(start+old)],"bad.rawproj")),
  e=>e.code==="MANIFEST_FIELD");
});
test("missing audio, invalid names and oversize sources are blocked on export",async()=>{
 const h=fixture();
 await assert.rejects(()=>h.api.create({rack:h.rack,sources:[]}),e=>e.code==="SOURCE_COUNT");
 await assert.rejects(()=>h.api.create({rack:h.rack,sources:[
  new h.File([new Uint8Array(4)],"malware.exe")]}),e=>e.code==="AUDIO_NAME");
 const huge={name:"large.wav",type:"audio/wav",size:129*1024*1024,
  arrayBuffer:async()=>{throw new Error("must not read");}};
 await assert.rejects(()=>h.api.create({rack:h.rack,sources:[huge]}),e=>e.code==="AUDIO_SIZE");
});
test("8 manual project checkpoints allowed, 9 refused",async()=>{
 const h=fixture(),history=Array.from({length:8},(_,i)=>({
  when:new Date().toISOString(),label:"Step "+i,archive:h.rack
 }));
 const result=await h.api.create({rack:h.rack,sources:[h.audio],history});
 assert.equal(result.manifest.checkpoints.length,8);
 await assert.rejects(()=>h.api.create({rack:h.rack,sources:[h.audio],
  history:[...history,history[0]]}),e=>e.code==="HISTORY_LIMIT");
});
test("source filenames cannot escape an extraction directory",async()=>{
 const h=fixture(),pack=await h.api.create({rack:h.rack,
  sources:[new h.File([new Uint8Array([1])],"../escape.wav")]}),
  reopened=await h.api.parse(new h.File([pack.blob],"safe.rawproj"));
 assert.doesNotMatch(reopened.sources[0].name,/[\\/:*?"<>|]/);
 assert.equal(reopened.sources[0].name.startsWith("."),false);
});
test("incorrect source offset causes import rejection before decoding audio",async()=>{
 const h=fixture(),pack=await make(h),raw=new Uint8Array(await pack.blob.arrayBuffer());
 const start="RAWPROJECTV1\n".length+4,
  length=new DataView(raw.buffer).getUint32("RAWPROJECTV1\n".length,true);
 const meta=JSON.parse(new TextDecoder().decode(raw.slice(start,start+length)));
 meta.sources[1].offset=0;
 const utf8=new TextEncoder().encode(JSON.stringify(meta)),header=raw.slice(0,start);
 new DataView(header.buffer).setUint32("RAWPROJECTV1\n".length,utf8.length,true);
 await assert.rejects(()=>h.api.parse(new h.File([header,utf8,raw.slice(start+length)],"bad.rawproj")),
  e=>e.code==="SOURCE_METADATA");
});
test("project export contains no billing, identity, session, studio, or hardware credential fields",async()=>{
 const h=fixture(),result=await make(h);
 const json=JSON.stringify(result.manifest);
 for(const key of ["firebase","userId","clientToken","accessToken","billingSession","leaseEpoch","sessionId"]){
  assert.equal(json.includes('"'+key+'"'),false);
 }
 assert.equal(result.manifest.provenance.masterIncluded,false);
 assert.equal(result.manifest.provenance.credentialsIncluded,false);
});
