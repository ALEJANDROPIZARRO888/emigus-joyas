'use strict';
// Textos sueltos del sitio (banner superior, título y bajada del hero, etc.)
// editables desde el modo "Editar catálogo", guardados por clave en la
// pestaña "Textos del sitio" del Google Sheet. Mismo patrón que las
// ediciones de catálogo: sin esto, cada texto editable nuevo necesitaría su
// propia tabla — acá cualquier texto nuevo solo necesita una clave.

const { appendRow, updateCells, readRange, sanitizeCell } = require('./google-sheets');

const TAB = 'Textos del sitio';
const CACHE_MS = 20000;

let cache = null; // { data, ts }

async function getSiteContent({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.ts < CACHE_MS) return cache.data;
  const rows = await readRange(TAB, 'A2:C2000');
  const content = {};
  for (const row of rows) {
    const key = (row[0] || '').trim();
    const text = row[1];
    if (key && text !== undefined && String(text).trim() !== '') content[key] = text;
  }
  cache = { data: content, ts: Date.now() };
  return content;
}

async function findRow(key) {
  const rows = await readRange(TAB, 'A2:A2000');
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i][0] || '').trim() === key) return i + 2;
  }
  return null;
}

// value vacío borra la clave (vuelve a mostrarse el texto original del sitio).
async function setSiteText(key, value) {
  let row = await findRow(key);
  if (!row) row = await appendRow(TAB, [key, '', ''], 'A');
  await updateCells(TAB, [
    { range: `B${row}`, value: sanitizeCell(value) },
    { range: `C${row}`, value: new Date().toLocaleString('es-CL') },
  ]);
  cache = null;
}

module.exports = { getSiteContent, setSiteText };
