import test from "node:test";
import assert from "node:assert/strict";
import {StudioLab,DEVICE_PRICES_CENTS_PER_MINUTE} from "../studio-lab.mjs";

test("One exclusive owner, release and reclaim; second client can't alter chain", () => {
  let clock = 0;
  const lab = new StudioLab({now:()=>clock,balanceCents:100});
  const a={},b={};
  assert.equal(lab.claim(a),true);
  assert.equal(lab.claim(b),false);
  assert.equal(lab.snapshot(b).status,"occupied");
  assert.equal(lab.snapshot(b).balanceCents,null);
  assert.throws(()=>lab.setEnabled(b,["ngtubecomp"]),/not owned/);
  assert.equal(lab.owns(a),true);
  assert.equal(lab.release(b),false);
  assert.equal(lab.release(a),true);
  assert.equal(lab.claim(b),true);
});

test("Credits meter charges by enabled devices, per elapsed second, not per knob turn", () => {
  let clock=0;
  const lab=new StudioLab({now:()=>clock,balanceCents:100});
  const a={};
  assert.equal(lab.claim(a),true);
  clock=60_000;
  lab.tick();
  assert.equal(lab.spentCents,DEVICE_PRICES_CENTS_PER_MINUTE.bettermaker_eq);
  lab.setEnabled(a,["bettermaker_eq","ngbuscomp","ngtubecomp"]);
  assert.equal(lab.rateCentsPerMin,72);
  clock=90_000;
  lab.tick();
  assert.equal(lab.spentCents,65);
  assert.equal(lab.balanceCents,35);
});

test("Credits exhaustion revokes ownership and denies new claims", () => {
  let clock=0;
  const lab=new StudioLab({now:()=>clock,balanceCents:1});
  const a={};
  assert.equal(lab.claim(a),true);
  clock=5000;
  const expired=lab.tick();
  assert.equal(expired,a);
  assert.equal(lab.owns(a),false);
  assert.equal(lab.snapshot(a).status,"credits-exhausted");
  assert.equal(lab.claim(a),false);
});
test("Reject empty, unknown and duplicate enabled device configurations",()=>{
  const lab=new StudioLab();const a={};
  lab.claim(a);
  for(const devices of [[],["other"],["bettermaker_eq","bettermaker_eq"]]) {
    assert.throws(()=>lab.setEnabled(a,devices),/Invalid device/);
  }
});
