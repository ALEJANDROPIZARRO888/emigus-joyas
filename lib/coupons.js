'use strict';
// Cupones de descuento: cada suscriptora recibe un código único, de un solo
// uso, guardado en la pestaña "Cupones" del Google Sheet. Para agregar
// códigos manuales (promociones, regalos, etc.) basta con escribir una fila
// nueva ahí mismo — Código, Tipo, Descuento (%), Correo (opcional), Creado —
// y dejar "Usado" vacío.
//
// Códigos de campaña (Cyber, Navidad, etc.): Tipo "Compartido" hace que el
// código sirva para muchas compras (nunca se marca como usado), y la columna
// H "Vence" (dd/mm/aaaa, inclusive, hora de Chile) lo apaga solo al terminar
// la campaña. "Vence" también funciona en cupones normales.

const crypto = require('crypto');
const { appendRow, updateCells, readRange } = require('./google-sheets');

const CUPONES_TAB = 'Cupones';
// Sin 0/O/1/I/L para que no se confundan al leerlos o escribirlos a mano.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode() {
  const bytes = crypto.randomBytes(6);
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  return 'EMIGUS-' + s;
}

function formatCL(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

// Genera un código nuevo, verificando que no choque con uno ya existente.
async function createCoupon({ email = '', percent = 10, tipo = 'Bienvenida' } = {}) {
  const existing = await readRange(CUPONES_TAB, 'A2:A5000');
  const taken = new Set(existing.map(r => (r[0] || '').trim().toUpperCase()));
  let code = randomCode();
  let tries = 0;
  while (taken.has(code) && tries < 8) { code = randomCode(); tries++; }
  await appendRow(CUPONES_TAB, [code, tipo, percent, email, formatCL(new Date()), '', ''], 'A');
  return code;
}

// Fecha de hoy en Chile como 'aaaa-mm-dd', para comparar con "Vence".
function todayCL() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

// Sheets puede devolver la fecha como 07/10/2026, 07-10-2026 o 2026-10-07
// según cómo se escribió y el formato regional de la planilla.
function parseVence(value) {
  const v = String(value || '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/.exec(v);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

// Busca un cupón por código. Devuelve null si no existe.
async function findCoupon(code) {
  const target = String(code || '').trim().toUpperCase();
  if (!target) return null;
  const rows = await readRange(CUPONES_TAB, 'A2:H5000');
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if ((row[0] || '').trim().toUpperCase() === target) {
      const shared = /^compartido$/i.test((row[1] || '').trim());
      const vence = parseVence(row[7]);
      return {
        row: i + 2, // fila real en la hoja (A2 es la primera fila de datos)
        code: row[0],
        percent: Number(row[2]) || 0,
        email: row[3] || '',
        shared,
        used: !shared && !!(row[5] && String(row[5]).trim()),
        expired: !!vence && todayCL() > vence,
      };
    }
  }
  return null;
}

// Marca un cupón como usado. Se llama solo cuando MercadoPago confirma el
// pago (nunca al crear la preferencia), para no gastar el código en compras
// que la clienta terminó abandonando.
async function markCouponUsed(row, reference) {
  await updateCells(CUPONES_TAB, [
    { range: `F${row}`, value: new Date().toLocaleString('es-CL') },
    { range: `G${row}`, value: reference || '' },
  ]);
}

module.exports = { createCoupon, findCoupon, markCouponUsed };
