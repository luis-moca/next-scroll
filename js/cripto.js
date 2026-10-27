// Ilustraciones del capítulo 2.
import { RM, el } from './util.js';

/* ===== capítulo 2: ilustraciones ===== */
const CUBE = {em:['#7FF0CF','#0FA37F','#07745A'], cy:['#9FE6FF','#1BA6D9','#0B6E93'], gd:['#FFE58A','#F2B705','#B88400'], tl:['#7FE3C8','#0A5C55','#04332F']};
function cube(p, x, y, s, c, delay){
  const g = el('g', {class:'cube', style:`animation-delay:${delay}s`}, p), k = .87 * s;
  el('polygon', {points:`${x},${y-s} ${x+k},${y-s/2} ${x},${y} ${x-k},${y-s/2}`, fill:c[0]}, g);
  el('polygon', {points:`${x-k},${y-s/2} ${x},${y} ${x},${y+s} ${x-k},${y+s/2}`, fill:c[1]}, g);
  el('polygon', {points:`${x},${y} ${x+k},${y-s/2} ${x+k},${y+s/2} ${x},${y+s}`, fill:c[2]}, g);
  return g;
}
function coin(p, r){
  const g = el('g', {}, p);
  el('circle', {r, fill:'#F2B705', stroke:'#fff', 'stroke-width':3}, g);
  const t = el('text', {'text-anchor':'middle', y:r * .36, 'font-family':'Bricolage Grotesque, sans-serif', 'font-weight':800, 'font-size':r * 1.1, fill:'#5A4300'}, g); t.textContent = '$';
  return g;
}
function move(g, d, dur, begin, still){
  if (RM){ g.setAttribute('transform', `translate(${still[0]} ${still[1]})`); return; }
  el('animateMotion', {path:d, dur:dur + 's', begin:(begin || 0) + 's', repeatCount:'indefinite'}, g);
}
function chain(svg, pts, s, cols, dur, hashes){
  const d = 'M' + pts.map(p => p.join(' ')).join(' L');
  el('path', {d, fill:'none', stroke:'rgba(4,51,47,.16)', 'stroke-width':8, 'stroke-linecap':'round', 'stroke-linejoin':'round'}, svg);
  el('path', {d, fill:'none', stroke:'#0FA37F', 'stroke-width':3, class:'flow', 'stroke-linecap':'round'}, svg);
  pts.forEach((p, i) => cube(svg, p[0], p[1], s, cols[i % cols.length], i * .45));
  if (hashes) pts.forEach((p, i) => {
    const x = p[0] - 39, y = p[1] - s - 34;
    const g = el('g', {class:'hash', style:`animation-delay:${i * .7}s`}, svg);
    el('rect', {x, y, width:78, height:24, rx:12, fill:'#fff', stroke:'rgba(4,51,47,.12)'}, g);
    const t = el('text', {x:x + 39, y:y + 16, 'text-anchor':'middle', 'font-family':'JetBrains Mono, monospace', 'font-size':11, 'font-weight':600, fill:'#04332F'}, g); t.textContent = hashes[i];
  });
  move(coin(svg, s * .34), d, dur, 0, pts[0]);
}
chain(document.getElementById('cr-chain'), [[100,95],[240,150],[370,215],[230,290],[110,345]], 44, [CUBE.em, CUBE.cy, CUBE.gd, CUBE.tl, CUBE.em], 7, ['0x9f3a…','0x1c7e…','0x4b20…','0xa81d…','0x77e5…']);
chain(document.getElementById('nc-chain'), [[50,70],[150,115],[250,75],[205,175],[90,185]], 30, [CUBE.em, CUBE.cy, CUBE.gd, CUBE.tl, CUBE.em], 5);
cube(document.getElementById('cr-bigcube'), 60, 55, 46, CUBE.gd, 0);

