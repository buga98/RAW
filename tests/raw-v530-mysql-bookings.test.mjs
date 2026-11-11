import test from "node:test";
import assert from "node:assert/strict";
import {createMySQLBookingStoreV530} from "../raw-v530-mysql-bookings.mjs";

const NOW=Date.UTC(2026,10,11,10,0);
const START=NOW+30*60*1000;
let sequence=0;
const idFactory=()=>("00000000-0000-4000-8000-"+String(++sequence).padStart(12,"0"));
function fixture(){
 sequence=0;
 const db={studios:new Map([["studio_A",true],["studio_B",true],["studio_OFF",false]]),
  bookings:new Map(),slots:new Map()};
 let lock=Promise.resolve();
 const pool={
  async getConnection(){
   let backup=null,finish=null;
   return {
    async beginTransaction(){
     const prev=lock;lock=new Promise(resolve=>finish=resolve);
     await prev;
     backup={bookings:new Map([...db.bookings].map(([k,v])=>[k,{...v}])),
      slots:new Map([...db.slots].map(([k,v])=>[k,{...v}]))};
    },
    async commit(){backup=null;finish();finish=null;},
    async rollback(){
     if(backup){db.bookings=backup.bookings;db.slots=backup.slots;backup=null;}
     if(finish){finish();finish=null;}
    },
    release(){if(finish)throw Error("TRANSACTION_LEAK");},
    async execute(sql,args){
     if(sql.startsWith("SELECT bookable")){
      const available=db.studios.get(args[0]);
      return [[...db.studios.has(args[0])?[{bookable:available?1:0}]:[]],[]];
     }
     if(sql.startsWith("INSERT INTO raw_bookings")){
      const [id,uid,studio,from,to,created]=args;
      db.bookings.set(id,{booking_id:id,owner_uid:uid,studio_id:studio,
       starts_ms:from,ends_ms:to,created_ms:created,status:"reserved"});
      return [{affectedRows:1},[]];
     }
     if(sql.startsWith("INSERT INTO raw_booking_slots")){
      const [studio,slot,id,uid]=args,key=studio+"|"+slot;
      if(db.slots.has(key))throw {code:"ER_DUP_ENTRY",errno:1062};
      db.slots.set(key,{studio,slot,id,uid});
      return [{affectedRows:1},[]];
     }
     if(sql.startsWith("SELECT booking_id,owner_uid")){
      if(sql.includes("WHERE booking_id=?")){
       const val=db.bookings.get(args[0]);
       return [val?[{...val}]:[],[]];
      }
      return [[...db.bookings.values()].filter(x=>x.owner_uid===args[0])
       .sort((a,b)=>b.starts_ms-a.starts_ms).slice(0,50).map(x=>({...x})),[]];
     }
     if(sql.startsWith("UPDATE raw_bookings")){
      const [time,id,uid]=args;
      const row=db.bookings.get(id);
      if(!row||row.owner_uid!==uid||row.status!=="reserved")return [{affectedRows:0},[]];
      row.status="cancelled";row.cancelled_ms=time;
      return [{affectedRows:1},[]];
     }
     if(sql.startsWith("DELETE FROM raw_booking_slots")){
      const [id,uid]=args;
      let affectedRows=0;
      for(const [key,val] of [...db.slots])
       if(val.id===id&&val.uid===uid){db.slots.delete(key);affectedRows++;}
      return [{affectedRows},[]];
     }
     throw Error("UNRECOGNIZED_SQL_"+sql);
    }
   };
  }
 };
 return {store:createMySQLBookingStoreV530(pool,{idFactory}),db};
}
const req=(ownerUid="ownerA",studioId="studio_A",start=START)=>({
 ownerUid,studioId,startsAtMs:start,endsAtMs:start+30*60*1000,createdAtMs:NOW
});
test("V5.30: two concurrent overlaps serialize and only one gets slot",async()=>{
 const f=fixture();
 const results=await Promise.allSettled([
  f.store.book(req("ownerA")),f.store.book(req("ownerB","studio_A",START+15*60*1000))
 ]);
 assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
 assert.equal(results.filter(x=>x.status==="rejected"&&x.reason.code==="SLOT_UNAVAILABLE").length,1);
 assert.equal(f.db.bookings.size,1);
 assert.equal(f.db.slots.size,2);
 const adjacent=await f.store.book(req("ownerB","studio_A",START+30*60*1000));
 assert.equal(adjacent.status,"reserved");
 const differentStudio=await f.store.book(req("ownerB","studio_B",START));
 assert.equal(differentStudio.studioId,"studio_B");
});
test("V5.30: owner-only cancellation is atomic and frees time slots",async()=>{
 const f=fixture(),a=await f.store.book(req());
 assert.equal((await f.store.list("ownerA")).length,1);
 assert.equal((await f.store.get(a.id)).ownerUid,"ownerA");
 assert.equal((await f.store.list("ownerB")).length,0);
 await assert.rejects(f.store.cancel({bookingId:a.id,ownerUid:"ownerB",nowMs:NOW}),{code:"NOT_FOUND"});
 assert.equal(f.db.slots.size,2);
 const cancelled=await f.store.cancel({bookingId:a.id,ownerUid:"ownerA",nowMs:NOW});
 assert.equal(cancelled.status,"cancelled");
 assert.equal(f.db.slots.size,0);
 const b=await f.store.book(req("ownerB"));
 assert.equal(b.status,"reserved");
 await assert.rejects(f.store.cancel({bookingId:b.id,ownerUid:"ownerB",nowMs:START}),{code:"CANNOT_CANCEL"});
});
test("V5.30: unknown and disabled studios are denied and commit nothing",async()=>{
 const f=fixture();
 await assert.rejects(f.store.book(req("ownerA","studio_OFF")),{code:"STUDIO_NOT_BOOKABLE"});
 await assert.rejects(f.store.book(req("ownerA","studio_UNKNOWN")),{code:"STUDIO_NOT_BOOKABLE"});
 assert.equal(f.db.bookings.size,0);
 assert.equal(f.db.slots.size,0);
});
