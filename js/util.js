// Herramientas compartidas: preferencia de movimiento y un atajo para crear elementos SVG.

document.documentElement.classList.add('js');
export const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const NS = 'http://www.w3.org/2000/svg';
export const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
