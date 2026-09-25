#!/usr/bin/env node
// Genera sitemap.xml con todas las URLs indexables del sitio: portada,
// categorías (/mujer, /mujer/aros…), fichas de producto (/joya/…) y ayuda.
// Lee el catálogo base de PRODUCTS en "EmiGus Joyas.dc.html" y usa las
// mismas rutas que emigus-seo.js.
//
// Uso: node scripts/generate-sitemap.js   (correrlo después de generar
// productos o cuando se agreguen joyas nuevas, y luego subir sitemap.xml).
// Opcional: --live suma los productos creados desde "Editar catálogo" y quita
// los eliminados, consultando https://emigus.cl/api/new-products y
// /api/catalog-overrides.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SEO = require('../emigus-seo.js');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'EmiGus Joyas.dc.html');

function baseProducts() {
  const src = fs.readFileSync(HTML, 'utf8');
  const m = /AUTO-GENERATED:PRODUCTS:START[^\n]*\n([\s\S]*?)\/\/ AUTO-GENERATED:PRODUCTS:END/.exec(src);
  if (!m) throw new Error('No se encontró el bloque PRODUCTS en el HTML');
  const code = m[1].replace(/^\s*const PRODUCTS\s*=/, 'PRODUCTS =');
  const ctx = { PRODUCTS: [] };
  vm.runInNewContext(code, ctx);
  return ctx.PRODUCTS;
}

async function liveChanges() {
  const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' → ' + r.status); return r.json(); };
  const [np, ov] = await Promise.all([
    get(SEO.SITE + '/api/new-products').catch(() => ({})),
    get(SEO.SITE + '/api/catalog-overrides').catch(() => ({})),
  ]);
  return { newProducts: np.products || [], overrides: ov.overrides || {} };
}

const TYPES_BY_CAT = {
  mujer: ['Collares', 'Pulseras', 'Anillos', 'Aros', 'Tobilleras', 'Dijes'],
  hombre: ['Collares', 'Pulseras', 'Anillos', 'Cadenas'],
  bebes: ['Pulseras', 'Aros', 'Cadenas', 'Medallas'],
};

async function main() {
  let products = baseProducts();
  let overrides = {};
  if (process.argv.includes('--live')) {
    const live = await liveChanges();
    products = products.concat(live.newProducts);
    overrides = live.overrides;
    console.log('Productos nuevos desde el sitio:', live.newProducts.length);
  }
  products = products
    .filter(p => !(overrides[p.id] && overrides[p.id].del))
    .map(p => ({ ...p, name: (overrides[p.id] && overrides[p.id].name) || p.name }));

  const today = new Date().toISOString().slice(0, 10);
  const urls = [];
  const add = (loc, priority, changefreq, extra) => urls.push({ loc: SEO.SITE + loc, priority, changefreq, extra: extra || '' });

  add('/', '1.0', 'daily');
  add('/joyas', '0.9', 'daily');
  for (const cat of ['mujer', 'hombre', 'bebes']) {
    const inCat = products.filter(p => p.cat === cat);
    if (!inCat.length) continue;
    add('/' + cat, '0.9', 'daily');
    for (const t of TYPES_BY_CAT[cat]) {
      if (inCat.some(p => p.type === t)) add('/' + cat + '/' + SEO.slug(t), '0.8', 'weekly');
    }
  }
  for (const k of ['envios', 'cambios', 'cuidado', 'tallas', 'faq']) add('/ayuda/' + SEO.HELP_SLUG[k], '0.5', 'monthly');

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  for (const p of products) {
    const img = p.img ? (/^https?:/.test(p.img) ? p.img : SEO.SITE + '/' + p.img.replace(/^\.?\//, '')) : '';
    const extra = img ? `\n    <image:image><image:loc>${esc(img)}</image:loc></image:image>` : '';
    add(SEO.productPath(p), '0.7', 'weekly', extra);
  }

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'
    + urls.map(u => `  <url>\n    <loc>${esc(u.loc)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>${u.extra}\n  </url>`).join('\n')
    + '\n</urlset>\n';
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
  console.log('sitemap.xml:', urls.length, 'URLs (' + products.length + ' productos)');
}

main().catch(err => { console.error(err); process.exit(1); });
