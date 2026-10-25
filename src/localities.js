// How pleasant and safe each Prague quarter is to live in, 0–10.
// Reflects reputation, crime perception, greenery and quality of housing stock.
// Edit freely; unknown quarters fall back to DEFAULT_SCORE.
export const LOCALITY_SCORES = {
  'vinohrady': 10, 'dejvice': 10, 'bubenec': 10, 'stresovice': 10, 'hradcany': 9, 'mala strana': 9,
  'vysehrad': 9, 'veleslavin': 9, 'letna': 10, 'josefov': 8, 'ořechovka': 10,
  'karlin': 8, 'vrsovice': 8, 'brevnov': 8, 'vokovice': 8, 'podoli': 8, 'smichov': 7,
  'holesovice': 7, 'nusle': 7, 'stare mesto': 7, 'strasnice': 7, 'branik': 7, 'troja': 7,
  'liboc': 7, 'hodkovicky': 7, 'sedlec': 7, 'lysolaje': 7, 'suchdol': 7,
  'nove mesto': 6, 'zizkov': 6, 'kosire': 6, 'michle': 6, 'krc': 6, 'zabehlice': 6, 'ruzyne': 6,
  'motol': 6, 'jinonice': 6, 'radlice': 6, 'lhotka': 6, 'kunratice': 6, 'malesice': 5,
  'liben': 5, 'kobylisy': 5, 'vysocany': 5, 'hostivar': 5, 'chodov': 5, 'modrany': 5, 'stodulky': 5,
  'repy': 5, 'zlicin': 5, 'hlubocepy': 5, 'cimice': 5, 'barrandov': 5, 'hrdlorezy': 5, 'uhrineves': 5,
  'haje': 4, 'bohnice': 4, 'prosek': 4, 'letnany': 4, 'kbely': 4, 'hloubetin': 4, 'cakovice': 4,
  'horni pocernice': 5, 'kyje': 4, 'cerny most': 3, 'petrovice': 4, 'horni mecholupy': 4,
};

// Map district numbers to a sensible guess when only "Praha N" is known.
const DISTRICT_FALLBACK = { 'praha 1': 7, 'praha 2': 9, 'praha 3': 6, 'praha 6': 8, 'praha 7': 7 };
export const DEFAULT_SCORE = 4;

export const fold = (s = '') =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

export function localityScore(quarter, district) {
  const q = fold(quarter).replace(/^praha\s*\d*\s*-?\s*/, '');
  for (const [name, score] of Object.entries(LOCALITY_SCORES)) {
    if (q === fold(name) || q.startsWith(`${fold(name)} `)) return { score, name: quarter };
  }
  const d = fold(district);
  if (DISTRICT_FALLBACK[d]) return { score: DISTRICT_FALLBACK[d], name: quarter || district };
  return { score: DEFAULT_SCORE, name: quarter || district || 'Praha' };
}
