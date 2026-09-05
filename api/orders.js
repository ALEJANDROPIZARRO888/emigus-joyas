'use strict';
// Panel interno "Seguimiento de pedidos" (modo admin): devuelve el mismo
// contenido que la pestaña "Pedidos" del Google Sheet. Va por POST (no GET)
// aunque solo lea datos, porque a diferencia del catálogo esta información
// SÍ es sensible (nombre, correo, teléfono, dirección) y necesita la clave
// de administradora.

const { getAllOrders } = require('../lib/orders');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const password = String((req.body && req.body.password) || '');
  const expected = process.env.ADMIN_SECRET || '';
  if (!expected || password !== expected) {
    res.status(401).json({ error: 'Clave incorrecta.' });
    return;
  }

  try {
    const orders = await getAllOrders();
    res.status(200).json({ orders });
  } catch (err) {
    console.error('orders error:', err);
    res.status(500).json({ error: 'No se pudieron cargar los pedidos.' });
  }
};
