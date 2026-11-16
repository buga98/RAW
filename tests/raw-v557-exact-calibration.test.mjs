import test from "node:test";
import assert from "node:assert/strict";
import {buildCalibration,lookupExact} from "../scripts/raw-v557-exact-calibration.mjs";
function capture(){
 return {version:"V5.53",count:86,entries:Array.from({length:86},(_,i)=>({slot:i+1,objectTitle:"Mastering Equalizer",actual:i===0?"EQ2 L bandwidth":"SLOT "+(i+1)}))};
}
function logData(readings){
 const events=[{event:"title",objectTitle:"Mastering Equalizer",parameterTitle:"EQ2 L bandwidth"}];
 for(const [normalized,display] of readings){
  events.push({event:"normalized",normalized},{event:"display",display});
 }
 return events.map((r,i)=>JSON.stringify({timestamp:new Date(1763290000000+i*50).toISOString(),plugin:"Mastering Equalizer",hostSlot:1,label:"EQ2 L bandwidth",hostTitle:"EQ2 L bandwidth",readbackVerified:true,...r})).join("\n");
}
test("V557 creates observed-only exact lookup, preserves discrete labels",()=>{
 const cal=buildCalibration(capture(),[logData([[0,"WIDE"],[28/255,"Q = 4.8"],[30/255,"SHARP"]])]);
 assert.equal(cal.totals.verifiedPositions,3);
 assert.equal(lookupExact(cal,"EQ2 L bandwidth","Q = 4.8").position,28);
 assert.equal(lookupExact(cal,"EQ2 L bandwidth","SHARP").status,"REQUIRES_LIVE_ROUNDTRIP");
 assert.throws(()=>lookupExact(cal,"EQ2 L bandwidth","Q = 4.5"),/DISPLAY_NOT_OBSERVED/);
});
test("V557 quarantines multiple different displays at same normalized position",()=>{
 const cal=buildCalibration(capture(),[logData([[28/255,"Q = 4.8"],[28/255,"SHARP"]])]);
 assert.equal(cal.totals.conflictPositions,1);
 assert.equal(cal.totals.verifiedPositions,0);
 assert.throws(()=>lookupExact(cal,"EQ2 L bandwidth","Q = 4.8"),/DISPLAY_NOT_OBSERVED/);
});
test("V557 refuses wrong plugin or missing title authorization",()=>{
 const txt=logData([[0.1,"Q = 1.3"]]);
 assert.throws(()=>buildCalibration({version:"V5.53",count:1,entries:[]},[txt]),/FULL_V553_CAPTURE_REQUIRED/);
 const bad=txt.replaceAll('"plugin":"Mastering Equalizer"','"plugin":"Other"');
 assert.equal(buildCalibration(capture(),[bad]).totals.paired,0);
});
