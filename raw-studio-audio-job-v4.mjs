/* RAW Studio Audio Job V4
 * Future studio worker input schema: data-only, immutable, fail closed.
 * This module neither plays nor records audio, talks to interfaces, handles
 * credentials, controls analog devices, nor creates a processed master.
 */
const KNOWN=Object.freeze(["bettermaker_eq","ngbuscomp","ngtubecomp"]);
const SOURCE_KEYS=new Set(["sha256","sampleRate","channels","frames","codec"]);
const INPUT_KEYS=new Set(["projectId","revision","sessionId","chainOrder","source"]);
const VALID_RATES=new Set([44100,48000,88200,96000,176400,192000]);
function reject(code,message){const error=new Error(message);error.code=code;throw error;}
function onlyKeys(obj,allowed,code){
 if(!obj||typeof obj!=="object"||Array.isArray(obj))
  reject(code,"Expected a structured object");
 for(const key of Object.keys(obj))if(!allowed.has(key))
  reject(code,"Unexpected attribute: "+key);
}
export function createAudioCaptureDraft(input){
 onlyKeys(input,INPUT_KEYS,"JOB_FIELD");
 const {projectId,revision,sessionId,chainOrder,source}=input;
 if(typeof projectId!=="string"||!/^[a-f0-9-]{20,64}$/i.test(projectId)||
    !Number.isSafeInteger(revision)||revision<1||revision>8)
  reject("JOB_PROJECT","Invalid versioned project identifier");
 if(typeof sessionId!=="string"||!/^[a-zA-Z0-9_-]{12,80}$/.test(sessionId))
  reject("JOB_SESSION","Invalid studio session identifier");
 if(!Array.isArray(chainOrder)||chainOrder.length<1||chainOrder.length>KNOWN.length||
  chainOrder.some(x=>!KNOWN.includes(x))||new Set(chainOrder).size!==chainOrder.length)
  reject("JOB_CHAIN","Invalid or duplicate analog device IDs");
 onlyKeys(source,SOURCE_KEYS,"JOB_SOURCE_FIELD");
 if(typeof source.sha256!=="string"||!/^[a-f0-9]{64}$/i.test(source.sha256)||
    !VALID_RATES.has(source.sampleRate)||source.channels!==2||
    !Number.isSafeInteger(source.frames)||source.frames<1||source.frames>192000*60*60*4||
    source.codec!=="PCM")
  reject("JOB_PCM","Audio capture draft requires verified stereo PCM metadata");
 const stages=[
  "VERIFY_SOURCE_HASH","DECODE_CHECK","AUTHORIZE_STUDIO_LEASE",
  "CERTIFIED_VENDOR_CAPABILITY_READBACK","CLOCK_LOCK_AND_LOOPBACK_CALIBRATION",
  "PLAY_TO_PHYSICAL_DAC","CAPTURE_FROM_PHYSICAL_ADC",
  "ALIGN_AND_MEASURE","VERIFY_CAPTURE_HASH","DELIVER_MASTER"
 ];
 return Object.freeze({
  version:4,jobType:"STUDIO_PCM_ANALOG_CAPTURE_DRAFT",
  projectId,revision,sessionId,
  chainOrder:Object.freeze([...chainOrder]),
  source:Object.freeze({...source}),
  stages:Object.freeze(stages),
  state:"WAITING_FOR_AUTHORIZED_AUDIO_WORKER",
  simulated:false,transportAllowed:false,hardwareCommandsAllowed:false,
  analogCaptured:false,masterAvailable:false,
  // A real worker/Gateway must independently validate each stage and
  // explicitly attest the physical I/O. Renderer data cannot enable it.
  hardwareAttestation:null,captureManifest:null
 });
}
export const AUDIO_JOB_SUPPORTED_RATES=Object.freeze([...VALID_RATES]);
