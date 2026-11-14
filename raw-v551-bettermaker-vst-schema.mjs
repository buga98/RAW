// Actual ORIGINAL Bettermaker Mastering Equalizer VST Generic Editor parameter
// names manually transcribed from operator's 5 Cubase screenshots (2026-11-14).
// This is an *inventory*, not a mapping and not verified VST parameter ID discovery.
// Names, L/R rows and counts must be confirmed against the installed VST version.
export const BM_VST_GLOBAL=["EQ MODE","EQ1 lock","EQ2 lock","EQ3 lock","EQ4 lock","SNAPSHOT"];
export const BM_VST_PAIRED=["ENGAGE","OUT LEVEL","HPF bypass","HPF frequency","HPF resonance","LPF bypass","LPF frequency","EQ1 bypass","EQ1 frequency","EQ1 gain","EQ1 bandwidth","EQ2 bypass","EQ2 frequency","EQ2 gain","EQ2 bandwidth","EQ3 bypass","EQ3 frequency","EQ3 gain","EQ3 bandwidth","EQ4 bypass","EQ4 frequency","EQ4 gain","EQ4 bandwidth","PUL bypass","PUL lo boost","PUL lo cut","PUL lo frequency","PUL hi boost","PUL hi boost bandwidth","PUL hi boost frequency","PUL hi cut","PUL hi cut frequency","HPF slope","HPF resonant enable","EQ1 AutoQ","EQ2 AutoQ","EQ3 AutoQ","EQ4 AutoQ","EQ1 shelf enable","EQ4 shelf enable"];
export const BM_VST_SCHEMA=Object.freeze([
 ...BM_VST_GLOBAL.map((name)=>Object.freeze({name,channel:null,label:name,vstParameterId:null,connection:"unmapped"})),
 ...BM_VST_PAIRED.flatMap(name=>["L","R"].map(channel=>Object.freeze({
  name,channel,label:(name==="ENGAGE"||name==="OUT LEVEL")?`${name} ${channel}`:`${name.split(" ")[0]} ${channel} ${name.split(" ").slice(1).join(" ")}`,
  vstParameterId:null,connection:"unmapped"
 })))
]);
// Names match the Generic Editor ordering: ENGAGE L, OUT LEVEL L, HPF L bypass, EQ1 L frequency.
export const BM_VST_COUNT=BM_VST_SCHEMA.length;
