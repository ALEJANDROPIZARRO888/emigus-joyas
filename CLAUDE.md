# EmiGus Joyas — reglas del proyecto

## Tipografía y textos
- NO usar el separador "·" (punto medio / interpunto) en ningún texto visible: nombres de producto, migas de pan, fichas, listas de categorías, footer, ayuda, etc. Usar " / " o " — " en su lugar. La usuaria lo pidió explícitamente dos veces.
- Tono romántico y evocador, tuteo chileno, sin emojis.

## Marca
- Paleta clara: marfil #FDFBF8, crema #F8F1E9, oro rosa #B98B5C, carbón #33322F, rosa suave #FBF2EF. No usar el sistema oscuro Nocturne.
- Titulares en Cormorant Garamond, texto en Jost.
- Moneda: pesos chilenos (CLP), formato $18.500.
- Categorías: Mujer, Hombre, Bebés / Niños.
- Contacto: WhatsApp +56 9 9397 3241, emigus.joyas@gmail.com, instagram.com/emigusjoyas. Envío gratis sobre $80.000; bajo ese monto el envío es "Por pagar" directo a la empresa (BlueExpress o Starken) al recibir el pedido — no se cobra por el sitio.
- Notificación de ventas: cada pago aprobado por MercadoPago dispara un correo a emigus.joyas@gmail.com con el detalle completo (vía Resend, en api/mp-webhook.js), además de registrarse en la hoja de Sheets "Pedidos".

## Catálogo
- Las fotos vienen de la carpeta de Drive vía https://drive.google.com/thumbnail?id=<ID>&sz=w1000
- Modo "Editar catálogo" (?admin=1 + clave, variable de entorno ADMIN_SECRET en Vercel — hoy 'emigus2026'): los cambios de nombre/precio/stock/descripción/eliminado ya NO se guardan en localStorage — se guardan en la pestaña "Catálogo" del Google Sheet vía api/catalog-overrides.js (lib/catalog-overrides.js), así cualquier administradora autorizada edita desde cualquier computador y el cambio se ve al instante para toda visitante. api/admin-login.js valida la clave en el servidor (ya no está expuesta en el código del navegador).
- Estos cambios son "deltas" sobre el catálogo base (catalog/catalog.source.json + PRODUCTS en el HTML) — no reemplazan el catálogo, solo lo parchan en memoria al cargar la página. Para cambios grandes/masivos (agregar muchos productos nuevos, reordenar fotos) se sigue usando el pipeline de scripts/ (extract → merge → generate-products.js → deploy).

## Hoja de Sheets (Clientes / Pedidos)
- Hoja activa (GOOGLE_SHEET_ID en Vercel): "clientes_emigus", id 1WB5cyRcUL73mhjygxQPiYenxEq80bEwU4rv8mtcAOEc, carpeta de Drive https://drive.google.com/drive/folders/1fKoIHVViOx866kwY5rspvsSD4KhvJ5r0
- Debe ser una Hoja de cálculo de Google nativa (no .xlsx) y estar compartida como Editor con la cuenta de servicio emigus-sheets-bot@inbound-domain-505417-g6.iam.gserviceaccount.com — si alguna de las dos condiciones falla, register-customer.js y mp-webhook.js dejan de poder escribir.
- Pestañas y columnas esperadas (no cambiar el orden sin actualizar el código): "Clientes" (A:ID fórmula, B:Nombre, C:Correo, D:Teléfono, E:Fecha nacimiento, F:Próximo cumpleaños fórmula, G:Días para cumpleaños fórmula, H:Fecha registro, I:Origen, J:Último saludo, K:Notas), "Pedidos" (A:Fecha, B:Referencia, C:Cliente, D:Correo, E:Productos, F:Total CLP, G:ID pago MercadoPago, H:Cupón, I:Teléfono, J:Dirección, K:Comuna, L:Región, M:N° Pedido, N:Estado — I-L se piden en el carrito antes de pagar, ya que MercadoPago Checkout Pro no los pide, y viajan como `metadata` en la preferencia hasta que el webhook los lee del pago confirmado; M/N los agrega api/mp-webhook.js vía lib/orders.js, ver sección "Seguimiento de pedidos" abajo) y "Cupones" (A:Código, B:Tipo, C:Descuento %, D:Correo, E:Creado, F:Usado, G:Referencia pedido).
- api/mp-webhook.js es idempotente: antes de agregar una fila revisa si el ID de pago (columna G) ya está registrado, porque MercadoPago puede reenviar la misma notificación más de una vez.
- La sheet anterior (1EMp7RKMOHLoNEPqtL4Wb9UYzOuYVCh1V5bZjPh43v3I, "EmiGus Joyas — Clientes y Pedidos") quedó desconectada del sitio pero sigue existiendo en Drive con una fila de prueba.

## Seguimiento de pedidos
- Cada pedido recibe un número correlativo propio (formato EG-1001, EG-1002…, generado en lib/orders.js — nextOrderNumber lee la columna M completa, no solo el máximo, por si se borró una fila a mano) al confirmarse el pago en api/mp-webhook.js. Es lo único que se le pide a la clienta; nunca se expone la Referencia (UUID interno) ni el ID de pago de MercadoPago.
- Estados posibles (lib/orders.js, ORDER_ESTADOS en el HTML — mantener ambas listas iguales): "En preparación" (inicial, automático al confirmarse el pago), "En tránsito", "Entregado".
- Al confirmarse el pago, además del aviso interno a emigus.joyas@gmail.com, se envía un correo a la clienta con su número de pedido (api/mp-webhook.js, confirmationEmailHtml).
- Página pública "Seguimiento" (link en el menú, vista `tracking` en el HTML): la clienta escribe su número de pedido en api/track-order.js (sin clave) y ve fecha/estado/productos/total — nunca dirección, teléfono ni correo, aunque alguien adivine un número válido.
- Panel admin "Pedidos" (botón junto a "Editar catálogo"): api/orders.js (lista completa, requiere clave) y api/update-order-status.js (cambia el estado, requiere clave y dispara un correo a la clienta avisándole del cambio — api/update-order-status.js, statusEmailHtml).

## Cupones de descuento
- Cada suscriptora recibe un código único (formato EMIGUS-XXXXXX, generado en lib/coupons.js) al registrarse — ya no existe el código fijo EMIGUS10 antiguo.
- Un código se valida en el carrito (api/validate-coupon.js) pero solo se marca "usado" cuando MercadoPago confirma el pago (api/mp-webhook.js) — así una compra abandonada no gasta el cupón.
- api/create-preference.js vuelve a validar el código en el servidor y aplica el % de descuento a cada línea antes de crear la preferencia (nunca confía en un descuento calculado en el navegador).
- Para agregar códigos manuales (promociones, regalos, etc.): escribir una fila nueva en la pestaña "Cupones" con Código, Tipo, Descuento (%) y dejar "Usado" vacío — no hace falta tocar el código.
