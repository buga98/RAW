/* RAW V5.3 — fixed, local-only PCM diagnostic scenarios.
 * Uses the real V5/V5.1/V5.2 modules. Simulated results are NOT analog proof. */
import {createCalibrationFixture,simulateVirtualLoopback,assessCalibrationRoundTrip} from './raw-virtual-audio-loopback-v5.mjs';
import {createVirtualPcmIntegritySession} from './raw-virtual-pcm-integrity-v5.mjs';

export const V5_DIAGNOSTIC_SCENARIOS=Object.freeze([
  'clean','latency','swap','gain','clip','hash-mismatch','abort','invalid-block'
]);
const CONFIG=Object.freeze({
  clean:Object.freeze({}),
  latency:Object.freeze({latencyFrames:256}),
  swap:Object.freeze({channelMap:[1,0]}),
  gain:Object.freeze({gain:[1.25,1]}),
  clip:Object.freeze({gain:[2,2]})
});
const LABELS=Object.freeze({
  clean:'Clean stereo PCM',latency:'Latency +256 frames',
  swap:'L/R swap detection',gain:'Gain error detection',
  clip:'Clipping detection','hash-mismatch':'SHA-256 mismatch blocked',
  abort:'Abort prevents completion','invalid-block':'Invalid block rejected + retry'
});
function check(condition,detail){
  if(!condition)throw new Error(detail);
}
function block(source,sequence) {
  const startFrame=sequence*128;
  return {sequence,startFrame,sampleRate:source.sampleRate,
    channels:source.channels.map(ch=>ch.subarray(startFrame,startFrame+128))};
}
function fullIntegrity(source,config) {
  const session=createVirtualPcmIntegritySession({blockFrames:128,...config});
  for(let seq=0;seq<source.channels[0].length/128;seq++)
    session.push(block(source,seq));
  return session.finish();
}
function limitedMetrics(receipt,roundTrip){
  const c=receipt?.meter?.channels||[];
  return {
    latencyFrames:roundTrip?.latencyFrames??null,
    latencyMs:roundTrip?.latencyMs??null,
    channelOrderValid:roundTrip?.channelOrderValid??null,
    bitAccurate:roundTrip?.bitAccurate??null,
    clippingDetected:roundTrip?.clippingDetected??null,
    inputFrames:receipt?.inputFrames??null,
    captureFrames:receipt?.capturedFrames??null,
    leftPeak:c[0]?.peak??null,rightPeak:c[1]?.peak??null,
    leftRmsDbfs:c[0]?.rmsDbfs??null,rightRmsDbfs:c[1]?.rmsDbfs??null,
    sourceSha256:receipt?.sourceSha256??null,captureSha256:receipt?.captureSha256??null
  };
}
export function runVirtualAudioScenario(scenario){
  if(typeof scenario!=='string'||!V5_DIAGNOSTIC_SCENARIOS.includes(scenario))
    throw new TypeError('Unknown fixed V5 diagnostic scenario');
  const result={kind:'RAW_V5_DIAGNOSTIC_RESULT',scenario,label:LABELS[scenario],
    simulationOnly:true,analogVerified:false,hardwareControlled:false,
    masterAvailable:false,ok:false,detail:'',metrics:null};
  try{
    const source=createCalibrationFixture({sampleRate:48000,frames:4096});
    if(scenario==='hash-mismatch'){
      const session=createVirtualPcmIntegritySession({
        blockFrames:128,expectedSourceSha256:'0'.repeat(64)});
      for(let seq=0;seq<32;seq++)session.push(block(source,seq));
      let rejected=false;
      try{session.finish();}catch(err){rejected=/SHA-256 mismatch/.test(String(err.message));}
      check(rejected&&session.snapshot().status==='REJECTED'&&
        session.snapshot().receiptAvailable===false,'Mismatch produced a false receipt');
      result.detail='EXPECTED REJECTION · SHA-256 mismatch · no capture receipt';
    }else if(scenario==='abort'){
      const session=createVirtualPcmIntegritySession({blockFrames:128});
      session.push(block(source,0));
      check(session.abort()===true,'Abort did not complete');
      let finishRejected=false;
      try{session.finish();}catch(err){finishRejected=/ABORTED/.test(String(err.message));}
      check(finishRejected&&session.snapshot().status==='ABORTED'&&
        session.snapshot().receiptAvailable===false,'Aborted capture became successful');
      result.detail='EXPECTED REJECTION · ABORTED · no capture receipt';
    }else{
      const options=CONFIG[scenario]||{};
      const session=createVirtualPcmIntegritySession({blockFrames:128,...options});
      if(scenario==='invalid-block'){
        const bad=block(source,0);
        bad.channels[0]=Float32Array.from(bad.channels[0]);
        bad.channels[0][0]=NaN;
        let rejected=false;
        try{session.push(bad);}catch(err){rejected=/Non-finite/.test(String(err.message));}
        check(rejected&&session.snapshot().inputFrames===0,'Bad block was not rejected atomically');
        result.detail='EXPECTED REJECTION · NaN blocked; valid retry recovered';
      }
      for(let seq=0;seq<32;seq++)session.push(block(source,seq));
      const receipt=session.finish();
      // Independent whole-buffer comparison verifies channel mapping/latency.
      const roundTrip=assessCalibrationRoundTrip(source,
        simulateVirtualLoopback({source,...options}));
      check(receipt.status==='COMPLETE_SIMULATION_ONLY'&&
        receipt.provenance.analogCaptured===false,'Invalid provenance or capture receipt');
      result.metrics=limitedMetrics(receipt,roundTrip);
      if(scenario==='clean'||scenario==='invalid-block'){
        check(roundTrip.bitAccurate===true&&roundTrip.latencyFrames===0&&
          receipt.sourceSha256===receipt.captureSha256,'Unmodified virtual PCM differs');
        if(scenario==='clean')result.detail='PASS · exact stereo PCM; original equals capture';
      }else if(scenario==='latency'){
        check(roundTrip.bitAccurate===true&&roundTrip.latencyFrames===256&&
          receipt.capturedFrames===4352&&receipt.sourceSha256!==receipt.captureSha256,
          'Virtual latency was not accounted for');
        result.detail='PASS · exact 256-frame latency detected, tail preserved';
      }else if(scenario==='swap'){
        check(roundTrip.channelOrderValid===false&&roundTrip.bitAccurate===false&&
          receipt.sourceSha256!==receipt.captureSha256,'L/R swap not detected');
        result.detail='EXPECTED FAULT · L/R channels reversed and detected';
      }else if(scenario==='gain'){
        check(roundTrip.channelOrderValid===true&&roundTrip.bitAccurate===false&&
          receipt.sourceSha256!==receipt.captureSha256,'Gain mismatch not detected');
        result.detail='EXPECTED FAULT · gain changed PCM fingerprint';
      }else if(scenario==='clip'){
        check(roundTrip.clippingDetected===true&&
          receipt.meter.channels.some(ch=>ch.clippedFrames>0)&&
          receipt.sourceSha256!==receipt.captureSha256,'Clipping not detected');
        result.detail='EXPECTED FAULT · virtual overload correctly flagged';
      }
    }
    result.ok=true;
  }catch(err){
    result.detail='FAILED · '+String(err?.message||'unknown diagnostic failure').slice(0,140);
  }
  return Object.freeze(result);
}
