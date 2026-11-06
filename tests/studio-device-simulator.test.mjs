import test from "node:test";
import assert from "node:assert/strict";
import {StudioDeviceSimulator,SIM_DEVICE_PARAMETERS} from "../studio-device-simulator.mjs";

function fixture(){
 const clock={time:1_800_000_000_000},owner={name:"alice"},other={name:"bob"};
 const simulator=new StudioDeviceSimulator({now:()=>clock.time});
 const lease=simulator.beginLease(owner);
 const enabled=new Set(["bettermaker_eq","ngbuscomp","ngtubecomp"]);
 const command=(overrides={})=>({
  type:"parameter-change",sessionId:"test-1793883600000",requestId:"test-1",
  sequence:1,leaseEpoch:lease.leaseEpoch,
  issuedAt:clock.time,expiresAt:clock.time+1200,
  deviceId:"ngbuscomp",parameter:"L_threshold",value:-12,...overrides
 });
 const send=(changes={},client=owner,allowed=enabled)=>
  simulator.apply(command(changes),{owner:client,enabledDevices:allowed});
 return {clock,owner,other,simulator,lease,enabled,command,send};
}
test("only three explicit modelled devices, no speculative hardware pathways",()=>{
 assert.deepEqual(Object.keys(SIM_DEVICE_PARAMETERS),["bettermaker_eq","ngbuscomp","ngtubecomp"]);
 const f=fixture();const snapshot=f.simulator.snapshot();
 assert.equal(snapshot.simulated,true);assert.equal(snapshot.hardwareVerified,false);
 for(const item of Object.values(snapshot.devices))assert.equal(item.source,"simulated-memory");
});
test("studio owner receives simulated readback and receipt distinct from hardware ACK",()=>{
 const f=fixture(),reply=f.send();
 assert.equal(reply.type,"simulator-command-result");
 assert.equal(reply.status,"simulated-applied");
 assert.equal(reply.hardwareVerified,false);
 assert.equal(reply.applied,true);
 assert.equal(reply.readback.value,-12);
 assert.equal(reply.readback.source,"simulated-memory");
 assert.equal(f.simulator.snapshot().devices.ngbuscomp.values.L_threshold,-12);
 assert.equal(f.simulator.commandCount,1);
});
test("no claim or different connection can write or switch availability",()=>{
 const f=fixture();
 assert.throws(()=>f.send({},f.other),{code:"NOT_OWNER"});
 assert.throws(()=>f.simulator.setOnline(f.other,"ngbuscomp",false),{code:"NOT_OWNER"});
 f.simulator.endLease(f.owner);
 assert.throws(()=>f.send(),{code:"NOT_OWNER"});
});
test("duplicate idempotent request returns receipt without applying a second time",()=>{
 const f=fixture(),first=f.send(),second=f.send();
 assert.equal(second.duplicate,true);
 assert.equal(second.applied,false);
 assert.equal(second.readback.value,first.readback.value);
 assert.equal(f.simulator.commandCount,1);
});
test("request-id reused with different payload is rejected even if sequence changes",()=>{
 const f=fixture();f.send();
 assert.throws(()=>f.send({value:-11.5,sequence:2}),{code:"REQUEST_ID_CONFLICT"});
 assert.equal(f.simulator.commandCount,1);
});
test("stale sequence rejected even with new request ID",()=>{
 const f=fixture();f.send({sequence:10,requestId:"ten"});
 assert.throws(()=>f.send({sequence:9,requestId:"nine"}),{code:"STALE_SEQUENCE"});
 assert.throws(()=>f.send({sequence:10,requestId:"ten-new"}),{code:"STALE_SEQUENCE"});
});
test("stale lease cannot write after owner releases and reclaims",()=>{
 const f=fixture(),old=f.command();
 f.simulator.endLease(f.owner);
 const newer=f.simulator.beginLease(f.owner);
 assert.notEqual(newer.leaseEpoch,old.leaseEpoch);
 assert.throws(()=>f.simulator.apply(old,{owner:f.owner,enabledDevices:f.enabled}),{code:"STALE_LEASE"});
 assert.equal(f.simulator.commandCount,0);
});
test("expired, future-dated, and excessive TTL commands are fail-closed",()=>{
 const f=fixture();
 assert.throws(()=>f.send({expiresAt:f.clock.time}),{code:"EXPIRED"});
 assert.throws(()=>f.send({issuedAt:f.clock.time+2000,expiresAt:f.clock.time+3000}),{code:"EXPIRED"});
 assert.throws(()=>f.send({expiresAt:f.clock.time+10000}),{code:"EXPIRED"});
 const oldCommand=f.command({requestId:"old"});
 f.clock.time+=2000;
 assert.throws(()=>f.simulator.apply(oldCommand,{owner:f.owner,enabledDevices:f.enabled}),{code:"EXPIRED"});
});
test("only enabled rack devices receive simulator commands",()=>{
 const f=fixture();
 assert.throws(()=>f.send({},f.owner,new Set(["ngtubecomp"])),{code:"DEVICE_NOT_ENABLED"});
 assert.equal(f.simulator.commandCount,0);
});
test("device offline prevents updates; reconnect and newer request recovers",()=>{
 const f=fixture(),device="ngbuscomp";
 f.simulator.setOnline(f.owner,device,false);
 assert.throws(()=>f.send(),{code:"DEVICE_OFFLINE"});
 assert.equal(f.simulator.snapshot().devices.ngbuscomp.values.L_threshold,-8.5);
 f.simulator.setOnline(f.owner,device,true);
 assert.equal(f.send({requestId:"new",sequence:2}).status,"simulated-applied");
 assert.equal(f.simulator.snapshot().devices.ngbuscomp.values.L_threshold,-12);
});
test("range, physical steps, unsupported parameters and invalid sessions rejected",()=>{
 const f=fixture();
 assert.throws(()=>f.send({value:-12.2}),{code:"INVALID_VALUE"});
 assert.throws(()=>f.send({value:-21}),{code:"INVALID_VALUE"});
 assert.throws(()=>f.send({value:Infinity}),{code:"INVALID_VALUE"});
 assert.throws(()=>f.send({parameter:"L_thd"}),{code:"UNKNOWN_PARAMETER"});
 assert.throws(()=>f.send({deviceId:"other"}),{code:"UNKNOWN_DEVICE"});
 assert.throws(()=>f.send({sessionId:"real-client"}),{code:"INVALID_SESSION"});
});
test("all three devices have independent verified SIMULATED reference state",()=>{
 const f=fixture();
 const a=f.send({deviceId:"bettermaker_eq",parameter:"eq1Gain",value:6});
 const b=f.send({requestId:"req2",sequence:2,deviceId:"ngtubecomp",parameter:"L_thd",value:70});
 const c=f.send({requestId:"req3",sequence:3,deviceId:"ngbuscomp",parameter:"R_mix",value:42});
 assert.equal(a.readback.value,6);
 assert.equal(b.readback.value,70);
 assert.equal(c.readback.value,42);
 assert.equal(f.simulator.snapshot().devices.ngbuscomp.values.R_mix,42);
 assert.equal(f.simulator.commandCount,3);
});
test("snapshot is copy-safe, not a write-through hardware object",()=>{
 const f=fixture(),snap=f.simulator.snapshot();
 snap.devices.ngbuscomp.values.L_threshold=999;
 assert.equal(f.simulator.snapshot().devices.ngbuscomp.values.L_threshold,-8.5);
 assert.equal(f.simulator.online.ngbuscomp,true);
});

test("simulator revisions strictly increase, replay and no-op device toggles do not",()=>{
 const f=fixture();
 const initial=f.simulator.snapshot();
 assert.equal(initial.stateVersion,0);
 const first=f.send();
 assert.equal(first.stateVersion,1);
 assert.equal(f.simulator.snapshot().stateVersion,1);
 const repeated=f.send();
 assert.equal(repeated.duplicate,true);
 assert.equal(repeated.stateVersion,1);
 assert.equal(f.simulator.snapshot().stateVersion,1);
 f.simulator.setOnline(f.owner,"ngbuscomp",false);
 assert.equal(f.simulator.snapshot().stateVersion,2);
 f.simulator.setOnline(f.owner,"ngbuscomp",false);
 assert.equal(f.simulator.snapshot().stateVersion,2);
 f.simulator.setOnline(f.owner,"ngbuscomp",true);
 assert.equal(f.simulator.snapshot().stateVersion,3);
 f.send({requestId:"newer",sequence:2,value:-10});
 assert.equal(f.simulator.snapshot().stateVersion,4);
});
