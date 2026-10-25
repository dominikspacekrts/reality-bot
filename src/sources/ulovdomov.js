import { request } from '../http.js';

const API = 'https://ud.api.ulovdomov.cz/v1/offer/find';
const PRAGUE_BOUNDS = { northEast: { lat: 50.177403, lng: 14.706788 }, southWest: { lat: 49.941978, lng: 14.224435 } };
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

function parseDisposition(d) {
  const m = (d || '').match(/^(one|two|three|four|five|six)Plus(Kk|One)$/);
  if (!m) return { disposition: d === 'atypical' ? 'atypický' : d || 'neuvedeno', rooms: null };
  return { disposition: `${NUM[m[1]]}+${m[2] === 'Kk' ? 'kk' : '1'}`, rooms: NUM[m[1]] };
}

const param = (p) => {
  if (!p) return '';
  if (Array.isArray(p.options)) return p.options.map((o) => o.title).join(', ');
  return p.value ?? '';
};

export async function list({ maxTotal }) {
  const out = [];
  for (let page = 1; ; page++) {
    const res = await request(`${API}?page=${page}&perPage=100&sorting=latest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://www.ulovdomov.cz' },
      body: JSON.stringify({ offerType: 'rent', propertyType: 'flat', bounds: PRAGUE_BOUNDS }),
    });
    const json = await res.json();
    const offers = json.data?.offers || [];
    for (const o of offers) {
      if (o.village?.title !== 'Praha') continue;
      // Listings that charge a commission come from agencies.
      if (!o.isNoCommission) continue;
      if ((o.rentalPrice?.value || 0) > maxTotal) continue;
      out.push({
        id: `ulovdomov:${o.id}`,
        source: 'ulovdomov',
        sourceId: String(o.id),
        url: o.absoluteUrl,
        title: o.title,
        ...parseDisposition(o.disposition),
        rent: o.rentalPrice?.value,
        quarter: o.villagePart?.title || '',
      });
    }
    if (page >= (json.extraData?.totalPages || 1) || !offers.length) break;
  }
  return out;
}

export async function detail(item) {
  const res = await request(item.url);
  if (res.status === 404 || res.status === 410) return { active: false, inactiveReason: `inzerát už neexistuje (HTTP ${res.status})` };
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  const o = m && JSON.parse(m[1]).props?.pageProps?.offer?.data;
  if (!o) return { active: false, inactiveReason: 'inzerát se nepodařilo načíst' };
  if (o.status !== 'ACTIVE') return { active: false, inactiveReason: `stav inzerátu: ${o.status}` };
  const p = o.parameters || {};
  const has = (k) => /ano|yes|true/i.test(String(param(p[k]))) || Number(param(p[k])) > 0;
  return {
    active: true,
    agency: o.owner?.type ? `inzerát vložila firma ${o.owner.type}` : null,
    title: o.title,
    disposition: item.disposition,
    rooms: item.rooms,
    area: Number(param(p.usableArea)) || Number(param(p.floorArea)) || null,
    rent: o.rentalPrice?.value,
    fees: o.monthlyFeePrice?.value ?? null,
    feesKnown: o.monthlyFeePrice?.value != null,
    feesText: o.priceNote || '',
    commission: o.isNoCommission ? 0 : null,
    description: o.description || '',
    street: o.street?.name || '',
    quarter: o.villagePart?.name || item.quarter,
    district: '',
    lat: o.geoCoordinates?.lat ?? null,
    lng: o.geoCoordinates?.lng ?? null,
    floor: Number(param(p.floorNumber)) || null,
    buildingType: param(p.buildingType) || param(p.material),
    condition: param(p.buildingCondition),
    yearBuilt: Number(param(p.acceptanceYear)) || null,
    parking: has('parkingLots'),
    garage: has('garage'),
    lift: has('lift'),
    balcony: has('balcony') || has('loggia') || has('terrace'),
    furnished: param(p.furnished),
    published: o.publishedAt || null,
    availableFrom: param(p.readyDate) || null,
    images: (o.photos || []).slice(0, 6).map((ph) => ph.path),
    url: o.absoluteUrl || item.url,
  };
}
