// V5.62 strict offline import of individual V5.61 probe files.
import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {buildExactMidi14} from "./raw-v562-exact-midi14-core.mjs";
const a=process.argv.slice(2),get=k=>{const i=a.indexOf(k);return i<0?null:a[i+1]};
try{
 const capture=get("--capture"),calibration=get("--calibration"),out=get("--out");
 const at=a.indexOf("--evidence"),end=a.findIndex((x,i)=>i>at&&x.startsWith("--"));
 const files=at<0?[]:a.slice(at+1,end<0?undefined:end);
 if(!capture||!calibration||!out||!files.length)throw Error("Usage: --capture V553.json --calibration V557.json --evidence first.json second.json --out exact.json");
 const load=p=>JSON.parse(readFileSync(resolve(p),"utf8"));
 const database=buildExactMidi14(load(capture),load(calibration),files.map(load));
 writeFileSync(resolve(out),JSON.stringify({...database,evidencePaths:files.map(x=>resolve(x))},null,2)+"\n");
 console.log("V562 IMPORT:",JSON.stringify(database.metrics));
 for(const row of database.entries)console.log("VERIFIED",row.label,row.display,"raw14",row.raw14);
 for(const row of database.rejected)console.log("REJECTED",row.label,row.display,row.reason);
 console.log("V562 OUTPUT:",resolve(out));
 if(database.metrics.acceptedEntries===0||database.metrics.rejectedEvidence>0)process.exitCode=2;
}catch(e){console.error("V562 STOP:",e.message);process.exitCode=1}
