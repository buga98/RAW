/* V5.36 — offline audio calibration file preparation and WAV assessment.
 * No audio playback/capture hardware, no DAW launch, Firebase/Stripe or device
 * commands. Operator must export a separate DAW capture and select its path.
 */
import {readFileSync,writeFileSync,mkdirSync,statSync} from "node:fs";
import {resolve,join,basename} from "node:path";
import {fileURLToPath} from "node:url";
import {createCalibrationWavV536,assessExternalCaptureV536} from "../raw-v536-external-capture.mjs";
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const cmd=process.argv[2];
if(cmd==="prepare"){
 const dir=join(root,"calibration-output-v536");
 mkdirSync(dir,{recursive:true});
 const name=join(dir,"RAW_V536_STEREO_CALIBRATION_48K_24BIT.wav");
 const fixture=createCalibrationWavV536();
 writeFileSync(name,fixture.wav,{flag:"wx",mode:0o600});
 console.log("RAW V5.36 CALIBRATION SOURCE GENERATED (NOT A MASTER)");
 console.log("File: "+name);
 console.log("Audio: stereo, 48kHz, 24-bit, six seconds, -20 dBFS peak markers.");
 console.log("SOURCE SHA-256: "+fixture.sha256);
 console.log("Keep studio MONITORS LOW/MUTED; never play at performance volume.");
 console.log("Import this WAV into DAW; record return to a NEW stereo WAV.");
 console.log("Do not trim the start; export from time zero at 48kHz PCM16/24/float32.");
 console.log("This operation did NOT send audio to a physical interface.");
}else if(cmd==="analyze"){
 if(process.argv.length!==4)throw Error("Usage: npm run studio:calibration:v536:analyze -- \"C:\\path\\recorded.wav\"");
 const path=resolve(process.argv[3]);
 if(!/\.wav$/i.test(path)||statSync(path).size>64*1024*1024)
  throw Error("Expected <=64MiB .wav capture");
 const result=assessExternalCaptureV536(readFileSync(path));
 console.log("RAW V5.36 EXTERNAL FILE QA — NOT VERIFIED ANALOG / NO BILLING");
 console.log("Capture file: "+basename(path));
 console.log(JSON.stringify(result,null,2));
 if(result.channelOrder==="UNCONFIRMED"||result.clippingDetected){
  console.error("QA REVIEW REQUIRED: markers missing/ambiguous or clipping found");
  process.exitCode=2;
 }
}else {
 console.error("Usage: npm run studio:calibration:v536:prepare");
 console.error('       npm run studio:calibration:v536:analyze -- "C:\\path\\recorded.wav"');
 process.exitCode=1;
}
