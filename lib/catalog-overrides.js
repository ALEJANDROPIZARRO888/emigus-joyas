'use strict';
// Ediciones del catálogo (nombre/precio/stock/descripción/eliminado) hechas
// desde el modo "Editar catálogo" del sitio. Viven en la pestaña "Catálogo"
// del Google Sheet — no en el navegador de quien edita — para que cualquier
// administradora autorizada las vea y las cambie desde cualquier computador,
// y para que se apliquen al instante para todas las visitantes.
//
// Se cachea en memoria unos segundos para no golpear la API de Sheets en
// cada carga de página (best-effort: cada instancia serverless tiene su
// propia caché, así que no es una garantía dura, solo un alivio de carga).

const { appendRow, updateCells, readRange, sanitizeCell } = require('./google-sheets');

const CATALOGO_TAB = 'Catálogo';
const CACHE_MS = 20000;
const FIELD_COL = { name: 'B', price: 'C', stock: 'D', desc: 'E', del: 'F', img: 'H' };
const TEXT_FIELDS = new Set(['name', 'desc', 'img']);

let cache = null; // { data, ts }

function rowToOverride(row) {
  const o = {};
  if (row[1] !== undefined && String(row[1]).trim() !== '') o.name = row[1];
  if (row[2] !== undefined && String(row[2]).trim() !== '') o.price = Number(row[2]);
  if (row[3] !== undefined && String(row[3]).trim() !== '') o.stock = Number(row[3]);
  if (row[4] !== undefined && String(row[4]).trim() !== '') o.desc = row[4];
  if (String(row[5] || '').trim().toUpperCase() === 'SI') o.del = true;
  if (row[7] !== undefined && String(row[7]).trim() !== '') o.img = row[7];
  return o;
}

async function getOverrides({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.ts < CACHE_MS) return cache.data;
  const rows = await readRange(CATALOGO_TAB, 'A2:H5000');
  const overrides = {};
  for (const row of rows) {
    const id = Number(row[0]);
    if (!id) continue;
    const o = rowToOverride(row);
    if (Object.keys(o).length) overrides[id] = o;
  }
  cache = { data: overrides, ts: Date.now() };
  return overrides;
}

async function findRow(id) {
  const rows = await readRange(CATALOGO_TAB, 'A2:A5000');
  for (let i = 0; i < rows.length; i++) {
    if (Number(rows[i][0]) === Number(id)) return i + 2;
  }
  return null;
}

// Cambia un campo de un producto (o lo borra, si value es '' — vuelve a
// mostrarse el valor original del catálogo base).
async function setOverrideField(id, field, value) {
  const col = FIELD_COL[field];
  if (!col) throw new Error('Campo de catálogo inválido: ' + field);
  let row = await findRow(id);
  if (!row) row = await appendRow(CATALOGO_TAB, [id, '', '', '', '', '', '', ''], 'A');
  const cellValue = field === 'del' ? (value ? 'SI' : '') : TEXT_FIELDS.has(field) ? sanitizeCell(value) : value;
  await updateCells(CATALOGO_TAB, [
    { range: `${col}${row}`, value: cellValue },
    { range: `G${row}`, value: new Date().toLocaleString('es-CL') },
  ]);
  cache = null; // que la próxima lectura traiga el cambio fresco
}

// Borra TODAS las ediciones (botón "Deshacer todo").
async function resetOverrides() {
  const rows = await readRange(CATALOGO_TAB, 'A2:A5000');
  if (rows.length) {
    await updateCells(
      CATALOGO_TAB,
      rows.flatMap((_, i) => ['B', 'C', 'D', 'E', 'F', 'H'].map(col => ({ range: `${col}${i + 2}`, value: '' })))
    );
  }
  cache = null;
}

module.exports = { getOverrides, setOverrideField, resetOverrides };
