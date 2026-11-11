/* V5.32: fail closed even if someone mistakenly deploys to RAW live Firebase.
 * TEST Stripe only; never issue a live paid Checkout from this release.
 */
import {RawAccessError} from "./raw-v529-identity.mjs";
const fail=(code,status=503)=>{throw new RawAccessError(code,status);};
const PROJECT=/^[a-z][a-z0-9-]{5,29}$/;
export function assertRawStagingV532({
 enabled,projectId,expectedProjectId,stripeKey,webhookSecret
}={}){
 if(enabled!=="true"||
   typeof projectId!=="string"||!PROJECT.test(projectId)||
   projectId!==expectedProjectId||
   !/(staging|sandbox|test)/i.test(projectId)||
   projectId==="remoteaudioworkstation")
  fail("STAGING_PROJECT_REQUIRED");
 if(typeof stripeKey!=="string"||!/^sk_test_[A-Za-z0-9]{8,}$/.test(stripeKey))
  fail("STRIPE_TEST_KEY_REQUIRED");
 if(typeof webhookSecret!=="string"||
   !/^whsec_[A-Za-z0-9]{8,}$/.test(webhookSecret))
  fail("STRIPE_TEST_WEBHOOK_REQUIRED");
 return Object.freeze({mode:"STRIPE_TEST_ONLY",projectId});
}
export function assertRawStagingReadV532({enabled,projectId,expectedProjectId}={}){
 if(enabled!=="true"||
   typeof projectId!=="string"||!PROJECT.test(projectId)||
   projectId!==expectedProjectId||
   !/(staging|sandbox|test)/i.test(projectId)||
   projectId==="remoteaudioworkstation")
  fail("STAGING_PROJECT_REQUIRED");
 return Object.freeze({mode:"READ_ONLY_STAGING",projectId});
}
