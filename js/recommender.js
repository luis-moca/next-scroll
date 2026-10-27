// Real recommender: loads the model trained on MovieLens (model/train.py) and recommends in the browser.
// The model weighs ~350 KB, so it only downloads when the section is about to appear on screen.

const section = document.getElementById('try');
const $ = id => document.getElementById(id);
const MAX = 5;

const GENRE = { Action:'Action', Adventure:'Adventure', Animation:'Animation', Children:'Kids', Comedy:'Comedy',
  Crime:'Crime', Documentary:'Documentary', Drama:'Drama', Fantasy:'Fantasy', 'Film-Noir':'Film noir', Horror:'Horror',
  IMAX:'IMAX', Musical:'Musical', Mystery:'Mystery', Romance:'Romance', 'Sci-Fi':'Sci-fi', Thriller:'Thriller',
  War:'War', Western:'Western' };
// Color groups for the map, in priority order (a movie with several genres takes the first one that fits)
const GROUPS = [
  ['Animation', ['Animation', 'Children'], '#7DDB8A'],
  ['Horror', ['Horror'], '#FF9A5A'],
  ['Sci-fi', ['Sci-Fi'], '#5FE0D0'],
  ['Documentary', ['Documentary'], '#E3E8F7'],
  ['Romance', ['Romance'], '#FF8FC8'],
  ['Action & adventure', ['Action', 'Adventure', 'War', 'Western'], '#FF6B6B'],
  ['Comedy', ['Comedy', 'Musical'], '#FFC94A'],
  ['Thriller & crime', ['Thriller', 'Crime', 'Mystery', 'Film-Noir'], '#B48CFF'],
  ['Drama', ['Drama'], '#8FA8FF'],
];
const OTHER = '#6E7BA8';
const PROFILES = [
  ['Sci-fi', ['The Matrix', 'Alien', 'Terminator 2: Judgment Day', 'Inception', 'Blade Runner']],
  ['Animation', ['Toy Story', 'Finding Nemo', 'The Lion King', 'Shrek', 'Monsters, Inc.']],
  ['Comedy', ['Superbad', 'The Hangover', 'Anchorman: The Legend of Ron Burgundy', 'Zoolander', 'Step Brothers']],
  ['Horror', ['The Shining', 'Scream', 'The Exorcist', 'Halloween', 'The Ring']],
  ['Romance', ['Titanic', 'Notting Hill', 'Pretty Woman', 'When Harry Met Sally...', 'The Notebook']],
];

let M = null;                       // everything that comes from the model
let picked = [], isExample = true;
let mapMode = 'similar';
let recs = { accurate: [], similar: [] };

