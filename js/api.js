// Warstwa danych: Firebase (Auth + Firestore) albo tryb demo (localStorage).
// Obie wersje mają ten sam interfejs, więc reszta strony nie wie, z której korzysta.
import { firebaseConfig, LOGIN_DOMAIN } from './config.js';
import { seedData } from './seed.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2';

export const DEMO =
  !firebaseConfig.apiKey ||
  firebaseConfig.apiKey.startsWith('WPISZ') ||
  new URLSearchParams(location.search).has('demo');

let backend;
export async function getApi() {
  if (!backend) backend = DEMO ? demoBackend() : await firebaseBackend();
  return backend;
}

export function loginToEmail(login) {
  const l = String(login).trim().toLowerCase();
  return l.includes('@') ? l : `${l}@${LOGIN_DOMAIN}`;
}

export function errMsg(e) {
  const code = (e && e.code) || '';
  const map = {
    'auth/invalid-credential': 'Nieprawidłowy login lub hasło.',
    'auth/invalid-login-credentials': 'Nieprawidłowy login lub hasło.',
    'auth/wrong-password': 'Nieprawidłowy login lub hasło.',
    'auth/user-not-found': 'Nieprawidłowy login lub hasło.',
    'auth/user-disabled': 'To konto zostało wyłączone.',
    'auth/invalid-email': 'Nieprawidłowy login (dozwolone litery, cyfry, kropka, myślnik).',
    'auth/too-many-requests': 'Zbyt wiele nieudanych prób. Spróbuj ponownie za kilka minut.',
    'auth/email-already-in-use': 'Konto z takim loginem już istnieje.',
    'auth/weak-password': 'Hasło jest za słabe (minimum 6 znaków).',
    'auth/network-request-failed': 'Brak połączenia z internetem.',
    'auth/requires-recent-login': 'Wyloguj się, zaloguj ponownie i spróbuj jeszcze raz.',
    'auth/operation-not-allowed': 'Logowanie e-mail/hasło nie jest włączone w Firebase (Authentication → Sign-in method).',
    'auth/unauthorized-domain': 'Ta domena nie jest dodana w Firebase (Authentication → Settings → Authorized domains).',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Nieprawidłowy apiKey w pliku js/config.js.',
    'permission-denied': 'Brak uprawnień. Sprawdź, czy konto jest aktywne i czy reguły Firestore zostały wgrane.',
    'unavailable': 'Serwer niedostępny — sprawdź połączenie z internetem.',
  };
  if (map[code]) return map[code];
  return e && e.message ? 'Błąd: ' + e.message : 'Nieznany błąd.';
}

// ---------- pomocnicze ----------
function normalize(v) {
  if (v && typeof v.toDate === 'function') return v.toDate();
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = {};
    for (const k of Object.keys(v)) o[k] = normalize(v[k]);
    return o;
  }
  return v;
}
function clean(v) {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = {};
    for (const k of Object.keys(v)) if (v[k] !== undefined && k !== 'id') o[k] = clean(v[k]);
    return o;
  }
  return v;
}

// ---------- Firebase ----------
async function firebaseBackend() {
  const [appM, authM, fsM] = await Promise.all([
    import(`${FB}/firebase-app.js`),
    import(`${FB}/firebase-auth.js`),
    import(`${FB}/firebase-firestore.js`),
  ]);
  const app = appM.initializeApp(firebaseConfig);
  const auth = authM.getAuth(app);
  const db = fsM.getFirestore(app);
  const { collection, doc, onSnapshot, addDoc, setDoc, deleteDoc, getDoc, writeBatch } = fsM;

  return {
    demo: false,
    subscribe(col, cb, onErr) {
      return onSnapshot(
        collection(db, col),
        (s) => cb(s.docs.map((d) => ({ id: d.id, ...normalize(d.data()) }))),
        (e) => onErr && onErr(e)
      );
    },
    async get(col, id) {
      const s = await getDoc(doc(db, col, id));
      return s.exists() ? { id: s.id, ...normalize(s.data()) } : null;
    },
    async add(col, data) { return (await addDoc(collection(db, col), clean(data))).id; },
    async set(col, id, data) { await setDoc(doc(db, col, id), clean(data)); },
    async update(col, id, data) { await setDoc(doc(db, col, id), clean(data), { merge: true }); },
    async remove(col, id) { await deleteDoc(doc(db, col, id)); },

    onUser(cb) {
      return authM.onAuthStateChanged(auth, async (u) => {
        if (!u) return cb(null, null);
        let profile = null;
        try {
          const s = await getDoc(doc(db, 'users', u.uid));
          if (s.exists()) profile = { id: s.id, ...normalize(s.data()) };
        } catch (e) { /* brak dostępu = brak profilu */ }
        cb(u, profile);
      });
    },
    async login(login, password) {
      await authM.signInWithEmailAndPassword(auth, loginToEmail(login), password);
    },
    async logout() { await authM.signOut(auth); },
    async changePassword(oldPass, newPass) {
      const u = auth.currentUser;
      const cred = authM.EmailAuthProvider.credential(u.email, oldPass);
      await authM.reauthenticateWithCredential(u, cred);
      await authM.updatePassword(u, newPass);
    },
    // Tworzy konto technika bez wylogowywania admina (osobna instancja aplikacji).
    async createStaff({ login, password, nazwa, rola }) {
      const sec = appM.getApps().find((a) => a.name === 'secondary') || appM.initializeApp(firebaseConfig, 'secondary');
      const sAuth = authM.getAuth(sec);
      const cr = await authM.createUserWithEmailAndPassword(sAuth, loginToEmail(login), password);
      await authM.signOut(sAuth);
      await setDoc(doc(db, 'users', cr.user.uid), {
        login: String(login).trim().toLowerCase(), nazwa, rola, aktywny: true, utworzono: new Date(),
      });
      return cr.user.uid;
    },
    async isSetupDone() {
      return (await getDoc(doc(db, 'config', 'setup'))).exists();
    },
    async setupFirstAdmin({ login, password, nazwa }) {
      const cr = await authM.createUserWithEmailAndPassword(auth, loginToEmail(login), password);
      const b = writeBatch(db);
      b.set(doc(db, 'users', cr.user.uid), {
        login: String(login).trim().toLowerCase(), nazwa, rola: 'admin', aktywny: true, utworzono: new Date(),
      });
      b.set(doc(db, 'config', 'setup'), { uid: cr.user.uid, kiedy: new Date() });
      await b.commit();
    },
  };
}

