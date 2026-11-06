// RAW Local Gateway UI Lab: two ephemeral credentials, one outbound SIMULATED agent.
// This script never binds public interfaces, uses real hardware or accesses billing.
// Prints a temporary client TEST token to the local terminal for Control Room input.
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createStudioGatewayLab } from "../studio-gateway-lab.mjs";
import { createOutboundSimAgent } from "../studio-gateway-outbound-agent.mjs";

const clientToken=randomBytes(32).toString("hex");
const agentToken=randomBytes(32).toString("hex");
const gateway=createStudioGatewayLab({clientToken,agentToken,port:7076});
let agent=null;
try{
 await once(gateway.server,"listening");
 agent=createOutboundSimAgent({url:"ws://127.0.0.1:7076",token:agentToken});
 await new Promise((resolve,reject)=>{
  const deadline=setTimeout(()=>reject(Error("Gateway agent authentication timed out")),4000);
  const onMessage=raw=>{
   let m;try{m=JSON.parse(raw.toString());}catch{return;}
   if(m.type==="gateway-auth-ok"&&m.role==="agent"){
    clearTimeout(deadline);agent.socket.off("message",onMessage);resolve();
   }
  };
  agent.socket.on("message",onMessage);
  agent.socket.once("error",reject);
 });
 console.log("");
 console.log("RAW GATEWAY UI LAB V1 — LOCAL TEST ONLY");
 console.log("Gateway: ws://127.0.0.1:7076 | Studio Agent: OUTBOUND (already connected)");
 console.log("NO REAL ACCOUNTS, HARDWARE, USB/GCON, AUDIO, PUBLIC NETWORK OR BILLING.");
 console.log("");
 console.log("CLIENT TEST TOKEN (paste into local Control Room; expires when process stops):");
 console.log(clientToken);
 console.log("");
 console.log("Open RAW with: npm run test:local, then start a LOCAL TEST session.");
 console.log("Connect the STUDIO GATEWAY LAB panel. Ctrl+C closes the lab.");
}catch(error){
 console.error("GATEWAY LAB FAILED:",error.message);
 agent?.close();await gateway.close();process.exitCode=1;
}
const shut=async()=>{agent?.close();await gateway.close();process.exit(0);};
process.once("SIGINT",shut);
process.once("SIGTERM",shut);
