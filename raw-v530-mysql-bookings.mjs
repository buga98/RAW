/* RAW V5.30 — transactional MySQL/MariaDB booking store.
 * Server-side only. mysql2/promise-compatible pool injected for testability.
 * Unique(studio_id,slot_ms) makes overlap rejection authoritative.
 * Never connects directly from Electron and never controls hardware.
 */
import {randomUUID} from "node:crypto";
import {RawAccessError} from "./raw-v529-identity.mjs";
import {V529_SLOT_MS,validateBookingV529} from "./raw-v529-trusted-bookings.mjs";
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(code,status=400)=>{throw new RawAccessError(code,status);};
const checked=(value,re)=>typeof value==="string"&&re.test(value);
const n=value=>{
 if(typeof value!=="string"&&typeof value!=="number"&&typeof value!=="bigint")fail("STORE_INTEGRITY",503);
 const number=Number(value);
 if(!Number.isSafeInteger(number)||number<0||
   (typeof value==="bigint"&&BigInt(number)!==value)||
   (typeof value==="string"&&String(number)!==value))
  fail("STORE_INTEGRITY",503);
 return number;
};
const mapped=row=>row?{
 id:row.booking_id,ownerUid:row.owner_uid,studioId:row.studio_id,
 startsAtMs:n(row.starts_ms),endsAtMs:n(row.ends_ms),status:row.status
}:null;
export function mysqlFailureV530(error){
 if(error instanceof RawAccessError)return error;
 if(error?.errno===1062||error?.code==="ER_DUP_ENTRY")
  return new RawAccessError("SLOT_UNAVAILABLE",409);
 if([1213,1205].includes(error?.errno)||
  ["ER_LOCK_DEADLOCK","ER_LOCK_WAIT_TIMEOUT"].includes(error?.code))
  return new RawAccessError("DB_CONFLICT_RETRY",503);
 return new RawAccessError("STORE_UNAVAILABLE",503);
}
export function createMySQLBookingStoreV530(pool,{idFactory=randomUUID}={}){
 if(!pool||typeof pool.getConnection!=="function"||typeof idFactory!=="function")
  fail("DB_ADAPTER_MISSING",503);
 async function access(callback,transaction=false){
  let connection,active=false;
  try{
   connection=await pool.getConnection();
   if(!connection||typeof connection.execute!=="function"||typeof connection.release!=="function")
    fail("DB_ADAPTER_MISSING",503);
   if(transaction){
    if(typeof connection.beginTransaction!=="function"||
       typeof connection.commit!=="function"||
       typeof connection.rollback!=="function")fail("DB_ADAPTER_MISSING",503);
    await connection.beginTransaction();active=true;
   }
   const result=await callback(connection);
   if(active){await connection.commit();active=false;}
   return result;
  }catch(error){
   if(active){try{await connection.rollback();}catch{}}
   throw mysqlFailureV530(error);
  }finally{if(connection)connection.release();}
 }
 return Object.freeze({
  async book({ownerUid,studioId,startsAtMs,endsAtMs,createdAtMs}={}){
   if(!checked(ownerUid,UID)||!Number.isSafeInteger(createdAtMs)||createdAtMs<0)
    fail("INVALID_BOOKING");
   validateBookingV529({studioId,startsAtMs,endsAtMs},createdAtMs);
   const id=idFactory();
   if(!checked(id,UUID))fail("INVALID_BOOKING_ID");
   const starts=[];
   for(let t=startsAtMs;t<endsAtMs;t+=V529_SLOT_MS)starts.push(t);
   if(starts.length<1||starts.length>16)fail("INVALID_BOOKING");
   return access(async c=>{
    // Serialization for a single studio is conservative but safe and simple.
    const [studio]=await c.execute(
     "SELECT bookable FROM raw_studios WHERE studio_id=? FOR UPDATE",[studioId]);
    if(studio.length!==1||Number(studio[0].bookable)!==1)
     fail("STUDIO_NOT_BOOKABLE",404);
    await c.execute(
     "INSERT INTO raw_bookings (booking_id,owner_uid,studio_id,starts_ms,ends_ms,created_ms,status) VALUES (?,?,?,?,?,?,'reserved')",
     [id,ownerUid,studioId,startsAtMs,endsAtMs,createdAtMs]);
    for(const t of starts){
     await c.execute(
      "INSERT INTO raw_booking_slots (studio_id,slot_ms,booking_id,owner_uid) VALUES (?,?,?,?)",
      [studioId,t,id,ownerUid]);
    }
    return {id,ownerUid,studioId,startsAtMs,endsAtMs,status:"reserved"};
   },true);
  },
  async get(bookingId){
   if(!checked(bookingId,UUID))fail("INVALID_BOOKING_ID");
   return access(async c=>{
    const [rows]=await c.execute(
     "SELECT booking_id,owner_uid,studio_id,starts_ms,ends_ms,status FROM raw_bookings WHERE booking_id=? LIMIT 1",
     [bookingId]);
    return mapped(rows[0]||null);
   });
  },
  async list(ownerUid){
   if(!checked(ownerUid,UID))fail("INVALID_OWNER");
   return access(async c=>{
    const [rows]=await c.execute(
     "SELECT booking_id,owner_uid,studio_id,starts_ms,ends_ms,status FROM raw_bookings WHERE owner_uid=? ORDER BY starts_ms DESC LIMIT 50",
     [ownerUid]);
    return rows.map(mapped);
   });
  },
  async cancel({bookingId,ownerUid,nowMs}={}){
   if(!checked(bookingId,UUID)||!checked(ownerUid,UID)||
    !Number.isSafeInteger(nowMs)||nowMs<0)fail("INVALID_CANCEL");
   return access(async c=>{
    const [rows]=await c.execute(
     "SELECT booking_id,owner_uid,studio_id,starts_ms,ends_ms,status FROM raw_bookings WHERE booking_id=? FOR UPDATE",
     [bookingId]);
    const item=mapped(rows[0]||null);
    if(!item||item.ownerUid!==ownerUid)fail("NOT_FOUND",404);
    if(item.status!=="reserved"||nowMs>=item.startsAtMs)fail("CANNOT_CANCEL",409);
    const [change]=await c.execute(
     "UPDATE raw_bookings SET status='cancelled',cancelled_ms=? WHERE booking_id=? AND owner_uid=? AND status='reserved'",
     [nowMs,bookingId,ownerUid]);
    if(change.affectedRows!==1)fail("STORE_INTEGRITY",503);
    const [deleted]=await c.execute(
     "DELETE FROM raw_booking_slots WHERE booking_id=? AND owner_uid=?",
     [bookingId,ownerUid]);
    if(deleted.affectedRows!==(item.endsAtMs-item.startsAtMs)/V529_SLOT_MS)
     fail("SLOT_INTEGRITY",503);
    return {...item,status:"cancelled"};
   },true);
  }
 });
}
