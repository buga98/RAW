import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const trackerCode=readFileSync(new URL("../studio-state-reconciliation-v3.js",import.meta.url),"utf8");
const clientCode=readFileSync(new URL("../studio-sim-client.js",import.meta.url),"utf8");
const SESSION="test-1793883600000";
function harness(){
 let time=0,idSeq=0;
 const clock=new Map(),sockets=[];
 const tick=ms=>{
  time+=ms;
  for(let pass=0;pass<12;pass++){
   const due=[...clock].filter(([,t])=>t.due<=time).sort((a,b)=>a[1].due-b[1].due);
   if(!due.length)break;
   for(const [id,t] of due){
    if(!clock.has(id))continue;
    clock.delete(id);t.fn();
    if(t.interval)clock.set(id,{...t,due:time+t.interval});
   }
  }
 };
 const delay=(fn,ms,interval=false)=>{
  const id=++idSeq;clock.set(id,{due:time+ms,fn,interval:interval?ms:0});return id;
 };
 class FakeButton{
  constructor(){this.dataset={};this.listeners={};this.textContent="";this.disabled=false;
   this.classList={toggle(){},contains:()=>false};}
  addEventListener(name,fn){this.listeners[name]=fn;}
  click(){this.listeners.click?.();}
 }
 class FakePanel extends FakeButton{
  constructor(){super();this.isConnected=false;this.children=new Map();
   this.devices=["bettermaker_eq","ngbuscomp","ngtubecomp"].map(id=>{
    const button=new FakeButton();button.dataset.simDevice=id;return button;
   });}
  querySelector(id){
   if(!this.children.has(id))this.children.set(id,new FakeButton());
   return this.children.get(id);
  }
  querySelectorAll(sel){if(sel==="[data-sim-device]")return this.devices;return [];}
 }
 const root={panel:null,observer:null,prepend(panel){panel.isConnected=true;this.panel=panel;}};
 class FakeMutationObserver {
  constructor(fn){this.fn=fn;}
  observe(target){target.observer=this;}
  disconnect(){root.observer=null;}
 }
 class Socket {
  static OPEN=1;
  constructor(url){this.url=url;this.readyState=0;this.sent=[];sockets.push(this);}
  send(text){this.sent.push(JSON.parse(text));}
  open(){this.readyState=1;this.onopen?.();}
  receive(payload){this.onmessage?.({data:JSON.stringify(payload)});}
  close(){this.readyState=3;this.onclose?.({code:1000,reason:""});}
 }
 const window={
  location:{search:"?testMode=1"},
  RAWStudioSimSession:()=>SESSION,
  RAWDawBridge:{disconnect(){}},
  addEventListener(){},
  RAWStudioStateV3:null
 };
 const context={window,document:{createElement(){return new FakePanel();}},
  URLSearchParams,WebSocket:Socket,MutationObserver:FakeMutationObserver,
  Date,setTimeout:(fn,ms)=>delay(fn,ms),clearTimeout:id=>clock.delete(id),
  setInterval:(fn,ms)=>delay(fn,ms,true),clearInterval:id=>clock.delete(id)
 };
 vm.runInNewContext(trackerCode,context);
 vm.runInNewContext(clientCode,context);
 window.RAWStudioSim.attach(root);
 return {
  root,window,clock,tick,sockets,
  latest:()=>sockets.at(-1),
  connect(){
   root.panel.querySelector("#rawSimConnect").click();
   const socket=sockets.at(-1);socket.open();
   socket.receive({type:"studio-sim-claimed",simulated:true,leaseEpoch:1,sessionId:SESSION});
   socket.receive({type:"simulator-snapshot",simulated:true,hardwareVerified:false,leaseEpoch:1,stateVersion:0,
    devices:{
     bettermaker_eq:{online:true,source:"simulated-memory",values:{eq1Gain:0}},
     ngbuscomp:{online:true,source:"simulated-memory",values:{L_threshold:-8.5}},
     ngtubecomp:{online:true,source:"simulated-memory",values:{L_thd:0}}
    }});
   return socket;
  },
  move(deviceId,parameter,value){
   const knob={dataset:{deviceId,id:parameter,value:String(value)},
    classList:{contains:klass=>klass==="knob"}};
   root.observer.fn([{target:knob}]);
   this.tick(170);
  },
  comparison:()=>root.panel.querySelector("#rawSimCompared").textContent,
  history:()=>root.panel.querySelector("#rawSimHistory").textContent
 };
}

