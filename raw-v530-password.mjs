/* RAW V5.30 — password hashing with Node's built-in memory-hard scrypt.
 * OWASP-compatible scrypt minimum: N=32768, r=8, p=3.
 * No plain text passwords, fast hashes, or reversible encryption.
 */
import {randomBytes,scrypt,timingSafeEqual} from "node:crypto";
import {promisify} from "node:util";
const derive=promisify(scrypt);
const OPTIONS=Object.freeze({N:32768,r:8,p:3,maxmem:64*1024*1024});
const HASH_FORMAT=/^scrypt-v1\$32768\$8\$3\$([0-9a-f]{32})\$([0-9a-f]{64})$/;
function goodPassword(value){
 return typeof value==="string"&&value.length>=12&&
  value.length<=128&&Buffer.byteLength(value,"utf8")<=256&&
  !/[\u0000-\u001f\u007f]/.test(value);
}
export async function hashPasswordV530(password,{salt=randomBytes(16)}={}){
 if(!goodPassword(password))throw Object.assign(new Error("INVALID_PASSWORD"),{code:"INVALID_PASSWORD"});
 if(!Buffer.isBuffer(salt)||salt.length!==16)
  throw Object.assign(new Error("INVALID_SALT"),{code:"INVALID_SALT"});
 const derived=await derive(password,salt,32,OPTIONS);
 return "scrypt-v1$32768$8$3$"+salt.toString("hex")+"$"+derived.toString("hex");
}
export async function verifyPasswordV530(password,storedHash){
 if(typeof password!=="string"||password.length>128||
   Buffer.byteLength(password,"utf8")>256||typeof storedHash!=="string")return false;
 const parts=HASH_FORMAT.exec(storedHash);
 if(!parts)return false;
 const actual=await derive(password,Buffer.from(parts[1],"hex"),32,OPTIONS);
 return timingSafeEqual(actual,Buffer.from(parts[2],"hex"));
}
export const RAW_V530_DUMMY_HASH="scrypt-v1$32768$8$3$"+"0".repeat(32)+"$"+"0".repeat(64);
