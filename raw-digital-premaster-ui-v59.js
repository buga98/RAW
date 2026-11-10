/* RAW V5.9 — standalone local DIGITAL premaster workspace for real user audio.
 * Does not emulate Bettermaker or WesAudio. Does not access MIDI/USB/DAW/Gateway.
 * Only attaches after verified owner + LOCAL TEST session, file stays in browser RAM.
 */
(function(global){
"use strict";
let panel=null,generation=0,run=null,previewUrl=null,originalUrl=null,rendered=null;
let fileGetter=()=>null,guard=()=>false,sourceAtMount=null,presetStore=null;
let monitorVolumes={original:1,digital:1};
const raw=()=>global.RAWDigitalPremasterV59;
function allowed(){
 try{return guard()===true&&fileGetter()===sourceAtMount;}catch{return false;}
}
function el(selector){return panel?.querySelector(selector);}
function status(text){const target=el("[data-v59-status]");if(target)target.textContent=text;}
function revoke(){
 if(previewUrl){try{global.URL.revokeObjectURL(previewUrl);}catch{}previewUrl=null;}
 if(originalUrl){try{global.URL.revokeObjectURL(originalUrl);}catch{}originalUrl=null;}
}
function resetRender(){
 generation++;if(run)run.cancelled=true;run=null;
 rendered=null;monitorVolumes={original:1,digital:1};revoke();
 const player=el("[data-v59-player]");
 if(player){try{player.pause();player.removeAttribute("src");player.load();}catch{}}
 for(const selector of ["[data-v59-download]","[data-v59-qc]","[data-v59-ab-a]","[data-v59-ab-b]"]){
  const button=el(selector);if(button)button.disabled=true;
 }
 const progress=el("[data-v59-progress]");if(progress)progress.value=0;
}
function measure(m){
 const fmt=n=>typeof n==="number"&&Number.isFinite(n)?n.toFixed(2):"—";
 return "SAMPLE PEAK: "+fmt(m.peakDbfs)+" dBFS"+
  " · UNWEIGHTED RMS: "+fmt(m.rmsDbfs)+" dBFS"+
  " · CLIPPED FRAMES: "+m.clippedFrames+
  " · STEREO CORRELATION: "+fmt(m.correlation);
}
function profileId(){
 return el("[data-v59-handoff-profile]")?.value||"custom";
}
function invalidateDigitalRender(message="SETTINGS CHANGED · DIGITAL PREMASTER MUST BE RENDERED AGAIN"){
 resetRender();
 const start=el("[data-v59-start]");if(start)start.disabled=!allowed();
 const cancel=el("[data-v59-cancel]");if(cancel)cancel.disabled=true;
 const metrics=el("[data-v59-metrics]");
 if(metrics)metrics.textContent="Digital settings changed · render again to refresh audio and measurements.";
 status(message);
}
function settings(){
 const numeric=["lowCutHz","lowShelfDb","presenceDb","airDb","thresholdDb","ratio",
   "attackMs","releaseMs","makeupDb","ceilingDb","stereoWidthPercent","midTrimDb","sideTrimDb"];
 const values={};
 for(const name of numeric){
  const control=el('[data-v59-setting="'+name+'"]');
  values[name]=Number(control?.value);
 }
 values.bits=Number(el('[data-v59-setting="bits"]')?.value);
 values.dither=el('[data-v59-setting="dither"]')?.checked===true;
 return raw().settingsOf(values);
}
async function decodeFile(file){
 if(!file||typeof file.arrayBuffer!=="function"||
    !Number.isSafeInteger(file.size)||file.size<1||file.size>128*1024*1024)
  throw new Error("Select a local file of 1–128 MiB");
 if(!/\.(wav|wave|aif|aiff|mp3)$/i.test(String(file.name||"")))
  throw new Error("Choose WAV / AIFF / MP3 source");
 const Context=global.AudioContext||global.webkitAudioContext;
 if(typeof Context!=="function")throw new Error("Browser AudioContext unavailable");
 let context;
 try{
  context=new Context();
  const bytes=await file.arrayBuffer();
  if(bytes.byteLength!==file.size)throw new Error("Source changed during decode");
  return await context.decodeAudioData(bytes);
 }finally{try{await context?.close();}catch{}}
}
async function process(){
 if(!panel||!allowed()||run||!raw())return;
 const file=fileGetter();
 const current=++generation;
 const token={cancelled:false};run=token;rendered=null;
 revoke();
 const buttons=["[data-v59-start]","[data-v59-download]","[data-v59-qc]","[data-v59-ab-a]","[data-v59-ab-b]"];
 buttons.forEach(sel=>{const b=el(sel);if(b)b.disabled=true;});
 const abort=el("[data-v59-cancel]");if(abort)abort.disabled=false;
 const metrics=el("[data-v59-metrics]");
 try{
  const profile=settings();
  const handoffProfile=profileId();
  if(!global.RAWDigitalHandoffV521?.byId)
   throw new Error("Offline digital handoff profiles unavailable");
  global.RAWDigitalHandoffV521.byId(handoffProfile);
  status("DECODING LOCAL SOURCE · no hardware or network");
  const audio=await decodeFile(file);
  if(token.cancelled||current!==generation||!allowed())return;
  if(audio.numberOfChannels!==2)throw new Error("V5.9 accepts only stereo decoded source (2 channels)");
  status("DIGITAL DSP · rendering actual PCM");
  const out=await raw().render(audio,profile,{
   isCancelled:()=>token.cancelled||current!==generation||!allowed(),
   onProgress:report=>{
    if(current!==generation||token.cancelled||!allowed())return;
    const bar=el("[data-v59-progress]");if(bar)bar.value=report.percent;
    status("DIGITAL "+report.phase+" · "+report.percent+"% · NO ANALOG HARDWARE");
   }
  });
  if(token.cancelled||current!==generation||!allowed())return;
  const blob=new Blob(out.chunks,{type:"audio/wav"});
  if(blob.size!==out.byteLength)throw new Error("Digital WAV byte size mismatch");
  status("VERIFYING DIGITAL WAV · SHA-256 + offline sample-peak QC");
  if(!global.RAWMasterQCV510?.inspect)throw new Error("Digital QC module unavailable");
  const rawQc=await global.RAWMasterQCV510.inspect({result:out,blob,sourceName:file.name});
  if(token.cancelled||current!==generation||!allowed())return;
  // V5.17 professional loudness: analyze original AND rendered PCM.
  // Never claim certified LUFS or true-peak compliance without references.
  if(!global.RAWProfessionalLoudnessV517?.measure)
   throw new Error("BS.1770 loudness analyzer unavailable");
  status("MEASURING BS.1770-5 INTEGRATED LUFS · OFFLINE DIGITAL");
  const meterOptions={
    isCancelled:()=>token.cancelled||current!==generation||!allowed()
  };
  const [sourceLufs,digitalLufs]=await Promise.all([
    global.RAWProfessionalLoudnessV517.measure(
      [audio.getChannelData(0),audio.getChannelData(1)],out.sampleRate,meterOptions),
    global.RAWProfessionalLoudnessV517.measure(out.channels,out.sampleRate,meterOptions)
  ]);
  if(token.cancelled||current!==generation||!allowed())return;
  status("MEASURING 4x INTERSAMPLE TRUE-PEAK ESTIMATE · LOCAL ONLY");
  const [sourceTruePeak,digitalTruePeak]=await Promise.all([
    global.RAWProfessionalLoudnessV517.estimateTruePeak(
      [audio.getChannelData(0),audio.getChannelData(1)],out.sampleRate,meterOptions),
    global.RAWProfessionalLoudnessV517.estimateTruePeak(
      out.channels,out.sampleRate,meterOptions)
  ]);
  if(token.cancelled||current!==generation||!allowed())return;
  const overPeak=typeof digitalTruePeak.estimatedTruePeakDbtp==="number"&&
    digitalTruePeak.estimatedTruePeakDbtp>out.settings.ceilingDb+0.1;
  const qc=Object.freeze({...rawQc,
    digitalLoudness:Object.freeze({source:sourceLufs,output:digitalLufs}),
    intersamplePeakEstimate:Object.freeze({source:sourceTruePeak,output:digitalTruePeak}),
    estimatedIntersampleOverCeiling:overPeak,
    loudnessReferenceCertified:false,truePeakReferenceCertified:false,
    deviceMasterCertified:false
  });
  const handoff=global.RAWDigitalHandoffV521.evaluate({
   id:handoffProfile,result:out,qc
  });
  const receipt=Object.freeze({...qc,deliveryHandoff:handoff});
  rendered={blob,out,file,qc:receipt,handoff};
  // V5.12 monitoring: attenuate ONLY the louder side to the quieter
  // unweighted-RMS level. This never alters PCM exports or QC receipts.
  const inRms=out.inputMeter.rmsDbfs,processedRms=out.outputMeter.rmsDbfs;
  if(typeof inRms==="number"&&Number.isFinite(inRms)&&
     typeof processedRms==="number"&&Number.isFinite(processedRms)){
   const inLinear=Math.pow(10,inRms/20),outLinear=Math.pow(10,processedRms/20);
   monitorVolumes={
    original:Math.min(1,outLinear/inLinear),
    digital:Math.min(1,inLinear/outLinear)
   };
  }else monitorVolumes={original:1,digital:1};
  const output=el("[data-v59-metrics]");
  if(output)output.textContent=
   "INPUT  | "+measure(out.inputMeter)+"\n"+
   "OUTPUT | "+measure(out.outputMeter)+"\n"+
   "PEAK SAFETY ATTENUATION: "+(out.peakSafetyAttenuationDb??0).toFixed(2)+" dB"+
   " · COMPRESSOR MAX REDUCTION: "+out.maxCompressorReductionDb.toFixed(2)+" dB\n"+
   "DIGITAL WAV "+out.outputBits+"-BIT · "+out.frames+" FRAMES · "+
   out.sampleRate+" Hz · "+(out.outputDither?"TPDF DITHER":"NO DITHER")+"\n"+
   "BS.1770-5 GATED INTEGRATED LUFS (REFERENCE VALIDATION PENDING): "+
   "INPUT "+(sourceLufs.integratedLufs?.toFixed(2)??"BELOW GATE")+
   " / OUTPUT "+(digitalLufs.integratedLufs?.toFixed(2)??"BELOW GATE")+
   "\n4x INTERSAMPLE TRUE-PEAK ESTIMATE (NOT CERTIFIED): INPUT "+
   (sourceTruePeak.estimatedTruePeakDbtp?.toFixed(2)??"—")+
   " dBTP / OUTPUT "+(digitalTruePeak.estimatedTruePeakDbtp?.toFixed(2)??"—")+
   " dBTP · "+(overPeak?"REVIEW ESTIMATED OVER-CEILING":"NO ESTIMATED OVER-CEILING")+
   "\nSAMPLE-PEAK CEILING IS NOT A TRUE-PEAK LIMITER. Not Bettermaker/WesAudio processing."+
   "\nA/B RMS MONITOR ONLY: A ×"+monitorVolumes.original.toFixed(3)+
   " · B ×"+monitorVolumes.digital.toFixed(3)+" (NOT LUFS MATCHED)"+
   "\nM/S DIGITAL: WIDTH "+out.midSideSettings.widthPercent+"% · MID "+
   out.midSideSettings.midTrimDb+" dB · SIDE "+out.midSideSettings.sideTrimDb+" dB"+
   "\nDIGITAL PROFILE: "+handoff.label+" · "+handoff.readiness+
   " · PRESERVED "+handoff.sampleRate+" Hz"+
   (handoff.reasons.length?"\n"+handoff.reasons.join("\n"):"")+
   "\n"+handoff.notes.join("\n")+
   "\nDIGITAL QC: "+qc.overall+" · SHA-256: "+qc.sha256+
   "\n"+qc.diagnostics.map(entry=>entry.status+" · "+entry.description).join("\n");
  status((qc.downloadAllowed?"DIGITAL PREMASTER READY · QC "+qc.overall:
     "DIGITAL PREMASTER REJECTED · QC FAIL")+
   " · LOCAL WAV SHA-256 VERIFIED · NOT ANALOG MASTER");
  previewUrl=global.URL.createObjectURL(blob);
  originalUrl=global.URL.createObjectURL(file);
  const player=el("[data-v59-player]");
  if(player){
   player.src=previewUrl;
   player.volume=el("[data-v59-monitor-match]")?.checked===true?
    monitorVolumes.digital:1;
   player.load();
  }
  ["[data-v59-qc]","[data-v59-ab-a]","[data-v59-ab-b]"].forEach(sel=>{
   const b=el(sel);if(b)b.disabled=false;
  });
  const download=el("[data-v59-download]");
  if(download)download.disabled=!(qc.downloadAllowed&&handoff.downloadAllowed);
 }catch(error){
  if(current===generation&&panel&&allowed()&&!token.cancelled){
   status("DIGITAL RENDER FAILED · "+String(error?.message||error).slice(0,145));
   if(metrics)metrics.textContent="Nothing was exported or applied to the rack.";
  }
 }finally{
  if(run===token){
   run=null;
   const start=el("[data-v59-start]");if(start)start.disabled=!allowed();
   const cancel=el("[data-v59-cancel]");if(cancel)cancel.disabled=true;
  }
 }
}
function download(){
 if(!allowed()||!rendered?.qc?.downloadAllowed||
    !rendered?.handoff?.downloadAllowed||!previewUrl)return;
 const a=global.document.createElement("a");
 a.href=previewUrl;
 a.download=global.RAWDigitalHandoffV521.outputFilename(
  rendered.file.name,rendered.handoff.id);
 a.hidden=true;global.document.body.append(a);
 try{a.click();}
 finally{a.remove();}
 status("DOWNLOADED "+a.download+" · OFFLINE DIGITAL PREMASTER, not analog master");
}
function downloadQC(){
 if(!allowed()||!rendered?.qc)return;
 const blob=new Blob([JSON.stringify(rendered.qc,null,2)],{type:"application/json"});
 const url=global.URL.createObjectURL(blob);
 const a=global.document.createElement("a");
 a.href=url;a.download=global.RAWMasterQCV510.jsonFileName(rendered.file.name);
 a.hidden=true;global.document.body.append(a);
 try{a.click();}finally{
  a.remove();
  global.setTimeout(()=>global.URL.revokeObjectURL(url),10000);
 }
 status("DIGITAL QC REPORT DOWNLOADED · SHA-256 "+rendered.qc.sha256.slice(0,12)+"… · LOCAL ONLY");
}
function updateMonitorVolume(){
 const player=el("[data-v59-player]");
 if(!player||!rendered)return;
 const chosen=player.src===originalUrl?"original":"digital";
 const matched=el("[data-v59-monitor-match]")?.checked===true;
 player.volume=matched?monitorVolumes[chosen]:1;
}
function listen(original){
 if(!allowed()||!rendered||!previewUrl||!originalUrl)return;
 const player=el("[data-v59-player]");if(!player)return;
 const wasPaused=player.paused;const oldTime=player.currentTime||0;
 const newUrl=original?originalUrl:previewUrl;
 if(player.src===newUrl){updateMonitorVolume();return;}
 player.pause();player.src=newUrl;updateMonitorVolume();player.load();
 const keep=()=>{if(!allowed())return;
  try{player.currentTime=Math.min(oldTime,player.duration||oldTime);}catch{}
  if(!wasPaused)void player.play()?.catch?.(()=>{});
 };
 player.addEventListener("loadedmetadata",keep,{once:true});
 status(original?"A · ORIGINAL SOURCE (no DSP)":"B · RAW DIGITAL PREMASTER · no analog equipment");
}
function presetInfo(text){
 const node=el("[data-v59-preset-info]");if(node)node.textContent=text;
}
async function refreshPresets(store=presetStore){
 if(!store||!allowed())return;
 try{
  const values=await store.list();
  if(presetStore!==store||!allowed())return;
  const select=el("[data-v59-preset-select]");if(!select)return;
  const previous=select.value;
  select.replaceChildren();
  const empty=global.document.createElement("option");
  empty.value="";empty.textContent="— Odaberi spremljene postavke —";
  select.append(empty);
  for(const preset of values){
   const option=global.document.createElement("option");
   option.value=preset.id;option.textContent=preset.name;
   select.append(option);
  }
  select.value=values.some(p=>p.id===previous)?previous:"";
  presetInfo("LOCAL DIGITAL PRESETS · "+values.length+"/20 · NO AUDIO / HARDWARE");
 }catch(error){
  if(store===presetStore&&allowed())
   presetInfo("PRESET READ FAILED · "+String(error?.message||error).slice(0,120));
 }
}
async function savePreset(){
 const store=presetStore;
 if(!store||!allowed())return;
 const name=global.prompt?.("Naziv digitalnog mastering preseta (bez audio datoteke):");
 if(name===null||name===undefined)return;
 try{
  const saved=await store.save(name,settings());
  if(store!==presetStore||!allowed())return;
  await refreshPresets(store);
  const select=el("[data-v59-preset-select]");
  if(select)select.value=saved.id;
  presetInfo("SAVED DIGITAL PRESET · "+saved.name+" · LOCAL SETTINGS ONLY");
 }catch(error){
  if(store===presetStore&&allowed())presetInfo("SAVE REJECTED · "+
   String(error?.message||error).slice(0,120));
 }
}
async function loadPreset(){
 const store=presetStore,select=el("[data-v59-preset-select]");
 if(!store||!allowed()||!select?.value)return;
 const selected=select.value;
 try{
  const saved=await store.load(selected);
  if(store!==presetStore||!allowed()||select.value!==selected)return;
  if(global.confirm?.("Učitati spremljeni digitalni preset '"+saved.name+
    "'? Trenutne digitalne vrijednosti će se zamijeniti. Nijedan rack ni hardver neće se promijeniti.")!==true)return;
  for(const [key,value] of Object.entries(saved.settings)){
   const input=el('[data-v59-setting="'+key+'"]');
   if(!input)continue;
   if(key==="dither")input.checked=value;
   else input.value=String(value);
  }
  const handoffSelect=el("[data-v59-handoff-profile]");
  if(handoffSelect)handoffSelect.value="custom";
  invalidateDigitalRender("DIGITAL PRESET LOADED · RENDER REQUIRED · NOT ANALOG HARDWARE");
  const metrics=el("[data-v59-metrics]");
  if(metrics)metrics.textContent="DIGITAL PRESET LOADED · render again to hear processed audio.";
  presetInfo("LOADED · "+saved.name+" · RACK UNCHANGED");
  status("DIGITAL PRESET LOADED · RENDER REQUIRED · NOT ANALOG HARDWARE");
 }catch(error){
  if(store===presetStore&&allowed())presetInfo("LOAD REJECTED · "+
   String(error?.message||error).slice(0,120));
 }
}
async function deletePreset(){
 const store=presetStore,select=el("[data-v59-preset-select]");
 if(!store||!allowed()||!select?.value)return;
 const target=select.value;
 if(global.confirm?.("Trajno obrisati odabrani DIGITALNI preset na ovom računalu? Audio i rack se ne brišu.")!==true)return;
 try{
  await store.remove(target,{confirmed:true});
  if(store!==presetStore||!allowed())return;
  await refreshPresets(store);
  presetInfo("DIGITAL PRESET DELETED · LOCAL ONLY · AUDIO UNCHANGED");
 }catch(error){
  if(store===presetStore&&allowed())presetInfo("DELETE REJECTED · "+
   String(error?.message||error).slice(0,120));
 }
}
function detach(){
 presetStore?.close?.();presetStore=null;
 resetRender();
 panel?.remove?.();panel=null;fileGetter=()=>null;guard=()=>false;sourceAtMount=null;
}
function attach(host,{getFile,canUse,presetUserId}={}){
 if(!host||typeof getFile!=="function"||typeof canUse!=="function"||!raw())
  return false;
 let allowedNow=false;
 try{allowedNow=canUse()===true;}catch{}
 if(!allowedNow)return false;
 // Re-render invalidates prior input, processed PCM and object URLs by design.
 detach();fileGetter=getFile;guard=canUse;sourceAtMount=getFile();
 if(!sourceAtMount)return false;
 const section=global.document.createElement("section");
 section.id="rawDigitalPremasterV59";
 section.className="raw-digital-premaster";
 section.innerHTML=
 '<div class="raw-dpm-head"><div><small>RAW / OFFLINE DIGITAL LAB · V5.9</small>'+
 '<h3>DIGITAL PREMASTER</h3>'+
 '<p>Stvarna lokalna obrada stereo audija. Zaseban digitalni lanac — ne simulira identičan zvuk Bettermaker/WesAudio hardvera.</p>'+
 '</div><span>LOCAL TEST · NO HARDWARE / BILLING</span></div>'+
 '<div class="raw-dpm-handoff">'+
 '<label>PCM HANDOFF PROFILE <select data-v59-handoff-profile>'+
 '<option value="custom" selected>CUSTOM · ručne postavke</option>'+
 '<option value="archive24">STUDIO ARCHIVE · 24-bit WAV</option>'+
 '<option value="pcm16">DIGITAL PCM · 16-bit WAV</option>'+
 '</select></label>'+
 '<small>Profil mijenja samo bit-depth, dither i sample-peak ceiling; čuva izvorni sample rate. Ne certificira CD ni streaming master.</small>'+
 '</div>'+
 '<div class="raw-dpm-settings">'+
 '<label>HIGH PASS Hz<input type="number" min="0" max="120" step="1" value="25" data-v59-setting="lowCutHz"></label>'+
 '<label>LOW SHELF 110 Hz · dB<input type="number" min="-12" max="12" step=".5" value="0" data-v59-setting="lowShelfDb"></label>'+
 '<label>PRESENCE 3 kHz · dB<input type="number" min="-12" max="12" step=".5" value="0" data-v59-setting="presenceDb"></label>'+
 '<label>AIR 12 kHz · dB<input type="number" min="-12" max="12" step=".5" value="0" data-v59-setting="airDb"></label>'+
 '<label>COMP THRESHOLD · dBFS<input type="number" min="-36" max="0" step=".5" value="-18" data-v59-setting="thresholdDb"></label>'+
 '<label>COMP RATIO<input type="number" min="1" max="8" step=".25" value="1" data-v59-setting="ratio"></label>'+
 '<label>ATTACK · ms<input type="number" min=".2" max="200" step=".1" value="20" data-v59-setting="attackMs"></label>'+
 '<label>RELEASE · ms<input type="number" min="20" max="2000" step="10" value="180" data-v59-setting="releaseMs"></label>'+
 '<label>MAKEUP · dB<input type="number" min="-12" max="12" step=".5" value="0" data-v59-setting="makeupDb"></label>'+
 '<label>M/S STEREO WIDTH · %<input type="number" min="0" max="200" step="5" value="100" data-v59-setting="stereoWidthPercent"></label>'+
 '<label>MID TRIM · dB<input type="number" min="-6" max="6" step=".25" value="0" data-v59-setting="midTrimDb"></label>'+
 '<label>SIDE TRIM · dB<input type="number" min="-6" max="6" step=".25" value="0" data-v59-setting="sideTrimDb"></label>'+
 '<label>PEAK CEILING · dBFS<input type="number" min="-12" max="-.1" step=".1" value="-1" data-v59-setting="ceilingDb"></label>'+
 '<label>WAV BIT DEPTH<select data-v59-setting="bits"><option value="24">24-bit PCM</option><option value="16">16-bit PCM</option></select></label>'+
 '<label class="raw-dpm-check"><input type="checkbox" checked data-v59-setting="dither"> TPDF dither on integer export</label>'+
 '</div>'+
 '<div class="raw-dpm-presets">'+
 '<label>SAVED DIGITAL PRESET <select data-v59-preset-select><option value="">— Odaberi spremljene postavke —</option></select></label>'+
 '<button type="button" data-v59-preset-save>SAVE PRESET</button>'+
 '<button type="button" data-v59-preset-load>LOAD PRESET</button>'+
 '<button type="button" data-v59-preset-delete>DELETE PRESET</button>'+
 '<span data-v59-preset-info>LOCAL · SETTINGS ONLY · NO AUDIO</span>'+
 '</div>'+
 '<div class="raw-dpm-actions">'+
 '<button type="button" data-v59-start>▶ RENDER DIGITAL PREMASTER</button>'+
 '<button type="button" data-v59-cancel disabled>■ CANCEL</button>'+
 '<button type="button" data-v59-download disabled>↓ DOWNLOAD DIGITAL WAV</button>'+
 '<button type="button" data-v59-qc disabled>↓ EXPORT QC JSON</button>'+
 '<button type="button" data-v59-ab-a disabled>A · ORIGINAL</button>'+
 '<button type="button" data-v59-ab-b disabled>B · DIGITAL</button></div>'+
 '<progress data-v59-progress value="0" max="100"></progress>'+
 '<div data-v59-status role="status" aria-live="polite">READY · local source only · no digital output generated</div>'+
 '<pre data-v59-metrics>RMS, sample peak, stereo correlation and DSP metrics appear after render. No LUFS/true-peak certification.</pre>'+
 '<label class="raw-dpm-monitor"><input type="checkbox" checked data-v59-monitor-match> A/B MONITOR: MATCH UNWEIGHTED RMS (NOT LUFS) · DOES NOT CHANGE WAV</label>'+
 '<audio data-v59-player controls preload="none" aria-label="Local A/B digital premaster listening"></audio>'+
 '<p class="raw-dpm-footnote">V5.9 sample-peak safety uses transparent whole-file attenuation, NOT a true-peak limiter. Digital settings are independent from the virtual hardware rack. No analog master is available.</p>';
 host.append(section);panel=section;
 el("[data-v59-start]").addEventListener("click",()=>void process());
 el("[data-v59-cancel]").addEventListener("click",()=>{
  if(run){run.cancelled=true;status("CANCEL REQUESTED · no output will be delivered");}
 });
 el("[data-v59-download]").addEventListener("click",download);
 el("[data-v59-qc]").addEventListener("click",downloadQC);
 el("[data-v59-ab-a]").addEventListener("click",()=>listen(true));
 el("[data-v59-ab-b]").addEventListener("click",()=>listen(false));
 el("[data-v59-monitor-match]").addEventListener("change",updateMonitorVolume);
 el("[data-v59-preset-save]").addEventListener("click",()=>void savePreset());
 el("[data-v59-preset-load]").addEventListener("click",()=>void loadPreset());
 el("[data-v59-preset-delete]").addEventListener("click",()=>void deletePreset());
 // A rendered file must never be downloadable under settings it was not
 // rendered with: any edit invalidates the previous digital preview.
 section.querySelectorAll("[data-v59-setting]").forEach(control=>
  control.addEventListener("change",()=>{
   if(!panel)return;
   const select=el("[data-v59-handoff-profile]");
   if(select)select.value="custom";
   invalidateDigitalRender();
  })
 );
 el("[data-v59-handoff-profile]").addEventListener("change",()=>{
  if(!panel||!allowed())return;
  try{
   const selected=profileId();
   const next=global.RAWDigitalHandoffV521.apply(selected,settings());
   for(const key of ["bits","dither","ceilingDb"]){
    const field=el('[data-v59-setting="'+key+'"]');
    if(!field)continue;
    if(key==="dither")field.checked=next[key];else field.value=String(next[key]);
   }
   invalidateDigitalRender("DIGITAL PCM PROFILE SELECTED · RENDER REQUIRED");
  }catch(error){
   status("PROFILE REJECTED · "+String(error?.message||error).slice(0,130));
  }
 });
 if(typeof presetUserId==="string"&&presetUserId&&global.RAWDigitalPresetsV511?.create){
  try{
   presetStore=global.RAWDigitalPresetsV511.create({
    userId:presetUserId,authorized:()=>allowed()
   });
   void refreshPresets(presetStore);
  }catch(error){
   presetInfo("PRESET STORAGE UNAVAILABLE · "+String(error?.message||error).slice(0,100));
  }
 }else presetInfo("LOCAL PRESET LIBRARY NOT CONNECTED");
 return true;
}
global.RAWDigitalPremasterV59UI=Object.freeze({attach,detach});
})(typeof window!=="undefined"?window:globalThis);
