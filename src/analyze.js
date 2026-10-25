import { localityScore, fold } from './localities.js';

const num = (s) => Number(String(s).replace(/[\s. ]/g, '').replace(/,-$/, ''));

/** Monthly costs on top of rent, read from structured fields or free text. */
// Tenant signs own electricity/gas contract, so the stated fees exclude energy.
const ENERGY_SEPARATE = /(elektr\w*|plyn\w*|energi\w*)[^.]{0,60}(prevad\w*|preveden\w*|na najemce|samostatn\w*|vlastni smlouv\w*|hradi najemce|zvlast|dle spotreby|prepis\w*)|(prevod|prepis)\w*[^.]{0,20}(elektr|plyn|energi)|(samostatn\w*|vlastni|primo)[^.]{0,30}(smlouv|dodavatel)\w*[^.]{0,40}(elektr|plyn|energi)|bez\s+energi/;

export function computeFees(l, estimate, energyEstimate = 1500) {
  const base = baseFees(l, estimate);
  if (base.feesSource !== 'odhad' && base.feesSource !== 'v ceně' && ENERGY_SEPARATE.test(fold(`${l.feesText || ''}\n${l.description || ''}`))) {
    return { fees: base.fees + energyEstimate, feesSource: `${base.feesSource} + odhad energií` };
  }
  return base;
}

function baseFees(l, estimate) {
  if (l.feesKnown && l.fees != null) return { fees: l.fees, feesSource: 'uvedeno' };
  const text = `${l.feesText || ''}\n${l.description || ''}`;
  const t = fold(text);
  if (/(vcetne|vc\.?)\s*(vsech\s*)?(poplatk|energi|sluzeb|zaloh)|cena\s*(je\s*)?(konecna|vcetne|se vsim)|\bse vsim\b|all inclusive/.test(t)) {
    return { fees: 0, feesSource: 'v ceně' };
  }
  const amounts = [];
  const re = /(?:\+\s*|poplatk\w*|zalohy?\w*|sluzby|energie|inkaso)[^\d\n]{0,30}?(\d{1,2}[ .]?\d{3})\s*(?:kc|,-|czk)/g;
  for (const m of t.matchAll(re)) {
    const v = num(m[1]);
    if (v >= 300 && v <= 15000) amounts.push(v);
  }
  if (amounts.length) {
    const fees = [...new Set(amounts)].slice(0, 3).reduce((a, b) => a + b, 0);
    return { fees, feesSource: 'z popisu' };
  }
  return { fees: estimate, feesSource: 'odhad' };
}

/** Text hints that an agency is behind a listing posted as private. */
// Owners often write "RK nevolat" or "neplatíte provizi"; such sentences are a sign of a private listing.
const PRIVATE_SENTENCE = /\bbez\b|neplat|zadn|nevol|nekontakt|nepis|neobtez|nemam zajem|nezajem|ne\s*dekuji|nejsem|primy|primo|priamy|majitel|vlastnik|\bne\b|neprej/;
const AGENCY_WORD = /proviz|realitni kancelar|realitk|\brk\b|makler|zprostredk|exkluzivn/;
const MONEY = /[1-9]\d{0,2}[ .]?\d{3}\s*(kc|,-|czk)|\d+\s*%|jednoho najm|mesicni(ho)? najm/;

/** Text hints that an agency is behind a listing posted as private. */
export function agencyHint(l) {
  const sentences = fold(`${l.title}\n${l.description}`).split(/[.!?\n•;]+/);
  for (const s of sentences) {
    if (!AGENCY_WORD.test(s) || PRIVATE_SENTENCE.test(s) || /provize[^0-9]{0,30}:?\s*0\s*(kc|,-)?\b/.test(s)) continue;
    if (/provi/.test(s) && (MONEY.test(s) || /provize\s*:?\s*ano/.test(s))) return 'v popisu je uvedená provize';
    if (/makler|realitni kancelar|\brk\b/.test(s) && /kontakt|sdeli|prohlid|zastupuj|nabizi|spolupra/.test(s)) {
      return 'inzerát podle popisu zastupuje makléř';
    }
  }
  return null;
}

