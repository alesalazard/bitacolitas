const firebaseConfig = {
  apiKey: "AIzaSyATFjJ4pc93aUCoA-lXFzx_B6RhpOKdsrc",
  authDomain: "bitacolitas.firebaseapp.com",
  projectId: "bitacolitas",
  storageBucket: "bitacolitas.appspot.com",
  messagingSenderId: "1058846412345",
  appId: "1:814400191444:web:2bdbbfb338cf8b6c467441",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// AGREGAR ESTO PARA ACTIVAR EL MODO OFFLINE:
db.enablePersistence()
  .catch((err) => {
    if (err.code == 'failed-precondition') {
      console.warn("Múltiples pestañas abiertas, la persistencia solo funciona en una.");
    } else if (err.code == 'unimplemented') {
      console.warn("Tu navegador no soporta el almacenamiento offline de Firebase.");
    }
  });
