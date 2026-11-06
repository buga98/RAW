import test from "node:test";
import assert from "node:assert/strict";
import {LocalSimAudit} from "../studio-sim-audit.mjs";

test("test audit events are explicitly simulated and never claim hardware confirmation",()=>{
 const log=new LocalSimAudit({now:()=>12345});
 const e=log.record("command-applied",{leaseEpoch:1,requestId:"one",deviceId:"ngbuscomp",parameter:"L_threshold",status:"simulated-applied"});
 assert.equal(e.simulated,true);
 assert.equal(e.hardwareVerified,false);
 assert.equal(e.at,12345);
 assert.equal(e.type,"command-applied");
});
test("events from a prior lease are never returned to the next lease",()=>{
 const log=new LocalSimAudit();
 log.record("command-applied",{leaseEpoch:1,deviceId:"bettermaker_eq"});
 log.record("command-rejected",{leaseEpoch:2,deviceId:"ngtubecomp"});
 const a=log.forLease(1),b=log.forLease(2);
 assert.equal(a.length,1);
 assert.equal(b.length,1);
 assert.equal(a[0].deviceId,"bettermaker_eq");
 assert.equal(b[0].deviceId,"ngtubecomp");
});
test("fixed audit limit bounds memory without resetting ever-increasing entry number",()=>{
 const log=new LocalSimAudit({limit:10});
 for(let n=0;n<15;n++)log.record("heartbeat",{leaseEpoch:1});
 const a=log.forLease(1);
 assert.equal(a.length,10);
 assert.equal(a[0].n,6);
 assert.equal(a.at(-1).n,15);
});
test("audit forbids unknown event kinds and missing lease epochs",()=>{
 const log=new LocalSimAudit();
 assert.throws(()=>log.record("real-hardware-write",{leaseEpoch:1}),/Unsupported test audit event/);
 assert.throws(()=>log.record("heartbeat",{leaseEpoch:0}),/Audit requires valid lease epoch/);
 assert.throws(()=>new LocalSimAudit({limit:2}),/Invalid audit capacity/);
});
test("audit redacts unapproved fields and returns defensive copies",()=>{
 const log=new LocalSimAudit();
 const entry=log.record("command-rejected",{leaseEpoch:1,requestId:"x".repeat(300),status:"RATE_LIMIT",token:"should-not-be-logged",value:17});
 assert.equal(entry.requestId.length,64);
 assert.equal("token" in entry,false);
 assert.equal("value" in entry,false);
 const row=log.forLease(1)[0];
 row.status="forged";
 assert.equal(log.forLease(1)[0].status,"RATE_LIMIT");
});
