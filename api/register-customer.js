'use strict';
// Recibe {nombre, correo, fecha_nacimiento} desde el formulario "Círculo
// EmiGus" del sitio y agrega una fila a la pestaña "Clientes" del Google
// Sheet. La columna ID y las columnas de cumpleaños (F/G) se dejan como
// fórmulas (igual que si alguien las escribiera a mano en la planilla), no
// como valores fijos, para que "Días para el próximo cumpleaños" se siga
// actualizando solo día a día.

const { appendRow, updateCells } = require('../lib/google-sheets');
const { createCoupon } = require('../lib/coupons');
const { sendEmail } = require('../lib/mail');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const CLIENTES_TAB = 'Clientes';

function formatCL(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

// El nombre viene de un formulario público — se escapa antes de meterlo en
// el HTML del correo para que nadie pueda inyectar enlaces o marcado falsos.
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function welcomeEmailHtml({ name, code }) {
  return `
    <div style="font-family:Georgia,serif;color:#33322F;max-width:520px;margin:0 auto">
      <h2 style="font-weight:400;margin:0 0 4px">¡Bienvenida al Círculo EmiGus!</h2>
      <p style="font-size:15px;line-height:1.75;color:#5C5850;margin:16px 0">Hola ${escapeHtml(name)}, gracias por sumarte. Este es tu código de 10% de descuento para tu primera compra — te lo dejamos aquí guardado, por si se te pierde en la página:</p>
      <div style="margin:24px 0;padding:22px 24px;background:#F8F1E9;border:1px dashed #B98B5C;text-align:center">
        <span style="font-size:22px;letter-spacing:.16em;color:#33322F;font-weight:bold">${escapeHtml(code)}</span>
      </div>
      <p style="font-size:14px;line-height:1.7;color:#5C5850;margin:0 0 20px">Ingrésalo en el carrito antes de pagar. Es válido en tu primer pedido, sin monto mínimo.</p>
      <p style="font-size:13px;line-height:1.7;color:#8A847B;margin:0">¿Dudas? Escríbenos por WhatsApp al +56 9 9397 3241 o responde este correo.</p>
    </div>
  `;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const body = req.body || {};
  const name = String(body.nombre || '').trim();
  const email = String(body.correo || '').trim().toLowerCase();
  const birthdate = String(body.fecha_nacimiento || '').trim(); // "YYYY-MM-DD", como lo manda <input type=date>

  if (!name) return res.status(400).json({ error: 'Falta el nombre.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Correo inválido.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return res.status(400).json({ error: 'Fecha de nacimiento inválida.' });

  const [y, m, d] = birthdate.split('-');
  const birthdateCL = `${d}/${m}/${y}`; // el Sheet está en configuración regional de Chile (DD/MM/AAAA)
  const registeredCL = formatCL(new Date());

  try {
    const row = await appendRow(
      CLIENTES_TAB,
      ['', name, email, '', birthdateCL, '', '', registeredCL, 'Newsletter', '', ''],
      'B' // "Nombre completo": siempre vacía en las filas de la planilla que aún no se usan
    );
    if (row) {
      // Ojo: esta hoja usa configuración regional en español (Chile), donde las
      // fórmulas separan argumentos con ";" en vez de ",". Con USER_ENTERED,
      // la API interpreta el texto de la fórmula según el idioma/región de la
      // hoja — una fórmula con comas simplemente no parsea y queda #ERROR!.
      await updateCells(CLIENTES_TAB, [
        { range: `A${row}`, value: '=ROW()-1' },
        { range: `F${row}`, value: `=IF(E${row}="";"";DATE(YEAR(TODAY())+IF(OR(MONTH(E${row})>MONTH(TODAY());AND(MONTH(E${row})=MONTH(TODAY());DAY(E${row})>=DAY(TODAY())));0;1);MONTH(E${row});DAY(E${row})))` },
        { range: `G${row}`, value: `=IF(E${row}="";"";F${row}-TODAY())` },
      ]);
    }

    let code = '';
    try {
      code = await createCoupon({ email, percent: 10, tipo: 'Bienvenida' });
    } catch (couponErr) {
      // El registro ya quedó guardado arriba; si el cupón falla no queremos
      // perder a la clienta, solo avisamos sin cupón.
      console.error('register-customer: no se pudo crear el cupón', couponErr);
    }

    // El correo es una comodidad (por si pierde el código en la página) — si
    // Resend falla, el registro y el cupón ya quedaron guardados igual.
    if (code) {
      try {
        await sendEmail({
          to: email,
          subject: 'Bienvenida al Círculo EmiGus — tu 10% de descuento',
          html: welcomeEmailHtml({ name, code }),
          replyTo: 'emigus.joyas@gmail.com',
        });
      } catch (mailErr) {
        console.error('register-customer: no se pudo enviar el correo de bienvenida', mailErr);
      }
    }

    res.status(200).json({ ok: true, code });
  } catch (err) {
    console.error('register-customer error:', err);
    res.status(500).json({ error: 'No se pudo guardar el registro.' });
  }
};
