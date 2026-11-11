/* RAW V5.32 staging Cloud Functions v2 — NO live money, NO hardware.
 * This package contains ONLY audited backend modules copied by
 * scripts/raw-v532-package-functions.mjs; no renderer/audio files or secrets.
 * Always reject the production RAW project and Stripe live API keys.
 */
import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import {initializeApp,getApps,getApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import Stripe from "stripe";
import {createTrustedIdentityV529,RawAccessError} from "./core/raw-v529-identity.mjs";
import {createRawFirestoreWalletV531} from "./core/raw-v531-firestore-wallet.mjs";
import {createRawStripeTopupsV531} from "./core/raw-v531-stripe-topups.mjs";
import {createCheckoutThrottleV532} from "./core/raw-v532-checkout-throttle.mjs";
import {assertRawStagingV532,assertRawStagingReadV532} from "./core/raw-v532-staging-guard.mjs";

if(getApps().length===0)initializeApp();
const region="europe-west1";
const base={region,cors:false,minInstances:0,maxInstances:2,concurrency:8,
 memory:"256MiB",timeoutSeconds:30};
const stripeSecret=defineSecret("RAW_V532_STRIPE_TEST_SECRET_KEY");
const signatureSecret=defineSecret("RAW_V532_STRIPE_TEST_WEBHOOK_SECRET");
const projectId=()=>getApp().options.projectId||process.env.GCLOUD_PROJECT||process.env.GCP_PROJECT;
const config=()=>({enabled:process.env.RAW_V532_STAGING_ENABLED,
 projectId:projectId(),expectedProjectId:process.env.RAW_V532_STAGING_PROJECT_ID});
function safeHeaders(res){
 res.set("Cache-Control","no-store");
 res.set("X-Content-Type-Options","nosniff");
 res.set("Referrer-Policy","no-referrer");
 res.set("Content-Security-Policy","default-src 'none'");
 res.set("X-Frame-Options","DENY");
}
function abort(error,res){
 if(error instanceof RawAccessError)
  return res.status(error.status).json({error:error.code});
 if(error instanceof RangeError)
  return res.status(400).json({error:"INVALID_RAW_AMOUNT"});
 // In staging, don't leak credentials, user IDs, invoice or stack traces.
 return res.status(503).json({error:"RAW_STAGING_UNAVAILABLE"});
}
function store(){return createRawFirestoreWalletV531(getFirestore());}
function identity(){return createTrustedIdentityV529(getAuth());}
function stripeClient(){
 const key=stripeSecret.value();
 return new Stripe(key,{maxNetworkRetries:1,timeout:10000});
}
function payment(){
 return createRawStripeTopupsV531({
  identity:identity(),store:store(),stripe:stripeClient(),
  webhookSecret:signatureSecret.value(),
  successUrl:process.env.RAW_V532_STRIPE_SUCCESS_URL,
  cancelUrl:process.env.RAW_V532_STRIPE_CANCEL_URL
 });
}
function requireStaging(){
 return assertRawStagingV532({...config(),stripeKey:stripeSecret.value(),
  webhookSecret:signatureSecret.value()});
}
export const rawV532WalletStatus=onRequest(base,async(req,res)=>{
 safeHeaders(res);
 if(req.method!=="GET")return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
 try{
  assertRawStagingReadV532(config());
  const owner=await identity().verify(req.headers.authorization);
  return res.status(200).json(await store().getWallet(owner.uid));
 }catch(error){return abort(error,res);}
});
export const rawV532CreateCheckout=onRequest({
 ...base,secrets:[stripeSecret,signatureSecret]
},async(req,res)=>{
 safeHeaders(res);
 if(req.method!=="POST")return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
 try{
  requireStaging();
  if(!req.is("application/json")||
     !req.body||typeof req.body!=="object"||
     Object.keys(req.body).sort().join(",")!=="amountCents")
   return res.status(400).json({error:"INVALID_TOPUP"});
  const actor=await identity().verify(req.headers.authorization);
  // Firestore transaction persists across instances, unlike an in-memory counter.
  await createCheckoutThrottleV532(getFirestore()).consume(actor.uid,Date.now());
  const result=await payment().createCheckout({
   authorization:req.headers.authorization,amountCents:req.body.amountCents
  });
  return res.status(201).json(result);
 }catch(error){return abort(error,res);}
});
export const rawV532StripeWebhook=onRequest({
 ...base,secrets:[stripeSecret,signatureSecret]
},async(req,res)=>{
 safeHeaders(res);
 if(req.method!=="POST")return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
 try{
  requireStaging();
  // req.rawBody, not parsed req.body, is required to validate Stripe signature
  const result=await payment().signedWebhook({
   rawBody:req.rawBody,signature:req.headers["stripe-signature"]
  });
  return res.status(200).json(result);
 }catch(error){return abort(error,res);}
});
