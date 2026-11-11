/* RAW V5.29 — strict bearer-only trusted-booking API adapter.
 * Import/create does NOT listen on any port. A separately reviewed backend
 * must supply real Firebase Admin Auth and Firestore, trusted TLS, rate limiting,
 * observability and deployment credentials before exposing this to users.
 */
import express from "express";
import {RawAccessError} from "./raw-v529-identity.mjs";
import {createTrustedBookingServiceV529} from "./raw-v529-trusted-bookings.mjs";
export function createTrustedBookingApiV529({firebaseAuth,identity,store,now,routePrefix="/api/v529"}={}){
 const service=createTrustedBookingServiceV529({firebaseAuth,identity,store,now});
 if(!["/api/v529","/api/v530"].includes(routePrefix))
  throw new RawAccessError("INVALID_API_PREFIX",503);
 const app=express();
 app.disable("x-powered-by");
 app.set("trust proxy",false);
 app.use((_req,res,next)=>{
  res.set("Cache-Control","no-store");
  res.set("X-Content-Type-Options","nosniff");
  res.set("Referrer-Policy","no-referrer");
  res.set("Content-Security-Policy","default-src 'none'");
  res.set("X-Frame-Options","DENY");
  next();
 });
 // Intentionally NO cross-origin access and NO cookie-session fallback.
 app.use(express.json({limit:"8kb",strict:true,type:"application/json"}));
 const wrap=fn=>async(req,res,next)=>{
  try{await fn(req,res);}catch(error){next(error);}
 };
 const bearer=req=>req.headers.authorization;
 app.get(routePrefix+"/bookings",wrap(async(req,res)=>{
  const items=await service.list({authorization:bearer(req)});
  res.status(200).json({bookings:items});
 }));
 app.post(routePrefix+"/bookings",wrap(async(req,res)=>{
  const booking=await service.book({authorization:bearer(req),input:req.body});
  res.status(201).json({booking});
 }));
 app.get(routePrefix+"/bookings/:bookingId",wrap(async(req,res)=>{
  const booking=await service.get({authorization:bearer(req),bookingId:req.params.bookingId});
  res.status(200).json({booking});
 }));
 app.delete(routePrefix+"/bookings/:bookingId",wrap(async(req,res)=>{
  const booking=await service.cancel({authorization:bearer(req),bookingId:req.params.bookingId});
  res.status(200).json({booking});
 }));
 app.post(routePrefix+"/bookings/:bookingId/eligibility",wrap(async(req,res)=>{
  const eligibility=await service.checkStudioEligibility({
   authorization:bearer(req),bookingId:req.params.bookingId
  });
  res.status(200).json({eligibility});
 }));
 app.use((_req,res)=>res.status(404).json({error:"NOT_FOUND"}));
 app.use((error,_req,res,_next)=>{
  // Fail closed; never leak credentials, token, stack trace or Firestore data.
  if(error instanceof RawAccessError)
   return res.status(error.status).json({error:error.code});
  if(error?.type==="entity.too.large")
   return res.status(413).json({error:"PAYLOAD_TOO_LARGE"});
  if(error instanceof SyntaxError&&"body" in error)
   return res.status(400).json({error:"INVALID_JSON"});
  return res.status(503).json({error:"SERVICE_UNAVAILABLE"});
 });
 return app;
}
