// Stałe, formatowanie i bezpieczne renderowanie tekstu.

export const TYPY = {
  utrudnienie: { label: 'Utrudnienie', icon: '⚠️' },
  zmiana_trasy: { label: 'Zmiana trasy', icon: '🔀' },
  objazd: { label: 'Objazd', icon: '↪️' },
  zawieszenie: { label: 'Zawieszenie kursów', icon: '⛔' },
  prace: { label: 'Prace techniczne', icon: '🛠️' },
  informacja: { label: 'Informacja', icon: 'ℹ️' },
};
export const WAZNOSC = {
  niska: { label: 'Niska', rank: 1 },
  srednia: { label: 'Średnia', rank: 2 },
  wysoka: { label: 'Wysoka', rank: 3 },
};
export const STATUS_K = { aktywny: 'Aktywny', nadchodzacy: 'Nadchodzący', zakonczony: 'Zakończony' };
export const LINIA_TYPY = { osobowa: 'Osobowa', ekspres: 'Ekspres', metro: 'Metro', towarowa: 'Towarowa' };
export const LINIA_STATUS = { czynna: 'Czynna', zawieszona: 'Zawieszona', budowa: 'W budowie' };
export const STACJA_STATUS = { czynna: 'Czynna', zamknieta: 'Zamknięta', budowa: 'W budowie' };
export const WYMIARY = { overworld: 'Overworld', nether: 'Nether', end: 'End' };
export const ROLE = { technik: 'Technik', admin: 'Administrator' };

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function statusOf(k, now = new Date()) {
  if (k.zakonczony) return 'zakonczony';
  if (k.od && now < k.od) return 'nadchodzacy';
  if (k.do && now > k.do) return 'zakonczony';
  return 'aktywny';
}
export const rank = (w) => (WAZNOSC[w] ? WAZNOSC[w].rank : 0);

const dtf = new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const fmt = (d) => (d instanceof Date && !isNaN(d) ? dtf.format(d) : '—');
export const fmtTime = (d) => d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

const rtf = new Intl.RelativeTimeFormat('pl', { numeric: 'auto' });
export function rel(d, now = new Date()) {
  if (!(d instanceof Date)) return '';
  const s = (d - now) / 1000, a = Math.abs(s);
  if (a < 60) return 'teraz';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}

export function toLocalInput(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromLocalInput(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

// Czas przejazdu trzymamy w minutach (może być ułamek, np. 0.75 = 45 s).
export function fmtDur(min) {
  let s = Math.round(Number(min) * 60);
  if (!Number.isFinite(s) || s <= 0) return '';
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  return [h && `${h} h`, m && `${m} min`, s && `${s} s`].filter(Boolean).join(' ');
}

// Polska odmiana: plural(2, 'przesiadka', 'przesiadki', 'przesiadek') → "przesiadki"
export function plural(n, one, few, many) {
  if (n === 1) return one;
  const d = n % 10, dd = n % 100;
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? few : many;
}

// Koordynaty są opcjonalne — każdy z X/Y/Z może być pusty (null).
export const hasCoord = (v) => typeof v === 'number' && Number.isFinite(v);
export function coordsText(s) {
  const parts = ['x', 'y', 'z'].filter((k) => hasCoord(s[k])).map((k) => `${k.toUpperCase()} ${s[k]}`);
  return esc(parts.join(' · '));
}

export const safeColor =(c) => (/^#[0-9a-fA-F]{6}$/.test(c || '') ? c : '#6b7280');
export function textOn(hex) {
  const c = safeColor(hex);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? '#111111' : '#ffffff';
}
export const chipStyle = (kolor) => `background:${safeColor(kolor)};color:${textOn(kolor)}`;

export function lineChip(l, href) {
  if (!l) return '';
  const tag = href ? 'a' : 'span';
  return `<${tag} class="line-chip"${href ? ` href="${esc(href)}"` : ''} style="${chipStyle(l.kolor)}">${esc(l.nazwa)}</${tag}>`;
}
export function stationChip(s, href) {
  if (!s) return '';
  const tag = href ? 'a' : 'span';
  return `<${tag} class="st-chip"${href ? ` href="${esc(href)}"` : ''}>${esc(s.nazwa)} <small>${esc(s.kod)}</small></${tag}>`;
}

// Mini-Markdown: **pogrubienie**, *kursywa*, `kod`, [link](https://…), listy "- ", nagłówki "#".
// Najpierw escapujemy cały tekst, więc HTML wpisany przez użytkownika nigdy się nie wykona.
function inline(s) {
  return s
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}
export function md(src) {
  const lines = esc(src || '').split(/\r?\n/);
  let out = '', inList = false, para = [];
  const flush = () => { if (para.length) { out += `<p>${para.map(inline).join('<br>')}</p>`; para = []; } };
  for (const line of lines) {
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) { flush(); if (!inList) { out += '<ul>'; inList = true; } out += `<li>${inline(li[1])}</li>`; continue; }
    if (inList) { out += '</ul>'; inList = false; }
    if (!line.trim()) { flush(); continue; }
    const h = line.match(/^#{1,3}\s+(.*)$/);
    if (h) { flush(); out += `<h4>${inline(h[1])}</h4>`; continue; }
    para.push(line);
  }
  flush();
  if (inList) out += '</ul>';
  return out;
}

export function options(map, selected, { empty } = {}) {
  return (empty !== undefined ? `<option value="">${esc(empty)}</option>` : '') +
    Object.entries(map).map(([v, o]) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(typeof o === 'string' ? o : o.label)}</option>`).join('');
}

export const byName = (a, b) => String(a.nazwa).localeCompare(String(b.nazwa), 'pl', { numeric: true });
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
