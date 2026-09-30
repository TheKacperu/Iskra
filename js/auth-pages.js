// Logowanie (login.html) i pierwsze uruchomienie (setup.html).
import { getApi, errMsg } from './api.js';
import { SITE_NAME } from './config.js';
import { esc } from './util.js';
import { mountHeader, demoBanner } from './common.js';

const app = document.getElementById('app');
const page = document.body.dataset.page;

function showErr(form, msg) { form.querySelector('.form-errors').innerHTML = msg ? esc(msg) : ''; }

async function login(api) {
  document.title = `Logowanie technika — ${SITE_NAME}`;
  let redirecting = false;
  api.onUser((u, p) => { if (u && p && p.aktywny && !redirecting) { redirecting = true; location.href = 'panel.html'; } });
  app.innerHTML = `
  <form class="card form auth" novalidate>
    <h1>Logowanie technika</h1>
    <p class="muted">Panel do dodawania utrudnień, zmian tras i linii.</p>
    ${api.demo ? '<p class="alert info">Tryb demo: wpisz cokolwiek, np. <b>demo</b> / <b>demo</b>.</p>' : ''}
    <div class="form-errors" role="alert"></div>
    <label class="f">Login<input name="login" autocomplete="username" autocapitalize="none" spellcheck="false" autofocus></label>
    <label class="f">Hasło<input name="haslo" type="password" autocomplete="current-password"></label>
    <button class="btn primary block" type="submit">Zaloguj się</button>
    <p class="muted small center" id="setup-link"></p>
  </form>`;
  const form = app.querySelector('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const l = form.login.value.trim(), h = form.haslo.value;
    if (!l || !h) return showErr(form, 'Podaj login i hasło.');
    const b = form.querySelector('button');
    b.disabled = true; b.textContent = 'Logowanie…';
    try {
      await api.login(l, h);
      redirecting = true;
      location.href = 'panel.html';
    } catch (ex) {
      showErr(form, errMsg(ex));
      b.disabled = false; b.textContent = 'Zaloguj się';
    }
  };
  try {
    if (!(await api.isSetupDone())) form.querySelector('#setup-link').innerHTML = 'Pierwsze uruchomienie? <a href="setup.html">Utwórz konto administratora</a>';
  } catch (e) { /* brak reguł / sieci — pomijamy */ }
}

async function setup(api) {
  document.title = `Pierwsze uruchomienie — ${SITE_NAME}`;
  let done = true;
  try { done = await api.isSetupDone(); } catch (e) { app.innerHTML = `<div class="alert bad">${esc(errMsg(e))}</div>`; return; }
  if (done) {
    app.innerHTML = `<div class="card center narrow"><h1>Gotowe</h1><p>Konto administratora już istnieje. Kolejnych techników dodaje administrator w panelu (zakładka Użytkownicy).</p><a class="btn primary" href="login.html">Przejdź do logowania</a></div>`;
    return;
  }
  app.innerHTML = `
  <form class="card form auth" novalidate>
    <h1>Pierwsze uruchomienie</h1>
    <p class="muted">Utwórz konto <b>administratora</b>. Ta strona zadziała tylko raz — potem technicy są dodawani w panelu.</p>
    <div class="form-errors" role="alert"></div>
    <label class="f">Login<input name="login" maxlength="30" autocapitalize="none" spellcheck="false" placeholder="np. kacper"></label>
    <label class="f">Wyświetlana nazwa<input name="nazwa" maxlength="40" placeholder="np. Kacper"></label>
    <label class="f">Hasło (min. 6 znaków)<input name="haslo" type="password" autocomplete="new-password"></label>
    <label class="f">Powtórz hasło<input name="haslo2" type="password" autocomplete="new-password"></label>
    <button class="btn primary block" type="submit">Utwórz administratora</button>
  </form>`;
  const form = app.querySelector('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = { login: form.login.value.trim().toLowerCase(), nazwa: form.nazwa.value.trim(), password: form.haslo.value };
    if (!/^[a-z0-9._-]{3,30}$/.test(d.login)) return showErr(form, 'Login: 3–30 znaków (a-z, 0-9, kropka, myślnik, podkreślnik).');
    if (!d.nazwa) return showErr(form, 'Podaj wyświetlaną nazwę.');
    if (d.password.length < 6) return showErr(form, 'Hasło musi mieć co najmniej 6 znaków.');
    if (d.password !== form.haslo2.value) return showErr(form, 'Hasła nie są takie same.');
    const b = form.querySelector('button');
    b.disabled = true; b.textContent = 'Tworzenie…';
    try { await api.setupFirstAdmin(d); location.href = 'panel.html'; }
    catch (ex) { showErr(form, errMsg(ex)); b.disabled = false; b.textContent = 'Utwórz administratora'; }
  };
}

(async () => {
  mountHeader('auth');
  const api = await getApi();
  demoBanner(api);
  if (page === 'setup') await setup(api); else await login(api);
})().catch((e) => { app.innerHTML = `<div class="alert bad">${esc(errMsg(e))}</div>`; });
