'use strict';
// Guarda el comentario que dejó la clienta al responder el correo de
// "Entregado" (ver reply_to en lib/mail.js). No hay una conexión automática
// entre ese correo y el Sheet: la administradora lo lee en su bandeja y lo
// pega acá desde el panel admin — este endpoint solo requiere la clave,
// igual que el resto de las acciones de administradora.

const { setOrderComment } = require('../lib/orders');

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
  if (!numero) { res.status(400).json({ error: 'Falta el número de pedido.' }); return; }

  try {
    const order = await setOrderComment(numero, String(body.comentario ?? ''));
    if (!order) { res.status(404).json({ error: 'No encontramos ese pedido.' }); return; }
    res.status(200).json({ ok: true, order });
  } catch (err) {
    console.error('set-order-comment error:', err);
    res.status(500).json({ error: 'No se pudo guardar el comentario.' });
  }
};
