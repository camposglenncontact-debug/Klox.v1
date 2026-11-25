// Only the Firebase pieces the page needs, bundled into one file so the site does not depend on a CDN.
export { initializeApp } from 'firebase/app';
export { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, onIdTokenChanged, connectAuthEmulator, browserLocalPersistence, setPersistence, reauthenticateWithPopup, signInWithCredential } from 'firebase/auth';
export { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache, connectFirestoreEmulator,
  collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, onSnapshot, deleteField, writeBatch } from 'firebase/firestore';
