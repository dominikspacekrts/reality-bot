import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const STATE = path.join(DATA_DIR, 'state.json');
const LOCK = path.join(DATA_DIR, 'check.lock');
const PROGRESS = path.join(DATA_DIR, 'progress.json');

/** config.json, with secrets taken from the environment (GitHub Actions secrets). */
export function loadConfig() {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  const local = readLocalSecrets();
  const topic = process.env.NTFY_TOPIC || local.NTFY_TOPIC;
  if (topic && cfg.push) cfg.push.topic = topic;
  const to = process.env.EMAIL_TO || local.EMAIL_TO;
  if (to && cfg.email) cfg.email.to = to;
  return cfg;
}

// .env.local (git-ignored) keeps the same secrets for runs on this Mac.
function readLocalSecrets() {
  try {
    return Object.fromEntries(
      fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
        .split('\n')
        .filter((line) => /^\w+=/.test(line))
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]),
    );
  } catch {
    return {};
  }
}

export function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'));
  } catch {
    return { listings: {}, user: {}, runs: [] };
  }
}

export function saveState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${STATE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 1));
  fs.renameSync(tmp, STATE);
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
};

/** True while a check holds the lock; a lock left by a killed process does not count. */
export function isRunning() {
  try {
    const pid = Number(fs.readFileSync(LOCK, 'utf8'));
    const fresh = Date.now() - fs.statSync(LOCK).mtimeMs < 30 * 60 * 1000;
    return fresh && alive(pid);
  } catch {
    return false;
  }
}

/** Prevents a scheduled run and a manual run from overlapping. */
export function acquireLock() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (isRunning()) return false;
  fs.writeFileSync(LOCK, String(process.pid));
  return true;
}

export const releaseLock = () => {
  fs.rmSync(LOCK, { force: true });
  fs.rmSync(PROGRESS, { force: true });
};

export const setProgress = (p) => fs.writeFileSync(PROGRESS, JSON.stringify(p));
export const getProgress = () => {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
  } catch {
    return null;
  }
};
