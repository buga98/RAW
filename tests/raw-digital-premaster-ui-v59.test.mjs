import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {webcrypto} from "node:crypto";

const read=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const engine=read("raw-digital-premaster-v59.js");
const ui=read("raw-digital-premaster-ui-v59.js");
const qcModule=read("raw-master-qc-v510.js");
const html=read("index.html");
function harness({frames=4096}={}){
 const settings={lowCutHz:25,lowShelfDb:0,presenceDb:0,airDb:0,
 thresholdDb:-18,ratio:1,attackMs:20,releaseMs:180,
 makeupDb:0,ceilingDb:-1,bits:24,dither:true};
 const samples=[new Float32Array(frames),new Float32Array(frames)];
 for(let i=0;i<frames;i++)for(let ch=0;ch<2;ch++)
  samples[ch][i]=0.25*Math.sin(2*Math.PI*440*i/48000);
 const decoded={length:frames,numberOfChannels:2,sampleRate:48000,
  getChannelData:ch=>samples[ch]};
 const file={name:"Song.wav",size:16,arrayBuffer:async()=>new ArrayBuffer(16)};
 let currentFile=file,authorized=true,createdUrls=[],revoked=[],clicks=0;
 class FakeEl{
  constructor(){this.value="";this.disabled=false;this.hidden=false;
   this.checked=false;this.paused=true;this.currentTime=0;this.duration=1;
   this.textContent="";this.src="";this.handlers={};this.children=[];}
  addEventListener(name,fn){this.handlers[name]=fn;}
  click(){this.handlers.click?.();}
  append(...items){this.children.push(...items);}
  remove(){this.removed=true;}
  pause(){this.paused=true;}
  load(){}
  removeAttribute(name){if(name==="src")this.src="";}
 }
 class Panel extends FakeEl{
  constructor(){super();this.fields=new Map();}
  querySelectorAll(selector){
   if(selector==="[data-v59-setting]")
    return Object.keys(settings).map(key=>this.querySelector('[data-v59-setting="'+key+'"]'));
   return [];
  }
  querySelector(sel){
   if(!this.fields.has(sel)){
    const out=new FakeEl();
    const option=sel.match(/data-v59-setting="([^"]+)"/)?.[1];
    if(option){out.value=String(settings[option]);out.checked=option==="dither";}
    if(sel.includes("download")||sel.includes("qc")||sel.includes("ab-a")||sel.includes("ab-b"))
     out.disabled=true;
    if(sel.includes("cancel"))out.disabled=true;
    this.fields.set(sel,out);
   }
   return this.fields.get(sel);
  }
 }
 const doc={body:{append(){}},createElement(tag){
  if(tag==="section")return new Panel();
  if(tag==="a"){const a=new FakeEl();a.click=()=>{clicks++;};return a;}
  return new FakeEl();
 }};
 let panel=null;
 const host={append(el){panel=el;},querySelector:()=>panel};
 const URL={createObjectURL(value){const str="blob:offline-v59-"+createdUrls.length;
  createdUrls.push({str,value});return str;},revokeObjectURL:url=>revoked.push(url)};
 class FakeAudioContext{
  async decodeAudioData(){return decoded;}
  async close(){}
 }
 const window={document:doc,URL,AudioContext:FakeAudioContext,crypto:webcrypto,
  setTimeout:(fn,delay)=>{
   const timer=setTimeout(fn,delay);if(delay>=1000)timer.unref?.();return timer;
  },clearTimeout,
  RAWStudioSim:null};
 const context={window,document:doc,Float32Array,Uint8Array,ArrayBuffer,DataView,
  TextEncoder,Blob,setTimeout,clearTimeout};
 vm.runInNewContext(engine,context);vm.runInNewContext(qcModule,context);
 vm.runInNewContext(ui,context);
 return {window,doc,host,file,decoded,URL,createdUrls,revoked,
  get panel(){return panel;},
  get clicks(){return clicks;},
  attach:()=>window.RAWDigitalPremasterV59UI.attach(host,{
   getFile:()=>currentFile,canUse:()=>authorized
  }),
  allow:yes=>authorized=yes,
  changeFile:x=>currentFile=x,
  button:selector=>panel.querySelector("[data-v59-"+selector+"]"),
  select:(key,value)=>{panel.querySelector('[data-v59-setting="'+key+'"]').value=String(value);}
 };
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test("V5.9: digital mastering is separate from the virtual hardware rack",()=>{
 assert.match(html,/src="raw-digital-premaster-v59\.js"/);
 assert.match(html,/src="raw-digital-premaster-ui-v59\.js"/);
 assert.match(html,/src="raw-master-qc-v510\.js"/);
 assert.match(html,/raw-digital-premaster-v59\.css/);
 assert.match(html,/function mountDigitalPremaster/);
 assert.match(html,/window\.RAWDigitalPremasterV59UI\?\.detach\?\.\(\)/);
 assert.match(html,/window\.RAWDigitalPremasterV59UI\?\.attach\?\.\(pluginHost/);
 assert.match(html,/mountDigitalPremaster\(\)/);
 assert.match(html,/!window\.RAWStudioGatewayV1\?\.interceptsControls\?\.\(\)/);
 assert.doesNotMatch(ui,/\b(?:WebSocket|fetch|ipcRenderer|sendControlMessage|runTransaction|firebase)\s*\(/i);
 assert.doesNotThrow(()=>new vm.Script(ui));
});
test("V5.9: verified local session can render user audio and download distinct DIGITAL WAV",async()=>{
 const h=harness();assert.equal(h.attach(),true);
 h.button("start").click();
 for(let i=0;i<10;i++)await settle();
 assert.match(h.button("status").textContent,/DIGITAL PREMASTER READY/);
 assert.equal(h.button("download").disabled,false);
 assert.equal(h.button("ab-a").disabled,false);
 assert.equal(h.button("ab-b").disabled,false);
 assert.match(h.button("metrics").textContent,/SAMPLE PEAK/);
 assert.match(h.button("metrics").textContent,/Not Bettermaker\/WesAudio processing/i);
 h.button("download").click();
 assert.equal(h.clicks,1);
 assert.equal(h.createdUrls.length,2);
 assert.equal(h.createdUrls[0].value.type,"audio/wav");
 assert.equal(h.createdUrls[1].value,h.file);
 h.window.RAWDigitalPremasterV59UI.detach();
 assert.equal(h.revoked.length,2);
});
test("V5.9: A/B swaps source and processed audio without claiming analog work",async()=>{
 const h=harness();h.attach();h.button("start").click();
 for(let i=0;i<8;i++)await settle();
 const player=h.button("player"),original=h.createdUrls[1].str,processed=h.createdUrls[0].str;
 assert.equal(player.src,processed);
 h.button("ab-a").click();
 assert.equal(player.src,original);
 assert.match(h.button("status").textContent,/ORIGINAL SOURCE/);
 h.button("ab-b").click();
 assert.equal(player.src,processed);
 assert.match(h.button("status").textContent,/DIGITAL PREMASTER/);
 h.window.RAWDigitalPremasterV59UI.detach();
});
test("V5.9: revoked owner scope cannot export stale rendered audio",async()=>{
 const h=harness();h.attach();h.button("start").click();
 for(let i=0;i<8;i++)await settle();
 h.allow(false);
 h.button("download").click();
 assert.equal(h.clicks,0);
 h.window.RAWDigitalPremasterV59UI.detach();
});
test("V5.9: owner cancellation discards in-flight output",async()=>{
 const h=harness({frames:70000});h.attach();
 h.button("start").click();
 h.button("cancel").click();
 for(let i=0;i<15;i++)await settle();
 assert.equal(h.button("download").disabled,true);
 assert.equal(h.createdUrls.length,0);
 h.window.RAWDigitalPremasterV59UI.detach();
});
test("V5.9: absent file, denied owner and lost file scope cannot render",async()=>{
 const denied=harness();denied.allow(false);
 assert.equal(denied.attach(),false);
 const missing=harness();missing.changeFile(null);
 assert.equal(missing.attach(),false);
 const changed=harness();changed.attach();changed.changeFile({name:"other.wav"});
 changed.button("start").click();
 for(let i=0;i<5;i++)await settle();
 assert.equal(changed.createdUrls.length,0);
 changed.window.RAWDigitalPremasterV59UI.detach();
});

test("V5.9: changing DSP settings invalidates downloadable WAV and A/B preview",async()=>{
 const h=harness();h.attach();h.button("start").click();
 for(let i=0;i<8;i++)await settle();
 assert.equal(h.button("download").disabled,false);
 const control=h.panel.querySelector('[data-v59-setting="lowShelfDb"]');
 control.value="4";control.handlers.change();
 assert.equal(h.button("download").disabled,true);
 assert.equal(h.button("ab-a").disabled,true);
 assert.equal(h.button("ab-b").disabled,true);
 assert.equal(h.revoked.length,2);
 assert.match(h.button("status").textContent,/SETTINGS CHANGED/);
 h.button("download").click();
 assert.equal(h.clicks,0);
 h.window.RAWDigitalPremasterV59UI.detach();
});

test("V5.10: local DSP exposes verified QC metadata and separate JSON receipt",async()=>{
 const h=harness();h.attach();h.button("start").click();
 for(let i=0;i<10;i++)await settle();
 assert.equal(h.button("qc").disabled,false);
 assert.match(h.button("metrics").textContent,/DIGITAL QC: PASS/);
 assert.match(h.button("metrics").textContent,/SHA-256: [a-f0-9]{64}/);
 const oldCount=h.createdUrls.length;
 h.button("qc").click();
 assert.equal(h.clicks,1);
 assert.equal(h.createdUrls.length,oldCount+1);
 assert.equal(h.createdUrls.at(-1).value.type,"application/json");
 const receipt=JSON.parse(await h.createdUrls.at(-1).value.text());
 assert.equal(receipt.kind,"RAW_LOCAL_DIGITAL_QC_V510");
 assert.equal(receipt.overall,"PASS");
 assert.equal(receipt.hardwareProcessed,false);
 assert.equal(receipt.masterAvailable,false);
 h.window.RAWDigitalPremasterV59UI.detach();
});
