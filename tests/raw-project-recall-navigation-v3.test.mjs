import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const navSource=html.match(/window\.goTo = function\(screenId\) \{[\s\S]*?\n\};/);
function navigation({rack=true,library=true,owner=true,session=true}={}){
 assert.ok(navSource,"RAW navigation must be present");
 const screens=["login","plugin","projects","developer","sessions","devices","upload"];
 const entries=Object.fromEntries(screens.map(name=>[name,{
  classList:{
   list:new Set(),add(v){this.list.add(v);},
   remove(v){this.list.delete(v);},
   contains(v){return this.list.has(v);}
  }
 }]));
 const tabs=screens.map(name=>({dataset:{screen:name},classList:{toggle(){}}}));
 const state={
  freq:160,gain:5,q:3,
  renderCount:0,fitCount:0,fitWhileActive:0
 };
 const env={
  TEST_MODE:true,
  currentUser:{uid:"owner",emailVerified:true},
  developerAllowed:()=>owner,
  activeSessionId:session?"test-1234567890123":null,
  pluginHost:{
   querySelector:selector=>selector===".chain-control"&&rack?{}:null
  },
  projectsHost:{
   querySelector:selector=>selector===".raw-library-panel"&&library?{}:null
  },
  renderPlugin:()=>{
   state.renderCount++;
   // Recreating the plugin used to create a new StudioEQ with defaults.
   state.freq=132;state.gain=0;state.q=1.5;rack=true;
  },
  renderSessions:()=>{},
  fitRackDevices:()=>{
   state.fitCount++;
   if(entries.plugin.classList.contains("active"))state.fitWhileActive++;
  },
  requestAnimationFrame:callback=>callback(),
  document:{
   querySelectorAll:selector=>selector===".screen"?Object.values(entries):selector===".tab"?tabs:[],
   getElementById:id=>entries[id]
  },
  window:{}
 };
 vm.runInNewContext(navSource[0],env);
 return {goTo:env.window.goTo,state};
}
test("first Control Room opening fits scaled devices after screen is visible",()=>{
 const h=navigation({rack:false});
 h.goTo("plugin");
 assert.equal(h.state.renderCount,1);
 assert.equal(h.state.fitCount,2);
 assert.equal(h.state.fitWhileActive,2);
 h.goTo("projects");
 h.goTo("plugin");
 assert.equal(h.state.renderCount,1,"returning must not reset three restored models");
 assert.equal(h.state.fitWhileActive,4,"every Control Room entry remeasures the rack");
});
test("Project Recall of EQ1 160Hz/+5dB/Q3 survives switching Projects -> Control Room",()=>{
 const h=navigation();
 h.goTo("projects");
 h.goTo("plugin");
 assert.deepEqual([h.state.freq,h.state.gain,h.state.q],[160,5,3]);
 assert.equal(h.state.renderCount,0);
});
test("Developer LAB navigation also preserves active rack controls",()=>{
 const h=navigation({owner:true});
 h.goTo("developer");
 h.goTo("plugin");
 assert.equal(h.state.freq,160);
 assert.equal(h.state.renderCount,0);
});
test("an absent rack still renders when entering Control Room",()=>{
 const h=navigation({rack:false});
 h.goTo("plugin");
 assert.equal(h.state.renderCount,1);
 assert.equal(h.state.freq,132);
});
test("project screen bootstraps once if no project panel exists",()=>{
 const h=navigation({rack:false,library:false});
 h.goTo("projects");
 assert.equal(h.state.renderCount,1);
});
test("unverified developer cannot navigate to private LAB route",()=>{
 const h=navigation({owner:false});
 h.goTo("developer");
 assert.equal(h.state.renderCount,0);
});
test("explicit new-session and chain edit render paths remain supported",()=>{
 assert.match(html,/renderPlugin\(\);\s*window\.goTo\("plugin"\)/);
 assert.match(html,/if \(screenId === "plugin" && !pluginHost\.querySelector\("\.chain-control"\)\) renderPlugin\(\)/);
 assert.match(html,/RAWProjectRecallV3\?\.create\(/);
 assert.match(html,/RAWBettermakerEngineV3LocalRefresh/);
});
