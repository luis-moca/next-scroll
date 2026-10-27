// Recomendador real: carga el modelo entrenado con MovieLens (modelo/entrenar.py) y recomienda en el navegador.
// El modelo pesa ~350 KB, así que solo se descarga cuando la sección está por aparecer en pantalla.

const seccion = document.getElementById('modelo');
const $ = id => document.getElementById(id);
const MAX = 5;

const GENERO = { Action:'Acción', Adventure:'Aventura', Animation:'Animación', Children:'Infantil', Comedy:'Comedia',
  Crime:'Crimen', Documentary:'Documental', Drama:'Drama', Fantasy:'Fantasía', 'Film-Noir':'Cine negro', Horror:'Terror',
  IMAX:'IMAX', Musical:'Musical', Mystery:'Misterio', Romance:'Romance', 'Sci-Fi':'Ciencia ficción', Thriller:'Suspenso',
  War:'Guerra', Western:'Western' };
// Grupos de color para el mapa, en orden de prioridad (una película con varios géneros toma el primero que encaje)
const GRUPOS = [
  ['Animación', ['Animation', 'Children'], '#7DDB8A'],
  ['Terror', ['Horror'], '#FF9A5A'],
  ['Ciencia ficción', ['Sci-Fi'], '#5FE0D0'],
  ['Documental', ['Documentary'], '#E3E8F7'],
  ['Romance', ['Romance'], '#FF8FC8'],
  ['Acción y aventura', ['Action', 'Adventure', 'War', 'Western'], '#FF6B6B'],
  ['Comedia', ['Comedy', 'Musical'], '#FFC94A'],
  ['Suspenso y crimen', ['Thriller', 'Crime', 'Mystery', 'Film-Noir'], '#B48CFF'],
  ['Drama', ['Drama'], '#8FA8FF'],
];
const OTRO = '#6E7BA8';
const PERFILES = [
  ['Ciencia ficción', ['The Matrix', 'Alien', 'Terminator 2: Judgment Day', 'Inception', 'Blade Runner']],
  ['Animación', ['Toy Story', 'Finding Nemo', 'The Lion King', 'Shrek', 'Monsters, Inc.']],
  ['Comedia', ['Superbad', 'The Hangover', 'Anchorman: The Legend of Ron Burgundy', 'Zoolander', 'Step Brothers']],
  ['Terror', ['The Shining', 'Scream', 'The Exorcist', 'Halloween', 'The Ring']],
  ['Romance', ['Titanic', 'Notting Hill', 'Pretty Woman', 'When Harry Met Sally...', 'The Notebook']],
];

let M = null;                       // todo lo que viene del modelo
let elegidas = [], esEjemplo = true;
let modoLista = 'preciso', modoMapa = 'parecido';
let recs = { preciso: [], parecido: [] };

