#!/usr/bin/env node
// Genera un carrusel de Instagram (láminas 1080x1350 en PNG) a partir de un
// JSON con fotos del catálogo, y lo deja en ig/<slug>/ para publicarlo desde
// https://emigus.cl/ig/<slug>/<n>.png (Metricool necesita URLs públicas).
//
// Uso: node scripts/instagram/make-carousel.js scripts/instagram/campanas/<slug>.json
//
// Formato del JSON:
// {
//   "slug": "2026-09-26-coleccion-mar",
//   "coleccion": "Colección Mar",
//   "portada": { "titulo": "Colección Mar", "bajada": "…", "productId": 11 },
//   "productos": [5, 4, 58],          // ids de PRODUCTS (3 láminas)
//   "cierre": { "productId": 4 }      // foto pequeña de la lámina final
// }
// Reglas de marca: sin "·", sin emojis, paleta marfil/crema/oro rosa/carbón.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(p => fs.existsSync(p));

const W = 1080, H = 1350;
const clp = n => '$' + Math.round(n).toLocaleString('es-CL').replace(/,/g, '.');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function products() {
  const src = fs.readFileSync(path.join(ROOT, 'EmiGus Joyas.dc.html'), 'utf8');
  const m = /AUTO-GENERATED:PRODUCTS:START[^\n]*\n([\s\S]*?)\/\/ AUTO-GENERATED:PRODUCTS:END/.exec(src);
  const ctx = {};
  vm.runInNewContext(m[1].replace(/^\s*const PRODUCTS\s*=/m, 'PRODUCTS ='), ctx);
  return ctx.PRODUCTS;
}

