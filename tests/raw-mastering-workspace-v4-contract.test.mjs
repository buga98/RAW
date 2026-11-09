import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const read=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const html=read("index.html");
const css=read("raw-workspace-v4.css");
const lib=read("raw-local-project-library-panel-v2.js");
const routes=read("raw-audio-route-v4.js");
const project=read("raw-workspace-project-status-v4.js");
const audio=read("audio-diagnostics.js");
test("sidebar toggle has dedicated non-overlapping row above RAW MASTERING brand",()=>{
 assert.match(html,/class="sidebar-toggle"/);
 assert.match(html,/class="brand"/);
 assert.ok(html.indexOf('class="sidebar-toggle"') < html.indexOf('class="brand"'));
 assert.match(css,/\.sidebar\.glass > \.sidebar-toggle\s*\{\s*position:\s*static;/);
 assert.match(css,/\.sidebar\.glass \.brand\s*\{[\s\S]*?padding:\s*0 0 18px;/);
 assert.match(css,/body\.sidebar-collapsed \.sidebar\.glass > \.sidebar-toggle\s*\{[\s\S]*?align-self:\s*center;/);
});
test("hidden initial render never collapses rack size and activation recalculates height",()=>{
 const source=html.match(/function fitRackDevices\(\) \{[\s\S]*?\n\}/)?.[0];
 assert.ok(source,"rack fit function must exist");
 const rack={dataset:{designWidth:"1380"},offsetHeight:500,style:{}};
 const wrapper={clientWidth:0,style:{},querySelector:()=>rack};
 const buttons=[70,80,90,100].map(n=>({
  dataset:{rackSize:String(n)},classList:{toggle(){}},setAttribute(){}
 }));
 const sandbox={rackSizePercent:90,document:{querySelectorAll:selector=>
  selector==="[data-rack-fit]"?[wrapper]:selector===".rack-size-btn"?buttons:[]}};
 vm.runInNewContext(source+";fitRackDevices();",sandbox);
 assert.equal(wrapper.style.height,undefined,"no invalid 0px height while hidden");
 wrapper.clientWidth=1000;
 vm.runInNewContext(source+";fitRackDevices();",sandbox);
 assert.ok(Number.parseInt(wrapper.style.height,10)>0,"visible rack reserves its height");
 assert.match(rack.style.transform,/^scale\(/);
});
test("MEQ details open/close reserves new scaled rack height without RACK SIZE click",()=>{
 const fit=html.match(/function fitRackDevices\(\) \{[\s\S]*?\n\}/)?.[0];
 const bind=html.match(/function bindRackExpansionFit\(\) \{[\s\S]*?\n\}/)?.[0];
 assert.ok(fit&&bind,"rack expansion handler must exist");
 assert.match(html,/bindRackExpansionFit\(\);\s*fitRackDevices\(\);/);
 let naturalHeight=500,active=true,onToggle;
 const rack={dataset:{designWidth:"1380"},get offsetHeight(){return naturalHeight},style:{}};
 const wrapper={clientWidth:1000,style:{},querySelector:()=>rack};
 const details={addEventListener:(event,callback)=>{
  assert.equal(event,"toggle");onToggle=callback;
 }};
 const sandbox={
  rackSizePercent:80,
  pluginHost:{querySelectorAll:selector=>selector==="[data-rack-fit] details"?[details]:[]},
  document:{
   querySelectorAll:selector=>selector==="[data-rack-fit]"?[wrapper]:[],
   getElementById:id=>id==="plugin"?{classList:{contains:cls=>active&&cls==="active"}}:null
  },
  requestAnimationFrame:callback=>callback()
 };
 vm.runInNewContext(fit+"\n"+bind+"\nfitRackDevices();bindRackExpansionFit();",sandbox);
 const initial=wrapper.style.height;
 assert.ok(Number.parseInt(initial,10)>0);
 assert.equal(typeof onToggle,"function");
 naturalHeight=900;onToggle();
 assert.ok(Number.parseInt(wrapper.style.height,10)>Number.parseInt(initial,10),
  "expanded controls must push the next device down");
 naturalHeight=500;onToggle();
 assert.equal(wrapper.style.height,initial,"collapsing reclaims the space");
 active=false;naturalHeight=900;onToggle();
 assert.equal(wrapper.style.height,initial,"hidden screen must not relayout");
});
test("professional desk ships independently of original device displays/knobs",()=>{
 assert.match(html,/raw-console-hero/);
 assert.match(html,/MASTERING DESK/);
 assert.match(html,/raw-console-signal/);
 assert.match(html,/id="rawConsoleSource"/);
 assert.match(html,/id="rawConsoleDeviceCount"/);
 assert.match(html,/id="rawWorkspaceCheckpoint"/);
 assert.match(css,/\.raw-console-hero/);
 assert.match(css,/\.raw-console-node\.is-offline/);
 assert.doesNotThrow(()=>new vm.Script(routes));
 assert.doesNotThrow(()=>new vm.Script(project));
});
test("actual analog routing and print are prominently marked unavailable",()=>{
 assert.match(html,/REAL ANALOG CHAIN/);
 assert.match(html,/NOT ROUTED/);
 assert.match(html,/MASTER PRINT/);
 assert.match(html,/NOT AVAILABLE/);
 assert.match(html,/LOCAL DIGITAL PREVIEW/);
 assert.doesNotMatch(html,/ANALOG MASTER READY|REAL HARDWARE CONNECTED/);
});
test("project version save and verified restore feed checkpoint state, Undo marks dirty",()=>{
 assert.match(lib,/safeCallback\(onCheckpoint,\{projectId:result\.record\.id,revision:1,kind:"saved",rack:draft\.rack\}\)/);
 assert.match(lib,/safeCallback\(onCheckpoint,\{projectId:result\.record\.id,revision:result\.record\.latestRevision,kind:"saved",rack:draft\.rack\}\)/);
 assert.match(lib,/safeCallback\(onCheckpoint,\{projectId,revision,kind:"restored",rack:opened\?\.manifest\?\.rack\}\)/);
 assert.match(lib,/safeCallback\(onStateChange\)/);
 assert.match(html,/onCheckpoint:checkpoint=>projectStatus\?\.checkpoint\(checkpoint\)/);
 assert.match(html,/attributeFilter:\["data-value"\]/);
});
test("Developer owner-only gate uses stale-authorization cancellation and explicit recheck",()=>{
 assert.match(html,/const attempt=\+\+developerAuthEpoch/);
 assert.match(html,/attempt!==developerAuthEpoch\|\|auth\.currentUser\?\.uid!==user\.uid/);
 assert.match(html,/window\.checkDeveloperAccess=async function/);
 assert.match(html,/id="rawDeveloperAccessStatus"/);
 assert.match(html,/if \(developerAllowed\(\)\) \{/);
 assert.match(html,/revokeDeveloperLabs\(\);\s*await signOut\(auth\)/);
});
test("diagnostics and Gateway remain in LAB; local rack preserves navigation",()=>{
 assert.match(html,/RAWStudioSim\?\.attach\(developerLabHost,pluginHost\)/);
 assert.match(html,/RAWStudioGatewayV1\?\.attach\(developerLabHost,pluginHost\)/);
 assert.match(html,/RAWChainArchiveV1\?\.attach\(developerLabHost/);
 assert.match(html,/if \(screenId === "plugin" && !pluginHost\.querySelector\("\.chain-control"\)\) renderPlugin\(\)/);
 assert.match(html,/if \(TEST_MODE\) \{/);
});
test("mastering monitor displays actual local Web Audio RMS, not fake hardware values",()=>{
 assert.match(html,/id="rawConsoleInputRms"/);
 assert.match(html,/id="rawConsoleOutputRms"/);
 assert.match(html,/id="rawConsoleInputBar"/);
 assert.match(html,/id="rawConsoleOutputBar"/);
 assert.match(html,/LOCAL WEB AUDIO · RMS · NOT ANALOG READBACK/);
 assert.match(audio,/function updateDeskMeters\(beforeDb,afterDb\)/);
 assert.match(audio,/updateDeskMeters\(beforeDb,afterDb\)/);
 assert.match(audio,/updateDeskMeters\(null,null\)/);
 assert.match(audio,/getFloatTimeDomainData\(data\)/);
 assert.match(css,/\.raw-meter-rail/);
 assert.doesNotMatch(audio,/hardwareVerified:\s*true|physicalReadback:\s*true/);
});
test("audio diagnostics controls and meters are mounted only in the developer screen",()=>{
 assert.match(html,/id="rawDiagnosticsToggle"/);
 assert.match(html,/developerLabHost\.querySelector\("#rawDiagnosticsDetails"\)/);
 assert.match(html,/if\(diag\)\{diag\.hidden=true;developerLabHost\.append\(diag\);\}/);
 assert.match(html,/window\.toggleRawDiagnostics = function\(\) \{\s*if\(!developerAllowed\(\)\)return/);
 assert.match(css,/#developer #rawDiagnosticsDetails/);
 assert.doesNotMatch(html,/\$\{developerAllowed\(\) \? '<button[^']*rawDiagnosticsToggle/);
});
test("unsaved project rack cannot be dismissed by accidental local session end/logout",()=>{
 assert.match(html,/RAWWorkspaceActiveProjectStatus\?\.getStatus\?\.\(\)\?\.dirty===true/);
 assert.match(html,/Imaš nespremljene promjene na virtualnom racku/);
 assert.match(html,/Imaš NESPREMLJENE rack postavke/);
 assert.match(html,/Već imaš aktivnu LOCAL TEST sesiju/);
});
test("new stylesheet/assets load before app module",()=>{
 const module=html.indexOf('<script type="module">');
 for(const name of ["raw-audio-route-v4.js","raw-workspace-project-status-v4.js"]){
  const i=html.indexOf('src="'+name+'"');assert.ok(i>=0&&i<module);
 }
 assert.match(html,/href="raw-workspace-v4\.css"/);
});
