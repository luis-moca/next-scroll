// Datos del capítulo 1: temas del simulador y sus pictogramas.

/* pictogramas de temas */
export const PIC = {
  ball:'<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="22"/><path d="M32 21l9 6.5-3.4 10.5H26.4L23 27.5z"/><path d="M32 10v11M41 27.5l11-4M37.6 38l6.6 9.5M26.4 38l-6.6 9.5M23 27.5l-11-4"/></svg>',
  taco:'<svg viewBox="0 0 64 64"><path d="M6 46a26 26 0 0 1 52 0z"/><path d="M12 38c4-5 8-2 11-7 3 5 6 1 9-3 3 5 7 4 10 0 3 4 6 5 10 10"/><circle cx="24" cy="40" r="2"/><circle cx="38" cy="38" r="2"/></svg>',
  car:'<svg viewBox="0 0 64 64"><path d="M6 42v-9l7-11h30l9 11h6v9z"/><circle cx="18" cy="44" r="5"/><circle cx="46" cy="44" r="5"/><path d="M15 31h37M30 22v9"/></svg>',
  music:'<svg viewBox="0 0 64 64"><path d="M24 46V16l26-7v30"/><circle cx="18" cy="46" r="6"/><circle cx="44" cy="40" r="6"/><path d="M24 24l26-7"/></svg>',
  tech:'<svg viewBox="0 0 64 64"><rect x="12" y="14" width="40" height="27" rx="3"/><path d="M5 49h54l-4-8H9z"/><path d="M27 23l-5 4.5 5 4.5M37 23l5 4.5-5 4.5"/></svg>',
  meme:'<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="22"/><path d="M21 27l4-3.5 4 3.5M35 27l4-3.5 4 3.5"/><path d="M20 35h24a12 12 0 0 1-24 0z"/></svg>'
};
export const T = [
  {k:'Fútbol', p:'ball', h:'linear-gradient(160deg,#12B48C,#0B6E8F)', c:'#12B48C', caps:['Gol de chilena en el último minuto','Las mejores atajadas de la jornada','Así se vive el Clásico desde la tribuna'], who:'@golazo.mx'},
  {k:'Cocina', p:'taco', h:'linear-gradient(160deg,#FF8A3D,#E2332F)', c:'#FF6A3D', caps:['Tacos al pastor en sartén, sin trompo','Salsa macha en 5 minutos','Pozole rojo como el de la abuela'], who:'@cocinaconlupita'},
  {k:'Autos', p:'car', h:'linear-gradient(160deg,#2F5BFF,#0A1A5C)', c:'#2F5BFF', caps:['Prueba de manejo: SUV híbrida en carretera','¿Vale la pena un eléctrico en CDMX?','Off-road en el Nevado de Toluca'], who:'@motor.lab'},
  {k:'Música', p:'music', h:'linear-gradient(160deg,#7C4DFF,#FF4FA0)', c:'#7C4DFF', caps:['Cover acústico en el metro','Así se produce un beat de corridos','Concierto sorpresa en la azotea'], who:'@sesiones.vivo'},
  {k:'Tech', p:'tech', h:'linear-gradient(160deg,#1FA7E0,#2F2A9E)', c:'#1FA7E0', caps:['Armé una PC por 15 mil pesos','Tres atajos de teclado que no conocías','Probé el celular plegable una semana'], who:'@byte.mx'},
  {k:'Memes', p:'meme', h:'linear-gradient(160deg,#FFC94A,#FF8A3D)', c:'#FFA51F', caps:['Cuando tu jefe dice "una juntita rápida"','Mi perro cuando oye la bolsa de croquetas','Yo explicando por qué llegué tarde'], who:'@puro.meme'}
];
