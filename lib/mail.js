'use strict';
// Envío de correos transaccionales (aviso de venta, saludos de cumpleaños)
// vía la API HTTP de Resend — evita depender de SMTP desde las funciones
// serverless de Vercel.

const RESEND_API_URL = 'https://api.resend.com/emails';

async function sendEmail({ to, subject, html, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Falta la variable de entorno RESEND_API_KEY.');
  const from = process.env.RESEND_FROM || 'EmiGus Joyas <onboarding@resend.dev>';

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    // reply_to: para que cuando la clienta responda el correo (ej. dejando un
    // comentario sobre su pedido), la respuesta llegue directo a la bandeja
    // real del negocio en vez de a la dirección de envío de Resend.
    body: JSON.stringify({ from, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend respondió ${res.status}: ${body}`);
  }
  return res.json();
}

module.exports = { sendEmail };
