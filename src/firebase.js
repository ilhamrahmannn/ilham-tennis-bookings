import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBYeSkJSMosOgKu8eJf5JrI4SjEJZ0biBQ",
  authDomain: "ilham-booking-website.firebaseapp.com",
  projectId: "ilham-booking-website",
  storageBucket: "ilham-booking-website.firebasestorage.app",
  messagingSenderId: "87944263402",
  appId: "1:87944263402:web:c7abc6a6708a7ade3e0993",
  measurementId: "G-7T9MKWGXNC",
};

const app = initializeApp(firebaseConfig);

isSupported().then((supported) => {
  if (supported) {
    getAnalytics(app);
  }
});

export const db = getFirestore(app);
export const auth = getAuth(app);
