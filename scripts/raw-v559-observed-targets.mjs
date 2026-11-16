// V5.59.1: choose only actually observed, unambiguous EQ display values.
// No extrapolation, and no automatic full-range sweep.
export function chooseObservedRoundtrip(calibration,label){
 const entry=calibration?.parameters?.[label];
 if(!entry||!Array.isArray(entry.verified))throw Error("V559_NO_CALIBRATION_FOR_PARAMETER");
 const byDisplay=new Map();
 const conflictPositions=new Set((entry.conflicts||[]).map(x=>x.position));
 for(const row of entry.verified){
  if(conflictPositions.has(row.position)||!Number.isInteger(row.position)||row.position<0||row.position>255)continue;
  if(typeof row.display!=="string"||!row.display.trim())continue;
  if(!byDisplay.has(row.display))byDisplay.set(row.display,[]);
  byDisplay.get(row.display).push(row);
 }
 const candidates=[...byDisplay].map(([display,rows])=>({display,position:rows[Math.floor((rows.length-1)/2)].position}));
 if(candidates.length<2)throw Error("V559_NEED_TWO_DISTINCT_OBSERVED_DISPLAYS");
 const preferred=["Q = 3.6","Q = 4.8","SHARP"];
 const selected=[];
 for(const name of preferred){
  const c=candidates.find(c=>c.display===name);
  if(c&&!selected.some(s=>s.position===c.position))selected.push(c);
 }
 if(selected.length<3){
  const sorted=candidates.slice().sort((a,b)=>a.position-b.position);
  for(const candidate of [sorted[0],sorted[Math.floor((sorted.length-1)/2)],sorted.at(-1),...sorted]){
   if(candidate&&!selected.some(s=>s.position===candidate.position))selected.push(candidate);
   if(selected.length>=3)break;
  }
 }
 if(selected.length<2)throw Error("V559_NEED_TWO_DISTINCT_OBSERVED_POSITIONS");
 const chosen=selected.slice(0,3).map(x=>x.display);
 return [...chosen,chosen[0]];
}
