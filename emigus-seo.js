// SEO de EmiGus Joyas.
//
// El sitio es una sola página (EmiGus Joyas.dc.html), pero cada vista tiene
// su propia URL limpia para que Google pueda indexarla por separado:
//   /                         portada
//   /joyas                    toda la colección
//   /mujer, /hombre, /bebes   categorías  (+ /mujer/aros, /hombre/cadenas…)
//   /joya/149-aros-flor-...   ficha de producto (vista rápida abierta)
//   /ayuda/envios …           páginas de ayuda
//   /seguimiento, /carrito    (noindex)
// vercel.json reescribe todas estas rutas al mismo HTML. Este archivo se carga
// sincrónico en el <head> para dejar título/descripción/canonical correctos
// antes de que se dibuje la página; el componente llama a EmiSEO.apply() cada
// vez que cambia de vista. scripts/generate-sitemap.js usa las mismas rutas.
(function (root) {
  var SITE = 'https://emigus.cl';
  var NAME = 'EmiGus Joyas';
  var DEFAULT_IMG = SITE + '/assets/og-emigus.jpg';
  var SHIP = 'Envío a todo Chile, gratis sobre $80.000.';

  var CAT_SLUG = { todas: 'joyas', mujer: 'mujer', hombre: 'hombre', bebes: 'bebes' };
  var SLUG_CAT = { joyas: 'todas', mujer: 'mujer', hombre: 'hombre', bebes: 'bebes' };
  var TYPES = ['Collares', 'Pulseras', 'Anillos', 'Aros', 'Tobilleras', 'Dijes', 'Cadenas', 'Medallas'];
  var HELP_SLUG = { envios: 'envios', cambios: 'cambios', cuidado: 'cuidado-plata-925', tallas: 'guia-de-tallas', faq: 'preguntas-frecuentes' };

  var CAT_META = {
    todas: {
      title: 'Joyas de Plata 925 | Toda la colección | ' + NAME,
      h: 'Joyas de Plata 925',
      desc: 'Toda la colección de joyas de Plata 925 de EmiGus: aros, collares, pulseras, anillos y cadenas para mujer, hombre y bebés. ' + SHIP
    },
    mujer: {
      title: 'Joyas de Plata 925 para Mujer | Aros, collares y pulseras | ' + NAME,
      h: 'Joyas de Mujer',
      desc: 'Aros, collares, pulseras y anillos de Plata 925 para mujer. Piezas livianas y luminosas para todos los días o para regalar. ' + SHIP
    },
    hombre: {
      title: 'Joyas de Plata 925 para Hombre | Cadenas, pulseras y anillos | ' + NAME,
      h: 'Joyas de Hombre',
      desc: 'Cadenas, pulseras y anillos de Plata 925 para hombre, de línea limpia, resistentes y fáciles de combinar. ' + SHIP
    },
    bebes: {
      title: 'Joyas de Plata 925 para Bebés y Niños | ' + NAME,
      h: 'Joyas de Bebés y Niños',
      desc: 'Pulseras, aros y medallas de Plata 925 para bebés y niños: hipoalergénicas, con cierres seguros y listas para regalar. ' + SHIP
    }
  };
  var CAT_WHO = { todas: '', mujer: ' para Mujer', hombre: ' para Hombre', bebes: ' para Bebés y Niños' };

  var HELP_META = {
    envios: { h: 'Envíos a todo Chile', title: 'Envíos a todo Chile | Plazos y costos | ' + NAME,
      desc: 'Despachamos joyas de Plata 925 de Arica a Punta Arenas con BlueExpress o Starken. Envío gratis sobre $80.000 y plazos de entrega por región.' },
    cambios: { h: 'Cambios y devoluciones', title: 'Cambios y devoluciones | ' + NAME,
      desc: 'Cómo solicitar un cambio en EmiGus Joyas: 10 días de garantía por fallas de fabricación, sin costo y con atención personalizada por WhatsApp.' },
    cuidado: { h: 'Cuidado de la Plata 925', title: 'Cómo cuidar y limpiar tus joyas de Plata 925 | ' + NAME,
      desc: 'Qué es la Plata 925, por qué se oscurece y cómo limpiarla y guardarla para que tus joyas brillen por años. Guía práctica de EmiGus Joyas.' },
    tallas: { h: 'Guía de tallas', title: 'Guía de tallas de anillos, pulseras y collares | ' + NAME,
      desc: 'Aprende a medir tu talla de anillo, el largo de tu pulsera y de tu collar en casa. Tabla de tallas y consejos para regalar sin equivocarte.' },
    faq: { h: 'Preguntas frecuentes', title: 'Preguntas frecuentes | ' + NAME,
      desc: 'Resolvemos tus dudas sobre la Plata 925, envíos, formas de pago, garantía, cambios y envoltorio de regalo en EmiGus Joyas.' }
  };

  var HOME = {
    title: NAME + ' | Joyas de Plata 925 con envío a todo Chile',
    desc: 'Joyería familiar chilena especializada en Plata 925. Collares, pulseras, anillos y aros para mujer, hombre y bebés. Envío gratis sobre $80.000 y atención personalizada por WhatsApp.'
  };

  function slug(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  }
  function typeFromSlug(s) {
    for (var i = 0; i < TYPES.length; i++) if (slug(TYPES[i]) === s) return TYPES[i];
    return null;
  }
  function invert(o) { var r = {}; for (var k in o) r[o[k]] = k; return r; }
  var SLUG_HELP = invert(HELP_SLUG);

  function productPath(p) { return '/joya/' + p.id + (p.name ? '-' + slug(p.name) : ''); }

  // Ruta → { view, cat, type, help, productId } | null si la URL no existe.
  function parse(pathname) {
    var parts = String(pathname || '/').replace(/\/+$/, '').split('/').filter(Boolean).map(function (x) {
      try { return decodeURIComponent(x).toLowerCase(); } catch (e) { return x.toLowerCase(); }
    });
    if (!parts.length) return { view: 'home' };
    var a = parts[0], b = parts[1];
    if (SLUG_CAT[a] && parts.length <= 2) {
      var t = b ? typeFromSlug(b) : 'todas';
      return t ? { view: 'category', cat: SLUG_CAT[a], type: t } : null;
    }
    if (a === 'joya' && b && parts.length === 2) {
      var id = parseInt(b, 10);
      return isNaN(id) ? null : { view: 'product', productId: id };
    }
    if (a === 'ayuda' && parts.length <= 2) {
      var h = b ? SLUG_HELP[b] : 'envios';
      return h ? { view: 'help', help: h } : null;
    }
    if (a === 'seguimiento' && parts.length === 1) return { view: 'tracking' };
    if (a === 'carrito' && parts.length === 1) return { view: 'cart' };
    return null;
  }

  // route: { view, cat, type, help, product: {id,name,…} | null }
  function pathFor(r) {
    if (r.product) return productPath(r.product);
    switch (r.view) {
      case 'category': {
        var base = '/' + (CAT_SLUG[r.cat] || 'joyas');
        return r.type && r.type !== 'todas' && TYPES.indexOf(r.type) >= 0 && r.cat !== 'todas'
          ? base + '/' + slug(r.type) : base;
      }
      case 'help': return '/ayuda/' + (HELP_SLUG[r.help] || 'envios');
      case 'tracking': return '/seguimiento';
      case 'cart': return '/carrito';
      default: return '/';
    }
  }

  function clp(n) { return '$' + Math.round(n).toLocaleString('es-CL'); }
  function abs(u) {
    if (!u) return DEFAULT_IMG;
    if (/^https?:\/\//i.test(u)) return u;
    return SITE + '/' + String(u).replace(/^\.?\//, '');
  }
  function clip(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
  }

  function crumbs(items) {
    return {
      '@type': 'BreadcrumbList',
      itemListElement: items.map(function (it, i) {
        return { '@type': 'ListItem', position: i + 1, name: it[0], item: SITE + it[1] };
      })
    };
  }

  // Devuelve { title, desc, robots, url, image, ld: [] } para una ruta.
  function describe(r) {
    var path = pathFor(r);
    var out = { title: HOME.title, desc: HOME.desc, robots: 'index,follow,max-image-preview:large', url: SITE + path, image: DEFAULT_IMG, ld: [] };
    if (r.notFound) { out.robots = 'noindex,follow'; out.url = SITE + '/'; return out; }
    if (r.product) {
      var p = r.product;
      var who = CAT_WHO[p.cat] || '';
      out.title = p.name + ' | ' + (TYPES.indexOf(p.type) >= 0 ? p.type + ' de Plata 925' + who : 'Joya de Plata 925' + who) + ' | ' + NAME;
      out.desc = clip((p.desc ? p.desc + ' ' : '') + p.name + ' en ' + clp(p.price) + '. ' + SHIP, 160);
      out.image = abs(p.img);
      out.type = 'product';
      var catPath = '/' + (CAT_SLUG[p.cat] || 'joyas');
      out.ld.push({
        '@type': 'Product',
        name: p.name,
        sku: String(p.id),
        image: (p.images && p.images.length ? p.images : [p.img]).filter(Boolean).map(abs),
        description: p.desc || p.name,
        category: p.type || undefined,
        material: 'Plata 925',
        brand: { '@type': 'Brand', name: NAME },
        offers: {
          '@type': 'Offer',
          url: out.url,
          price: String(Math.round(p.price)),
          priceCurrency: 'CLP',
          availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          itemCondition: 'https://schema.org/NewCondition',
          seller: { '@type': 'Organization', name: NAME }
        }
      });
      var trail = [['Inicio', '/']];
      if (CAT_META[p.cat]) trail.push([CAT_META[p.cat].h, catPath]);
      trail.push([p.name, path]);
      out.ld.push(crumbs(trail));
      return out;
    }
    if (r.view === 'category') {
      var m = CAT_META[r.cat] || CAT_META.todas;
      if (path.split('/').length > 2) {
        var who2 = CAT_WHO[r.cat] || '';
        out.title = r.type + ' de Plata 925' + who2 + ' | ' + NAME;
        out.desc = r.type + ' de Plata 925' + who2.toLowerCase() + ', seleccionados uno a uno por nuestra familia. ' + SHIP + ' Atención personalizada por WhatsApp.';
        out.ld.push(crumbs([['Inicio', '/'], [m.h, '/' + CAT_SLUG[r.cat]], [r.type, path]]));
      } else {
        out.title = m.title;
        out.desc = m.desc;
        out.ld.push(crumbs([['Inicio', '/'], [m.h, path]]));
      }
      return out;
    }
    if (r.view === 'help') {
      var hm = HELP_META[r.help] || HELP_META.envios;
      out.title = hm.title;
      out.desc = hm.desc;
      out.ld.push(crumbs([['Inicio', '/'], ['Ayuda', '/ayuda/envios'], [hm.h, path]]));
      if (r.help === 'faq' && r.faqs && r.faqs.length) {
        out.ld.push({
          '@type': 'FAQPage',
          mainEntity: r.faqs.map(function (f) {
            return { '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } };
          })
        });
      }
      return out;
    }
    if (r.view === 'tracking') {
      out.title = 'Seguimiento de pedido | ' + NAME;
      out.desc = 'Revisa el estado de tu pedido EmiGus Joyas con tu número de pedido.';
      out.robots = 'noindex,follow';
      return out;
    }
    if (r.view === 'cart') {
      out.title = 'Tu carrito | ' + NAME;
      out.robots = 'noindex,follow';
      return out;
    }
    return out;
  }

  function setMeta(attr, key, value) {
    var el = document.head.querySelector('meta[' + attr + '="' + key + '"]');
    if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
    if (el.getAttribute('content') !== value) el.setAttribute('content', value);
  }

  var lastKey = '';
  function apply(r) {
    var d = describe(r || { view: 'home' });
    var key = JSON.stringify(d);
    if (key === lastKey) return d;
    lastKey = key;
    document.title = d.title;
    setMeta('name', 'description', d.desc);
    setMeta('name', 'robots', d.robots);
    setMeta('property', 'og:title', d.title);
    setMeta('property', 'og:description', d.desc);
    setMeta('property', 'og:url', d.url);
    setMeta('property', 'og:image', d.image);
    setMeta('property', 'og:type', d.type === 'product' ? 'product' : 'website');
    setMeta('name', 'twitter:title', d.title);
    setMeta('name', 'twitter:description', d.desc);
    setMeta('name', 'twitter:image', d.image);
    var can = document.head.querySelector('link[rel="canonical"]');
    if (!can) { can = document.createElement('link'); can.setAttribute('rel', 'canonical'); document.head.appendChild(can); }
    can.setAttribute('href', d.url);
    var ld = document.getElementById('emigus-route-ld');
    if (d.ld.length) {
      if (!ld) { ld = document.createElement('script'); ld.type = 'application/ld+json'; ld.id = 'emigus-route-ld'; document.head.appendChild(ld); }
      ld.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': d.ld });
    } else if (ld) {
      ld.remove();
    }
    return d;
  }

  var api = { SITE: SITE, slug: slug, parse: parse, pathFor: pathFor, productPath: productPath, describe: describe, apply: apply, CAT_SLUG: CAT_SLUG, HELP_SLUG: HELP_SLUG, TYPES: TYPES };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.EmiSEO = api;

  // Primera pasada, antes de que se dibuje la página. Las fichas de producto
  // se completan cuando el componente ya tiene el catálogo.
  try {
    var first = parse(location.pathname);
    if (!first) apply({ view: 'home', notFound: true });
    else if (first.view !== 'product') apply(first);
  } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
