import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBQ7V6w17s3EUR8n6KR-EZgMmRBQxAFhpM",
  authDomain: "hudkoreels-22c3d.firebaseapp.com",
  projectId: "hudkoreels-22c3d",
  storageBucket: "hudkoreels-22c3d.firebasestorage.app",
  messagingSenderId: "942258546722",
  appId: "1:942258546722:web:c43a44f67164de3be8827b"
};

let app;
let db: ReturnType<typeof getFirestore> | null = null;
let auth: ReturnType<typeof getAuth> | null = null;
let isFallback = false;

try {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  db = getFirestore(app);
  auth = getAuth(app);
} catch (error) {
  console.warn("Firebase Sandbox initialization failed. Local sandbox storage will be used instead.", error);
  isFallback = true;
}

export { db, auth, isFallback };