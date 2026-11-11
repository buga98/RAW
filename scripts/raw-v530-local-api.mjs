/* RAW V5.30 — explicit loopback-only staging API entrypoint.
 * No Firebase, no public listener, no cloud credentials, no audio device access.
 * REQUIRES the optional mysql2 driver (npm install mysql2@3.24.6).
 * Requires manual schema migration and a preprovisioned owner account.
 */
import {createSelfHostedRawApiV530} from "../raw-v530-selfhosted-api.mjs";
if(process.env.RAW_V530_LOCAL_API!=="I_ACCEPT_LOOPBACK_ONLY")
 throw Error("LOCAL_API_DISABLED: set RAW_V530_LOCAL_API=I_ACCEPT_LOOPBACK_ONLY");
const host=process.env.RAW_MYSQL_HOST||"127.0.0.1";
if(!["127.0.0.1","localhost","::1"].includes(host))
 throw Error("DB_MUST_BE_LOOPBACK_ONLY");
const user=process.env.RAW_MYSQL_USER;
const password=process.env.RAW_MYSQL_PASSWORD;
const database=process.env.RAW_MYSQL_DATABASE;
if(!user||user==="root"||!password||!database)
 throw Error("DB_CONFIG_MISSING: require non-root DB credentials");
const port=Number(process.env.RAW_V530_PORT||"7130");
if(!Number.isInteger(port)||port<1024||port>65535)
 throw Error("INVALID_LOCAL_API_PORT");
let mysql;
try{mysql=await import("mysql2/promise");}
catch{throw Error("MYSQL2_NOT_INSTALLED: npm install mysql2@3.24.6 --save-exact");}
const pool=mysql.createPool({
 host,port:Number(process.env.RAW_MYSQL_PORT||"3306"),
 user,password,database,waitForConnections:true,
 connectionLimit:8,queueLimit:20,multipleStatements:false,
 decimalNumbers:false,bigNumberStrings:true,supportBigNumbers:true,
 connectTimeout:5000
});
try{
 await pool.query("SELECT 1");
 const app=createSelfHostedRawApiV530({pool});
 const server=app.listen(port,"127.0.0.1",()=>{
  console.log("RAW V5.30 self-hosted STAGING API: http://127.0.0.1:"+port);
  console.log("Loopback only. Firebase absent. Not public, not production.");
 });
 async function stop(){server.close(async()=>{await pool.end();process.exit(0);});}
 process.on("SIGINT",stop);
 process.on("SIGTERM",stop);
}catch(error){
 await pool.end();throw error;
}