/** Tells whether the text says the flat is already gone. */
export function goneHint(l) {
  const t = fold(`${l.title}\n${(l.description || '').slice(0, 400)}`);
  if (/\b(pronajato|uz pronajat|jiz pronajat|rezervovano|rezervace)\b/.test(t)) return 'v textu stojí, že je byt pronajatý/rezervovaný';
  return null;
}

export function ceilingInfo(l) {
  const t = fold(l.description || '');
  let height = null;
  const re = /strop\w*[^.\d]{0,40}?(\d[,.]\d{1,2})\s*m|(\d[,.]\d{1,2})\s*m\w*[^.\d]{0,25}?(?:vysk\w* )?strop/g;
  for (const m of t.matchAll(re)) {
    const v = Number((m[1] || m[2]).replace(',', '.'));
    if (v >= 2.4 && v <= 5) height = Math.max(height || 0, v);
  }
  const high = height ? height >= 2.95 : /vysok\w* strop|vysk\w* strop\w* (pres|nad) 3/.test(t);
  return { ceilingHeight: height, highCeilings: Boolean(high) };
}

const HISTORIC = /^(vinohrady|vrsovice|zizkov|karlin|smichov|holesovice|nusle|letna|dejvice|bubenec|nove mesto|stare mesto|mala strana|hradcany|josefov|vysehrad)/;

export function oldBuildingInfo(l) {
  const t = fold(`${l.description || ''} ${l.condition || ''}`);
  const bt = fold(l.buildingType || '');
  const reasons = [];
  let score = 0;
  if (/panel|montova/.test(bt) || /panelov\w* dom|panelak/.test(t)) return { old: false, score: -15, reasons: ['panelový dům'] };
  if (/novostavb/.test(t) || /novostavb/.test(fold(l.condition || ''))) score -= 10, reasons.push('novostavba');
  if (/cihl|kamen/.test(bt)) score += 5, reasons.push('cihlový dům');
  const m = t.match(/(?:postaven\w*|z roku|rok\w* vystavby|z let)\D{0,12}(1[89]\d\d)/);
  const year = l.yearBuilt || (m ? Number(m[1]) : null);
  if (year && year < 1950) score += 10, reasons.push(`dům z roku ${year}`);
  if (/\b(z|ze)\s+(20|30|40)\.\s*let|(z|ze)\s+(dvacat|tricat|ctyricat)\w* let|prvni republik|pred(valecn|\s+valkou)/.test(t)) {
    score += 10, reasons.push('předválečný dům');
  }
  if (/cinzov|cinzak|prvorepublik|secesn|historick|funkcionalis|grunderzeit|meziválečn|mezivalecn|klasicistn|empirov/.test(t)) {
    score += 10, reasons.push('činžovní / historický dům');
  }
  if (/stuk|kastlov|spaletov|puvodni parket|puvodni dvere|terazz|teraco/.test(t)) score += 4, reasons.push('dobové prvky');
  if (l.buildingAge === 'více než 50 let') score += 6, reasons.push('dům starší 50 let');
  if (/klenut/.test(t)) score += 4, reasons.push('klenuté stropy');
  // Brick houses in these quarters are almost always pre-war tenement buildings.
  if (/cihl|kamen/.test(bt) && score < 10 && !/novostavb|nov\w* (dum|bytov\w* dum|projekt)|rezidenc|rodinn\w* dom/.test(t) && HISTORIC.test(fold(l.quarter))) {
    score += 6, reasons.push('cihlový dům v historické čtvrti');
  }
  return { old: score >= 10, score, reasons: [...new Set(reasons)] };
}

