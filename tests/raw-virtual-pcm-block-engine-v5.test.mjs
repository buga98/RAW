import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createVirtualPcmBlockEngine,createPcmBlockMeter,PCM_BLOCK_LIMITS_V5} from '../raw-virtual-pcm-block-engine-v5.mjs';
import {createCalibrationFixture,simulateVirtualLoopback} from '../raw-virtual-audio-loopback-v5.mjs';
function packet(seq,start,left,right,sampleRate=48000) {
  return {sequence:seq,startFrame:start,sampleRate,channels:[Float32Array.from(left),Float32Array.from(right)]};
}
function collect(source,{blockFrames=128,latencyFrames=0,channelMap=[0,1],gain=[1,1],dcOffset=[0,0]}={}) {
  const engine=createVirtualPcmBlockEngine({sampleRate:source.sampleRate,blockFrames,latencyFrames,channelMap,gain,dcOffset});
  const meter=createPcmBlockMeter({sampleRate:source.sampleRate});
  const left=[],right=[];let sequence=0;
  for(let start=0;start<source.channels[0].length;start+=blockFrames) {
    const count=Math.min(blockFrames,source.channels[0].length-start);
    const out=engine.push({sequence:sequence++,startFrame:start,sampleRate:source.sampleRate,
      channels:source.channels.map(ch=>ch.subarray(start,start+count))});
    meter.add(out);left.push(...out.channels[0]);right.push(...out.channels[1]);
  }
  for(const out of engine.finish()){meter.add(out);left.push(...out.channels[0]);right.push(...out.channels[1]);}
  return {left,right,engine,meter};
}
test('stream 4096 frames in 128-frame chunks, zero latency and exact stereo',()=>{
  const src=createCalibrationFixture(); const out=collect(src);
  assert.deepEqual(out.left, [...src.channels[0]]);
  assert.deepEqual(out.right,[...src.channels[1]]);
  assert.equal(out.engine.state().inputFrames,4096);
  assert.equal(out.engine.state().outputFrames,4096);
  assert.equal(out.meter.snapshot().blocks,32);
  assert.equal(out.meter.snapshot().channels[0].clippedFrames,0);
});
test('137-frame chunks with 300-frame tail remain sample accurate',()=>{
  const src=createCalibrationFixture({frames:4117});
  const out=collect(src,{blockFrames:137,latencyFrames:300});
  assert.equal(out.left.length,4417);assert.equal(out.right.length,4417);
  assert.ok(out.left.slice(0,300).every(x=>x===0));
  assert.deepEqual(out.left.slice(300),[...src.channels[0]]);
  assert.deepEqual(out.right.slice(300),[...src.channels[1]]);
  assert.equal(out.engine.state().finished,true);
  assert.equal(out.meter.snapshot().frames,4417);
});
test('streaming gain and dc offset match existing whole-buffer V5 reference',()=>{
  const src=createCalibrationFixture({frames:3000});
  const conf={latencyFrames:193,channelMap:[1,0],gain:[0.8,1.25],dcOffset:[0.03125,-0.0625]};
  const out=collect(src,{...conf,blockFrames:79});
  const full=simulateVirtualLoopback({source:src,...conf});
  assert.deepEqual(out.left,[...full.capture[0]]);
  assert.deepEqual(out.right,[...full.capture[1]]);
});
test('output buffer does not alias input and survives reuse',()=>{
  const e=createVirtualPcmBlockEngine({blockFrames:4});
  const input=packet(0,0,[0.5,0.25,0,0],[0,0,0.2,0.4]);
  const output=e.push(input);input.channels[0].fill(1);
  assert.deepEqual([...output.channels[0]],[0.5,0.25,0,0]);
});
test('configuration arrays cannot be changed after engine creation',()=>{
  const map=[0,1], gain=[1,1];
  const e=createVirtualPcmBlockEngine({channelMap:map,gain,blockFrames:2});
  map.reverse();gain[0]=3;
  assert.deepEqual([...e.push(packet(0,0,[0.3,0.2],[0.7,0.8])).channels[0]],
    [...Float32Array.from([0.3,0.2])]);
});
test('packet rejected atomically when NaN, wrong sample-rate or mismatched stereo count',()=>{
  const e=createVirtualPcmBlockEngine({blockFrames:4});
  assert.throws(()=>e.push(packet(0,0,[NaN,0],[0,0])),/Non-finite/);
  assert.throws(()=>e.push(packet(0,0,[0,0],[0])),/frame count mismatch/);
  assert.throws(()=>e.push(packet(0,0,[0,0],[0,0],44100)),/sample rate changed/);
  assert.equal(e.state().inputFrames,0);
  const next=e.push(packet(0,0,[0.1,0.2],[0.2,0.1]));
  assert.equal(next.sequence,0);assert.equal(e.state().inputFrames,2);
});
test('out-of-order, replayed, gaps and unknown input fields are blocked',()=>{
  const e=createVirtualPcmBlockEngine({blockFrames:2});
  e.push(packet(0,0,[0,0],[0,0]));
  assert.throws(()=>e.push(packet(0,0,[0,0],[0,0])),/Out-of-order/);
  assert.throws(()=>e.push(packet(2,2,[0,0],[0,0])),/Out-of-order/);
  assert.throws(()=>e.push(packet(1,3,[0,0],[0,0])),/Out-of-order/);
  assert.throws(()=>e.push({...packet(1,2,[0,0],[0,0]),secret:'x'}),/Unknown PCM block field/);
  e.push(packet(1,2,[0,0],[0,0]));
  assert.equal(e.state().inputFrames,4);
});
test('reject oversized chunks, extreme config, negative latency and invalid map',()=>{
  assert.throws(()=>createVirtualPcmBlockEngine({blockFrames:8193}),/blockFrames/);
  assert.throws(()=>createVirtualPcmBlockEngine({latencyFrames:-1}),/latencyFrames/);
  assert.throws(()=>createVirtualPcmBlockEngine({latencyFrames:4097}),/latencyFrames/);
  assert.throws(()=>createVirtualPcmBlockEngine({channelMap:[0,0]}),/channelMap/);
  assert.throws(()=>createVirtualPcmBlockEngine({gain:[Infinity,1]}),/Invalid gain/);
  assert.throws(()=>createVirtualPcmBlockEngine({sampleRate:12345}),/sample rate/);
  assert.equal(PCM_BLOCK_LIMITS_V5.maxBlockFrames,8192);
});
test('flush emits only the latency tail and does not permit second finish or push',()=>{
  const e=createVirtualPcmBlockEngine({blockFrames:2,latencyFrames:5});
  const first=e.push(packet(0,0,[0.2,0.4],[0.3,0.5]));
  assert.equal(first.frameCount,2);
  const tail=e.finish();
  assert.deepEqual(tail.map(block=>block.frameCount),[2,2,1]);
  assert.deepEqual(tail.map(block=>block.startFrame),[2,4,6]);
  assert.throws(()=>e.finish(),/already finished/);
  assert.throws(()=>e.push(packet(1,2,[0],[0])),/already finished/);
});
test('meter reports clipping, RMS, peak and DC from real virtual samples',()=>{
  const e=createVirtualPcmBlockEngine({blockFrames:4,gain:[2,1]});
  const m=createPcmBlockMeter();
  m.add(e.push(packet(0,0,[0.75,0.5,-0.25,0],[0,0,0,0])));
  const s=m.snapshot();
  assert.equal(s.channels[0].peak,1.5);
  assert.equal(s.channels[0].clippedFrames,2);
  assert.equal(s.channels[0].dcOffset,0.5);
  assert.equal(s.channels[1].rms,0);
  assert.equal(s.channels[1].rmsDbfs,null);
  assert.equal(s.physicalReadback,false);
});
test('meter rejects repeated output and packet mutated with false provenance',()=>{
  const e=createVirtualPcmBlockEngine({blockFrames:2});
  const m=createPcmBlockMeter();
  const block=e.push(packet(0,0,[0,0],[0,0]));
  assert.throws(()=>m.add({...block,provenance:{physicalReadback:true}}),/Untrusted/);
  assert.equal(m.snapshot().frames,0);
  m.add(block);
  assert.throws(()=>m.add(block),/Non-contiguous/);
});
test('stream 500,000 frames with constant-sized packets and bounded latency memory',()=>{
  const blockFrames=512, frames=500000;
  const e=createVirtualPcmBlockEngine({sampleRate:44100,blockFrames,latencyFrames:4096});
  const meter=createPcmBlockMeter({sampleRate:44100});
  let count=0,seq=0;
  const left=new Float32Array(blockFrames),right=new Float32Array(blockFrames);
  while(count<frames){
    const size=Math.min(blockFrames,frames-count);
    const out=e.push({sequence:seq++,startFrame:count,sampleRate:44100,
      channels:[left.subarray(0,size),right.subarray(0,size)]});
    assert.ok(out.frameCount<=blockFrames);
    meter.add(out);count+=size;
  }
  const tail=e.finish();
  assert.equal(tail.length,8);
  for(const block of tail){assert.ok(block.frameCount<=512);meter.add(block);}
  assert.equal(e.state().outputFrames,504096);
  assert.equal(meter.snapshot().frames,504096);
  assert.equal(meter.snapshot().channels[0].peak,0);
});
test('refuses unrealistic sample amplitude without corrupting stream cursor',()=>{
 const e=createVirtualPcmBlockEngine({blockFrames:2});
 assert.throws(()=>e.push(packet(0,0,[1e30,0],[0,0])),/amplitude out of range/);
 assert.equal(e.state().inputFrames,0);
 assert.equal(e.push(packet(0,0,[0.1,0],[0,0])).sequence,0);
});
test('empty stream cannot be flushed as a completed audio capture',()=>{
  const e=createVirtualPcmBlockEngine();
  assert.throws(()=>e.finish(),/no input/);
  assert.equal(e.state().finished,false);
});
test('stream engine has no real audio, file, network, billing or hardware controls',()=>{
  const src=readFileSync(new URL('../raw-virtual-pcm-block-engine-v5.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(src,/\b(?:fetch|spawn|updateDoc|increment|WebSocket|AudioContext|writeFile|createWriteStream)\s*\(/);
  assert.match(src,/analogCaptured: false, masterAvailable: false, transportAllowed: false/);
});
