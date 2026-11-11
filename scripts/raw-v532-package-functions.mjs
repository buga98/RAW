/* Build a minimal Cloud Functions package of audited server-only modules.
 * Explicit allowlist is important: do not deploy RAW Electron or audio files,
 * user recordings, Firebase config, credentials or local development services.
 * This writes generated files locally; it NEVER deploys.
 */
import {copyFileSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const approved=[
 "raw-v529-identity.mjs",
 "raw-v531-token-math.mjs",
 "raw-v531-firestore-wallet.mjs",
 "raw-v531-stripe-topups.mjs",
 "raw-v532-staging-guard.mjs",
 "raw-v532-checkout-throttle.mjs",
 "raw-v532-wallet-history.mjs",
 "raw-v535-digital-delivery.mjs"
];
const dest=resolve(root,"functions-v532","core");
mkdirSync(dest,{recursive:true});
const files={};
for(const file of approved){
 const source=resolve(root,file);
 const target=resolve(dest,file);
 const buf=readFileSync(source);
 copyFileSync(source,target);
 files[file]=createHash("sha256").update(buf).digest("hex");
}
writeFileSync(resolve(dest,"MANIFEST.json"),
 JSON.stringify({purpose:"RAW V532 STAGING ONLY",files},null,2)+"\n");
console.log("RAW V532 staging package: "+approved.length+" server-only modules.");
