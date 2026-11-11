import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("V5.32: display only verified server wallet microRAW, not historical EUR",()=>{
 const context={};runInNewContext(source("raw-wallet-display-v532.js"),context);
 const label=context.RAWTokenDisplayV532.label;
 assert.equal(label(null),"RAW saldo nije dostupan");
 assert.equal(label(undefined),"RAW saldo nije dostupan");
 assert.equal(label(0),"0.0000 RAW");
 assert.equal(label(20_000_000),"20.0000 RAW");
 assert.equal(label(20_004_167),"20.0042 RAW");
 assert.equal(label(-10),"RAW saldo nije dostupan");
 assert.equal(label("20"),"RAW saldo nije dostupan");
 assert.equal(label(9e15),"RAW saldo nije dostupan");
 assert.equal(label(null,{testMode:true}),"TEST — bez naplate");
});
test("V5.32: app subscribes only to own verified wallet, cleans up on logout",()=>{
 const html=source("index.html");
 assert.match(html,/raw-wallet-display-v532\.js/);
 assert.match(html,/onSnapshot\(doc\(db,"rawWalletsV531",user\.uid\)/);
 assert.match(html,/if\(TEST_MODE\|\|!user\?\.uid\|\|user\.emailVerified!==true\)return/);
 assert.match(html,/stopRawWalletListenerV532\(\)/);
 assert.match(html,/window\.RAWTokenDisplayV532\.label\(currentRawWalletMicros/);
 assert.doesNotMatch(html,/creditsEl\.textContent = .*currentUserData\?\.credits/);
});
