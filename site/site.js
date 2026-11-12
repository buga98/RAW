/* RAW public marketing website. Never reveal an unavailable/unsigned release
 * as an installed download. Production links require reviewed release metadata.
 */
(() => {
 "use strict";
 document.getElementById("current-year").textContent = String(new Date().getFullYear());
 const toggle=document.querySelector(".nav-toggle");
 const navigation=document.getElementById("main-navigation");
 toggle?.addEventListener("click",()=>{
  const open=toggle.getAttribute("aria-expanded")!=="true";
  toggle.setAttribute("aria-expanded",String(open));
  navigation?.classList.toggle("open",open);
 });
 navigation?.addEventListener("click",e=>{
  if(e.target.closest("a")){
   toggle?.setAttribute("aria-expanded","false");
   navigation.classList.remove("open");
  }
 });
 function createWave(pathId,phase=0){
  const path=document.getElementById(pathId);
  if(!path)return;
  let d="";
  for(let i=0;i<=280;i++){
   const x=i/280*700;
   const cluster=(Math.sin(i*.053+phase)**2*.66+Math.sin(i*.021+phase)**2*.34);
   const envelope=.12+.88*Math.abs(Math.sin(i*.024+.3));
   const y=(pathId==="raw-wave-a"?48:106)+Math.sin(i*.47+phase)*26*cluster*envelope;
   d+=(i?"L":"M")+x.toFixed(1)+" "+y.toFixed(1)+" ";
  }
  path.setAttribute("d",d);
 }
 createWave("raw-wave-a",.1);createWave("raw-wave-b",1.5);
 function isTrustedRelease(platform,value){
  if(!value||value.status!=="published"||
    typeof value.url!=="string"||typeof value.sha256!=="string"||
    !/^[a-f0-9]{64}$/i.test(value.sha256))return false;
  try{
   const link=new URL(value.url);
   return link.protocol==="https:"&&link.hostname==="github.com"&&
    link.pathname.startsWith("/buga98/RAW/releases/download/")&&
    (platform==="windows"?/\.exe$/i:/\.dmg$/i).test(link.pathname);
  }catch{return false;}
 }
 async function refreshDownloads(){
  let metadata;
  try{
   const response=await fetch("./release-manifest.json",{cache:"no-store"});
   if(!response.ok)throw Error("MANIFEST_UNAVAILABLE");
   metadata=await response.json();
   if(metadata.schemaVersion!==1)throw Error("MANIFEST_UNKNOWN");
  }catch{return;}
  for(const platform of ["windows","macos"]){
   const card=document.querySelector('[data-platform="'+platform+'"]');
   if(!card)continue;
   const status=card.querySelector("[data-download-status]");
   const link=card.querySelector("[data-download-link]");
   const placeholder=card.querySelector("[data-download-placeholder]");
   const version=metadata.platforms?.[platform];
   if(!isTrustedRelease(platform,version))continue;
   link.href=version.url;link.hidden=false;link.removeAttribute("aria-disabled");
   link.rel="noopener noreferrer";link.target="_blank";
   placeholder.hidden=true;
   status.textContent="Verzija "+String(version.version||"")+
    " · SHA-256 objavljen uz preuzimanje";
  }
 }

 // v5.42: OS-specific selector is a real configuration UI, NOT a public
 // release claim. Only explicitly reviewed, hashed, published release URLs
 // from the exact profile manifest can turn the download action on.
 const platformSelect=document.getElementById("raw-installer-platform");
 const versionSelect=document.getElementById("raw-installer-version");
 const cpuSelect=document.getElementById("raw-installer-cpu");
 const profileName=document.getElementById("raw-installer-name");
 const profileEngine=document.getElementById("raw-installer-engine");
 const profileStatus=document.getElementById("raw-installer-status");
 const profileDownload=document.getElementById("raw-installer-download");
 const versions={
  windows:[["10","Windows 10"],["11","Windows 11"]],
  macos:[["12","Monterey · macOS 12"],["13","Ventura · macOS 13"],
         ["14","Sonoma · macOS 14"],["15","Sequoia · macOS 15"],
         ["26","Tahoe · macOS 26"]]
 };
 let profiles=[];
 function fillOptions(select,items){
  if(!select)return;
  select.replaceChildren();
  for(const [value,title] of items){
   const item=document.createElement("option");
   item.value=value;item.textContent=title;select.append(item);
  }
 }
 function profileKey(){
  const os=platformSelect.value,version=versionSelect.value,cpu=cpuSelect.value;
  if(os==="windows")return version==="11"?"windows11-x64":"windows10-x64";
  const family=version==="12"?"macos12":"macos13plus";
  return family+(cpu==="arm64"?"-apple":"-intel");
 }
 function trustedProfileDownload(p){
  if(!p||p.status!=="published"||!p.file||
     typeof p.sha256!=="string"||!/^[a-f0-9]{64}$/i.test(p.sha256)||
     !isTrustedRelease(p.platform,p))return false;
  try{
   const url=new URL(p.url);
   const last=decodeURIComponent(url.pathname.split("/").pop());
   return last===p.file;
  }catch{return false;}
 }
 function selectedInstaller(){
  if(!profileName)return;
  const p=profiles.find(candidate=>candidate.id===profileKey());
  profileDownload.hidden=true;
  profileDownload.setAttribute("aria-disabled","true");
  profileDownload.removeAttribute("href");
  if(!p){
   profileName.textContent="Verzija još nije dostupna";
   profileEngine.textContent="Privatni RAW laboratorij";
   profileStatus.textContent="Preuzimanja nisu omogućena.";
   return;
  }
  profileName.textContent=p.file;
  profileEngine.textContent=p.label+" · "+p.cpu+" · Electron "+p.engine;
  profileStatus.textContent=p.status==="unavailable"
   ? "Privatni LOCAL TEST — ovaj installer nije javno objavljen."
   : "Status: verzija se provjerava.";
  if(!trustedProfileDownload(p))return;
  profileDownload.href=p.url;
  profileDownload.hidden=false;
  profileDownload.removeAttribute("aria-disabled");
  profileDownload.rel="noopener noreferrer";
  profileDownload.target="_blank";
  profileStatus.textContent="Objavljena provjerena verzija · SHA-256 je dostupan.";
 }
 function changedPlatform(){
  const os=platformSelect.value;
  fillOptions(versionSelect,versions[os]||versions.windows);
  fillOptions(cpuSelect,os==="macos"
    ? [["x64","Intel Mac"],["arm64","Apple Silicon (M1 / M2 / M3 / M4 / M5)"]]
    : [["x64","Intel / AMD · 64-bit"]]);
  selectedInstaller();
 }
 platformSelect?.addEventListener("change",changedPlatform);
 versionSelect?.addEventListener("change",selectedInstaller);
 cpuSelect?.addEventListener("change",selectedInstaller);
 async function loadProfiles(){
  try{
   const response=await fetch("./installer-profiles.json",{cache:"no-store"});
   if(!response.ok)throw Error("PROFILES_UNAVAILABLE");
   const catalog=await response.json();
   if(catalog.schemaVersion!==1||!Array.isArray(catalog.profiles))
    throw Error("PROFILES_SCHEMA_INVALID");
   profiles=catalog.profiles;
  }catch{
   profiles=[];
  }
  changedPlatform();
 }
 if(platformSelect&&versionSelect&&cpuSelect)loadProfiles();

 refreshDownloads();
})();
