'use strict';
// Cupones de descuento: cada suscriptora recibe un código único, de un solo
// uso, guardado en la pestaña "Cupones" del Google Sheet. Para agregar
// códigos manuales (promociones, regalos, etc.) basta con escribir una fila
// nueva ahí mismo — Código, Tipo, Descuento (%), Correo (opcional), Creado —
// y dejar "Usado" vacío.

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

// Busca un cupón por código. Devuelve null si no existe.
async function findCoupon(code) {
  const target = String(code || '').trim().toUpperCase();
  if (!target) return null;
  const rows = await readRange(CUPONES_TAB, 'A2:G5000');
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if ((row[0] || '').trim().toUpperCase() === target) {
      return {
        row: i + 2, // fila real en la hoja (A2 es la primera fila de datos)
        code: row[0],
        percent: Number(row[2]) || 0,
        email: row[3] || '',
        used: !!(row[5] && String(row[5]).trim()),
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
