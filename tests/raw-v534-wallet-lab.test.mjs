import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
function engine(){
 const vm={};runInNewContext(read("raw-wallet-lab-v534.js"),vm);
 return vm.RAWWalletLabV534;
}
test("V5.34 hotfix: fractional Electron performance.now milliseconds are supported",()=>{
 let at=1000.875;
 const m=engine().createModel({now:()=>at});
 m.fund();
 assert.equal(m.snapshot().balanceMicros,20_000_000);
 m.start(["bettermaker","ngBusComp","ngTubeComp"]);
 at=2001.125;
 assert.equal(m.snapshot().spentMicros,15571); // 1001 integer milliseconds at 56 RAW/h
 at=16000.875;
 const end=m.pause();
 assert.equal(end.spentMicros,233333);
 assert.equal(end.balanceMicros,19_766_667);
});
test("V5.34 hotfix: browser UI with fractional performance clock can click Fund and START",()=>{
 let at=4500.125,callback=null,intervals=0;
 const context={
  performance:{now:()=>at},
  setInterval(fn){callback=fn;intervals++;return intervals;},
  clearInterval(){callback=null;}
 };
 runInNewContext(read("raw-wallet-lab-v534.js"),context);
 const buttons=new Map(),roles=new Map();
 for(const action of ["fund","start","pause","reset"]){
  const element={dataset:{},disabled:false,addEventListener(_type,fn){this.action=fn;},
   click(){this.action({currentTarget:this});}};
  buttons.set(action,element);
 }
 for(const role of ["balance","spent","time","rate","status","notice","history"]){
  roles.set(role,{textContent:"",items:[],replaceChildren(){this.items=[];},
   append(node){this.items.push(node);}});
 }
 const checks=[{value:"bettermaker",checked:true},{value:"ngBusComp",checked:true},
  {value:"ngTubeComp",checked:true}];
 const host={
  innerHTML:"",hidden:true,
  querySelector(q){
   const match=/^\[data-(role|action)="([^"]+)"\]$/.exec(q);
   return match?.[1]==="action"?buttons.get(match[2]):roles.get(match?.[2]);
  },
  querySelectorAll(q){assert.equal(q,'input[type="checkbox"]');return checks;}
 };
 const doc={
  getElementById:id=>id==="rawWalletLabV534"?host:null,
  createElement:()=>({textContent:""})
 };
 const app=context.RAWWalletLabV534.mount(doc,{testMode:true});
 assert.equal(app.setAccess(true),true);
 buttons.get("fund").click();
 assert.equal(roles.get("balance").textContent,"20,000000 RAW");
 buttons.get("start").click();
 assert.equal(app.snapshot().running,true);
 assert.equal(roles.get("notice").textContent.includes("INVALID_DEMO_CLOCK"),false);
 at=15500.875;
 callback();
 assert.equal(app.snapshot().spentMicros,171111);
 buttons.get("pause").click();
 assert.equal(app.snapshot().running,false);
 assert.equal(app.snapshot().status,"paused");
 const spent=app.snapshot().spentMicros;
 at=25000.5;
 assert.equal(app.snapshot().spentMicros,spent);
 app.dispose();
 assert.equal(host.hidden,true);
 assert.equal(app.snapshot().funded,false);
});
test("V5.34: 1 EUR is 1 RAW; 20 test RAW and idle state cost exactly zero",()=>{
 const lib=engine();let time=1000;
 const model=lib.createModel({now:()=>time});
 assert.equal(model.snapshot().balanceMicros,0);
 assert.equal(model.snapshot().running,false);
 assert.equal(model.fund().balanceMicros,20_000_000);
 time+=3600000;
 assert.equal(model.snapshot().balanceMicros,20_000_000);
 assert.equal(model.snapshot().spentMicros,0);
 assert.equal(model.snapshot().history.length,1);
 assert.equal(lib.format(20_000_000),"20,000000");
});
test("V5.34: 18+15+23 RAW/hr costs 0.233333 RAW for 15 seconds, including pause",()=>{
 let time=1000;
 const m=engine().createModel({now:()=>time});
 m.fund();
 m.start(["bettermaker","ngBusComp","ngTubeComp"]);
 time+=1000;assert.equal(m.snapshot().spentMicros,15555);
 time+=9000;assert.equal(m.snapshot().spentMicros,155555);
 m.pause();assert.equal(m.snapshot().status,"paused");
 time+=900000;assert.equal(m.snapshot().spentMicros,155555); // idle is free
 m.start(["bettermaker","ngBusComp","ngTubeComp"]);
 time+=5000;
 const v=m.pause();
 assert.equal(v.spentMicros,233333);
 assert.equal(v.balanceMicros,19_766_667);
 assert.equal(v.elapsedMs,15000);
 assert.equal(v.history.length,3);
 assert.equal(v.history[2].amountMicros,-77778);
});
test("V5.34: one Bettermaker device costs 0.005 RAW per second",()=>{
 let at=0;const m=engine().createModel({now:()=>at});
 m.fund();m.start(["bettermaker"]);at=1000;
 assert.equal(m.pause().spentMicros,5000);
});
test("V5.34: no free balance, no selections, duplicate devices, or double funding",()=>{
 const m=engine().createModel({now:()=>1234});
 assert.throws(()=>m.start(["bettermaker"]),/DEMO_NOT_READY/);
 m.fund();
 assert.throws(()=>m.fund(),/DEMO_ALREADY_FUNDED/);
 assert.throws(()=>m.start([]),/DEMO_INVALID_DEVICES/);
 assert.throws(()=>m.start(["bettermaker","bettermaker"]),/DEMO_INVALID_DEVICES/);
 assert.throws(()=>m.start(["foreign"]),/DEMO_INVALID_DEVICES/);
 m.start(["ngTubeComp"]);
 assert.throws(()=>m.start(["ngBusComp"]),/DEMO_NOT_READY/);
});
test("V5.34: exhausted balance stops test timer and refuses further processing",()=>{
 let at=10000;
 const m=engine().createModel({now:()=>at});
 m.fund();m.start(["bettermaker","ngBusComp","ngTubeComp"]);
 at+=1300000;
 const s=m.tick();
 assert.equal(s.running,false);
 assert.equal(s.status,"exhausted");
 assert.equal(s.balanceMicros,0);
 assert.equal(s.spentMicros,20_000_000);
 assert.throws(()=>m.start(["bettermaker"]),/DEMO_NO_BALANCE/);
});
test("V5.34: reset clears all demo money, history and active processing",()=>{
 let at=0;
 const m=engine().createModel({now:()=>at});
 m.fund();m.start(["bettermaker"]);at+=10000;
 m.reset();
 assert.equal(m.snapshot().balanceMicros,0);
 assert.equal(m.snapshot().status,"empty");
 assert.equal(m.snapshot().history.length,0);
 assert.equal(m.snapshot().elapsedMs,0);
 m.fund();assert.equal(m.snapshot().balanceMicros,20_000_000);
});
test("V5.34: production mode never mounts or injects test billing controls",()=>{
 const lib=engine();
 const host={innerHTML:"initial",hidden:true};
 const doc={getElementById:id=>id==="rawWalletLabV534"?host:null};
 const instance=lib.mount(doc,{testMode:false});
 assert.equal(host.innerHTML,"initial");
 assert.equal(instance.active(),false);
 assert.equal(instance.setAccess(true),false);
});
test("V5.34: owner-only developer LAB owns demo UI; production shows no legacy euro credits",()=>{
 const html=read("index.html");
 assert.match(html,/<div id="rawWalletLabV534" hidden/);
 assert.match(html,/raw-wallet-lab-v534\.js/);
 assert.match(html,/raw-wallet-lab-v534\.css/);
 assert.match(html,/rawWalletLabV534\?\.setAccess\?\.\(allowed\)/);
 assert.match(html,/RAWWalletLabV534\?\.mount\?\.\(document,\{testMode:TEST_MODE\}\)/);
 assert.match(html,/TEST_MODE \? "TEST — bez naplate" : \(window\.RAWTokenDisplayV532/);
 assert.doesNotMatch(html,/id="liveCredits">.*Number\(currentUserData\?\.credits/);
 const js=read("raw-wallet-lab-v534.js");
 assert.doesNotMatch(js,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|\bgetFirestore\b|\bgetAuth\b/i);
 assert.match(js,/model\.reset\(\);/);
 assert.match(js,/stopTimer\(\)/);
});
