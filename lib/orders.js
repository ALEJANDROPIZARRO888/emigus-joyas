'use strict';
// Seguimiento de pedidos: número único por pedido + estado (En preparación /
// En tránsito / Entregado), guardado en las columnas M y N de la pestaña
// "Pedidos" — las mismas filas que ya escribe mp-webhook.js. numero es lo
// único que se le pide al cliente en la página de "Seguimiento" y en el
// correo, para no exponer la referencia interna (UUID) ni el ID de pago.

const { appendRow, updateCells, readRange, writeCellWithColor } = require('./google-sheets');

const TAB = 'Pedidos';
const ESTADOS = ['En preparación', 'En tránsito', 'Entregado'];

// Columnas O y P: respaldo visual en el propio Sheet, para ver de un
// vistazo hasta dónde va cada pedido sin entrar al panel admin. No
// reemplazan la columna N (Estado, la fuente de verdad que lee el sitio) —
// son solo texto + color en paralelo, que se actualizan solas cada vez que
// alguien cambia el estado desde el panel admin.
const VERDE = '#B7E1B0';
const COL_ENVIO = 'O';
const COL_ENTREGADO = 'P';

// Columna Q: comentario que la clienta escribió al responder el correo de
// "Entregado" (ver reply_to en lib/mail.js). No llega solo — la
// administradora lo lee en su correo y lo pega acá desde el panel admin
// (api/set-order-comment.js) para que quede visible junto al pedido.
const COL_COMENTARIO = 'Q';

function rowToOrder(row, rowNum) {
  return {
    fecha: row[0] || '',
    referencia: row[1] || '',
    cliente: row[2] || '',
    correo: row[3] || '',
    productos: row[4] || '',
    total: Number(row[5]) || 0,
    pagoId: row[6] || '',
    cupon: row[7] || '',
    telefono: row[8] || '',
    direccion: row[9] || '',
    comuna: row[10] || '',
    region: row[11] || '',
    numero: row[12] || '',
    estado: row[13] || ESTADOS[0],
    comentario: row[16] || '',
    row: rowNum,
  };
}

// Números correlativos EG-1001, EG-1002... — se leen todos los ya usados
// (no solo el máximo tal cual, por si alguna fila se borró a mano) para no
// repetir uno por error.
async function nextOrderNumber() {
  const rows = await readRange(TAB, 'M2:M5000');
  let max = 1000;
  for (const row of rows) {
    const m = /^EG-(\d+)$/.exec((row[0] || '').trim());
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return 'EG-' + (max + 1);
}

// Se llama desde mp-webhook.js justo después de confirmar el pago. Agrega la
// fila completa (mismas columnas que antes, A-L) más N° Pedido y Estado
// inicial en M y N.
async function appendOrder({ fecha, referencia, cliente, correo, productos, total, pagoId, cupon, telefono, direccion, comuna, region }) {
  const numero = await nextOrderNumber();
  const estado = ESTADOS[0];
  await appendRow(
    TAB,
    [fecha, referencia, cliente, correo, productos, total, pagoId, cupon, telefono, direccion, comuna, region, numero, estado],
    'B'
  );
  return { numero, estado };
}

async function getAllOrders() {
  const rows = await readRange(TAB, 'A2:Q5000');
  return rows
    .filter(r => r[0])
    .map((r, i) => rowToOrder(r, i + 2))
    .reverse(); // más recientes primero
}

async function findOrderRow(numero) {
  const target = String(numero || '').trim().toUpperCase();
  if (!target) return null;
  const rows = await readRange(TAB, 'A2:Q5000');
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i][12] || '').trim().toUpperCase() === target) {
      return rowToOrder(rows[i], i + 2);
    }
  }
  return null;
}

async function getOrderByNumber(numero) {
  return findOrderRow(numero);
}

async function updateOrderStatus(numero, estado) {
  if (!ESTADOS.includes(estado)) throw new Error('Estado inválido.');
  const order = await findOrderRow(numero);
  if (!order) return null;
  await updateCells(TAB, [{ range: `N${order.row}`, value: estado }]);

  // O ("En envío") y P ("Entregado") reflejan el progreso acumulado, no solo
  // el estado puntual: si se salta "En tránsito" y se marca "Entregado"
  // directo, igual queda pintado el paso anterior; si se retrocede a "En
  // preparación", se limpian ambas para no dejar un verde engañoso.
  try {
    if (estado === 'En preparación') {
      await writeCellWithColor(TAB, `${COL_ENVIO}${order.row}`, '', null);
      await writeCellWithColor(TAB, `${COL_ENTREGADO}${order.row}`, '', null);
    } else if (estado === 'En tránsito') {
      await writeCellWithColor(TAB, `${COL_ENVIO}${order.row}`, 'En envío', VERDE);
      await writeCellWithColor(TAB, `${COL_ENTREGADO}${order.row}`, '', null);
    } else if (estado === 'Entregado') {
      await writeCellWithColor(TAB, `${COL_ENVIO}${order.row}`, 'En envío', VERDE);
      await writeCellWithColor(TAB, `${COL_ENTREGADO}${order.row}`, 'Entregado', VERDE);
    }
  } catch (colorErr) {
    // El estado real (columna N) ya quedó guardado arriba — estas dos
    // columnas son solo un respaldo visual, no la fuente de verdad.
    console.error('updateOrderStatus: no se pudieron pintar las columnas de progreso', colorErr);
  }

  return { ...order, estado };
}

// Guarda (o borra, si comentario es '') el comentario de la clienta para un
// pedido. Lo escribe la administradora a mano desde el panel admin, después
// de leerlo en su correo — no hay conexión automática entre el correo
// entrante y esta columna.
async function setOrderComment(numero, comentario) {
  const order = await findOrderRow(numero);
  if (!order) return null;
  await updateCells(TAB, [{ range: `${COL_COMENTARIO}${order.row}`, value: comentario || '' }]);
  return { ...order, comentario: comentario || '' };
}

module.exports = { ESTADOS, nextOrderNumber, appendOrder, getAllOrders, getOrderByNumber, updateOrderStatus, setOrderComment };
