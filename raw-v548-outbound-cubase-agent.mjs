/* RAW v5.48 PRIVATE Windows Studio Agent. Connects OUTBOUND to authenticated WSS
 * and proxies a single authorized client to the existing loopback Studio MIDI Bridge.
 * Never listens on network interfaces and never handles audio.
 */
import WebSocket from "ws";
const gatewayUrl=process.env.RAW_V548_WSS;
const token=process.env.RAW_V548_AGENT_TOKEN;
if(!gatewayUrl||!/^wss:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[^?#]*)?$/i.test(gatewayUrl)||
  !token||token.length<32||/\s/.test(token)){
 console.error("Set RAW_V548_WSS (wss:// URL) and RAW_V548_AGENT_TOKEN (32+ random chars).");
 process.exit(2);
}
const STUDIO_URL="ws://127.0.0.1:7073";
let remote=null,local=null,id=null,stopped=false;
const send=(ws,msg)=>{if(ws?.readyState===1)ws.send(JSON.stringify(msg));};
function closeLocal(){
 if(local){const old=local;local=null;old.removeAllListeners("message");old.close();}
 id=null;
}
function connect(){
 if(stopped)return;
 remote=new WebSocket(gatewayUrl,{handshakeTimeout:8000,perMessageDeflate:false,maxPayload:4096});
 remote.on("open",()=>send(remote,{type:"raw-v548-auth",role:"agent",token}));
 remote.on("message",raw=>{
  let msg;try{msg=JSON.parse(String(raw));}catch{return;}
  if(msg.type==="raw-v548-auth-ok"&&msg.role==="agent"){
   console.log("RAW Studio Agent authenticated via WSS (private pilot).");return;
  }
  if(msg.type==="raw-v548-attach"&&typeof msg.id==="string"&&msg.id.length<100){
   closeLocal();id=msg.id;
   const thisId=id;
   local=new WebSocket(STUDIO_URL,{handshakeTimeout:5000,perMessageDeflate:false,maxPayload:4096});
   const studio=local;
   studio.on("open",()=>{
    if(id===thisId)send(remote,{type:"raw-v548-agent-ready",id:thisId});
   });
   studio.on("message",bytes=>{
    if(id===thisId&&local===studio){
     const payload=String(bytes);
     if(payload.length<=4096)
      send(remote,{type:"raw-v548-bridge-message",id:thisId,payload});
    }
   });
   studio.on("close",()=>{
    if(id===thisId){
     send(remote,{type:"raw-v548-agent-bridge-closed",id:thisId});
     closeLocal();
    }
   });
   studio.on("error",error=>console.error("Local Cubase bridge:",error.code||error.message));
  }else if(msg.type==="raw-v548-detach"&&msg.id===id){
   closeLocal();
  }else if(msg.type==="raw-v548-bridge-command"&&msg.id===id&&local?.readyState===1){
   if(msg.payload&&typeof msg.payload==="object"&&!Array.isArray(msg.payload))
    local.send(JSON.stringify(msg.payload));
  }
 });
 remote.on("error",error=>console.error("RAW WSS Gateway connection:",error.code||error.message));
 remote.on("close",()=>{
  closeLocal();
  if(!stopped){console.log("Gateway offline, reconnecting in 3 seconds.");setTimeout(connect,3000);}
 });
}
function shutdown(){
 stopped=true;closeLocal();remote?.close();setTimeout(()=>process.exit(0),200).unref();
}
process.on("SIGINT",shutdown);process.on("SIGTERM",shutdown);
connect();
