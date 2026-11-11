/* RAW V5.30 — self-hosted authentication. No Firebase dependency.
 * Opaque 256-bit bearer tokens, only SHA-256 token digests in MySQL.
 * No public registration endpoint or automatic admin bootstrap.
 * Requires HTTPS ingress, IP throttling, MFA plan and audit before production.
 */
import {createHash,randomBytes} from "node:crypto";
import {RawAccessError} from "./raw-v529-identity.mjs";
import {verifyPasswordV530,RAW_V530_DUMMY_HASH} from "./raw-v530-password.mjs";
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const BEARER=/^Bearer ([A-Za-z0-9_-]{43})$/;
const EMAIL=/^[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
const fail=(code,status=401)=>{throw new RawAccessError(code,status);};
export const hashSessionTokenV530=token=>createHash("sha256").update(token).digest("hex");
export function normalizeEmailV530(email){
 if(typeof email!=="string"||email.length>254)fail("INVALID_EMAIL",400);
 const clean=email.trim().toLowerCase();
 if(!EMAIL.test(clean)||clean.length>254)fail("INVALID_EMAIL",400);
 return clean;
}
export function parseSelfHostedBearerV530(authorization){
 if(typeof authorization!=="string")fail("AUTH_REQUIRED");
 const match=BEARER.exec(authorization);
 if(!match)fail("AUTH_REQUIRED");
 return match[1];
}
export function createLocalAuthV530({store,now=()=>Date.now(),tokenFactory=()=>randomBytes(32).toString("base64url")}={}){
 if(!store||["findUserByEmail","createSession","findActiveSession","revokeSession"].some(
  method=>typeof store[method]!=="function"))fail("AUTH_STORE_MISSING",503);
 const clock=()=>{const t=now();if(!Number.isSafeInteger(t)||t<0)fail("SERVER_CLOCK_INVALID",503);return t;};
 const getIdentity=async authorization=>{
  const token=parseSelfHostedBearerV530(authorization);
  const actor=await store.findActiveSession(hashSessionTokenV530(token),clock());
  if(!actor||actor.disabled||!UID.test(actor.uid||""))fail("AUTH_INVALID");
  return Object.freeze({uid:actor.uid,role:actor.role==="admin"?"admin":"user"});
 };
 const login=async({email,password}={})=>{
  let normalized;
  try{normalized=normalizeEmailV530(email);}catch{fail("AUTH_INVALID");}
  if(typeof password!=="string"||password.length>128||
     Buffer.byteLength(password,"utf8")>256)fail("AUTH_INVALID");
  const user=await store.findUserByEmail(normalized);
  // Unknown accounts still execute an expensive password hash to reduce enumeration.
  const valid=await verifyPasswordV530(password,user?.passwordHash||RAW_V530_DUMMY_HASH);
  if(!valid||!user||user.disabled||!UID.test(user.uid||""))fail("AUTH_INVALID");
  const token=tokenFactory();
  if(typeof token!=="string"||!BEARER.test("Bearer "+token))fail("TOKEN_FACTORY_INVALID",503);
  const createdAtMs=clock(),expiresAtMs=createdAtMs+12*60*60*1000;
  await store.createSession({tokenHash:hashSessionTokenV530(token),
   uid:user.uid,createdAtMs,expiresAtMs});
  return Object.freeze({accessToken:token,tokenType:"Bearer",expiresAtMs,
   user:{uid:user.uid,role:user.role==="admin"?"admin":"user",email:normalized}});
 };
 const logout=async authorization=>{
  const token=parseSelfHostedBearerV530(authorization);
  await store.revokeSession(hashSessionTokenV530(token),clock());
  return Object.freeze({ok:true});
 };
 return Object.freeze({
  login,logout,
  identity:Object.freeze({verify:getIdentity}),
  async me(authorization){return getIdentity(authorization);}
 });
}
