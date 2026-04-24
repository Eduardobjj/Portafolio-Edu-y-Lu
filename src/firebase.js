import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBOHXAUKPdYwrsDRthqsShxClnCBVDflsQ",
  authDomain: "portafolio-edu-y-lu.firebaseapp.com",
  projectId: "portafolio-edu-y-lu",
  storageBucket: "portafolio-edu-y-lu.firebasestorage.app",
  messagingSenderId: "35398887018",
  appId: "1:35398887018:web:372b1be16bc439039e8c13"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
