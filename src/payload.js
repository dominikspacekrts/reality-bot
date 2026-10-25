import { loadConfig, loadState, isRunning, getProgress } from './store.js';

/** Next scheduled check, read in Prague time. */
export function nextRun(schedule) {
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

/** Everything the UI needs; served by the local server and written to data.json for the web. */
export function buildPayload({ isStatic = false } = {}) {
  const cfg = loadConfig();
  const state = loadState();
  const running = !isStatic && isRunning();
  return {
    static: isStatic,
    listings: Object.values(state.listings),
    user: isStatic ? {} : state.user || {},
    lastRun: state.runs?.[0] || null,
    running,
    progress: running ? getProgress() : null,
    nextRun: nextRun(cfg.schedule),
    search: cfg.search,
    emailEnabled: Boolean(cfg.email?.enabled),
    pushEnabled: Boolean(cfg.push?.enabled),
  };
}
