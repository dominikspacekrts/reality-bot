const $ = (s) => document.querySelector(s);
const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const czk = (n) => `${Math.round(n || 0).toLocaleString('cs-CZ')} Kč`;
const time = (iso) => (iso ? new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) : '–');
const dateTime = (iso) => {
  if (!iso) return '–';
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? `dnes ${time(iso)}` : d.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const SOURCE = { sreality: 'Sreality', bezrealitky: 'Bezrealitky', ulovdomov: 'UlovDomov' };

let data = { listings: [], user: {} };
let tab = 'active';
const prefs = (() => {
  try { return JSON.parse(localStorage.getItem('prefs')) || {}; } catch { return {}; }
})();

function savePrefs() {
  try { localStorage.setItem('prefs', JSON.stringify(prefs)); } catch {}
}

// Stars and hides live in the browser on the web version (there is no server to save them).
const localUser = () => {
  try { return JSON.parse(localStorage.getItem('user')) || {}; } catch { return {}; }
};

// Locality on/off: the server decides locally; on the web it is the viewer's own choice.
const anyLocality = () => (data.static && prefs.anyLocality != null ? prefs.anyLocality : Boolean(data.search?.ignoreLocality));

function applyVariant() {
  const key = anyLocality() ? 'any' : 'strict';
  data.listings = data.raw.map((l) => (l.status !== 'inactive' && l.variants?.[key] ? { ...l, ...l.variants[key] } : l));
}

async function load() {
  let next;
  try {
    const res = await fetch('/api/listings');
    if (!res.ok) throw new Error();
    next = await res.json();
  } catch {
    next = await (await fetch(`data.json?t=${Date.now()}`)).json();
    next.static = true;
  }
  data = { ...next, raw: next.listings };
  if (data.static) data.user = localUser();
  applyVariant();
  renderHeader();
  render();
}

function renderHeader() {
  const s = data.search || {};
  const move = s.moveInDate ? ` · nastěhování ${new Date(s.moveInDate).toLocaleDateString('cs-CZ')}` : '';
  const where = anyLocality() ? 'celá Praha' : 'jen hezké lokality';
  $('#criteria').textContent = `Praha · 2+kk a větší · do ${czk(s.maxTotalPrice)} se vším${s.stretchMaxTotalPrice > s.maxTotalPrice ? ` (výjimečné až ${czk(s.stretchMaxTotalPrice)})` : ''}${move} · ${where} · bez realitky`;
  if (!savingSettings) $('#fAnyLocality').checked = anyLocality();
  const r = data.lastRun;
  const parts = [];
  const pct = data.progress?.percent ?? 0;
  if (data.running) parts.push(`Kontroluji inzeráty… ${pct} %${data.progress?.phase ? ` (${data.progress.phase})` : ''}`);
  else if (r) parts.push(`Poslední kontrola ${dateTime(r.finishedAt || r.at)} · otevřeno ${r.opened} inzerátů`);
  const next = nextRunLocal(data.schedule) || data.nextRun;
  if (next) parts.push(`další ${dateTime(next)}`);
  parts.push(data.pushEnabled ? 'upozornění na telefon zapnutá' : 'upozornění na telefon vypnutá');
  if (data.static) parts.push('běží v cloudu');
  $('#status').textContent = parts.join(' · ');
  $('#checkBtn').hidden = Boolean(data.static);
  $('#checkBtn').disabled = data.running;
  $('#checkBtn').textContent = data.running ? `Kontroluji… ${pct} %` : 'Zkontrolovat teď';
  $('#progress').hidden = !data.running;
  $('#progress span').style.width = `${pct}%`;
}

// Schedule times are Prague times; the build server runs in UTC, so work it out here.
function nextRunLocal(schedule) {
  if (!schedule?.length) return null;
  const now = new Date();
  for (let day = 0; day < 2; day++) {
    for (const t of schedule) {
      const [h, m] = t.split(':').map(Number);
      const d = new Date(now);
      d.setDate(d.getDate() + day);
      d.setHours(h, m, 0, 0);
      if (d > now) return d.toISOString();
    }
  }
  return null;
}

function bucket(l) {
  const u = data.user[l.id] || {};
  if (l.status !== 'active') return l.status;
  return u.hidden ? 'hidden' : 'active';
}

// Days between availability and the wished move-in date; unknown dates go last.
function moveInGap(l) {
  const target = Date.parse(data.search?.moveInDate || '');
  if (!l.moveIn || Number.isNaN(target)) return 1e9;
  const diff = (Date.parse(l.moveIn) - target) / 864e5;
  return diff > 0 ? diff * 2 : -diff; // being late hurts more than being early
}

function visible() {
  const u = data.user;
  let items = data.listings.filter((l) => {
    if (tab === 'favorite') return u[l.id]?.favorite;
    if (tab === 'active') return l.status === 'active' && (prefs.hidden || !u[l.id]?.hidden);
    return l.status === tab;
  });
  if (prefs.parking) items = items.filter((l) => l.parking || l.garage);
  if (prefs.old) items = items.filter((l) => l.oldBuilding || l.highCeilings);
  const sorters = {
    score: (a, b) => (b.score || 0) - (a.score || 0),
    price: (a, b) => (a.total || 0) - (b.total || 0),
    new: (a, b) => Date.parse(b.published || b.firstSeen) - Date.parse(a.published || a.firstSeen),
    area: (a, b) => (b.area || 0) - (a.area || 0),
    kitchen: (a, b) => (b.kitchenScore || 0) - (a.kitchenScore || 0) || (b.score || 0) - (a.score || 0),
    moveIn: (a, b) => moveInGap(a) - moveInGap(b) || (b.score || 0) - (a.score || 0),
  };
  return items.sort(sorters[prefs.sort || 'score']);
}

function card(l) {
  const u = data.user[l.id] || {};
  const isNew = data.lastRun && l.firstSeen >= data.lastRun.at && l.status === 'active';
  const img = l.images?.[0];
  const pros = (l.pros || []).map((p) => `<span class="chip good">${esc(p)}</span>`).join('');
  const facts = [
    l.floor != null && `${l.floor}. patro`,
    l.buildingType,
    l.lift && 'výtah',
    l.balcony && 'balkon',
    l.furnished && l.furnished !== 'Ne' && `vybavený: ${l.furnished.toLowerCase()}`,
    l.moveIn && `nastěhování od ${new Date(l.moveIn).toLocaleDateString('cs-CZ')}`,
    l.kitchen && `kuchyň: ${l.kitchen}${l.kitchenDetails?.length ? ` (${l.kitchenDetails.join(', ')})` : ''}`,
  ].filter(Boolean).map((f) => `<span class="chip">${esc(f)}</span>`).join('');
  const feeLabel = { uvedeno: 'poplatky', 'z popisu': 'poplatky z popisu', 'v ceně': 'poplatky v ceně', odhad: 'odhad poplatků' }[l.feesSource] || 'poplatky';
  const showReason = l.status !== 'active' && l.reason;

  return `<article class="card ${u.hidden && tab === 'active' ? 'is-dim' : ''}">
    <div class="photo">
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
      ${l.score != null ? `<span class="score ${l.score >= 50 ? 'hi' : ''}">${l.score}</span>` : ''}
      ${isNew ? '<span class="new">nové</span>' : ''}
    </div>
    <div class="body">
      <div class="title">${esc(l.disposition)}${l.area ? ` · ${l.area} m²` : ''} · ${esc(l.locality || l.quarter || 'Praha')}</div>
      <div class="addr">${esc([l.street, l.district].filter(Boolean).join(', '))}</div>
      ${l.total ? `<div class="price">${czk(l.total)} <small>nájem ${czk(l.rent)} + ${czk(l.fees)} ${feeLabel}</small></div>` : ''}
      ${showReason ? `<div class="chips"><span class="chip bad" title="Proč byl vyřazen">${esc(l.reason)}</span></div>` : ''}
      ${pros ? `<div class="chips">${pros}</div>` : ''}
      ${facts ? `<div class="chips">${facts}</div>` : ''}
      ${(l.warnings || []).length && l.status === 'active' ? `<div class="warn">${esc(l.warnings.join(' · '))}</div>` : ''}
      <div class="foot">
        <span>${SOURCE[l.source] || l.source} · ověřeno ${dateTime(l.lastVerified)}</span>
        <span class="actions">
          <button class="icon ${u.favorite ? 'on' : ''}" data-act="favorite" data-id="${esc(l.id)}" title="Oblíbit">${u.favorite ? '★' : '☆'}</button>
          <button class="icon" data-act="hidden" data-id="${esc(l.id)}" title="${u.hidden ? 'Zobrazit' : 'Skrýt'}">${u.hidden ? '↺' : '✕'}</button>
          <a class="open" href="${esc(l.url)}" target="_blank" rel="noopener">Otevřít ↗</a>
        </span>
      </div>
    </div>
  </article>`;
}

function render() {
  const counts = { active: 0, favorite: 0, rejected: 0, inactive: 0 };
  for (const l of data.listings) {
    const b = bucket(l);
    if (b in counts) counts[b]++;
    if (data.user[l.id]?.favorite) counts.favorite++;
  }
  for (const [k, v] of Object.entries(counts)) $(`#c-${k}`).textContent = v || '';
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-on', t.dataset.tab === tab));

  const items = visible();
  const hints = {
    active: 'Seřazeno podle toho, jak sedí na tvoje přání: lokalita (pokud není zapnutá celá Praha), starší dům s vysokými stropy, velikost, kuchyň, termín nastěhování, parkování, cena. Každý inzerát byl otevřen a ověřen.',
    favorite: 'Byty, které sis označil hvězdičkou.',
    rejected: 'Inzeráty, které bot otevřel, ale nesplnily podmínky – s důvodem.',
    inactive: 'Inzeráty, které už nejsou aktivní nebo jsou rezervované.',
  };
  $('#hint').textContent = hints[tab];
  $('#list').innerHTML = items.length
    ? items.map(card).join('')
    : `<div class="empty">${data.listings.length ? 'Nic tu není.' : 'Zatím žádná data – spusť kontrolu.'}</div>`;
}

$('#list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const { id, act } = btn.dataset;
  const cur = data.user[id] || {};
  const patch = { [act]: !cur[act] };
  data.user[id] = { ...cur, ...patch };
  render();
  if (data.static) {
    try { localStorage.setItem('user', JSON.stringify(data.user)); } catch {}
    return;
  }
  await fetch(`/api/user/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(patch) });
});

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { tab = t.dataset.tab; render(); }));

for (const [id, key] of [['#fParking', 'parking'], ['#fOld', 'old'], ['#fHidden', 'hidden']]) {
  $(id).checked = Boolean(prefs[key]);
  $(id).addEventListener('change', (e) => { prefs[key] = e.target.checked; savePrefs(); render(); });
}
// Locally stored on the server, because it also decides what the notifications contain.
let savingSettings = false;
$('#fAnyLocality').addEventListener('change', async (e) => {
  if (data.static) {
    prefs.anyLocality = e.target.checked;
    savePrefs();
    applyVariant();
    renderHeader();
    return render();
  }
  savingSettings = true;
  e.target.disabled = true;
  try {
    const res = await fetch('/api/settings', { method: 'POST', body: JSON.stringify({ ignoreLocality: e.target.checked }) });
    if (!res.ok) alert((await res.json()).error || 'Nastavení se nepodařilo uložit');
  } finally {
    savingSettings = false;
    e.target.disabled = false;
  }
  await load();
});

$('#sort').value = prefs.sort || 'score';
$('#sort').addEventListener('change', (e) => { prefs.sort = e.target.value; savePrefs(); render(); });

// While a check runs (from here, the schedule or the terminal) keep the page fresh.
let poll = null;
function watchRunning() {
  if (data.running && !poll) {
    poll = setInterval(async () => {
      await load();
      if (!data.running) clearInterval(poll), (poll = null);
    }, 2000);
  }
}

$('#checkBtn').addEventListener('click', async () => {
  await fetch('/api/check', { method: 'POST' });
  data.running = true;
  renderHeader();
  watchRunning();
});

load().then(watchRunning);