// ---------- carga ----------
async function cargar() {
  const estado = [$('list-preciso'), $('list-parecido')];
  estado.forEach(l => { l.innerHTML = '<li class="estado">Cargando el modelo…</li>'; });
  try {
    const [meta, buf] = await Promise.all([
      fetch('data/peliculas.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch('data/recomendador.bin').then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }),
    ]);
    preparar(meta, buf);
  } catch (e) {
    const msg = location.protocol === 'file:'
      ? 'El modelo no carga con el archivo abierto directo. Corre <code>python3 -m http.server 8000</code> en la carpeta y abre localhost:8000.'
      : 'No se pudo cargar el modelo. Recarga la página.';
    estado.forEach(l => { l.innerHTML = `<li class="estado">${msg}</li>`; });
    return;
  }
  $('rp-q').disabled = false;
  aplicarPerfil(PERFILES[0][1], true);
  if (new URLSearchParams(location.search).has('prueba')) revisarControl();
}

function preparar(meta, buf) {
  const n = meta.binario.n, kp = meta.params.preciso.k, ks = meta.params.parecido.k;
  const mapa = new Uint16Array(buf, 0, n * 2);
  const sp = meta.binario.escala_preciso, ss = meta.binario.escala_parecido;
  const Yp = Float32Array.from(new Int8Array(buf, n * 4, n * kp), v => v * sp);
  const Ys = Float32Array.from(new Int8Array(buf, n * 4 + n * kp, n * ks), v => v * ss);
  // YᵀY del modo preciso: se calcula aquí en vez de descargarlo
  const YtY = new Float64Array(kp * kp);
  for (let i = 0; i < n; i++) {
    const o = i * kp;
    for (let a = 0; a < kp; a++) {
      const ya = Yp[o + a];
      for (let b = a; b < kp; b++) YtY[a * kp + b] += ya * Yp[o + b];
    }
  }
  for (let a = 0; a < kp; a++) for (let b = 0; b < a; b++) YtY[a * kp + b] = YtY[b * kp + a];

  const items = meta.items.map(([id, titulo, anio, generos, vistas], i) => {
    const g = generos.split('|');
    const grupo = GRUPOS.find(([, gs]) => gs.some(x => g.includes(x)));
    return { i, id, titulo, anio, generos: g.map(x => GENERO[x]).filter(Boolean), vistas,
      color: grupo ? grupo[2] : OTRO, busca: normalizar(titulo), x: mapa[i * 2] / 65535, y: 1 - mapa[i * 2 + 1] / 65535 };
  });
  const maxVistas = Math.max(...items.map(t => t.vistas));
  // "núcleo de clásicos": dentro de las 25 más vistas, el grupo más apretado del mapa
  const top = [...items].sort((a, b) => b.vistas - a.vistas).slice(0, 25);
  const cerca = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < .06;
  const centro = top.reduce((best, t) => (top.filter(o => cerca(o, t)).length > top.filter(o => cerca(o, best)).length ? t : best), top[0]);
  const grupo = top.filter(o => cerca(o, centro));
  const nucleo = { x: grupo.reduce((s, t) => s + t.x, 0) / grupo.length, y: grupo.reduce((s, t) => s + t.y, 0) / grupo.length };
  M = { meta, n, kp, ks, Yp, Ys, YtY, items, maxVistas, nucleo, porTitulo: new Map(items.map(t => [t.titulo, t.i])) };
  pintarMetricas();
  pintarLeyenda();
}

// ---------- las dos formas de recomendar (las mismas que modelo/entrenar.py) ----------
function puntajePreciso(sel) {
  const { kp: k, Yp, YtY, n } = M, p = M.meta.params.preciso;
  const c = 1 + p.alpha_nuevo * 5;
  const A = Float64Array.from(YtY), b = new Float64Array(k);
  for (let d = 0; d < k; d++) A[d * k + d] += p.lambda;
  for (const j of sel) {
    const o = j * k;
    for (let a = 0; a < k; a++) {
      b[a] += c * Yp[o + a];
      for (let bb = 0; bb < k; bb++) A[a * k + bb] += (c - 1) * Yp[o + a] * Yp[o + bb];
    }
  }
  const x = resolver(A, b, k);
  const s = new Float64Array(n);
  for (let i = 0; i < n; i++) { let v = 0; const o = i * k; for (let a = 0; a < k; a++) v += Yp[o + a] * x[a]; s[i] = v; }
  return s;
}

function puntajeParecido(sel) {
  const { ks: k, Ys, n } = M, v = new Float64Array(k);
  for (const j of sel) for (let a = 0; a < k; a++) v[a] += Ys[j * k + a];
  const s = new Float64Array(n);
  for (let i = 0; i < n; i++) { let t = 0; const o = i * k; for (let a = 0; a < k; a++) t += Ys[o + a] * v[a]; s[i] = t; }
  return s;
}

function resolver(A, b, k) {
  // eliminación de Gauss con pivoteo parcial: resuelve A·x = b
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r * k + c]) > Math.abs(A[p * k + c])) p = r;
    if (p !== c) { for (let j = 0; j < k; j++) [A[c * k + j], A[p * k + j]] = [A[p * k + j], A[c * k + j]]; [b[c], b[p]] = [b[p], b[c]]; }
    for (let r = c + 1; r < k; r++) {
      const f = A[r * k + c] / A[c * k + c];
      if (!f) continue;
      for (let j = c; j < k; j++) A[r * k + j] -= f * A[c * k + j];
      b[r] -= f * b[c];
    }
  }
  const x = new Float64Array(k);
  for (let r = k - 1; r >= 0; r--) { let s = b[r]; for (let j = r + 1; j < k; j++) s -= A[r * k + j] * x[j]; x[r] = s / A[r * k + r]; }
  return x;
}

