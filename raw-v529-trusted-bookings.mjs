/* RAW V5.29 — verified owner-scoped reservation and access policy.
 * NO physical hardware lease, billing, cloud upload or master delivery.
 * All booking authorization is server-side, never supplied by the client.
 */
import {RawAccessError,createTrustedIdentityV529} from "./raw-v529-identity.mjs";
export const V529_SLOT_MS=15*60*1000;
const MAX_ADVANCE_MS=90*24*60*60*1000;
const STUDIO=/^[A-Za-z0-9_-]{4,64}$/;
const BOOKING=/^[A-Za-z0-9_-]{8,96}$/;
const fail=(code,status=400)=>{throw new RawAccessError(code,status);};
const own=(data,uid)=>data&&data.ownerUid===uid;
const snapshot=(data)=>Object.freeze({
 id:data.id,studioId:data.studioId,startsAtMs:data.startsAtMs,
 endsAtMs:data.endsAtMs,status:data.status
});
export function validateBookingV529(input,nowMs){
 if(!input||typeof input!=="object"||Array.isArray(input)||
  Object.keys(input).sort().join(",")!=="endsAtMs,startsAtMs,studioId")
  fail("INVALID_BOOKING");
 const {studioId,startsAtMs,endsAtMs}=input;
 if(typeof studioId!=="string"||!STUDIO.test(studioId)||
  !Number.isSafeInteger(startsAtMs)||!Number.isSafeInteger(endsAtMs)||
  startsAtMs%V529_SLOT_MS!==0||endsAtMs%V529_SLOT_MS!==0||
  startsAtMs<nowMs+V529_SLOT_MS||startsAtMs>nowMs+MAX_ADVANCE_MS||
  endsAtMs<=startsAtMs||endsAtMs-startsAtMs>4*60*60*1000)
  fail("INVALID_BOOKING");
 return Object.freeze({studioId,startsAtMs,endsAtMs});
}
export function createTrustedBookingServiceV529({firebaseAuth,store,now=()=>Date.now()}={}){
 const identity=createTrustedIdentityV529(firebaseAuth);
 if(!store||["book","list","get","cancel"].some(k=>typeof store[k]!=="function"))
  fail("BOOKING_STORE_MISSING",503);
 const checkNow=()=>{
  const x=now();if(!Number.isSafeInteger(x)||x<0)fail("SERVER_CLOCK_INVALID",503);
  return x;
 };
 const auth=authorization=>identity.verify(authorization);
 const checkedId=id=>{if(typeof id!=="string"||!BOOKING.test(id))fail("INVALID_BOOKING_ID");return id;};
 return Object.freeze({
  async book({authorization,input}={}){
   const actor=await auth(authorization),time=checkNow();
   const data=validateBookingV529(input,time);
   const item=await store.book({...data,ownerUid:actor.uid,createdAtMs:time});
   if(!own(item,actor.uid)||item.status!=="reserved")fail("STORE_INTEGRITY",503);
   return snapshot(item);
  },
  async list({authorization}={}){
   const actor=await auth(authorization);
   const items=await store.list(actor.uid);
   if(!Array.isArray(items)||items.length>50||
    items.some(item=>!own(item,actor.uid)))
    fail("STORE_INTEGRITY",503);
   return Object.freeze(items.map(snapshot));
  },
  async get({authorization,bookingId}={}){
   const actor=await auth(authorization),item=await store.get(checkedId(bookingId));
   if(!own(item,actor.uid))fail("NOT_FOUND",404);
   return snapshot(item);
  },
  async cancel({authorization,bookingId}={}){
   const actor=await auth(authorization);
   const item=await store.cancel({bookingId:checkedId(bookingId),ownerUid:actor.uid,nowMs:checkNow()});
   if(!own(item,actor.uid)||item.status!=="cancelled")fail("STORE_INTEGRITY",503);
   return snapshot(item);
  },
  async checkStudioEligibility({authorization,bookingId}={}){
   const actor=await auth(authorization),item=await store.get(checkedId(bookingId));
   if(!own(item,actor.uid))fail("NOT_FOUND",404);
   const time=checkNow();
   if(item.status!=="reserved"||time<item.startsAtMs-5*60*1000||
      time>=item.endsAtMs)fail("SESSION_NOT_IN_WINDOW",403);
   // Eligibility is not a physical studio agent lease or ACK.
   return Object.freeze({eligible:true,bookingId:item.id,studioId:item.studioId,
    ownerUid:actor.uid,hardwareAuthorized:false});
  }
 });
}
