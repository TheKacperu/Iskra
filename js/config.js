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
  apiKey: "WPISZ_TUTAJ_API_KEY",
  authDomain: "twoj-projekt.firebaseapp.com",
  projectId: "twoj-projekt",
  storageBucket: "twoj-projekt.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000"
};

// Nazwa sieci wyświetlana w nagłówku strony
export const SITE_NAME = "Iskra";
export const SITE_SUBTITLE = "Komunikacja kolejowa";

// Technicy logują się samym loginem (np. "kacper").
// Pod spodem Firebase potrzebuje e-maila, więc login zamieniany jest na
// login@LOGIN_DOMAIN. Nie zmieniaj tego po utworzeniu kont!
export const LOGIN_DOMAIN = "technik.iskra";
