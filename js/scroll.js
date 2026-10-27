// Todo lo que reacciona al scroll: barra de progreso, línea de tiempo, nav activa y aparición de secciones.
import { RM } from './util.js';

/* scroll: progreso, timeline, nav activa */
const prog = document.getElementById('progress');
const tl = document.getElementById('tl'), tlLine = tl.querySelector('.tl-line');
const eras = [...tl.querySelectorAll('.era')];
const links = [...document.querySelectorAll('.nav a.lnk')];
const secs = links.map(a => document.querySelector(a.getAttribute('href')));
export function onScroll(){
  const max = document.documentElement.scrollHeight - innerHeight;
  prog.style.setProperty('--p', max > 0 ? Math.min(1, scrollY / max) : 0);
  const r = tl.getBoundingClientRect(), mid = innerHeight * .55;
  tlLine.style.setProperty('--fill', Math.max(0, Math.min(1, (mid - r.top) / r.height)));
  eras.forEach(e => e.classList.toggle('lit', e.getBoundingClientRect().top + e.offsetHeight / 2 < mid + 80));
  let cur = -1;
  secs.forEach((s, i) => { if (s && links[i].offsetParent && s.getBoundingClientRect().top < 140) cur = i; });
  links.forEach((a, i) => a.classList.toggle('on', i === cur));
}
addEventListener('scroll', onScroll, {passive:true});
addEventListener('resize', onScroll);
onScroll();

/* reveal: solo lo que está debajo del primer frame */
export function initReveal(root){
  if (RM || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting){ e.target.classList.remove('pre'); io.unobserve(e.target); }
  }), {rootMargin:'0px 0px -6% 0px'});
  root.querySelectorAll('.rv').forEach((n, i) => {
    if (n.getBoundingClientRect().top > innerHeight){ n.classList.add('pre'); n.style.transitionDelay = ((i % 4) * 70) + 'ms'; io.observe(n); }
  });
}
initReveal(document.getElementById('pg-feed'));

/* brillo que sigue al cursor */
document.querySelectorAll('.glow').forEach(c => c.addEventListener('pointermove', e => {
  const r = c.getBoundingClientRect();
  c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px');
}));
