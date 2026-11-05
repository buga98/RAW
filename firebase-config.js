import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD3LBWoS-uX9BnxDaMzQs_rlh9BMm_RRTM",
  authDomain: "remoteaudioworkstation.firebaseapp.com",
  projectId: "remoteaudioworkstation",
  storageBucket: "remoteaudioworkstation.firebasestorage.app",
  messagingSenderId: "222949189564",
  appId: "1:222949189564:web:d47dcd2dba5661e3eaadb9"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);