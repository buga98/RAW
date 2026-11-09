import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {V5_DIAGNOSTIC_SCENARIOS,runVirtualAudioScenario} from '../raw-v5-diagnostics-runner-v5.mjs';

test('all eight fixed V5 scenarios prove expected offline behavior',()=>{
  assert.equal(V5_DIAGNOSTIC_SCENARIOS.length,8);
  for(const scenario of V5_DIAGNOSTIC_SCENARIOS){
    const result=runVirtualAudioScenario(scenario);
    assert.equal(result.kind,'RAW_V5_DIAGNOSTIC_RESULT',scenario);
    assert.equal(result.scenario,scenario);
    assert.equal(result.ok,true,scenario+': '+result.detail);
    assert.equal(result.simulationOnly,true);
    assert.equal(result.analogVerified,false);
    assert.equal(result.hardwareControlled,false);
    assert.equal(result.masterAvailable,false);
    assert.equal(Object.isFrozen(result),true);
  }
});
test('clean and latency diagnostics show real frame counts and latency',()=>{
  const clean=runVirtualAudioScenario('clean');
  const latency=runVirtualAudioScenario('latency');
  assert.equal(clean.metrics.latencyFrames,0);
  assert.equal(clean.metrics.inputFrames,4096);
  assert.equal(clean.metrics.captureFrames,4096);
  assert.equal(clean.metrics.sourceSha256,clean.metrics.captureSha256);
  assert.equal(latency.metrics.latencyFrames,256);
  assert.equal(latency.metrics.captureFrames,4352);
  assert.equal(latency.metrics.bitAccurate,true);
  assert.notEqual(latency.metrics.sourceSha256,latency.metrics.captureSha256);
  assert.equal(latency.metrics.channelOrderValid,true);
});
test('injected swaps, gain faults and overload are detectable—not presented as clean audio',()=>{
  const swap=runVirtualAudioScenario('swap').metrics;
  const gain=runVirtualAudioScenario('gain').metrics;
  const clip=runVirtualAudioScenario('clip').metrics;
  assert.equal(swap.channelOrderValid,false);
  assert.equal(swap.bitAccurate,false);
  assert.equal(gain.channelOrderValid,true);
  assert.equal(gain.bitAccurate,false);
  assert.equal(clip.clippingDetected,true);
  assert.ok(clip.leftPeak>1);
});
test('bad checksum and aborted stream never yield PCM receipt',()=>{
  for(const scenario of ['hash-mismatch','abort']){
    const result=runVirtualAudioScenario(scenario);
    assert.equal(result.ok,true);
    assert.equal(result.metrics,null);
    assert.match(result.detail,/no capture receipt/);
  }
});
test('invalid PCM block recovery is atomic and does not corrupt source digest',()=>{
  const invalid=runVirtualAudioScenario('invalid-block');
  const clean=runVirtualAudioScenario('clean');
  assert.equal(invalid.ok,true,invalid.detail);
  assert.equal(invalid.metrics.sourceSha256,clean.metrics.sourceSha256);
  assert.equal(invalid.metrics.captureSha256,clean.metrics.captureSha256);
});
test('deny arbitrary scenario names and injected command/path payloads',()=>{
  for(const scenario of ['../../hardware','billing','REAL_MASTER',null,{},0,'clean;rm -rf','clean\u0000']){
    assert.throws(()=>runVirtualAudioScenario(scenario),/Unknown fixed V5 diagnostic scenario/);
  }
});
test('runner invokes the real V5 stack but has no external commands or network API',()=>{
  const src=readFileSync(new URL('../raw-v5-diagnostics-runner-v5.mjs',import.meta.url),'utf8');
  assert.match(src,/createVirtualPcmIntegritySession/);
  assert.match(src,/assessCalibrationRoundTrip/);
  assert.match(src,/simulateVirtualLoopback/);
  assert.doesNotMatch(src,/\b(?:fetch|WebSocket|spawn|updateDoc|increment|writeFile|createWriteStream|AudioContext)\s*\(/);
});
