import test from "node:test";
import assert from "node:assert/strict";
import {once} from "node:events";
import {hashPasswordV530} from "../raw-v530-password.mjs";
import {createSelfHostedRawApiV530} from "../raw-v530-selfhosted-api.mjs";
const now=1_800_000_000_000;
const email="owner@example.com",password="Own-Local-Mastering-Password!";
async function fixture(){
 const password_hash=await hashPasswordV530(password);
 const sessions=new Map();
 const pool={
  async execute(sql,params){
   if(sql.startsWith("SELECT user_id,password_hash,role,disabled FROM raw_users")){
    return [params[0]===email?[{user_id:"owner-id",password_hash,role:"admin",disabled:0}]:[],[]];
   }
   if(sql.startsWith("INSERT INTO raw_auth_sessions")){
    sessions.set(params[0],{uid:params[1],expiresAtMs:params[3],revoked:false});
    return [{affectedRows:1},[]];
   }
   if(sql.startsWith("SELECT u.user_id AS uid")){
    const s=sessions.get(params[0]);
    return [s&&!s.revoked&&s.expiresAtMs>params[1]?
     [{uid:s.uid,role:"admin",disabled:0}]:[],[]];
   }
   if(sql.startsWith("UPDATE raw_auth_sessions SET revoked_ms")){
    const s=sessions.get(params[1]);if(s)s.revoked=true;
    return [{affectedRows:s?1:0},[]];
   }
   throw Error("BAD_SQL "+sql);
  },
  async getConnection(){throw Error("Booking DB adapter should not be accessed during auth test");}
 };
 return {app:createSelfHostedRawApiV530({pool,now:()=>now}),sessions};
}
async function withServer(app,callback){
 const server=app.listen(0,"127.0.0.1");
 await once(server,"listening");
 try{await callback("http://127.0.0.1:"+server.address().port);}
 finally{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
}
test("V5.30: API login/me/logout works with MySQL-only identity, never Firebase",async()=>{
 const {app,sessions}=await fixture();
 await withServer(app,async base=>{
  const anon=await fetch(base+"/api/v530/auth/me");
  assert.equal(anon.status,401);
  const bad=await fetch(base+"/api/v530/auth/login",{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({email,password:"incorrect"})
  });
  assert.equal(bad.status,401);
  const login=await fetch(base+"/api/v530/auth/login",{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({email:"OWNER@EXAMPLE.COM",password})
  });
  assert.equal(login.status,200);
  assert.equal(login.headers.get("Cache-Control"),"no-store");
  const response=await login.json();
  assert.match(response.accessToken,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(response.user.email,email);
  const authorization="Bearer "+response.accessToken;
  const me=await fetch(base+"/api/v530/auth/me",{headers:{Authorization:authorization}});
  assert.equal(me.status,200);
  assert.equal((await me.json()).user.uid,"owner-id");
  const ownerOnly=await fetch(base+"/api/v530/bookings",{headers:{Authorization:"Bearer "+"b".repeat(43)}});
  assert.equal(ownerOnly.status,401);
  const logout=await fetch(base+"/api/v530/auth/logout",{
   method:"POST",headers:{Authorization:authorization}
  });
  assert.equal(logout.status,200);
  assert.equal((await fetch(base+"/api/v530/auth/me",{headers:{Authorization:authorization}})).status,401);
  assert.equal(JSON.stringify([...sessions]).includes(response.accessToken),false);
 });
});
test("V5.30: rejects forged identities and direct admin claims",async()=>{
 const {app}=await fixture();
 await withServer(app,async base=>{
  const forged=await fetch(base+"/api/v530/auth/login",{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({email,password,role:"admin"})
  });
  assert.equal(forged.status,401);
  const anon=await fetch(base+"/api/v530/bookings");
  assert.equal(anon.status,401);
  const invalid=await fetch(base+"/api/v530/auth/login",{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({email,password:"short"})
  });
  assert.equal(invalid.status,401);
  assert.equal(invalid.headers.get("access-control-allow-origin"),null);
 });
});