/** Rates the kitchen (counter length, area, shape) from the description. */
export function kitchenInfo(l) {
  const t = fold((l.description || '').replace(/²/g, '2'));
  const details = [];
  let score = 0;
  let signal = false;

  let lengthCm = null;
  const cm = t.match(/link\w*[^.]{0,40}?(\d{3})\s*cm/);
  const m = t.match(/link\w*[^.\d]{0,30}?(\d(?:[,.]\d{1,2})?)\s*m\b(?!2)/);
  if (cm && +cm[1] >= 100 && +cm[1] <= 600) lengthCm = +cm[1];
  else if (m) {
    const v = Number(m[1].replace(',', '.'));
    if (v >= 1.2 && v <= 6) lengthCm = Math.round(v * 100);
  }
  if (lengthCm) {
    signal = true;
    score += lengthCm >= 300 ? 8 : lengthCm >= 240 ? 5 : lengthCm >= 180 ? 1 : -3;
    details.push(`linka ${lengthCm} cm`);
  }

  const area = t.match(/kuchyn\w*[^.\d]{0,20}?(\d{1,2}(?:[,.]\d)?)\s*m2/);
  const areaM2 = area ? Number(area[1].replace(',', '.')) : null;
  if (areaM2 && areaM2 >= 3 && areaM2 <= 40) {
    signal = true;
    score += areaM2 >= 12 ? 7 : areaM2 >= 9 ? 5 : areaM2 >= 6 ? 2 : -2;
    details.push(`kuchyň ${String(areaM2).replace('.', ',')} m²`);
  }

  if (/rohov\w* (kuchynsk\w* )?link|link\w* (do|ve tvaru) [lu]\b|tvaru [lu]\b|\b[lu][ -]linka|kuchynsk\w* ostrov|ostruvek|barov\w* pult/.test(t)) {
    signal = true, score += 4, details.push('rohová linka / ostrůvek');
  }
  const big = /(velk|prostorn|obytn)\w* kuchyn|kuchyn\w* s jideln|samostatn\w* kuchyn|oddelen\w* kuchyn/.test(t);
  if (big || /\+1$/.test(l.disposition || '')) {
    signal = true;
    if (!areaM2) score += 4;
    details.push(big ? 'velká / samostatná kuchyň' : 'samostatná kuchyň (2+1)');
  }
  if (/kuchynk|mal\w* kuchyn|kuchyn\w*[^.]{0,30}\bv predsini|(2|dvou)[ -]?plotynk|minikuchyn/.test(t)) {
    signal = true, score -= 4, details.push('malá kuchyňka');
  } else if (/kuchynsk\w* kout/.test(t) && !details.length) {
    signal = true, score -= 1, details.push('kuchyňský kout');
  }
  if (/\bmyck/.test(t)) score += 1, details.push('myčka');

  score = Math.max(-5, Math.min(12, score));
  const label = !signal ? 'neuvedeno' : score >= 8 ? 'velká' : score >= 4 ? 'dobrá' : score <= -2 ? 'malá' : 'průměrná';
  return { kitchenScore: score, kitchen: label, kitchenDetails: [...new Set(details)] };
}

const DATE_IN_TEXT = /(?:k nastehovani|nastehovani|volny|volne|dostupn\w*|pronajem|k dispozici)\D{0,15}?od\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(20\d\d)?/;

/** When the flat can be moved into, preferring a future date from the text. */
export function availableDate(l) {
  const now = Date.now();
  const structured = l.availableFrom ? Date.parse(l.availableFrom) : null;
  if (structured && structured > now) return structured;
  const t = fold(l.description || '');
  const m = t.match(DATE_IN_TEXT);
  if (m) {
    const today = new Date();
    let year = m[3] ? Number(m[3]) : today.getFullYear();
    let d = Date.UTC(year, Number(m[2]) - 1, Number(m[1]));
    if (!m[3] && d < now - 30 * 864e5) d = Date.UTC(year + 1, Number(m[2]) - 1, Number(m[1]));
    if (!Number.isNaN(d)) return d;
  }
  if (structured) return structured;
  if (/\b(ihned|okamzit\w*)\b/.test(t)) return now;
  return null;
}

const fmtDate = (ms) => new Date(ms).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });

