/* RAW V5.29 — trusted ID token verification boundary.
 * Firebase Admin Auth instance MUST be initialized on a trusted server with
 * the expected project ID. Never trust renderer-supplied UID or role.
 * Not used by the disabled legacy services or local demo.
 */
export class RawAccessError extends Error {
 constructor(code,status=403){
  super(code);this.name="RawAccessError";this.code=code;this.status=status;
 }
}
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const TOKEN=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
export function parseBearerV529(value){
 if(typeof value!=="string"||value.length>8192||
    !value.startsWith("Bearer "))
  throw new RawAccessError("AUTH_REQUIRED",401);
 const token=value.slice(7);
 if(token.length<20||token.length>8000||!TOKEN.test(token))
  throw new RawAccessError("AUTH_REQUIRED",401);
 return token;
}
export function createTrustedIdentityV529(firebaseAuth){
 if(!firebaseAuth||typeof firebaseAuth.verifyIdToken!=="function")
  throw new RawAccessError("AUTH_ADAPTER_MISSING",503);
 return Object.freeze({
  async verify(authorization){
   const token=parseBearerV529(authorization);
   let claims;
   try{
    // Admin SDK verifies signature, expiry, issuer, audience and revocation.
    claims=await firebaseAuth.verifyIdToken(token,true);
   }catch{
    throw new RawAccessError("AUTH_INVALID",401);
   }
   if(!claims||!UID.test(claims.uid||""))
    throw new RawAccessError("AUTH_INVALID",401);
   if(claims.email_verified!==true)
    throw new RawAccessError("EMAIL_NOT_VERIFIED",403);
   if(claims.rawAccessDisabled===true)
    throw new RawAccessError("ACCESS_DISABLED",403);
   return Object.freeze({uid:claims.uid});
  }
 });
}
