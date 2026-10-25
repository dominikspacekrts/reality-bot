import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './store.js';

const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const czk = (n) => `${Math.round(n).toLocaleString('cs-CZ')} Kč`;

export function renderEmail(listings) {
  const rows = listings
    .map(
      (l) => `
  <tr><td style="padding:16px 0;border-bottom:1px solid #eee">
    ${l.images?.[0] ? `<img src="${esc(l.images[0])}" width="560" style="max-width:100%;border-radius:8px;display:block;margin-bottom:10px">` : ''}
    <div style="font:600 17px system-ui">${esc(l.disposition)} · ${l.area ? `${l.area} m² · ` : ''}${esc(l.locality)}</div>
    <div style="font:15px system-ui;color:#333;margin:4px 0">${czk(l.total)} se vším <span style="color:#888">(nájem ${czk(l.rent)} + ${czk(l.fees)} ${esc(l.feesSource)})</span></div>
    <div style="font:14px system-ui;color:#555">Skóre ${l.score}/100${l.pros.length ? ` · ${esc(l.pros.join(' · '))}` : ''}</div>
    ${l.warnings.length ? `<div style="font:13px system-ui;color:#b45309;margin-top:4px">${esc(l.warnings.join(' · '))}</div>` : ''}
    <a href="${esc(l.url)}" style="display:inline-block;margin-top:8px;font:600 14px system-ui;color:#111">Otevřít inzerát (${esc(l.source)}) →</a>
  </td></tr>`,
    )
    .join('');
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#fff">
<table width="100%" style="max-width:600px;margin:0 auto"><tr><td>
<h1 style="font:600 20px system-ui;margin:0 0 4px">${listings.length === 1 ? 'Nový byt' : `${listings.length} nové byty`} bez realitky</h1>
<p style="font:14px system-ui;color:#666;margin:0">Každý inzerát jsem před odesláním otevřel a ověřil, že je aktivní.</p>
</td></tr>${rows}</table></body></html>`;
}

/**
 * Sends new listings by e-mail. Until the rts-control connection is set up,
 * each e-mail is written to outbox/ so nothing is lost.
 */
export async function notify(listings, cfg) {
  if (!listings.length) return { sent: false, reason: 'nic nového' };
  const subject = `Reality bot: ${listings.length} ${listings.length === 1 ? 'nový byt' : 'nové byty'} – nejlepší ${listings[0].disposition} ${listings[0].locality}`;
  const html = renderEmail(listings);

  const outbox = path.join(ROOT, 'outbox');
  fs.mkdirSync(outbox, { recursive: true });
  const file = path.join(outbox, `${new Date().toISOString().replace(/[:.]/g, '-')}.html`);
  fs.writeFileSync(file, html);

  const push = await sendPush(listings, cfg.push).catch((err) => ({ sent: false, reason: `chyba: ${err.message}` }));
  const email = cfg.email || {};
  let res;
  if (!email.enabled) res = { sent: false, reason: 'e-mail zatím není zapnutý', file, subject };
  else if (email.transport === 'rts-control') res = await sendViaRtsControl({ to: email.to, subject, html }, email.rtsControl, file);
  else res = { sent: false, reason: `neznámý transport ${email.transport}`, file };
  return { ...res, push };
}

const pushTitle = (l) => `${l.disposition}${l.area ? ` · ${l.area} m²` : ''} · ${l.locality} · ${czk(l.total)}`;

/** One phone notification per new flat (best first) via ntfy; tapping it opens the listing. */
export async function sendPush(listings, opts = {}) {
  if (!opts.enabled) return { sent: false, reason: 'vypnuto' };
  if (opts.provider !== 'ntfy' || !opts.topic) return { sent: false, reason: 'chybí nastavení ntfy' };
  const max = opts.maxPerRun || 8;
  const messages = listings.slice(0, max).map((l) => ({
    topic: opts.topic,
    title: pushTitle(l),
    message: [`Skóre ${l.score}/100`, ...l.pros.slice(0, 4), ...l.warnings.slice(0, 2).map((w) => `⚠ ${w}`)].join(' · '),
    click: l.url,
    tags: ['house'],
    priority: l.score >= 60 ? 4 : 3,
    ...(l.images?.[0] ? { attach: l.images[0] } : {}),
    actions: [{ action: 'view', label: 'Otevřít inzerát', url: l.url }],
  }));
  if (listings.length > max) {
    messages.push({
      topic: opts.topic,
      title: `+ dalších ${listings.length - max} nových bytů`,
      message: 'Všechny najdeš v aplikaci Reality bot (http://localhost:4747).',
      tags: ['house'],
    });
  }
  let ok = 0;
  for (const m of messages) {
    const res = await fetch(opts.server || 'https://ntfy.sh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(m),
    });
    if (res.ok) ok++;
  }
  return { sent: ok > 0, reason: `odesláno ${ok}/${messages.length} upozornění` };
}

// Placeholder for the rts-control integration; filled in as the last step.
async function sendViaRtsControl(message, opts = {}, file) {
  if (!opts.endpoint) return { sent: false, reason: 'rts-control není nastavený (config.json → email.rtsControl)', file };
  const res = await fetch(opts.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}) },
    body: JSON.stringify(message),
  });
  return { sent: res.ok, reason: res.ok ? 'odesláno' : `rts-control vrátil HTTP ${res.status}`, file, subject: message.subject };
}
