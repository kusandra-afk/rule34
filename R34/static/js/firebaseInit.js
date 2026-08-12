import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    onSnapshot, 
    collection,
    serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let db = null;
let firebaseApp = null;
let isInitialized = false;

export async function initFirebase() {
    if (isInitialized && db) return db;
    try {
        const res = await fetch('/firebase-applet-config.json');
        if (!res.ok) {
            console.warn('[Firebase] Config file not found.');
            return null;
        }
        const config = await res.json();
        if (!config || !config.apiKey) {
            console.warn('[Firebase] Invalid config.');
            return null;
        }
        firebaseApp = initializeApp(config);
        db = getFirestore(firebaseApp, config.firestoreDatabaseId || undefined);
        isInitialized = true;
        console.log('[Firebase] Initialized successfully with Firestore');
        return db;
    } catch (e) {
        console.error('[Firebase] Initialization error:', e);
        return null;
    }
}

export { 
    db, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    onSnapshot, 
    collection, 
    serverTimestamp 
};
