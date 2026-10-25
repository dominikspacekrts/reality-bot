import { getJson } from '../http.js';

const API = 'https://www.sreality.cz/api/v1/estates';

const img = (u) => (u?.startsWith('//') ? `https:${u}` : u);

function parseDisposition(name = '') {
  const m = name.match(/^(\d)\+(kk|1)$/i);
  if (m) return { disposition: name.toLowerCase(), rooms: Number(m[1]) };
  if (/6 a více/i.test(name)) return { disposition: '6+', rooms: 6 };
  if (/atyp/i.test(name)) return { disposition: 'atypický', rooms: null };
  return { disposition: name, rooms: name === 'Pokoj' ? 0 : null };
}

function listingUrl(id, disposition) {
  const d = disposition === 'atypický' ? 'atypicky' : disposition === '6+' ? '6-a-vice' : disposition;
  return `https://www.sreality.cz/detail/pronajem/byt/${encodeURIComponent(d).replace('%2B', '+')}/praha/${id}`;
}

/** All Prague flat rentals up to the given rent, without agency listings. */
export async function list({ maxRent }) {
  const all = [];
  for (let offset = 0; ; offset += 100) {
    const url = `${API}/search?category_main_cb=1&category_type_cb=2&locality_region_id=10&price_to=${maxRent}&limit=100&offset=${offset}`;
    const { data } = await getJson(url);
    if (!data) break;
    all.push(...data.results);
    if (offset + 100 >= data.pagination.total) break;
  }
  return all
    .filter((x) => !x.premise_id)
    .map((x) => {
      const d = parseDisposition(x.category_sub_cb?.name);
      return {
        id: `sreality:${x.hash_id}`,
        source: 'sreality',
        sourceId: String(x.hash_id),
        title: x.advert_name,
        ...d,
        rent: x.price_summary_czk ?? x.price_czk,
        quarter: x.locality?.citypart || x.locality?.ward || '',
        district: x.locality?.district || '',
        url: listingUrl(x.hash_id, d.disposition),
      };
    });
}

/** Opens the listing and returns full data, or { active: false } when gone. */
export async function detail(item) {
  const { status, data } = await getJson(`${API}/${item.sourceId}`);
  if (status === 404 || status === 410 || !data?.result) {
    return { active: false, inactiveReason: `inzerát už neexistuje (HTTP ${status})` };
  }
  const r = data.result;
  if (r.premise || r.premise_id) return { active: true, agency: 'inzerát vložila realitní kancelář' };
  const d = parseDisposition(r.category_sub_cb?.name);
  const loc = r.locality || {};
  return {
    active: true,
    title: r.advert_name,
    ...d,
    area: r.usable_area ?? r.floor_area ?? null,
    rent: r.price_summary_czk ?? r.price_czk,
    feesText: [r.cost_of_living, r.price_note].filter(Boolean).join(' · '),
    commission: r.commission || 0,
    description: r.advert_description || '',
    street: loc.street || '',
    quarter: loc.citypart || loc.ward || item.quarter,
    district: loc.district || item.district,
    lat: loc.gps_lat ?? loc.latitude ?? null,
    lng: loc.gps_lon ?? loc.longitude ?? null,
    floor: r.floor_number ?? null,
    buildingType: r.building_type?.name || '',
    condition: r.building_condition?.name || '',
    yearBuilt: r.object_age || r.acceptance_year || null,
    parking: Boolean(r.parking_lots || r.parking),
    garage: Boolean(r.garage),
    lift: r.elevator?.value === 1,
    balcony: Boolean(r.balcony || r.loggia || r.terrace),
    furnished: r.furnished?.name || '',
    published: r.since || null,
    edited: r.edited || null,
    availableFrom: r.ready_date || null,
    images: (r.advert_images || []).slice(0, 6).map((i) => img(i.url || i.advert_image_sdn_url || i)),
    url: item.url,
  };
}
