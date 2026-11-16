import test from "node:test";
import assert from "node:assert/strict";
import {makeStableGate} from "../scripts/raw-v5593-stability-gate.mjs";
test("transient MATCH followed by final MISMATCH is not accepted early",()=>{
 const gate=makeStableGate();
 gate.arm(1000);
 gate.observe(1020);
 assert.equal(gate.inspect(1100,"MATCH").ready,false);
 gate.observe(1101);
 assert.equal(gate.inspect(1900,"MATCH").ready,false);
 gate.observe(1980);
 assert.equal(gate.inspect(2400,"MISMATCH").ready,false);
 const last=gate.inspect(2900,"MISMATCH");
 assert.equal(last.ready,true);
 assert.equal(last.status,"MISMATCH");
});
test("stable matching value requires minimum window and quiet time",()=>{
 const gate=makeStableGate();gate.arm(1000);gate.observe(1020);
 assert.equal(gate.inspect(2000,"MATCH").ready,false);
 assert.equal(gate.inspect(2500,"MATCH").ready,true);
});
test("missing or incomplete callbacks never qualify",()=>{
 const gate=makeStableGate();gate.arm(0);
 assert.equal(gate.inspect(3000,"MATCH").ready,false);
 gate.observe(100);
 assert.equal(gate.inspect(3000,"TIMEOUT_OR_INCOMPLETE").ready,false);
});
