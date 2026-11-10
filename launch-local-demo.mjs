// SAFE cross-platform RAW LOCAL TEST launcher.
// Launch Electron directly, not 'npm start' (which also defaults to this guard).
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const electron=require("electron");
const child=spawn(electron,["."],{
 env:{...process.env,RAW_TEST_MODE: "1"},
 stdio:"inherit",shell:false
});
child.on("exit",code=>{process.exitCode=code??1;});
child.on("error",error=>{console.error(error);process.exitCode=1;});
