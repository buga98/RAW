/* RAW Portable Project Panel V1 — local source+checksums+manual checkpoints.
 * Import never changes the active rack or initiates studio commands. */
(function(global){
"use strict";
function attach(host,{readArchive,getSources,canStageSources,stageSources}={}){
 if(!host||!global.document||!global.RAWPortableProjectV1||
    typeof readArchive!=="function"||typeof getSources!=="function")return;
 if(host.querySelector(".raw-project-panel"))return;
 let imported=null,history=[],busy=false;
 const project=global.RAWPortableProjectV1;
 const section=global.document.createElement("section");
 section.className="raw-project-panel";
 section.innerHTML=
  '<div class="raw-project-head"><strong>RAW MASTERING PROJECT · PORTABLE V1</strong>'+
  '<span>LOCAL SOURCE + RACK + CHECKPOINTS · NOT A MASTER</span></div>'+
  '<div class="raw-project-fields">'+
  '<label>PROJECT NAME <input id="rawProjectName" maxlength="70" placeholder="My RAW project" value="RAW Mastering Project"></label>'+
  '<label>NOTES <input id="rawProjectNotes" maxlength="1000" placeholder="Version / reference notes"></label>'+
  '<label>CHECKPOINT <input id="rawProjectCheckpoint" maxlength="70" placeholder="Before mastering"></label></div>'+
  '<div class="raw-project-actions">'+
  '<button type="button" data-project="checkpoint">+ SAVE CHECKPOINT</button>'+
  '<button type="button" data-project="export">↓ EXPORT .RAWPROJ</button>'+
  '<label class="raw-project-import">↑ IMPORT .RAWPROJ<input data-project-file type="file" accept=".rawproj,application/octet-stream" hidden></label>'+
  '<button type="button" data-project="compare">COMPARE IMPORTED RACK</button>'+
  '<button type="button" data-project="extract">↓ EXPORT IMPORTED RACK JSON</button>'+
  '<button type="button" data-project="stage">STAGE SOURCES · LOCAL TEST</button></div>'+
  '<div class="raw-project-status" role="status">No project loaded. Original audio is included on export; no hardware or processed master is included.</div>'+
  '<pre class="raw-project-detail" aria-live="polite">Source audio stays on this machine until you explicitly export or stage a package.</pre>';
 host.prepend(section);
 section.getRAWPortableDraft=()=>({
  projectName:section.querySelector("#rawProjectName")?.value||"RAW Mastering Project",
  notes:section.querySelector("#rawProjectNotes")?.value||"",
  history:history.map(h=>({when:h.when,label:h.label,archive:h.archive}))
 });
 const find=s=>section.querySelector(s);
 const setStatus=message=>{find(".raw-project-status").textContent=message;};
 const detail=message=>{find(".raw-project-detail").textContent=message;};
 const lock=on=>{
  busy=on;
  section.querySelectorAll("button").forEach(b=>{b.disabled=on;});
 };
 const archive=()=>global.RAWChainArchiveV1?.parse(JSON.stringify(readArchive()));
 const describe=()=>{
  if(!imported)return "No imported project; "+history.length+" unsaved manual checkpoints.";
  return "PROJECT "+imported.manifest.projectName+
   "\nFILES: "+imported.manifest.sources.map(s=>s.name+" ("+s.bytes+" B; SHA-256 "+s.sha256.slice(0,12)+"…)").join("\n       ")+
   "\nCHECKPOINTS: "+imported.manifest.checkpoints.length+
   "\nRACK ORDER: "+imported.manifest.rack.chainOrder.join(" → ")+
   "\nSOURCE SHA-256 VERIFIED · NO ANALOG MASTER · NO LIVE RACK RECALL";
 };
 find('[data-project="checkpoint"]').addEventListener("click",()=>{
  try{
   if(busy)return;
   if(history.length>=project.MAX_HISTORY)throw new Error("Maximum 8 manual checkpoints per project");
   const name=find("#rawProjectCheckpoint")?.value||"Checkpoint "+(history.length+1);
   history.push({when:new Date().toISOString(),label:name.slice(0,70),archive:archive()});
   setStatus("Manual checkpoint "+history.length+"/8 saved in memory. Export .rawproj to persist.");
   detail(history.map((c,i)=>(i+1)+". "+c.label+" · "+c.when).join("\n"));
  }catch(e){setStatus("Checkpoint failed: "+e.message);}
 });
 find('[data-project="export"]').addEventListener("click",async()=>{
  if(busy)return;
  lock(true);
  try{
   const result=await project.create({
    projectName:find("#rawProjectName")?.value||"RAW Project",
    notes:find("#rawProjectNotes")?.value||"",
    rack:archive(),history,sources:getSources()
   });
   project.download(result);
   setStatus("Exported "+result.filename+" · "+result.manifest.sources.length+
     " original audio file(s) · "+result.manifest.checkpoints.length+
     " checkpoints · NOT A PROCESSED MASTER");
   detail("Portable RAW file includes audio bytes and SHA-256 checksums.\n"+
     "It does not contain studio credentials, credit balance, or a physical analog print.");
  }catch(e){setStatus("Project export failed: "+e.message);}
  finally{lock(false);}
 });
 find("[data-project-file]").addEventListener("change",async e=>{
  const file=e.target.files?.[0];e.target.value="";
  if(!file||busy)return;
  lock(true);
  try{
   const parsed=await project.parse(file);
   imported=parsed;
   history=parsed.manifest.checkpoints.map(c=>({when:c.when,label:c.label,archive:c.archive}));
   find("#rawProjectName").value=parsed.manifest.projectName;
   find("#rawProjectNotes").value=parsed.manifest.notes;
   setStatus("Imported "+parsed.manifest.projectName+" · "+
     parsed.sources.length+" embedded source file(s) verified; NOT STAGED OR UPLOADED");
   detail(describe());
  }catch(err){
   imported=null;history=[];
   setStatus("Project import REJECTED: "+err.message);
   detail("No audio was staged and no rack controls were modified.");
  }finally{lock(false);}
 });
 find('[data-project="compare"]').addEventListener("click",()=>{
  try{
   if(!imported)throw new Error("Import a .rawproj first");
   const now=archive(),target=imported.manifest.rack;
   const planner=global.RAWChainRecallPlannerV2;
   if(!planner?.createPlan)throw new Error("Recall planner unavailable");
   const plan=planner.createPlan(target,now);
   detail("READ-ONLY PROJECT RACK COMPARISON · "+
    plan.summary.changed+" DIFFERENCES\n"+planner.summarize(plan,28)+
    "\n\nNOTHING APPLIED · use separate Chain Archive for sandbox-only simulation");
   setStatus("Imported rack compared against local UI · no physical device recall");
  }catch(e){setStatus("Project rack compare rejected: "+e.message);}
 });
 find('[data-project="extract"]').addEventListener("click",()=>{
  try{
   if(!imported)throw new Error("Import a .rawproj first");
   const filename=global.RAWChainArchiveV1?.download(imported.manifest.rack);
   setStatus("Downloaded embedded rack "+filename+" · read-only archive");
  }catch(e){setStatus("Cannot export project rack JSON: "+e.message);}
 });
 find('[data-project="stage"]').addEventListener("click",async()=>{
  if(busy)return;
  try{
   if(!imported)throw new Error("Import a .rawproj first");
   if(typeof canStageSources!=="function"||canStageSources()!==true)
    throw new Error("Local source staging requires an active LOCAL TEST session and disconnected studio bridges");
   if(typeof stageSources!=="function")throw new Error("Local audio stage adapter unavailable");
   if(typeof global.confirm!=="function"||
      !global.confirm("Replace local TEST session audio list with the verified original files from this project? Rack knobs will NOT change. Nothing will be uploaded.")){
    setStatus("Local source staging cancelled");return;
   }
   lock(true);
   const sources=[...imported.sources];
   const result=await stageSources(sources);
   if(result!==true)throw new Error("Local audio staging was refused");
   setStatus("STAGED "+sources.length+" source file(s) in LOCAL TEST only · rack knobs unchanged");
   detail("Source audio staged. Project rack remains read-only; no automatic hardware, billing or Firebase changes.");
  }catch(e){setStatus("Local source staging rejected: "+e.message);}
  finally{lock(false);}
 });
}
global.RAWPortableProjectPanelV1={
 attach,
 getDraft:host=>host?.querySelector(".raw-project-panel")?.getRAWPortableDraft?.()||null
};
})(typeof window!=="undefined"?window:globalThis);
