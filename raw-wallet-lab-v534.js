/* RAW V5.34 — isolated LOCAL TEST wallet and device processing preview.
 * 100% IN MEMORY. No Firebase, Stripe, hardware, tokens or charges. Only
 * Developer LAB may show this demo after verified LOCAL TEST owner access.
 */
(function(global){
 "use strict";
 const UNIT=1000000, DENOM=3600000, MAX_MS=4*3600000;
 const DEVICES=Object.freeze([
  Object.freeze({id:"bettermaker",title:"Bettermaker MEQ",centsPerHour:1800}),
  Object.freeze({id:"ngBusComp",title:"ngBusComp",centsPerHour:1500}),
  Object.freeze({id:"ngTubeComp",title:"ngTubeComp",centsPerHour:2300})
 ]);
 const valid=n=>Number.isSafeInteger(n)&&n>=0;
 function createModel({now=()=>0}={}){
  if(typeof now!=="function")throw Error("INVALID_DEMO_CLOCK");
  let funded=false,startedAt=null,rate=0,runDevices=[],costNumerator=0,
      baseMs=0,finalizedCost=0,status="empty",history=[];
  // performance.now() in Electron returns fractional milliseconds. The model
  // bills in whole milliseconds; accept a finite monotonic clock and round
  // DOWN once so START / PAUSE / heartbeat use the same integer precision.
  const clock=()=>{
   const t=now();
   if(typeof t!=="number"||!Number.isFinite(t)||t<0||
      t>Number.MAX_SAFE_INTEGER)throw Error("INVALID_DEMO_CLOCK");
   return Math.floor(t);
  };
  function sample(){
   const elapsed=startedAt===null?0:Math.min(MAX_MS,Math.max(0,clock()-startedAt));
   const numerator=costNumerator+rate*10000*elapsed;
   const cost=Math.min(20*UNIT,Math.floor(numerator/DENOM));
   return Object.freeze({funded,status,running:startedAt!==null,
    balanceMicros:funded?20*UNIT-cost:0,spentMicros:cost,
    elapsedMs:baseMs+elapsed,priceCentsPerHour:startedAt===null?0:rate,
    deviceIds:[...runDevices],history:[...history]});
  }
  function finalize(){
   if(startedAt===null)return sample();
   const stamp=clock();
   const elapsed=Math.min(MAX_MS,Math.max(0,stamp-startedAt));
   const newCost=Math.min(20*UNIT,Math.floor((costNumerator+rate*10000*elapsed)/DENOM));
   const delta=newCost-finalizedCost;
   costNumerator+=rate*10000*elapsed;
   baseMs+=elapsed;finalizedCost=newCost;startedAt=null;runDevices=[];rate=0;
   status=newCost===20*UNIT?"exhausted":"paused";
   if(delta>0)history.push(Object.freeze({
    kind:"SPEND",amountMicros:-delta,atMs:stamp,balanceAfterMicros:20*UNIT-newCost
   }));
   return sample();
  }
  return Object.freeze({
   fund(){
    if(funded)throw Error("DEMO_ALREADY_FUNDED");
    funded=true;status="ready";
    history.push(Object.freeze({kind:"DEMO_TOPUP",amountMicros:20*UNIT,
      atMs:clock(),balanceAfterMicros:20*UNIT}));
    return sample();
   },
   start(ids){
    if(!funded||startedAt!==null)throw Error("DEMO_NOT_READY");
    if(!Array.isArray(ids)||ids.length<1||ids.length>3||
       new Set(ids).size!==ids.length||
       ids.some(id=>typeof id!=="string"||!DEVICES.some(d=>d.id===id)))
      throw Error("DEMO_INVALID_DEVICES");
    if(sample().balanceMicros===0)throw Error("DEMO_NO_BALANCE");
    rate=DEVICES.filter(d=>ids.includes(d.id)).reduce((sum,d)=>sum+d.centsPerHour,0);
    // Must afford the upcoming 1-second demo interval.
    if(sample().balanceMicros<Math.ceil(rate*10000/3600))
      throw Error("DEMO_INSUFFICIENT_RAW");
    startedAt=clock();runDevices=[...ids];status="running";
    return sample();
   },
   pause(){return finalize();},
   tick(){
    const current=sample();
    if(startedAt!==null&&(current.balanceMicros===0||current.elapsedMs>=MAX_MS))
      return finalize();
    return current;
   },
   reset(){
    funded=false;startedAt=null;rate=0;runDevices=[];costNumerator=0;
    baseMs=0;finalizedCost=0;history=[];status="empty";
    return sample();
   },
   snapshot:sample
  });
 }
 const fmt=micros=>(micros/UNIT).toFixed(6).replace(".",",");
 const html=`<div class="raw-walletlab-v534"><div class="raw-walletlab-head"><div><span class="raw-walletlab-kicker">OWNER LAB · LOCAL TEST</span><h3>RAW tokeni · simulacija obračuna</h3><p>Bez Firebase zapisa, Stripe plaćanja i fizičkog pokretanja uređaja.</p></div><span class="raw-walletlab-state" data-role="status">NEMA TESTNIH TOKENA</span></div><div class="raw-walletlab-stats"><div><small>TESTNI SALDO</small><strong data-role="balance">0,000000 RAW</strong></div><div><small>POTROŠENO</small><strong data-role="spent">0,000000 RAW</strong></div><div><small>AKTIVNA OBRADA</small><strong data-role="time">00:00</strong></div><div><small>SATNICA</small><strong data-role="rate">0 RAW/h</strong></div></div><div class="raw-walletlab-devices"><label><input type="checkbox" value="bettermaker" checked> Bettermaker MEQ · 18 RAW/h</label><label><input type="checkbox" value="ngBusComp" checked> ngBusComp · 15 RAW/h</label><label><input type="checkbox" value="ngTubeComp" checked> ngTubeComp · 23 RAW/h</label></div><div class="raw-walletlab-actions"><button type="button" data-action="fund">Dodaj 20 testnih RAW</button><button type="button" data-action="start">Pokreni TEST obradu</button><button type="button" data-action="pause">Pauziraj obračun</button><button type="button" data-action="reset">Resetiraj simulaciju</button></div><p class="raw-walletlab-note" data-role="notice" role="status" aria-live="polite">Priprema i rezervacija se ne naplaćuju. Brojač kreće tek na TEST obradu.</p><div class="raw-walletlab-history"><strong>Povijest testne potrošnje</strong><ul data-role="history"><li>Još nema testnih transakcija.</li></ul></div></div>`;
 function mount(documentRef,{testMode=false,now=()=>global.performance?.now?.()??Date.now()}={}){
  const host=documentRef?.getElementById?.("rawWalletLabV534");
  if(!host||testMode!==true)return Object.freeze({
   setAccess:()=>false,dispose:()=>{},active:()=>false
  });
  host.innerHTML=html;
  const model=createModel({now}),field=name=>host.querySelector('[data-role="'+name+'"]'),
    button=name=>host.querySelector('[data-action="'+name+'"]');
  const checks=()=>Array.from(host.querySelectorAll('input[type="checkbox"]'));
  let allowed=false,timer=null;
  const stopTimer=()=>{if(timer!==null){global.clearInterval(timer);timer=null;}};
  function paint(){
   const s=model.tick();
   if(!allowed)return;
   field("balance").textContent=fmt(s.balanceMicros)+" RAW";
   field("spent").textContent=fmt(s.spentMicros)+" RAW";
   field("time").textContent=String(Math.floor(s.elapsedMs/60000)).padStart(2,"0")+":"+
    String(Math.floor(s.elapsedMs/1000)%60).padStart(2,"0");
   field("rate").textContent=(s.running?s.priceCentsPerHour/100:0)+" RAW/h";
   field("status").textContent=s.status==="running"?"TEST OBRADA AKTIVNA":
    s.status==="paused"?"OBRADA PAUZIRANA":
    s.status==="exhausted"?"TESTNI SALDO POTROŠEN":
    s.status==="ready"?"SPREMNO · BEZ NAPLATE":"NEMA TESTNIH TOKENA";
   button("fund").disabled=s.funded;
   button("start").disabled=!s.funded||s.running||s.balanceMicros===0;
   button("pause").disabled=!s.running;
   checks().forEach(el=>{el.disabled=s.running;});
   const out=field("history");out.replaceChildren();
   if(s.history.length===0){const li=documentRef.createElement("li");
    li.textContent="Još nema testnih transakcija.";out.append(li);}
   else s.history.slice(-12).reverse().forEach(tx=>{
    const li=documentRef.createElement("li");
    li.textContent=(tx.kind==="DEMO_TOPUP"?"Testno dodano ":"Simulirana obrada ")+
     (tx.amountMicros>0?"+":"")+fmt(tx.amountMicros)+" RAW · saldo "+
     fmt(tx.balanceAfterMicros)+" RAW";
    out.append(li);
   });
   if(!s.running)stopTimer();
  }
  function act(event){
   if(!allowed)return;
   const action=event.currentTarget?.dataset?.action;
   try{
    if(action==="fund")model.fund();
    if(action==="start")model.start(checks().filter(el=>el.checked).map(el=>el.value));
    if(action==="pause")model.pause();
    if(action==="reset")model.reset();
    field("notice").textContent=action==="fund"?
     "Dodano je 20 testnih RAW. Još nema potrošnje.":
     action==="start"?"TEST obrada je započela — sada se saldo smanjuje.":"Rad je pauziran ili test resetiran.";
   }catch(err){field("notice").textContent="Nije moguće: "+String(err.message||"testna greška");}
   paint();
   if(model.snapshot().running&&timer===null)timer=global.setInterval(paint,250);
  }
  for(const key of ["fund","start","pause","reset"]){
   button(key).dataset.action=key;
   button(key).addEventListener("click",act);
  }
  host.hidden=true;
  return Object.freeze({
   setAccess(value){
    const next=value===true;
    if(!next){stopTimer();model.reset();}
    allowed=next;host.hidden=!next;
    if(next)paint();
    return next;
   },
   active:()=>allowed,
   snapshot:()=>model.snapshot(),
   dispose(){allowed=false;stopTimer();model.reset();host.hidden=true;}
  });
 }
 global.RAWWalletLabV534=Object.freeze({DEVICES,createModel,mount,format:fmt});
})(typeof window!=="undefined"?window:globalThis);
