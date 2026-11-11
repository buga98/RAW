/* RAW V5.29 — server-side Firestore booking store.
 * Requires Firebase Admin Firestore on a trusted backend. Atomic 15-min
 * slot documents prevent overlapping reservations even across clients.
 * Do not grant direct Firestore client access to these collections.
 */
import {RawAccessError} from "./raw-v529-identity.mjs";
import {V529_SLOT_MS} from "./raw-v529-trusted-bookings.mjs";
const denied=(code,status=403)=>{throw new RawAccessError(code,status);};
const ID=/^[A-Za-z0-9_-]{4,128}$/;
const COLLECTIONS=Object.freeze({
 studios:"rawV529Studios",bookings:"rawV529Bookings",slots:"rawV529Slots"
});
const bookingOf=snap=>snap.exists?{id:snap.id,...snap.data()}:null;
function slotsFor(studioId,startsAtMs,endsAtMs){
 const n=(endsAtMs-startsAtMs)/V529_SLOT_MS;
 if(!ID.test(studioId||"")||!Number.isSafeInteger(n)||
  n<1||n>16||startsAtMs%V529_SLOT_MS!==0)
  denied("INVALID_SLOT_RANGE",400);
 const result=[];
 for(let index=0;index<n;index++){
  const slotIndex=(startsAtMs/V529_SLOT_MS)+index;
  result.push(studioId+"_"+slotIndex);
 }
 return result;
}
export function createFirestoreBookingStoreV529(db){
 if(!db||typeof db.collection!=="function"||typeof db.runTransaction!=="function")
  denied("FIRESTORE_ADAPTER_MISSING",503);
 const studios=db.collection(COLLECTIONS.studios);
 const bookings=db.collection(COLLECTIONS.bookings);
 const slots=db.collection(COLLECTIONS.slots);
 return Object.freeze({
  async book({ownerUid,studioId,startsAtMs,endsAtMs,createdAtMs}={}){
   if(!ID.test(ownerUid||"")||!Number.isSafeInteger(createdAtMs))
    denied("INVALID_OWNER",400);
   const slotIds=slotsFor(studioId,startsAtMs,endsAtMs);
   const studioRef=studios.doc(studioId),bookingRef=bookings.doc();
   const slotRefs=slotIds.map(id=>slots.doc(id));
   return await db.runTransaction(async tx=>{
    const studioSnap=await tx.get(studioRef);
    if(!studioSnap.exists||studioSnap.data()?.bookable!==true)
     denied("STUDIO_NOT_BOOKABLE",404);
    // Firestore requires all reads before writes.
    const snapshots=[];
    for(const ref of slotRefs)snapshots.push(await tx.get(ref));
    if(snapshots.some(snap=>snap.exists))
     denied("SLOT_UNAVAILABLE",409);
    const data={ownerUid,studioId,startsAtMs,endsAtMs,
     slotIds,createdAtMs,status:"reserved"};
    tx.create(bookingRef,data);
    for(const ref of slotRefs)
     tx.create(ref,{bookingId:bookingRef.id,ownerUid,studioId});
    return {id:bookingRef.id,...data};
   });
  },
  async get(bookingId){
   if(!ID.test(bookingId||""))denied("INVALID_BOOKING_ID",400);
   return bookingOf(await bookings.doc(bookingId).get());
  },
  async list(ownerUid){
   if(!ID.test(ownerUid||""))denied("INVALID_OWNER",400);
   const result=await bookings.where("ownerUid","==",ownerUid).limit(50).get();
   return result.docs.map(bookingOf).filter(Boolean);
  },
  async cancel({bookingId,ownerUid,nowMs}={}){
   if(!ID.test(bookingId||"")||!ID.test(ownerUid||"")||
    !Number.isSafeInteger(nowMs))denied("INVALID_CANCEL",400);
   const ref=bookings.doc(bookingId);
   return await db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    const data=bookingOf(snap);
    if(!data||data.ownerUid!==ownerUid)denied("NOT_FOUND",404);
    if(data.status!=="reserved"||nowMs>=data.startsAtMs)
     denied("CANNOT_CANCEL",409);
    const expected=slotsFor(data.studioId,data.startsAtMs,data.endsAtMs);
    if(!Array.isArray(data.slotIds)||expected.length!==data.slotIds.length||
      expected.some((id,i)=>id!==data.slotIds[i]))
     denied("SLOT_INTEGRITY",503);
    const slotRefs=expected.map(id=>slots.doc(id));
    const checks=[];
    for(const slotRef of slotRefs)checks.push(await tx.get(slotRef));
    if(checks.some(s=>!s.exists||
      s.data()?.bookingId!==bookingId||s.data()?.ownerUid!==ownerUid))
     denied("SLOT_INTEGRITY",503);
    tx.update(ref,{status:"cancelled",cancelledAtMs:nowMs});
    for(const slotRef of slotRefs)tx.delete(slotRef);
    return {...data,status:"cancelled",cancelledAtMs:nowMs};
   });
  }
 });
}
export {COLLECTIONS as RAW_V529_COLLECTIONS};
