import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// الصق هنا إعدادات مشروعك من Firebase Console:
// Project settings > Your apps > Web app > SDK setup and configuration > Config
// (مفتاح الـ apiKey هنا مش سري، الحماية بتيجي من قواعد الأمان firestore.rules)
export const firebaseConfig = {
  apiKey: "AIzaSyAZfKuzf8PN8ZZeCkOLaGSmTbDLHU4DCy4",
  authDomain: "mindbook-fb74d.firebaseapp.com",
  projectId: "mindbook-fb74d",
  storageBucket: "mindbook-fb74d.firebasestorage.app",
  messagingSenderId: "980754416340",
  appId: "1:980754416340:web:0458d1dfd503f41f6c3141",
};

export const configured = !firebaseConfig.apiKey.startsWith("YOUR_");

const app = configured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