/** Fit of the move-in date with the wished one (e.g. 1. 1. 2027). */
export function moveInFit(l, wished) {
  const when = availableDate(l);
  if (!wished || !when) return { moveIn: when ? new Date(when).toISOString().slice(0, 10) : null, moveInScore: 0, moveInNote: null };
  const target = Date.parse(wished);
  const diff = (when - target) / 864e5; // negative = available earlier
  let score;
  let note;
  if (diff > 0) {
    score = diff <= 14 ? 3 : -Math.min(12, Math.round(diff / 7));
    note = `volný až od ${fmtDate(when)}`;
  } else if (diff >= -35) {
    score = 10;
    note = `nastěhování sedí (od ${fmtDate(when)})`;
  } else if (diff >= -65) {
    score = 3;
    note = `volný od ${fmtDate(when)} – asi měsíc před tvým termínem`;
  } else {
    score = -4;
    const from = when <= Date.now() ? 'volný hned' : `volný už od ${fmtDate(when)}`;
    note = `${from} – majitel nejspíš nebude čekat do ${fmtDate(target)}`;
  }
  return { moveIn: new Date(when).toISOString().slice(0, 10), moveInScore: score, moveInNote: note };
}

const NEUTRAL_LOCALITY_POINTS = 21;

/** Adds all derived fields and a 0–100 match score with human-readable reasons. */
export function analyze(l, cfg) {
  if (!l.area) l = { ...l, area: Number((l.title || '').match(/(\d{2,3})\s*m(2|²)/)?.[1]) || null };
  // Keep the fees as stated by the source, so re-scoring never adds estimates twice.
  const feesStated = l.feesStated !== undefined ? l.feesStated : l.fees ?? null;
  const { fees, feesSource } = computeFees({ ...l, fees: feesStated }, cfg.estimatedFeesWhenUnknown, cfg.energyEstimate);
  const total = (l.rent || 0) + fees;
  const loc = localityScore(l.quarter, l.district);
  const ceiling = ceilingInfo(l);
  const old = oldBuildingInfo(l);
  const pros = [];
  const warnings = [];

  let s = 0;
  // Up to 30; when locality is ignored every place counts as average.
  s += cfg.ignoreLocality ? NEUTRAL_LOCALITY_POINTS : loc.score * 3;
  if (loc.score >= 9) pros.push(`top lokalita ${loc.name}`);

  if (ceiling.ceilingHeight) {
    s += ceiling.ceilingHeight >= 3.2 ? 25 : ceiling.ceilingHeight >= 2.95 ? 20 : 4;
    pros.push(`strop ${String(ceiling.ceilingHeight).replace('.', ',')} m`);
  } else if (ceiling.highCeilings) {
    s += 18, pros.push('vysoké stropy');
  }
  s += Math.max(-15, Math.min(20, old.score));
  if (old.old) pros.push(...old.reasons.filter((r) => r !== 'cihlový dům'));
  if (old.old && !ceiling.ceilingHeight && !ceiling.highCeilings) s += 6; // old buildings usually have high ceilings

  if (l.garage) s += 8, pros.push('garáž');
  else if (l.parking) s += 6, pros.push('parkování');

  // Bigger is better: ~0 at 35 m², full 18 points from ~80 m².
  s += Math.max(0, Math.min(18, ((l.area || 0) - 35) / 2.5));
  if (l.rooms >= 3) s += 4;
  if (l.area >= 60) pros.push(`prostorný (${l.area} m²)`);

  const kitchen = kitchenInfo(l);
  s += kitchen.kitchenScore;
  if (kitchen.kitchen === 'velká' || kitchen.kitchen === 'dobrá') pros.push(`${kitchen.kitchen} kuchyň`);
  if (kitchen.kitchen === 'malá') warnings.push('malá kuchyňka');

  const move = moveInFit(l, cfg.moveInDate);
  s += move.moveInScore;
  if (move.moveInScore >= 10) pros.push(move.moveInNote);
  else if (move.moveInNote && move.moveInScore < 0) warnings.push(move.moveInNote);

  if (l.balcony) s += 2;
  if (l.lift) s += 1;
  s += Math.max(0, Math.min(5, (cfg.maxTotalPrice - total) / 1000));
  // Over budget (up to stretchMaxTotalPrice) costs 2 points per 1 000 Kč.
  if (total > cfg.maxTotalPrice) {
    s -= ((total - cfg.maxTotalPrice) / 1000) * 2;
    warnings.push(`nad rozpočtem o ${Math.round(total - cfg.maxTotalPrice).toLocaleString('cs-CZ')} Kč`);
  }
  if (feesSource === 'odhad') s -= 3, warnings.push('poplatky nejsou uvedené, počítám odhad – ověř');
  if (feesSource.includes('odhad energií')) warnings.push('energie si platíš zvlášť – v ceně je jejich odhad');
  if (/polosuteren/.test(fold(l.description || ''))) s -= 10, warnings.push('zmínka o polosuterénu');
  if (/kratkodob/.test(fold(l.description || '')) && !/(ne|nikoli)\s+kratkodob/.test(fold(l.description || ''))) {
    s -= 10, warnings.push('může jít o krátkodobý pronájem');
  }

  const days = l.published ? (Date.now() - Date.parse(l.published)) / 864e5 : null;
  if (days != null && days <= 3) s += 3, pros.push('čerstvý inzerát');
  if (days != null && days > 30) warnings.push(`inzerát visí ${Math.round(days)} dní`);
  if (l.commission > 0) warnings.push(`provize ${l.commission} Kč`);
  if (l.rent && l.rent < 10000) warnings.push('podezřele nízký nájem – může jít o pokoj nebo podvod');

  return {
    ...l,
    feesStated,
    fees,
    feesSource,
    total,
    localityScore: loc.score,
    locality: loc.name,
    ...ceiling,
    oldBuilding: old.old,
    oldBuildingReasons: old.reasons,
    ...kitchen,
    ...move,
    score: Math.round(Math.max(0, Math.min(100, s))),
    pros,
    warnings,
    ageDays: days != null ? Math.round(days) : null,
  };
}