/* rieles: banco contra stablecoin */
(function(){
  const s = document.getElementById('cr-rails');
  const label = (x, y, txt, cls, anchor) => { const t = el('text', {x, y, class:cls || '', 'text-anchor':anchor || 'middle'}, s); t.textContent = txt; };
  const node = (x, y, ic, fill) => {
    el('circle', {cx:x, cy:y, r:22, fill, stroke:'rgba(255,255,255,.3)', 'stroke-width':2}, s);
    el('use', {href:'#' + ic, x:x - 11, y:y - 11, width:22, height:22, fill:'none', stroke:'#fff', 'stroke-width':2, 'stroke-linecap':'round', 'stroke-linejoin':'round'}, s);
  };
  label(20, 24, 'BANCO TRADICIONAL', 'ttl', 'start');
  label(20, 44, 'intermediarios · horario bancario', 'sub', 'start');
  el('path', {d:'M40 90 H380', stroke:'rgba(255,255,255,.2)', 'stroke-width':4, 'stroke-linecap':'round'}, s);
  [[40,'Tu banco'],[153,'Corresponsal'],[267,'Corresponsal'],[380,'Destino']].forEach(([x, l]) => { node(x, 90, 'i-bank', '#0A5C55'); label(x, 134, l); });
  const slow = el('circle', {cx:40, cy:90, r:7, fill:'#FF8A8A', stroke:'#fff', 'stroke-width':2}, s);
  if (!RM) el('animate', {attributeName:'cx', values:'40;40;153;153;267;267;380;380', keyTimes:'0;.12;.3;.42;.6;.72;.9;1', dur:'7s', repeatCount:'indefinite'}, slow);
  label(20, 180, 'STABLECOIN', 'ttl', 'start');
  label(20, 200, 'directo · 24/7', 'sub', 'start');
  el('path', {d:'M40 244 H380', stroke:'rgba(255,255,255,.2)', 'stroke-width':4, 'stroke-linecap':'round'}, s);
  el('path', {d:'M40 244 H380', stroke:'url(#gFlowC)', 'stroke-width':4, class:'flow', 'stroke-linecap':'round'}, s);
  [[40,'Tu wallet'],[380,'Destino']].forEach(([x, l]) => { node(x, 244, 'i-wallet', 'url(#gEm)'); label(x, 288, l); });
  move(coin(s, 11), 'M40 244 H380', 1.6, 0, [210, 244]);
})();

/* agentes */
(function(){
  const s = document.getElementById('cr-ag');
  const txt = (x, y, t, opts) => { const n = el('text', Object.assign({x, y, 'text-anchor':'middle', fill:'#fff', 'font-family':'Onest, sans-serif', 'font-size':13, 'font-weight':600}, opts || {}), s); n.textContent = t; };
  function bot(x, fill, name, role){
    const g = el('g', {class:'cube', style:`animation-delay:${x > 200 ? -2 : 0}s`}, s);
    el('line', {x1:x, y1:78, x2:x, y2:94, stroke:'#fff', 'stroke-width':3}, g);
    el('circle', {cx:x, cy:74, r:6, fill:'#F2B705'}, g);
    el('rect', {x:x - 44, y:94, width:88, height:70, rx:22, fill}, g);
    el('rect', {x:x - 30, y:110, width:60, height:30, rx:12, fill:'#04332F', 'fill-opacity':.55}, g);
    el('circle', {cx:x - 13, cy:125, r:6, fill:'#7FF0CF', class:'blink'}, g);
    el('circle', {cx:x + 13, cy:125, r:6, fill:'#7FF0CF', class:'blink'}, g);
    el('rect', {x:x - 12, y:150, width:24, height:5, rx:2.5, fill:'#fff', 'fill-opacity':.8}, g);
    txt(x, 190, name, {'font-size':14});
    txt(x, 207, role, {'font-family':'JetBrains Mono, monospace', 'font-size':10, 'font-weight':400, 'fill-opacity':.8});
  }
  const top = 'M128 108 Q220 26 312 108', bot2 = 'M312 158 Q220 236 128 158';
  el('path', {d:top, fill:'none', stroke:'#fff', 'stroke-opacity':.5, 'stroke-width':2, 'stroke-dasharray':'5 7'}, s);
  el('path', {d:bot2, fill:'none', stroke:'#fff', 'stroke-opacity':.5, 'stroke-width':2, 'stroke-dasharray':'5 7'}, s);
  bot(78, 'url(#gEm)', 'Agente A', 'contrata');
  bot(362, 'url(#gCy)', 'Agente B', 'vende un servicio');
  txt(220, 50, 'pago', {'font-family':'JetBrains Mono, monospace', 'font-size':11, fill:'#FFE58A'});
  txt(220, 232, 'servicio / datos', {'font-family':'JetBrains Mono, monospace', 'font-size':11, fill:'#9FE6FF'});
  const ring = el('circle', {cx:220, cy:132, r:36, fill:'none', stroke:'#FFE58A', 'stroke-width':2, 'stroke-dasharray':'4 6', class:'spin-g'}, s);
  el('circle', {cx:220, cy:132, r:26, fill:'#fff'}, s);
  el('use', {href:'#i-key', x:207, y:119, width:26, height:26, fill:'none', stroke:'#0A5C55', 'stroke-width':2.2, 'stroke-linecap':'round', 'stroke-linejoin':'round'}, s);
  txt(220, 186, 'identidad', {'font-family':'JetBrains Mono, monospace', 'font-size':10, 'font-weight':400});
  move(coin(s, 11), top, 3, 0, [220, 67]);
  const doc = el('g', {}, s);
  el('rect', {x:-10, y:-12, width:20, height:24, rx:3, fill:'#fff'}, doc);
  el('path', {d:'M-5 -5h10M-5 0h10M-5 5h6', stroke:'#1BA6D9', 'stroke-width':2, 'stroke-linecap':'round'}, doc);
  move(doc, bot2, 3, 1.5, [220, 197]);
})();