function imgUrl(p) {
  if (/^https?:/.test(p.img)) return p.img;
  return 'file:///' + path.join(ROOT, p.img).replace(/\\/g, '/');
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Jost:wght@300;400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#FDFBF8;color:#33322F;font-family:Jost,sans-serif;font-weight:300}
.serif{font-family:'Cormorant Garamond',Georgia,serif;font-variant-numeric:lining-nums}
.kick{font-size:22px;letter-spacing:.32em;text-transform:uppercase;color:#96693C;font-weight:400}
.photo{position:absolute;left:0;top:0;width:100%;object-fit:cover}
.brand{font-family:'Cormorant Garamond',serif;font-size:30px;letter-spacing:.06em;color:#33322F}
`;

function page(body) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`;
}

function cover(c, p, total) {
  return page(`
  <img class="photo" src="${imgUrl(p)}" style="height:990px;object-position:50% 35%">
  <div style="position:absolute;top:40px;left:48px;right:48px;display:flex;justify-content:space-between">
    <span style="background:rgba(253,251,248,.9);padding:8px 18px" class="brand">EmiGus Joyas</span>
    <span style="background:rgba(253,251,248,.9);padding:10px 18px;font-size:20px;letter-spacing:.28em">1 / ${total}</span>
  </div>
  <div style="position:absolute;left:0;right:0;top:990px;bottom:0;background:#FDFBF8;padding:38px 64px 0;border-top:3px solid #B98B5C">
    <div class="kick">Plata 925 / Nueva selección</div>
    <div class="serif" style="font-size:100px;line-height:1;margin:12px 0 14px;color:#2B2A28">${esc(c.titulo)}</div>
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <span style="font-size:31px;color:#6E6A63">${esc(c.bajada)}</span>
      <span style="font-size:20px;letter-spacing:.28em;text-transform:uppercase;color:#96693C;white-space:nowrap">Desliza &rarr;</span>
    </div>
  </div>`);
}

function product(col, p, n, total) {
  return page(`
  <img class="photo" src="${imgUrl(p)}" style="height:1040px;object-position:50% 45%">
  <div style="position:absolute;top:40px;right:48px;background:rgba(253,251,248,.9);padding:10px 18px;font-size:20px;letter-spacing:.28em">${n} / ${total}</div>
  <div style="position:absolute;left:0;right:0;top:1040px;bottom:0;background:#FDFBF8;padding:40px 64px 0;border-top:3px solid #B98B5C">
    <div class="kick">${esc(col)}</div>
    <div class="serif" style="font-size:${p.name.length > 38 ? 46 : p.name.length > 28 ? 54 : 66}px;line-height:1.05;margin:14px 0 18px;color:#2B2A28;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</div>
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <span style="font-size:42px;font-weight:400;color:#33322F">${clp(p.price)}</span>
      <span style="font-size:22px;letter-spacing:.24em;text-transform:uppercase;color:#8A847B">Plata 925 / emigus.cl</span>
    </div>
  </div>`);
}

function closing(p, total) {
  return page(`
  <div style="position:absolute;inset:0;background:#F8F1E9"></div>
  <div style="position:absolute;inset:34px;border:2px solid #DFC9AE"></div>
  <div style="position:absolute;top:70px;left:0;right:0;text-align:center">
    <span class="brand">EmiGus Joyas</span>
    <span style="position:absolute;right:76px;top:6px;font-size:20px;letter-spacing:.28em">${total} / ${total}</span>
  </div>
  <div style="position:absolute;top:170px;left:50%;transform:translateX(-50%);width:300px;height:300px;border-radius:50%;overflow:hidden;border:6px solid #FFFDF9;box-shadow:0 10px 30px rgba(51,50,47,.14)">
    <img src="${imgUrl(p)}" style="width:100%;height:100%;object-fit:cover;object-position:50% 40%">
  </div>
  <div style="position:absolute;top:520px;left:90px;right:90px;text-align:center">
    <div class="kick">Solo para ti</div>
    <div class="serif" style="font-size:92px;line-height:1;margin:20px 0 26px;color:#2B2A28">10% de descuento<br><i style="font-weight:300">en tu primera compra</i></div>
    <div style="font-size:31px;line-height:1.45;color:#6E6A63">Suscríbete en <b style="font-weight:500;color:#33322F">emigus.cl</b> y recibe al instante<br>tu código personal de bienvenida.</div>
  </div>
  <div style="position:absolute;left:90px;right:90px;top:1030px;background:#33322F;color:#FFFDF9;text-align:center;padding:30px 20px;font-size:30px;letter-spacing:.2em;font-weight:400">ENVÍO GRATIS EN SAN JOSÉ DE MAIPO</div>
  <div style="position:absolute;left:0;right:0;top:1170px;text-align:center;font-size:23px;letter-spacing:.14em;color:#6E6A63">emigus.cl  /  WhatsApp +56 9 9397 3241  /  @emigusjoyas</div>`);
}

function render(html, out) {
  const tmp = path.join(os.tmpdir(), 'emigus-slide-' + process.pid + '.html');
  fs.writeFileSync(tmp, html);
  execFileSync(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--allow-file-access-from-files', '--virtual-time-budget=8000',
    `--window-size=${W},${H}`, `--screenshot=${out}`, 'file:///' + tmp.replace(/\\/g, '/'),
  ], { stdio: 'ignore' });
  fs.unlinkSync(tmp);
}

function main() {
  const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const P = products();
  const byId = id => { const p = P.find(x => x.id === id); if (!p) throw new Error('Producto no encontrado: ' + id); return p; };
  const outDir = path.join(ROOT, 'ig', spec.slug);
  fs.mkdirSync(outDir, { recursive: true });
  const total = 2 + spec.productos.length;
  const slides = [cover(spec.portada, byId(spec.portada.productId), total)];
  spec.productos.forEach((id, i) => slides.push(product(spec.coleccion, byId(id), i + 2, total)));
  slides.push(closing(byId(spec.cierre.productId), total));
  slides.forEach((html, i) => {
    const out = path.join(outDir, (i + 1) + '.png');
    render(html, out);
    console.log('ok', path.relative(ROOT, out));
  });
}

main();
