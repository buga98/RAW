/* RAW V5.31 — UNMOUNTED Express adapter, no public listener.
 * Stripe webhook uses RAW bytes before JSON parsers, with signature verified
 * by Stripe SDK. No unverified checkout redirect grants any RAW balance.
 * Firebase Admin credentials and Stripe secret only on the trusted server.
 */
import express from "express";
import {RawAccessError,createTrustedIdentityV529} from "./raw-v529-identity.mjs";
import {createRawFirestoreWalletV531} from "./raw-v531-firestore-wallet.mjs";
import {createRawStripeTopupsV531} from "./raw-v531-stripe-topups.mjs";
export function createRawWalletApiV531({
 firebaseAuth,firestoreAdmin,stripe,webhookSecret,successUrl,cancelUrl,now
}={}){
 if(!firebaseAuth||typeof firebaseAuth.verifyIdToken!=="function")
  throw new RawAccessError("AUTH_ADAPTER_MISSING",503);
 const identity=createTrustedIdentityV529(firebaseAuth);
 const store=createRawFirestoreWalletV531(firestoreAdmin);
 const payment=createRawStripeTopupsV531({
  identity,store,stripe,webhookSecret,successUrl,cancelUrl,now
 });
 const app=express();
 app.disable("x-powered-by");app.set("trust proxy",false);
 app.use((_req,res,next)=>{
  res.set("Cache-Control","no-store");
  res.set("X-Content-Type-Options","nosniff");
  res.set("Referrer-Policy","no-referrer");
  res.set("X-Frame-Options","DENY");
  next();
 });
 const wrap=fn=>async(req,res,next)=>{
  try{await fn(req,res);}catch(e){next(e);}
 };
 // Must be mounted ahead of ANY parent application JSON body middleware.
 app.post("/api/v531/stripe/webhook",
  express.raw({type:"application/json",limit:"256kb"}),
  wrap(async(req,res)=>{
   const result=await payment.signedWebhook({
    rawBody:req.body,signature:req.headers["stripe-signature"]
   });
   res.status(200).json(result);
  })
 );
 app.use(express.json({limit:"8kb",strict:true,type:"application/json"}));
 app.post("/api/v531/wallet/checkout",wrap(async(req,res)=>{
  if(!req.body||Object.keys(req.body).sort().join(",")!=="amountCents")
   throw new RawAccessError("INVALID_TOPUP",400);
  const result=await payment.createCheckout({
   authorization:req.headers.authorization,amountCents:req.body.amountCents
  });
  res.status(201).json(result);
 }));
 app.get("/api/v531/wallet",wrap(async(req,res)=>{
  const actor=await identity.verify(req.headers.authorization);
  res.status(200).json(await store.getWallet(actor.uid));
 }));
 app.use((_req,res)=>res.status(404).json({error:"NOT_FOUND"}));
 app.use((err,_req,res,_next)=>{
  if(err instanceof RawAccessError)
   return res.status(err.status).json({error:err.code});
  if(err?.type==="entity.too.large")
   return res.status(413).json({error:"PAYLOAD_TOO_LARGE"});
  if(err instanceof SyntaxError&&"body" in err)
   return res.status(400).json({error:"INVALID_JSON"});
  // Generic retryable errors; never swallow a failed wallet transaction as 200.
  return res.status(503).json({error:"WALLET_SERVICE_UNAVAILABLE"});
 });
 return app;
}
