/* RAW V5.31 — Firebase Admin Firestore-only wallet writes.
 * All money/token changes are atomic server-side transactions. Browser has
 * read-only own wallet status and cannot create orders, ledger or credits.
 * The legacy users/{uid}.credits is NOT the source of truth.
 */
import {RawAccessError} from "./raw-v529-identity.mjs";
import {RAW_MAX_BALANCE_MICROS_V531,rawTopUpMicrosV531} from "./raw-v531-token-math.mjs";
const fail=(code,status=403)=>{throw new RawAccessError(code,status);};
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const ORDER=/^cs_(?:test|live)_[A-Za-z0-9]+$/;
const EVENT=/^evt_[A-Za-z0-9]+$/;
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const uidOk=x=>typeof x==="string"&&UID.test(x);
const walletValue=data=>{
 const n=data?.balanceMicros??0;
 if(!integer(n)||n>RAW_MAX_BALANCE_MICROS_V531)fail("WALLET_INTEGRITY",503);
 return n;
};
export const RAW_WALLET_COLLECTIONS_V531=Object.freeze({
 wallet:"rawWalletsV531",orders:"rawTokenOrdersV531",
 ledger:"rawTokenLedgerV531",processing:"rawProcessingRunsV531",rates:"rawDeviceRatesV531"
});
export function createRawFirestoreWalletV531(db){
 if(!db||typeof db.collection!=="function"||typeof db.runTransaction!=="function")
  fail("FIRESTORE_ADMIN_REQUIRED",503);
 const cs=RAW_WALLET_COLLECTIONS_V531;
 const wallet=db.collection(cs.wallet),orders=db.collection(cs.orders),
  ledger=db.collection(cs.ledger);
 return Object.freeze({
  async createPendingOrder({checkoutSessionId,ownerUid,amountCents,tokensMicros,currency,createdAtMs}={}){
   if(!ORDER.test(checkoutSessionId||"")||!uidOk(ownerUid)||
     currency!=="eur"||!integer(createdAtMs)||
     rawTopUpMicrosV531(amountCents)!==tokensMicros)fail("INVALID_ORDER",400);
   // Unique Stripe Checkout ID; never make a duplicate pending order.
   await orders.doc(checkoutSessionId).create({
    ownerUid,amountCents,tokensMicros,currency,status:"pending",createdAtMs
   });
   return Object.freeze({checkoutSessionId,status:"pending"});
  },
  async settlePaidOrder({checkoutSessionId,ownerUid,amountCents,currency,stripeEventId,settledAtMs}={}){
   if(!ORDER.test(checkoutSessionId||"")||!uidOk(ownerUid)||
      !EVENT.test(stripeEventId||"")||currency!=="eur"||
      !integer(settledAtMs))fail("INVALID_STRIPE_EVENT",400);
   const amountMicros=rawTopUpMicrosV531(amountCents);
   const orderRef=orders.doc(checkoutSessionId),
    walletRef=wallet.doc(ownerUid),
    ledgerRef=ledger.doc("stripe_"+checkoutSessionId);
   return db.runTransaction(async tx=>{
    // All reads happen before writes; Firestore retries concurrent wallet updates.
    const [orderSnap,walletSnap,ledgerSnap]=await Promise.all([
     tx.get(orderRef),tx.get(walletRef),tx.get(ledgerRef)
    ]);
    if(!orderSnap.exists)
     fail("ORDER_NOT_YET_RECORDED",503); // retry from Stripe, no credit
    const order=orderSnap.data();
    if(order?.ownerUid!==ownerUid||order?.currency!=="eur"||
       order?.amountCents!==amountCents||
       order?.tokensMicros!==amountMicros)
     fail("PAYMENT_ORDER_MISMATCH",403);
    if(order.status==="paid"){
     if(!ledgerSnap.exists||ledgerSnap.data()?.ownerUid!==ownerUid)
      fail("LEDGER_INTEGRITY",503);
     return Object.freeze({credited:false,duplicate:true});
    }
    if(order.status!=="pending"||ledgerSnap.exists)
     fail("ORDER_INTEGRITY",503);
    const before=walletValue(walletSnap.exists?walletSnap.data():null);
    const after=before+amountMicros;
    if(!integer(after)||after>RAW_MAX_BALANCE_MICROS_V531)
     fail("WALLET_LIMIT",409);
    tx.set(walletRef,{balanceMicros:after,updatedAtMs:settledAtMs},{merge:true});
    tx.update(orderRef,{status:"paid",stripeEventId,settledAtMs});
    tx.create(ledgerRef,{
     ownerUid,type:"STRIPE_TOPUP",checkoutSessionId,stripeEventId,
     amountMicros,balanceAfterMicros:after,createdAtMs:settledAtMs
    });
    return Object.freeze({credited:true,duplicate:false});
   });
  },
  async getWallet(ownerUid){
   if(!uidOk(ownerUid))fail("INVALID_OWNER",400);
   const snap=await wallet.doc(ownerUid).get();
   return Object.freeze({balanceMicros:walletValue(snap.exists?snap.data():null)});
  }
 });
}
