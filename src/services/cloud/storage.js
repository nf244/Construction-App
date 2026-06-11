/**
 * Firestore document store. Same API as the local IndexedDB backend:
 * one Firestore collection per store name, document id == doc.id.
 */
import {
  doc,
  getDoc as fsGetDoc,
  getDocs,
  setDoc,
  deleteDoc as fsDeleteDoc,
  collection,
} from 'firebase/firestore';
import { db } from '../firebase.js';

export async function getDoc(store, id) {
  const snap = await fsGetDoc(doc(db, store, id));
  return snap.exists() ? snap.data() : null;
}

export async function listDocs(store) {
  const snap = await getDocs(collection(db, store));
  return snap.docs.map((d) => d.data());
}

export async function putDoc(store, docData) {
  await setDoc(doc(db, store, docData.id), docData);
  return docData;
}

export async function deleteDoc(store, id) {
  await fsDeleteDoc(doc(db, store, id));
}
