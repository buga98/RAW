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
function harness({frames=4096,withPresets=false}={}){
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
  replaceChildren(...items){this.children=[...items];}
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
    if(sel.includes("monitor-match"))out.checked=true;
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
 let enteredName="Vocal pop",confirmed=true;
 const storedPresets=[],storedOps=[];
 const fakeStore={
  list:async()=>storedPresets.map(p=>({...p})),
  save:async(name,settings)=>{
   const item={id:"aaaaaaaa-aaaa-4aaa-8aaa-"+String(storedPresets.length+1).padStart(12,"0"),
    name,settings:{...settings}};
   storedPresets.push(item);storedOps.push("save");return item;
  },
  load:async id=>{const item=storedPresets.find(p=>p.id===id);
   if(!item)throw new Error("Missing preset");storedOps.push("load");return item;},
  remove:async(id,{confirmed})=>{if(!confirmed)throw Error("Confirmation required");
   const i=storedPresets.findIndex(p=>p.id===id);
   if(i>=0)storedPresets.splice(i,1);storedOps.push("delete");return {deletedId:id};},
  close(){storedOps.push("close");}
 };
 const window={document:doc,URL,AudioContext:FakeAudioContext,crypto:webcrypto,
  ...(withPresets?{RAWDigitalPresetsV511:{create:()=>fakeStore}}:{}),
  prompt:()=>enteredName,confirm:()=>confirmed,
  setTimeout:(fn,delay)=>{
   const timer=setTimeout(fn,delay);if(delay>=1000)timer.unref?.();return timer;
  },clearTimeout,
  RAWStudioSim:null};
 const context={window,document:doc,Float32Array,Uint8Array,ArrayBuffer,DataView,
  TextEncoder,Blob,setTimeout,clearTimeout};
 vm.runInNewContext(engine,context);vm.runInNewContext(qcModule,context);
 vm.runInNewContext(ui,context);
 return {window,doc,host,file,decoded,URL,createdUrls,revoked,storedPresets,storedOps,
  setPresetName:name=>{enteredName=name;},confirm:yes=>{confirmed=yes;},
  get panel(){return panel;},
  get clicks(){return clicks;},
  attach:()=>window.RAWDigitalPremasterV59UI.attach(host,{
   getFile:()=>currentFile,canUse:()=>authorized,
   ...(withPresets?{presetUserId:"owner-test"}:{})
  }),
  allow:yes=>authorized=yes,
  changeFile:x=>currentFile=x,
  button:selector=>panel.querySelector("[data-v59-"+selector+"]"),
  select:(key,value)=>{panel.querySelector('[data-v59-setting="'+key+'"]').value=String(value);}
 };
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function waitReady(h){
 for(let i=0;i<250;i++){
  const value=h.button("status").textContent;
  if(/DIGITAL PREMASTER READY/.test(value))return;
  if(/RENDER FAILED|REJECTED/.test(value))
   throw new Error("Unexpected premaster UI result: "+value);
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 throw new Error("Digital premaster did not become READY: "+h.button("status").textContent);
}

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
 await waitReady(h);
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
 await waitReady(h);
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
 await waitReady(h);
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
 await waitReady(h);
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
 await waitReady(h);
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

test("V5.11: local mastering preset buttons save, load, then confirm delete",async()=>{
 const h=harness({withPresets:true});h.attach();await settle();
 h.select("airDb",3);
 h.button("preset-save").click();
 for(let i=0;i<6;i++)await settle();
 assert.equal(h.storedPresets.length,1);
 assert.equal(h.storedPresets[0].name,"Vocal pop");
 assert.equal(h.storedPresets[0].settings.airDb,3);
 const selector=h.button("preset-select");
 assert.equal(selector.value,h.storedPresets[0].id);
 h.select("airDb",-1);
 h.button("preset-load").click();
 for(let i=0;i<6;i++)await settle();
 assert.equal(h.panel.querySelector('[data-v59-setting="airDb"]').value,"3");
 assert.match(h.button("status").textContent,/PRESET LOADED/);
 assert.equal(h.button("download").disabled,true);
 h.confirm(false);
 h.button("preset-delete").click();
 for(let i=0;i<4;i++)await settle();
 assert.equal(h.storedPresets.length,1);
 h.confirm(true);
 h.button("preset-delete").click();
 for(let i=0;i<6;i++)await settle();
 assert.equal(h.storedPresets.length,0);
 assert.ok(h.storedOps.includes("delete"));
 h.window.RAWDigitalPremasterV59UI.detach();
 assert.ok(h.storedOps.includes("close"));
});
test("V5.11: digital presets are only mounted for a scoped owner and never applied to hardware",()=>{
 const css=read("raw-digital-premaster-v59.css");
 assert.match(html,/src="raw-digital-presets-v511\.js"/);
 assert.match(html,/presetUserId:ownerForPremaster/);
 assert.match(ui,/global\.RAWDigitalPresetsV511\.create/);
 assert.match(css,/\.raw-dpm-presets/);
 assert.match(ui,/RACK UNCHANGED/);
 assert.match(ui,/NO AUDIO \/ HARDWARE/);
});

test("V5.12: A/B attenuates only louder RMS preview and never modifies downloadable WAV",async()=>{
 const h=harness();h.attach();
 h.select("makeupDb",6);
 h.button("start").click();
 await waitReady(h);
 const player=h.button("player"),original=h.createdUrls[1].str,processed=h.createdUrls[0].str;
 assert.equal(player.src,processed);
 assert.ok(player.volume>0&&player.volume<0.75,
  "Digital louder track must be attenuated during listening");
 const bytes=(await h.createdUrls[0].value.arrayBuffer()).byteLength;
 h.button("ab-a").click();
 assert.equal(player.src,original);
 assert.equal(player.volume,1);
 h.button("ab-b").click();
 assert.ok(player.volume<0.75);
 const checkbox=h.button("monitor-match");
 checkbox.checked=false;checkbox.handlers.change();
 assert.equal(player.volume,1,"Disabling RMS matching restores monitoring volume");
 assert.equal(h.createdUrls.length,2,"Monitor changes must not re-render audio");
 assert.equal((await h.createdUrls[0].value.arrayBuffer()).byteLength,bytes);
 assert.equal(h.button("download").disabled,false);
 assert.match(h.button("metrics").textContent,/NOT LUFS MATCHED/);
 h.window.RAWDigitalPremasterV59UI.detach();
});
