// RAW V5.63 — developer-only exact original Bettermaker control pilot.
// Attaches ONLY after existing RAW developer authorization in LOCAL TEST mode.
// Does not touch production rack controls or cloud studio session/billing state.
(function(global){
 "use strict";
 let root=null,ws=null,allowed=()=>false,authorized=false,busy=false;
 const verifiedTargets=Object.freeze([
  ["EQ1 L frequency","300 Hz"],["EQ2 L bandwidth","SHARP"]
 ]);
 const state={last:null};
 const own=()=>Boolean(root&&root.isConnected&&allowed());
 function viewStatus(message){const el=root?.querySelector("[data-v563-status]");if(el)el.textContent=message}
 function refresh(){
  if(!root)return;
  const open=ws?.readyState===WebSocket.OPEN;
  root.querySelector("[data-v563-connect]").disabled=!own()||!!open;
  root.querySelector("[data-v563-stop]").disabled=!open;
  root.querySelector("[data-v563-apply]").disabled=!own()||!authorized||busy;
 }
 function stop(){
  const old=ws;ws=null;authorized=false;busy=false;
  if(old&&old.readyState<=WebSocket.OPEN){try{old.close()}catch{}}
  refresh();
 }
 function attach(host,checkAccess){
  if(typeof checkAccess!=="function"||!checkAccess()||!host)return;
  allowed=checkAccess;
  if(root?.isConnected){refresh();return}
  root=document.createElement("section");
  root.className="raw-v563-verified-panel";
  root.id="rawV563VerifiedBridgeLab";
  root.setAttribute("aria-label","V5.63 originalni Bettermaker – verificirani MIDI test");
  root.style.cssText="border:1px solid #49617c;border-radius:14px;padding:16px;margin:14px 0;background:rgba(10,20,34,.8)";
  root.innerHTML='<h3 style="margin:0 0 8px">V5.63 · Mac → Cubase Verified Bridge <small style="color:#93a9c2">LOCAL LAB</small></h3>'+
   '<p style="font-size:13px;color:#aec0d6">Samo spremljeni Cubase testni projekt. Ne koristi korisničke tokene niti naplatu. RAW potvrđuje originalni VST readback; fizički hardver nije potvrđen.</p>'+
   '<label style="display:block;margin:10px 0 5px">Privatni lokalni testni token</label>'+
   '<input data-v563-token type="password" autocomplete="off" placeholder="Windows RAW_V563_LOCAL_TOKEN" style="width:100%;max-width:500px;padding:10px;box-sizing:border-box"/>'+
   '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">'+
    '<button type="button" data-v563-connect>Spoji se preko localhost SSH tunela</button>'+
    '<button type="button" data-v563-stop disabled>Odspoji</button>'+
   '</div>'+
   '<label style="display:block;margin:12px 0 5px">Samo verificirane vrijednosti (V5.62)</label>'+
   '<select data-v563-target style="padding:10px;max-width:100%">'+
    '<option value="0">EQ1 L Frequency → 300 Hz (MIDI14 13364)</option>'+
    '<option value="1">EQ2 L Bandwidth → SHARP (MIDI14 1928)</option></select>'+
   '<div><button type="button" data-v563-apply disabled>POSTAVI I PROVJERI ORIGINALNI VST</button></div>'+
   '<pre data-v563-status role="status" style="white-space:pre-wrap;max-height:220px;overflow:auto;padding:12px;background:#0d1728;color:#c9e3ee;border-radius:8px">Nije spojeno.</pre>';
  host.append(root);
  root.querySelector("[data-v563-connect]").onclick=()=>{
   if(!own()||ws?.readyState===WebSocket.OPEN)return;
   const field=root.querySelector("[data-v563-token]");
   const token=field.value;
   if(token.length<32){viewStatus("Token mora imati barem 32 znaka.");return}
   const socket=new WebSocket("ws://127.0.0.1:7088");ws=socket;authorized=false;busy=false;
   socket.onopen=()=>{
    if(!own()){socket.close();return}
    socket.send(JSON.stringify({type:"auth",token}));
    field.value="";viewStatus("Autentikacija lokalnog bridgea...");refresh();
   };
   socket.onmessage=ev=>{
    if(socket!==ws||!own()){socket.close();return}
    let m;try{m=JSON.parse(ev.data)}catch{return}
    if(m.type==="auth-ok"){authorized=true;viewStatus("Spojeno. Odaberi vrijednost.");}
    else if(m.type==="focus-required")viewStatus("FOKUSIRAJ ORIGINALNI BETTERMAKER VST NA WINDOWS RAČUNALU\n"+m.label+"\nPonovno odaberi V556 MIDI Remote ako nema callbacka.");
    else if(m.type==="exact-sent")viewStatus("Poslana MIDI14 vrijednost "+m.raw14+". Čekam Cubase readback...");
    else if(m.type==="exact-result"){
     busy=false;
     if(m.status==="VERIFIED")
      viewStatus("VERIFIED ✓ "+m.expected?.label+" = "+m.expected?.display+
       "\nMIDI14: "+m.expected?.raw14+"\nCubase: "+m.actual?.display+"\nStabilnost: "+m.stability?.elapsedMs+" ms"+
       "\nPotvrđen originalni VST, NE analogni hardver.");
     else viewStatus("NEMA POTVRDE: "+m.status+"\nTraženo: "+m.expected?.display+
       "\nCubase: "+(m.actual?.display??"bez očitanja"));
    }else if(m.type==="error"){busy=false;viewStatus("BLOKIRANO: "+m.code)}
    refresh();
   };
   socket.onclose=()=>{if(socket!==ws)return;authorized=false;busy=false;viewStatus("Veza je zatvorena; nema automatskog ponavljanja.");refresh()};
   socket.onerror=()=>viewStatus("Veza nije dostupna. Provjeri SSH tunel i Windows bridge.");
   refresh();
  };
  root.querySelector("[data-v563-stop]").onclick=()=>{stop();viewStatus("Veza namjerno prekinuta.")};
  root.querySelector("[data-v563-apply]").onclick=()=>{
   if(!own()||!authorized||busy||ws?.readyState!==WebSocket.OPEN)return;
   const value=Number(root.querySelector("[data-v563-target]").value);
   if(!Number.isInteger(value)||!verifiedTargets[value])return;
   const [label,display]=verifiedTargets[value];
   const random=global.crypto?.getRandomValues?
    Array.from(global.crypto.getRandomValues(new Uint8Array(8)),x=>x.toString(16).padStart(2,"0")).join(""):
    String(Date.now());
   const requestId="raw563_"+random;
   busy=true;viewStatus("Zahtjev poslan. Čekam novi originalni VST title callback.");refresh();
   ws.send(JSON.stringify({type:"set-exact",requestId,label,display}));
  };
  refresh();
 }
 function detach(){stop();root?.remove();root=null;allowed=()=>false}
 global.RAWVerifiedBridgeV563={attach,detach,targets:verifiedTargets};
})(window);
