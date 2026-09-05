'use strict';
// Productos agregados desde el modo "Editar catálogo" del sitio (con foto
// subida a Vercel Blob). Viven en la pestaña "Productos nuevos" del Google
// Sheet, separados del catálogo base (catalog/catalog.source.json) para no
// tocar ese archivo — se fusionan con él en tiempo real, tanto en la tienda
// como al calcular el cobro real en create-preference.js.

const fs = require('fs');
const path = require('path');
const { appendRow, readRange, sanitizeCell } = require('./google-sheets');

const TAB = 'Productos nuevos';
const CATALOG_PATH = path.join(__dirname, '..', 'catalog', 'catalog.source.json');
const CATS = new Set(['mujer', 'hombre', 'bebes']);

function formatCL(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function rowToProduct(row) {
  return {
    id: Number(row[0]),
    name: row[1] || '',
    cat: row[2] || '',
    type: row[3] || '',
    price: Number(row[4]) || 0,
    old: 0,
    tag: 'Nuevo',
    // Columna J: no existía antes de pedirle stock al formulario — las filas
    // viejas la traen vacía, así que se asume 1 en vez de 0 (agotado).
    stock: row[9] === undefined || row[9] === '' ? 1 : Number(row[9]),
    // Hoy solo se usa para "Talla N" en anillos, pero queda como texto libre
    // por si más adelante se necesita para otro tipo (ej. largo de collar).
    meta: row[8] || '',
    img: row[6] || '',
    desc: row[5] || '',
  };
}

async function getNewProducts() {
  const rows = await readRange(TAB, 'A2:J5000');
  return rows.filter(r => r[0]).map(rowToProduct);
}

async function nextProductId() {
  let maxId = 0;
  try {
    const base = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    for (const p of base) if (p.id > maxId) maxId = p.id;
  } catch (err) {
    console.error('new-products: no se pudo leer el catálogo base', err);
  }
  const rows = await readRange(TAB, 'A2:A5000');
  for (const row of rows) {
    const id = Number(row[0]);
    if (id > maxId) maxId = id;
  }
  return maxId + 1;
}

// name/desc pasan por sanitizeCell (texto de administradora, pero un
// producto que empiece con "=" o "-" igual rompería la fórmula si no se
// escapa). cat/type/price no lo necesitan: son valores controlados o numéricos.
async function createProduct({ name, cat, type, price, stock, desc, imageUrl, meta }) {
  const cleanCat = CATS.has(cat) ? cat : 'mujer';
  const cleanStock = Number.isInteger(stock) && stock >= 0 ? stock : 1;
  const id = await nextProductId();
  await appendRow(
    TAB,
    [id, sanitizeCell(name), cleanCat, type, Number(price) || 0, sanitizeCell(desc || ''), imageUrl, formatCL(new Date()), sanitizeCell(meta || ''), cleanStock],
    'A'
  );
  return rowToProduct([id, name, cleanCat, type, price, desc, imageUrl, '', meta || '', cleanStock]);
}

module.exports = { getNewProducts, createProduct };
