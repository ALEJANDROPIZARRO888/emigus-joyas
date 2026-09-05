'use strict';
// Recibe el carrito ({id, qty}[]) desde el sitio, busca el precio REAL de cada
// producto en catalog/catalog.source.json + las ediciones vigentes del modo
// "Editar catálogo" (nunca confía en un precio que mande el navegador) y crea
// una preferencia de pago de MercadoPago (Checkout Pro). Devuelve el link al
// que hay que redirigir a la clienta.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const { findCoupon } = require('../lib/coupons');
const { getOverrides } = require('../lib/catalog-overrides');
const { getNewProducts } = require('../lib/new-products');

const CATALOG_PATH = path.join(__dirname, '..', 'catalog', 'catalog.source.json');
const SITE_URL = 'https://emigus.cl';

function loadCatalog() {
  const raw = fs.readFileSync(CATALOG_PATH, 'utf8');
  return JSON.parse(raw);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const items = (req.body && req.body.items) || [];
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'El carrito está vacío.' });
    return;
  }

  let products;
  let overrides;
  let newProducts;
  try {
    products = loadCatalog();
  } catch (err) {
    console.error('create-preference: no se pudo leer el catálogo', err);
    res.status(500).json({ error: 'No se pudo cargar el catálogo.' });
    return;
  }
  try {
    overrides = await getOverrides();
    newProducts = await getNewProducts();
  } catch (err) {
    console.error('create-preference: no se pudieron cargar las ediciones del catálogo', err);
    res.status(500).json({ error: 'No se pudo cargar el catálogo.' });
    return;
  }
  const byId = new Map([...products, ...newProducts].map(p => [p.id, p]));

  const lineItems = [];
  for (const line of items) {
    const id = Number(line && line.id);
    const qty = Math.max(1, parseInt(line && line.qty, 10) || 1);
    const product = byId.get(id);
    if (!product) continue; // producto inexistente: se ignora, no se confía en el cliente
    const o = overrides[id] || {};
    if (o.del) continue; // la administradora lo eliminó del catálogo
    if (o.stock === 0) continue; // lo marcó agotado
    // La talla que mandó el navegador solo se acepta si de verdad está entre
    // las tallas disponibles de ESE anillo en el catálogo — nunca se confía
    // en un valor arbitrario que venga del cliente.
    let talla = '';
    if (product.type === 'Anillos') {
      const meta = o.meta ?? product.meta ?? '';
      const single = /^Talla\s+(.+)$/i.exec(meta);
      const multi = /^Tallas\s+(.+)$/i.exec(meta);
      const available = single ? [single[1].trim()] : multi ? multi[1].split(',').map(s => s.trim()) : [];
      const requested = String((line && line.talla) || '').trim();
      if (requested && available.includes(requested)) talla = requested;
    }
    const title = (o.name ?? product.name) + (talla ? ` (Talla ${talla})` : '');
    lineItems.push({
      id: String(product.id),
      title,
      quantity: qty,
      unit_price: Number(o.price ?? product.price) || 0,
      currency_id: 'CLP',
      picture_url: /^https?:\/\//.test(product.img) ? product.img : undefined,
    });
  }

  if (lineItems.length === 0) {
    res.status(400).json({ error: 'Ninguno de los productos del carrito existe.' });
    return;
  }

  // Datos de envío/contacto: MercadoPago Checkout Pro no los pide, así que se
  // recogen en el carrito ANTES de crear la preferencia y nunca se confía en
  // el navegador sin validar de nuevo acá. Van en el `metadata` de la
  // preferencia para que el webhook (que solo recibe el ID del pago) pueda
  // recuperarlos al consultar el pago directo en la API de MercadoPago.
  const c = (req.body && req.body.cliente) || {};
  const cliente = {
    nombre: String(c.nombre || '').trim(),
    correo: String(c.correo || '').trim(),
    telefono: String(c.telefono || '').trim(),
    direccion: String(c.direccion || '').trim(),
    comuna: String(c.comuna || '').trim(),
    region: String(c.region || '').trim(),
  };
  if (!cliente.nombre || !cliente.correo || !cliente.telefono || !cliente.direccion || !cliente.comuna || !cliente.region) {
    res.status(400).json({ error: 'Faltan datos de envío o contacto.' });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(cliente.correo)) {
    res.status(400).json({ error: 'El correo no es válido.' });
    return;
  }

  // El cupón se valida de nuevo acá, en el servidor: nunca se confía en un
  // descuento que venga calculado desde el navegador.
  const couponCode = String((req.body && req.body.cupon) || '').trim();
  let appliedCoupon = null;
  if (couponCode) {
    let coupon;
    try {
      coupon = await findCoupon(couponCode);
    } catch (err) {
      console.error('create-preference: error validando cupón', err);
      res.status(500).json({ error: 'No se pudo validar el código de descuento.' });
      return;
    }
    if (!coupon) {
      res.status(400).json({ error: 'Ese código de descuento no existe.' });
      return;
    }
    if (coupon.used) {
      res.status(400).json({ error: 'Ese código de descuento ya fue usado.' });
      return;
    }
    appliedCoupon = coupon;
    const factor = 1 - coupon.percent / 100;
    for (const item of lineItems) {
      item.unit_price = Math.round(item.unit_price * factor);
    }
  }

  const externalReference = crypto.randomUUID();
  const [firstName, ...restName] = cliente.nombre.split(' ');

  try {
    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: lineItems,
        external_reference: externalReference,
        metadata: {
          ...(appliedCoupon ? { coupon_code: appliedCoupon.code } : {}),
          nombre: cliente.nombre,
          correo: cliente.correo,
          telefono: cliente.telefono,
          direccion: cliente.direccion,
          comuna: cliente.comuna,
          region: cliente.region,
        },
        payer: {
          name: firstName || undefined,
          surname: restName.join(' ') || undefined,
          email: cliente.correo,
          phone: { number: cliente.telefono },
        },
        back_urls: {
          success: `${SITE_URL}/?pago=exito`,
          failure: `${SITE_URL}/?pago=fallo`,
          pending: `${SITE_URL}/?pago=pendiente`,
        },
        auto_return: 'approved',
        notification_url: `${SITE_URL}/api/mp-webhook`,
      },
    });

    res.status(200).json({
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point,
    });
  } catch (err) {
    console.error('create-preference error:', err);
    res.status(500).json({ error: 'No se pudo iniciar el pago.' });
  }
};
