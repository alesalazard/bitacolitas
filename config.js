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
