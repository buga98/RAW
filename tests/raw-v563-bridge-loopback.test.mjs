import test from "node:test";
import assert from "node:assert/strict";
import {once,EventEmitter} from "node:events";
import WebSocket from "ws";
import {runLab} from "../raw-v563-verified-bridge.mjs";
import {V551_MIDI_PORT} from "../scripts/raw-v551-generate-bettermaker-vst-surface.mjs";
import {V556_READBACK_PORT} from "../scripts/raw-v556-generate-bettermaker-live-readback.mjs";
const row={label:"EQ1 L frequency",display:"300 Hz",position:208,raw14:13364,hostSlot:18,
 midiChannel:3,cc:23,ccLsb:55,status:"EXACT_HOST_ROUNDTRIP_VERIFIED",hardwareVerified:false};
const db={version:"V5.62",entries:[row]},token="V563_STABLE_TEST_SECRET_123456789012345678901";
function sysex(kind,value,second=""){
 const body="RAW556|"+kind+"|18|"+value+"|"+second;
 return {bytes:[240,125,82,65,87,53,53,54,...[...body].map(x=>x.charCodeAt(0)),247]};
}
test("V563 lab bridge authenticates, sends one exact CC14, and confirms V556 stable host readback", {timeout:8000},async()=>{
 const emitter=new EventEmitter(),written=[];
 const fakeMidi={getInputs:()=>[V556_READBACK_PORT],getOutputs:()=>[V551_MIDI_PORT],
  Input:class{constructor(){return Object.assign(emitter,{close(){}})}},
  Output:class{send(type,msg){
   written.push({type,...msg});
   if(written.length===2){
    setImmediate(()=>{
     emitter.emit("sysex",sysex("P","0.8157235980033875"));
     emitter.emit("sysex",sysex("D","300 Hz"));
    });
   }
  }close(){}}
 };
 const lab=await runLab({database:db,token,port:0,makeMidi:()=>fakeMidi});
 try{
  if(!lab.server.listening)await once(lab.server,"listening");
  const port=lab.server.address().port;
  const ws=new WebSocket("ws://127.0.0.1:"+port);
  await once(ws,"open");
  const outcome=await new Promise((resolve,reject)=>{
   const deadline=setTimeout(()=>reject(Error("V563_TEST_TIMEOUT")),5500);
   ws.on("message",raw=>{
    const m=JSON.parse(raw.toString());
    if(m.type==="auth-ok")ws.send(JSON.stringify({type:"set-exact",requestId:"test_exact_001",
     label:row.label,display:row.display}));
    if(m.type==="focus-required")emitter.emit("sysex",sysex("T","Mastering Equalizer",row.label));
    if(m.type==="exact-result"){clearTimeout(deadline);resolve(m)}
    if(m.type==="error"){clearTimeout(deadline);reject(Error(m.code))}
   });
   ws.send(JSON.stringify({type:"auth",token}));
  });
  assert.equal(outcome.status,"VERIFIED");
  assert.equal(outcome.actual.display,"300 Hz");
  assert.equal(written.length,2);
  assert.deepEqual(written.map(x=>x.value),[104,52]);
  assert.equal(outcome.hardwareVerified,false);
  ws.close();
 }finally{await lab.close()}
});
