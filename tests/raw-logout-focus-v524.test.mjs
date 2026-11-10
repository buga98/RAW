import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const read=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const mod=read("raw-logout-focus-v524.js");
const html=read("index.html");
function fixture({nativeFocus=true}={}){
 const elements=new Map(),events=[],nativeCalls=[];
 function el(id){
  if(elements.has(id))return elements.get(id);
  const node={id,hidden:id==="rawLogoutConfirm",textContent:"",
   disabled:false,focusCount:0,handlers:{},
   focus(){this.focusCount++;},
   classList:{contains:name=>id==="login"&&name==="active"},
   addEventListener(type,fn){this.handlers[type]=fn;},
   trigger(name,arg){this.handlers[name]?.(arg);}
  };
  elements.set(id,node);return node;
 }
 for(const id of ["rawLogoutConfirm","rawLogoutMessage","rawLogoutYes",
  "rawLogoutNo","login","loginEmail","previous"])el(id);
 const document={getElementById:id=>elements.get(id)||null,
  activeElement:el("previous")};
 const window={document,requestAnimationFrame:fn=>fn(),
  RAWNative:nativeFocus?{restoreLoginFocus:async()=>{nativeCalls.push(1);return {ok:true};}}:{}};
 vm.runInNewContext(mod,{window,document,Promise});
 return {api:window.RAWLogoutFocusV524,el,window,events,nativeCalls};
}
test("V5.24: active session asks for consent in document, not native Electron modal",async()=>{
 const h=fixture(),promise=h.api.request({unsaved:false});
 assert.equal(h.el("rawLogoutConfirm").hidden,false);
 assert.match(h.el("rawLogoutMessage").textContent,/aktivnu sesiju/);
 assert.equal(h.el("rawLogoutYes").focusCount,1);
 h.el("rawLogoutYes").trigger("click");
 assert.equal(await promise,true);
 assert.equal(h.el("rawLogoutConfirm").hidden,true);
});
test("V5.24: unsaved warning remains visible; cancel restores previous focus",async()=>{
 const h=fixture(),promise=h.api.request({unsaved:true});
 assert.match(h.el("rawLogoutMessage").textContent,/NESPREMLJENE/);
 h.el("rawLogoutNo").trigger("click");
 assert.equal(await promise,false);
 assert.equal(h.el("rawLogoutConfirm").hidden,true);
 assert.equal(h.el("previous").focusCount,1);
});
test("V5.24: Escape aborts logout and never accepts a session end",async()=>{
 const h=fixture(),promise=h.api.request();
 let prevented=false;
 h.el("rawLogoutConfirm").trigger("keydown",{
  key:"Escape",preventDefault(){prevented=true;}
 });
 assert.equal(prevented,true);
 assert.equal(await promise,false);
});
test("V5.24: duplicate confirmation and explicit clear never approve logout",async()=>{
 const h=fixture(),first=h.api.request(),second=h.api.request();
 assert.equal(await second,false);
 h.api.clear();
 assert.equal(await first,false);
 assert.equal(h.el("rawLogoutConfirm").hidden,true);
});
test("V5.24: after signout, RAW requests focus for its own window and login input",async()=>{
 const h=fixture();
 const ok=await h.api.restoreLoginFocus({native:true});
 assert.equal(ok,true);
 assert.equal(h.nativeCalls.length,1);
 assert.ok(h.el("loginEmail").focusCount>=2);
 assert.equal(h.el("rawLogoutConfirm").hidden,true);
});
test("V5.24: passive Firebase signout does not steal native window focus",async()=>{
 const h=fixture();
 await h.api.restoreLoginFocus();
 assert.equal(h.nativeCalls.length,0);
 assert.ok(h.el("loginEmail").focusCount>=1);
});
test("V5.24: login not active prevents restoring focus to hidden input",async()=>{
 const h=fixture();
 h.el("login").classList.contains=()=>false;
 await h.api.restoreLoginFocus({native:false});
 assert.equal(h.el("loginEmail").focusCount,0);
});
test("V5.24: confirmation must fail closed if account UI unavailable",async()=>{
 const h=fixture();
 h.window.document.getElementById=id=>id==="rawLogoutConfirm"?null:h.el(id);
 assert.equal(await h.api.request(),false);
});
function logoutHarness({active=true,consent=true,closeSucceeds=true}={}){
 const calls=[],status={hidden:true,textContent:""};
 const window={
  RAWWorkspaceActiveProjectStatus:{getStatus:()=>({dirty:true})},
  RAWLogoutFocusV524:{
   request:async cfg=>{calls.push(["request",cfg.unsaved]);return consent;},
   restoreLoginFocus:async opts=>{calls.push(["restore",opts.native]);return true;}
  },
  RAWAutoSaveV55UI:{stop:()=>calls.push("autosaveStop")},
  goTo:screen=>calls.push(["screen",screen])
 };
 const scope={
  window,console:{error:()=>{}},currentUser:{uid:"owner",emailVerified:true},
  currentUserData:{},activeSessionId:active?"session-123":null,
  auth:{currentUser:{uid:"owner"}},
  signOut:async()=>calls.push("signOut"),
  stopWave:()=>calls.push("waveStop"),
  stopBillingTimer:()=>calls.push("billingStop"),
  stopHeartbeat:()=>calls.push("heartbeatStop"),
  revokeDeveloperLabs:()=>calls.push("revokeDeveloper"),
  updateUserPanel:()=>calls.push("updatePanel"),
  document:{getElementById:id=>id==="rawAccountLogoutError"?status:null}
 };
 window.endChainSession=async opts=>{
  calls.push(["endSession",opts]);
  if(closeSucceeds)scope.activeSessionId=null;
 };
 const match=html.match(/let rawLogoutInProgress=false;\nwindow\.logoutUser = async function\(\) \{[\s\S]*?\n\};/);
 assert.ok(match,"Could not extract real Electron logout handler");
 vm.runInNewContext(match[0],scope);
 return {scope,window,calls,status,handlerSource:match[0]};
}
test("V5.24: declining in-page confirmation preserves authenticated user/session",async()=>{
 const h=logoutHarness({active:true,consent:false});
 await h.window.logoutUser();
 assert.deepEqual(h.calls,[["request",true]]);
 assert.equal(h.scope.activeSessionId,"session-123");
 assert.equal(h.scope.currentUser.uid,"owner");
});
test("V5.24: confirmed session close signs out and restores focused email field",async()=>{
 const h=logoutHarness({active:true,consent:true});
 await h.window.logoutUser();
 assert.equal(h.calls.filter(x=>Array.isArray(x)&&x[0]==="endSession").length,1);
 assert.ok(h.calls.includes("signOut"));
 assert.ok(h.calls.some(x=>Array.isArray(x)&&x[0]==="restore"&&x[1]===true));
 assert.ok(h.calls.some(x=>Array.isArray(x)&&x[0]==="screen"&&x[1]==="login"));
 assert.equal(h.scope.activeSessionId,null);
 assert.equal(h.scope.currentUser,null);
});
test("V5.24: incomplete session termination blocks logout rather than orphaning studio control",async()=>{
 const h=logoutHarness({active:true,closeSucceeds:false});
 await h.window.logoutUser();
 assert.equal(h.calls.includes("signOut"),false);
 assert.equal(h.scope.activeSessionId,"session-123");
 assert.match(h.status.textContent,/Session nije završena/);
 assert.equal(h.status.hidden,false);
});
test("V5.24: no active session skips confirmation and signs out normally",async()=>{
 const h=logoutHarness({active:false});
 await h.window.logoutUser();
 assert.equal(h.calls.some(x=>Array.isArray(x)&&x[0]==="request"),false);
 assert.ok(h.calls.includes("signOut"));
 assert.ok(h.calls.some(x=>Array.isArray(x)&&x[0]==="restore"));
});
test("V5.24: handler and native IPC are constrained to local RAW, no Electron dialogs",()=>{
 const h=logoutHarness();
 assert.doesNotMatch(h.handlerSource.replace(/\/\/[^\n]*/g,""),/\bconfirm\s*\(/);
 assert.match(html,/src="raw-logout-focus-v524\.js"/);
 assert.match(html,/id="rawLogoutConfirm"[^>]* hidden/);
 assert.match(html,/id="rawLogoutYes"/);
 const main=read("index.js"),preload=read("preload.js");
 assert.match(main,/ipcMain\.handle\("raw-restore-login-focus"/);
 assert.match(main,/isLocalAppUrl\(sender\.getURL\(\)\)/);
 assert.match(main,/BrowserWindow\.fromWebContents\(sender\)/);
 assert.match(preload,/restoreLoginFocus: \(\) => ipcRenderer\.invoke\("raw-restore-login-focus"\)/);
 assert.match(read("raw-studio-ux-v513.css"),/#rawLogoutConfirm\[hidden\]/);
});
