import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../studio-state-reconciliation-v3.js",import.meta.url),"utf8");
const ctx={window:{}};
vm.runInNewContext(source,ctx);
const Tracker=ctx.window.RAWStudioStateV3.Tracker;
const sessionId="test-1793883600000";
function rig(){
 const t=new Tracker();t.reset({sessionId,leaseEpoch:42});
 const payload=(requestId,sequence,value,overrides={})=>({
  type:"parameter-change",sessionId,leaseEpoch:42,requestId,sequence,
  deviceId:"ngbuscomp",parameter:"L_threshold",value,...overrides
 });
 const response=(p,value=p.value,version=p.sequence,overrides={})=>({
  type:"simulator-command-result",status:"simulated-applied",simulated:true,hardwareVerified:false,
  requestId:p.requestId,sequence:p.sequence,leaseEpoch:p.leaseEpoch,sessionId:p.sessionId,
  deviceId:p.deviceId,parameter:p.parameter,
  stateVersion:version,readback:{value,source:"simulated-memory",hardwareVerified:false},...overrides
 });
 const entry=()=>t.rows().find(v=>v.deviceId==="ngbuscomp"&&v.parameter==="L_threshold");
 return {t,payload,response,entry};
}
test("client state model parses safely with no sockets, network or hardware dependencies",()=>{
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.doesNotMatch(source,/new WebSocket|fetch\(|easymidi|firebase|navigator\.usb|navigator\.hid/);
});
test("local desired value remains distinct until simulated ACK",()=>{
 const r=rig(),p=r.payload("one",1,-12);
 r.t.desire("ngbuscomp","L_threshold",-12);
 assert.equal(r.entry().state,"LOCAL ONLY");
 assert.equal(r.entry().confirmed,null);
 assert.equal(r.t.sent(p),true);
 assert.equal(r.entry().state,"PENDING");
 assert.equal(r.t.acknowledge(r.response(p)).accepted,true);
 assert.equal(r.entry().desired,-12);
 assert.equal(r.entry().confirmed,-12);
 assert.equal(r.entry().state,"SIM CONFIRMED");
});
test("older acknowledgment does not incorrectly confirm a newer local value",()=>{
 const r=rig(),old=r.payload("old",1,-12),newer=r.payload("new",2,-8);
 r.t.desire("ngbuscomp","L_threshold",-12);r.t.sent(old);
 r.t.desire("ngbuscomp","L_threshold",-8);r.t.sent(newer);
 assert.equal(r.t.acknowledge(r.response(old,-12,1)).accepted,true);
 assert.equal(r.entry().desired,-8);
 assert.equal(r.entry().confirmed,-12);
 assert.equal(r.entry().state,"PENDING");
 assert.equal(r.t.acknowledge(r.response(newer,-8,2)).accepted,true);
 assert.equal(r.entry().state,"SIM CONFIRMED");
});
test("out-of-order lower version cannot overwrite newer readback",()=>{
 const r=rig(),old=r.payload("old",1,-12),newer=r.payload("new",2,-8);
 r.t.desire("ngbuscomp","L_threshold",-8);
 r.t.sent(old);r.t.sent(newer);
 assert.equal(r.t.acknowledge(r.response(newer,-8,5)).accepted,true);
 const stale=r.t.acknowledge(r.response(old,-12,4));
 assert.equal(stale.accepted,false);
 assert.equal(stale.reason,"STALE_REPLY");
 assert.equal(r.entry().confirmed,-8);
 assert.equal(r.entry().state,"SIM CONFIRMED");
});
test("mismatched lease, session, parameter or untrusted physical claim is ignored",()=>{
 const r=rig(),p=r.payload("one",1,4);
 r.t.desire("ngbuscomp","L_threshold",4);r.t.sent(p);
 assert.equal(r.t.acknowledge(r.response(p,4,1,{leaseEpoch:999})).accepted,false);
 assert.equal(r.t.acknowledge(r.response(p,4,1,{sessionId:"test-123456789012"})).accepted,false);
 assert.equal(r.t.acknowledge(r.response(p,4,1,{parameter:"R_threshold"})).accepted,false);
 assert.equal(r.t.acknowledge(r.response(p,4,1,{hardwareVerified:true})).accepted,false);
 assert.equal(r.entry().confirmed,null);
});
test("reject and timeouts preserve desired values but never claim readback",()=>{
 const r=rig(),p=r.payload("timeout",1,-10);
 r.t.desire("ngbuscomp","L_threshold",-10);r.t.sent(p);
 assert.equal(r.t.reject(p.requestId,"TIMEOUT"),true);
 assert.equal(r.entry().state,"TIMEOUT");
 assert.equal(r.entry().desired,-10);
 assert.equal(r.entry().confirmed,null);
 assert.equal(r.t.acknowledge(r.response(p)).accepted,false);
});
test("simulated snapshot establishes baseline without pretending user modified device",()=>{
 const r=rig(),s={
  type:"simulator-snapshot",simulated:true,hardwareVerified:false,
  leaseEpoch:42,stateVersion:3,devices:{
   ngbuscomp:{source:"simulated-memory",values:{L_threshold:-8.5,R_threshold:-9}},
   ngtubecomp:{source:"simulated-memory",values:{L_thd:0}}
  }
 };
 assert.equal(r.t.snapshot(s),true);
 assert.equal(r.entry().state,"SIM BASELINE");
 assert.equal(r.entry().confirmed,-8.5);
 assert.equal(r.entry().desired,null);
 r.t.desire("ngbuscomp","L_threshold",-10);
 assert.equal(r.entry().state,"LOCAL ONLY");
 assert.equal(r.entry().confirmed,-8.5);
});
test("stale snapshots cannot overwrite newer readback, even after resync",()=>{
 const r=rig(),p=r.payload("one",1,-12);
 r.t.desire("ngbuscomp","L_threshold",-12);r.t.sent(p);
 assert.equal(r.t.acknowledge(r.response(p,-12,8)).accepted,true);
 const stale={type:"simulator-snapshot",simulated:true,hardwareVerified:false,
  leaseEpoch:42,stateVersion:7,devices:{ngbuscomp:{source:"simulated-memory",values:{L_threshold:3}}}};
 assert.equal(r.t.snapshot(stale),false);
 assert.equal(r.entry().confirmed,-12);
});
test("different epoch snapshot is not accepted",()=>{
 const r=rig();
 const wrong={type:"simulator-snapshot",simulated:true,hardwareVerified:false,
  leaseEpoch:41,stateVersion:100,devices:{ngbuscomp:{source:"simulated-memory",values:{L_threshold:18}}}};
 assert.equal(r.t.snapshot(wrong),false);
 assert.equal(r.t.rows().length,0);
});
test("device offline and connection lost are visible without simulated confirmation",()=>{
 const r=rig();
 r.t.desire("ngbuscomp","L_threshold",-12);
 r.t.markOffline("ngbuscomp");
 assert.equal(r.entry().state,"DEVICE OFFLINE");
 r.t.disconnect("CONNECTION LOST");
 assert.equal(r.entry().state,"LOCAL ONLY");
 assert.match(r.entry().note,/CONNECTION LOST/);
});
test("reset for another lease clears all prior pending and readback state",()=>{
 const r=rig(),p=r.payload("old",1,-12);
 r.t.desire("ngbuscomp","L_threshold",-12);r.t.sent(p);
 r.t.reset({sessionId,leaseEpoch:43});
 assert.equal(r.t.rows().length,0);
 assert.equal(r.t.acknowledge(r.response(p)).accepted,false);
});
test("public snapshots of rows cannot mutate internal tracked values",()=>{
 const r=rig();
 r.t.desire("ngbuscomp","L_threshold",-12);
 const rows=r.t.rows();rows[0].desired=999;
 assert.equal(r.entry().desired,-12);
});

test("offline snapshot cannot convert a disconnected device back to SIM CONFIRMED",()=>{
 const r=rig(),p=r.payload("one",1,-12);
 r.t.desire("ngbuscomp","L_threshold",-12);
 r.t.sent(p);
 r.t.acknowledge(r.response(p,-12,1));
 assert.equal(r.entry().state,"SIM CONFIRMED");
 const snap={type:"simulator-snapshot",simulated:true,hardwareVerified:false,
  leaseEpoch:42,stateVersion:2,devices:{
   ngbuscomp:{online:false,source:"simulated-memory",values:{L_threshold:-12}}
  }};
 assert.equal(r.t.snapshot(snap),true);
 assert.equal(r.entry().confirmed,-12);
 assert.equal(r.entry().state,"DEVICE OFFLINE");
 assert.match(r.entry().note,/disconnected device/);
});
