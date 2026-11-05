import { WebSocketServer } from "ws";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  updateDoc,
  serverTimestamp
} from "firebase/firestore";

const PORT = 7071;

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

const wss = new WebSocketServer({ port: PORT, host: "127.0.0.1", maxPayload: 16 * 1024 });

const hardwareState = {};

console.log(`RAW Control Server radi na ws://localhost:${PORT}`);

wss.on("connection", (socket) => {
  console.log("Client connected");

  socket.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "parameter-change") {
        await setHardwareParameter(
          msg.sessionId,
          msg.userId,
          msg.deviceId,
          msg.parameter,
          msg.value
        );
      }

      if (msg.type === "region-change") {
        await setAudioRegion(
          msg.sessionId,
          msg.userId,
          msg.deviceId,
          msg.start,
          msg.end
        );
      }

      if (msg.type === "session-start") {
        console.log("SESSION START:", msg.deviceId);
      }

      if (msg.type === "session-end") {
        console.log("SESSION END:", msg.deviceId);
      }
    } catch (err) {
      console.error("Bad message:", raw.toString(), err);
    }
  });

  socket.on("close", () => {
    console.log("Client disconnected");
  });
});

function ensureDeviceState(deviceId) {
  if (!hardwareState[deviceId]) {
    hardwareState[deviceId] = {
      parameters: {},
      region: null,
      updatedAt: null
    };
  }

  return hardwareState[deviceId];
}

async function setHardwareParameter(sessionId, userId, deviceId, parameter, value) {
  if (!sessionId) {
    console.warn("Nema sessionId — ne spremam parameter.");
    return;
  }

  const state = ensureDeviceState(deviceId);

  state.parameters[parameter] = value;
  state.updatedAt = new Date().toISOString();

  console.log("HARDWARE SET:", {
    sessionId,
    userId,
    deviceId,
    parameter,
    value
  });

  await saveSessionHardwareState(sessionId, userId, deviceId, state);
}

async function setAudioRegion(sessionId, userId, deviceId, start, end) {
  if (!sessionId) {
    console.warn("Nema sessionId — ne spremam region.");
    return;
  }

  const state = ensureDeviceState(deviceId);

  state.region = {
    start,
    end
  };

  state.updatedAt = new Date().toISOString();

  console.log(
    `REGION ${deviceId} start=${start.toFixed(3)} end=${end.toFixed(3)}`
  );

  await saveSessionHardwareState(sessionId, userId, deviceId, state);
}

async function saveSessionHardwareState(sessionId, userId, deviceId, state) {
  try {
    await updateDoc(doc(db, "sessions", sessionId), {
      userId,
      [`hardwareState.${deviceId}`]: {
        parameters: state.parameters,
        region: state.region,
        updatedAt: state.updatedAt
      },
      hardwareStateUpdatedAt: serverTimestamp()
    });

    console.log("SESSION HARDWARE STATE SAVED:", sessionId, deviceId);
  } catch (err) {
    console.error("FIREBASE SAVE ERROR:", err.message);
  }
}