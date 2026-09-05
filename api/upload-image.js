'use strict';
// Sube una foto (base64, ya redimensionada en el navegador) a la carpeta de
// Drive del sitio. Requiere la clave de administradora.

const { uploadProductImage } = require('../lib/blob');

const MAX_BASE64_LEN = 6 * 1024 * 1024; // ~4.5MB de imagen real, con margen

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

  const base64 = String(body.base64 || '');
  if (!base64) {
    res.status(400).json({ error: 'Falta la imagen.' });
    return;
  }
  if (base64.length > MAX_BASE64_LEN) {
    res.status(400).json({ error: 'La imagen es demasiado grande.' });
    return;
  }
  const mimeType = String(body.mimeType || '');
  if (!/^image\/(jpeg|png|webp)$/.test(mimeType)) {
    res.status(400).json({ error: 'La imagen debe ser JPEG, PNG o WEBP.' });
    return;
  }

  try {
    const { url } = await uploadProductImage({
      base64,
      mimeType,
      filename: String(body.filename || ''),
    });
    res.status(200).json({ url });
  } catch (err) {
    console.error('upload-image error:', err);
    res.status(500).json({ error: 'No se pudo subir la foto.' });
  }
};