// ---------- DEMO (localStorage) ----------
function demoBackend() {
  const KEY = 'iskra-demo-v1';
  const UKEY = 'iskra-demo-user';
  const subs = {};
  const userCbs = [];
  let memUser = false;

  const replacer = function (k, v) { return this[k] instanceof Date ? { __d: this[k].toISOString() } : v; };
  const reviver = (k, v) => (v && typeof v === 'object' && typeof v.__d === 'string' ? new Date(v.__d) : v);
  const clone = (x) => JSON.parse(JSON.stringify(x, replacer), reviver);

  const fresh = () => {
    const s = seedData({ uid: 'demo', nazwa: 'Demo Technik' });
    return {
      stacje: s.stacje, linie: s.linie, komunikaty: s.komunikaty,
      users: [{ id: 'demo', login: 'demo', nazwa: 'Demo Technik', rola: 'admin', aktywny: true, utworzono: new Date() }],
    };
  };
  const load = () => {
    try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw, reviver); } catch (e) {}
    return fresh();
  };
  let data = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data, replacer)); } catch (e) {} };
  const emit = (col) => (subs[col] || []).forEach((cb) => cb(clone(data[col] || [])));
  window.addEventListener('storage', (e) => { if (e.key === KEY) { data = load(); Object.keys(subs).forEach(emit); } });

  const isLogged = () => { try { return sessionStorage.getItem(UKEY) === '1'; } catch (e) { return memUser; } };
  const setLogged = (v) => { memUser = v; try { v ? sessionStorage.setItem(UKEY, '1') : sessionStorage.removeItem(UKEY); } catch (e) {} };
  const newId = () => Math.random().toString(36).slice(2, 12);
  const write = (col, fn) => { data[col] = data[col] || []; fn(data[col]); save(); emit(col); };
  const profile = () => (data.users || []).find((u) => u.id === 'demo');
  const fireUser = () => userCbs.forEach((cb) => (isLogged() ? cb({ uid: 'demo' }, clone(profile())) : cb(null, null)));

  return {
    demo: true,
    subscribe(col, cb) {
      (subs[col] = subs[col] || []).push(cb);
      setTimeout(() => cb(clone(data[col] || [])), 0);
      return () => { subs[col] = subs[col].filter((c) => c !== cb); };
    },
    async get(col, id) { const x = (data[col] || []).find((d) => d.id === id); return x ? clone(x) : null; },
    async add(col, d) { const id = newId(); write(col, (a) => a.push({ ...clone(clean(d)), id })); return id; },
    async set(col, id, d) {
      write(col, (a) => { const i = a.findIndex((x) => x.id === id); const v = { ...clone(clean(d)), id }; i >= 0 ? (a[i] = v) : a.push(v); });
    },
    async update(col, id, d) {
      write(col, (a) => { const i = a.findIndex((x) => x.id === id); const v = { ...(i >= 0 ? a[i] : {}), ...clone(clean(d)), id }; i >= 0 ? (a[i] = v) : a.push(v); });
    },
    async remove(col, id) { write(col, (a) => { const i = a.findIndex((x) => x.id === id); if (i >= 0) a.splice(i, 1); }); },
    onUser(cb) { userCbs.push(cb); setTimeout(() => (isLogged() ? cb({ uid: 'demo' }, clone(profile())) : cb(null, null)), 0); },
    async login() { setLogged(true); fireUser(); },
    async logout() { setLogged(false); fireUser(); },
    async changePassword() {},
    async createStaff({ login, nazwa, rola }) {
      const id = newId();
      write('users', (a) => a.push({ id, login: String(login).trim().toLowerCase(), nazwa, rola, aktywny: true, utworzono: new Date() }));
      return id;
    },
    async isSetupDone() { return true; },
    async setupFirstAdmin() { throw new Error('W trybie demo konfiguracja nie jest potrzebna.'); },
    resetDemo() { data = fresh(); save(); Object.keys(subs).forEach(emit); },
  };
}