function top10(s, sel) {
  const fuera = new Set(sel);
  return Array.from(s.keys()).filter(i => !fuera.has(i)).sort((a, b) => s[b] - s[a]).slice(0, 10);
}

function similitud(i, j) {
  const { ks: k, Ys } = M; let t = 0;
  for (let a = 0; a < k; a++) t += Ys[i * k + a] * Ys[j * k + a];
  return t;
}

// ---------- estado y pintado ----------
function aplicarPerfil(titulos, ejemplo) {
  elegidas = titulos.map(t => M.porTitulo.get(t)).filter(i => i !== undefined).slice(0, MAX);
  esEjemplo = ejemplo;
  actualizar();
}

function alternar(i) {
  const pos = elegidas.indexOf(i);
  if (pos >= 0) elegidas.splice(pos, 1);
  else if (elegidas.length < MAX) elegidas.push(i);
  else return false;
  esEjemplo = false;
  actualizar();
  return true;
}

function actualizar() {
  recs = elegidas.length
    ? { preciso: top10(puntajePreciso(elegidas), elegidas), parecido: top10(puntajeParecido(elegidas), elegidas) }
    : { preciso: [], parecido: [] };
  pintarElegidas();
  pintarLista('preciso');
  pintarLista('parecido');
  dibujarMapa();
}

const titulo = t => t.titulo + (t.anio ? ` (${t.anio})` : '');
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const iniciales = t => t.titulo.replace(/^(The|A|An) /, '').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

function pintarElegidas() {
  $('rp-count').innerHTML = `<b>${elegidas.length}</b> de ${MAX}` + (esEjemplo && elegidas.length ? '<span class="rp-ej">ejemplo</span>' : '');
  const slots = [];
  for (let s = 0; s < MAX; s++) {
    const i = elegidas[s];
    if (i === undefined) { slots.push(`<div class="slot vacio"><span class="sw-c">${s + 1}</span><span>Busca o toca un punto del mapa</span></div>`); continue; }
    const t = M.items[i];
    slots.push(`<div class="slot lleno"><span class="sw-c" style="background:${t.color};color:#0B1440">${esc(iniciales(t))}</span>
      <div><b>${esc(t.titulo)}</b><small>${t.anio || ''}${t.generos.length ? ' · ' + t.generos.slice(0, 2).join(' · ') : ''}</small></div>
      <button type="button" data-quitar="${i}" aria-label="Quitar ${esc(t.titulo)}">✕</button></div>`);
  }
  $('rp-slots').innerHTML = slots.join('');
}

function pintarLista(modo) {
  const lista = $(`list-${modo}`), ids = recs[modo];
  if (!ids.length) {
    lista.innerHTML = '<li class="estado">Elige al menos una película para ver recomendaciones.</li>';
    $(`med-${modo}`).textContent = '';
    return;
  }
  const vistas = ids.map(i => M.items[i].vistas).sort((a, b) => a - b);
  const mediana = (vistas[4] + vistas[5]) / 2;
  $(`med-${modo}`).innerHTML = `Mediana: vista por <b>${Math.round(mediana)}</b> de ${M.meta.metricas.personas} personas`;
  lista.innerHTML = ids.map((i, n) => {
    const t = M.items[i];
    const porque = elegidas.reduce((best, j) => (similitud(i, j) > similitud(i, best) ? j : best), elegidas[0]);
    return `<li class="ri" style="--i:${n}"><span class="ri-n">${n + 1}</span><div>
      <b>${esc(t.titulo)}</b><span class="ri-meta">${t.anio || ''}${t.generos.length ? ' · ' + t.generos.slice(0, 2).join(' · ') : ''}</span>
      <span class="ri-pop"><span><i style="width:${(t.vistas / M.maxVistas * 100).toFixed(1)}%"></i></span>vista por ${t.vistas}</span>
      <span class="ri-why">Más cercana a <em>${esc(M.items[porque].titulo)}</em></span></div></li>`;
  }).join('');
}

