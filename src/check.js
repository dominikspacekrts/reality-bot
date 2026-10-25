import { pathToFileURL } from 'node:url';
import * as sreality from './sources/sreality.js';
import * as bezrealitky from './sources/bezrealitky.js';
import * as ulovdomov from './sources/ulovdomov.js';
import { analyze, rejectReason, goneHint } from './analyze.js';
import { mapLimit } from './http.js';
import { notify } from './notify.js';
import { loadConfig, loadState, saveState, acquireLock, releaseLock, setProgress } from './store.js';

const SOURCES = { sreality, bezrealitky, ulovdomov };

const log = (...a) => console.log(new Date().toLocaleTimeString('cs-CZ'), ...a);

/** Cheap filter before opening a listing, to avoid needless requests. */
function worthOpening(item, cfg) {
  if (item.rooms != null && item.rooms < cfg.minRooms) return false;
  if (item.rooms === 0) return false;
  if (item.rent > (cfg.stretchMaxTotalPrice || cfg.maxTotalPrice)) return false;
  return true;
}

/** Scores a listing both with and without the locality rule; the configured one becomes current. */
function evaluate(listing, sc) {
  const variants = {};
  let current;
  for (const ignore of [false, true]) {
    const cfg = { ...sc, ignoreLocality: ignore };
    const merged = analyze(listing, cfg);
    const reason = rejectReason(merged, cfg) || goneHint(merged);
    const v = { status: reason ? 'rejected' : 'active', reason, score: merged.score };
    variants[ignore ? 'any' : 'strict'] = v;
    if (ignore === Boolean(sc.ignoreLocality)) current = { ...merged, ...v };
  }
  return { ...current, variants };
}

/** Re-scores stored listings after a settings change, without opening them again. */
export function reevaluate() {
  const sc = loadConfig().search;
  const state = loadState();
  for (const [id, l] of Object.entries(state.listings)) {
    if (l.status === 'inactive') continue;
    const { status, reason, score, pros, warnings, variants, _status, ...raw } = l;
    state.listings[id] = evaluate(raw, sc);
  }
  saveState(state);
}

export async function runCheck() {
  if (!acquireLock()) {
    log('Kontrola už běží, přeskakuji.');
    return null;
  }
  const started = new Date().toISOString();
  const cfg = loadConfig();
  const sc = cfg.search;
  const state = loadState();
  const run = { at: started, found: {}, opened: 0, active: 0, new: 0, errors: [] };

  try {
    const seenNow = new Set();
    const names = Object.keys(SOURCES);
    // Read all result lists first, so the progress knows how many listings it will open.
    const queue = [];
    for (const [i, name] of names.entries()) {
      setProgress({ phase: `načítám výpis ${name}`, percent: Math.round((i / names.length) * 10) });
      let items = [];
      try {
        const limit = sc.stretchMaxTotalPrice || sc.maxTotalPrice;
        items = await SOURCES[name].list({ maxRent: limit, maxTotal: limit });
      } catch (err) {
        run.errors.push(`${name}: ${err.message}`);
        log(`Chyba ${name}:`, err.message);
        continue;
      }
      const candidates = items.filter((it) => worthOpening(it, sc));
      run.found[name] = { listed: items.length, candidates: candidates.length };
      log(`${name}: ${items.length} soukromých inzerátů, otevírám ${candidates.length}`);
      queue.push(...candidates.map((item) => ({ item, src: SOURCES[name] })));
    }

    let done = 0;
    const tick = () => {
      done++;
      if (done % 5 === 0 || done === queue.length) {
        setProgress({ phase: `otevírám inzeráty ${done}/${queue.length}`, percent: 10 + Math.round((done / queue.length) * 90) });
      }
    };
    {
      await mapLimit(queue, 3, async ({ item, src }) => {
        tick();
        seenNow.add(item.id);
        const prev = state.listings[item.id];
        let d;
        try {
          d = await src.detail(item);
        } catch (err) {
          run.errors.push(`${item.id}: ${err.message}`);
          return;
        }
        run.opened++;
        const now = new Date().toISOString();
        const base = { firstSeen: prev?.firstSeen || now, lastSeen: now, lastVerified: now, notifiedAt: prev?.notifiedAt || null };
        if (!d.active) {
          state.listings[item.id] = { ...(prev || item), ...base, status: 'inactive', reason: d.inactiveReason };
          return;
        }
        const { _status, ...listed } = item; // raw source record, not needed after the list step
        state.listings[item.id] = { ...evaluate({ ...listed, ...d }, sc), ...base };
        if (state.listings[item.id].status === 'active') run.active++;
      });
    }

    // Anything that was active but disappeared from the results is no longer offered.
    const okSources = Object.keys(run.found);
    for (const l of Object.values(state.listings)) {
      if (l.status === 'active' && !seenNow.has(l.id) && okSources.includes(l.source)) {
        l.status = 'inactive';
        l.reason = 'zmizel z výpisu inzerátů';
      }
    }

    const fresh = Object.values(state.listings)
      .filter((l) => l.status === 'active' && !l.notifiedAt)
      .sort((a, b) => b.score - a.score);
    run.new = fresh.length;
    if (fresh.length) {
      const res = await notify(fresh, cfg);
      run.email = res;
      run.push = res.push;
      const now = new Date().toISOString();
      // Mark as notified once any channel delivered, or once saved to outbox while all are off.
      const anyOn = cfg.email?.enabled || cfg.push?.enabled;
      if (!anyOn || res.sent || res.push?.sent) fresh.forEach((l) => (l.notifiedAt = now));
      log(`Nové byty: ${fresh.length}. E-mail: ${res.reason}${res.file ? ` (${res.file})` : ''}. Telefon: ${res.push?.reason || 'vypnuto'}`);
    }
  } finally {
    run.finishedAt = new Date().toISOString();
    state.runs = [run, ...(state.runs || [])].slice(0, 60);
    state.user = loadState().user || {}; // keep stars/hides made in the UI during the run
    saveState(state);
    // Settings changed during the run (e.g. "celá Praha" in the UI) apply right away.
    if (loadConfig().search.ignoreLocality !== sc.ignoreLocality) reevaluate();
    releaseLock();
  }
  log(`Hotovo: otevřeno ${run.opened}, vyhovuje ${run.active}, nových ${run.new}.`);
  return run;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCheck().catch((err) => {
    console.error(err);
    releaseLock();
    process.exit(1);
  });
}
