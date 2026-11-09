import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,statSync} from "node:fs";
import vm from "node:vm";

const read=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const html=read("index.html");
const css=read("raw-studio-ux-v513.css");
const nav=read("raw-auth-navigation-v515.js");
const main=read("index.js");
function element(){
 return {hidden:false,textContent:"",classList:{
  values:new Set(),add(v){this.values.add(v);},
  remove(v){this.values.delete(v);},contains(v){return this.values.has(v);},
  toggle(v,on){if(on)this.values.add(v);else this.values.delete(v);}
 },dataset:{},style:{},focus(){}};
}
function scope(){
 const ids=Object.fromEntries([
  "login","account","plugin","projects","upload","devices","sessions","developer",
  "loginNav","accountNav","rawAccountEmail","rawAccountCredits","rawAccountAccessStatus",
  "loginEmail"
 ].map(x=>[x,element()]));
 const tabs=["login","account","upload","devices","plugin","projects","sessions","developer"]
  .map(name=>{const el=ids[name+"Nav"]||element();el.dataset.screen=name;return el;});
 const doc={
  getElementById:id=>ids[id]||null,
  querySelectorAll:query=>query===".screen"?
   ["login","account","plugin","projects","upload","devices","sessions","developer"].map(x=>ids[x]):
   query===".tab"?tabs:[]
 };
 const window={};
 vm.runInNewContext(nav,{window,document:doc});
 return {window,doc,ids,tabs};
}
test("V5.19: original compact Audio Region is restored and floats through devices",()=>{
 const original=read("style.css");
 assert.match(html,/<div class="audio-region-panel" id="rawAudioDock"/);
 assert.match(html,/class="audio-dock-actions"/);
 assert.match(html,/<strong>AUDIO REGION<\/strong>/);
 assert.match(html,/id="rawAudioDockBody"/);
 assert.match(html,/id="waveTimeline"/);
 assert.match(html,/id="waveform"/);
 assert.match(html,/id="rawLocalExportButton"/);
 assert.match(html,/id="rawLocalExportBits"/);
 assert.match(html,/id="rawDockToggle"/);
 assert.match(html,/>− MINIMIZE<\/button>/);
 assert.match(html,/window\.RAWAudioDockV516\?\.bind\?\.\(/);
 assert.match(original,/#plugin\.active \.audio-region-panel \{[\s\S]*?position: fixed;/);
 assert.match(original,/#plugin\.active \.waveform \{ height: 88px/);
 assert.match(original,/#plugin\.active \.transport-btn \{ width: 36px/);
 assert.match(css,/\.audio-region-panel\.raw-source-safe-inline/);
 assert.match(css,/position:relative!important/);
 assert.doesNotMatch(css,/position:fixed!important/);
 assert.doesNotMatch(css,/max-height:min\(60vh,550px\)/);
 assert.doesNotMatch(html,/class="raw-source-utilities"/);
});
test("V5.19: source waveform and transport remain distinct from digital premaster",()=>{
 assert.match(html,/LOCAL SOURCE EXPORT · no analog hardware processing · NOT A MASTER/);
 assert.match(html,/↓ EXPORT SOURCE WAV/);
 assert.match(html,/CHANGE FILE/);
 assert.match(html,/class="file-pill">♫ /);
 assert.match(html,/\.replace\(\/\[&<>"'\]\/g/);
 assert.match(read("raw-local-wav-export-v1.js"),/NOT a studio print, analog master/);
 const render=html.slice(html.indexOf("function renderPlugin() {"),
  html.indexOf("window.renderSessions = async function"));
 assert.ok(render.indexOf("mountDigitalPremaster();")>=0);
 assert.ok(render.indexOf("const sourceDock=pluginHost.querySelector")>
  render.indexOf("mountDigitalPremaster();"));
});
test("V5.16: original Windows taskbar icon is restored across Electron and sidebar",()=>{
 assert.match(html,/<img src="icon.png" alt="RAW Mastering"/);
 assert.doesNotMatch(html,/<div class="logo">🎛️<\/div>/);
 assert.match(main,/icon: path\.join\(__dirname, "icon.png"\)/);
 assert.match(html,/rel="icon" type="image\/png" href="icon.png"/);
 const png=readFileSync(new URL("../icon.png",import.meta.url));
 assert.equal(png.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
 assert.ok(statSync(new URL("../icon.png",import.meta.url)).size>1000);
});
test("V5.15: guest sees Prijava, while private account panel and button remain hidden",()=>{
 const {window,doc,ids}=scope();
 window.RAWAuthNavigationV515.apply(doc,{authenticated:false});
 assert.equal(ids.loginNav.hidden,false);
 assert.equal(ids.accountNav.hidden,true);
 assert.equal(ids.account.hidden,true);
 assert.equal(ids.rawAccountEmail.textContent,"—");
 assert.equal(ids.rawAccountAccessStatus.textContent,"SIGNED OUT");
});
test("V5.15: logged-in account sees Moj račun instead of Prijava",()=>{
 const {window,doc,ids}=scope();
 window.RAWAuthNavigationV515.apply(doc,{
  authenticated:true,email:"owner@example.test",creditsLabel:"TEST — bez naplate",verifiedOwner:true
 });
 assert.equal(ids.loginNav.hidden,true);
 assert.equal(ids.accountNav.hidden,false);
 assert.equal(ids.account.hidden,false);
 assert.equal(ids.rawAccountEmail.textContent,"owner@example.test");
 assert.equal(ids.rawAccountCredits.textContent,"TEST — bez naplate");
 assert.equal(ids.rawAccountAccessStatus.textContent,"VERIFIED OWNER · LOCAL TEST");
 assert.match(html,/id="accountNav" hidden/);
 assert.match(html,/id="rawAccountEmail"/);
 assert.match(html,/id="rawAccountCredits"/);
 assert.match(html,/onclick="logoutUser\(\)"/);
});
test("V5.15: rendering an account name uses textContent and no unsafe HTML",()=>{
 const {window,doc,ids}=scope();
 const htmlAttack="<img src=x onerror=alert(1)>";
 window.RAWAuthNavigationV515.apply(doc,{authenticated:true,email:htmlAttack});
 assert.equal(ids.rawAccountEmail.textContent,htmlAttack);
 assert.doesNotMatch(nav,/\.innerHTML\s*=/);
 assert.doesNotMatch(nav,/(?:eval|Function|WebSocket|fetch)\s*\(/);
});
test("V5.15: after logout the login navigation is restored and account disappears",()=>{
 const {window,doc,ids}=scope();
 window.RAWAuthNavigationV515.apply(doc,{authenticated:true,email:"owner@example.test"});
 window.RAWAuthNavigationV515.apply(doc,{authenticated:false});
 assert.equal(ids.loginNav.hidden,false);
 assert.equal(ids.accountNav.hidden,true);
 assert.equal(ids.account.hidden,true);
 assert.equal(ids.rawAccountEmail.textContent,"—");
});
test("V5.15: signed-in attempt to navigate to login redirects to account",()=>{
 const match=html.match(/window\.goTo = function\(screenId\) \{[\s\S]*?\n\};/);
 assert.ok(match);
 const s=scope();
 const state={lastRender:0};
 const sandbox={
  window:s.window,document:s.doc,currentUser:{uid:"owner",emailVerified:true,email:"owner@example.test"},
  developerAllowed:()=>true,TEST_MODE:true,activeSessionId:null,
  auth:{currentUser:{uid:"owner"}},
  pluginHost:{querySelector:()=>null},
  projectsHost:{querySelector:()=>({})},
  renderPlugin:()=>{state.lastRender++;},
  renderSessions:()=>{},fitRackDevices:()=>{},
  requestAnimationFrame:()=>{},
  window:{...s.window,requestAnimationFrame:()=>{}}
 };
 vm.runInNewContext(match[0],sandbox);
 sandbox.window.goTo("login");
 assert.equal(s.ids.account.classList.contains("active"),true);
 assert.equal(s.ids.login.classList.contains("active"),false);
 assert.equal(s.ids.loginNav.hidden,true);
 assert.equal(s.ids.accountNav.hidden,false);
 assert.equal(state.lastRender,0);
});
test("V5.15: anonymous users attempting account view cannot bypass login",()=>{
 const match=html.match(/window\.goTo = function\(screenId\) \{[\s\S]*?\n\};/);
 const s=scope();
 const sandbox={window:{...s.window,requestAnimationFrame:()=>{}},document:s.doc,
  currentUser:null,developerAllowed:()=>false,TEST_MODE:true,activeSessionId:null,
  pluginHost:{querySelector:()=>null},projectsHost:{querySelector:()=>null},
  requestAnimationFrame:()=>{},renderPlugin:()=>{},fitRackDevices:()=>{},
  renderSessions:()=>{}};
 vm.runInNewContext(match[0],sandbox);
 sandbox.window.goTo("account");
 assert.equal(s.ids.login.classList.contains("active"),true);
 assert.equal(s.ids.account.classList.contains("active"),false);
 assert.equal(s.ids.loginNav.hidden,false);
 assert.equal(s.ids.accountNav.hidden,true);
});
