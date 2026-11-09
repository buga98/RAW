import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {webcrypto} from "node:crypto";

const read=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
function harness(t,owner="uid-owner"){
 const window={crypto:webcrypto};
 const context={window,Float32Array,Uint8Array,ArrayBuffer,DataView,TextEncoder,Blob,
  setTimeout,clearTimeout};
 vm.runInNewContext(read("raw-digital-premaster-v59.js"),context);
 vm.runInNewContext(read("raw-digital-presets-v511.js"),context);
 const rows=new Map(),writes=[],deletes=[];
 const backend={
  async list(scope){return [...rows.values()].filter(x=>x.scope===scope).map(x=>structuredClone(x));},
  async put(entry){rows.set(entry.key,structuredClone(entry));writes.push(structuredClone(entry));return true;},
  async remove(key){rows.delete(key);deletes.push(key);return true;}
 };
 let allowed=true;
 const store=(uid=owner)=>window.RAWDigitalPresetsV511.create({
  userId:uid,authorized:()=>allowed,backend,cryptoRef:webcrypto,
  codec:window.RAWDigitalPremasterV59,now:()=> "2026-11-09T14:30:00Z"
 });
 const open=[];const create=(uid=owner)=>{const s=store(uid);open.push(s);return s;};
 t.after(()=>open.forEach(x=>x.close()));
 return {window,rows,writes,deletes,create,allow:value=>allowed=value};
}
test("V5.11: save and restore owner-scoped SHA-verified digital mastering settings",async t=>{
 const h=harness(t),s=h.create();
 const values={lowShelfDb:4,presenceDb:-2,thresholdDb:-21,ratio:2.5,bits:16};
 const saved=await s.save("Pop clean",values);
 assert.equal(saved.name,"Pop clean");
 assert.equal(saved.settings.lowShelfDb,4);
 assert.equal(saved.settings.ratio,2.5);
 assert.equal(saved.settings.bits,16);
 assert.equal(saved.settings.airDb,0);
 assert.equal(saved.hardwareApplied,false);
 const list=await s.list();
 assert.equal(list.length,1);
 const loaded=await s.load(saved.id);
 assert.equal(loaded.name,"Pop clean");
 assert.equal(loaded.settings.thresholdDb,-21);
 assert.equal(Object.isFrozen(loaded.settings),true);
 assert.equal(h.writes.length,1);
 assert.ok(h.writes[0].sha256.match(/^[a-f0-9]{64}$/));
 assert.ok(!h.writes[0].key.includes("uid-owner"));
 assert.equal(h.writes[0].kind,"RAW_LOCAL_DIGITAL_PRESET_V511");
 assert.equal(h.writes[0].settings.audioFile,undefined);
});
test("V5.11: another owner cannot list or load the first owner's local presets",async t=>{
 const h=harness(t),a=h.create("owner-a"),b=h.create("owner-b");
 const x=await a.save("My EQ",{airDb:3});
 assert.equal((await b.list()).length,0);
 await assert.rejects(b.load(x.id),/No verified preset/);
 assert.equal((await a.list()).length,1);
});
test("V5.11: tampered SHA-256 and invalid settings are rejected, never automatically deleted",async t=>{
 const h=harness(t),s=h.create();
 await s.save("Original",{lowShelfDb:2});
 const row=[...h.rows.values()][0],key=row.key;
 row.settings.lowShelfDb=11;h.rows.set(key,row);
 await assert.rejects(s.list(),/SHA-256/);
 assert.equal(h.rows.size,1);
 assert.equal(h.deletes.length,0);
 row.settings.lowShelfDb=999;h.rows.set(key,row);
 await assert.rejects(s.list(),/invalid/);
});
test("V5.11: deleting needs explicit confirmation and preserves other owners",async t=>{
 const h=harness(t),a=h.create("owner-a"),b=h.create("owner-b");
 const x=await a.save("Vocal bright",{presenceDb:3});
 const y=await b.save("Other owner",{airDb:2});
 await assert.rejects(a.remove(x.id),/explicit confirmation/);
 assert.equal(h.rows.size,2);
 const receipt=await a.remove(x.id,{confirmed:true});
 assert.equal(receipt.deletedId,x.id);
 assert.equal(receipt.hardwareApplied,false);
 assert.equal((await a.list()).length,0);
 assert.equal((await b.load(y.id)).name,"Other owner");
});
test("V5.11: duplicate preset names and invalid values cannot overwrite previous settings",async t=>{
 const h=harness(t),s=h.create();
 await s.save("  MASTER ONE  ",{ratio:1.5});
 await assert.rejects(s.save("master one",{ratio:3}),/already exists/);
 await assert.rejects(s.save("Broken",{ratio:Infinity}),/out of range/);
 await assert.rejects(s.save("<script>",{}),/invalid/);
 assert.equal((await s.list()).length,1);
 assert.equal(h.writes.length,1);
});
test("V5.11: storage limit is 20 presets and no auto-prune deletes data",async t=>{
 const h=harness(t),s=h.create();
 for(let i=0;i<20;i++)await s.save("Master "+i,{airDb:i/4});
 assert.equal((await s.list()).length,20);
 await assert.rejects(s.save("21st master",{}),/Maximum of 20/);
 assert.equal(h.rows.size,20);
 assert.equal(h.deletes.length,0);
});
test("V5.11: revoked owner or closed store cannot read, save or delete",async t=>{
 const h=harness(t),s=h.create();
 const preset=await s.save("Safe",{ratio:2});
 h.allow(false);
 await assert.rejects(s.list(),/Owner access/);
 await assert.rejects(s.load(preset.id),/Owner access/);
 await assert.rejects(s.save("Untrusted",{}),/Owner access/);
 await assert.rejects(s.remove(preset.id,{confirmed:true}),/Owner access/);
 h.allow(true);
 s.close();
 await assert.rejects(s.list(),/Owner access/);
 assert.equal(h.rows.size,1);
});
test("V5.11: local preset module contains no hardware/network/billing instructions",()=>{
 const source=read("raw-digital-presets-v511.js");
 assert.doesNotMatch(source,/\b(?:WebSocket|fetch|ipcRenderer|sendControlMessage|runTransaction|easymidi|localStorage)\s*\(/i);
 assert.match(source,/SHA-256/);
 assert.match(source,/NO.*?audio data/i);
});
