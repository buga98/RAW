import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const tracker=readFileSync(new URL("../studio-state-reconciliation-v3.js",import.meta.url),"utf8");
const client=readFileSync(new URL("../studio-gateway-client.js",import.meta.url),"utf8");
const SESSION="test-1793883600000";

function harness(){
 let time=0,nextTimer=0;
 const timers=new Map(),sockets=[];
 const delay=(fn,ms,interval=0)=>{
  const id=++nextTimer;timers.set(id,{fn,at:time+ms,interval});return id;
 };
 const tick=ms=>{
  time+=ms;
  for(let i=0;i<15;i++){
   const due=[...timers].filter(([,t])=>t.at<=time);
   if(!due.length)break;
   for(const [id,t] of due){
    timers.delete(id);t.fn();
    if(t.interval)timers.set(id,{...t,at:time+t.interval});
   }
  }
 };
 class FakeElement{
  constructor(){this.dataset={};this.textContent="";this.value="";this.disabled=false;this.handlers={};
   this.classList={contains(){return false}};this.isConnected=false;}
  addEventListener(k,fn){this.handlers[k]=fn;}
  click(){this.handlers.click?.();}
 }
 class Panel extends FakeElement{
  constructor(){super();this.fields=new Map();}
  querySelector(k){
   if(!this.fields.has(k))this.fields.set(k,new FakeElement());
   return this.fields.get(k);
  }
 }
 const root={panel:null,observer:null,prepend(p){p.isConnected=true;this.panel=p;}};
 class MutationObserver{
  constructor(fn){this.callback=fn;}
  disconnect(){root.observer=null;}
  observe(r){r.observer=this;}
 }
 class Socket{
  static OPEN=1;
  constructor(url){this.url=url;this.readyState=0;this.sent=[];sockets.push(this);}
  send(t){this.sent.push(JSON.parse(t));}
  open(){this.readyState=1;this.onopen?.();}
  receive(msg){this.onmessage?.({data:JSON.stringify(msg)});}
  close(){if(this.readyState===3)return;this.readyState=3;this.onclose?.();}
 }
 let legacy=0,older=0;
 const window={location:{search:"?testMode=1"},
  RAWStudioSimSession:()=>SESSION,
  RAWDawBridge:{disconnect(){legacy++;}},
  RAWStudioSim:{disconnect(){older++;}},
  addEventListener(){},RAWStudioStateV3:null};
 const scope={window,document:{createElement:()=>new Panel()},URLSearchParams,
  MutationObserver,WebSocket:Socket,Date,
  setTimeout:(fn,ms)=>delay(fn,ms),clearTimeout:id=>timers.delete(id),
  setInterval:(fn,ms)=>delay(fn,ms,ms),clearInterval:id=>timers.delete(id)};
 vm.runInNewContext(tracker,scope);
 vm.runInNewContext(client,scope);
 window.RAWStudioGatewayV1.attach(root);
 const panel=root.panel;
 return {root,panel,window,tick,sockets,get legacy(){return legacy;},get older(){return older;},
  connect(){
   panel.querySelector("#rawGatewayToken").value="T".repeat(64);
   panel.querySelector("#rawGatewayConnect").click();
   const ws=sockets.at(-1);ws.open();
   ws.receive({type:"gateway-auth-ok",role:"client",labOnly:true});
   ws.receive({type:"gateway-claim-pending",leaseEpoch:3,labOnly:true});
   ws.receive({type:"gateway-claimed",sessionId:SESSION,leaseEpoch:3,labOnly:true});
   return ws;
  },
  move(deviceId,parameter,value){
   const knob={dataset:{deviceId,id:parameter,value:String(value)},
    classList:{contains:k=>k==="knob"}};
   root.observer.callback([{target:knob}]);tick(170);
  },
  compare:()=>panel.querySelector("#rawGatewayComparison").textContent,
  log:()=>panel.querySelector("#rawGatewayLog").textContent
 };
}
const makeReceipt=cmd=>({
 type:"gateway-command-result",requestId:cmd.requestId,
 sequence:cmd.sequence,sessionId:cmd.sessionId,leaseEpoch:cmd.leaseEpoch,
 deviceId:cmd.deviceId,parameter:cmd.parameter,
 status:"simulated-applied",simulated:true,hardwareVerified:false,
 stateVersion:cmd.sequence,
 readback:{value:cmd.value,source:"simulated-memory",hardwareVerified:false}
});
test("manual token stays memory-only and old bridges are stopped before claim",()=>{
 const h=harness(),ws=h.connect();
 assert.equal(h.legacy,1);assert.equal(h.older,1);
 assert.equal(ws.sent[0].type,"gateway-auth");
 assert.equal(ws.sent[0].role,"client");
 assert.equal(ws.sent[0].token.length,64);
 assert.equal(h.panel.querySelector("#rawGatewayToken").value,"");
 assert.equal(ws.sent[1].type,"gateway-claim");
 assert.equal(ws.sent[1].sessionId,SESSION);
});
test("knob sends through Gateway and shows intent before SIMULATED readback",()=>{
 const h=harness(),ws=h.connect();
 h.move("ngbuscomp","L_threshold",-12);
 const cmd=ws.sent.find(x=>x.type==="parameter-change");
 assert.equal(cmd.deviceId,"ngbuscomp");
 assert.equal(cmd.value,-12);
 assert.match(h.compare(),/UI: -12 \| SIM MEMORY: — \| PENDING/);
 ws.receive(makeReceipt(cmd));
 assert.match(h.compare(),/UI: -12 \| SIM MEMORY: -12 \| SIM CONFIRMED/);
 assert.match(h.log(),/SIM READBACK/);
});
test("a false physical ACK cannot confirm a pending Gateway command",()=>{
 const h=harness(),ws=h.connect();
 h.move("ngbuscomp","L_threshold",-12);
 const cmd=ws.sent.find(x=>x.type==="parameter-change");
 ws.receive({...makeReceipt(cmd),hardwareVerified:true});
 assert.match(h.compare(),/PENDING/);
 h.tick(3400);
 assert.match(h.compare(),/TIMEOUT/);
 assert.doesNotMatch(h.compare(),/SIM CONFIRMED/);
});
test("gateway disconnect clears pending and refuses to replay local changes",()=>{
 const h=harness(),ws=h.connect();
 h.move("ngbuscomp","L_threshold",-12);
 const before=ws.sent.length;
 h.window.RAWStudioGatewayV1.disconnect();
 h.move("ngbuscomp","L_threshold",-8);
 assert.equal(ws.sent.length,before+1); // explicit release, never a parameter replay
 assert.equal(ws.sent.at(-1).type,"gateway-release");
 assert.equal(h.window.RAWStudioGatewayV1.interceptsControls(),false);
 assert.match(h.compare(),/LOCAL ONLY/);
});
test("lost lease blocks further control until explicit fresh claim",()=>{
 const h=harness(),ws=h.connect();
 h.move("ngtubecomp","L_thd",70);
 ws.receive({type:"gateway-lease-ended",reason:"AGENT_DISCONNECTED",leaseEpoch:3,labOnly:true});
 const before=ws.sent.length;
 h.move("ngtubecomp","L_thd",75);
 assert.equal(ws.sent.length,before);
 assert.match(h.compare(),/LOCAL ONLY/);
 assert.match(h.log(),/AGENT_DISCONNECTED/);
});
