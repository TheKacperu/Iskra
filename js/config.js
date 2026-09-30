// ============================================================
//  KONFIGURACJA — tylko ten plik musisz edytować.
//  Dane skopiuj z: Firebase Console → Ustawienia projektu (⚙) →
//  „Twoje aplikacje” → aplikacja internetowa (</>) → firebaseConfig.
//
//  Dopóki apiKey zaczyna się od "WPISZ", strona działa w TRYBIE DEMO
//  (przykładowe dane zapisywane tylko w Twojej przeglądarce).
//  Klucze Firebase dla aplikacji webowych są publiczne z założenia —
//  bezpieczeństwo zapewniają reguły z pliku firestore.rules.
// ============================================================

export const firebaseConfig = {
  apiKey: "AIzaSyCHTP2HlhFYx9acVRAaxAUddTy0uMeenbc",
  authDomain: "iskra-a7edb.firebaseapp.com",
  projectId: "iskra-a7edb",
  storageBucket: "iskra-a7edb.firebasestorage.app",
  messagingSenderId: "746178973577",
  appId: "1:746178973577:web:91106c038754748bc9db58"
};

// Nazwa sieci wyświetlana w nagłówku strony
export const SITE_NAME = "Iskra";
export const SITE_SUBTITLE = "Komunikacja kolejowa";

// Technicy logują się samym loginem (np. "kacper").
// Pod spodem Firebase potrzebuje e-maila, więc login zamieniany jest na
// login@LOGIN_DOMAIN. Nie zmieniaj tego po utworzeniu kont!
export const LOGIN_DOMAIN = "technik.iskra";
