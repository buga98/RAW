import test from "node:test";
import assert from "node:assert/strict";
import {hashPasswordV530,verifyPasswordV530,RAW_V530_DUMMY_HASH} from "../raw-v530-password.mjs";
import {createLocalAuthV530,normalizeEmailV530,hashSessionTokenV530} from "../raw-v530-local-auth.mjs";

test("V5.30: self-hosted passwords use salted memory-hard hash, never plaintext",async()=>{
 const p="S!gurno-Password-2026";
 const a=await hashPasswordV530(p);
 const b=await hashPasswordV530(p);
 assert.match(a,/^scrypt-v1\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
 assert.notEqual(a,b);
 assert.equal(a.includes(p),false);
 assert.equal(await verifyPasswordV530(p,a),true);
 assert.equal(await verifyPasswordV530("Wrong-password",a),false);
 assert.equal(await verifyPasswordV530(p,RAW_V530_DUMMY_HASH),false);
 assert.equal(await verifyPasswordV530(p,"plaintext"),false);
 await assert.rejects(hashPasswordV530("tiny"),{code:"INVALID_PASSWORD"});
});
test("V5.30: owner login stores only SHA-256 of random session; revocation and expiry apply",async()=>{
 const hashed=await hashPasswordV530("Long-and-Secure-Password!");
 const records=new Map(),lookup=[];
 let now=1_800_000_000_000;
 const store={
  findUserByEmail:async email=>({uid:"owner-uuid",email,passwordHash:hashed,
   disabled:false,role:"admin"}),
  createSession:async data=>{assert.equal("accessToken" in data,false);
   records.set(data.tokenHash,{...data});},
  findActiveSession:async(hash,at)=>{
   lookup.push(hash);const row=records.get(hash);
   if(!row||row.revoked||row.expiresAtMs<=at)return null;
   return {uid:row.uid,disabled:false,role:"admin"};
  },
  revokeSession:async hash=>{const r=records.get(hash);if(r)r.revoked=true;}
 };
 const auth=createLocalAuthV530({store,now:()=>now,tokenFactory:()=>"a".repeat(43)});
 const out=await auth.login({email:"OWNER@EXAMPLE.COM",password:"Long-and-Secure-Password!"});
 assert.equal(out.user.email,"owner@example.com");
 assert.equal(out.user.role,"admin");
 assert.equal(out.accessToken,"a".repeat(43));
 const stored=[...records.keys()][0];
 assert.match(stored,/^[a-f0-9]{64}$/);
 assert.equal(stored,hashSessionTokenV530("a".repeat(43)));
 assert.equal(JSON.stringify([...records.values()]).includes(out.accessToken),false);
 const authHeader="Bearer "+out.accessToken;
 assert.equal((await auth.identity.verify(authHeader)).uid,"owner-uuid");
 assert.equal((await auth.me(authHeader)).role,"admin");
 await auth.logout(authHeader);
 await assert.rejects(auth.me(authHeader),{code:"AUTH_INVALID"});
 assert.ok(lookup.length>=3);
});
test("V5.30: deny bad tokens, mismatched password, disabled account and expired session",async()=>{
 const hash=await hashPasswordV530("Strong-password-24-characters");
 let now=1_800_000_000_000;
 const store={
  async findUserByEmail(email){return email==="real@example.com"
   ?{uid:"user-a",passwordHash:hash,disabled:false,role:"user"}:null;},
  async createSession(){},
  async findActiveSession(){return null;},
  async revokeSession(){}
 };
 const auth=createLocalAuthV530({store,now:()=>now});
 await assert.rejects(auth.login({email:"real@example.com",password:"NOT THE PASSWORD"}),{code:"AUTH_INVALID"});
 await assert.rejects(auth.login({email:"unknown@example.com",password:"NOT THE PASSWORD"}),{code:"AUTH_INVALID"});
 await assert.rejects(auth.identity.verify("Bearer wrong"),{code:"AUTH_REQUIRED"});
 await assert.rejects(auth.identity.verify(undefined),{code:"AUTH_REQUIRED"});
 assert.equal(normalizeEmailV530(" HELLO@EXAMPLE.COM "),"hello@example.com");
 assert.throws(()=>normalizeEmailV530("invalid"),{code:"INVALID_EMAIL"});
 const disabled=createLocalAuthV530({store:{
  ...store,findUserByEmail:async()=>({uid:"disabled",passwordHash:hash,disabled:true,role:"admin"})
 }});
 await assert.rejects(disabled.login({email:"real@example.com",password:"Strong-password-24-characters"}),{code:"AUTH_INVALID"});
});
