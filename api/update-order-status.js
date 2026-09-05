'use strict';
// Cambia el estado de un pedido desde el panel admin y avisa a la clienta
// por correo. Requiere la clave de administradora, validada en el servidor
// (nunca solo en el navegador).

const { sendEmail } = require('../lib/mail');
const { ESTADOS, updateOrderStatus } = require('../lib/orders');

const SITE_URL = 'https://emigus.cl';
const NOTIFY_TO = 'emigus.joyas@gmail.com';

const ESTADO_MENSAJE = {
  'En preparación': 'Estamos preparando tu pedido con cariño.',
  'En tránsito': 'Tu pedido ya salió y está en camino.',
  'Entregado': '¡Tu pedido fue entregado! Esperamos que haya llegado en perfectas condiciones y que te encante.',
};

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Cuando el estado llega a "Entregado" el correo cierra el ciclo del pedido:
// además del aviso de estado, un agradecimiento cordial y una invitación a
// dejar un comentario sobre la experiencia y la joya — nunca un link a un
// sistema de reseñas real, porque el sitio no tiene uno; se le pide que
// responda el correo, escriba por WhatsApp o etiquete a la marca en Instagram.
function entregadoExtraHtml() {
  return `
    <div style="height:1px;background:linear-gradient(90deg,transparent,#E7E0D6 8%,#E7E0D6 92%,transparent);margin:28px 0"></div>
    <p style="font-size:14.5px;line-height:1.8;color:#5C5850;margin:0 0 16px">Gracias de corazón por comprar con nosotros — somos un negocio familiar y cada pedido como el tuyo es lo que nos permite seguir haciendo lo que amamos.</p>
    <p style="font-size:14.5px;line-height:1.8;color:#5C5850;margin:0 0 4px">Si tienes un minuto, nos encantaría saber cómo fue tu experiencia: ¿cómo llegó tu pedido? ¿qué te pareció la joya? Cuéntanos respondiendo este correo, escribiéndonos por WhatsApp o etiquetándonos en Instagram — leemos cada comentario.</p>
  `;
}

function statusEmailHtml({ cliente, numero, estado }) {
  const mensaje = ESTADO_MENSAJE[estado] || '';
  const isEntregado = estado === 'Entregado';
  return `
    <div style="font-family:Georgia,serif;color:#33322F;max-width:520px;margin:0 auto">
      <h2 style="font-weight:400;margin:0 0 4px">${isEntregado ? '¡Gracias por tu compra!' : 'Novedades de tu pedido'}</h2>
      <p style="font-size:15px;line-height:1.75;color:#5C5850;margin:16px 0">Hola ${escapeHtml(cliente) || ''}, tu pedido <strong>${escapeHtml(numero)}</strong> cambió de estado:</p>
      <div style="margin:24px 0;padding:22px 24px;background:#F8F1E9;border:1px dashed #B98B5C;text-align:center">
        <span style="font-size:20px;letter-spacing:.04em;color:#33322F;font-weight:bold">${escapeHtml(estado)}</span>
      </div>
      <p style="font-size:14px;line-height:1.7;color:#5C5850;margin:0 0 20px">${escapeHtml(mensaje)}</p>
      <p style="font-size:14px;line-height:1.7;color:#5C5850;margin:0 0 20px">Puedes revisar el detalle cuando quieras en <a href="${SITE_URL}/?seguimiento=1" style="color:#96693C">${SITE_URL.replace('https://', '')}</a>, sección "Seguimiento", con tu número de pedido.</p>
      ${isEntregado ? entregadoExtraHtml() : ''}
      <p style="font-size:13px;line-height:1.7;color:#8A847B;margin:${isEntregado ? '20px' : '0'} 0 0">¿Dudas? Escríbenos por WhatsApp al +56 9 9397 3241 o responde este correo.</p>
    </div>
  `;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const body = req.body || {};
  const password = String(body.password || '');
  const expected = process.env.ADMIN_SECRET || '';
  if (!expected || password !== expected) {
    res.status(401).json({ error: 'Clave incorrecta.' });
    return;
  }

  const numero = String(body.numero || '').trim();
  const estado = String(body.estado || '').trim();
  if (!numero) { res.status(400).json({ error: 'Falta el número de pedido.' }); return; }
  if (!ESTADOS.includes(estado)) { res.status(400).json({ error: 'Estado inválido.' }); return; }

  try {
    const order = await updateOrderStatus(numero, estado);
    if (!order) { res.status(404).json({ error: 'No encontramos ese pedido.' }); return; }

    // El cambio de estado ya quedó guardado arriba — el correo es un aviso,
    // si Resend falla la administradora igual ve el nuevo estado en el panel.
    if (order.correo) {
      try {
        await sendEmail({
          to: order.correo,
          subject: `Tu pedido ${numero} está ${estado.toLowerCase()}`,
          html: statusEmailHtml({ cliente: order.cliente, numero, estado }),
          // Si responde este correo (ej. dejando un comentario cuando se
          // marca "Entregado"), que llegue a la bandeja real del negocio —
          // no a la dirección de envío de Resend.
          replyTo: NOTIFY_TO,
        });
      } catch (mailErr) {
        console.error('update-order-status: no se pudo enviar el correo a la clienta', mailErr);
      }
    }

    res.status(200).json({ ok: true, order });
  } catch (err) {
    console.error('update-order-status error:', err);
    res.status(500).json({ error: 'No se pudo actualizar el pedido.' });
  }
};
