/* RAW V5.48 PRIVATE Internet Pilot. Authenticated WSS relay; NOT production Firebase auth.
 * Public TLS must terminate at a trusted reverse proxy. Bind loopback by default.
 * No secrets in source, no unauthenticated WS, no public Cubase/MIDI ports.
 */
import {createHash,timingSafeEqual,randomUUID} from "node:crypto";
import {WebSocketServer} from "ws";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
const hex=s=>createHash("sha256").update(s).digest();
const checkToken=(s,label)=>{
 if(typeof s!=="string"||s.length<32||s.length>512||/\s/.test(s))
  throw Error(label+" must be a distinct random secret (32+ chars)");
 return hex(s);
};
const ALLOWED=new Set(["studio-claim","studio-release","studio-devices","ping","parameter-change"]);
export function createRawV548Relay({agentToken,clientToken,host="127.0.0.1",port=7788}={}){
 const expected={agent:checkToken(agentToken,"agentToken"),client:checkToken(clientToken,"clientToken")};
 if(timingSafeEqual(expected.agent,expected.client))throw Error("Client and agent secrets must differ");
 const server=new WebSocketServer({host,port,maxPayload:4096,perMessageDeflate:false});
 let agent=null,client=null,active=null;
 const sockets=new Set();
 const send=(ws,message)=>{
  if(ws?.readyState===1)ws.send(typeof message==="string"?message:JSON.stringify(message));
 };
 const deny=(ws,code)=>{
  send(ws,{type:"raw-v548-error",code,pilotOnly:true});
  ws.close(1008,"Access denied");
 };
 const detach=()=>{
  if(!active)return;
  send(agent,{type:"raw-v548-detach",id:active.id});
  active=null;
 };
 const attach=()=>{
  if(!agent||!client||active)return;
  active={id:randomUUID(),ready:false,windowStart:Date.now(),count:0};
  send(agent,{type:"raw-v548-attach",id:active.id});
  send(client,{type:"raw-v548-link",status:"connecting",pilotOnly:true});
 };
 server.on("connection",ws=>{
  sockets.add(ws);
  let role=null;
  const deadline=setTimeout(()=>{if(!role)deny(ws,"AUTH_TIMEOUT");},5000);
  deadline.unref?.();
  ws.on("message",data=>{
   let msg;
   try{msg=JSON.parse(String(data));}catch{deny(ws,"BAD_JSON");return;}
   if(!msg||Array.isArray(msg)||typeof msg!=="object"){deny(ws,"BAD_MESSAGE");return;}
   if(!role){
    if(msg.type!=="raw-v548-auth"||!["agent","client"].includes(msg.role)||
       typeof msg.token!=="string"||msg.token.length>512){
      deny(ws,"AUTH_REQUIRED");return;
    }
    const received=hex(msg.token);
    if(!timingSafeEqual(received,expected[msg.role])){deny(ws,"AUTH_FAILED");return;}
    if(msg.role==="agent"){
      if(agent){deny(ws,"AGENT_ALREADY_CONNECTED");return;}
      agent=ws;
    }else{
      if(client){deny(ws,"STUDIO_OCCUPIED");return;}
      client=ws;
    }
    role=msg.role;
    clearTimeout(deadline);
    send(ws,{type:"raw-v548-auth-ok",role,pilotOnly:true});
    if(role==="client"&&!agent)
     send(client,{type:"raw-v548-link",status:"studio-offline",pilotOnly:true});
    attach();return;
   }
   if(role==="client"){
    if(!ALLOWED.has(msg.type)){send(ws,{type:"parameter-error",error:"UNSUPPORTED_COMMAND"});return;}
    if(!active?.ready){send(ws,{type:"parameter-error",error:"STUDIO_NOT_READY"});return;}
    const now=Date.now();
    if(now-active.windowStart>=1000){active.windowStart=now;active.count=0;}
    if(++active.count>35){send(ws,{type:"parameter-error",error:"RATE_LIMIT"});return;}
    send(agent,{type:"raw-v548-bridge-command",id:active.id,payload:msg});
    return;
   }
   if(!active||msg.id!==active.id)return;
   if(msg.type==="raw-v548-agent-ready"){
    active.ready=true;
    send(client,{type:"raw-v548-link",status:"connected",pilotOnly:true});
   }else if(msg.type==="raw-v548-bridge-message"&&
     typeof msg.payload==="string"&&msg.payload.length<=4096){
    // Studio Bridge is the local authority for exclusive claim and MIDI allowlist.
    send(client,msg.payload);
   }else if(msg.type==="raw-v548-agent-bridge-closed"){
    send(client,{type:"raw-v548-error",code:"STUDIO_BRIDGE_DISCONNECTED",pilotOnly:true});
    client?.close(1012,"Studio Bridge disconnected");
    detach();
   }
  });
  ws.on("close",()=>{
   clearTimeout(deadline);sockets.delete(ws);
   if(ws===client){client=null;detach();}
   if(ws===agent){
    agent=null;detach();
    send(client,{type:"raw-v548-error",code:"STUDIO_OFFLINE",pilotOnly:true});
    client?.close(1012,"Studio offline");
   }
  });
  ws.on("error",()=>{});
 });
 const close=()=>new Promise(done=>{
  for(const ws of sockets)ws.terminate();
  server.close(done);
 });
 return {server,close,stats:()=>({agentOnline:!!agent,clientOnline:!!client,connected:!!active?.ready,pilotOnly:true})};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const relay=createRawV548Relay({
  agentToken:process.env.RAW_V548_AGENT_TOKEN,
  clientToken:process.env.RAW_V548_CLIENT_TOKEN,
  host:process.env.RAW_V548_BIND||"127.0.0.1",
  port:Number(process.env.RAW_V548_PORT||7788)
 });
 relay.server.on("listening",()=>{
  console.log("RAW V5.48 PRIVATE PILOT Gateway started; TLS/WSS reverse proxy REQUIRED.");
  console.log("No Firebase, production billing or analog hardware verification.");
 });
 process.on("SIGINT",()=>relay.close().then(()=>process.exit(0)));
 process.on("SIGTERM",()=>relay.close().then(()=>process.exit(0)));
}
