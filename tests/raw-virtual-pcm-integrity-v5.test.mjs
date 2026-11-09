import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCalibrationFixture} from '../raw-virtual-audio-loopback-v5.mjs';
import {createVirtualPcmIntegritySession} from '../raw-virtual-pcm-integrity-v5.mjs';

function feed(session,source,blockFrames) {
  let seq=0;
  for(let i=0;i<source.channels[0].length;i+=blockFrames) {
    const n=Math.min(blockFrames,source.channels[0].length-i);
    session.push({sequence:seq++,startFrame:i,sampleRate:source.sampleRate,
      channels:source.channels.map(ch=>ch.subarray(i,i+n))});
  }
  return session.finish();
}
function packet(sequence=0,startFrame=0,left=[0.75,0.25],right=[-0.5,0.5],sampleRate=48000) {
  return {sequence,startFrame,sampleRate,
    channels:[new Float32Array(left),new Float32Array(right)]};
}
test('V5.2 lossless virtual 0-latency source hash equals virtual output hash',()=>{
  const src=createCalibrationFixture();
  const session=createVirtualPcmIntegritySession({blockFrames:128});
  const receipt=feed(session,src,128);
  assert.equal(receipt.status,'COMPLETE_SIMULATION_ONLY');
  assert.equal(receipt.sourceSha256,receipt.captureSha256);
  assert.match(receipt.sourceSha256,/^[0-9a-f]{64}$/);
  assert.equal(receipt.inputFrames,4096);
  assert.equal(receipt.capturedFrames,4096);
  assert.equal(receipt.meter.channels[0].peak,0.875);
  assert.equal(receipt.provenance.analogCaptured,false);
  assert.equal(receipt.provenance.masterAvailable,false);
});
test('canonical hashes are unaffected by packet partitioning',()=>{
  const src=createCalibrationFixture({frames:4191});
  const all=[23,128,511].map(n=>feed(createVirtualPcmIntegritySession({blockFrames:n}),src,n));
  assert.equal(new Set(all.map(r=>r.sourceSha256)).size,1);
  assert.equal(new Set(all.map(r=>r.captureSha256)).size,1);
});
test('virtual latency changes capture hash and count but not source hash',()=>{
  const src=createCalibrationFixture();
  const base=feed(createVirtualPcmIntegritySession({blockFrames:103}),src,103);
  const late=feed(createVirtualPcmIntegritySession({blockFrames:103,latencyFrames:257}),src,103);
  assert.equal(base.sourceSha256,late.sourceSha256);
  assert.notEqual(base.captureSha256,late.captureSha256);
  assert.equal(late.capturedFrames,4353);
});
test('virtual gain and swapping L/R produce distinct output fingerprints',()=>{
  const src=createCalibrationFixture();
  const ref=feed(createVirtualPcmIntegritySession({blockFrames:256}),src,256);
  const gain=feed(createVirtualPcmIntegritySession({blockFrames:256,gain:[1.5,1]}),src,256);
  const swap=feed(createVirtualPcmIntegritySession({blockFrames:256,channelMap:[1,0]}),src,256);
  assert.equal(ref.sourceSha256,gain.sourceSha256);
  assert.equal(ref.sourceSha256,swap.sourceSha256);
  assert.notEqual(ref.captureSha256,gain.captureSha256);
  assert.notEqual(ref.captureSha256,swap.captureSha256);
  assert.notEqual(gain.captureSha256,swap.captureSha256);
});
test('changing a sample changes SHA-256 and prevents false validation',()=>{
  const a=createCalibrationFixture(),b=createCalibrationFixture();
  b.channels[0][88]=0.1;
  const first=feed(createVirtualPcmIntegritySession({blockFrames:128}),a,128);
  const second=feed(createVirtualPcmIntegritySession({blockFrames:128}),b,128);
  assert.notEqual(first.sourceSha256,second.sourceSha256);
});
test('matching expected source checksum allows completing virtual-only receipt',()=>{
  const src=createCalibrationFixture();
  const first=feed(createVirtualPcmIntegritySession({blockFrames:128}),src,128);
  const session=createVirtualPcmIntegritySession({blockFrames:128,expectedSourceSha256:first.sourceSha256.toUpperCase()});
  const result=feed(session,src,128);
  assert.equal(result.sourceSha256,first.sourceSha256);
  assert.equal(session.snapshot().receiptAvailable,true);
});
test('mismatched expected source checksum rejects without creating a receipt',()=>{
  const src=createCalibrationFixture();
  const session=createVirtualPcmIntegritySession({blockFrames:128,expectedSourceSha256:'0'.repeat(64)});
  let seq=0;
  for(let i=0;i<src.channels[0].length;i+=128)
    session.push({sequence:seq++,startFrame:i,sampleRate:48000,
      channels:src.channels.map(c=>c.subarray(i,i+128))});
  assert.throws(()=>session.finish(),/SHA-256 mismatch/);
  assert.equal(session.snapshot().status,'REJECTED');
  assert.equal(session.snapshot().receiptAvailable,false);
  assert.throws(()=>session.finish(),/REJECTED/);
});
test('abort blocks further updates and does not produce a completed receipt',()=>{
  const session=createVirtualPcmIntegritySession({blockFrames:32});
  session.push(packet());
  assert.equal(session.abort(),true);
  assert.equal(session.abort(),false);
  assert.equal(session.snapshot().status,'ABORTED');
  assert.throws(()=>session.push(packet(1,2)),/ABORTED/);
  assert.throws(()=>session.finish(),/ABORTED/);
  assert.equal(session.snapshot().receiptAvailable,false);
});
test('malformed packet rejection is atomic; same valid packet can be retried',()=>{
  const failed=createVirtualPcmIntegritySession({blockFrames:8});
  assert.throws(()=>failed.push(packet(1,0)),/Out-of-order/);
  assert.throws(()=>failed.push(packet(0,0,[NaN],[0])),/Non-finite/);
  assert.throws(()=>failed.push(packet(0,0,[0],[0],44100)),/sample rate/);
  assert.equal(failed.snapshot().inputFrames,0);
  failed.push(packet());
  const expected=createVirtualPcmIntegritySession({blockFrames:8});
  expected.push(packet());
  assert.equal(failed.finish().sourceSha256,expected.finish().sourceSha256);
});
test('mutating an already-submitted input array cannot retroactively change its digest',()=>{
  const first=createVirtualPcmIntegritySession({blockFrames:8});
  const input=packet();
  first.push(input);
  input.channels[0][0]=100;
  const expected=createVirtualPcmIntegritySession({blockFrames:8});
  expected.push(packet());
  assert.equal(first.finish().sourceSha256,expected.finish().sourceSha256);
});
test('source SHA contains sample rate, channel order and final frame count',()=>{
  const l=createVirtualPcmIntegritySession({blockFrames:4,sampleRate:48000});
  l.push(packet());
  const a=l.finish();
  const r=createVirtualPcmIntegritySession({blockFrames:4,sampleRate:44100});
  r.push(packet(0,0,[0.75,0.25],[-0.5,0.5],44100));
  const b=r.finish();
  const extra=createVirtualPcmIntegritySession({blockFrames:4});
  extra.push(packet(0,0,[0.75,0.25,0],[-0.5,0.5,0]));
  const c=extra.finish();
  assert.notEqual(a.sourceSha256,b.sourceSha256);
  assert.notEqual(a.sourceSha256,c.sourceSha256);
});
test('untrusted source options or incorrect expected checksum are rejected',()=>{
  assert.throws(()=>createVirtualPcmIntegritySession({hardwareReady:true}),/Unknown capture option/);
  assert.throws(()=>createVirtualPcmIntegritySession({expectedSourceSha256:'xyz'}),/64 hexadecimal/);
  assert.throws(()=>createVirtualPcmIntegritySession({expectedSourceSha256:123}),/64 hexadecimal/);
  assert.throws(()=>createVirtualPcmIntegritySession({sampleRate:96001}),/sample rate/);
});
test('finish cannot be invoked twice, and abort cannot undo a successful receipt',()=>{
  const s=createVirtualPcmIntegritySession({blockFrames:4});
  s.push(packet());const receipt=s.finish();
  assert.equal(s.snapshot().status,'COMPLETE_SIMULATION_ONLY');
  assert.throws(()=>s.finish(),/COMPLETE_SIMULATION_ONLY/);
  assert.throws(()=>s.abort(),/COMPLETE_SIMULATION_ONLY/);
  assert.equal(receipt.status,'COMPLETE_SIMULATION_ONLY');
  assert.equal(Object.isFrozen(receipt),true);
});
test('empty stream rejected without fake successful capture',()=>{
  const session=createVirtualPcmIntegritySession();
  assert.throws(()=>session.finish(),/no input/);
  assert.equal(session.snapshot().receiptAvailable,false);
  assert.equal(session.snapshot().status,'REJECTED');
});
test('half million frames are hashed incrementally without retaining all packets',()=>{
  const s=createVirtualPcmIntegritySession({blockFrames:512,latencyFrames:4096});
  const left=new Float32Array(512),right=new Float32Array(512);
  let seq=0;
  for(let i=0;i<500000;i+=512){
    const frames=Math.min(512,500000-i);
    s.push({sequence:seq++,startFrame:i,sampleRate:48000,
      channels:[left.subarray(0,frames),right.subarray(0,frames)]});
  }
  const receipt=s.finish();
  assert.equal(receipt.inputFrames,500000);
  assert.equal(receipt.capturedFrames,504096);
  assert.match(receipt.captureSha256,/^[a-f0-9]{64}$/);
});
test('V5.2 provenance makes no claim of real hardware, file or billing operations',()=>{
  const code=readFileSync(new URL('../raw-virtual-pcm-integrity-v5.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(code,/\b(?:fetch|spawn|updateDoc|increment|WebSocket|AudioContext|writeFile|createWriteStream)\s*\(/);
  assert.match(code,/analogCaptured:false,masterAvailable:false,transportAllowed:false/);
});