// ---------- búsqueda ----------
function normalizar(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
let resultados = [], activo = -1;

function buscar() {
  const q = normalizar($('rp-q').value.trim());
  const ul = $('rp-results');
  if (!q || !M) { ul.hidden = true; return; }
  resultados = M.items.filter(t => t.busca.includes(q)).sort((a, b) => b.vistas - a.vistas).slice(0, 8).map(t => t.i);
  activo = resultados.length ? 0 : -1;
  pintarResultados();
  ul.hidden = false;
}

function pintarResultados() {
  const ul = $('rp-results'), lleno = elegidas.length >= MAX;
  if (!resultados.length) { ul.innerHTML = '<li class="vacio">Sin resultados. Los títulos están en inglés, como en MovieLens.</li>'; return; }
  ul.innerHTML = (lleno ? '<li class="vacio">Ya tienes 5. Quita una para cambiarla.</li>' : '') + resultados.map((i, n) => {
    const t = M.items[i], ya = elegidas.includes(i);
    return `<li role="option" data-i="${i}" aria-selected="${n === activo}" class="${ya || lleno ? 'off' : ''}"><i style="background:${t.color}"></i>
      <b>${esc(t.titulo)}</b><small>${ya ? 'elegida' : t.anio || ''}</small></li>`;
  }).join('');
}

function elegirResultado(i) {
  if (elegidas.includes(i) || elegidas.length >= MAX) return;
  alternar(i);
  $('rp-q').value = '';
  $('rp-results').hidden = true;
  $('rp-q').focus();
}

// ---------- mapa ----------
const cv = $('rm-cv'), ctx = cv.getContext('2d');
let W = 0, H = 0, puntoTip = -1;
const PAD = 22;

function medir() {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  W = r.width; H = r.height;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
const px = t => PAD + t.x * (W - PAD * 2);
const py = t => PAD + t.y * (H - PAD * 2);
const radio = t => (1.3 + 2.6 * Math.log(t.vistas) / Math.log(M.maxVistas)) * Math.min(1, Math.max(.6, W / 900));

function dibujarMapa() {
  if (!M || !W) return;
  ctx.clearRect(0, 0, W, H);
  const resaltar = new Set(recs[modoMapa]), sel = new Set(elegidas);
  // con películas elegidas, el fondo se apaga un poco para que resalten
  ctx.globalAlpha = elegidas.length ? .42 : .75;
  for (const t of M.items) {
    if (resaltar.has(t.i) || sel.has(t.i)) continue;
    ctx.fillStyle = t.color;
    ctx.beginPath(); ctx.arc(px(t), py(t), radio(t), 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // marca del núcleo de clásicos
  const nx = px(M.nucleo), ny = py(M.nucleo);
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.2; ctx.setLineDash([2, 4]);
  ctx.beginPath(); ctx.arc(nx, ny, 26, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  ctx.font = '600 11px "JetBrains Mono", monospace'; ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.textAlign = nx > W / 2 ? 'right' : 'left'; ctx.textBaseline = 'top';
  ctx.fillText('clásicos que ve casi todo el mundo', nx > W / 2 ? nx + 10 : nx - 10, ny + 32);
  const color = colorModo();
  // línea de cada recomendación a la película tuya que más se le parece
  ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.globalAlpha = .55; ctx.setLineDash([3, 4]);
  for (const i of recs[modoMapa]) {
    const j = elegidas.reduce((b, k) => (similitud(i, k) > similitud(i, b) ? k : b), elegidas[0]);
    ctx.beginPath(); ctx.moveTo(px(M.items[i]), py(M.items[i])); ctx.lineTo(px(M.items[j]), py(M.items[j])); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.lineWidth = 2.5;
  for (const i of recs[modoMapa]) {
    const t = M.items[i], x = px(t), y = py(t);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); ctx.stroke();
  }
  const chico = W < 520;
  ctx.font = `600 ${chico ? 11 : 12}px Onest, sans-serif`; ctx.textBaseline = 'middle';
  const puestas = [];                          // etiquetas ya dibujadas, para no encimarlas
  for (const i of elegidas) {
    const t = M.items[i], x = px(t), y = py(t);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.stroke();
    ctx.fillStyle = t.color; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 7); ctx.fill();
    const max = chico ? 16 : 24;
    const txt = t.titulo.length > max ? t.titulo.slice(0, max - 1) + '…' : t.titulo;
    const w = ctx.measureText(txt).width + 10, h = 20;
    const derecha = x + 13 + w < W - 4;
    let ly = y, intentos = 0;
    const choca = yy => puestas.some(r => Math.abs(r.y - yy) < h && Math.abs(r.x - (derecha ? x + 8 : x - 8 - w)) < Math.max(r.w, w));
    while (choca(ly) && intentos < 8) { intentos++; ly = y + (intentos % 2 ? 1 : -1) * Math.ceil(intentos / 2) * (h + 2); }
    const bx = derecha ? x + 8 : x - 8 - w;
    puestas.push({ x: bx, y: ly, w });
    if (ly !== y) { ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(derecha ? bx : bx + w, ly); ctx.stroke(); }
    ctx.fillStyle = 'rgba(8,20,71,.82)';
    ctx.beginPath(); ctx.roundRect(bx, ly - h / 2, w, h, 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(txt, bx + 5, ly + .5);
  }
}

function cercano(ev) {
  const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
  let mejor = -1, d = 14 * 14;
  for (const t of M.items) { const dx = px(t) - x, dy = py(t) - y, dd = dx * dx + dy * dy; if (dd < d) { d = dd; mejor = t.i; } }
  return mejor;
}

function tip(i) {
  const el = $('rm-tip');
  if (i < 0) { el.hidden = true; puntoTip = -1; return; }
  const t = M.items[i], ya = elegidas.includes(i);
  el.innerHTML = `<b>${esc(titulo(t))}</b><small>${t.generos.slice(0, 2).join(' · ')} · vista por ${t.vistas}</small><br><small>${ya ? 'Toca para quitarla' : elegidas.length >= MAX ? 'Ya tienes 5' : 'Toca para agregarla'}</small>`;
  el.style.left = Math.min(Math.max(px(t), 120), W - 120) + 'px';
  el.style.top = py(t) + 'px';
  el.hidden = false; puntoTip = i;
}

cv.addEventListener('pointermove', ev => { if (M && ev.pointerType === 'mouse') tip(cercano(ev)); });
cv.addEventListener('pointerleave', () => tip(-1));
cv.addEventListener('pointerup', ev => {
  if (!M) return;
  const i = cercano(ev);
  if (i < 0) { tip(-1); return; }
  if (ev.pointerType !== 'mouse' && puntoTip !== i) { tip(i); return; }   // en celular: primer toque muestra, segundo agrega
  alternar(i); tip(i);
});

const colorModo = () => (modoMapa === 'preciso' ? '#FF7A4A' : '#19D3A8');

function pintarLeyenda() {
  $('rm-legend').innerHTML = GRUPOS.map(([nombre, , c]) => `<span><i style="background:${c}"></i>${nombre}</span>`).join('')
    + `<span><i style="background:${OTRO}"></i>Otros</span><span><i class="lg-ring" style="border-color:#0B1440"></i>Tus películas</span>`
    + `<span><i class="lg-ring" style="border-color:${colorModo()}"></i>Recomendadas (modo ${modoMapa})</span>`;
}

// ---------- métricas (salen del archivo del modelo, no están escritas a mano) ----------
function pintarMetricas() {
  const m = M.meta.metricas, web = m.persona_nueva_formato_web, nuevas = m.persona_nueva;
  const filas = [['Preciso', 'c-preciso', web.preciso], ['Parecido', 'c-parecido', web.parecido], ['Popularidad', 'c-popular', nuevas.popularidad]];
  const pct = v => (v * 100).toFixed(1) + '%';
  const col = (titulo, nota, clave, max) => `<div class="mt-col"><h4>${titulo}</h4><p>${nota}</p>
    ${filas.map(([n, c, d]) => `<div class="mt-row ${c}"><span>${n}</span><span class="tr"><i style="width:${(d[clave] / max * 100).toFixed(1)}%"></i></span><span class="v">${pct(d[clave])}</span></div>`).join('')}
    <div class="mt-axis"><span></span><span><span>0%</span><span>${max * 100}%</span></span><span></span></div></div>`;
  const h = m.persona_con_historial;
  const mejora = Math.round((h.modelo.precision_at_10 / h.popularidad.precision_at_10 - 1) * 100);
  $('rec-metrics').innerHTML = `<div class="mt-head"><span class="k-lbl">Cómo lo medimos</span>
      <h3>Probado con ${web.preciso.personas_evaluadas} personas que el modelo nunca vio</h3>
      <p>A cada una le dimos 5 películas que le gustaron, igual que haces tú aquí, y revisamos si las 10 recomendaciones incluían otras que también calificó con 4 estrellas o más. La referencia es recomendar lo más popular a todo el mundo.</p></div>
    <div class="mt-grid">${col('Acierto', 'De 10 recomendaciones, cuántas le gustaron (precision@10)', 'precision_at_10', .5)}
      ${col('Variedad', 'Qué parte del catálogo llegó a recomendarse a alguien', 'cobertura_catalogo', .2)}</div>
    <div class="mt-foot"><span class="t"><svg class="ic"><use href="#i-target"/></svg></span>
      <p>Con el historial completo de cada persona, el modelo acierta <b>${pct(h.modelo.precision_at_10)}</b> contra <b>${pct(h.popularidad.precision_at_10)}</b> de la popularidad: ${mejora}% más. El modo preciso gana en acierto y el parecido en variedad; elegir el balance es la etapa de re-ranking del embudo.</p></div>`;
  $('rec-src').textContent = `Datos: ${M.meta.fuente} Uso no comercial. Modelo: ${M.meta.modelo}, entrenado en modelo/entrenar.py.`;
  $('m-calif').textContent = m.calificaciones.toLocaleString('es-MX');
  $('m-pers').textContent = m.personas;
  $('m-mapa').innerHTML = `Comprobación: de los 5 vecinos más cercanos de cada película en el mapa, <b>${pct(m.mapa_vecinos_mismo_genero)}</b> comparten género, contra <b>${pct(m.mapa_azar_mismo_genero)}</b> si fuera al azar. El modelo nunca vio los géneros; los aprendió de quién ve qué.`;
}

function revisarControl() {
  const c = M.meta.control, sel = c.perfil.map(id => M.items.findIndex(t => t.id === id));
  for (const modo of ['preciso', 'parecido']) {
    const s = modo === 'preciso' ? puntajePreciso(sel) : puntajeParecido(sel);
    const web = top10(s, sel).map(i => M.items[i].id);
    console.log(`control ${modo}:`, JSON.stringify(web) === JSON.stringify(c[modo]) ? 'igual a Python' : `distinto ${web} vs ${c[modo]}`);
  }
}

// ---------- eventos ----------
$('rp-q').addEventListener('input', buscar);
$('rp-q').addEventListener('keydown', e => {
  const ul = $('rp-results');
  if (ul.hidden || !resultados.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); activo = (activo + 1) % resultados.length; pintarResultados(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); activo = (activo - 1 + resultados.length) % resultados.length; pintarResultados(); }
  else if (e.key === 'Enter' && activo >= 0) { e.preventDefault(); elegirResultado(resultados[activo]); }
  else if (e.key === 'Escape') ul.hidden = true;
});
$('rp-results').addEventListener('pointerdown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); elegirResultado(+li.dataset.i); } });
$('rp-q').addEventListener('blur', () => setTimeout(() => { $('rp-results').hidden = true; }, 120));
$('rp-slots').addEventListener('click', e => { const b = e.target.closest('[data-quitar]'); if (b) alternar(+b.dataset.quitar); });
$('rp-clear').addEventListener('click', () => { if (!M) return; elegidas = []; esEjemplo = false; actualizar(); $('rp-q').focus(); });
$('rp-presets').innerHTML = PERFILES.map(([n], k) => `<button type="button" class="chipb" data-perfil="${k}">${n}</button>`).join('');
$('rp-presets').addEventListener('click', e => { const b = e.target.closest('[data-perfil]'); if (b && M) aplicarPerfil(PERFILES[+b.dataset.perfil][1], true); });
document.querySelectorAll('.ro-tabs button').forEach(b => b.addEventListener('click', () => {
  modoLista = b.dataset.modo;
  $('ro-cols').dataset.modo = modoLista;
  document.querySelectorAll('.ro-tabs button').forEach(x => x.setAttribute('aria-selected', x === b));
}));
document.querySelectorAll('[data-map-modo]').forEach(b => b.addEventListener('click', () => {
  modoMapa = b.dataset.mapModo;
  document.querySelectorAll('[data-map-modo]').forEach(x => x.setAttribute('aria-pressed', x === b));
  pintarLeyenda();
  dibujarMapa();
}));
new ResizeObserver(() => { medir(); dibujarMapa(); }).observe(cv);

// Descarga el modelo cuando la sección está a menos de ~una pantalla
const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); cargar(); } }, { rootMargin: '900px 0px' });
io.observe(seccion);