const kc = (n) => `${Math.round(n).toLocaleString('cs-CZ')} Kč`;

/** Hard requirements; returns the reason a listing is excluded, or null. */
export function rejectReason(l, cfg) {
  if (l.agency) return l.agency;
  if (l.company && !cfg.allowCompanyLandlords) return l.company;
  const hint = agencyHint(l);
  if (hint) return hint;
  if (l.rooms == null || l.rooms < cfg.minRooms) return `dispozice ${l.disposition} je menší než 2+kk`;
  if (l.roommate || /pokoj\b|spolubydl|podnaj\w* pokoj/i.test(fold(l.title || ''))) return 'spolubydlení / pronájem pokoje';
  const text = fold(`${l.title}\n${l.description}`);
  if (/nebytov\w* (prostor|jednotk)|kolaudovan\w* jako (kancelar|atelier)|evidovan\w* jako (kancelar|atelier)/.test(text)) {
    return 'nebytový prostor, ne byt';
  }
  if (/(byt|jednotka)[^.]{0,60}(nachazi|umisten\w*|je)\s+(se\s+)?(ve?\s+)?(\d\.\s*)?(polo)?suterenu|(\d\.|v)\s*suterenu domu/.test(text) && !/sklep\w*[^.]{0,20}suteren/.test(text)) {
    return 'byt v suterénu';
  }
  if (l.area && l.area < 30) return `plocha ${l.area} m² je na ${l.disposition} podezřele malá (spíš pokoj)`;
  const stretch = cfg.stretchMaxTotalPrice || cfg.maxTotalPrice;
  if (l.total > stretch) return `cena se vším ${kc(l.total)} je nad limit ${kc(stretch)}`;
  if (l.total > cfg.maxTotalPrice && l.score < (cfg.stretchMinScore ?? 101)) {
    return `cena se vším ${kc(l.total)} je nad ${kc(cfg.maxTotalPrice)} a skóre ${l.score} nestačí na výjimku (min. ${cfg.stretchMinScore})`;
  }
  if (!cfg.ignoreLocality && l.localityScore < cfg.minLocalityScore) return `lokalita ${l.locality} není mezi hezkými`;
  if (l.ageDays != null && l.ageDays > cfg.maxAgeDays) return `inzerát je starý ${l.ageDays} dní`;
  return null;
}
