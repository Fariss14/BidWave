import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
let directory;
function csv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if (c === '\n' && !quoted) { row.push(field.replace(/\r$/, '')); if (row.some(Boolean)) rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.map((values) => Object.fromEntries(header.map((key, i) => [key, values[i]?.trim() || ''])));
}
const code = (value) => String(value).padStart(10, '0');
const sort = (items) => items.sort((a, b) => a.name.localeCompare(b.name));
function load() {
  const read = (name) => csv(readFileSync(resolve('server/data', `${name}.csv`), 'utf8'));
  const regions = sort(read('regions').map((r) => ({ code: code(r.adm1_psgc), name: r.adm1_en })));
  const regionMap = new Map(regions.map((r) => [r.code, r]));
  const provinces = sort(read('provinces').filter((p) => p.geo_level === 'Prov').map((p) => ({ code: code(p.adm2_psgc), name: p.adm2_en, regionCode: code(p.adm1_psgc) })));
  const provinceMap = new Map(provinces.map((p) => [p.code, p]));
  const cities = sort(read('cities').filter((c) => c.adm3_en && regionMap.has(code(c.adm1_psgc))).map((c) => ({ code: code(c.adm3_psgc), name: c.adm3_en, region: regionMap.get(code(c.adm1_psgc)), province: provinceMap.get(code(c.adm2_psgc)) || null })));
  const cityMap = new Map(cities.map((c) => [c.code, c]));
  const barangays = new Map(); let total = 0;
  for (const b of read('barangays')) {
    if (b.geo_level !== 'Bgy' || !b.adm4_en) continue;
    let parent = code(b.adm3_psgc);
    // Manila's 14 sub-municipalities are grouped under the City of Manila.
    if (!cityMap.has(parent) && parent.startsWith('13806')) parent = '1380600000';
    if (!cityMap.has(parent)) throw new Error(`Unmapped barangay parent: ${parent}`);
    if (!barangays.has(parent)) barangays.set(parent, []);
    barangays.get(parent).push({ code: code(b.adm4_psgc), name: b.adm4_en }); total++;
  }
  for (const items of barangays.values()) sort(items);
  if (regions.length !== 17 || cities.length !== 1642 || total !== 42001) throw new Error('The local geographic snapshot is incomplete.');
  return { regions, provinces, cities, barangays };
}
export function createLocations() {
  directory ||= load();
  return {
    regions: async () => directory.regions,
    provinces: async () => directory.provinces,
    cities: async () => directory.cities,
    barangays: async (cityCode) => directory.barangays.get(cityCode) || [],
  };
}
