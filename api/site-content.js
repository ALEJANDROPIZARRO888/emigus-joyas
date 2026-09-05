'use strict';
// GET: textos del sitio editados (público). POST: cambia uno, requiere la
// clave de administradora.

const { getSiteContent, setSiteText } = require('../lib/site-content');

// Únicas claves editables desde el sitio hoy — evita que cualquiera con la
// clave escriba texto arbitrario en filas sueltas de la hoja.
const KEYS = new Set(['announcement', 'heroTitle', 'heroSubtitle']);

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const content = await getSiteContent();
      res.status(200).json({ content });
    } catch (err) {
      console.error('site-content GET error:', err);
      res.status(500).json({ error: 'No se pudieron cargar los textos.' });
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

  const key = String(body.key || '');
  if (!KEYS.has(key)) {
    res.status(400).json({ error: 'Texto inválido.' });
    return;
  }

  try {
    await setSiteText(key, String(body.value ?? ''));
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('site-content POST error:', err);
    res.status(500).json({ error: 'No se pudo guardar el texto.' });
  }
};
