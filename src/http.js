const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function request(url, { method = 'GET', headers = {}, body, retries = 2 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: { 'user-agent': UA, 'accept-language': 'cs-CZ,cs;q=0.9', ...headers },
        body,
        signal: AbortSignal.timeout(20000),
      });
      // 404/410 means the listing is gone; let the caller decide.
      if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status} ${url}`);
      return res;
    } catch (err) {
      lastErr = err;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw lastErr;
}

export async function getJson(url, opts) {
  const res = await request(url, opts);
  return { status: res.status, data: res.ok ? await res.json() : null };
}

/** Runs fn over items with limited parallelism, politely spaced. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
      await sleep(250);
    }
  });
  await Promise.all(workers);
  return out;
}
