'use strict';
// GET: devuelve las ediciones actuales del catálogo (público — es lo mismo
// que ya se ve en la página, no hay nada sensible).
// POST: cambia un campo o reinicia todo — requiere la clave de
// administradora, validada acá mismo en el servidor en cada llamada (no basta
// con haber pasado el prompt del navegador una vez).

const { getOverrides, setOverrideField, resetOverrides } = require('../lib/catalog-overrides');

const FIELDS = new Set(['name', 'price', 'stock', 'desc', 'del', 'img']);

function checkAuth(req) {
  const password = String((req.body && req.body.password) || '');
  const expected = process.env.ADMIN_SECRET || '';
  return !!expected && password === expected;
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const overrides = await getOverrides();
      res.status(200).json({ overrides });
    } catch (err) {
      console.error('catalog-overrides GET error:', err);
      res.status(500).json({ error: 'No se pudo cargar el catálogo.' });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  if (!checkAuth(req)) {
    res.status(401).json({ error: 'Clave incorrecta.' });
    return;
  }

  const body = req.body || {};

  try {
    if (body.reset) {
      await resetOverrides();
      res.status(200).json({ ok: true });
      return;
    }

    const id = Number(body.id);
    const field = String(body.field || '');
    if (!id || !FIELDS.has(field)) {
      res.status(400).json({ error: 'Datos inválidos.' });
      return;
    }
    if (field === 'img' && body.value && !/^https:\/\//.test(body.value)) {
      res.status(400).json({ error: 'Imagen inválida.' });
      return;
    }
    await setOverrideField(id, field, body.value);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('catalog-overrides POST error:', err);
    res.status(500).json({ error: 'No se pudo guardar el cambio.' });
  }
};
