'use strict';
// GET: productos agregados desde el sitio (público — es lo mismo que ya se
// ve en la tienda). POST: crea uno nuevo, requiere la clave de administradora.

const { getNewProducts, createProduct } = require('../lib/new-products');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const products = await getNewProducts();
      res.status(200).json({ products });
    } catch (err) {
      console.error('new-products GET error:', err);
      res.status(500).json({ error: 'No se pudieron cargar los productos nuevos.' });
    }
    return;
  }

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

  const name = String(body.name || '').trim();
  const cat = String(body.cat || '').trim();
  const type = String(body.type || '').trim();
  const price = Number(body.price);
  // Sin stock explícito del formulario, se asume 1 (comportamiento previo,
  // antes de que el formulario pidiera esta cantidad).
  const stock = body.stock === undefined || body.stock === null || body.stock === '' ? 1 : Number(body.stock);
  const imageUrl = String(body.imageUrl || '').trim();
  const meta = String(body.meta || '').trim();

  if (!name) { res.status(400).json({ error: 'Falta el nombre.' }); return; }
  if (!['mujer', 'hombre', 'bebes'].includes(cat)) { res.status(400).json({ error: 'Categoría inválida.' }); return; }
  if (!type) { res.status(400).json({ error: 'Falta el tipo.' }); return; }
  if (!price || price <= 0) { res.status(400).json({ error: 'Precio inválido.' }); return; }
  if (!Number.isInteger(stock) || stock < 0) { res.status(400).json({ error: 'Stock inválido.' }); return; }
  if (!/^https:\/\//.test(imageUrl)) { res.status(400).json({ error: 'Falta la foto.' }); return; }
  // Un anillo sin talla no se puede despachar bien — se exige acá también,
  // nunca se confía solo en que el formulario del navegador la haya pedido.
  if (type === 'Anillos' && !meta) { res.status(400).json({ error: 'Selecciona la talla del anillo.' }); return; }

  try {
    const product = await createProduct({ name, cat, type, price, stock, desc: String(body.desc || '').trim(), imageUrl, meta });
    res.status(200).json({ product });
  } catch (err) {
    console.error('new-products POST error:', err);
    res.status(500).json({ error: 'No se pudo crear el producto.' });
  }
};
