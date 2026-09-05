'use strict';
// Sube las fotos de productos nuevos a Vercel Blob (mismo lugar donde vive
// el sitio) y devuelve una URL pública lista para usar como <img src>.
//
// Antes se intentó subir a Google Drive con la cuenta de servicio, pero
// Google ya no permite que las cuentas de servicio creen archivos fuera de
// una "Unidad compartida" (función exclusiva de Google Workspace de pago —
// no existe en una cuenta Gmail normal), así que quedaba bloqueado con
// "Service Accounts do not have storage quota".

const { put } = require('@vercel/blob');

async function uploadProductImage({ base64, mimeType, filename }) {
  const buffer = Buffer.from(base64, 'base64');
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const safeName = (filename || 'producto').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'producto';
  const { url } = await put(`productos/${safeName}-${Date.now()}.${ext}`, buffer, {
    access: 'public',
    contentType: mimeType,
  });
  return { url };
}

module.exports = { uploadProductImage };
