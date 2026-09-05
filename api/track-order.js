'use strict';
// Página pública "Seguimiento": la clienta escribe su número de pedido y
// consulta el estado. Sin clave, así que solo devuelve lo mínimo — nunca
// dirección, teléfono o correo, aunque alguien adivine un número válido.

const { getOrderByNumber } = require('../lib/orders');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const numero = String((req.body && req.body.numero) || '').trim();
  if (!numero) {
    res.status(400).json({ error: 'Escribe tu número de pedido.' });
    return;
  }

  try {
    const order = await getOrderByNumber(numero);
    if (!order) {
      res.status(404).json({ error: 'No encontramos ese número de pedido.' });
      return;
    }
    res.status(200).json({
      numero: order.numero,
      fecha: order.fecha,
      estado: order.estado,
      productos: order.productos,
      total: order.total,
    });
  } catch (err) {
    console.error('track-order error:', err);
    res.status(500).json({ error: 'No pudimos consultar tu pedido. Intenta de nuevo.' });
  }
};
