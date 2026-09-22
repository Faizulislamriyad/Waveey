// Shared Firebase config + init — loaded before app.js / admin.js
const firebaseConfig = {
  apiKey: "AIzaSyCQe7wV0k3eNNG8HOtnpdUk7RlcUHjfv8M",
  authDomain: "editor-s-b7093.firebaseapp.com",
  projectId: "editor-s-b7093",
  storageBucket: "editor-s-b7093.firebasestorage.app",
  messagingSenderId: "824649727487",
  appId: "1:824649727487:web:d5fd6b0b95e65be2fb3bca",
  measurementId: "G-L8E34XY5S3"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// Audio files are hosted on Cloudinary (free, no billing plan needed) instead
// of Firebase Storage — see cloud-config.js and the README for setup.