/* prueba de humanidad y origen */
(function(){
  const s = document.getElementById('cr-pr');
  el('rect', {x:50, y:26, width:160, height:208, rx:14, fill:'#fff'}, s);
  el('rect', {x:70, y:48, width:92, height:12, rx:6, fill:'#04332F', 'fill-opacity':.8}, s);
  [76, 90, 104, 118, 132].forEach((y, i) => el('rect', {x:70, y, width:[120,104,116,88,110][i], height:6, rx:3, fill:'rgba(4,51,47,.15)'}, s));
  el('rect', {x:70, y:150, width:120, height:40, rx:6, fill:'url(#gEm)', 'fill-opacity':.55}, s);
  const scan = el('rect', {x:56, y:34, width:148, height:6, rx:3, fill:'#0FA37F', 'fill-opacity':.7}, s);
  if (!RM) el('animate', {attributeName:'y', values:'34;222;34', dur:'3.2s', repeatCount:'indefinite'}, scan);
  const seal = el('g', {}, s);
  el('circle', {cx:200, cy:204, r:42, fill:'none', stroke:'#fff', 'stroke-width':2, 'stroke-dasharray':'4 6', class:'spin-g'}, seal);
  el('circle', {cx:200, cy:204, r:33, fill:'url(#gGd)', stroke:'#fff', 'stroke-width':4}, seal);
  const t1 = el('text', {x:200, y:202, 'text-anchor':'middle', 'font-family':'JetBrains Mono, monospace', 'font-size':10, 'font-weight':700, fill:'#5A4300'}, seal); t1.textContent = 'SELLO';
  const t2 = el('text', {x:200, y:215, 'text-anchor':'middle', 'font-family':'JetBrains Mono, monospace', 'font-size':9, fill:'#5A4300'}, seal); t2.textContent = 'de tiempo';
  el('circle', {cx:340, cy:106, r:66, fill:'#fff', 'fill-opacity':.18}, s);
  el('use', {href:'#i-finger', x:290, y:56, width:100, height:100, fill:'none', stroke:'#fff', 'stroke-width':1.4, 'stroke-linecap':'round', 'stroke-linejoin':'round', class:'nn-node'}, s);
  [['hecho por', 202], ['una persona', 222]].forEach(([t, y]) => { const n = el('text', {x:340, y, 'text-anchor':'middle', fill:'#fff', 'font-family':'Bricolage Grotesque, sans-serif', 'font-size':17, 'font-weight':800}, s); n.textContent = t; });
})();

/* moneda local contra stablecoin (ilustrativo) */
(function(){
  const s = document.getElementById('cr-co');
  [60, 110, 160, 210].forEach(y => el('line', {x1:40, y1:y, x2:410, y2:y, stroke:'#fff', 'stroke-opacity':.18}, s));
  const st = [], lo = [];
  for (let i = 0; i <= 18; i++){
    const x = 40 + i * 20;
    st.push(`${x} ${(78 + Math.sin(i * 1.3) * 2).toFixed(1)}`);
    lo.push(`${x} ${(78 + Math.pow(i / 18, 1.4) * 128 + ((i * 37) % 11 - 5) * 2.2).toFixed(1)}`);
  }
  const dS = 'M' + st.join(' L'), dL = 'M' + lo.join(' L');
  el('path', {d:dS, fill:'none', stroke:'#B6FFE6', 'stroke-width':4, 'stroke-linecap':'round', 'stroke-linejoin':'round'}, s);
  el('path', {d:dL, fill:'none', stroke:'#FFC1C1', 'stroke-width':4, 'stroke-linecap':'round', 'stroke-linejoin':'round'}, s);
  [[dS, '#B6FFE6', st], [dL, '#FFC1C1', lo]].forEach(([d, c, pts]) => {
    const dot = el('circle', {r:7, fill:c, stroke:'#fff', 'stroke-width':2.5}, s);
    move(dot, d, 6, 0, pts[pts.length - 1].split(' ').map(Number));
  });
  const lab = (x, y, t, fill, anchor) => { const n = el('text', {x, y, fill, 'text-anchor':anchor, 'font-family':'Onest, sans-serif', 'font-size':13, 'font-weight':700}, s); n.textContent = t; };
  lab(44, 56, 'stablecoin (USD)', '#B6FFE6', 'start');
  lab(250, 228, 'moneda local', '#FFC1C1', 'end');
  const ax = el('text', {x:410, y:246, 'text-anchor':'end', fill:'#fff', 'fill-opacity':.75, 'font-family':'JetBrains Mono, monospace', 'font-size':10}, s); ax.textContent = 'tiempo →';
  const ay = el('text', {x:40, y:24, fill:'#fff', 'fill-opacity':.75, 'font-family':'JetBrains Mono, monospace', 'font-size':10}, s); ay.textContent = 'poder de compra';
})();
