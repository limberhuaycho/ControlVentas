/**
 * ============================================
 * FIREBASE CONFIGURATION
 * ============================================
 */

const firebaseConfig = {
  apiKey: "AIzaSyD9XjwavtMwmKG0KtBHogIICkqLaBSiWQc",
  authDomain: "ventas-control-e7659.firebaseapp.com",
  projectId: "ventas-control-e7659",
  storageBucket: "ventas-control-e7659.firebasestorage.app",
  messagingSenderId: "81356680391",
  appId: "1:81356680391:web:c52a23b52106449d7ca2e2",
  measurementId: "G-G2KMDMS3S8"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.database();
const firestore = firebase.firestore();
const storage = firebase.storage();
const googleProvider = new firebase.auth.GoogleAuthProvider();

async function verificarAdmin(uid, email) {
  try {
    const doc = await firestore.collection("privado").doc(uid).get();
    if (doc.exists && doc.data().email === email) {
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error verificando admin:", error);
    return false;
  }
}

function getUserDB(uid) {
  return db.ref("usuarios/" + uid);
}

console.log("Firebase inicializado correctamente ✅");
