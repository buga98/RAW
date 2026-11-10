/* RAW V5.26 — default-deny boundary for old unauthenticated local/cloud adapters.
 * These scripts were written before trusted Firebase token verification, lease
 * fencing and server-side authorization existed. They MUST NOT run in production,
 * and RAW_TEST_MODE does not make their Firestore writes safe.
 */
export function rejectLegacyService(service){
 const name=typeof service==="string"&&/^[a-z-]{2,40}$/.test(service)?service:"unknown";
 const error=new Error(
  "RAW "+name+" disabled: this legacy entry point has no trusted user "+
  "authentication, owner-scoped authorization or production-safe lease. "+
  "Use npm run test:local for offline testing; build an authenticated "+
  "server adapter before enabling real cloud writes or studio processes."
 );
 error.code="RAW_LEGACY_DISABLED";
 throw error;
}
