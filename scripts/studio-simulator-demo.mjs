// RAW Studio Device Simulator V1 — offline-only demonstration.
// npm run studio:sim:demo
// NO WebSocket, MIDI, HID, USB, Cubase, billing, user accounts or real devices.
import {StudioDeviceSimulator} from "../studio-device-simulator.mjs";

const now=Date.now();
const sim=new StudioDeviceSimulator({now:()=>now});
const client={kind:"local-test-owner"};
const stranger={kind:"unbooked-client"};
const lease=sim.beginLease(client);
const enabledDevices=new Set(["bettermaker_eq","ngbuscomp","ngtubecomp"]);
let sequence=0;

function command(deviceId,parameter,value) {
 return {
  type:"parameter-change",requestId:"demo-"+(++sequence),
  sessionId:"test-1793883600000",leaseEpoch:lease.leaseEpoch,
  sequence,issuedAt:now,expiresAt:now+2000,
  deviceId,parameter,value
 };
}
function submit(label,message,owner=client) {
 try{
  const reply=sim.apply(message,{owner,enabledDevices});
  console.log("PASS",label,JSON.stringify({
   status:reply.status,device:reply.deviceId,parameter:reply.parameter,
   readback:reply.readback.value,simulated:reply.simulated,duplicate:reply.duplicate
  }));
  return reply;
 }catch(error){
  console.log("REJECTED",label,error.code,error.message);
  return null;
 }
}
console.log("RAW · STUDIO DEVICE SIMULATOR V1 · OFFLINE ONLY · NO HARDWARE");
console.log("Lease epoch:",lease.leaseEpoch);
const eq=command("bettermaker_eq","eq1Gain",6);
submit("MEQ EQ1 Gain +6 dB",eq);
submit("ngBusComp L threshold -10 dB",command("ngbuscomp","L_threshold",-10));
submit("ngTubeComp R THD 70%",command("ngtubecomp","R_thd",70));
submit("Idempotent replay (no second write)",eq);
submit("Invalid out-of-range parameter",command("ngbuscomp","L_threshold",-99));
submit("Unauthorized client",command("ngtubecomp","L_thd",30),stranger);
sim.setOnline(client,"ngbuscomp",false);
submit("Disconnected device",command("ngbuscomp","L_mix",50));
sim.setOnline(client,"ngbuscomp",true);
submit("Reconnect and write",command("ngbuscomp","L_mix",50));
console.log("SIMULATED MEMORY:",JSON.stringify(sim.snapshot().devices,null,2));
sim.endLease(client);
console.log("Released lease; simulator owner:",sim.snapshot().leased);
console.log("NO PHYSICAL DEVICE WAS CONTROLLED. NO CREDIT OR PAYMENT WAS CHANGED.");
