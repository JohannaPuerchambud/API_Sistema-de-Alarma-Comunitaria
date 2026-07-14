import fs from "fs";
import path from "path";
import { cert, applicationDefault, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { getStorage } from "firebase-admin/storage";

const loadServiceAccount = () => {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    return JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString(
        "utf-8",
      ),
    );
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const keyPath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    return JSON.parse(fs.readFileSync(keyPath, "utf-8"));
  }

  return null;
};

const serviceAccount = loadServiceAccount();

if (!serviceAccount && process.env.NODE_ENV !== "test") {
  throw new Error(
    "Firebase no configurado. Define FIREBASE_SERVICE_ACCOUNT_BASE64, " +
      "FIREBASE_SERVICE_ACCOUNT_JSON o FIREBASE_SERVICE_ACCOUNT_PATH.",
  );
}

const firebaseApp = initializeApp({
  credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
  storageBucket:
    process.env.FIREBASE_STORAGE_BUCKET ||
    "alarmacomunitaria-utn-5e6be.firebasestorage.app",
});

const admin = {
  messaging: () => getMessaging(firebaseApp),
  storage: () => getStorage(firebaseApp),
};

export default admin;