import { request } from '../http.js';

const API = 'https://api.bezrealitky.cz/graphql/';
const HEADERS = {
  'content-type': 'application/json',
  origin: 'https://www.bezrealitky.cz',
  referer: 'https://www.bezrealitky.cz/',
};
const EUR_CZK = 25;
const PRAGUE_OSM = 'R435514';

// Import types that mean an agency or a property manager placed the listing.
const AGENCY_IMPORTS = /_RK_|OHNEMAKLER/;
const OWNER_IMPORTS = new Set(['UNDEFINED', 'MANUAL_BZR_MAJITEL_PRONAJEM', null, undefined]);

const FIELDS = `id uri title type disposition surface price charges serviceCharges utilityCharges deposit fee currency
  address(locale:CS) street cityDistrict(locale:CS) gps{lat lng} etage totalFloors construction condition age
  parking garage lift balconySurface terraceSurface loggiaSurface equipped description
  serviceChargesNote utilityChargesNote availableFrom datePosted roommate
  active reserved archived isPausedBySystem isPausedByUser broker{id}
  publicImages(limit:6){url(filter:RECORD_MAIN)}`;

async function gql(query, variables) {
  const res = await request(API, { method: 'POST', headers: HEADERS, body: JSON.stringify({ query, variables }) });
  const json = await res.json();
  if (json.errors) throw new Error(`bezrealitky: ${json.errors[0].message}`);
  return json.data;
}

const DISP = {
  DISP_1_KK: '1+kk', DISP_1_1: '1+1', DISP_2_KK: '2+kk', DISP_2_1: '2+1', DISP_3_KK: '3+kk', DISP_3_1: '3+1',
  DISP_4_KK: '4+kk', DISP_4_1: '4+1', DISP_5_KK: '5+kk', DISP_5_1: '5+1', DISP_6_KK: '6+kk', DISP_6_1: '6+1',
  DISP_7_KK: '7+kk', DISP_7_1: '7+1', GARSONIERA: 'garsoniéra', OSTATNI: 'atypický', UNDEFINED: 'neuvedeno',
};
const CONSTRUCTION = { BRICK: 'Cihlová', STONE: 'Kamenná', PANEL: 'Panelová', PREFAB: 'Montovaná', SKELET: 'Skeletová', MIXED: 'Smíšená', WOOD: 'Dřevostavba' };
const CONDITION = {
  VERY_GOOD: 'Velmi dobrý', GOOD: 'Dobrý', BAD: 'Špatný', NEW: 'Novostavba', AFTER_RECONSTRUCTION: 'Po rekonstrukci',
  AFTER_PARTIAL_RECONSTRUCTION: 'Po částečné rekonstrukci', BEFORE_RECONSTRUCTION: 'Před rekonstrukcí',
};
const AGE = { BETWEEN_1_10: 'do 10 let', BETWEEN_10_30: '10–30 let', BETWEEN_30_50: '30–50 let', OVER_50: 'více než 50 let' };

function normalize(a) {
  const disposition = DISP[a.disposition] || a.disposition;
  const m = disposition.match(/^(\d)\+/);
  const rate = a.currency === 'EUR' ? EUR_CZK : 1;
  // `charges` already is the sum of service and utility charges.
  const fees = a.charges ?? (a.serviceCharges || 0) + (a.utilityCharges || 0);
  const quarter = (a.address || '').split(' - ').pop()?.trim() || a.cityDistrict || '';
  let agency = null;
  if (a.broker?.id) agency = 'inzerát spravuje makléř';
  else if (AGENCY_IMPORTS.test(a.type || '')) agency = 'inzerát vložila realitní kancelář';
  const company = !agency && !OWNER_IMPORTS.has(a.type) ? `pronajímatel je firma/správce (${a.type})` : null;
  return {
    id: `bezrealitky:${a.id}`,
    source: 'bezrealitky',
    sourceId: String(a.id),
    url: `https://www.bezrealitky.cz/nemovitosti-byty-domy/${a.uri}`,
    title: a.title || `Pronájem bytu ${disposition} ${a.surface} m²`,
    disposition,
    rooms: m ? Number(m[1]) : null,
    area: a.surface,
    rent: Math.round(a.price * rate),
    fees: Math.round(fees * rate),
    feesKnown: true,
    feesText: [a.serviceChargesNote, a.utilityChargesNote].filter(Boolean).join(' · '),
    commission: a.fee || 0,
    description: a.description || '',
    street: a.street || '',
    quarter,
    district: a.cityDistrict || '',
    lat: a.gps?.lat ?? null,
    lng: a.gps?.lng ?? null,
    floor: a.etage ?? null,
    buildingType: CONSTRUCTION[a.construction] || '',
    condition: CONDITION[a.condition] || '',
    buildingAge: AGE[a.age] || '',
    parking: Boolean(a.parking),
    garage: Boolean(a.garage),
    lift: Boolean(a.lift),
    balcony: Boolean(a.balconySurface || a.terraceSurface || a.loggiaSurface),
    furnished: a.equipped === 'VYBAVENY' ? 'Ano' : a.equipped === 'CASTECNE' ? 'Částečně' : a.equipped === 'NEVYBAVENY' ? 'Ne' : '',
    published: a.datePosted ? new Date(a.datePosted * 1000).toISOString() : null,
    roommate: Boolean(a.roommate),
    availableFrom: a.availableFrom ? new Date(typeof a.availableFrom === 'number' ? a.availableFrom * 1000 : a.availableFrom).toISOString().slice(0, 10) : null,
    images: (a.publicImages || []).map((i) => i.url),
    agency,
    company,
    _status: a,
  };
}

function statusOf(a) {
  if (!a) return 'inzerát už neexistuje';
  if (!a.active || a.archived) return 'inzerát je deaktivovaný';
  if (a.reserved) return 'byt je rezervovaný';
  if (a.isPausedBySystem || a.isPausedByUser) return 'inzerát je pozastavený';
  return null;
}

export async function list({ maxTotal }) {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const data = await gql(
      `query($o:Int,$p:Int){listAdverts(offerType:[PRONAJEM],estateType:[BYT],regionOsmIds:["${PRAGUE_OSM}"],priceTo:$p,searchPriceWithCharges:true,includeImports:true,limit:100,offset:$o,order:TIMEORDER_DESC){totalCount list{${FIELDS}}}}`,
      { o: offset, p: maxTotal },
    );
    const { list: items, totalCount } = data.listAdverts;
    out.push(...items.map(normalize));
    if (offset + 100 >= totalCount || !items.length) break;
  }
  return out;
}

/** Re-opens the listing straight from the source to confirm it is still live. */
export async function detail(item) {
  const data = await gql(`query($id:ID!){advert(id:$id){${FIELDS}}}`, { id: item.sourceId });
  const reason = statusOf(data.advert);
  if (reason) return { active: false, inactiveReason: reason };
  const { _status, ...fresh } = normalize(data.advert);
  return { active: true, ...fresh };
}
