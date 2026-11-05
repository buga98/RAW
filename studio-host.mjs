import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  onSnapshot,
  query,
  where
} from "firebase/firestore";

import { spawn } from "child_process";

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

/*
  WINDOWS TEST:
  za sad možeš testirati s REAPER-om ili bilo kojim programom.

  MAC KASNIJE:
  Cubase path će biti nešto tipa:
  /Applications/Cubase 13.app
*/

const IS_WINDOWS = process.platform === "win32";

const HOST_APP_NAME = IS_WINDOWS
  ? "notepad.exe"
  : "Cubase 13";

const DEVICE_PROJECTS = {
  ngbuscomp: IS_WINDOWS
    ? "C:\\RAW\\ngbuscomp-test.txt"
    : "/Users/Shared/RAW/ngbuscomp.cpr",

  ngtubecomp: IS_WINDOWS
    ? "C:\\RAW\\ngtubecomp-test.txt"
    : "/Users/Shared/RAW/ngtubecomp.cpr",

  bettermaker_eq: IS_WINDOWS
    ? "C:\\RAW\\bettermaker-test.txt"
    : "/Users/Shared/RAW/bettermaker.cpr"
};

console.log("RAW Studio Host radi...");
console.log("Slušam active sessions...");
console.log("Platform:", process.platform);

const q = query(
  collection(db, "sessions"),
  where("status", "==", "active")
);

onSnapshot(q, (snapshot) => {
  snapshot.docChanges().forEach((change) => {
    const session = {
      id: change.doc.id,
      ...change.doc.data()
    };

    if (change.type === "added") {
      console.log("NOVA SESIJA:");
      console.log(session);

      openDeviceProject(session);
    }

    if (change.type === "modified") {
      console.log("SESSION UPDATE:");
      console.log(session);
    }

    if (change.type === "removed") {
      console.log("SESSION REMOVED:", session.id);
    }
  });
});

function openDeviceProject(session) {
  const projectPath = DEVICE_PROJECTS[session.deviceId];

  if (!projectPath) {
    console.log("Nema project mapping za device:", session.deviceId);
    return;
  }

  console.log("Otvaram project za:", session.deviceId);
  console.log(projectPath);

  if (IS_WINDOWS) {
    spawn(HOST_APP_NAME, [projectPath], {
      detached: true,
      stdio: "ignore"
    }).unref();
  } else {
    spawn("open", ["-a", HOST_APP_NAME, projectPath], {
      detached: true,
      stdio: "ignore"
    }).unref();
  }
}