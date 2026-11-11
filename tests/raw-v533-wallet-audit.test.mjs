import test from "node:test";
import assert from "node:assert/strict";
import {createRawWalletAuditorV533,verifyRawLedgerChainV533} from "../raw-v533-wallet-audit.mjs";
const base=[
{id:"stripe_orderA",type:"STRIPE_TOPUP",amountMicros:20_000_000,balanceAfterMicros:20_000_000},
{id:"spend_runA_1000",type:"DEVICE_PROCESSING",amountMicros:-100000,balanceAfterMicros:19_900_000},
{id:"spend_runA_2000",type:"DEVICE_PROCESSING",amountMicros:-50000,balanceAfterMicros:19_850_000}
];
test("V5.33: read-only audit verifies exact chain from Stripe top-up through device usage",()=>{
 const r=verifyRawLedgerChainV533(base,{balanceMicros:19_850_000});
 assert.equal(r.ok,true);
 assert.equal(r.events,3);
 assert.equal(r.balanceMicros,19_850_000);
});
test("V5.33: replay, drift, negative balance and forged ledger are detected",()=>{
 assert.throws(()=>verifyRawLedgerChainV533(base,{balanceMicros:19_850_001}),
  {code:"WALLET_LEDGER_MISMATCH"});
 assert.throws(()=>verifyRawLedgerChainV533([...base,base[2]],{balanceMicros:19_850_000}),
  {code:"LEDGER_AUDIT_FAILED"});
 assert.throws(()=>verifyRawLedgerChainV533([
  {...base[0],balanceAfterMicros:1}
 ],{balanceMicros:20_000_000}),{code:"LEDGER_AUDIT_FAILED"});
 assert.throws(()=>verifyRawLedgerChainV533([
  {id:"spend_fake",type:"DEVICE_PROCESSING",amountMicros:-1,balanceAfterMicros:-1}
 ],{balanceMicros:0}),{code:"LEDGER_AUDIT_FAILED"});
 assert.throws(()=>verifyRawLedgerChainV533([
  {...base[0],type:"DEVICE_PROCESSING"}
 ],{balanceMicros:20_000_000}),{code:"LEDGER_AUDIT_FAILED"});
});
test("V5.33: account auditor reads only owner ledger, never mutates wallet",async()=>{
 const ledger=base.map(item=>({
  id:item.id,data:()=>({...item,ownerUid:"alice"})
 }));
 const queries=[];
 const db={collection:name=>{
  queries.push(name);
  if(name==="rawWalletsV531")return {doc:uid=>{
   assert.equal(uid,"alice");return {get:async()=>({
    exists:true,data:()=>({balanceMicros:19_850_000})
   })};
  }};
  assert.equal(name,"rawTokenLedgerV531");
  return {where:(field,op,owner)=>{
   assert.deepEqual([field,op,owner],["ownerUid","==","alice"]);
   return {orderBy:(field,dir)=>{
    assert.deepEqual([field,dir],["createdAtMs","asc"]);
    return {limit:num=>{
     assert.equal(num,10001);return {get:async()=>({docs:ledger})};
    }};
   }};
  }};
 }};
 const audit=await createRawWalletAuditorV533(db).inspect("alice");
 assert.deepEqual(queries,["rawWalletsV531","rawTokenLedgerV531"]);
 assert.equal(audit.events,3);
 assert.equal(audit.ok,true);
 ledger[0]={id:"bad",data:()=>({...base[0],ownerUid:"bob"})};
 await assert.rejects(createRawWalletAuditorV533(db).inspect("alice"),{code:"LEDGER_OWNER_INTEGRITY"});
});
