import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {webcrypto} from "node:crypto";
import {File} from "node:buffer";
import vm from "node:vm";

const sources=[
 "bettermaker-engine-v3.js","bettermaker-manual-v4.js",
 "ngbuscomp-control-v1.js","ngtubecomp-control-v1.js",
 "raw-chain-archive-v1.js","raw-portable-project-v1.js","raw-local-project-library-v2.js"
];
function fixture(){
 const ctx={window:{crypto:webcrypto,File,Blob},TextEncoder,TextDecoder,
  Blob,File,Uint8Array,DataView,Date,JSON};
 vm.createContext(ctx);
 for(const src of sources)vm.runInContext(
  readFileSync(new URL("../"+src,import.meta.url),"utf8"),ctx);
 const w=ctx.window;
 const meq=new w.RAWBettermakerEngineV3.StudioEQ(),
  manual=new w.RAWBettermakerManualV4.ManualMEQ(meq),
  bus=new w.RAWNgBusCompV1.Model(),tube=new w.RAWNgTubeCompV1.Model();
 const capture=()=>w.RAWChainArchiveV1.capture({
  chainOrder:["bettermaker_eq","ngbuscomp","ngtubecomp"],meq,manual,bus,tube,label:"Rack"
 });
 const audio=new File([Uint8Array.from([82,73,70,70,11,12,13,14])],
  "Test.wav",{type:"audio/wav"});
 const projects=new Map(),versions=new Map();
 const backend={
  async list(){return [...projects.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));},
  async revisions(id){return [...versions.values()].filter(x=>x.projectId===id).sort((a,b)=>b.revision-a.revision);},
  async get(id,revision){const row=versions.get(id+"@"+revision);
   if(!row)throw Object.assign(new Error("Not found"),{code:"NOT_FOUND"});return row;},
  async save({id,blob,manifest,createdAt}){
   const prior=projects.get(id),revision=(prior?.latestRevision||0)+1;
   if(revision>8)throw Object.assign(new Error("Revision limit"),{code:"REVISION_LIMIT"});
   const meta={id,title:manifest.projectName,createdAt:prior?.createdAt||createdAt,
    updatedAt:createdAt,latestRevision:revision,sourceCount:manifest.sources.length,
    sourceNames:manifest.sources.map(s=>s.name),bytes:blob.size};
   projects.set(id,meta);
   versions.set(id+"@"+revision,{key:id+"@"+revision,projectId:id,revision,blob,
    savedAt:createdAt,bytes:blob.size,sourceCount:manifest.sources.length});
   return {...meta};
  },
  async remove(id){
   projects.delete(id);
   for(const key of [...versions.keys()])if(key.startsWith(id+"@"))versions.delete(key);
   return true;
  }
 };
 const lib=w.RAWLocalProjectLibraryV2.create({
  backend,portable:w.RAWPortableProjectV1,cryptoRef:webcrypto,FileCtor:File
 });
 const draft=(options={})=>({projectName:"RAW Studio Album",notes:"Mix notes",
  rack:capture(),sources:[audio],history:[],...options});
 return {w,meq,bus,tube,capture,audio,backend,projects,versions,lib,draft};
}
test("save project to local library and reopen embedded original audio",async()=>{
 const h=fixture(),stored=await h.lib.saveCurrent(h.draft());
 assert.equal(stored.record.latestRevision,1);
 assert.match(stored.record.id,/^[a-f0-9-]{20,64}$/i);
 const rows=await h.lib.list();
 assert.equal(rows.length,1);
 assert.equal(rows[0].title,"RAW Studio Album");
 assert.equal(rows[0].sourceCount,1);
 assert.equal(rows[0].sourceNames[0],"Test.wav");
 const opened=await h.lib.openVersion(stored.record.id,1);
 assert.equal(opened.manifest.projectName,"RAW Studio Album");
 assert.equal(opened.verifiedSourceDigests,true);
 assert.equal(opened.masterIncluded,false);
 assert.equal(opened.hardwareApplied,false);
 assert.deepEqual([...new Uint8Array(await opened.sources[0].arrayBuffer())],
  [...new Uint8Array(await h.audio.arrayBuffer())]);
});
test("manual revision 2 keeps older bytes and local rack snapshot unchanged",async()=>{
 const h=fixture(),first=await h.lib.saveCurrent(h.draft());
 const old=await h.lib.openVersion(first.record.id,1);
 h.bus.parameter("L","threshold",-12);
 const next=await h.lib.saveCurrent(h.draft({projectId:first.record.id}));
 assert.equal(next.record.latestRevision,2);
 assert.equal((await h.lib.revisions(first.record.id)).length,2);
 const newVersion=await h.lib.openVersion(first.record.id,2);
 assert.equal(old.manifest.rack.deviceStates.ngbuscomp.banks[1].A.channels.L.threshold,-8.5);
 assert.equal(newVersion.manifest.rack.deviceStates.ngbuscomp.banks[1].A.channels.L.threshold,-12);
 assert.equal(h.bus.state.channels.L.threshold,-12);
});
test("import valid .rawproj package as new library project without touching original models",async()=>{
 const h=fixture(),snapshot=JSON.stringify(h.capture().deviceStates);
 const packageFile=await h.w.RAWPortableProjectV1.create(h.draft());
 const stored=await h.lib.saveBlob(new File([packageFile.blob],"import.rawproj"));
 assert.equal(stored.record.latestRevision,1);
 assert.equal(JSON.stringify(h.capture().deviceStates),snapshot);
 assert.equal((await h.lib.openVersion(stored.record.id,1)).sources.length,1);
});
test("tampering stored source fails OPEN verification, never returns untrusted audio",async()=>{
 const h=fixture(),saved=await h.lib.saveCurrent(h.draft()),id=saved.record.id;
 const row=h.versions.get(id+"@1"),raw=new Uint8Array(await row.blob.arrayBuffer());
 raw[raw.length-1]^=0x0F;
 row.blob=new Blob([raw]);
 await assert.rejects(()=>h.lib.openVersion(id,1),e=>e.code==="SOURCE_CHECKSUM");
});
test("tampered imported source cannot enter local library",async()=>{
 const h=fixture(),packageFile=await h.w.RAWPortableProjectV1.create(h.draft());
 const data=new Uint8Array(await packageFile.blob.arrayBuffer());
 data[data.length-2]^=0x0A;
 await assert.rejects(()=>h.lib.saveBlob(new File([data],"tampered.rawproj")),
  e=>e.code==="SOURCE_CHECKSUM");
 assert.equal((await h.lib.list()).length,0);
});
test("remove project deletes all version records and can no longer open it",async()=>{
 const h=fixture(),saved=await h.lib.saveCurrent(h.draft());
 await h.lib.saveCurrent(h.draft({projectId:saved.record.id}));
 await h.lib.remove(saved.record.id);
 assert.equal((await h.lib.list()).length,0);
 assert.equal((await h.lib.revisions(saved.record.id)).length,0);
 await assert.rejects(()=>h.lib.openVersion(saved.record.id,1),e=>e.code==="NOT_FOUND");
});
test("saving revision for unknown project fails without creating stray record",async()=>{
 const h=fixture();
 await assert.rejects(()=>h.lib.saveCurrent(h.draft({
  projectId:"deadbeef000000000000000000000000"
 })),e=>e.code==="NOT_FOUND");
 assert.equal((await h.lib.list()).length,0);
});
test("exactly eight versions are kept and ninth is refused",async()=>{
 const h=fixture(),first=await h.lib.saveCurrent(h.draft());
 for(let i=2;i<=8;i++)await h.lib.saveCurrent(h.draft({projectId:first.record.id}));
 assert.equal((await h.lib.revisions(first.record.id)).length,8);
 await assert.rejects(()=>h.lib.saveCurrent(h.draft({projectId:first.record.id})),
  e=>e.code==="REVISION_LIMIT");
 assert.equal((await h.lib.revisions(first.record.id)).length,8);
});
test("project count stops after 30 manually saved projects",async()=>{
 const h=fixture();
 for(let i=1;i<=30;i++)await h.lib.saveCurrent(h.draft({projectName:"Project "+i}));
 assert.equal((await h.lib.list()).length,30);
 await assert.rejects(()=>h.lib.saveCurrent(h.draft()),
  e=>e.code==="PROJECT_LIMIT");
});
test("local library is separate from studio credentials and needs SHA-256",()=>{
 const content=readFileSync(new URL("../raw-local-project-library-v2.js",import.meta.url),"utf8");
 assert.doesNotMatch(content,/fetch\(|WebSocket|updateDoc|runTransaction|ipcRenderer|sendControlMessage/);
 assert.match(content,/IndexedDB/);
 assert.match(content,/verifiedSourceDigests!==true/);
 assert.match(content,/sourceNames/);
 assert.match(content,/REVISION_LIMIT/);
});
