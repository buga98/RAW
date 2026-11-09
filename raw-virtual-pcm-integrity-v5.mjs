/* RAW V5.2 — deterministic PCM integrity receipts for an offline virtual stream.
 * No file export, physical capture, network, payment or hardware operations. */
import {createHash} from 'node:crypto';
import {createVirtualPcmBlockEngine,createPcmBlockMeter} from './raw-virtual-pcm-block-engine-v5.mjs';

const SHA256=/^[a-fA-F0-9]{64}$/;
const VIRTUAL_PROVENANCE=Object.freeze({
  simulationOnly:true,physicalReadback:false,hardwareProcessed:false,
  analogCaptured:false,masterAvailable:false,transportAllowed:false
});
function assertOptions(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))
    throw new TypeError('Capture options must be a plain configuration object');
  const allowed=['sampleRate','blockFrames','latencyFrames','channelMap','gain','dcOffset','expectedSourceSha256'];
  for(const key of Object.keys(value))
    if(!allowed.includes(key))throw new TypeError('Unknown capture option: '+key);
}
function pcmSha256(sampleRate) {
  // Canonical stereo PCM hash: tag + sampleRate + interleaved little-endian
  // Float32 frames + final unsigned 64-bit frame count, independent of chunks.
  const sha=createHash('sha256');
  const header=Buffer.alloc(12);
  header.write('RAW5PCM\0',0,'ascii');
  header.writeUInt32LE(sampleRate,8);
  sha.update(header);
  let frames=0;
  return {
    add(channels) {
      const count=channels[0].length;
      const data=Buffer.allocUnsafe(count*8);
      for(let i=0;i<count;i++) {
        data.writeFloatLE(channels[0][i],i*8);
        data.writeFloatLE(channels[1][i],i*8+4);
      }
      sha.update(data);
      frames+=count;
    },
    finish() {
      const trailer=Buffer.alloc(8);
      trailer.writeBigUInt64LE(BigInt(frames));
      sha.update(trailer);
      return sha.digest('hex');
    }
  };
}
export function createVirtualPcmIntegritySession(options={}) {
  assertOptions(options);
  const expected=options.expectedSourceSha256;
  if(expected!==undefined&&(typeof expected!=='string'||!SHA256.test(expected)))
    throw new TypeError('expectedSourceSha256 must be 64 hexadecimal characters');
  const {expectedSourceSha256,...engineOptions}=options;
  const engine=createVirtualPcmBlockEngine(engineOptions);
  const sampleRate=engine.state().sampleRate;
  const meter=createPcmBlockMeter({sampleRate});
  const sourceDigest=pcmSha256(sampleRate),captureDigest=pcmSha256(sampleRate);
  let status='OPEN',completedReceipt=null;
  function guard() {
    if(status!=='OPEN')throw new Error('PCM integrity session is '+status);
  }
  function writeOutput(output) {
    meter.add(output);
    captureDigest.add(output.channels);
  }
  function push(packet) {
    guard();
    // Engine validates block, order and all samples before changing its cursor.
    const output=engine.push(packet);
    sourceDigest.add(packet.channels);
    writeOutput(output);
    return Object.freeze({sequence:output.sequence,startFrame:output.startFrame,
      frameCount:output.frameCount,mode:'SIMULATION_ONLY'});
  }
  function finish() {
    guard();
    try {
      const tail=engine.finish();
      for(const output of tail)writeOutput(output);
      const sourceSha256=sourceDigest.finish();
      const captureSha256=captureDigest.finish();
      if(expected!==undefined&&sourceSha256!==expected.toLowerCase())
        throw new Error('Source SHA-256 mismatch: virtual capture rejected');
      const state=engine.state();
      status='COMPLETE_SIMULATION_ONLY';
      completedReceipt=Object.freeze({
        kind:'RAW_VIRTUAL_PCM_INTEGRITY_V5',status,
        sampleRate,inputFrames:state.inputFrames,capturedFrames:state.outputFrames,
        sourceSha256,captureSha256,meter:meter.snapshot(),
        provenance:VIRTUAL_PROVENANCE
      });
      return completedReceipt;
    } catch(error) {
      status='REJECTED';
      throw error;
    }
  }
  function abort() {
    if(status==='ABORTED')return false;
    guard();
    status='ABORTED';
    return true;
  }
  function snapshot() {
    const state=engine.state();
    return Object.freeze({status,inputFrames:state.inputFrames,
      capturedFrames:state.outputFrames,sampleRate,receiptAvailable:completedReceipt!==null,
      simulationOnly:true,analogVerified:false,masterAvailable:false});
  }
  return Object.freeze({push,finish,abort,snapshot});
}
