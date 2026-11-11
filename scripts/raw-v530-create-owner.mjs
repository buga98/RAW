/* RAW V5.30 — offline, interactive FIRST owner provisioning only.
 * No web registration, no plaintext password args/env or admin endpoint.
 * Run locally on studio server; requires schema, mysql2 and DB credentials.
 */
import {randomUUID} from "node:crypto";
import {hashPasswordV530} from "../raw-v530-password.mjs";
import {normalizeEmailV530} from "../raw-v530-local-auth.mjs";
if(process.env.RAW_V530_LOCAL_API!=="I_ACCEPT_LOOPBACK_ONLY")
 throw Error("BOOTSTRAP_LOCAL_ONLY");
if(process.argv.length!==3)throw Error("Usage: node scripts/raw-v530-create-owner.mjs email@example.com");
if(!process.stdin.isTTY||typeof process.stdin.setRawMode!=="function")
 throw Error("INTERACTIVE_TERMINAL_REQUIRED");
const email=normalizeEmailV530(process.argv[2]);
const host=process.env.RAW_MYSQL_HOST||"127.0.0.1";
if(!["127.0.0.1","localhost","::1"].includes(host))
 throw Error("DB_MUST_BE_LOOPBACK_ONLY");
if(!process.env.RAW_MYSQL_USER||process.env.RAW_MYSQL_USER==="root"||
 !process.env.RAW_MYSQL_PASSWORD||!process.env.RAW_MYSQL_DATABASE)
 throw Error("DB_CONFIG_MISSING");
const askHidden=()=>new Promise((resolve,reject)=>{
 let answer="",finished=false;
 process.stdout.write("New owner password (12-128 characters, hidden): ");
 process.stdin.setRawMode(true);process.stdin.resume();
 const cleanup=()=>{process.stdin.off("data",onData);process.stdin.setRawMode(false);process.stdin.pause();};
 const onData=chunk=>{
  if(finished)return;
  for(const symbol of chunk.toString("utf8")){
   if(symbol==="\u0003"){finished=true;cleanup();process.stdout.write("\n");reject(Error("CANCELLED"));return;}
   if(symbol==="\r"||symbol==="\n"){
    finished=true;cleanup();process.stdout.write("\n");resolve(answer);return;
   }
   if(symbol==="\u007f"||symbol==="\b"){answer=answer.slice(0,-1);continue;}
   if(answer.length<128&&symbol>=" "&&symbol!=="\u007f")answer+=symbol;
  }
 };
 process.stdin.on("data",onData);
});
const password=await askHidden();
const passwordHash=await hashPasswordV530(password);
let mysql;
try{mysql=await import("mysql2/promise");}
catch{throw Error("MYSQL2_NOT_INSTALLED: npm install mysql2@3.24.6 --save-exact");}
const pool=mysql.createPool({
 host,port:Number(process.env.RAW_MYSQL_PORT||"3306"),
 user:process.env.RAW_MYSQL_USER,password:process.env.RAW_MYSQL_PASSWORD,
 database:process.env.RAW_MYSQL_DATABASE,
 waitForConnections:true,connectionLimit:1,multipleStatements:false
});
let connection,locked=false,inTx=false;
try{
 connection=await pool.getConnection();
 const [lock]=await connection.execute("SELECT GET_LOCK(?,5) AS acquired",["raw-v530-first-owner"]);
 if(Number(lock[0]?.acquired)!==1)throw Error("BOOTSTRAP_LOCK_BUSY");
 locked=true;
 await connection.beginTransaction();inTx=true;
 const [rows]=await connection.execute("SELECT COUNT(*) AS total FROM raw_users");
 if(Number(rows[0].total)!==0)throw Error("BOOTSTRAP_DISABLED: users already exist");
 await connection.execute(
  "INSERT INTO raw_users (user_id,email,password_hash,role,disabled,created_ms) VALUES (?,?,?,'admin',0,?)",
  [randomUUID(),email,passwordHash,Date.now()]);
 await connection.commit();inTx=false;
 console.log("Initial owner created. No Firebase involved.");
}catch(error){
 if(inTx)try{await connection.rollback();}catch{}
 throw error;
}finally{
 if(connection&&locked)try{await connection.execute("SELECT RELEASE_LOCK(?)",["raw-v530-first-owner"]);}catch{}
 connection?.release();await pool.end();
}
