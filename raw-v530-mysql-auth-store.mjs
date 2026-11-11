/* RAW V5.30 — MySQL local account store, server-only.
 * Login tokens stored only as SHA-256 digest; no plaintext password/session token.
 * mysql2/promise-compatible pool, parameterized queries and no public listener.
 */
import {RawAccessError} from "./raw-v529-identity.mjs";
const fatal=()=>{throw new RawAccessError("AUTH_STORE_UNAVAILABLE",503);};
export function createMySQLAuthStoreV530(pool){
 if(!pool||typeof pool.execute!=="function")fatal();
 const execute=async(sql,params)=>{
  try{return (await pool.execute(sql,params))[0];}
  catch{fatal();}
 };
 return Object.freeze({
  async findUserByEmail(email){
   const rows=await execute(
    "SELECT user_id,password_hash,role,disabled FROM raw_users WHERE email=? LIMIT 1",
    [email]);
   const row=rows[0];if(!row)return null;
   return {uid:row.user_id,passwordHash:row.password_hash,
    disabled:Number(row.disabled)===1,role:row.role};
  },
  async createSession({tokenHash,uid,createdAtMs,expiresAtMs}){
   await execute(
    "INSERT INTO raw_auth_sessions (token_sha256,user_id,created_ms,expires_ms) VALUES (?,?,?,?)",
    [tokenHash,uid,createdAtMs,expiresAtMs]);
  },
  async findActiveSession(tokenHash,atMs){
   const rows=await execute(
    "SELECT u.user_id AS uid,u.role,u.disabled FROM raw_auth_sessions AS s JOIN raw_users AS u ON u.user_id=s.user_id WHERE s.token_sha256=? AND s.revoked_ms IS NULL AND s.expires_ms>? AND u.disabled=0 LIMIT 1",
    [tokenHash,atMs]);
   return rows[0]||null;
  },
  async revokeSession(tokenHash,atMs){
   await execute(
    "UPDATE raw_auth_sessions SET revoked_ms=? WHERE token_sha256=? AND revoked_ms IS NULL",
    [atMs,tokenHash]);
  }
 });
}
