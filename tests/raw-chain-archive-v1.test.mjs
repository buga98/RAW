import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../raw-chain-archive-v1.js",import.meta.url),"utf8");
function library(){const target={};new Function("window",source)(target);return target.RAWChainArchiveV1;}
const states={
 meq:{snapshot:()=>({slot:"A",A:{eq1Gain:4},B:{eq1Gain:0}})},
 manual:{bankChannels:{A:{A:{eq1Gain:4},B:{eq1Gain:4}}},bankOptions:{A:{A:{filters:{eq1:true}}}},
  channel:"A",mode:"stereo",locked:false,peakHold:"FAST",brightness:100},
 bus:{export:()=>({version:1,bank:2,slot:"C",banks:{"2":{C:{mode:"dual",channels:{L:{threshold:-12},R:{threshold:-3}}}}}})},
 tube:{export:()=>({version:1,preset:"A",presets:{A:{L:{thd:70},R:{thd:0}}}})}
};
function make(lib=library(),options={}){
 return lib.capture({chainOrder:["bettermaker_eq","ngbuscomp","ngtubecomp"],label:"Test Studio",...states,...options});
}
test("portable full chain includes three devices plus MEQ manual data",()=>{
 const lib=library(),archive=make(lib);
 assert.equal(archive.kind,"RAW_LOCAL_CHAIN_ARCHIVE");
 assert.equal(archive.version,1);
 assert.deepEqual(archive.chainOrder,["bettermaker_eq","ngbuscomp","ngtubecomp"]);
 assert.equal(archive.deviceStates.bettermaker_eq.engine.A.eq1Gain,4);
 assert.equal(archive.deviceStates.bettermaker_eq.manual.bankOptions.A.A.filters.eq1,true);
 assert.equal(archive.deviceStates.ngbuscomp.bank,2);
 assert.equal(archive.deviceStates.ngtubecomp.presets.A.L.thd,70);
 assert.equal(archive.provenance.physicalReadback,false);
 assert.equal(archive.provenance.audioRendered,false);
 assert.equal(archive.provenance.verifiedAnalogMaster,false);
});
test("JSON roundtrip import preserves compatible archived values without controlling hardware",()=>{
 const lib=library(),saved=make(lib);
 const recovered=lib.parse(JSON.stringify(saved));
 assert.deepEqual(recovered,saved);
 assert.equal(typeof lib.attach,"function");
 assert.equal("restore" in lib,false);
});
test("archive snapshots are copies and source model cannot mutate prior snapshots",()=>{
 const lib=library(),stored=make(lib);
 stored.deviceStates.ngbuscomp.banks[2].C.channels.L.threshold=-1;
 assert.equal(states.bus.export().banks[2].C.channels.L.threshold,-12);
 const second=make(lib);
 assert.equal(second.deviceStates.ngbuscomp.banks[2].C.channels.L.threshold,-12);
});
test("comparison spots channel, order and preset changes but not labels",()=>{
 const lib=library(),baseline=make(lib);
 const updated=make(lib,{
  chainOrder:["ngbuscomp","bettermaker_eq","ngtubecomp"],
  bus:{export:()=>({version:1,bank:2,slot:"C",banks:{"2":{C:{mode:"dual",channels:{L:{threshold:-11},R:{threshold:-3}}}}}})}
 });
 const diff=lib.compare(baseline,updated);
 assert.equal(diff.differences.some(x=>x.path.includes("threshold")&&x.before===-12&&x.after===-11),true);
 assert.equal(diff.differences.some(x=>x.path.includes("chainOrder")),true);
 assert.equal(diff.differences.some(x=>x.path==="label"),false);
});
test("prototype pollution and constructor keys cannot enter imported archive",()=>{
 const lib=library(),baseline=make(lib);
 const dirty=JSON.stringify(baseline).replace('"ngbuscomp":', '"__proto__":{"polluted":true},"ngbuscomp":');
 assert.throws(()=>lib.parse(dirty),e=>e.code==="ARCHIVE_FIELD");
 assert.equal({}.polluted,undefined);
 const dangerous=JSON.stringify(baseline).replace('"chainOrder":', '"constructor":{"value":"unsafe"},"chainOrder":');
 assert.throws(()=>lib.parse(dangerous),e=>e.code==="ARCHIVE_FIELD");
});
test("reject forged analog verification / audio render flags",()=>{
 const lib=library();
 for(const key of ["physicalReadback","hardwareApplied","audioRendered","verifiedAnalogMaster"]){
  const obj=make(lib);
  obj.provenance[key]=true;
  assert.throws(()=>lib.parse(JSON.stringify(obj)),e=>e.code==="UNSAFE_PROVENANCE");
 }
});
test("unknown device models, top-level fields and incompatible versions rejected",()=>{
 const lib=library();
 const extra=make(lib);extra.deviceStates.unknown_device={value:10};
 assert.throws(()=>lib.parse(JSON.stringify(extra)),e=>e.code==="ARCHIVE_FIELD");
 const misc=make(lib);misc.clientToken="DO_NOT_PERSIST";
 assert.throws(()=>lib.parse(JSON.stringify(misc)),e=>e.code==="ARCHIVE_FIELD");
 const old=make(lib);old.version=999;
 assert.throws(()=>lib.parse(JSON.stringify(old)),e=>e.code==="ARCHIVE_VERSION");
});
test("empty, oversized, malformed and invalid order are rejected",()=>{
 const lib=library();
 assert.throws(()=>lib.parse("not JSON"),e=>e.code==="ARCHIVE_JSON");
 assert.throws(()=>lib.parse(" ".repeat(600_000)),e=>e.code==="ARCHIVE_TOO_LARGE");
 assert.throws(()=>make(lib,{chainOrder:[]}),e=>e.code==="INVALID_CHAIN");
 assert.throws(()=>make(lib,{chainOrder:["../../etc"]}),e=>e.code==="INVALID_CHAIN");
 assert.throws(()=>lib.capture({chainOrder:["ngbuscomp"]}),e=>e.code==="NO_STATES");
});
test("safe filenames and comparison output are bounded",()=>{
 const lib=library();
 assert.match(lib.sanitizeLabel("../../../CON<Hello>"),/^[\p{L}\p{N}_-]+$/u);
 const a=make(lib),b=make(lib);
 b.deviceStates.bettermaker_eq.engine.A.eq1Gain=1;
 assert.equal(lib.compare(a,b,1).differences.length,1);
});
test("UI import uses textContent, read-only model and never sends studio commands",()=>{
 assert.doesNotMatch(source,/\.innerHTML\s*=\s*.*JSON\.stringify/);
 assert.match(source,/\.textContent=diff\.differences/);
 assert.match(source,/READ-ONLY comparison/);
 assert.doesNotMatch(source,/WebSocket|fetch\(|firebase|ipcRenderer|sendControlMessage/);
});
