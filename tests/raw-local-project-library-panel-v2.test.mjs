import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const script=readFileSync(new URL("../raw-local-project-library-panel-v2.js",import.meta.url),"utf8");
function fixture(){
 const records=[], versions=new Map();
 let allowed=true,confirmed=true,staged=0,downloaded=0;
 const library={
  MAX_REVISIONS:8,MAX_PROJECTS:30,
  async list(){return [...records];},
  async revisions(id){return versions.get(id)||[];},
  async saveCurrent(draft){
   const id=draft.projectId||"12345678-1234-1234-1234-123456789012";
   let row=records.find(x=>x.id===id);
   if(!row){
    row={id,title:draft.projectName,sourceNames:["Source.wav"],sourceCount:1,
     latestRevision:0,updatedAt:new Date().toISOString()};records.push(row);
   }
   row.latestRevision++;
   const saved={projectId:id,revision:row.latestRevision,savedAt:row.updatedAt,
    bytes:100,blob:{size:100},sourceCount:1};
   versions.set(id,[saved,...(versions.get(id)||[])]);
   return {record:row};
  },
  async saveBlob(file){return this.saveCurrent({projectName:"Imported Project"});},
  async openVersion(id,revision){
   return {record:{projectId:id,revision},
    blob:{size:100},sources:[{name:"Source.wav",size:6}],
    manifest:{projectName:"Imported Project",sources:[{name:"Source.wav",
     sha256:"a".repeat(64)}],checkpoints:[{}],rack:{
     chainOrder:["bettermaker_eq","ngbuscomp","ngtubecomp"]}}};
  },
  async remove(id){
   const index=records.findIndex(x=>x.id===id);
   if(index>=0)records.splice(index,1);
   versions.delete(id);return true;
  }
 };
 class Element{
  constructor(){this.handlers={};this.value="";this.textContent="";this.disabled=false;
   this.children=[];this.files=[];this.firstChild=null;}
  addEventListener(name,fn){this.handlers[name]=fn;}
  click(){return this.handlers.click?.();}
  change(){return this.handlers.change?.({target:this});}
  appendChild(x){this.children.push(x);this.firstChild=this.children[0];}
  removeChild(x){this.children.splice(this.children.indexOf(x),1);this.firstChild=this.children[0]||null;}
 }
 class Panel extends Element{
  constructor(){super();this.map=new Map();}
  querySelector(q){if(!this.map.has(q))this.map.set(q,new Element());return this.map.get(q);}
  querySelectorAll(){return [];}
 }
 const host={panel:null,querySelector(q){return q===".raw-library-panel"?this.panel:null;},
  prepend(p){this.panel=p;}};
 const window={document:{createElement:()=>new Panel()},
  RAWLocalProjectLibraryV2:{create:()=>library},
  RAWPortableProjectV1:{downloadName:()=>"archive.rawproj",
   download:()=>{downloaded++;}},
  confirm:()=>confirmed
 };
 vm.runInNewContext(script,{window,console});
 window.RAWLocalProjectLibraryPanelV2.attach(host,{
  readArchive:()=>({kind:"RAW_LOCAL_CHAIN_ARCHIVE"}),
  getSources:()=>[{name:"Source.wav"}],
  getDraft:()=>({projectName:"A Session",notes:"Original",history:[{}]}),
  canStageSources:()=>allowed,
  stageSources:async x=>{staged++;return true;}
 });
 const find=s=>host.panel.querySelector(s);
 const act=s=>find('[data-library="'+s+'"]').click();
 const flush=async()=>new Promise(r=>setImmediate(r));
 return {window,library,host,records,versions,find,act,flush,
  set allowed(v){allowed=v;},set confirmed(v){confirmed=v;},
  get staged(){return staged;},get downloaded(){return downloaded;}};
}
test("saving a new local project exposes a selectable revision",async()=>{
 const h=fixture();await h.flush();
 await h.act("new");
 assert.equal(h.records.length,1);
 assert.equal(h.records[0].latestRevision,1);
 assert.equal(h.find("[data-library-version]").value,"1");
 assert.match(h.find(".raw-library-status").textContent,/SAVED NEW PROJECT/);
});
test("saving a newer revision preserves the old version entry",async()=>{
 const h=fixture();await h.flush();
 await h.act("new");await h.act("version");
 assert.equal(h.records[0].latestRevision,2);
 assert.equal(h.versions.get(h.records[0].id).length,2);
 assert.equal(h.find("[data-library-version]").value,"2");
});
test("opening a selected version is read-only; source staging requires local guard and consent",async()=>{
 const h=fixture();await h.flush();
 await h.act("new");await h.act("open");
 assert.match(h.find(".raw-library-detail").textContent,/READ-ONLY OPEN/);
 assert.equal(h.staged,0);
 h.allowed=false;await h.act("stage");
 assert.equal(h.staged,0);
 h.allowed=true;h.confirmed=false;await h.act("stage");
 assert.equal(h.staged,0);
 h.confirmed=true;await h.act("stage");
 assert.equal(h.staged,1);
 assert.match(h.find(".raw-library-status").textContent,/STAGED 1 local source/);
});
test("deleting requires explicit confirmation and removes every version",async()=>{
 const h=fixture();await h.flush();
 await h.act("new");await h.act("version");
 h.confirmed=false;await h.act("delete");
 assert.equal(h.records.length,1);
 h.confirmed=true;await h.act("delete");
 assert.equal(h.records.length,0);
 assert.equal(h.versions.size,0);
 assert.match(h.find(".raw-library-status").textContent,/PROJECT DELETED/);
});
test("download reads and verifies requested version before local transfer",async()=>{
 const h=fixture();await h.flush();
 await h.act("new");await h.act("download");
 assert.equal(h.downloaded,1);
 assert.match(h.find(".raw-library-status").textContent,/DOWNLOADED/);
});
test("bad project files are never stored or staged",async()=>{
 const h=fixture();await h.flush();
 const field=h.find("[data-library-file]");
 field.files=[{name:"executable.exe",size:20}];
 await field.change();
 assert.equal(h.records.length,0);
 assert.equal(h.staged,0);
 assert.match(h.find(".raw-library-status").textContent,/LIBRARY ERROR/);
});
test("new project browser performs no remote studio requests or direct control writes",()=>{
 assert.doesNotMatch(script,/fetch\(|WebSocket|sendControlMessage|updateDoc|runTransaction|\.parameter\(|\.restore\(/);
 assert.match(script,/textContent=String\(label\)/);
 assert.match(script,/Source staging|STAGE SOURCES/);
 assert.match(script,/PERMANENTLY DELETE LOCAL PROJECT/);
});
