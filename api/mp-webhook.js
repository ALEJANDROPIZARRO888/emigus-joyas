'use strict';
// MercadoPago llama esta URL sola cuando cambia el estado de un pago.
// Por seguridad, nunca confiamos en los datos que vienen en la notificación:
// volvemos a consultar el pago directo en la API de MercadoPago con el
// Access Token, y solo si su estado es "approved" agregamos la fila a la
// pestaña "Pedidos" del Google Sheet.

const { MercadoPagoConfig, Payment } = require('mercadopago');
const { readRange } = require('../lib/google-sheets');
const { sendEmail } = require('../lib/mail');
const { findCoupon, markCouponUsed } = require('../lib/coupons');
const { setOverrideField } = require('../lib/catalog-overrides');
const { appendOrder } = require('../lib/orders');

const PEDIDOS_TAB = 'Pedidos';
const NOTIFY_TO = 'emigus.joyas@gmail.com';
const SITE_URL = 'https://emigus.cl';

function formatCL(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const clp = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');

// El nombre/correo/teléfono del pagador vienen de su perfil de MercadoPago,
// no son datos que controlemos — se escapan antes de meterlos en el HTML del
// correo para que nadie pueda inyectar enlaces o marcado falsos ahí.
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Correo a la clienta: gracias por su compra + su número de pedido, para que
// lo use en la página de Seguimiento. Se envía apenas se confirma el pago,
// antes de que la administradora toque el estado — por eso es un correo
// aparte del aviso de cambio de estado (api/update-order-status.js).
function confirmationEmailHtml({ cliente, numero, productos, total }) {
  return `
    <div style="font-family:Georgia,serif;color:#33322F;max-width:520px;margin:0 auto">
      <h2 style="font-weight:400;margin:0 0 4px">¡Gracias por tu compra!</h2>
      <p style="font-size:15px;line-height:1.75;color:#5C5850;margin:16px 0">Hola ${escapeHtml(cliente) || ''}, recibimos tu pago y ya estamos preparando tu pedido. Te iremos informando el seguimiento a medida que avance.</p>
      <div style="margin:24px 0;padding:22px 24px;background:#F8F1E9;border:1px dashed #B98B5C;text-align:center">
        <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#96693C;margin-bottom:8px">Tu número de pedido</div>
        <span style="font-size:22px;letter-spacing:.12em;color:#33322F;font-weight:bold">${escapeHtml(numero)}</span>
      </div>
      <p style="font-size:14px;line-height:1.7;color:#5C5850;margin:0 0 4px"><strong>Productos:</strong> ${escapeHtml(productos) || '(sin detalle)'}</p>
      <p style="font-size:14px;line-height:1.7;color:#5C5850;margin:0 0 20px"><strong>Total pagado:</strong> ${clp(total)}</p>
      <p style="font-size:14px;line-height:1.7;color:#5C5850;margin:0 0 20px">Puedes consultar el estado de tu pedido cuando quieras en <a href="${SITE_URL}/?seguimiento=1" style="color:#96693C">${SITE_URL.replace('https://', '')}</a>, sección "Seguimiento", con tu número de pedido.</p>
      <p style="font-size:13px;line-height:1.7;color:#8A847B;margin:0">¿Dudas? Escríbenos por WhatsApp al +56 9 9397 3241 o responde este correo.</p>
    </div>
  `;
}

function orderEmailHtml({ payment, items, cliente, correo, telefono, direccion, comuna, region, couponCode, numero }) {
  const rows = items.length
    ? items.map(i => `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #EFE7DB">${escapeHtml(i.title)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #EFE7DB;text-align:center">${escapeHtml(i.quantity)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #EFE7DB;text-align:right">${clp(i.unit_price)}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" style="padding:8px 12px">${escapeHtml(payment.description) || '(sin detalle de productos)'}</td></tr>`;

  return `
    <div style="font-family:Georgia,serif;color:#33322F;max-width:560px;margin:0 auto">
      <h2 style="font-weight:400;margin:0 0 4px">Nueva venta confirmada</h2>
      <p style="color:#8A847B;margin:0 0 20px">${formatCL(new Date())}</p>
      <p style="margin:0 0 4px"><strong>Cliente:</strong> ${escapeHtml(cliente) || '(sin nombre)'}</p>
      <p style="margin:0 0 4px"><strong>Correo:</strong> ${escapeHtml(correo) || '(no informado)'}</p>
      ${telefono ? `<p style="margin:0 0 4px"><strong>WhatsApp / Teléfono:</strong> ${escapeHtml(telefono)}</p>` : ''}
      ${direccion ? `<p style="margin:0 0 4px"><strong>Dirección de envío:</strong> ${escapeHtml(direccion)}${comuna ? ', ' + escapeHtml(comuna) : ''}${region ? ' — ' + escapeHtml(region) : ''}</p>` : ''}
      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-family:Arial,sans-serif;font-size:14px">
        <thead>
          <tr style="background:#F8F1E9;text-align:left">
            <th style="padding:8px 12px">Producto</th>
            <th style="padding:8px 12px;text-align:center">Cant.</th>
            <th style="padding:8px 12px;text-align:right">Precio unit.</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size:18px;margin:0 0 20px"><strong>Total pagado: ${clp(payment.transaction_amount)}</strong></p>
      ${couponCode ? `<p style="margin:0 0 20px"><strong>Cupón usado:</strong> ${escapeHtml(couponCode)}</p>` : ''}
      <p style="color:#8A847B;font-size:12.5px;margin:0"><strong>N° de pedido:</strong> ${escapeHtml(numero) || '(sin número)'}<br>
      <strong>Referencia:</strong> ${escapeHtml(payment.external_reference) || '(sin referencia)'}<br>
      <strong>ID de pago MercadoPago:</strong> ${escapeHtml(payment.id)}</p>
    </div>
  `;
}

// A veces MercadoPago dispara la notificación del webhook una fracción de
// segundo antes de que el pago quede disponible en su propia API de lectura
// (varios reintentos en ráfaga, todos dentro del mismo segundo — se veía en
// los logs como "MPNotFoundError: Payment not found" con 500, seguido poco
// después por un 200 para la misma venta). Reintentamos unas pocas veces acá
// mismo en vez de depender solo de que MercadoPago reintente por su cuenta
// más tarde, que además tarda más y deja al pedido sin registrar mientras tanto.
async function getPaymentWithRetry(paymentClient, id, attempts = 4, delayMs = 1200) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await paymentClient.get({ id });
    } catch (err) {
      lastErr = err;
      const notFound = err && (err.status === 404 || err.statusCode === 404);
      if (!notFound || i === attempts - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

module.exports = async (req, res) => {
  const paymentId =
    (req.query && (req.query['data.id'] || req.query.id)) ||
    (req.body && req.body.data && req.body.data.id);
  const type = (req.query && req.query.type) || (req.body && req.body.type);

  // No es una notificación de pago: no hay nada que hacer, respondemos OK igual.
  if (!paymentId || (type && type !== 'payment')) {
    res.status(200).json({ received: true });
    return;
  }

  try {
    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const paymentClient = new Payment(client);
    const payment = await getPaymentWithRetry(paymentClient, paymentId);

    if (payment.status !== 'approved') {
      // Pago rechazado, pendiente, etc.: por decisión del negocio, no se registra.
      res.status(200).json({ received: true });
      return;
    }

    // MercadoPago puede notificar el mismo pago más de una vez (reintentos,
    // notificación de "topic" además de la de "payment"). Sin este chequeo,
    // cada reenvío agregaba una fila duplicada del mismo pedido.
    const existingIds = await readRange(PEDIDOS_TAB, 'G2:G5000');
    const alreadyRecorded = existingIds.some(row => String(row[0] || '') === String(payment.id));
    if (alreadyRecorded) {
      res.status(200).json({ received: true, duplicate: true });
      return;
    }

    const items = (payment.additional_info && payment.additional_info.items) || [];
    const productos = items.length
      ? items.map(i => `${i.title} x${i.quantity}`).join(', ')
      : (payment.description || '');
    const payer = payment.payer || {};
    const meta = payment.metadata || {};
    // Los datos de envío/contacto que la clienta escribió en el carrito viajan
    // en el metadata de la preferencia — son más completos y confiables que
    // el perfil de MercadoPago del pagador, que se usa solo como respaldo.
    const cliente = meta.nombre || [payer.first_name, payer.last_name].filter(Boolean).join(' ') || payer.email || '';
    const correo = meta.correo || payer.email || '';
    const telefono = meta.telefono || (payer.phone && payer.phone.number) || '';
    const direccion = meta.direccion || '';
    const comuna = meta.comuna || '';
    const region = meta.region || '';
    const couponCode = meta.coupon_code ? String(meta.coupon_code).trim() : '';

    const { numero } = await appendOrder({
      fecha: formatCL(new Date()),
      referencia: payment.external_reference || '',
      cliente, correo, productos,
      total: payment.transaction_amount || 0,
      pagoId: String(payment.id),
      cupon: couponCode,
      telefono, direccion, comuna, region,
    });

    // Las piezas son únicas (stock 1 por convención) — un pago aprobado agota
    // la pieza. Sin esto, la misma joya seguía apareciendo disponible y se
    // podía vender dos veces. Se marca en 0 (no se resta la cantidad) porque
    // "más de una unidad" de una pieza única no tiene sentido en este catálogo.
    for (const item of items) {
      const pid = Number(item.id);
      if (!pid) continue;
      try {
        await setOverrideField(pid, 'stock', 0);
      } catch (stockErr) {
        console.error('mp-webhook: no se pudo actualizar el stock del producto', pid, stockErr);
      }
    }

    // El cupón recién se marca "usado" acá, con el pago ya confirmado — nunca
    // al crear la preferencia, porque esa compra podría quedar abandonada.
    if (couponCode) {
      try {
        const coupon = await findCoupon(couponCode);
        if (coupon && !coupon.used) {
          await markCouponUsed(coupon.row, payment.external_reference || String(payment.id));
        }
      } catch (couponErr) {
        console.error('mp-webhook: no se pudo marcar el cupón como usado', couponErr);
      }
    }

    // El aviso por correo es una comodidad, no la fuente de verdad: si Resend
    // falla, no queremos que MercadoPago reintente la notificación entera
    // (el pedido ya quedó guardado en la planilla arriba).
    try {
      await sendEmail({
        to: NOTIFY_TO,
        subject: `Nueva venta — ${cliente || correo || 'cliente'} — ${clp(payment.transaction_amount)}`,
        html: orderEmailHtml({ payment, items, cliente, correo, telefono, direccion, comuna, region, couponCode, numero }),
      });
    } catch (mailErr) {
      console.error('mp-webhook: no se pudo enviar el correo de aviso', mailErr);
    }

    // Correo a la clienta con su número de pedido. Comodidad, no fuente de
    // verdad: si falla, el pedido y el N° de pedido ya quedaron guardados
    // arriba, y la clienta igual puede escribirnos por WhatsApp.
    if (correo) {
      try {
        await sendEmail({
          to: correo,
          subject: `Gracias por tu compra — pedido ${numero}`,
          html: confirmationEmailHtml({ cliente, numero, productos, total: payment.transaction_amount }),
          replyTo: NOTIFY_TO,
        });
      } catch (mailErr) {
        console.error('mp-webhook: no se pudo enviar el correo de confirmación a la clienta', mailErr);
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('mp-webhook error:', err);
    // Error nuestro (ej. Sheets caído): devolvemos 500 para que MercadoPago reintente
    // la notificación más tarde, en vez de perder el pedido silenciosamente.
    res.status(500).json({ error: 'No se pudo procesar la notificación.' });
  }
};
