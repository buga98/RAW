/* V5.32: Firestore-backed per verified UID checkout start limit.
 * Transactional, unlike an in-memory timer; works with concurrent functions.
 * Limits Stripe session creation, NOT a substitute for edge IP abuse controls.
 */
import {RawAccessError} from "./raw-v529-identity.mjs";
const uid=/^[A-Za-z0-9_-]{1,128}$/;
const fail=(code,status=429)=>{throw new RawAccessError(code,status);};
export const RAW_CHECKOUT_WINDOW_MS_V532=15*60*1000;
export const RAW_CHECKOUT_MAX_PER_WINDOW_V532=3;
export function createCheckoutThrottleV532(firestoreAdmin){
 if(!firestoreAdmin||typeof firestoreAdmin.runTransaction!=="function"||
   typeof firestoreAdmin.collection!=="function")
  fail("CHECKOUT_THROTTLE_MISSING",503);
 const col=firestoreAdmin.collection("rawCheckoutThrottleV532");
 return Object.freeze({
  async consume(ownerUid,atMs){
   if(typeof ownerUid!=="string"||!uid.test(ownerUid)||
      !Number.isSafeInteger(atMs)||atMs<0)
    fail("CHECKOUT_THROTTLE_INVALID",400);
   const ref=col.doc(ownerUid);
   return firestoreAdmin.runTransaction(async tx=>{
    const snap=await tx.get(ref),old=snap.exists?snap.data():null;
    const started=old?.windowStartMs;
    const count=old?.count;
    if(old!==null&&
      (!Number.isSafeInteger(started)||started<0||
       !Number.isSafeInteger(count)||count<0||count>RAW_CHECKOUT_MAX_PER_WINDOW_V532))
      fail("CHECKOUT_THROTTLE_INTEGRITY",503);
    if(old&&atMs<started)fail("CLOCK_MOVED_BACKWARD",503);
    if(old&&atMs-started<RAW_CHECKOUT_WINDOW_MS_V532){
     if(count>=RAW_CHECKOUT_MAX_PER_WINDOW_V532)
      fail("CHECKOUT_LIMIT_REACHED",429);
     tx.update(ref,{count:count+1,updatedAtMs:atMs});
     return Object.freeze({remaining:RAW_CHECKOUT_MAX_PER_WINDOW_V532-count-1});
    }
    const value={windowStartMs:atMs,count:1,updatedAtMs:atMs};
    if(snap.exists)tx.update(ref,value);else tx.create(ref,value);
    return Object.freeze({remaining:RAW_CHECKOUT_MAX_PER_WINDOW_V532-1});
   });
  }
 });
}
