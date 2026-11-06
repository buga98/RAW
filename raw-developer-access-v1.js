/* RAW Developer LAB UI access policy.
 * Only a verified Firebase account can see LOCAL TEST-only developer panels.
 * This is a client-side UI policy; any future privileged backend must
 * independently verify Firebase ID tokens/UID and enforce server-side ACLs.
 */
(function(global){
"use strict";
const OWNER_EMAIL="luka.buga@gmail.com";
const lower=x=>typeof x==="string"?x.trim().toLowerCase():"";
function grant({testMode=false,user=null,tokenResult=null,activeUid=null}={}){
 if(testMode!==true||!user||!tokenResult||!activeUid)return false;
 if(user.emailVerified!==true||lower(user.email)!==OWNER_EMAIL)return false;
 const claims=tokenResult.claims;
 if(!claims||claims.email_verified!==true||lower(claims.email)!==OWNER_EMAIL)return false;
 if(typeof user.uid!=="string"||user.uid.length<1||user.uid!==activeUid)return false;
 // Never treat a Firestore self-declared role, a query parameter or local storage
 // as authority. The only transport here is the local disconnected test simulator.
 return true;
}
global.RAWDeveloperAccessV1=Object.freeze({OWNER_EMAIL,grant});
})(typeof window!=="undefined"?window:globalThis);
