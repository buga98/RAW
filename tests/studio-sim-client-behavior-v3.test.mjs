import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const trackerCode=readFileSync(new URL("../studio-state-reconciliation-v3.js",import.meta.url),"utf8");
const clientCode=readFileSync(new URL("../studio-sim-client.js",import.meta.url),"utf8");
const reconnectCode=readFileSync(new URL("../raw-local-reconnect-v57.js",import.meta.url),"utf8");
const SESSION="test-1793883600000";
function harness(){
 let time=0,idSeq=0,currentSession=SESSION;
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
  RAWStudioSimSession:()=>currentSession,
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
 vm.runInNewContext(reconnectCode,context);
 vm.runInNewContext(clientCode,context);
 window.RAWStudioSim.attach(root);
 return {
  root,window,clock,tick,sockets,setSession:next=>{currentSession=next;},
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

test("audit viewer requests only the current lease and clears on disconnect",()=>{
 const h=harness(),socket=h.connect();
 const button=h.root.panel.querySelector("#rawSimAuditButton");
 assert.equal(button.disabled,false);
 button.click();
 assert.equal(socket.sent.at(-1).type,"studio-sim-audit");
 socket.receive({type:"studio-sim-audit-result",simulated:true,hardwareVerified:false,
  leaseEpoch:1,entries:[{n:1,type:"lease-claimed",deviceId:null,parameter:null,status:"claimed"}]});
 assert.match(h.root.panel.querySelector("#rawSimAudit").textContent,/lease-claimed/);
 h.window.RAWStudioSim.disconnect();
 assert.doesNotMatch(h.root.panel.querySelector("#rawSimAudit").textContent,/lease-claimed/);
 assert.equal(button.disabled,true);
});

test("V5.7: unexpected link drop retries automatically and requires a NEW lease + full readback",()=>{
 const h=harness(),old=h.connect();
 assert.equal(h.window.RAWStudioSim.recoveryState().phase,"READY");
 old.close();
 assert.equal(h.window.RAWStudioSim.recoveryState().phase,"RETRY_WAIT");
 assert.match(h.root.panel.querySelector("#rawSimRecoveryStatus").textContent,/RETRY_WAIT/);
 h.tick(349);assert.equal(h.sockets.length,1);
 h.tick(1);assert.equal(h.sockets.length,2);
 const latest=h.latest();latest.open();
 assert.equal(latest.sent[0].type,"studio-sim-claim");
 assert.equal(h.window.RAWStudioSim.recoveryState().phase,"CLAIMING");
 assert.equal(h.window.RAWStudioSim.recoveryState().ready,false);
 latest.receive({type:"studio-sim-claimed",simulated:true,leaseEpoch:2,sessionId:SESSION});
 assert.equal(h.window.RAWStudioSim.recoveryState().phase,"RECONCILING");
 assert.equal(latest.sent.at(-1).type,"studio-sim-snapshot");
 assert.equal(h.window.RAWStudioSim.recoveryState().ready,false);
 latest.receive({type:"simulator-snapshot",simulated:true,hardwareVerified:false,
  leaseEpoch:2,stateVersion:0,devices:{
   bettermaker_eq:{online:true,source:"simulated-memory",values:{eq1Gain:0}},
   ngbuscomp:{online:true,source:"simulated-memory",values:{L_threshold:-8.5}},
   ngtubecomp:{online:true,source:"simulated-memory",values:{L_thd:0}}
  }});
 assert.equal(h.window.RAWStudioSim.recoveryState().phase,"READY");
 assert.equal(h.window.RAWStudioSim.recoveryState().attempts,2);
 assert.equal(latest.sent.filter(m=>m.type==="parameter-change").length,0);
 assert.match(h.history(),/AUTO RECOVERY VERIFIED/);
});
test("V5.7: pending commands from dead connection are NEVER replayed",()=>{
 const h=harness(),old=h.connect();
 h.move("ngbuscomp","L_threshold",-11);
 const cmd=old.sent.find(m=>m.type==="parameter-change");
 assert.ok(cmd);
 old.close();
 h.move("ngbuscomp","L_threshold",-12);
 h.tick(350);
 const current=h.latest();current.open();
 current.receive({type:"studio-sim-claimed",simulated:true,leaseEpoch:2,sessionId:SESSION});
 h.move("ngbuscomp","L_threshold",-13);
 assert.equal(current.sent.some(m=>m.type==="parameter-change"),false);
 old.receive({type:"simulator-command-result",requestId:cmd.requestId,
  sequence:cmd.sequence,sessionId:SESSION,leaseEpoch:1,
  deviceId:"ngbuscomp",parameter:"L_threshold",
  status:"simulated-applied",simulated:true,hardwareVerified:false,
  stateVersion:1,readback:{value:-11,source:"simulated-memory"}});
 current.receive({type:"simulator-snapshot",simulated:true,hardwareVerified:false,
  leaseEpoch:2,stateVersion:2,devices:{
   bettermaker_eq:{online:true,source:"simulated-memory",values:{eq1Gain:0}},
   ngbuscomp:{online:true,source:"simulated-memory",values:{L_threshold:-8.5}},
   ngtubecomp:{online:true,source:"simulated-memory",values:{L_thd:0}}
  }});
 assert.equal(current.sent.filter(m=>m.type==="parameter-change").length,0);
 assert.equal(h.window.RAWStudioSim.recoveryState().commandsReplayed,0);
 h.move("ngbuscomp","L_threshold",-14);
 assert.equal(current.sent.filter(m=>m.type==="parameter-change").length,1,
  "ONLY deliberate new post-readback changes may be sent");
});
test("V5.7: offline device pauses and requires new snapshot before forwarding",()=>{
 const h=harness(),sock=h.connect();
 sock.receive({type:"simulator-device-state",deviceId:"ngbuscomp",online:false});
 assert.equal(h.window.RAWStudioSim.recoveryState().phase,"PAUSED_DEVICE");
 const n=sock.sent.length;
 h.move("bettermaker_eq","eq1Gain",2);
 assert.equal(sock.sent.length,n);
 sock.receive({type:"simulator-device-state",deviceId:"ngbuscomp",online:true});
 assert.equal(h.window.RAWStudioSim.recoveryState().phase,"PAUSED_DEVICE");
 sock.receive({type:"simulator-snapshot",simulated:true,hardwareVerified:false,
  leaseEpoch:1,stateVersion:1,devices:{
   bettermaker_eq:{online:true,source:"simulated-memory",values:{eq1Gain:0}},
   ngbuscomp:{online:true,source:"simulated-memory",values:{L_threshold:-8.5}},
   ngtubecomp:{online:true,source:"simulated-memory",values:{L_thd:0}}
  }});
 assert.equal(h.window.RAWStudioSim.recoveryState().phase,"READY");
});
test("V5.7: intentional manual disconnect cancels scheduled auto-reconnect",()=>{
 const h=harness(),s=h.connect();
 s.close();
 assert.equal(h.window.RAWStudioSim.recoveryState().phase,"RETRY_WAIT");
 h.root.panel.querySelector("#rawSimConnect").click();
 assert.equal(h.window.RAWStudioSim.recoveryState().phase,"IDLE");
 h.tick(30000);
 assert.equal(h.sockets.length,1);
});
test("V5.7: owner session changed or lease occupied never auto-claims a new session",()=>{
 const h=harness(),old=h.connect();
 old.close();h.setSession("test-1793883600001");
 h.tick(350);
 assert.equal(h.sockets.length,1);
 assert.equal(h.window.RAWStudioSim.recoveryState().phase,"IDLE");
 const another=harness();const socket=another.connect();
 socket.receive({type:"studio-sim-state",status:"occupied",owner:false});
 assert.equal(another.window.RAWStudioSim.recoveryState().phase,"BLOCKED");
 another.tick(30000);assert.equal(another.sockets.length,1);
});
test("V5.7: Developer link drop button uses real unexpected-close logic",()=>{
 const h=harness(),sock=h.connect();
 const button=h.root.panel.querySelector("#rawSimDropLink");
 assert.equal(button.disabled,false);
 button.click();
 assert.equal(sock.readyState,3);
 assert.equal(h.window.RAWStudioSim.recoveryState().phase,"RETRY_WAIT");
 h.tick(350);
 assert.equal(h.sockets.length,2);
});

test("V5.7: heartbeat silence triggers link-loss recovery rather than indefinitely claiming READY",()=>{
 const h=harness(),sock=h.connect();
 h.tick(10000);
 assert.equal(sock.sent.at(-1).type,"studio-sim-ping");
 assert.equal(h.window.RAWStudioSim.recoveryState().phase,"READY");
 h.tick(4000);
 assert.equal(sock.readyState,3);
 assert.equal(h.window.RAWStudioSim.recoveryState().phase,"RETRY_WAIT");
 assert.equal(h.window.RAWStudioSim.recoveryState().ready,false);
 h.tick(350);assert.equal(h.sockets.length,2);
});
test("V5.7: simulated pong keeps healthy link alive; untrusted pong cannot clear watchdog",()=>{
 const h=harness(),sock=h.connect();
 h.tick(10000);
 sock.receive({type:"studio-sim-pong",leaseEpoch:1,simulated:true,hardwareVerified:true});
 h.tick(4000);
 assert.equal(h.window.RAWStudioSim.recoveryState().phase,"RETRY_WAIT");
 const good=harness(),live=good.connect();
 good.tick(10000);
 live.receive({type:"studio-sim-pong",leaseEpoch:1,simulated:true,hardwareVerified:false});
 good.tick(4000);
 assert.equal(good.window.RAWStudioSim.recoveryState().phase,"READY");
 assert.equal(good.sockets.length,1);
});

test("V5.7: retry exhaustion offers one-click explicit manual restart",()=>{
 const h=harness(),first=h.connect();
 first.close();
 for(const delay of [350,700,1400]){
  h.tick(delay);
  const next=h.latest();
  assert.equal(h.window.RAWStudioSim.recoveryState().phase,"CONNECTING");
  next.close();
 }
 assert.equal(h.window.RAWStudioSim.recoveryState().phase,"BLOCKED");
 const before=h.sockets.length;
 assert.equal(h.root.panel.querySelector("#rawSimConnect").textContent,"CONNECT + CLAIM SIM");
 h.root.panel.querySelector("#rawSimConnect").click();
 assert.equal(h.sockets.length,before+1);
 assert.equal(h.window.RAWStudioSim.recoveryState().phase,"CONNECTING");
});
