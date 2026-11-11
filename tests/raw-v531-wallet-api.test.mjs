import test from "node:test";
import assert from "node:assert/strict";
import {once} from "node:events";
import {readFileSync} from "node:fs";
import {createRawWalletApiV531} from "../raw-v531-wallet-api.mjs";

class MiniFirestore{
 constructor(){this.records=new Map();this.lock=Promise.resolve();}
 collection(name){
  const db=this;
  return {doc(id){
   const key=name+"/"+id,ref={key,id};
   ref.get=async()=>({exists:db.records.has(key),data:()=>db.records.get(key)});
   ref.create=async data=>{if(db.records.has(key))throw Error("DUPLICATE");db.records.set(key,{...data});};
   return ref;
  }};
 }
 async runTransaction(fn){
  const before=this.lock;let release;this.lock=new Promise(ok=>release=ok);
  await before;
  try{
   const staged=[];
   const result=await fn({
    get:async ref=>({exists:this.records.has(ref.key),
     data:()=>this.records.get(ref.key)}),
    set:(ref,value,opts)=>staged.push(["set",ref.key,value,opts]),
    update:(ref,value)=>staged.push(["update",ref.key,value]),
    create:(ref,value)=>staged.push(["create",ref.key,value])
   });
   for(const [op,key] of staged)
    if(op==="create"&&this.records.has(key))throw Error("DUPLICATE");
   for(const [op,key,value,opts] of staged){
    if(op==="update"||opts?.merge)
     this.records.set(key,{...this.records.get(key),...value});
    else this.records.set(key,{...value});
   }
   return result;
  }finally{release();}
 }
}
const owner="ownerA",secret="whsec_TEST_TOKEN",sid="cs_test_TEST1234";
function fixture(){
 const db=new MiniFirestore();
 const auth={async verifyIdToken(token,revoked){
  assert.equal(revoked,true);
  if(token!=="signed.token.value.valid")throw Error("invalid");
  return {uid:owner,email_verified:true};
 }};
 const stripe={
  checkout:{sessions:{async create(){return{id:sid,url:"https://checkout.stripe.com/pay/test"};}}},
  webhooks:{constructEvent(raw,signature,actualSecret){
   assert.equal(actualSecret,secret);
   if(signature!=="signature-ok")throw Error("bad signature");
   return JSON.parse(Buffer.from(raw).toString("utf8"));
  }}
 };
 return {app:createRawWalletApiV531({
  firebaseAuth:auth,firestoreAdmin:db,stripe,webhookSecret:secret,
  successUrl:"https://raw.example.test/success",cancelUrl:"https://raw.example.test/cancel",
  now:()=>1_800_000_000_000
 }),db};
}
async function withServer(app,callback){
 const server=app.listen(0,"127.0.0.1");
 await once(server,"listening");
 try{await callback("http://127.0.0.1:"+server.address().port);}
 finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}
const authHeader={Authorization:"Bearer signed.token.value.valid"};
test("V5.31: real Express route requires Firebase verified identity and never trusts forged UID",async()=>{
 const {app,db}=fixture();
 await withServer(app,async base=>{
  const anon=await fetch(base+"/api/v531/wallet");
  assert.equal(anon.status,401);
  const initial=await fetch(base+"/api/v531/wallet",{headers:authHeader});
  assert.equal(initial.status,200);
  assert.equal((await initial.json()).balanceMicros,0);
  const forged=await fetch(base+"/api/v531/wallet/checkout",{
   method:"POST",headers:{...authHeader,"Content-Type":"application/json"},
   body:JSON.stringify({amountCents:2000,ownerUid:"someoneElse"})
  });
  assert.equal(forged.status,400);
  const good=await fetch(base+"/api/v531/wallet/checkout",{
   method:"POST",headers:{...authHeader,"Content-Type":"application/json"},
   body:JSON.stringify({amountCents:2000})
  });
  assert.equal(good.status,201);
  assert.equal((await good.json()).checkoutSessionId,sid);
  assert.equal(db.records.get("rawTokenOrdersV531/"+sid).ownerUid,owner);
  assert.equal((await (await fetch(base+"/api/v531/wallet",{headers:authHeader})).json()).balanceMicros,0);
 });
});
test("V5.31: Stripe webhook API requires signature on original raw JSON bytes",async()=>{
 const {app,db}=fixture();
 const event={id:"evt_ABC123",type:"checkout.session.completed",
  data:{object:{id:sid,amount_total:2000,currency:"eur",
   payment_status:"paid",client_reference_id:owner}}};
 await withServer(app,async base=>{
  await fetch(base+"/api/v531/wallet/checkout",{
   method:"POST",headers:{...authHeader,"Content-Type":"application/json"},
   body:JSON.stringify({amountCents:2000})
  });
  const raw=JSON.stringify(event);
  const forged=await fetch(base+"/api/v531/stripe/webhook",{
   method:"POST",headers:{"Content-Type":"application/json","stripe-signature":"not-valid"},
   body:raw
  });
  assert.equal(forged.status,400);
  assert.equal(db.records.has("rawWalletsV531/"+owner),false);
  const paid=await fetch(base+"/api/v531/stripe/webhook",{
   method:"POST",headers:{"Content-Type":"application/json","stripe-signature":"signature-ok"},
   body:raw
  });
  assert.equal(paid.status,200);
  assert.equal((await paid.json()).credited,true);
  const replay=await fetch(base+"/api/v531/stripe/webhook",{
   method:"POST",headers:{"Content-Type":"application/json","stripe-signature":"signature-ok"},
   body:raw
  });
  assert.equal(replay.status,200);
  assert.equal((await replay.json()).duplicate,true);
  const balance=await fetch(base+"/api/v531/wallet",{headers:authHeader});
  assert.equal((await balance.json()).balanceMicros,20_000_000);
 });
});
test("V5.31: email verification uses default Firebase noreply and existing unverified account cannot continue",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.match(html,/auth\.languageCode = "hr"/);
 assert.match(html,/sendEmailVerification\(cred\.user\)/);
 assert.match(html,/sendPasswordResetEmail\(auth,email\)/);
 assert.match(html,/window\.resendVerificationEmail/);
 assert.match(html,/await cred\.user\.reload\(\)/);
 assert.match(html,/if \(!user \|\| !user\.emailVerified\)/);
 assert.match(html,/RAW LEGACY CLIENT CREDIT DEBIT DISABLED/);
 assert.match(html,/RAW LEGACY CLIENT BILLING TIMER DISABLED/);
 const fragment=readFileSync(new URL("../config/firestore-v531-wallet-deny.rules.fragment",import.meta.url),"utf8");
 assert.match(fragment,/allow list, create, update, delete: if false;/);
 assert.match(fragment,/request\.auth\.uid == ownerUid/);
 const source=readFileSync(new URL("../raw-v531-wallet-api.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(source,/\.listen\s*\(/);
});
