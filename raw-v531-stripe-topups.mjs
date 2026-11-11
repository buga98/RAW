/* RAW V5.31 — server-only Stripe Checkout + signed webhook contract.
 * Only signed events for a previously server-created, exact EUR order
 * may credit a wallet. NO client-supplied token amount, UID or paid flag.
 * Requires real Stripe SDK and Firebase Admin store in reviewed deployment.
 */
import {RawAccessError} from "./raw-v529-identity.mjs";
import {rawTopUpMicrosV531} from "./raw-v531-token-math.mjs";
const fail=(code,status=400)=>{throw new RawAccessError(code,status);};
const HTTPS=/^https:\/\/[A-Za-z0-9.-]+(?::443)?(?:\/[^\s]*)?$/;
const STRIPE_CHECKOUT=/^cs_(?:test|live)_[A-Za-z0-9]+$/;
export function createRawStripeTopupsV531({
 identity,store,stripe,webhookSecret,successUrl,cancelUrl,now=()=>Date.now()
}={}){
 if(!identity||typeof identity.verify!=="function"||
  !store||typeof store.createPendingOrder!=="function"||
  typeof store.settlePaidOrder!=="function"||
  !stripe?.checkout?.sessions?.create||
  typeof stripe?.webhooks?.constructEvent!=="function"||
  typeof webhookSecret!=="string"||!webhookSecret||
  !HTTPS.test(successUrl||"")||!HTTPS.test(cancelUrl||""))
  fail("STRIPE_ADAPTER_NOT_CONFIGURED",503);
 const clock=()=>{
  const ms=now();if(!Number.isSafeInteger(ms)||ms<0)fail("SERVER_CLOCK_INVALID",503);
  return ms;
 };
 return Object.freeze({
  async createCheckout({authorization,amountCents}={}){
   const actor=await identity.verify(authorization);
   const tokensMicros=rawTopUpMicrosV531(amountCents);
   const session=await stripe.checkout.sessions.create({
    mode:"payment",payment_method_types:["card"],client_reference_id:actor.uid,
    line_items:[{price_data:{
     currency:"eur",unit_amount:amountCents,
     product_data:{name:"RAW tokeni",description:"1 RAW token = 1 EUR pretplacenih kredita"}
    },quantity:1}],
    success_url:successUrl,cancel_url:cancelUrl,
    metadata:{rawPurpose:"raw_token_topup_v531"}
   });
   if(!STRIPE_CHECKOUT.test(session?.id||"")||
      typeof session?.url!=="string"||!session.url.startsWith("https://"))
    fail("STRIPE_SESSION_INVALID",503);
   // If Firestore write fails, checkout URL never reaches the client.
   // Unknown-order webhooks return a transient error and Stripe retries.
   await store.createPendingOrder({
    checkoutSessionId:session.id,ownerUid:actor.uid,
    amountCents,tokensMicros,currency:"eur",createdAtMs:clock()
   });
   return Object.freeze({checkoutUrl:session.url,checkoutSessionId:session.id});
  },
  async signedWebhook({rawBody,signature}={}){
   if(!(rawBody instanceof Buffer||rawBody instanceof Uint8Array)||
     rawBody.byteLength>256*1024||
     typeof signature!=="string"||signature.length>1024)
    fail("STRIPE_SIGNATURE_REQUIRED",400);
   let event;
   try{event=stripe.webhooks.constructEvent(rawBody,signature,webhookSecret);}
   catch{fail("STRIPE_SIGNATURE_INVALID",400);}
   if(!event||typeof event.id!=="string"||
      !["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event.type))
    return Object.freeze({ignored:true});
   const session=event.data?.object;
   if(session?.payment_status!=="paid")
    return Object.freeze({ignored:true,paymentPending:true});
   if(!STRIPE_CHECKOUT.test(session?.id||"")||
     session?.currency!=="eur"||
     !Number.isSafeInteger(session?.amount_total)||
     typeof session?.client_reference_id!=="string")
    fail("STRIPE_PAID_EVENT_INVALID");
   // The authenticated order is read in a DB transaction; signed metadata
   // alone never creates a wallet or determines whose credits increase.
   return await store.settlePaidOrder({
    checkoutSessionId:session.id,ownerUid:session.client_reference_id,
    amountCents:session.amount_total,currency:"eur",
    stripeEventId:event.id,settledAtMs:clock()
   });
  }
 });
}
