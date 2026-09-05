'use strict';
// Solo valida y muestra el descuento en el carrito. No marca nada como
// usado: eso pasa recién cuando MercadoPago confirma el pago (mp-webhook.js).

const { findCoupon } = require('../lib/coupons');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ valid: false, error: 'Método no permitido' });
    return;
  }

  const code = String((req.body && req.body.code) || '').trim();
  if (!code) {
    res.status(400).json({ valid: false, error: 'Escribe un código.' });
    return;
  }

  try {
    const coupon = await findCoupon(code);
    if (!coupon) {
      res.status(200).json({ valid: false, error: 'Ese código no existe.' });
      return;
    }
    if (coupon.used) {
      res.status(200).json({ valid: false, error: 'Ese código ya fue usado.' });
      return;
    }
    res.status(200).json({ valid: true, percent: coupon.percent });
  } catch (err) {
    console.error('validate-coupon error:', err);
    res.status(500).json({ valid: false, error: 'No pudimos validar el código. Intenta de nuevo.' });
  }
};
