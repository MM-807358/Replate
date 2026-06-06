const firebaseConfig = {
  apiKey: "AIzaSyDPOoJzzG7am1uQ-2GyvlWMj2GGn3YHzKo",
  authDomain: "replate-6e821.firebaseapp.com",
  projectId: "replate-6e821",
  storageBucket: "replate-6e821.firebasestorage.app",
  messagingSenderId: "804984239780",
  appId: "1:804984239780:web:f45d5435e32c14e5cf9831"
};
let _db = null;
let _firebaseReady = false;

function initFirebase() {
  if (firebaseConfig.apiKey.includes('REPLACE') || firebaseConfig.projectId === 'replate-demo') {
    return;
  }
  if (typeof firebase === 'undefined') return;

  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    _db = firebase.firestore();
    _firebaseReady = true;
  } catch (err) {
    console.error('[Replate] Firebase init failed:', err);
    _firebaseReady = false;
  }
}

const FirebaseDB = {

  get isReady() { return _firebaseReady; },

  async addReport(report) {
    if (!_firebaseReady) throw new Error('Firebase not ready');
    const ref = await _db.collection('surplusReports').add({
      ...report,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
  },

  subscribeReports(onUpdate) {
    if (!_firebaseReady) {
      onUpdate([]);
      return () => {};
    }

    return _db.collection('surplusReports')
      .onSnapshot(
        snap => {
          const now = new Date();
          const reports = snap.docs
            .map(doc => ({ id: doc.id, type: 'surplus', ...doc.data() }))
            .filter(r => r.expiresAt && new Date(r.expiresAt) > now);
          onUpdate(reports);
        },
        err => {
          console.error('[Replate] Firestore snapshot error:', err);
          onUpdate([]);
        }
      );
  },
};

initFirebase();
