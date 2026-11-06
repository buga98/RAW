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
