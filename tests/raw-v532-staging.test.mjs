import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";
import {
 assertRawStagingV532,assertRawStagingReadV532
} from "../raw-v532-staging-guard.mjs";
import {
 createCheckoutThrottleV532,RAW_CHECKOUT_WINDOW_MS_V532
} from "../raw-v532-checkout-throttle.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const file=p=>readFileSync(resolve(root,p),"utf8");
const good={enabled:"true",projectId:"raw-mastering-staging",
 expectedProjectId:"raw-mastering-staging",
 stripeKey:"sk_test_123456789abcdef",webhookSecret:"whsec_123456789abcdef"};
const rejects=code=>err=>err?.code===code;
class DB{
 constructor(){this.data=new Map();this.wait=Promise.resolve();}
 collection(name){
  return {doc:id=>({path:name+"/"+id})};
 }
 async runTransaction(callback){
  const last=this.wait;let done;this.wait=new Promise(r=>done=r);await last;
  try{
   const mutations=[];
   const tx={
    async get(ref){
     const val=thisDB.data.get(ref.path);
     return{exists:val!==undefined,data:()=>val};
    },
    update(ref,data){mutations.push(["update",ref.path,data]);},
    create(ref,data){mutations.push(["create",ref.path,data]);}
   };
   const thisDB=this;
   const answer=await callback(tx);
   for(const [kind,path] of mutations){
    if(kind==="create"&&this.data.has(path))throw Error("DUPLICATE");
    if(kind==="update"&&!this.data.has(path))throw Error("NOT_FOUND");
   }
   for(const [,path,value] of mutations)
    this.data.set(path,{...(this.data.get(path)||{}),...value});
   return answer;
  }finally{done();}
 }
}
test("V5.32 stage-only guard refuses production projects and real Stripe keys",()=>{
 assert.equal(assertRawStagingV532(good).mode,"STRIPE_TEST_ONLY");
 assert.equal(assertRawStagingReadV532(good).mode,"READ_ONLY_STAGING");
 const cases=[
  {...good,enabled:"false"},
  {...good,enabled:undefined},
  {...good,projectId:"remoteaudioworkstation",expectedProjectId:"remoteaudioworkstation"},
  {...good,projectId:"raw-mastering-staging",expectedProjectId:"different-staging"},
  {...good,projectId:"raw-mastering-live",expectedProjectId:"raw-mastering-live"}
 ];
 for(const value of cases){
  assert.throws(()=>assertRawStagingV532(value),rejects("STAGING_PROJECT_REQUIRED"));
  assert.throws(()=>assertRawStagingReadV532(value),rejects("STAGING_PROJECT_REQUIRED"));
 }
 assert.throws(()=>assertRawStagingV532({...good,stripeKey:"sk_live_1234567890"}),rejects("STRIPE_TEST_KEY_REQUIRED"));
 assert.throws(()=>assertRawStagingV532({...good,webhookSecret:"secret"}),rejects("STRIPE_TEST_WEBHOOK_REQUIRED"));
});
test("V5.32 transactional checkout throttle rejects fourth checkout even with concurrency",async()=>{
 const db=new DB(),t=createCheckoutThrottleV532(db),at=1_800_000_000_000;
 const hits=await Promise.allSettled(
  Array.from({length:5},()=>t.consume("user_one",at))
 );
 assert.equal(hits.filter(x=>x.status==="fulfilled").length,3);
 assert.equal(hits.filter(x=>x.status==="rejected"&&
   x.reason.code==="CHECKOUT_LIMIT_REACHED").length,2);
 const other=await t.consume("user_two",at);
 assert.equal(other.remaining,2);
 await assert.rejects(t.consume("user_one",at+RAW_CHECKOUT_WINDOW_MS_V532-1),
  rejects("CHECKOUT_LIMIT_REACHED"));
 const fresh=await t.consume("user_one",at+RAW_CHECKOUT_WINDOW_MS_V532);
 assert.equal(fresh.remaining,2);
 assert.equal(db.data.get("rawCheckoutThrottleV532/user_one").count,1);
});
test("V5.32 Firestore rules deny writes to payments, prices and device sessions",()=>{
 const rules=file("config/firestore-v532-STAGING.rules");
 assert.match(rules,/rules_version = '2'/);
 assert.match(rules,/request\.auth\.token\.email_verified == true/);
 assert.match(rules,/request\.auth\.uid == uid/);
 assert.match(rules,/allow list, create, update, delete: if false/);
 for(const name of ["rawWalletsV531","rawTokenOrdersV531",
  "rawTokenLedgerV531","rawProcessingRunsV531",
  "rawDeviceRatesV531","rawCheckoutThrottleV532"])
  assert.match(rules,new RegExp("match /"+name));
 assert.match(rules,/match \/\{document=\*\*\}/);
 assert.match(rules,/allow read, write: if false/);
 assert.match(rules,/hasOnly/);
 assert.doesNotMatch(rules,/allow write: if true/);
});
test("V5.32 Cloud Functions HTTP receives raw Stripe payload and has no live-mode default",()=>{
 const entry=file("functions-v532/index.mjs");
 assert.match(entry,/req\.rawBody/);
 assert.match(entry,/rawV532StripeWebhook/);
 assert.match(entry,/rawV532WalletStatus/);
 assert.match(entry,/rawV532CreateCheckout/);
 assert.match(entry,/assertRawStagingV532/);
 assert.match(entry,/createCheckoutThrottleV532/);
 assert.match(entry,/onRequest\(/);
 assert.match(entry,/cors:false/);
 assert.doesNotMatch(entry,/\.listen\s*\(/);
 assert.doesNotMatch(entry,/sk_live_/);
 const pkg=JSON.parse(file("functions-v532/package.json"));
 assert.equal(pkg.engines.node,"22");
 assert.ok(pkg.dependencies["stripe"]&&pkg.dependencies["firebase-admin"]);
 const deployment=JSON.parse(file("firebase-v532-staging.json"));
 assert.equal(deployment.functions.source,"functions-v532");
 assert.equal(deployment.firestore.rules,"config/firestore-v532-STAGING.rules");
 const builder=file("scripts/raw-v532-package-functions.mjs");
 assert.match(builder,/const approved=/);
 assert.doesNotMatch(builder,/copyFileSync\(.+index\.html/);
});
