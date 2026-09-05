'use strict';
// Valida la clave de administradora en el servidor (antes solo se comparaba
// en el navegador, donde cualquiera podía leerla mirando el código fuente).
// Devuelve solo ok/error — nunca la clave configurada.

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Método no permitido' });
    return;
  }
  const password = String((req.body && req.body.password) || '');
  const expected = process.env.ADMIN_SECRET || '';
  if (!expected || password !== expected) {
    res.status(401).json({ ok: false, error: 'Clave incorrecta.' });
    return;
  }
  res.status(200).json({ ok: true });
};
