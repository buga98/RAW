// Two-client end-to-end studio test, no Cubase/MIDI devices or real credits needed.
import {spawn} from "node:child_process";
import WebSocket from "ws";
const child=spawn(process.execPath,["studio-lab-bridge.mjs"],{
  cwd:new URL("../",import.meta.url),stdio:["ignore","pipe","pipe"],windowsHide:true
});
let output="";
child.stdout.on("data",d=>output+=d.toString());
child.stderr.on("data",d=>output+=d.toString());
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function open() {
  for(let i=0;i<40;i++) {
    if(child.exitCode!==null) throw Error("Studio lab exited: "+output);
    const ws=new WebSocket("ws://127.0.0.1:7073",{handshakeTimeout:300});
    try {
      await new Promise((ok,bad)=>{ws.once("open",ok);ws.once("error",bad);});
      return ws;
    } catch {
      ws.terminate();
      await delay(100);
    }
  }
  throw Error("Cannot open studio lab; close other bridge on 7073. "+output);
}
function until(ws,accept) {
  return new Promise((ok,bad)=>{
    const timer=setTimeout(()=>{ws.off("message",onMessage);bad(Error("Response timeout: "+output));},3500);
    function onMessage(buf) {
      let m;try{m=JSON.parse(buf.toString())}catch{return}
      if(!accept(m))return;
      clearTimeout(timer);ws.off("message",onMessage);ok(m);
    }
    ws.on("message",onMessage);
  });
}
let a,b;
try{
  a=await open();
  b=await open();
  const own=until(a,m=>m.type==="studio-state"&&m.status==="yours");
  a.send(JSON.stringify({type:"studio-claim"}));
  await own;
  const denied=until(b,m=>m.type==="studio-denied");
  b.send(JSON.stringify({type:"studio-claim"}));
  await denied;
  const deniedMidi=until(b,m=>m.type==="parameter-error");
  b.send(JSON.stringify({type:"parameter-change",requestId:"2",sessionId:"test-1793883600000",
    deviceId:"bettermaker_eq",parameter:"eq1Gain",value:6}));
  const result=await deniedMidi;
  if(!/occupied|not claimed/.test(result.error))throw Error("Non-owner command not rejected");
  const ack=until(a,m=>m.type==="parameter-ack");
  a.send(JSON.stringify({type:"parameter-change",requestId:"1",sessionId:"test-1793883600000",
    deviceId:"bettermaker_eq",parameter:"eq1Gain",value:6}));
  const valid=await ack;
  if(valid.status!=="simulated"||valid.midi.value!==89)throw Error("Unexpected MIDI routing");
  const free=until(b,m=>m.type==="studio-state"&&m.status==="free");
  a.send(JSON.stringify({type:"studio-release"}));
  await free;
  const secondOwn=until(b,m=>m.type==="studio-state"&&m.status==="yours");
  b.send(JSON.stringify({type:"studio-claim"}));
  await secondOwn;
  console.log("PASS: first client owns entire studio, second client denied control.");
  console.log("PASS: owner command -> dry-run CC21 = 89; released studio can be claimed.");
  console.log("NOTE: simulated wallet; no Cubase, physical hardware, billing or public Internet tested.");
}catch(err){
  console.error("FAIL: "+err.message);
  process.exitCode=1;
}finally{
  a?.terminate();b?.terminate();child.kill();
}