// ---------- loading ----------
async function load() {
  const lists = [$('list-accurate'), $('list-similar')];
  lists.forEach(l => { l.innerHTML = '<li class="status">Loading the model…</li>'; });
  try {
    const [meta, buf] = await Promise.all([
      fetch('data/movies.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch('data/recommender.bin').then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }),
    ]);
    prepare(meta, buf);
  } catch (e) {
    const msg = location.protocol === 'file:'
      ? 'The model can’t load from a file opened directly. Run <code>python3 -m http.server 8000</code> in the folder and open localhost:8000.'
      : 'The model couldn’t load. Please refresh the page.';
    lists.forEach(l => { l.innerHTML = `<li class="status">${msg}</li>`; });
    return;
  }
  $('pk-q').disabled = false;
  applyProfile(PROFILES[0][1], true);
  if (new URLSearchParams(location.search).has('test')) runCheck();
}

function prepare(meta, buf) {
  const n = meta.binary.n, ka = meta.params.accurate.k, ks = meta.params.similar.k;
  const map = new Uint16Array(buf, 0, n * 2);
  const sa = meta.binary.scale_accurate, ss = meta.binary.scale_similar;
  const Ya = Float32Array.from(new Int8Array(buf, n * 4, n * ka), v => v * sa);
  const Ys = Float32Array.from(new Int8Array(buf, n * 4 + n * ka, n * ks), v => v * ss);
  // YᵀY for the accurate mode: computed here instead of downloading it
  const YtY = new Float64Array(ka * ka);
  for (let i = 0; i < n; i++) {
    const o = i * ka;
    for (let a = 0; a < ka; a++) {
      const ya = Ya[o + a];
      for (let b = a; b < ka; b++) YtY[a * ka + b] += ya * Ya[o + b];
    }
  }
  for (let a = 0; a < ka; a++) for (let b = 0; b < a; b++) YtY[a * ka + b] = YtY[b * ka + a];

  const items = meta.items.map(([id, title, year, genres, views], i) => {
    const g = genres.split('|');
    const group = GROUPS.find(([, gs]) => gs.some(x => g.includes(x)));
    return { i, id, title, year, genres: g.map(x => GENRE[x]).filter(Boolean), views,
      color: group ? group[2] : OTHER, search: normalize(title), x: map[i * 2] / 65535, y: 1 - map[i * 2 + 1] / 65535 };
  });
  const maxViews = Math.max(...items.map(t => t.views));
  // "core of classics": within the 25 most-watched movies, the tightest group on the map
  const top = [...items].sort((a, b) => b.views - a.views).slice(0, 25);
  const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < .06;
  const center = top.reduce((best, t) => (top.filter(o => near(o, t)).length > top.filter(o => near(o, best)).length ? t : best), top[0]);
  const group = top.filter(o => near(o, center));
  const core = { x: group.reduce((s, t) => s + t.x, 0) / group.length, y: group.reduce((s, t) => s + t.y, 0) / group.length };
  M = { meta, n, ka, ks, Ya, Ys, YtY, items, maxViews, core, byTitle: new Map(items.map(t => [t.title, t.i])) };
  paintMetrics();
  paintLegend();
}

// ---------- the two ways to recommend (same as model/train.py) ----------
function scoreAccurate(sel) {
  const { ka: k, Ya, YtY, n } = M, p = M.meta.params.accurate;
  const c = 1 + p.alpha_new * 5;
  const A = Float64Array.from(YtY), b = new Float64Array(k);
  for (let d = 0; d < k; d++) A[d * k + d] += p.lambda;
  for (const j of sel) {
    const o = j * k;
    for (let a = 0; a < k; a++) {
      b[a] += c * Ya[o + a];
      for (let bb = 0; bb < k; bb++) A[a * k + bb] += (c - 1) * Ya[o + a] * Ya[o + bb];
    }
  }
  const x = solve(A, b, k);
  const s = new Float64Array(n);
  for (let i = 0; i < n; i++) { let v = 0; const o = i * k; for (let a = 0; a < k; a++) v += Ya[o + a] * x[a]; s[i] = v; }
  return s;
}

function scoreSimilar(sel) {
  const { ks: k, Ys, n } = M, v = new Float64Array(k);
  for (const j of sel) for (let a = 0; a < k; a++) v[a] += Ys[j * k + a];
  const s = new Float64Array(n);
  for (let i = 0; i < n; i++) { let t = 0; const o = i * k; for (let a = 0; a < k; a++) t += Ys[o + a] * v[a]; s[i] = t; }
  return s;
}

function solve(A, b, k) {
  // Gaussian elimination with partial pivoting: solves A·x = b
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
  const out = new Set(sel);
  return Array.from(s.keys()).filter(i => !out.has(i)).sort((a, b) => s[b] - s[a]).slice(0, 10);
}

function similarity(i, j) {
  const { ks: k, Ys } = M; let t = 0;
  for (let a = 0; a < k; a++) t += Ys[i * k + a] * Ys[j * k + a];
  return t;
}

const closestPick = i => picked.reduce((best, j) => (similarity(i, j) > similarity(i, best) ? j : best), picked[0]);

// ---------- state and painting ----------
function applyProfile(titles, example) {
  picked = titles.map(t => M.byTitle.get(t)).filter(i => i !== undefined).slice(0, MAX);
  isExample = example;
  update();
}

function toggle(i) {
  const pos = picked.indexOf(i);
  if (pos >= 0) picked.splice(pos, 1);
  else if (picked.length < MAX) picked.push(i);
  else return false;
  isExample = false;
  update();
  return true;
}

function update() {
  recs = picked.length
    ? { accurate: top10(scoreAccurate(picked), picked), similar: top10(scoreSimilar(picked), picked) }
    : { accurate: [], similar: [] };
  paintPicks();
  paintList('accurate');
  paintList('similar');
  drawMap();
}

const fullTitle = t => t.title + (t.year ? ` (${t.year})` : '');
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const initials = t => t.title.replace(/^(The|A|An) /, '').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const meta = t => `${t.year || ''}${t.genres.length ? ' · ' + t.genres.slice(0, 2).join(' · ') : ''}`;

function paintPicks() {
  $('pk-count').innerHTML = `<b>${picked.length}</b> of ${MAX}` + (isExample && picked.length ? '<span class="pk-ex">example</span>' : '');
  const slots = [];
  for (let s = 0; s < MAX; s++) {
    const i = picked[s];
    if (i === undefined) { slots.push(`<div class="slot empty"><span class="sw-c">${s + 1}</span><span>Search, or tap a dot on the map</span></div>`); continue; }
    const t = M.items[i];
    slots.push(`<div class="slot filled"><span class="sw-c" style="background:${t.color};color:#0B1440">${esc(initials(t))}</span>
      <div><b>${esc(t.title)}</b><small>${meta(t)}</small></div>
      <button type="button" data-remove="${i}" aria-label="Remove ${esc(t.title)}">✕</button></div>`);
  }
  $('pk-slots').innerHTML = slots.join('');
}

function paintList(mode) {
  const list = $(`list-${mode}`), ids = recs[mode];
  if (!ids.length) {
    list.innerHTML = '<li class="status">Pick at least one movie to see recommendations.</li>';
    $(`med-${mode}`).textContent = '';
    return;
  }
  const views = ids.map(i => M.items[i].views).sort((a, b) => a - b);
  const median = (views[4] + views[5]) / 2;
  $(`med-${mode}`).innerHTML = `Median: watched by <b>${Math.round(median)}</b> of ${M.meta.metrics.people} people`;
  list.innerHTML = ids.map((i, n) => {
    const t = M.items[i];
    return `<li class="ri" style="--i:${n}"><span class="ri-n">${n + 1}</span><div>
      <b>${esc(t.title)}</b><span class="ri-meta">${meta(t)}</span>
      <span class="ri-pop"><span><i style="width:${(t.views / M.maxViews * 100).toFixed(1)}%"></i></span>watched by ${t.views}</span>
      <span class="ri-why">Closest to <em>${esc(M.items[closestPick(i)].title)}</em></span></div></li>`;
  }).join('');
}

// ---------- search ----------
function normalize(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
let results = [], active = -1;

function search() {
  const q = normalize($('pk-q').value.trim());
  const ul = $('pk-results');
  if (!q || !M) { ul.hidden = true; return; }
  results = M.items.filter(t => t.search.includes(q)).sort((a, b) => b.views - a.views).slice(0, 8).map(t => t.i);
  active = results.length ? 0 : -1;
  paintResults();
  ul.hidden = false;
}

function paintResults() {
  const ul = $('pk-results'), full = picked.length >= MAX;
  if (!results.length) { ul.innerHTML = '<li class="none">No matches. Try the original title, as it appears in MovieLens.</li>'; return; }
  ul.innerHTML = (full ? '<li class="none">You already have 5. Remove one to swap it.</li>' : '') + results.map((i, n) => {
    const t = M.items[i], already = picked.includes(i);
    return `<li role="option" data-i="${i}" aria-selected="${n === active}" class="${already || full ? 'off' : ''}"><i style="background:${t.color}"></i>
      <b>${esc(t.title)}</b><small>${already ? 'picked' : t.year || ''}</small></li>`;
  }).join('');
}

function chooseResult(i) {
  if (picked.includes(i) || picked.length >= MAX) return;
  toggle(i);
  $('pk-q').value = '';
  $('pk-results').hidden = true;
  $('pk-q').focus();
}

// ---------- map ----------
const cv = $('rm-cv'), ctx = cv.getContext('2d');
let W = 0, H = 0, tipDot = -1;
const PAD = 22;

function measure() {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  W = r.width; H = r.height;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
const px = t => PAD + t.x * (W - PAD * 2);
const py = t => PAD + t.y * (H - PAD * 2);
const radius = t => (1.3 + 2.6 * Math.log(t.views) / Math.log(M.maxViews)) * Math.min(1, Math.max(.6, W / 900));
const modeColor = () => (mapMode === 'accurate' ? '#FF7A4A' : '#19D3A8');

function drawMap() {
  if (!M || !W) return;
  ctx.clearRect(0, 0, W, H);
  const highlight = new Set(recs[mapMode]), sel = new Set(picked);
  // with movies picked, the background dims a bit so the highlights stand out
  ctx.globalAlpha = picked.length ? .42 : .75;
  for (const t of M.items) {
    if (highlight.has(t.i) || sel.has(t.i)) continue;
    ctx.fillStyle = t.color;
    ctx.beginPath(); ctx.arc(px(t), py(t), radius(t), 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // marker for the core of classics
  const nx = px(M.core), ny = py(M.core);
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.2; ctx.setLineDash([2, 4]);
  ctx.beginPath(); ctx.arc(nx, ny, 26, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  ctx.font = '600 11px "JetBrains Mono", monospace'; ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.textAlign = nx > W / 2 ? 'right' : 'left'; ctx.textBaseline = 'top';
  ctx.fillText('classics almost everyone has seen', nx > W / 2 ? nx + 10 : nx - 10, ny + 32);
  const color = modeColor();
  // a line from each recommendation to the pick it is most similar to
  ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.globalAlpha = .55; ctx.setLineDash([3, 4]);
  for (const i of recs[mapMode]) {
    const j = closestPick(i);
    ctx.beginPath(); ctx.moveTo(px(M.items[i]), py(M.items[i])); ctx.lineTo(px(M.items[j]), py(M.items[j])); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.lineWidth = 2.5;
  for (const i of recs[mapMode]) {
    const t = M.items[i], x = px(t), y = py(t);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); ctx.stroke();
  }
  const small = W < 520;
  ctx.font = `600 ${small ? 11 : 12}px Onest, sans-serif`; ctx.textBaseline = 'middle';
  const placed = [];                          // labels already drawn, so they don't overlap
  for (const i of picked) {
    const t = M.items[i], x = px(t), y = py(t);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.stroke();
    ctx.fillStyle = t.color; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 7); ctx.fill();
    const max = small ? 16 : 24;
    const txt = t.title.length > max ? t.title.slice(0, max - 1) + '…' : t.title;
    const w = ctx.measureText(txt).width + 10, h = 20;
    const right = x + 13 + w < W - 4;
    let ly = y, tries = 0;
    const clashes = yy => placed.some(r => Math.abs(r.y - yy) < h && Math.abs(r.x - (right ? x + 8 : x - 8 - w)) < Math.max(r.w, w));
    while (clashes(ly) && tries < 8) { tries++; ly = y + (tries % 2 ? 1 : -1) * Math.ceil(tries / 2) * (h + 2); }
    const bx = right ? x + 8 : x - 8 - w;
    placed.push({ x: bx, y: ly, w });
    if (ly !== y) { ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(right ? bx : bx + w, ly); ctx.stroke(); }
    ctx.fillStyle = 'rgba(8,20,71,.82)';
    ctx.beginPath(); ctx.roundRect(bx, ly - h / 2, w, h, 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(txt, bx + 5, ly + .5);
  }
}

function nearest(ev) {
  const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
  let best = -1, d = 14 * 14;
  for (const t of M.items) { const dx = px(t) - x, dy = py(t) - y, dd = dx * dx + dy * dy; if (dd < d) { d = dd; best = t.i; } }
  return best;
}

function tip(i) {
  const el = $('rm-tip');
  if (i < 0) { el.hidden = true; tipDot = -1; return; }
  const t = M.items[i], already = picked.includes(i);
  el.innerHTML = `<b>${esc(fullTitle(t))}</b><small>${t.genres.slice(0, 2).join(' · ')} · watched by ${t.views}</small><br><small>${already ? 'Tap to remove it' : picked.length >= MAX ? 'You already have 5' : 'Tap to add it'}</small>`;
  el.style.left = Math.min(Math.max(px(t), 120), W - 120) + 'px';
  el.style.top = py(t) + 'px';
  el.hidden = false; tipDot = i;
}

cv.addEventListener('pointermove', ev => { if (M && ev.pointerType === 'mouse') tip(nearest(ev)); });
cv.addEventListener('pointerleave', () => tip(-1));
cv.addEventListener('pointerup', ev => {
  if (!M) return;
  const i = nearest(ev);
  if (i < 0) { tip(-1); return; }
  if (ev.pointerType !== 'mouse' && tipDot !== i) { tip(i); return; }   // on phones: first tap shows, second tap adds
  toggle(i); tip(i);
});

function paintLegend() {
  $('rm-legend').innerHTML = GROUPS.map(([name, , c]) => `<span><i style="background:${c}"></i>${name}</span>`).join('')
    + `<span><i style="background:${OTHER}"></i>Other</span><span><i class="lg-ring" style="border-color:#0B1440"></i>Your movies</span>`
    + `<span><i class="lg-ring" style="border-color:${modeColor()}"></i>Recommended (${mapMode} mode)</span>`;
}

// ---------- metrics (they come from the model file, not typed by hand) ----------
function paintMetrics() {
  const m = M.meta.metrics, web = m.new_person_web_format, fresh = m.new_person;
  const rows = [['Accurate', 'c-accurate', web.accurate], ['Similar', 'c-similar', web.similar], ['Popularity', 'c-popular', fresh.popularity]];
  const pct = v => (v * 100).toFixed(1) + '%';
  const col = (title, note, key, max) => `<div class="mt-col"><h4>${title}</h4><p>${note}</p>
    ${rows.map(([n, c, d]) => `<div class="mt-row ${c}"><span>${n}</span><span class="tr"><i style="width:${(d[key] / max * 100).toFixed(1)}%"></i></span><span class="v">${pct(d[key])}</span></div>`).join('')}
    <div class="mt-axis"><span></span><span><span>0%</span><span>${max * 100}%</span></span><span></span></div></div>`;
  const h = m.person_with_history;
  const lift = Math.round((h.model.precision_at_10 / h.popularity.precision_at_10 - 1) * 100);
  $('rec-metrics').innerHTML = `<div class="mt-head"><span class="k-lbl">How we measured it</span>
      <h3>Tested on ${web.accurate.people_evaluated} people the model had never seen</h3>
      <p>We gave each of them 5 movies they liked, just like you do here, and checked whether the 10 recommendations included other movies they had rated 4 stars or higher. The baseline recommends the most popular movies to everyone.</p></div>
    <div class="mt-grid">${col('Hit rate', 'Out of 10 recommendations, how many they liked (precision@10)', 'precision_at_10', .5)}
      ${col('Variety', 'Share of the catalog that got recommended to someone', 'catalog_coverage', .2)}</div>
    <div class="mt-foot"><span class="t"><svg class="ic"><use href="#i-target"/></svg></span>
      <p>With each person’s full history, the model’s hit rate is <b>${pct(h.model.precision_at_10)}</b> versus <b>${pct(h.popularity.precision_at_10)}</b> for popularity: ${lift}% better. Accurate mode wins on hit rate and similar mode on variety; choosing the balance is the re-ranking stage of the funnel.</p></div>`;
  $('rec-src').textContent = `Data: ${M.meta.source} Non-commercial use. Model: ${M.meta.model}, trained in model/train.py.`;
  $('m-ratings').textContent = m.ratings.toLocaleString('en-US');
  $('m-people').textContent = m.people;
  $('m-map').innerHTML = `Sanity check: of each movie’s 5 nearest neighbors on the map, <b>${pct(m.map_neighbors_same_genre)}</b> share its genre, versus <b>${pct(m.map_chance_same_genre)}</b> by pure chance. The model never saw a single genre; it learned them from who watches what.`;
}

function runCheck() {
  const c = M.meta.check, sel = c.profile.map(id => M.items.findIndex(t => t.id === id));
  for (const mode of ['accurate', 'similar']) {
    const s = mode === 'accurate' ? scoreAccurate(sel) : scoreSimilar(sel);
    const web = top10(s, sel).map(i => M.items[i].id);
    console.log(`check ${mode}:`, JSON.stringify(web) === JSON.stringify(c[mode]) ? 'matches Python' : `differs ${web} vs ${c[mode]}`);
  }
}

// ---------- events ----------
$('pk-q').addEventListener('input', search);
$('pk-q').addEventListener('keydown', e => {
  const ul = $('pk-results');
  if (ul.hidden || !results.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % results.length; paintResults(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + results.length) % results.length; paintResults(); }
  else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); chooseResult(results[active]); }
  else if (e.key === 'Escape') ul.hidden = true;
});
$('pk-results').addEventListener('pointerdown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); chooseResult(+li.dataset.i); } });
$('pk-q').addEventListener('blur', () => setTimeout(() => { $('pk-results').hidden = true; }, 120));
$('pk-slots').addEventListener('click', e => { const b = e.target.closest('[data-remove]'); if (b) toggle(+b.dataset.remove); });
$('pk-clear').addEventListener('click', () => { if (!M) return; picked = []; isExample = false; update(); $('pk-q').focus(); });
$('pk-presets').innerHTML = PROFILES.map(([n], k) => `<button type="button" class="chipb" data-profile="${k}">${n}</button>`).join('');
$('pk-presets').addEventListener('click', e => { const b = e.target.closest('[data-profile]'); if (b && M) applyProfile(PROFILES[+b.dataset.profile][1], true); });
document.querySelectorAll('.rl-tabs button').forEach(b => b.addEventListener('click', () => {
  $('rl-cols').dataset.mode = b.dataset.mode;
  document.querySelectorAll('.rl-tabs button').forEach(x => x.setAttribute('aria-selected', x === b));
}));
document.querySelectorAll('[data-map-mode]').forEach(b => b.addEventListener('click', () => {
  mapMode = b.dataset.mapMode;
  document.querySelectorAll('[data-map-mode]').forEach(x => x.setAttribute('aria-pressed', x === b));
  paintLegend();
  drawMap();
}));
new ResizeObserver(() => { measure(); drawMap(); }).observe(cv);

// Download the model once the section is within ~one screen
const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '900px 0px' });
io.observe(section);
