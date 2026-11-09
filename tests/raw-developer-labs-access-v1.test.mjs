import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const policy=readFileSync(new URL("../raw-developer-access-v1.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const sim=readFileSync(new URL("../studio-sim-client.js",import.meta.url),"utf8");
const gateway=readFileSync(new URL("../studio-gateway-client.js",import.meta.url),"utf8");
function fixture(){
 const context={window:{}};vm.createContext(context);vm.runInContext(policy,context);
 const account={uid:"verified-owner-uid",email:"luka.buga@gmail.com",emailVerified:true};
 const tokenResult={claims:{email:"luka.buga@gmail.com",email_verified:true}};
 return {access:context.window.RAWDeveloperAccessV1,account,tokenResult};
}
test("verified owner with matching fresh Firebase token sees local test Developer LAB",()=>{
 const h=fixture();
 assert.equal(h.access.grant({
  testMode:true,user:h.account,tokenResult:h.tokenResult,activeUid:h.account.uid
 }),true);
});
test("wrong email, unverified account, forged claim and UID mismatch denied",()=>{
 const h=fixture();
 const base={testMode:true,user:h.account,tokenResult:h.tokenResult,activeUid:h.account.uid};
 assert.equal(h.access.grant({...base,testMode:false}),false);
 assert.equal(h.access.grant({...base,user:{...h.account,email:"other@example.com"}}),false);
 assert.equal(h.access.grant({...base,user:{...h.account,emailVerified:false}}),false);
 assert.equal(h.access.grant({...base,tokenResult:{claims:{email:h.account.email,email_verified:false}}}),false);
 assert.equal(h.access.grant({...base,tokenResult:{claims:{email:"other@example.com",email_verified:true}}}),false);
 assert.equal(h.access.grant({...base,activeUid:"another-uid"}),false);
 assert.equal(h.access.grant({...base,tokenResult:null}),false);
 assert.equal(h.access.grant({...base,user:null}),false);
});
test("developer nav and labs are hidden by default; auth and navigation are guarded",()=>{
 assert.match(html,/id="developerNav" hidden/);
 assert.match(html,/id="developer" class="screen"[^>]*hidden/);
 assert.match(html,/if \(screenId === "developer" && !developerAllowed\(\)\)/);
 assert.match(html,/await user\.getIdTokenResult\(true\)/);
 assert.match(html,/RAWDeveloperAccessV1\?\.grant\(/);
 assert.match(html,/window\.RAWStudioGatewayV1\?\.disconnect\?\.\(\)/);
 assert.match(html,/window\.RAWStudioSim\?\.disconnect\?\.\(\)/);
 assert.match(html,/revokeDeveloperLabs\(\);\s*await signOut\(auth\)/);
});
test("Gateway, direct simulator and Chain Archive mount in Developer LAB only",()=>{
 assert.match(html,/if \(developerAllowed\(\)\) \{/);
 assert.match(html,/RAWStudioGatewayV1\?\.attach\(developerLabHost,pluginHost\)/);
 assert.match(html,/RAWStudioSim\?\.attach\(developerLabHost,pluginHost\)/);
 assert.match(html,/RAWChainArchiveV1\?\.attach\(developerLabHost/);
 assert.doesNotMatch(html,/RAWStudioGatewayV1\?\.attach\(pluginHost\)/);
 assert.doesNotMatch(html,/RAWStudioSim\?\.attach\(pluginHost\)/);
 assert.match(html,/const dawToolbar=pluginHost\.querySelector\("\.raw-daw-toolbar"\)/);
 assert.match(html,/if\(dawToolbar\)developerLabHost\.prepend\(dawToolbar\)/);
});
test("LAB panel observes the active Control Room rather than its own developer container",()=>{
 assert.match(sim,/function attach\(container,controlsRoot=container\)/);
 assert.match(gateway,/function attach\(container,controlsRoot=container\)/);
 assert.match(sim,/root=controlsRoot/);
 assert.match(gateway,/root=controlsRoot/);
 assert.match(sim,/if\(!TEST\|\|!container\|\|!controlsRoot\)return/);
 assert.match(gateway,/if\(!TEST\|\|!container\|\|!controlsRoot\)return/);
});
test("normal mastering and user project controls remain available outside developer LAB",()=>{
 assert.match(html,/id="pluginHost"/);
 assert.match(html,/id="rawProjectsHost"/);
 assert.match(html,/RAWPortableProjectPanelV1\?\.attach\(projectsHost/);
 assert.match(html,/RAWLocalProjectLibraryPanelV2\?\.attach\(projectsHost/);
 assert.match(html,/RAWProjectRecallV3\?\.create\(/);
 assert.match(html,/if \(TEST_MODE\) \{/);
});
test("developer policy is explicit about local-only scope and no backend privilege",()=>{
 assert.match(policy,/client-side UI policy/);
 assert.match(policy,/server-side ACLs/);
 assert.doesNotMatch(policy,/fetch\(|ipcRenderer|WebSocket|updateDoc|runTransaction|localStorage|sessionStorage/);
});


test("reverified owner rebuilds empty LAB from static templates without a rack redraw",()=>{
 const src=html.match(/function mountDeveloperLabs\(\)\{[\s\S]*?\n\}/)?.[0];
 assert.ok(src,"owner LAB remount helper should be defined");
 const nodes=[];
 const makeNode=kind=>({kind,hidden:false,cloneNode(){return makeNode(kind)}});
 const developerLabHost={
  querySelector:selector=>nodes.find(node=>selector==="#rawDiagnosticsDetails"?
   node.kind==="diagnostics":selector===".raw-daw-toolbar"&&node.kind==="daw")||null,
  append:node=>nodes.push(node),
  prepend:node=>nodes.unshift(node),
  replaceChildren:()=>{nodes.length=0}
 };
 let authorized=false,attached=0;
 const countAttach=()=>{attached++};
 const context={
  developerAllowed:()=>authorized,
  pluginHost:{querySelector:selector=>selector===".chain-control"?{}:null},
  developerLabHost,
  developerUiTemplates:{diagnostics:makeNode("diagnostics"),daw:makeNode("daw")},
  window:{
   RAWStudioSim:{attach:countAttach},
   RAWStudioGatewayV1:{attach:countAttach},
   RAWChainArchiveV1:{attach:countAttach},
   RAWDeveloperRackModels:()=>({}),RAWDawBridge:{refresh(){}}
  }
 };
 vm.runInNewContext(src+";mountDeveloperLabs();",context);
 assert.equal(nodes.length,0,"no unauthenticated LAB after logout");
 assert.equal(attached,0,"no transport mounted before verification");
 authorized=true;
 vm.runInNewContext(src+";mountDeveloperLabs();",context);
 assert.equal(attached,3,"all three LAB panels attached after fresh owner verification");
 assert.deepEqual(nodes.map(n=>n.kind),["daw","diagnostics"]);
 assert.equal(nodes[1].hidden,true,"diagnostics are initially collapsed");
 developerLabHost.replaceChildren();
 assert.equal(nodes.length,0,"logout destroys live LAB elements");
 vm.runInNewContext(src+";mountDeveloperLabs();",context);
 assert.equal(attached,6,"LAB must remount on subsequent verified login");
 assert.deepEqual(nodes.map(n=>n.kind),["daw","diagnostics"]);
 assert.match(html,/if\(developerAllowed\(\)\)mountDeveloperLabs\(\)/);
 assert.match(html,/developerUiTemplates\.diagnostics=diagnosticsTemplate\.cloneNode\(true\)/);
 assert.match(html,/developerUiTemplates\.daw=dawTemplate\.cloneNode\(true\)/);
});

test("login navigation removes fixed audio dock and restores email input focus",()=>{
 const nav=html.match(/window\.goTo = function\(screenId\) \{[\s\S]*?\n\};/)?.[0];
 assert.ok(nav);
 const screens=Object.fromEntries(["login","plugin","developer","projects","sessions"].map(id=>[
  id,{classList:{active:false,remove(){this.active=false},add(){this.active=true},
   contains(){return this.active}}}
 ]));
 let focused=0;
 const email={focus(){focused++}};
 const dock={hidden:false};
 const buttons=[...Object.keys(screens)].map(screen=>({dataset:{screen},classList:{toggle(){}}}));
 const context={
  currentUser:null,developerAllowed:()=>false,TEST_MODE:true,activeSessionId:null,
  pluginHost:{querySelector:selector=>selector==="#rawAudioDock"?dock:
   selector===".chain-control"?{}:null},
  projectsHost:{querySelector:()=>({})},
  document:{
   getElementById:id=>id==="loginEmail"?email:screens[id],
   querySelectorAll:selector=>selector===".screen"?Object.values(screens):buttons
  },
  window:{requestAnimationFrame:callback=>callback()},
  fitRackDevices(){},renderPlugin(){},renderSessions(){}
 };
 vm.runInNewContext(nav+";window.goTo('login');",context);
 assert.equal(screens.login.classList.active,true);
 assert.equal(dock.hidden,true,"fixed audio dock must not cover login controls");
 assert.equal(focused,2,"focus must be restored on login activation and next frame");
 context.currentUser={uid:"owner"};
 vm.runInNewContext(nav+";window.goTo('plugin');",context);
 assert.equal(dock.hidden,false,"audio dock is visible again in Control Room");
});
