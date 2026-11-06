/* RAW Local Project Library V2 — local IndexedDB shelf, no studio access.
 * All user-controlled strings are displayed using textContent, never innerHTML.
 */
(function(global){
"use strict";
function attach(host,{getDraft,readArchive,getSources,canStageSources,stageSources}={}){
 if(!host||!global.document||!global.RAWLocalProjectLibraryV2||
   typeof readArchive!=="function"||typeof getSources!=="function")return;
 if(host.querySelector(".raw-library-panel"))return;
 let busy=false,opened=null,library;
 try{library=global.RAWLocalProjectLibraryV2.create();}
 catch(e){console.warn("Local library initialization unavailable",e);return;}
 const panel=global.document.createElement("section");
 panel.className="raw-library-panel";
 panel.innerHTML=
  '<div class="raw-library-heading"><strong>MY RAW PROJECTS · LOCAL LIBRARY V2</strong>'+
  '<span>STORED ONLY ON THIS PC · ORIGINAL AUDIO INCLUDED</span></div>'+
  '<div class="raw-library-actions">'+
  '<button type="button" data-library="new">+ SAVE NEW PROJECT</button>'+
  '<button type="button" data-library="version">+ SAVE NEW VERSION</button>'+
  '<label class="raw-library-file">↑ ADD .RAWPROJ TO LIBRARY<input data-library-file type="file" accept=".rawproj" hidden></label>'+
  '<button type="button" data-library="refresh">REFRESH LIBRARY</button></div>'+
  '<div class="raw-library-pickers">'+
  '<label>PROJECT <select data-library-project aria-label="Stored RAW project"><option value="">No saved projects yet</option></select></label>'+
  '<label>VERSION <select data-library-version aria-label="Stored RAW project revision"><option value="">Select a project first</option></select></label></div>'+
  '<div class="raw-library-actions">'+
  '<button type="button" data-library="open">OPEN / VERIFY (READ ONLY)</button>'+
  '<button type="button" data-library="compare">COMPARE SAVED RACK</button>'+
  '<button type="button" data-library="rack-json">↓ EXPORT RACK JSON</button>'+
  '<button type="button" data-library="stage">STAGE SOURCES · LOCAL TEST</button>'+
  '<button type="button" data-library="download">↓ DOWNLOAD .RAWPROJ</button>'+
  '<button type="button" data-library="delete">DELETE PROJECT…</button></div>'+
  '<div class="raw-library-status" role="status">Local library initializing. Nothing is uploaded to any server.</div>'+
  '<pre class="raw-library-detail" aria-live="polite">Only original source audio and local rack settings are stored. No masters, billing or studio credentials.</pre>';
 host.prepend(panel);
 const one=s=>panel.querySelector(s);
 const proj=one("[data-library-project]"),version=one("[data-library-version]");
 const status=s=>{one(".raw-library-status").textContent=s;};
 const detail=s=>{one(".raw-library-detail").textContent=s;};
 const setBusy=value=>{
  busy=!!value;panel.querySelectorAll("button").forEach(button=>{button.disabled=busy;});
 };
 const clearOptions=select=>{
  while(select.firstChild)select.removeChild(select.firstChild);
 };
 const option=(select,value,label)=>{
  const el=global.document.createElement("option");
  el.value=String(value);el.textContent=String(label);select.appendChild(el);
 };
 const chosen=()=>({projectId:proj.value,revision:Number(version.value)});
 const resetOpened=()=>{opened=null;};
 async function populateVersions(projectId,preferred=null){
  resetOpened();clearOptions(version);
  if(!projectId){option(version,"","Select a project");return;}
  const versions=await library.revisions(projectId);
  for(const item of versions)
   option(version,item.revision,"v"+item.revision+" · "+new Date(item.savedAt).toLocaleString()+" · "+Math.round(item.bytes/1024)+" KiB");
  const match=versions.find(x=>x.revision===preferred);
  if(versions.length)version.value=String(match?.revision||versions[0].revision);
 }
 async function refresh({preferredId=null,preferredRevision=null}={}){
  const records=await library.list();
  const old=preferredId||proj.value;
  clearOptions(proj);
  if(!records.length){option(proj,"","No saved projects yet");await populateVersions("");return;}
  for(const item of records)
   option(proj,item.id,item.title+" · v"+item.latestRevision+" · "+item.sourceCount+" audio");
  const selected=records.find(x=>x.id===old)||records[0];
  proj.value=selected.id;
  await populateVersions(selected.id,preferredRevision);
  detail("LIBRARY: "+records.length+" project(s)\nSELECTED: "+selected.title+
   "\nSOURCES: "+selected.sourceNames.join(", ")+
   "\nVERSIONS: "+selected.latestRevision+"/"+library.MAX_REVISIONS+
   "\nLOCAL STORAGE ONLY · NOT AN ANALOG MASTER");
 }
 async function run(action){
  if(busy)return;
  setBusy(true);
  try{await action();}
  catch(error){
   console.warn("RAW library operation rejected",error);
   status("LIBRARY ERROR: "+String(error.message||error)+
    " · original .rawproj export remains available");
  }finally{setBusy(false);}
 }
 const makeDraft=()=>{
  const draft=typeof getDraft==="function"?getDraft():null;
  return {projectName:draft?.projectName||"RAW Mastering Project",
   notes:draft?.notes||"",history:draft?.history||[],
   rack:readArchive(),sources:getSources()};
 };
 one('[data-library="new"]').addEventListener("click",()=>run(async()=>{
  const result=await library.saveCurrent(makeDraft());
  await refresh({preferredId:result.record.id,preferredRevision:1});
  status("SAVED NEW PROJECT · v1 · embedded original audio verified and stored locally");
 }));
 one('[data-library="version"]').addEventListener("click",()=>run(async()=>{
  const {projectId}=chosen();
  if(!projectId)throw new Error("Choose an existing project first");
  const result=await library.saveCurrent({...makeDraft(),projectId});
  await refresh({preferredId:result.record.id,preferredRevision:result.record.latestRevision});
  status("NEW REVISION SAVED · v"+result.record.latestRevision+" (previous versions kept)");
 }));
 one("[data-library-file]").addEventListener("change",async event=>{
  const file=event.target.files?.[0];event.target.value="";
  if(!file)return;
  await run(async()=>{
   if(!String(file.name||"").toLowerCase().endsWith(".rawproj"))
    throw new Error("Choose a .rawproj project file");
   const result=await library.saveBlob(file);
   await refresh({preferredId:result.record.id,preferredRevision:1});
   status("IMPORTED .RAWPROJ TO LIBRARY · audio SHA-256 verified · no live rack changes");
  });
 });
 one('[data-library="refresh"]').addEventListener("click",()=>run(async()=>{
  await refresh();status("Project library refreshed");
 }));
 proj.addEventListener("change",()=>run(async()=>{
  await populateVersions(proj.value);
  detail("Select OPEN / VERIFY to inspect this project. No live controls will be changed.");
 }));
 version.addEventListener("change",resetOpened);
 one('[data-library="open"]').addEventListener("click",()=>run(async()=>{
  const {projectId,revision}=chosen();
  if(!projectId||!revision)throw new Error("Choose a project and revision first");
  const result=await library.openVersion(projectId,revision);
  opened=result;
  const m=result.manifest;
  detail("VERIFIED LOCAL PROJECT · "+m.projectName+" · v"+revision+
   "\nSOURCES: "+m.sources.map(s=>s.name+" · SHA-256 "+s.sha256.slice(0,16)+"…").join("\n         ")+
   "\nCHECKPOINTS: "+m.checkpoints.length+
   (m.checkpoints.length?"\n"+m.checkpoints.map((v,i)=>
    "  "+(i+1)+". "+v.label+" · "+new Date(v.when).toLocaleString()).join("\n"):"")+
   "\nRACK: "+m.rack.chainOrder.join(" → ")+
   "\nREAD-ONLY OPEN · AUDIO NOT STAGED · RACK NOT APPLIED");
  status("OPEN / VERIFY OK · every embedded audio checksum verified · nothing applied");
 }));
 one('[data-library="compare"]').addEventListener("click",()=>run(async()=>{
  const {projectId,revision}=chosen();
  if(!opened||opened.record.projectId!==projectId||opened.record.revision!==revision)
   throw new Error("OPEN / VERIFY the saved revision first");
  const current=global.RAWChainArchiveV1?.parse(JSON.stringify(readArchive()));
  const planner=global.RAWChainRecallPlannerV2;
  if(!current||!planner?.createPlan)throw new Error("Local rack comparator unavailable");
  const plan=planner.createPlan(opened.manifest.rack,current);
  detail("READ-ONLY LIBRARY RACK COMPARE · "+plan.summary.changed+" DIFFERENCES\n"+
   planner.summarize(plan,32)+"\n\nNO LIVE CONTROLS CHANGED");
  status("Saved v"+revision+" rack compared against active UI · read-only");
 }));
 one('[data-library="rack-json"]').addEventListener("click",()=>run(async()=>{
  const {projectId,revision}=chosen();
  if(!opened||opened.record.projectId!==projectId||opened.record.revision!==revision)
   throw new Error("OPEN / VERIFY the saved revision first");
  const archiveAPI=global.RAWChainArchiveV1;
  if(!archiveAPI?.download)throw new Error("Chain Archive downloader is unavailable");
  const name=archiveAPI.download(opened.manifest.rack);
  status("Downloaded saved rack JSON: "+name+" · no live recall");
 }));
 one('[data-library="stage"]').addEventListener("click",()=>run(async()=>{
  const {projectId,revision}=chosen();
  if(!opened||opened.record.projectId!==projectId||opened.record.revision!==revision)
   throw new Error("Click OPEN / VERIFY for the selected version first");
  if(typeof canStageSources!=="function"||canStageSources()!==true)
   throw new Error("Start LOCAL TEST and disconnect Gateway/Agent/DAW Bridge first");
  if(typeof stageSources!=="function")throw new Error("Local audio staging adapter is unavailable");
  if(typeof global.confirm!=="function"||!global.confirm(
    "Replace current LOCAL TEST audio sources with this verified project version? Rack knobs will NOT change. Nothing will be uploaded."
  )){status("Source staging cancelled · no changes");return;}
  const result=await stageSources([...opened.sources]);
  if(result!==true)throw new Error("Source staging declined");
  status("STAGED "+opened.sources.length+" local source(s) · active rack unchanged · no upload");
  detail("Audio sources restored to current LOCAL TEST. To use the saved rack, "+
    "export .rawproj and compare/preview its settings separately.");
 }));
 one('[data-library="download"]').addEventListener("click",()=>run(async()=>{
  const {projectId,revision}=chosen();
  if(!projectId||!revision)throw new Error("Choose project version first");
  const result=await library.openVersion(projectId,revision);
  global.RAWPortableProjectV1.download({
   blob:result.blob,
   filename:global.RAWPortableProjectV1.downloadName(result.manifest.projectName)
  });
  status("DOWNLOADED "+result.manifest.projectName+" v"+revision+" · .rawproj · original audio included");
 }));
 one('[data-library="delete"]').addEventListener("click",()=>run(async()=>{
  const {projectId}=chosen();
  if(!projectId)throw new Error("Choose a saved project first");
  const records=await library.list();
  const item=records.find(x=>x.id===projectId);
  if(!item)throw new Error("Project no longer exists");
  if(typeof global.confirm!=="function"||!global.confirm(
    "PERMANENTLY DELETE LOCAL PROJECT '"+item.title+"' AND ALL ITS VERSIONS from this PC? Export a backup .rawproj first."
  )){status("Project deletion cancelled");return;}
  await library.remove(projectId);resetOpened();await refresh({preferredId:null});
  status("PROJECT DELETED · all stored versions removed from local library");
 }));
 run(async()=>{await refresh();status("LOCAL LIBRARY READY · stored only in this Electron profile / browser");});
}
global.RAWLocalProjectLibraryPanelV2={attach};
})(typeof window!=="undefined"?window:globalThis);
