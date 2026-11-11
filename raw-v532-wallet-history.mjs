/* V5.32 server-only wallet ledger read. No direct Firestore client access.
 * Return minimum stable fields, verify owner for every returned document.
 */
import {RawAccessError} from "./raw-v529-identity.mjs";
import {RAW_WALLET_COLLECTIONS_V531 as C} from "./raw-v531-firestore-wallet.mjs";
const fail=(code,status=403)=>{throw new RawAccessError(code,status);};
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const MAX=1_000_000_000_000;
const safeMicros=x=>Number.isSafeInteger(x)&&Math.abs(x)<=MAX;
const positive=x=>Number.isSafeInteger(x)&&x>=0;
export function createRawWalletHistoryV532(db){
 if(!db||typeof db.collection!=="function")
  fail("FIRESTORE_ADMIN_REQUIRED",503);
 return Object.freeze({
  async list(ownerUid){
   if(typeof ownerUid!=="string"||!UID.test(ownerUid))
    fail("INVALID_OWNER",400);
   const result=await db.collection(C.ledger)
    .where("ownerUid","==",ownerUid)
    .orderBy("createdAtMs","desc").limit(25).get();
   if(!result||!Array.isArray(result.docs)||result.docs.length>25)
    fail("LEDGER_INTEGRITY",503);
   const history=result.docs.map(doc=>{
    const data=doc.data();
    if(data?.ownerUid!==ownerUid||
       !["STRIPE_TOPUP","DEVICE_PROCESSING"].includes(data?.type)||
       !safeMicros(data?.amountMicros)||!positive(data?.balanceAfterMicros)||
       data.balanceAfterMicros>MAX||!positive(data?.createdAtMs))
     fail("LEDGER_INTEGRITY",503);
    if(data.type==="STRIPE_TOPUP"&&data.amountMicros<=0)
     fail("LEDGER_INTEGRITY",503);
    if(data.type==="DEVICE_PROCESSING"&&data.amountMicros>=0)
     fail("LEDGER_INTEGRITY",503);
    return Object.freeze({entryId:doc.id,type:data.type,
     amountMicros:data.amountMicros,
     balanceAfterMicros:data.balanceAfterMicros,
     createdAtMs:data.createdAtMs});
   });
   return Object.freeze(history);
  }
 });
}
