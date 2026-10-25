// Serves site/ under /reality-bot/ to preview the GitHub Pages build locally.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/store.js';

const SITE = path.join(ROOT, 'site');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/reality-bot/')) {
      res.writeHead(302, { location: '/reality-bot/' });
      return res.end();
    }
    const rel = url.pathname.slice('/reality-bot/'.length) || 'index.html';
    const file = path.join(SITE, path.normalize(rel));
    if (!file.startsWith(SITE) || !fs.existsSync(file)) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(4800, '127.0.0.1', () => console.log('Náhled webu: http://localhost:4800/reality-bot/'));