test("client wires local knob -> pending -> distinct simulated readback",()=>{
 const h=harness(),socket=h.connect();
 h.move("ngbuscomp","L_threshold",-12);
 const cmd=socket.sent.find(m=>m.type==="parameter-change");
 assert.equal(cmd.deviceId,"ngbuscomp");
 assert.equal(cmd.parameter,"L_threshold");
 assert.equal(cmd.value,-12);
 assert.match(h.comparison(),/requested: -12 \| SIM: -8.5 \| PENDING/);
 socket.receive({type:"simulator-command-result",requestId:cmd.requestId,
  sessionId:SESSION,leaseEpoch:1,sequence:cmd.sequence,deviceId:cmd.deviceId,parameter:cmd.parameter,
  status:"simulated-applied",simulated:true,hardwareVerified:false,stateVersion:1,
  readback:{value:-12,source:"simulated-memory",hardwareVerified:false}});
 assert.match(h.comparison(),/requested: -12 \| SIM: -12 \| SIM CONFIRMED/);
 assert.match(h.history(),/SIM READBACK/);
});
test("offline device edits remain unconfirmed and do not emit socket commands",()=>{
 const h=harness(),socket=h.connect();
 socket.receive({type:"simulator-device-state",deviceId:"ngbuscomp",online:false,simulated:true});
 socket.receive({type:"simulator-snapshot",simulated:true,hardwareVerified:false,
  leaseEpoch:1,stateVersion:1,devices:{
   ngbuscomp:{online:false,source:"simulated-memory",values:{L_threshold:-8.5}}
  }});
 const before=socket.sent.length;
 h.move("ngbuscomp","L_threshold",-10);
 assert.equal(socket.sent.length,before);
 assert.match(h.comparison(),/requested: -10 \| SIM: -8.5 \| DEVICE OFFLINE/);
});
test("invalid simulated ACK cannot cancel timer or falsify confirmed state",()=>{
 const h=harness(),socket=h.connect();
 h.move("ngbuscomp","L_threshold",-12);
 const cmd=socket.sent.find(m=>m.type==="parameter-change");
 socket.receive({type:"simulator-command-result",requestId:cmd.requestId,
  sessionId:SESSION,leaseEpoch:1,sequence:cmd.sequence,deviceId:cmd.deviceId,parameter:cmd.parameter,
  status:"simulated-applied",simulated:true,hardwareVerified:true,stateVersion:1,
  readback:{value:-12,source:"simulated-memory"}});
 assert.match(h.history(),/IGNORED/);
 assert.match(h.comparison(),/PENDING/);
 h.tick(3400);
 assert.match(h.comparison(),/TIMEOUT/);
 assert.doesNotMatch(h.comparison(),/SIM CONFIRMED/);
});
test("client disconnect prevents further socket commands and keeps local-only status",()=>{
 const h=harness(),socket=h.connect();
 h.move("ngbuscomp","L_threshold",-12);
 h.window.RAWStudioSim.disconnect();
 const before=socket.sent.length;
 h.move("ngbuscomp","L_threshold",-7);
 assert.equal(socket.sent.length,before);
 assert.match(h.comparison(),/LOCAL ONLY/);
 assert.equal(h.window.RAWStudioSim.interceptsControls(),false);
});

test("socket loss clears last snapshot so historical values cannot appear live",()=>{
 const h=harness(),socket=h.connect();
 assert.match(h.root.panel.querySelector("#rawSimReadback").textContent,/ngBusComp/);
 socket.close();
 assert.match(h.root.panel.querySelector("#rawSimReadback").textContent,/No simulated readback snapshot/);
 assert.equal(h.window.RAWStudioSim.interceptsControls(),false);
 assert.match(h.history(),/CONNECTION LOST/);
});

test("newer ACK wins if network delivers older ACK afterward",()=>{
 const h=harness(),socket=h.connect();
 h.move("ngbuscomp","L_threshold",-12);
 h.move("ngbuscomp","L_threshold",-10);
 const commands=socket.sent.filter(m=>m.type==="parameter-change");
 assert.equal(commands.length,2);
 const older=commands[0],newer=commands[1];
 const result=(cmd,version)=>({type:"simulator-command-result",requestId:cmd.requestId,
  sessionId:SESSION,leaseEpoch:1,sequence:cmd.sequence,deviceId:cmd.deviceId,
  parameter:cmd.parameter,status:"simulated-applied",simulated:true,hardwareVerified:false,
  stateVersion:version,readback:{value:cmd.value,source:"simulated-memory",hardwareVerified:false}});
 socket.receive(result(newer,2));
 socket.receive(result(older,1));
 assert.match(h.comparison(),/requested: -10 \| SIM: -10 \| SIM CONFIRMED/);
 assert.match(h.history(),/IGNORED/);
});
test("stale resync snapshot cannot overwrite newer confirmed memory",()=>{
 const h=harness(),socket=h.connect();
 h.move("ngbuscomp","L_threshold",-12);
 const cmd=socket.sent.find(m=>m.type==="parameter-change");
 socket.receive({type:"simulator-command-result",requestId:cmd.requestId,
  sessionId:SESSION,leaseEpoch:1,sequence:cmd.sequence,deviceId:cmd.deviceId,
  parameter:cmd.parameter,status:"simulated-applied",simulated:true,hardwareVerified:false,
  stateVersion:3,readback:{value:-12,source:"simulated-memory",hardwareVerified:false}});
 socket.receive({type:"simulator-snapshot",simulated:true,hardwareVerified:false,
  leaseEpoch:1,stateVersion:2,devices:{
   ngbuscomp:{online:true,source:"simulated-memory",values:{L_threshold:-8.5}}
  }});
 assert.match(h.comparison(),/requested: -12 \| SIM: -12 \| SIM CONFIRMED/);
 assert.match(h.root.panel.querySelector("#rawSimReadback").textContent,/L_threshold=-12/);
});
