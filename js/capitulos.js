// Cambio entre capítulos con la cortina de color.
import { RM } from './util.js';
import { onScroll, initReveal } from './scroll.js';

/* cambio de capítulo */
(function(){
  const pages = {feed:document.getElementById('pg-feed'), cripto:document.getElementById('pg-cripto')};
  const wipe = document.getElementById('wipe');
  const TXT = {feed:['Capítulo 1','Cómo piensa tu feed'], cripto:['Capítulo 2','Blockchain después del hype']};
  let chapter = 'feed', busy = false;
  function show(c){
    Object.keys(pages).forEach(k => pages[k].hidden = k !== c);
    document.documentElement.dataset.chapter = c;
    document.getElementById('chap-feed').classList.toggle('on', c === 'feed');
    document.getElementById('chap-cripto').classList.toggle('on', c === 'cripto');
    chapter = c;
    const h = document.documentElement, prev = h.style.scrollBehavior;
    h.style.scrollBehavior = 'auto'; scrollTo(0, 0); h.style.scrollBehavior = prev;
    initReveal(pages[c]); onScroll();
  }
  function go(c){
    if (busy) return;
    if (c === chapter){ scrollTo({top:0, behavior: RM ? 'auto' : 'smooth'}); return; }
    if (RM){ show(c); return; }
    busy = true;
    document.getElementById('wipe-k').textContent = TXT[c][0];
    document.getElementById('wipe-t').textContent = TXT[c][1];
    wipe.classList.toggle('to-feed', c === 'feed');
    wipe.classList.remove('go'); void wipe.offsetWidth; wipe.classList.add('go');
    setTimeout(() => show(c), 520);
    setTimeout(() => { busy = false; }, 1150);
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-go]');
    if (!b) return;
    e.preventDefault(); go(b.dataset.go);
  });
  if (location.hash === '#cripto'){
    document.documentElement.classList.add('instant');
    show('cripto');
    requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('instant')));
  }
  addEventListener('hashchange', () => { if (location.hash === '#cripto') go('cripto'); });
})();
