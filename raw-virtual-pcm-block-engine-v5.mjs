/* RAW V5.1 — bounded stereo PCM block stream with isolated virtual loopback.
 * This module NEVER opens audio devices, creates a master, sends network commands,
 * bills a user or claims that any physical signal was measured. */
export const PCM_BLOCK_LIMITS_V5 = Object.freeze({
  sampleRates: Object.freeze([44100, 48000, 88200, 96000]),
  maxBlockFrames: 8192,
  maxLatencyFrames: 4096,
  maxSessionSeconds: 4 * 60 * 60
});
const PROVENANCE = Object.freeze({
  simulationOnly: true, physicalReadback: false, hardwareProcessed: false,
  analogCaptured: false, masterAvailable: false, transportAllowed: false
});
function record(value, name, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(name + ' must be an object');
  for (const key of Object.keys(value))
    if (!keys.includes(key)) throw new TypeError('Unknown ' + name + ' field: ' + key);
}
function integer(value, min, max, name) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new RangeError(name + ' out of range');
  return value;
}
function validRate(rate) {
  if (!PCM_BLOCK_LIMITS_V5.sampleRates.includes(rate))
    throw new RangeError('Unsupported PCM sample rate');
  return rate;
}
function validChannels(channels, maxFrames) {
  if (!Array.isArray(channels) || channels.length !== 2 ||
      !channels.every(ch => ch instanceof Float32Array))
    throw new TypeError('Exactly two Float32Array channels required');
  const frames = channels[0].length;
  integer(frames, 1, maxFrames, 'PCM block frames');
  if (channels[1].length !== frames) throw new RangeError('L/R frame count mismatch');
  // Validate the ENTIRE block before modifying stream state (reject is atomic).
  for (const channel of channels) for (const sample of channel) {
    if (!Number.isFinite(sample)) throw new RangeError('Non-finite PCM sample');
    if (Math.abs(sample) > 16) throw new RangeError('PCM sample amplitude out of range');
  }
  return frames;
}
function inputPacket(packet, rate, maxFrames) {
  record(packet, 'PCM block', ['sequence', 'startFrame', 'sampleRate', 'channels']);
  integer(packet.sequence, 0, Number.MAX_SAFE_INTEGER, 'PCM sequence');
  integer(packet.startFrame, 0, Number.MAX_SAFE_INTEGER, 'PCM startFrame');
  if (packet.sampleRate !== rate) throw new RangeError('PCM sample rate changed mid-stream');
  return validChannels(packet.channels, maxFrames);
}
function outputPacket(sequence, startFrame, sampleRate, channels) {
  return {
    kind: 'RAW_VIRTUAL_PCM_BLOCK_V5', mode: 'SIMULATION_ONLY',
    sequence, startFrame, frameCount: channels[0].length, sampleRate, channels,
    provenance: PROVENANCE
  };
}
export function createVirtualPcmBlockEngine(options = {}) {
  record(options, 'PCM engine options',
    ['sampleRate', 'blockFrames', 'latencyFrames', 'channelMap', 'gain', 'dcOffset']);
  const sampleRate = validRate(options.sampleRate ?? 48000);
  const blockFrames = integer(options.blockFrames ?? 1024, 1,
    PCM_BLOCK_LIMITS_V5.maxBlockFrames, 'blockFrames');
  const latencyFrames = integer(options.latencyFrames ?? 0, 0,
    PCM_BLOCK_LIMITS_V5.maxLatencyFrames, 'latencyFrames');
  const channelMap = options.channelMap ?? [0, 1];
  const gain = options.gain ?? [1, 1];
  const dcOffset = options.dcOffset ?? [0, 0];
  if (!Array.isArray(channelMap) || channelMap.length !== 2 ||
      !(channelMap[0] === 0 && channelMap[1] === 1 ||
        channelMap[0] === 1 && channelMap[1] === 0))
    throw new RangeError('Invalid stereo channelMap');
  if (!Array.isArray(gain) || gain.length !== 2 ||
      gain.some(v => !Number.isFinite(v) || v < 0 || v > 4))
    throw new RangeError('Invalid gain');
  if (!Array.isArray(dcOffset) || dcOffset.length !== 2 ||
      dcOffset.some(v => !Number.isFinite(v) || Math.abs(v) > 0.25))
    throw new RangeError('Invalid dcOffset');
  // Copy configuration so the caller cannot mutate the live mapping.
  const map = [...channelMap], gains = [...gain], offsets = [...dcOffset];
  const maxSessionFrames = sampleRate * PCM_BLOCK_LIMITS_V5.maxSessionSeconds;
  const ring = latencyFrames ? [new Float32Array(latencyFrames),
                               new Float32Array(latencyFrames)] : null;
  let ringHead = 0, nextInputSequence = 0, nextOutputSequence = 0;
  let inputFrames = 0, outputFrames = 0, finished = false;
  function ensureOpen() {
    if (finished) throw new Error('PCM stream is already finished');
  }
  function push(packet) {
    ensureOpen();
    const frames = inputPacket(packet, sampleRate, blockFrames);
    if (packet.sequence !== nextInputSequence || packet.startFrame !== inputFrames)
      throw new RangeError('Out-of-order or repeated PCM block');
    if (inputFrames + frames > maxSessionFrames)
      throw new RangeError('PCM session length exceeded');
    const result = [new Float32Array(frames), new Float32Array(frames)];
    for (let i = 0; i < frames; i++) {
      for (let ch = 0; ch < 2; ch++) {
        const injected = packet.channels[map[ch]][i] * gains[ch] + offsets[ch];
        // No clipping is applied: clipping and overs are reported honestly.
        if (ring) {
          result[ch][i] = ring[ch][ringHead];
          ring[ch][ringHead] = injected;
        } else result[ch][i] = injected;
      }
      if (ring) ringHead = (ringHead + 1) % latencyFrames;
    }
    const output = outputPacket(nextOutputSequence++, outputFrames, sampleRate, result);
    nextInputSequence++; inputFrames += frames; outputFrames += frames;
    return output;
  }
  function finish() {
    ensureOpen();
    if (inputFrames === 0) throw new Error('PCM stream has no input');
    const tail = [];
    let left = latencyFrames;
    while (left > 0) {
      const frames = Math.min(blockFrames, left);
      const channels = [new Float32Array(frames), new Float32Array(frames)];
      for (let i = 0; i < frames; i++) {
        for (let ch = 0; ch < 2; ch++) channels[ch][i] = ring[ch][ringHead];
        ringHead = (ringHead + 1) % latencyFrames;
      }
      tail.push(outputPacket(nextOutputSequence++, outputFrames, sampleRate, channels));
      outputFrames += frames; left -= frames;
    }
    finished = true;
    return tail;
  }
  function state() {
    return Object.freeze({mode:'SIMULATION_ONLY',sampleRate,blockFrames,latencyFrames,
      inputFrames,outputFrames,nextInputSequence,nextOutputSequence,finished,
      analogVerified:false,masterAvailable:false});
  }
  return Object.freeze({push,finish,state});
}
export function createPcmBlockMeter({sampleRate=48000} = {}) {
  validRate(sampleRate);
  let sequence = 0, nextFrame = 0;
  const peak = [0, 0], sum = [0, 0], energy = [0, 0], clipped = [0, 0];
  function add(block) {
    record(block, 'virtual PCM output', ['kind','mode','sequence','startFrame',
      'frameCount','sampleRate','channels','provenance']);
    if (block.kind !== 'RAW_VIRTUAL_PCM_BLOCK_V5' || block.mode !== 'SIMULATION_ONLY' ||
        block.provenance !== PROVENANCE || block.sampleRate !== sampleRate)
      throw new TypeError('Untrusted or incompatible virtual PCM block');
    const frames = validChannels(block.channels, PCM_BLOCK_LIMITS_V5.maxBlockFrames);
    if (frames !== block.frameCount || block.sequence !== sequence ||
        block.startFrame !== nextFrame) throw new RangeError('Non-contiguous PCM output');
    for (let ch = 0; ch < 2; ch++) for (const sample of block.channels[ch]) {
      const abs = Math.abs(sample);
      peak[ch] = Math.max(peak[ch], abs);
      energy[ch] += sample * sample;
      sum[ch] += sample;
      if (abs >= 1) clipped[ch]++;
    }
    sequence++; nextFrame += frames;
  }
  function snapshot() {
    const channels = [0, 1].map(ch => {
      const rms = nextFrame ? Math.sqrt(energy[ch] / nextFrame) : 0;
      return Object.freeze({peak:peak[ch],peakDbfs:peak[ch] ? 20*Math.log10(peak[ch]) : null,
        rms,rmsDbfs:rms ? 20*Math.log10(rms) : null,
        dcOffset:nextFrame ? sum[ch]/nextFrame : 0,clippedFrames:clipped[ch]});
    });
    return Object.freeze({kind:'RAW_VIRTUAL_PCM_METER_V5',sampleRate,frames:nextFrame,
      blocks:sequence,channels:Object.freeze(channels),simulationOnly:true,
      physicalReadback:false,analogVerified:false,masterAvailable:false});
  }
  return Object.freeze({add,snapshot});
}
