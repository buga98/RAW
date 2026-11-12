/* RAW v5.47 FULL CONTROL SURFACE — client + Node shared allowlist.
 * Grounded in CURRENT RAW model/UI controls; DOES NOT imply that a manufacturer
 * VST3 exposes the same parameter, name, precision, or action.
 * Cubase mapping must be reviewed on ORIGINAL vendor VST3 before live test.
 * No physical mains POWER command or manufacturer firmware control is routed.
 * MIDI: continuous 14-bit paired CC MSB 1..31 and LSB MSB+32;
 *        enums/toggles/actions 7-bit CC70..119, channel is per-device.
 */
(function(root){
 "use strict";
 const PROFILES=Object.freeze({
  "bettermaker_eq": {
    "label": "Bettermaker MEQ",
    "channel": 0,
    "controls": {
      "level": {
        "kind": "numeric",
        "min": -10,
        "max": 10,
        "step": 0.1,
        "cc": 1
      },
      "hpfFreq": {
        "kind": "numeric",
        "min": 10,
        "max": 240,
        "step": 1,
        "cc": 2
      },
      "hpfResonance": {
        "kind": "numeric",
        "min": 0,
        "max": 100,
        "step": 1,
        "cc": 3
      },
      "eq1Freq": {
        "kind": "numeric",
        "min": 22,
        "max": 470,
        "step": 1,
        "cc": 4
      },
      "eq1Gain": {
        "kind": "numeric",
        "min": -15,
        "max": 15,
        "step": 0.1,
        "cc": 5
      },
      "eq1Q": {
        "kind": "numeric",
        "min": 0.2,
        "max": 7,
        "step": 0.1,
        "cc": 6
      },
      "eq2Freq": {
        "kind": "numeric",
        "min": 90,
        "max": 2000,
        "step": 1,
        "cc": 7
      },
      "eq2Gain": {
        "kind": "numeric",
        "min": -15,
        "max": 15,
        "step": 0.1,
        "cc": 8
      },
      "eq2Q": {
        "kind": "numeric",
        "min": 0.2,
        "max": 7,
        "step": 0.1,
        "cc": 9
      },
      "eq3Freq": {
        "kind": "numeric",
        "min": 480,
        "max": 10000,
        "step": 10,
        "cc": 10
      },
      "eq3Gain": {
        "kind": "numeric",
        "min": -15,
        "max": 15,
        "step": 0.1,
        "cc": 11
      },
      "eq3Q": {
        "kind": "numeric",
        "min": 0.2,
        "max": 7,
        "step": 0.1,
        "cc": 12
      },
      "eq4Freq": {
        "kind": "numeric",
        "min": 1000,
        "max": 23000,
        "step": 10,
        "cc": 13
      },
      "eq4Gain": {
        "kind": "numeric",
        "min": -15,
        "max": 15,
        "step": 0.1,
        "cc": 14
      },
      "eq4Q": {
        "kind": "numeric",
        "min": 0.2,
        "max": 7,
        "step": 0.1,
        "cc": 15
      },
      "lpfFreq": {
        "kind": "numeric",
        "min": 2000,
        "max": 38000,
        "step": 100,
        "cc": 16
      },
      "outputGain": {
        "kind": "numeric",
        "min": -10,
        "max": 10,
        "step": 0.1,
        "cc": 17
      },
      "passiveLoBoost": {
        "kind": "numeric",
        "min": 0,
        "max": 14,
        "step": 0.1,
        "cc": 18
      },
      "passiveLoCut": {
        "kind": "numeric",
        "min": 0,
        "max": 14,
        "step": 0.1,
        "cc": 19
      },
      "passiveLoFreq": {
        "kind": "numeric",
        "min": 20,
        "max": 100,
        "step": 1,
        "cc": 20
      },
      "passiveHiBoost": {
        "kind": "numeric",
        "min": 0,
        "max": 14,
        "step": 0.1,
        "cc": 21
      },
      "passiveHiBw": {
        "kind": "numeric",
        "min": 0,
        "max": 10,
        "step": 0.1,
        "cc": 22
      },
      "passiveHiFreq": {
        "kind": "numeric",
        "min": 500,
        "max": 28000,
        "step": 100,
        "cc": 23
      },
      "passiveHiCut": {
        "kind": "numeric",
        "min": 0,
        "max": 14,
        "step": 0.1,
        "cc": 24
      },
      "passiveHiCutFreq": {
        "kind": "numeric",
        "min": 5000,
        "max": 20000,
        "step": 100,
        "cc": 25
      },
      "engage": {
        "kind": "toggle",
        "cc": 70
      },
      "filterEnabled": {
        "kind": "toggle",
        "cc": 71
      },
      "focus": {
        "kind": "toggle",
        "cc": 72
      },
      "mode": {
        "kind": "enum",
        "values": [
          "stereo",
          "ms",
          "dualMono"
        ],
        "cc": 73
      },
      "abState": {
        "kind": "enum",
        "values": [
          "A",
          "B"
        ],
        "cc": 74
      },
      "meterMode": {
        "kind": "enum",
        "values": [
          "peak",
          "rms"
        ],
        "cc": 75
      },
      "displayMode": {
        "kind": "enum",
        "values": [
          "EQ",
          "RTA"
        ],
        "cc": 76
      },
      "copyAtoB": {
        "kind": "trigger",
        "cc": 77
      },
      "resetAll": {
        "kind": "trigger",
        "cc": 78
      },
      "outputGainSelect": {
        "kind": "trigger",
        "cc": 79
      },
      "hpf_selected": {
        "kind": "trigger",
        "cc": 80
      },
      "eq1_selected": {
        "kind": "trigger",
        "cc": 81
      },
      "eq2_selected": {
        "kind": "trigger",
        "cc": 82
      },
      "eq3_selected": {
        "kind": "trigger",
        "cc": 83
      },
      "eq4_selected": {
        "kind": "trigger",
        "cc": 84
      },
      "lpf_selected": {
        "kind": "trigger",
        "cc": 85
      },
      "passive_selected": {
        "kind": "trigger",
        "cc": 86
      },
      "menu_selected": {
        "kind": "trigger",
        "cc": 87
      }
    }
  },
  "ngbuscomp": {
    "label": "WesAudio ngBusComp",
    "channel": 1,
    "controls": {
      "L_threshold": {
        "kind": "numeric",
        "min": -20,
        "max": 20,
        "step": 0.5,
        "cc": 1
      },
      "L_mix": {
        "kind": "numeric",
        "min": 0,
        "max": 100,
        "step": 1,
        "cc": 2
      },
      "L_makeup": {
        "kind": "numeric",
        "min": 0,
        "max": 20,
        "step": 0.25,
        "cc": 3
      },
      "L_thd": {
        "kind": "numeric",
        "min": 0,
        "max": 100,
        "step": 1,
        "cc": 4
      },
      "L_ironPad": {
        "kind": "numeric",
        "min": 0,
        "max": 15,
        "step": 1,
        "cc": 5
      },
      "L_attack": {
        "kind": "enum",
        "values": [
          0.1,
          0.3,
          1,
          3,
          5,
          10,
          15,
          30
        ],
        "cc": 70
      },
      "L_release": {
        "kind": "enum",
        "values": [
          0.05,
          0.1,
          0.3,
          0.5,
          0.6,
          0.9,
          1.2,
          "auto"
        ],
        "cc": 71
      },
      "L_ratio": {
        "kind": "enum",
        "values": [
          1.5,
          2,
          4,
          10,
          "inf"
        ],
        "cc": 72
      },
      "L_sidechain": {
        "kind": "enum",
        "values": [
          "off",
          "60",
          "90",
          "150",
          "t1",
          "t2",
          "ext"
        ],
        "cc": 73
      },
      "L_mute": {
        "kind": "toggle",
        "cc": 74
      },
      "L_bypass": {
        "kind": "toggle",
        "cc": 75
      },
      "L_iron": {
        "kind": "toggle",
        "cc": 76
      },
      "L_ironLink": {
        "kind": "toggle",
        "cc": 77
      },
      "R_threshold": {
        "kind": "numeric",
        "min": -20,
        "max": 20,
        "step": 0.5,
        "cc": 6
      },
      "R_mix": {
        "kind": "numeric",
        "min": 0,
        "max": 100,
        "step": 1,
        "cc": 7
      },
      "R_makeup": {
        "kind": "numeric",
        "min": 0,
        "max": 20,
        "step": 0.25,
        "cc": 8
      },
      "R_thd": {
        "kind": "numeric",
        "min": 0,
        "max": 100,
        "step": 1,
        "cc": 9
      },
      "R_ironPad": {
        "kind": "numeric",
        "min": 0,
        "max": 15,
        "step": 1,
        "cc": 10
      },
      "R_attack": {
        "kind": "enum",
        "values": [
          0.1,
          0.3,
          1,
          3,
          5,
          10,
          15,
          30
        ],
        "cc": 78
      },
      "R_release": {
        "kind": "enum",
        "values": [
          0.05,
          0.1,
          0.3,
          0.5,
          0.6,
          0.9,
          1.2,
          "auto"
        ],
        "cc": 79
      },
      "R_ratio": {
        "kind": "enum",
        "values": [
          1.5,
          2,
          4,
          10,
          "inf"
        ],
        "cc": 80
      },
      "R_sidechain": {
        "kind": "enum",
        "values": [
          "off",
          "60",
          "90",
          "150",
          "t1",
          "t2",
          "ext"
        ],
        "cc": 81
      },
      "R_mute": {
        "kind": "toggle",
        "cc": 82
      },
      "R_bypass": {
        "kind": "toggle",
        "cc": 83
      },
      "R_iron": {
        "kind": "toggle",
        "cc": 84
      },
      "R_ironLink": {
        "kind": "toggle",
        "cc": 85
      },
      "mode": {
        "kind": "enum",
        "values": [
          "dual",
          "stereo",
          "ms"
        ],
        "cc": 86
      },
      "configBank": {
        "kind": "enum",
        "values": [
          "1",
          "2",
          "3"
        ],
        "cc": 87
      },
      "fastPreset": {
        "kind": "enum",
        "values": [
          "A",
          "B",
          "C"
        ],
        "cc": 88
      },
      "parameterLink": {
        "kind": "toggle",
        "cc": 89
      },
      "sidechain": {
        "kind": "enum",
        "values": [
          "int",
          "ext"
        ],
        "cc": 90
      }
    }
  },
  "ngtubecomp": {
    "label": "WesAudio ngTubeComp",
    "channel": 2,
    "controls": {
      "L_threshold": {
        "kind": "numeric",
        "min": -20,
        "max": 20,
        "step": 0.5,
        "cc": 1
      },
      "L_mix": {
        "kind": "numeric",
        "min": 0,
        "max": 100,
        "step": 1,
        "cc": 2
      },
      "L_attack": {
        "kind": "numeric",
        "min": 0.5,
        "max": 100,
        "step": 0.5,
        "cc": 3
      },
      "L_input": {
        "kind": "numeric",
        "min": -15,
        "max": 15,
        "step": 0.25,
        "cc": 4
      },
      "L_release": {
        "kind": "numeric",
        "min": 0.1,
        "max": 3,
        "step": 0.1,
        "cc": 5
      },
      "L_thd": {
        "kind": "numeric",
        "min": 0,
        "max": 100,
        "step": 1,
        "cc": 6
      },
      "L_tube": {
        "kind": "numeric",
        "min": -15,
        "max": 15,
        "step": 0.25,
        "cc": 7
      },
      "L_output": {
        "kind": "numeric",
        "min": -15,
        "max": 15,
        "step": 0.25,
        "cc": 8
      },
      "L_ironPad": {
        "kind": "numeric",
        "min": 0,
        "max": 15,
        "step": 1,
        "cc": 9
      },
      "L_scHpf": {
        "kind": "numeric",
        "min": 20,
        "max": 500,
        "step": 1,
        "cc": 10
      },
      "L_scBell": {
        "kind": "numeric",
        "min": 2000,
        "max": 20000,
        "step": 100,
        "cc": 11
      },
      "L_limit": {
        "kind": "toggle",
        "cc": 70
      },
      "L_feedForward": {
        "kind": "toggle",
        "cc": 71
      },
      "L_hpfEnabled": {
        "kind": "toggle",
        "cc": 72
      },
      "L_highBellEnabled": {
        "kind": "toggle",
        "cc": 73
      },
      "L_scListen": {
        "kind": "toggle",
        "cc": 74
      },
      "L_bypass": {
        "kind": "toggle",
        "cc": 75
      },
      "L_mute": {
        "kind": "toggle",
        "cc": 76
      },
      "R_threshold": {
        "kind": "numeric",
        "min": -20,
        "max": 20,
        "step": 0.5,
        "cc": 12
      },
      "R_mix": {
        "kind": "numeric",
        "min": 0,
        "max": 100,
        "step": 1,
        "cc": 13
      },
      "R_attack": {
        "kind": "numeric",
        "min": 0.5,
        "max": 100,
        "step": 0.5,
        "cc": 14
      },
      "R_input": {
        "kind": "numeric",
        "min": -15,
        "max": 15,
        "step": 0.25,
        "cc": 15
      },
      "R_release": {
        "kind": "numeric",
        "min": 0.1,
        "max": 3,
        "step": 0.1,
        "cc": 16
      },
      "R_thd": {
        "kind": "numeric",
        "min": 0,
        "max": 100,
        "step": 1,
        "cc": 17
      },
      "R_tube": {
        "kind": "numeric",
        "min": -15,
        "max": 15,
        "step": 0.25,
        "cc": 18
      },
      "R_output": {
        "kind": "numeric",
        "min": -15,
        "max": 15,
        "step": 0.25,
        "cc": 19
      },
      "R_ironPad": {
        "kind": "numeric",
        "min": 0,
        "max": 15,
        "step": 1,
        "cc": 20
      },
      "R_scHpf": {
        "kind": "numeric",
        "min": 20,
        "max": 500,
        "step": 1,
        "cc": 21
      },
      "R_scBell": {
        "kind": "numeric",
        "min": 2000,
        "max": 20000,
        "step": 100,
        "cc": 22
      },
      "R_limit": {
        "kind": "toggle",
        "cc": 77
      },
      "R_feedForward": {
        "kind": "toggle",
        "cc": 78
      },
      "R_hpfEnabled": {
        "kind": "toggle",
        "cc": 79
      },
      "R_highBellEnabled": {
        "kind": "toggle",
        "cc": 80
      },
      "R_scListen": {
        "kind": "toggle",
        "cc": 81
      },
      "R_bypass": {
        "kind": "toggle",
        "cc": 82
      },
      "R_mute": {
        "kind": "toggle",
        "cc": 83
      },
      "mode": {
        "kind": "enum",
        "values": [
          "dual",
          "stereo",
          "ms"
        ],
        "cc": 84
      },
      "parameterLink": {
        "kind": "toggle",
        "cc": 85
      },
      "preset": {
        "kind": "enum",
        "values": [
          "A",
          "B",
          "C"
        ],
        "cc": 86
      }
    }
  }
});
 function get(profileId,parameter){return PROFILES[profileId]?.controls?.[parameter]||null;}
 function route(profileId,message){
  const profile=PROFILES[profileId];
  if(!profile)throw new Error("Unknown full surface profile");
  if(!message||typeof message!=="object"||Array.isArray(message)||
     message.type!=="parameter-change"||message.deviceId!==profileId||
     typeof message.sessionId!=="string"||!/^test-[0-9]{10,20}$/.test(message.sessionId))
   throw new Error("Invalid local-test full-surface message");
  const def=get(profileId,message.parameter);
  if(!def)throw new Error("Parameter is not mapped in full-surface allowlist");
  let fraction=0;
  if(def.kind==="numeric"){
   if(typeof message.value!=="number"||!Number.isFinite(message.value)||
      message.value<def.min||message.value>def.max)
    throw new Error("Numeric value outside RAW control range");
   fraction=(message.value-def.min)/(def.max-def.min);
  }else if(def.kind==="enum"){
   const idx=def.values.findIndex(item=>item===message.value);
   if(idx<0)throw new Error("Unexpected enum value");
   fraction=idx/(def.values.length-1);
  }else if(def.kind==="toggle"){
   if(typeof message.value!=="boolean")throw new Error("Toggle requires true or false");
   fraction=message.value?1:0;
  }else if(def.kind==="trigger"){
   if(message.value!==true)throw new Error("Trigger requires explicit true");
   fraction=1;
  }else throw new Error("Invalid control kind");
  const raw=Math.round(fraction*(def.kind==="numeric"?16383:127));
  return Object.freeze({
   deviceId:profileId,parameter:message.parameter,originalValue:message.value,
   kind:def.kind,channel:profile.channel,
   cc:def.cc,ccLsb:def.kind==="numeric"?def.cc+32:null,
   value:raw,msb:def.kind==="numeric"?raw>>7:null,
   lsb:def.kind==="numeric"?raw&127:null,
   bits:def.kind==="numeric"?14:7,
   pluginVerified:false,hardwareVerified:false
  });
 }
 const API=Object.freeze({profiles:PROFILES,get,route});
 if(typeof module!=="undefined"&&module.exports)module.exports=API;
 root.RAWFullV547=API;
})(typeof window!=="undefined"?window:globalThis);
