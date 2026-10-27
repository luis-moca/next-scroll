// The interactive funnel: clickable layers and falling particles.
import { RM, el } from './util.js';

/* funnel */
(function(){
  const S = [
    {t:'Retrieval', c:'billions → ~5,000', g:'gBlue', css:'var(--g-blue)', col:'#2F5BFF', ic:'i-search', y1:20, y2:110, a:190, b:150, h:'Generate candidates',
     what:'In milliseconds, it pulls a few thousand posts that might interest you out of everything that exists.',
     li:[['i-net','Two-tower models: one network produces your vector and another one produces a vector for each post.'],['i-search','Nearest-neighbor search (FAISS, ScaNN) across billions of vectors.'],['i-split','Several sources at once: people you follow, similar content, trends, fresh content.']], f:null},
    {t:'Ranking', c:'~5,000 → ~500', g:'gViolet', css:'var(--g-violet)', col:'#7C4DFF', ic:'i-sort', y1:120, y2:210, a:145, b:110, h:'Rank with a heavy model',
     what:'A large neural network estimates several probabilities for each candidate and blends them into a single value score.',
     li:[['i-target','It predicts likes, comments, shares, watch time and reports, all at once.'],['i-user','It uses hundreds of signals: your history, the creator, the context, the time of day.'],['i-chip','This is where most of the compute goes.']],
     f:'value = <span class="w">1.0</span> · <span class="p">P(watch to the end)</span>\n      + <span class="w">2.0</span> · <span class="p">P(share)</span>\n      + <span class="w">0.5</span> · <span class="p">P(like)</span>\n      − <span class="w">5.0</span> · <span class="p">P(report)</span>\n<span class="cm">// illustrative weights,\n// tuned with A/B tests</span>'},
    {t:'Re-ranking', c:'~500 → ~50', g:'gCoral', css:'var(--g-coral)', col:'#FF5B5B', ic:'i-shuffle', y1:220, y2:310, a:105, b:72, h:'Fix the final order',
     what:'It corrects what a purely score-based order would get wrong.',
     li:[['i-shuffle','Diversity: no five videos in a row from the same creator or topic.'],['i-eye','Integrity and moderation: sensitive content, freshness, business rules.'],['i-mega','It slots the ads into the right positions.']], f:null},
    {t:'Your feed', c:'→ 1 at a time', g:'gAmber', css:'var(--g-amber)', col:'#FFA51F', ic:'i-phone', y1:320, y2:400, a:67, b:40, h:'Serve and listen',
     what:'You see the result, and everything you do becomes data for the next loop.',
     li:[['i-hand','Every scroll, pause and replay is logged as a signal.'],['i-wave','Those signals stream back to the models within minutes.'],['i-clock','The whole loop takes about 100–200 ms.']], f:null}
  ];
  const svg = document.getElementById('fsvg'), panel = document.getElementById('panel');
  const defs = el('defs', {}, svg);
  const cp = el('clipPath', {id:'fclip'}, defs);
  S.forEach(s => el('path', {d:`M${200-s.a} ${s.y1} L${200+s.a} ${s.y1} L${200+s.b} ${s.y2} L${200-s.b} ${s.y2} Z`}, cp));
  const layers = S.map((s, i) => {
    const g = el('g', {class:'layer', role:'tab', tabindex: i === 1 ? 0 : -1, 'aria-label': s.t}, svg);
    el('path', {d:`M${200-s.a+6} ${s.y1} L${200+s.a-6} ${s.y1} Q${200+s.a} ${s.y1} ${200+s.a-3} ${s.y1+6} L${200+s.b+1} ${s.y2-6} Q${200+s.b-2} ${s.y2} ${200+s.b-8} ${s.y2} L${200-s.b+8} ${s.y2} Q${200-s.b+2} ${s.y2} ${200-s.b-1} ${s.y2-6} L${200-s.a+3} ${s.y1+6} Q${200-s.a} ${s.y1} ${200-s.a+6} ${s.y1} Z`, fill:`url(#${s.g})`}, g);
    const my = (s.y1 + s.y2) / 2;
    const t1 = el('text', {x:200, y:my - 2, 'text-anchor':'middle', fill:'#fff', 'font-family':'Bricolage Grotesque, sans-serif', 'font-weight':800, 'font-size': i === 3 ? 17 : 20}, g); t1.textContent = s.t;
    const t2 = el('text', {x:200, y:my + 17, 'text-anchor':'middle', fill:'#fff', 'fill-opacity':.85, 'font-family':'JetBrains Mono, monospace', 'font-size':11}, g); t2.textContent = s.c;
    g.addEventListener('click', () => sel(i));
    g.addEventListener('keydown', e => {
      if (['ArrowDown','ArrowRight'].includes(e.key)){ e.preventDefault(); sel((i+1)%4, true); }
      if (['ArrowUp','ArrowLeft'].includes(e.key)){ e.preventDefault(); sel((i+3)%4, true); }
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); sel(i); }
    });
    return g;
  });
  // phone at the bottom
  const ph = el('g', {transform:'translate(184 414)'}, svg);
  el('rect', {x:0, y:0, width:32, height:52, rx:8, fill:'#0A1A5C'}, ph);
  el('rect', {x:4, y:6, width:24, height:36, rx:3, fill:'url(#gAmber)'}, ph);
  // particles
  const pg = el('g', {'clip-path':'url(#fclip)', 'pointer-events':'none'}, svg);
  const pts = [[20,190],[110,150],[115,147],[120,145],[210,110],[215,107],[220,105],[310,72],[315,70],[320,67],[400,40]];
  const half = y => { for (let i = 1; i < pts.length; i++){ if (y <= pts[i][0]){ const [y0,h0] = pts[i-1], [y1,h1] = pts[i]; return h0 + (h1 - h0) * (y - y0) / (y1 - y0); } } return 40; };
  const P = Array.from({length:70}, () => mk(true));
  function mk(pre){ return {y: pre ? 20 + Math.random() * 370 : 14, u:(Math.random()*2-1)*.85, v:.7 + Math.random()*.9, k:Math.random(), c: el('circle', {r:2.6, fill:'#fff'}, pg)}; }
  function tick(){
    P.forEach((p, idx) => {
      const prev = p.y; p.y += p.v;
      for (const g of [115,215,315]) if (prev < g && p.y >= g && p.k < .4){ p.y = 999; }
      if (p.y > 400){ p.c.remove(); P[idx] = mk(false); return; }
      p.c.setAttribute('cx', 200 + p.u * half(p.y)); p.c.setAttribute('cy', p.y);
      p.c.setAttribute('fill-opacity', .55 + .45 * (p.y / 400));
    });
    if (!RM) requestAnimationFrame(tick);
  }
  tick();
  function sel(i, focus){
    svg.classList.add('has');
    layers.forEach((g, j) => { g.classList.toggle('on', j === i); g.setAttribute('aria-selected', j === i); g.setAttribute('tabindex', j === i ? 0 : -1); });
    if (focus) layers[i].focus();
    const s = S[i];
    panel.style.setProperty('--c', s.col);
    panel.innerHTML = `<div class="fade" style="display:grid;gap:18px;position:relative">
      <div class="head"><span class="tile" style="background:${s.css}"><svg class="ic"><use href="#${s.ic}"/></svg></span><div><div class="eb">Stage ${i+1} of 4 · ${s.c}</div><h3>${s.h}</h3></div></div>
      <p class="muted">${s.what}</p>
      <ul>${s.li.map(([ic, x]) => `<li><svg class="ic"><use href="#${ic}"/></svg><span>${x}</span></li>`).join('')}</ul>
      ${s.f ? `<div class="formula">${s.f}</div>` : ''}
      <div class="tabs">${S.map((x, j) => `<button class="tab" role="tab" aria-selected="${j===i}" data-j="${j}"><svg class="ic"><use href="#${x.ic}"/></svg>${x.t}</button>`).join('')}</div>
    </div>`;
    panel.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => sel(+b.dataset.j)));
  }
  sel(1);
})();
