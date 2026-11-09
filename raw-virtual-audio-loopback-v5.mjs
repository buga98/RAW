/* RAW V5 — deterministic offline calibration loopback.
 * It uses only in-memory Float32 PCM. NO DAC, ADC, filesystem, socket,
 * live hardware command, processing proof or master file is involved. */
const SUPPORTED_SAMPLE_RATES = new Set([44100, 48000, 88200, 96000]);
const MAX_FRAMES = 480000;
const MAX_LATENCY_FRAMES = 4096;
const MAX_DC_OFFSET = 0.25;
function requireKeys(object,allowed,label) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) throw new TypeError(label+' must be an object');
  for (const key of Object.keys(object)) if (!allowed.includes(key)) throw new TypeError('Unsupported '+label+' field: '+key);
}
function integer(value,min,max,label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(label+' out of range');
  return value;
}
function validateSource(source) {
  requireKeys(source,['sampleRate','channels','markerFrames','kind'], 'PCM source');
  if (!SUPPORTED_SAMPLE_RATES.has(source.sampleRate)) throw new RangeError('Unsupported sample rate');
  if (!Array.isArray(source.channels) || source.channels.length !== 2 ||
      !source.channels.every(channel=>channel instanceof Float32Array)) throw new TypeError('Two Float32 PCM channels required');
  const frames = source.channels[0].length;
  integer(frames,256,MAX_FRAMES,'PCM frame count');
  if (source.channels[1].length !== frames) throw new RangeError('Stereo channels differ in length');
  for (const channel of source.channels) for (const sample of channel) {
    if (!Number.isFinite(sample)) throw new RangeError('PCM contains non-finite sample');
  }
  return frames;
}
export function createCalibrationFixture({sampleRate=48000,frames=4096}={}) {
  if (!SUPPORTED_SAMPLE_RATES.has(sampleRate)) throw new RangeError('Unsupported sample rate');
  integer(frames,256,MAX_FRAMES,'PCM frame count');
  const markerFrames=[64,192];
  const left=new Float32Array(frames),right=new Float32Array(frames);
  left[markerFrames[0]]=0.875;
  right[markerFrames[1]]=-0.625;
  return {kind:'RAW_CALIBRATION_PCM_V5',sampleRate,channels:[left,right],markerFrames};
}
export function analyzeStereoPcm(source) {
  const frames=validateSource(source);
  return {sampleRate:source.sampleRate,frames,channels:source.channels.map(channel=>{
    let peak=0,energy=0,sum=0,clipped=0;
    for (const sample of channel) {
      const abs=Math.abs(sample);
      if (abs>peak) peak=abs;
      if (abs>=1)clipped++;
      energy+=sample*sample;sum+=sample;
    }
    const rms=Math.sqrt(energy/frames);
    return {peak,peakDbfs:peak?20*Math.log10(peak):null,rms,
      rmsDbfs:rms?20*Math.log10(rms):null,dcOffset:sum/frames,clippedFrames:clipped};
  })};
}
export function simulateVirtualLoopback({source,latencyFrames=0,channelMap=[0,1],gain=[1,1],dcOffset=[0,0]}={}) {
  // Test-only fault injection. Deliberately NOT an arbitrary audio adapter.
  const frames=validateSource(source);
  integer(latencyFrames,0,MAX_LATENCY_FRAMES,'Latency');
  if (!Array.isArray(channelMap) || channelMap.length!==2 ||
    ![0,1].every(index=>channelMap.includes(index))) throw new TypeError('Invalid stereo channel map');
  if (!Array.isArray(gain)||gain.length!==2||gain.some(x=>!Number.isFinite(x)||x<0||x>4))throw new RangeError('Invalid channel gain');
  if (!Array.isArray(dcOffset)||dcOffset.length!==2||dcOffset.some(x=>!Number.isFinite(x)||Math.abs(x)>MAX_DC_OFFSET))throw new RangeError('Invalid DC offset');
  const capture=[new Float32Array(frames+latencyFrames),new Float32Array(frames+latencyFrames)];
  for(let channel=0;channel<2;channel++) {
    const input=source.channels[channelMap[channel]];
    for(let frame=0;frame<frames;frame++)capture[channel][frame+latencyFrames]=input[frame]*gain[channel]+dcOffset[channel];
  }
  return {kind:'RAW_VIRTUAL_LOOPBACK_V5',mode:'SIMULATION_ONLY',sampleRate:source.sampleRate,
    inputFrames:frames,capturedFrames:frames+latencyFrames,capture,
    provenance:Object.freeze({virtual:true,physicalReadback:false,hardwareProcessed:false,
      analogCaptured:false,masterAvailable:false,transportAllowed:false})};
}
function maxMarker(channel) {
  let peak=0,at=-1;
  for(let frame=0;frame<channel.length;frame++) {
    const amplitude=Math.abs(channel[frame]);
    if(amplitude>peak) {peak=amplitude;at=frame;}
  }
  return {peak,at};
}
export function assessCalibrationRoundTrip(source,loopback) {
  validateSource(source);
  if(source.kind!=='RAW_CALIBRATION_PCM_V5'||!Array.isArray(source.markerFrames)||
      source.markerFrames.length!==2) throw new TypeError('Only calibration fixtures can certify this test');
  requireKeys(loopback,['kind','mode','sampleRate','inputFrames','capturedFrames','capture','provenance'],'loopback');
  if(loopback.kind!=='RAW_VIRTUAL_LOOPBACK_V5'||loopback.mode!=='SIMULATION_ONLY'||
    loopback.sampleRate!==source.sampleRate||loopback.inputFrames!==source.channels[0].length||
    !Array.isArray(loopback.capture)||loopback.capture.length!==2||
    !loopback.capture.every(c=>c instanceof Float32Array&&c.length===loopback.capturedFrames))
    throw new TypeError('Incompatible virtual loopback');
  const markers=loopback.capture.map(maxMarker);
  const delays=markers.map((marker,ch)=>marker.at-source.markerFrames[ch]);
  const latencyConfirmed=delays[0]===delays[1] &&
    delays[0]>=0 && delays[0]<=MAX_LATENCY_FRAMES &&
    markers[0].peak>0.1 && markers[1].peak>0.1;
  const latencyFrames=latencyConfirmed?delays[0]:null;
  let mismatchSamples=0;
  if(latencyConfirmed) for(let ch=0;ch<2;ch++)for(let frame=0;frame<source.channels[ch].length;frame++) {
    if(Math.abs(loopback.capture[ch][frame+latencyFrames]-source.channels[ch][frame])>1e-6) mismatchSamples++;
  }
  const metrics=analyzeStereoPcm({sampleRate:loopback.sampleRate,channels:loopback.capture});
  return {kind:'RAW_VIRTUAL_LOOPBACK_QA_V5',simulationOnly:true,
    latencyFrames,latencyMs:latencyConfirmed?1000*latencyFrames/source.sampleRate:null,
    channelOrderValid:latencyConfirmed,
    mismatchSamples:latencyConfirmed?mismatchSamples:null,
    bitAccurate:latencyConfirmed&&mismatchSamples===0,
    clippingDetected:metrics.channels.some(c=>c.clippedFrames>0),
    dcOffset:metrics.channels.map(c=>c.dcOffset),
    analogVerified:false,masterAvailable:false};
}
