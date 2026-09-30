# Iskra: utrudnienia i zmiany w ruchu

Strona z informacjami o kolejkach na serwerze Minecraft. Pokazuje linie, trasy, stacje, utrudnienia i zmiany w ruchu. Technicy logują się i dodają komunikaty przez panel na stronie.

- **Hosting:** GitHub Pages (za darmo, same pliki statyczne, bez budowania).
- **Logowanie i baza:** Firebase Authentication + Cloud Firestore (darmowy plan Spark w zupełności wystarczy).
- **Tryb demo:** dopóki nie uzupełnisz `js/config.js`, strona działa na przykładowych danych zapisanych w Twojej przeglądarce. Dzięki temu od razu zobaczysz, jak wygląda.

## Co jest na stronie

| Strona | Co robi |
|---|---|
| `index.html` | Publiczna: stan sieci, aktywne i nadchodzące utrudnienia z filtrami, linie ze schematem trasy, stacje z koordynatami (kopiowanie `/tp`), archiwum |
| `panel.html` | Panel technika: komunikaty (dodaj, edytuj, duplikuj, zakończ, usuń), linie i trasy, stacje, użytkownicy (tylko admin), zmiana hasła |
| `login.html` | Logowanie technika (login + hasło) |
| `setup.html` | Jednorazowe utworzenie pierwszego administratora |

Status komunikatu (Nadchodzący, Aktywny, Zakończony) liczy się sam z dat „od” i „do”. Komunikat można też zakończyć ręcznie przyciskiem.

---

## Uruchomienie krok po kroku

### 1. Firebase (ok. 10 minut)

1. Wejdź na <https://console.firebase.google.com> → **Dodaj projekt** (Google Analytics nie jest potrzebne).
2. **Build → Authentication → Rozpocznij → Sign-in method → Email/Password → Włącz** (tylko pierwszy przełącznik) → Zapisz.
3. **Build → Firestore Database → Utwórz bazę danych**, wybierz lokalizację (np. `eur3` / `europe-central2`) i start w **trybie produkcyjnym**.
4. W zakładce **Reguły** bazy wklej całą zawartość pliku [`firestore.rules`](firestore.rules) i kliknij **Opublikuj**.
5. **Ustawienia projektu (⚙) → Ogólne → Twoje aplikacje → ikona `</>`**: zarejestruj aplikację webową (bez Hostingu). Skopiuj obiekt `firebaseConfig`.
6. Wklej te wartości do [`js/config.js`](js/config.js) w miejsce `WPISZ_TUTAJ…`.

### 2. GitHub Pages

1. Utwórz repozytorium na GitHubie i wrzuć do niego wszystkie pliki z tego folderu.
2. W repozytorium: **Settings → Pages → Source: Deploy from a branch → Branch: `main`, folder `/ (root)`** → Save.
3. Po minucie strona będzie pod adresem `https://TWOJ-LOGIN.github.io/NAZWA-REPO/`.
4. **Ważne:** w Firebase: **Authentication → Settings → Authorized domains → Add domain** dodaj `TWOJ-LOGIN.github.io`, inaczej logowanie nie zadziała.

### 3. Pierwszy administrator

1. Otwórz `https://TWOJ-LOGIN.github.io/NAZWA-REPO/setup.html`.
2. Podaj login, nazwę i hasło. To konto staje się **administratorem**.
3. Strona `setup.html` działa tylko raz. Reguły Firestore blokują kolejne użycie.
4. W panelu możesz kliknąć **„Wgraj przykładowe dane”**, żeby zobaczyć przykład, albo od razu dodawać własne stacje.

### 4. Dodawanie techników

Panel → **Użytkownicy** → podaj login, nazwę, hasło startowe i rolę. Przekaż technikowi login i hasło. Hasło zmieni sam w zakładce **Moje konto**.

- **Technik:** komunikaty, linie, trasy, stacje.
- **Administrator:** to samo, plus zarządzanie kontami (dodawanie, wyłączanie, zmiana roli).
- **Zapomniane hasło:** wyłącz konto i utwórz nowe z innym loginem, albo usuń użytkownika w Firebase Console → Authentication i utwórz go ponownie z tym samym loginem.

Pod spodem login `kacper` jest zapisywany w Firebase jako `kacper@technik.iskra` (ustawienie `LOGIN_DOMAIN` w `js/config.js`; nie zmieniaj go po utworzeniu kont).

---

## Typowa kolejność pracy

1. **Stacje:** nazwa, kod (np. `CEN`), koordynaty z F3, wymiar.
2. **Linie:** numer, kolor, typ, trasa (dodajesz stacje po kolei, kolejność zmieniasz przeciąganiem lub strzałkami, czas przejazdu w minutach jest opcjonalny).
3. **Komunikaty:** rodzaj (utrudnienie, zmiana trasy, objazd, zawieszenie, prace, informacja), ważność, od–do, linie i stacje, treść, opcjonalna trasa objazdowa.

Treść komunikatu obsługuje proste formatowanie: `**pogrubienie**`, `*kursywa*`, `- lista`, `[link](https://...)`.

## Podgląd lokalny

Moduły JS nie działają przy otwieraniu pliku przez `file://`, więc uruchom prosty serwer w tym folderze:

```bash
npx serve .
```

Potem otwórz adres, który pokaże się w terminalu (np. <http://localhost:3000>). Bez uzupełnionego `config.js` strona działa w trybie demo. Tryb demo możesz też wymusić, dodając `?demo` do adresu. Żeby logowanie działało lokalnie z prawdziwym Firebase, `localhost` musi być na liście Authorized domains (jest tam domyślnie).

## Kopia zapasowa

- Najprościej: Firebase Console → Firestore → możesz przeglądać i ręcznie eksportować dokumenty.
- Pełny eksport (`gcloud firestore export`) wymaga planu Blaze, więc dla serwera Minecraft zwykle nie jest potrzebny.
- Reguły możesz też wgrywać z terminala: `npx firebase-tools deploy --only firestore:rules` (plik `firebase.json` jest gotowy).

## Bezpieczeństwo

- Klucz `apiKey` w `config.js` jest publiczny z założenia. Tak działa każda aplikacja Firebase w przeglądarce. Dane chronią reguły z `firestore.rules`: czytać może każdy, zapisywać tylko aktywne konta z rolą technik lub admin.
- Treść komunikatów jest zawsze escapowana, więc wpisany HTML i skrypty się nie wykonają.
- Limit prób logowania zapewnia Firebase (`auth/too-many-requests`).
- Nie ma publicznej rejestracji. Konta tworzy tylko administrator.

## Struktura plików

```
index.html  panel.html  login.html  setup.html
css/style.css
js/config.js       ← Twoja konfiguracja Firebase
js/api.js          ← warstwa danych (Firebase lub demo)
js/public.js       ← strona publiczna
js/panel.js        ← panel technika
js/auth-pages.js   ← logowanie i pierwszy admin
js/util.js  js/common.js  js/seed.js
firestore.rules    ← reguły bezpieczeństwa bazy
```
