// Ilustraciones animadas del capítulo 1.
import { RM, el } from './util.js';
import { PIC, T } from './datos.js';

/* hero: feed que hace scroll solo */
(function(){
  const f = document.getElementById('hero-feed');
  const order = [1,0,3,5,2,4];
  let html = '';
  for (let r = 0; r < 2; r++) order.forEach(i => {
    const t = T[i];
    html += `<div class="post" style="background:${t.h}"><div class="pic">${PIC[t.p]}</div><div class="side"><span><svg class="ic"><use href="#i-heart"/></svg>12k</span><span><svg class="ic"><use href="#i-share"/></svg>840</span></div><div class="who"><i></i>${t.who}</div><div class="cap">${t.caps[0]}</div></div>`;
  });
  f.innerHTML = html;
})();

/* ticker */
(function(){
  const words = ['YouTube','TikTok','Instagram','Netflix','Spotify','Amazon','Meta Ads','Kuaishou','Pinterest','X'];
  const t = document.getElementById('ticker');
  t.innerHTML = [...words, ...words].map(w => `<span>${w}</span>`).join('');
})();

/* typer */
(function(){
  if (RM) return;
  const el2 = document.getElementById('typed');
  const phrases = ['El perro le ladra al','Me gusta el café con','Vio fútbol, le dio like a tacos, siguiente:'];
  let pi = 0, ci = phrases[0].length, del = false;
  setInterval(() => {
    const p = phrases[pi];
    if (!del){ ci++; if (ci > p.length){ ci = p.length; del = true; return; } }
    else { ci -= 2; if (ci <= 0){ ci = 0; del = false; pi = (pi + 1) % phrases.length; } }
    el2.textContent = phrases[pi].slice(0, ci);
  }, 90);
})();

/* ilustración: matriz */
(function(){
  const s = document.getElementById('ill-matrix');
  const vals = [
    [5,0,3,0,4,0,1,0],[0,4,0,2,0,5,0,3],[4,0,0,5,3,0,2,0],[0,1,4,0,0,3,0,5],[2,0,5,0,4,0,0,4]];
  const preds = [4,3,2,5,1,4,3,2,5,4,3,1,2,4,5,3,2,4,1,3];
  let pk = 0;
  vals.forEach((row, r) => row.forEach((v, c) => {
    const x = 16 + c * 37, y = 10 + r * 37;
    const g = el('g', {}, s);
    if (v){
      el('rect', {x, y, width:31, height:31, rx:8, fill:'#fff', 'fill-opacity': .25 + v * .15}, g);
      const t = el('text', {x:x+15.5, y:y+20, 'text-anchor':'middle', 'font-family':'JetBrains Mono, monospace', 'font-size':12, 'font-weight':600, fill: v > 2 ? '#0B5E4A' : '#fff'}, g); t.textContent = v;
    } else {
      el('rect', {x:x+1, y:y+1, width:29, height:29, rx:8, fill:'none', stroke:'#fff', 'stroke-opacity':.6, 'stroke-dasharray':'3 3'}, g);
      const q = el('text', {x:x+15.5, y:y+20, 'text-anchor':'middle', 'font-family':'JetBrains Mono, monospace', 'font-size':12, fill:'#fff', 'fill-opacity':.7}, g); q.textContent = '?';
      const pg = el('g', {class:'cell-pred', style:`animation-delay:${(pk * 0.29).toFixed(2)}s;transform-box:fill-box;transform-origin:center`}, g);
      el('rect', {x, y, width:31, height:31, rx:8, fill:'#FFC94A'}, pg);
      const pt = el('text', {x:x+15.5, y:y+20, 'text-anchor':'middle', 'font-family':'JetBrains Mono, monospace', 'font-size':12, 'font-weight':600, fill:'#7A3E00'}, pg); pt.textContent = preds[pk % preds.length];
      pk++;
    }
  }));
})();

/* ilustración: red neuronal */
(function(){
  const s = document.getElementById('ill-net');
  const L = [4,6,6,3], X = [30,115,200,262];
  const pos = L.map((n, li) => Array.from({length:n}, (_, i) => [X[li], 22 + (156 / (n - 1 || 1)) * i + (n === 3 ? 0 : 0)]));
  pos[3] = [[262,50],[262,100],[262,150]];
  const eg = el('g', {}, s);
  for (let l = 0; l < 3; l++) pos[l].forEach(a => pos[l+1].forEach(b => {
    el('line', {x1:a[0], y1:a[1], x2:b[0], y2:b[1], stroke:'#fff', 'stroke-opacity':.22, 'stroke-width':1}, eg);
    if (Math.random() < .35) el('line', {x1:a[0], y1:a[1], x2:b[0], y2:b[1], stroke:'#fff', 'stroke-width':1.6, class:'flow', style:`animation-delay:-${(Math.random()*1.6).toFixed(2)}s`}, eg);
  }));
  pos.forEach((layer, li) => layer.forEach((p, i) => {
    el('circle', {cx:p[0], cy:p[1], r: li === 3 ? 9 : 7, fill: li === 3 ? '#FFC94A' : '#fff', class:'nn-node', style:`animation-delay:${(li * .3 + i * .12).toFixed(2)}s`}, s);
  }));
  ['like','compartir','ver'].forEach((t, i) => { const tx = el('text', {x:276, y:pos[3][i][1] + 4, fill:'#fff', 'font-family':'JetBrains Mono, monospace', 'font-size':10, 'font-weight':600}, s); tx.textContent = t; });
  const it = el('text', {x:30, y:196, fill:'#fff', 'fill-opacity':.8, 'font-family':'JetBrains Mono, monospace', 'font-size':9, 'text-anchor':'middle'}, s); it.textContent = 'señales';
})();

