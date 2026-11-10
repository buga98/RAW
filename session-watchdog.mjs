import {rejectLegacyService} from "./raw-legacy-service-guard-v526.mjs";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  increment
} from "firebase/firestore";

// Reject before any listener, Firestore client or process spawn can start.
rejectLegacyService("billing-watchdog");

const firebaseConfig = {
  apiKey: "AIzaSyD3LBWoS-uX9BnxDaMzQs_rlh9BMm_RRTM",
  authDomain: "remoteaudioworkstation.firebaseapp.com",
  projectId: "remoteaudioworkstation",
  storageBucket: "remoteaudioworkstation.firebasestorage.app",
  messagingSenderId: "222949189564",
  appId: "1:222949189564:web:d47dcd2dba5661e3eaadb9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const CHECK_EVERY_MS = 15_000;
const MAX_IDLE_MS = 60_000;

console.log("RAW Session Watchdog radi...");
console.log(`Provjera svakih ${CHECK_EVERY_MS / 1000}s`);
console.log(`Session timeout nakon ${MAX_IDLE_MS / 1000}s bez heartbeat-a`);

setInterval(checkSessions, CHECK_EVERY_MS);
checkSessions();

async function checkSessions() {
  try {
    const q = query(
      collection(db, "sessions"),
      where("status", "==", "active")
    );

    const snap = await getDocs(q);
    const now = Date.now();

    for (const sessionDoc of snap.docs) {
      const session = {
        id: sessionDoc.id,
        ...sessionDoc.data()
      };

      const heartbeatAt = session.heartbeatAt?.toDate?.();

if (!heartbeatAt) {
  console.log("Session nema heartbeat, zatvaram:", session.id);
  await closeStaleSession(session);
  continue;
}

      const idleMs = now - heartbeatAt.getTime();

      if (idleMs > MAX_IDLE_MS) {
        console.log("STALE SESSION:", session.id, `${Math.round(idleMs / 1000)}s`);

        await closeStaleSession(session);
      }
    }
  } catch (err) {
    console.error("WATCHDOG ERROR:", err.message);
  }
}
function calculateSessionCost(session) {
  const startedAt = session.startedAt?.toDate?.();

  if (!startedAt) {
    return 0;
  }

  const endedAtMs = Date.now();
  const durationMs = Math.max(0, endedAtMs - startedAt.getTime());

  const pricePerHour = Number(session.pricePerHour || 0);
  const cost = (pricePerHour / 60 / 60 / 1000) * durationMs;

  return Number(cost.toFixed(2));
}
async function closeStaleSession(session) {
  const deviceIds = (
    session.chainOrder ||
    session.chainDevices?.map(d => d.id) ||
    (session.deviceId ? [session.deviceId] : [])
  ).map(normalizeDeviceId);

  const cost = calculateSessionCost(session);
  const userId = session.userId;

  console.log("Otključavam uređaje:", deviceIds);
  console.log("Watchdog cost:", cost, "€");

  for (const deviceId of deviceIds) {
    await updateDoc(doc(db, "devices", deviceId), {
      status: "available",
      lockedBy: null,
      currentSessionId: null
    });
  }

  if (userId && cost > 0 && !session.chargedAt) {
    await updateDoc(doc(db, "users", userId), {
      credits: increment(-cost),
      totalSpent: increment(cost),
      activeSessionId: null,
      lastChargedAt: serverTimestamp()
    });
  }

  await updateDoc(doc(db, "sessions", session.id), {
    status: "ended",
    endedAt: serverTimestamp(),
    endedBy: "watchdog",
    clientStatus: "timeout",
    cost,
    chargedAt: cost > 0 ? serverTimestamp() : null
  });

  console.log("Session zatvoren watchdogom:", session.id);
}
function normalizeDeviceId(id) {
  if (id === "Bettermaker") return "bettermaker_eq";
  return id;
}