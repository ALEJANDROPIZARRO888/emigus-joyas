'use strict';
// Utilidades compartidas para escribir en el Google Sheet (Clientes / Pedidos)
// desde las funciones serverless. Usa una cuenta de servicio (no OAuth de
// usuario) para poder escribir sola, sin que nadie tenga que iniciar sesión.

const { google } = require('googleapis');

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error('Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.');
  }
  // La clave privada suele pegarse en Vercel con \n literales en vez de saltos de línea reales.
  const key = rawKey.replace(/\\n/g, '\n');
  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function sheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('Falta la variable de entorno GOOGLE_SHEET_ID.');
  return id;
}

async function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

// Evita inyección de fórmulas: con valueInputOption USER_ENTERED, un texto
// que llega de un formulario público (nombre, correo, etc.) y empieza con
// =, +, -, @ o un tab se interpreta como fórmula y se EJECUTA cuando alguien
// abre la planilla (ej. nombre "=HYPERLINK(...)"). Anteponer un apóstrofo
// fuerza a Sheets a tratarlo como texto literal, igual que si alguien lo
// escribiera a mano. appendRow nunca se usa para escribir fórmulas reales
// (esas van todas por updateCells con strings armados por nosotros), así que
// este saneo aplica parejo a toda fila sin excepciones.
function sanitizeCell(value) {
  if (typeof value !== 'string') return value;
  if (/^[=+\-@\t\r]/.test(value)) return "'" + value;
  return value;
}

// Agrega una fila al final de la tabla y devuelve el número de fila real
// donde quedó (para poder luego escribir fórmulas ahí con updateCells).
// anchorColumn: una columna que SIEMPRE está vacía en las filas todavía sin
// usar de la planilla (para que el API encuentre bien la primera fila libre,
// aunque otras columnas de esa fila ya tengan fórmulas precargadas).
async function appendRow(tab, values, anchorColumn) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId(),
    range: `${tab}!${anchorColumn}:${anchorColumn}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values.map(sanitizeCell)] },
  });
  const range = res.data.updates && res.data.updates.updatedRange; // ej "Clientes!B52:B52"
  const match = range && range.match(/![A-Z]+(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

// updates: [{ range: 'F52', value: '=...' }, ...]
async function updateCells(tab, updates) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId(),
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: updates.map(u => ({ range: `${tab}!${u.range}`, values: [[u.value]] })),
    },
  });
}

async function readRange(tab, a1Range) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId(),
    range: `${tab}!${a1Range}`,
  });
  return res.data.values || [];
}

// El gid (id numérico interno de la pestaña) hace falta para pintar celdas
// con la API de formato de Sheets, que trabaja por gid y no por nombre de
// pestaña. Se cachea en memoria del proceso — cambia solo si alguien borra
// y recrea la pestaña, algo que no pasa en el uso normal del sitio.
const gidCache = {};
async function getTabGid(tab) {
  if (gidCache[tab] != null) return gidCache[tab];
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: sheetId(),
    fields: 'sheets.properties',
  });
  const found = (meta.data.sheets || []).find(s => s.properties.title === tab);
  if (!found) throw new Error(`No se encontró la pestaña "${tab}" en el Sheet.`);
  gidCache[tab] = found.properties.sheetId;
  return found.properties.sheetId;
}

// Convierte una celda estilo "O5" en índices de fila/columna base-0 que
// pide la API de formato (distinto del A1 que usan values.get/append/update).
function a1ToIndices(a1Cell) {
  const m = /^([A-Z]+)(\d+)$/.exec(String(a1Cell || '').trim());
  if (!m) throw new Error(`Celda inválida: "${a1Cell}".`);
  const [, colLetters, rowStr] = m;
  let col = 0;
  for (let i = 0; i < colLetters.length; i++) {
    col = col * 26 + (colLetters.charCodeAt(i) - 64);
  }
  return { columnIndex: col - 1, rowIndex: Number(rowStr) - 1 };
}

function hexToRgb01(hex) {
  const clean = String(hex || '').replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return { red: r, green: g, blue: b };
}

// Escribe texto en una celda Y le pinta el fondo, en una sola llamada a la
// API (repeatCell con userEnteredValue + userEnteredFormat juntos). Se usa
// para las columnas "Envío" / "Entregado" de la pestaña Pedidos — marcar en
// verde de un vistazo hasta dónde va cada pedido, sin abrir el sitio.
// text: '' + hex null limpia la celda (fondo blanco, sin texto).
async function writeCellWithColor(tab, a1Cell, text, hex) {
  const sheets = await getSheetsClient();
  const gid = await getTabGid(tab);
  const { columnIndex, rowIndex } = a1ToIndices(a1Cell);
  const backgroundColor = hexToRgb01(hex || '#FFFFFF');
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId(),
    requestBody: {
      requests: [{
        repeatCell: {
          range: {
            sheetId: gid,
            startRowIndex: rowIndex, endRowIndex: rowIndex + 1,
            startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1,
          },
          cell: {
            userEnteredValue: { stringValue: String(text || '') },
            userEnteredFormat: { backgroundColor },
          },
          fields: 'userEnteredValue,userEnteredFormat.backgroundColor',
        },
      }],
    },
  });
}

module.exports = { appendRow, updateCells, readRange, sanitizeCell, writeCellWithColor };
