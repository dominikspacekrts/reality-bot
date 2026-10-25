// Builds the static web version (GitHub Pages) into site/: the UI plus data.json.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/store.js';
import { buildPayload } from '../src/payload.js';

const out = path.join(ROOT, 'site');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), out, { recursive: true });

const payload = buildPayload({ isStatic: true });
// The UI shows neither descriptions nor more than one photo; leaving them out keeps data.json small.
payload.listings = payload.listings.map(({ description, _status, ...l }) => ({ ...l, images: l.images?.slice(0, 1) }));
fs.writeFileSync(path.join(out, 'data.json'), JSON.stringify(payload));
console.log(`Web sestaven do site/ (${payload.listings.length} inzerátů).`);
