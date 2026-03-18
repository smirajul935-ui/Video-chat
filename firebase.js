import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update, remove, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyC711dtyl4kLt3c4_SFrEZe-f8ufFxe1SI",
  authDomain: "video-e45e4.firebaseapp.com",
  databaseURL: "https://video-e45e4-default-rtdb.firebaseio.com",
  projectId: "video-e45e4",
  storageBucket: "video-e45e4.firebasestorage.app",
  messagingSenderId: "151202228108",
  appId: "1:151202228108:web:43be4df2f8a8ecfe9618a9",
  measurementId: "G-1B0SEG9HFZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db, ref, set, get, onValue, update, remove, onDisconnect };
