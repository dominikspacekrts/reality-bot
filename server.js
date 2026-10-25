import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadConfig, loadState, saveState, isRunning } from './src/store.js';
import { buildPayload } from './src/payload.js';
import { runCheck, reevaluate } from './src/check.js';

const PUBLIC = path.join(ROOT, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => resolve(b ? JSON.parse(b) : {}));
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/listings') return json(res, 200, buildPayload());

  if (url.pathname === '/api/check' && req.method === 'POST') {
    if (isRunning()) return json(res, 409, { error: 'Kontrola už běží' });
    runCheck().catch((err) => console.error(err));
    return json(res, 202, { started: true });
  }

  if (url.pathname === '/api/settings' && req.method === 'POST') {
    const patch = await readBody(req);
    const cfg = loadConfig();
    if (typeof patch.ignoreLocality === 'boolean') cfg.search.ignoreLocality = patch.ignoreLocality;
    fs.writeFileSync(path.join(ROOT, 'config.json'), `${JSON.stringify(cfg, null, 2)}\n`);
    reevaluate(); // a running check re-applies the setting when it finishes
    return json(res, 200, cfg.search);
  }

  const m = url.pathname.match(/^\/api\/user\/(.+)$/);
  if (m && req.method === 'POST') {
    const id = decodeURIComponent(m[1]);
    const patch = await readBody(req);
    const state = loadState();
    state.user ||= {};
    state.user[id] = { ...state.user[id], ...patch };
    saveState(state);
    return json(res, 200, state.user[id]);
  }

  const file = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) {
    res.writeHead(404);
    return res.end('Not found');
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});

const { port } = loadConfig().server;
server.listen(port, '127.0.0.1', () => console.log(`Reality bot běží na http://localhost:${port}`));
