/* RAW V5.30 — self-hosted auth and booking HTTP API.
 * No Firebase. NEVER exposes DB to clients or automatically opens a port.
 * Explicit reverse proxy TLS, origin controls and persistent audit remain
 * release prerequisites; this module is a staging backend, not production.
 */
import express from "express";
import {RawAccessError} from "./raw-v529-identity.mjs";
import {createTrustedBookingApiV529} from "./raw-v529-bookings-api.mjs";
import {createMySQLBookingStoreV530} from "./raw-v530-mysql-bookings.mjs";
import {createMySQLAuthStoreV530} from "./raw-v530-mysql-auth-store.mjs";
import {createLocalAuthV530} from "./raw-v530-local-auth.mjs";

export function createSelfHostedRawApiV530({pool,now=()=>Date.now()}={}){
 const auth=createLocalAuthV530({store:createMySQLAuthStoreV530(pool),now});
 const bookings=createMySQLBookingStoreV530(pool);
 const bookingApp=createTrustedBookingApiV529({
  identity:auth.identity,store:bookings,now,routePrefix:"/api/v530"
 });
 const app=express(), attempts=new Map();
 app.disable("x-powered-by");app.set("trust proxy",false);
 app.use((_req,res,next)=>{
  res.set("Cache-Control","no-store");
  res.set("X-Content-Type-Options","nosniff");
  res.set("Referrer-Policy","no-referrer");
  res.set("X-Frame-Options","DENY");
  res.set("Content-Security-Policy","default-src 'none'");
  next();
 });
 app.use(express.json({strict:true,limit:"8kb",type:"application/json"}));
 const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
 // Single-process / loopback development throttle only.
 // A trusted HTTPS ingress with durable distributed rate limiting is still required.
 const throttle=req=>{
  const key=String(req.socket.remoteAddress||"unknown");
  const at=now(),windowMs=15*60*1000;
  if(attempts.size>4096)attempts.clear();
  const old=attempts.get(key);
  const current=!old||at-old.windowStart>=windowMs
   ?{windowStart:at,count:0}:old;
  if(current.count>=8)
   throw new RawAccessError("RATE_LIMITED",429);
  current.count++;
  attempts.set(key,current);
 };
 app.post("/api/v530/auth/login",wrap(async(req,res)=>{
  throttle(req);
  if(!req.body||Object.keys(req.body).sort().join(",")!=="email,password")
   throw new RawAccessError("AUTH_INVALID",401);
  const result=await auth.login(req.body);
  res.status(200).json(result);
 }));
 app.get("/api/v530/auth/me",wrap(async(req,res)=>{
  res.status(200).json({user:await auth.me(req.headers.authorization)});
 }));
 app.post("/api/v530/auth/logout",wrap(async(req,res)=>{
  res.status(200).json(await auth.logout(req.headers.authorization));
 }));
 app.use(bookingApp);
 app.use((error,_req,res,_next)=>{
  if(error instanceof RawAccessError)return res.status(error.status).json({error:error.code});
  if(error?.type==="entity.too.large")return res.status(413).json({error:"PAYLOAD_TOO_LARGE"});
  if(error instanceof SyntaxError&&"body" in error)return res.status(400).json({error:"INVALID_JSON"});
  return res.status(503).json({error:"SERVICE_UNAVAILABLE"});
 });
 return app;
}
