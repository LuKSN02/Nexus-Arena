/* ==========================================================================
   firebase-init.js — inicializa o Firebase e expõe uma "ponte" em window.fb
   --------------------------------------------------------------------------
   Este é o ÚNICO arquivo que importa o SDK do Firebase diretamente. Ele
   precisa ser carregado como <script type="module">, porque o SDK só é
   distribuído como módulo ES a partir da v9.

   IMPORTANTE sobre ordem de carregamento: scripts type="module" sempre
   executam DEPOIS de todos os scripts clássicos (sem type="module") da
   página, mesmo que apareçam antes no HTML. Ou seja: quando este arquivo
   roda, api.js e db.js já foram *carregados* (suas funções já existem),
   mas isso não é problema — porque nenhuma delas deve ler window.fb no
   topo do arquivo, só *dentro* de funções, que só são chamadas depois que
   a página termina de carregar (em init(), no app.js). Se você mover algo
   de window.fb para fora de uma função, vai quebrar.
   ========================================================================== */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile as fbUpdateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser as fbDeleteUser
} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
import {
  getFirestore,
  doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, addDoc, query, where, orderBy, limit, getDocs,
  arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js';

// TODO: cole aqui o firebaseConfig copiado do console do Firebase
const firebaseConfig = {
  apiKey: 'COLE_AQUI',
  authDomain: 'SEU-PROJETO.firebaseapp.com',
  projectId: 'SEU-PROJETO',
  storageBucket: 'SEU-PROJETO.appspot.com',
  messagingSenderId: 'COLE_AQUI',
  appId: 'COLE_AQUI'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);

// Ponte usada pelo restante do app (api.js, db.js) — scripts clássicos,
// então tudo que eles precisam do Firebase passa por aqui.
window.fb = {
  auth, firestore,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, fbUpdateProfile,
  updatePassword, reauthenticateWithCredential, EmailAuthProvider, fbDeleteUser,
  doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, addDoc, query, where, orderBy, limit, getDocs,
  arrayUnion, arrayRemove
};

// Avisa o resto do app que o Firebase já está pronto para uso
window.dispatchEvent(new Event('firebase-ready'));