/* ilustración: transformer */
(function(){
  const s = document.getElementById('ill-tf');
  const icons = ['i-play','i-heart','i-skip','i-share','i-eye'];
  const xs = [10,62,114,166,218,270], w = 42, y = 132;
  const cx = i => xs[i] + w / 2;
  icons.forEach((_, i) => {
    const d = `M${cx(i)} ${y} Q ${(cx(i) + cx(5)) / 2} ${y - 24 - (cx(5) - cx(i)) * .42} ${cx(5)} ${y}`;
    el('path', {d, fill:'none', stroke:'#FFD27A', 'stroke-width': 1.5 + i * .5, class:'att', style:`animation-delay:${(i * .35).toFixed(2)}s`}, s);
  });
  icons.forEach((ic, i) => {
    const g = el('g', {}, s);
    el('rect', {x:xs[i], y, width:w, height:40, rx:10, fill:'#fff', 'fill-opacity':.92}, g);
    el('use', {href:'#' + ic, x:xs[i] + 11, y:y + 9, width:20, height:20, style:'color:#5B2BD9', fill:'none', stroke:'#5B2BD9', 'stroke-width':2, 'stroke-linecap':'round', 'stroke-linejoin':'round'}, g);
  });
  const q = el('g', {class:'qtok'}, s);
  el('rect', {x:xs[5], y, width:w, height:40, rx:10, fill:'#FFC94A', stroke:'#fff', 'stroke-width':2, 'stroke-dasharray':'4 3'}, q);
  const qt = el('text', {x:cx(5), y:y + 26, 'text-anchor':'middle', 'font-family':'Bricolage Grotesque, sans-serif', 'font-weight':800, 'font-size':20, fill:'#7A3E00'}, q); qt.textContent = '?';})();

/* pipeline de datos */
(function(){
  const svg = document.getElementById('pipe'), nodes = document.getElementById('pipe-nodes'), dots = document.getElementById('pipe-dots');
  const N = [['Tu app','scroll, likes','i-phone','gCoral'],['Streaming','Kafka · Flink','i-wave','gViolet'],['Feature store','señales frescas','i-db','gBlue'],['Modelo','GPU · minutos','i-chip','gAmber'],['Tu feed','siguiente video','i-play','gViolet']];
  N.forEach(([t, s, ic, g], i) => {
    const x = 70 + i * 190;
    const gg = el('g', {}, nodes);
    el('circle', {cx:x, cy:52, r:30, fill:`url(#${g})`, stroke:'rgba(255,255,255,.35)', 'stroke-width':3}, gg);
    el('use', {href:'#' + ic, x:x - 13, y:39, width:26, height:26, fill: ic === 'i-play' ? '#fff' : 'none', stroke:'#fff', 'stroke-width':2, 'stroke-linecap':'round', 'stroke-linejoin':'round', style:'color:#fff'}, gg);
    const a = el('text', {x, y:106, 'text-anchor':'middle'}, gg); a.textContent = t;
    const b = el('text', {x, y:124, 'text-anchor':'middle', class:'sub'}, gg); b.textContent = s;
  });
  if (RM) return;
  for (let k = 0; k < 4; k++){
    const c = el('circle', {cy:52, r:6, fill:'#FFD27A'}, dots);
    el('animate', {attributeName:'cx', from:70, to:830, dur:'5s', begin:`${k * 1.25}s`, repeatCount:'indefinite'}, c);
    el('animate', {attributeName:'r', values:'4;7;4', dur:'1s', repeatCount:'indefinite'}, c);
  }
})();

/* stream de tokens */
(function(){
  const A = [['i-play','vio'],['i-heart','like'],['i-skip','saltó'],['i-share','compartió'],['i-loop','repitió']];
  const K = ['fútbol','tacos','memes','autos','beats','tech','pozole','off-road'];
  const st = document.getElementById('stream');
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const tok = () => { const a = rnd(A); return `<svg class="ic"><use href="#${a[0]}"/></svg>${a[1]} ${rnd(K)}`; };
  const make = (h, cls) => { const s = document.createElement('span'); s.className = 'tok ' + (cls || ''); s.innerHTML = h; return s; };
  const Q = '<svg class="ic"><use href="#i-spark"/></svg>siguiente ?';
  for (let i = 0; i < 5; i++) st.appendChild(make(tok()));
  let nx = make(Q, 'next'); st.appendChild(nx);
  if (RM) return;
  setInterval(() => {
    nx.className = 'tok in'; nx.innerHTML = tok();
    if (st.children.length > 6) st.removeChild(st.firstElementChild);
    nx = make(Q, 'next in'); st.appendChild(nx);
  }, 1900);
})();
