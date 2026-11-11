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
 refreshDownloads();
})();
