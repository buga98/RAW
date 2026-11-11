/* V5.33 — read-only admin-side financial reconciliation.
 * No browser route and NO mutation. Ledger starts at zero in V5.31:
 * historic legacy credits must not be silently imported.
 * Detects corruption, replay duplicates and wallet/ledger discrepancies.
 */
import {RawAccessError} from "./raw-v529-identity.mjs";
import {RAW_WALLET_COLLECTIONS_V531 as C} from "./raw-v531-firestore-wallet.mjs";
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const fail=(code,status=503)=>{throw new RawAccessError(code,status);};
const micros=n=>Number.isSafeInteger(n)&&Math.abs(n)<=1_000_000_000_000;
export function verifyRawLedgerChainV533(entries,wallet){
 if(!Array.isArray(entries)||entries.length>10000||
   !Number.isSafeInteger(wallet?.balanceMicros)||
   wallet.balanceMicros<0||wallet.balanceMicros>1_000_000_000_000)
  fail("AUDIT_INPUT_INVALID",400);
 let running=0;
 const seen=new Set();
 for(const entry of entries){
  if(!entry||typeof entry.id!=="string"||seen.has(entry.id)||
     !["STRIPE_TOPUP","DEVICE_PROCESSING"].includes(entry.type)||
     !micros(entry.amountMicros)||entry.amountMicros===0||
     !micros(entry.balanceAfterMicros)||entry.balanceAfterMicros<0)
   fail("LEDGER_AUDIT_FAILED");
  seen.add(entry.id);
  if(entry.type==="STRIPE_TOPUP"&&entry.amountMicros<0 ||
     entry.type==="DEVICE_PROCESSING"&&entry.amountMicros>0)
   fail("LEDGER_AUDIT_FAILED");
  running+=entry.amountMicros;
  if(!Number.isSafeInteger(running)||running<0||running!==entry.balanceAfterMicros)
   fail("LEDGER_AUDIT_FAILED");
 }
 if(running!==wallet.balanceMicros)
  fail("WALLET_LEDGER_MISMATCH");
 // A wallet with an active run must still pass reconciliation before release.
 return Object.freeze({ok:true,events:entries.length,balanceMicros:running});
}
export function createRawWalletAuditorV533(db){
 if(!db||typeof db.collection!=="function")fail("FIRESTORE_ADMIN_REQUIRED",503);
 return Object.freeze({
  async inspect(ownerUid){
   if(typeof ownerUid!=="string"||!UID.test(ownerUid))
    fail("INVALID_OWNER",400);
   const [w,l]=await Promise.all([
    db.collection(C.wallet).doc(ownerUid).get(),
    db.collection(C.ledger)
     .where("ownerUid","==",ownerUid)
     .orderBy("createdAtMs","asc")
     .limit(10001).get()
   ]);
   if(!Array.isArray(l?.docs)||l.docs.length>10000)
    fail("LEDGER_AUDIT_TOO_LARGE");
   if(!w?.exists&&l.docs.length!==0)fail("MISSING_WALLET");
   const items=l.docs.map(doc=>({id:doc.id,...doc.data()}));
   if(items.some(x=>x.ownerUid!==ownerUid))fail("LEDGER_OWNER_INTEGRITY");
   return verifyRawLedgerChainV533(items,
    w.exists?w.data():{balanceMicros:0});
  }
 });
}
