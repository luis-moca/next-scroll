// TikTok-style simulator: signals, taste profile and exploration.
import { RM } from './util.js';
import { PIC, T } from './data.js';

/* simulator */
(function(){
  const n = T.length;
  let w = new Array(n).fill(0), cur = 1, sig = 0, explored = false, log = [];
  const elW = document.getElementById('bars-w'), elP = document.getElementById('bars-p');
  const phone = document.getElementById('phone'), eps = document.getElementById('eps');
  const mk = (box) => T.map(t => { const r = document.createElement('div'); r.className = 'bar'; r.innerHTML = `<span class="dt" style="background:${t.h}"></span><span>${t.k}</span><span class="tr"><span class="fl"></span></span><span class="v"></span>`; box.appendChild(r); return r; });
  const rW = mk(elW), rP = mk(elP);
  const soft = () => { const m = Math.max(...w), ex = w.map(x => Math.exp((x - m) / 1.2)), s = ex.reduce((a,b)=>a+b,0); return ex.map(x => x / s); };
  const probs = () => { const e = eps.value / 100; return soft().map(p => (1 - e) * p + e / n); };
  function render(){
    const p = probs(), mx = Math.max(4, ...w.map(Math.abs));
    rW.forEach((r, i) => {
      const fl = r.querySelector('.fl');
      fl.style.width = (Math.abs(w[i]) / mx * 100) + '%';
      fl.style.background = w[i] < 0 ? '#9AA3C4' : T[i].h;
      r.querySelector('.v').textContent = (w[i] >= 0 ? '+' : '') + w[i].toFixed(1);
    });
    rP.forEach((r, i) => {
      const fl = r.querySelector('.fl');
      fl.style.width = (p[i] * 100) + '%'; fl.style.background = T[i].h;
      r.querySelector('.v').textContent = Math.round(p[i] * 100) + '%';
    });
    document.getElementById('eps-v').textContent = eps.value + '%';
    document.getElementById('sig-n').textContent = sig;
  }
  function show(){
    const t = T[cur];
    phone.style.setProperty('--hue', t.h);
    document.getElementById('ppic').innerHTML = PIC[t.p];
    document.getElementById('ptopic').textContent = t.k + ' · ' + t.who;
    document.getElementById('pcap').textContent = t.caps[Math.floor(Math.random() * t.caps.length)];
    document.getElementById('badge').hidden = !explored;
    if (!RM){ phone.classList.remove('swap'); void phone.offsetWidth; phone.classList.add('swap'); }
  }
  function next(){
    if (Math.random() < eps.value / 100){ cur = Math.floor(Math.random() * n); explored = true; }
    else { const p = soft(); let r = Math.random(); cur = n - 1; for (let i = 0; i < n; i++){ r -= p[i]; if (r <= 0){ cur = i; break; } } explored = false; }
    show();
  }
  document.querySelectorAll('#sim .btn').forEach(b => b.addEventListener('click', () => {
    const r = parseFloat(b.dataset.r);
    w = w.map((x, i) => i === cur ? Math.max(-4, Math.min(8, x + r)) : x * .97);
    sig++;
    log.unshift(`<span>#${sig} <b>${T[cur].k}</b> · ${b.dataset.l} (${r > 0 ? '+' : ''}${r})</span>`);
    log = log.slice(0, 6);
    document.getElementById('log').innerHTML = log.join('');
    next(); render();
  }));
  eps.addEventListener('input', render);
  document.getElementById('reset').addEventListener('click', () => {
    w = new Array(n).fill(0); sig = 0; log = [];
    document.getElementById('log').innerHTML = '<span>Tap a button to send your first signal.</span>';
    cur = 1; explored = false; show(); render();
  });
  show(); render();
})();
