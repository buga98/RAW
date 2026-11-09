import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCalibrationFixture, analyzeStereoPcm, simulateVirtualLoopback,assessCalibrationRoundTrip} from '../raw-virtual-audio-loopback-v5.mjs';

test('48000 Hz stereo calibration returns exact offset and no fake hardware proof',()=>{
  const source=createCalibrationFixture(),capture=simulateVirtualLoopback({source,latencyFrames:256});
  const report=assessCalibrationRoundTrip(source,capture);
  assert.equal(report.latencyFrames,256);
  assert.equal(report.latencyMs,256/48);
  assert.equal(report.channelOrderValid,true);
  assert.equal(report.bitAccurate,true);
  assert.equal(report.clippingDetected,false);
  assert.equal(capture.provenance.analogCaptured,false);
  assert.equal(capture.provenance.masterAvailable,false);
  assert.equal(capture.provenance.transportAllowed,false);
});
test('swap L/R triggers channel order failure rather than false pass',()=>{
  const source=createCalibrationFixture();
  const capture=simulateVirtualLoopback({source,latencyFrames:128,channelMap:[1,0]});
  const report=assessCalibrationRoundTrip(source,capture);
  assert.equal(report.channelOrderValid,false);
  assert.equal(report.bitAccurate,false);
  assert.equal(report.latencyFrames,null);
});
test('mutated gain is detected even if latency is correct',()=>{
  const source=createCalibrationFixture();
  const capture=simulateVirtualLoopback({source,latencyFrames:64,gain:[1.1,1]});
  const report=assessCalibrationRoundTrip(source,capture);
  assert.equal(report.channelOrderValid,true);
  assert.equal(report.bitAccurate,false);
  assert.ok(report.mismatchSamples>=1);
});
test('overload causes clipping flag; analysis reports DC for nonzero signal',()=>{
  const source=createCalibrationFixture();
  const capture=simulateVirtualLoopback({source,latencyFrames:0,gain:[2,2],dcOffset:[0.05,0]});
  const report=assessCalibrationRoundTrip(source,capture);
  assert.equal(report.clippingDetected,true);
  const stats=analyzeStereoPcm({sampleRate:48000,channels:capture.capture});
  assert.equal(stats.channels[0].clippedFrames,1);
  assert.ok(stats.channels[0].dcOffset>0.05);
});
test('reject NaN, asymmetric channels, unsupported rates and absurd latency',()=>{
  const source=createCalibrationFixture();
  source.channels[0][0]=NaN;
  assert.throws(()=>simulateVirtualLoopback({source}),/non-finite/);
  source.channels[0][0]=0;
  assert.throws(()=>simulateVirtualLoopback({source,latencyFrames:4097}),/Latency/);
  assert.throws(()=>simulateVirtualLoopback({source,channelMap:[0,0]}),/channel map/);
  assert.throws(()=>simulateVirtualLoopback({source,gain:[Infinity,1]}),/gain/);
  assert.throws(()=>simulateVirtualLoopback({source,dcOffset:[0.3,0]}),/DC offset/);
  assert.throws(()=>createCalibrationFixture({sampleRate:12345}),/sample rate/);
  assert.throws(()=>analyzeStereoPcm({sampleRate:48000,channels:[new Float32Array(300),new Float32Array(310)]}),/differ in length/);
});
test('module has no physical I/O, network, filesystem, billing or real master capabilities',()=>{
  const code=readFileSync(new URL('../raw-virtual-audio-loopback-v5.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(code,/\bimport\s*\(|\bfetch\s*\(|\bWebSocket\s*\(|\bspawn\s*\(|\bupdateDoc\s*\(|\bincrement\s*\(/);
  assert.match(code,/SIMULATION_ONLY/);
  assert.match(code,/analogCaptured:false,masterAvailable:false,transportAllowed:false/);
});
