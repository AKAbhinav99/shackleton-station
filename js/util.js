/* Shackleton Station — shared helpers */
(function(){
'use strict';
const SS = window.SS = window.SS || {};

SS.DEG = Math.PI / 180;
SS.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
SS.lerp = (a, b, t) => a + (b - a) * t;
SS.smooth = (a, b, x) => { const t = SS.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
SS.dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
SS.angDiff = (a, b) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
SS.damp = (a, b, lambda, dt) => SS.lerp(a, b, 1 - Math.exp(-lambda * dt));

/* seeded RNG (mulberry32) */
SS.rng = function(seed){
  let s = seed >>> 0;
  return function(){
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
};

/* 2D gradient noise */
const P = new Uint8Array(512);
(function(){
  const r = SS.rng(7331);
  const p = []; for (let i = 0; i < 256; i++) p.push(i);
  for (let i = 255; i > 0; i--){ const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
})();
const GX = [1,-1,1,-1,1,-1,0,0], GY = [1,1,-1,-1,0,0,1,-1];
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
SS.noise = function(x, y){
  const X = Math.floor(x), Y = Math.floor(y);
  const xf = x - X, yf = y - Y;
  const xi = X & 255, yi = Y & 255;
  const h00 = P[P[xi] + yi] & 7, h10 = P[P[xi + 1] + yi] & 7;
  const h01 = P[P[xi] + yi + 1] & 7, h11 = P[P[xi + 1] + yi + 1] & 7;
  const n00 = GX[h00] * xf + GY[h00] * yf;
  const n10 = GX[h10] * (xf - 1) + GY[h10] * yf;
  const n01 = GX[h01] * xf + GY[h01] * (yf - 1);
  const n11 = GX[h11] * (xf - 1) + GY[h11] * (yf - 1);
  const u = fade(xf), v = fade(yf);
  const a = n00 + (n10 - n00) * u, b = n01 + (n11 - n01) * u;
  return (a + (b - a) * v) * 1.35;
};
SS.fbm = function(x, y, oct){
  let s = 0, a = 1, f = 1, n = 0;
  for (let i = 0; i < oct; i++){ s += SS.noise(x * f, y * f) * a; n += a; a *= 0.5; f *= 2.03; }
  return s / n;
};

/* float -> IEEE half, for HalfFloat data textures */
SS.toHalf = (function(){
  const f = new Float32Array(1), i = new Int32Array(f.buffer);
  return function(v){
    f[0] = v;
    const x = i[0];
    let bits = (x >> 16) & 0x8000;
    let m = (x >> 12) & 0x07ff;
    const e = (x >> 23) & 0xff;
    if (e < 103) return bits;
    if (e > 142){ bits |= 0x7c00; bits |= ((e === 255) ? 0 : 1) && (x & 0x007fffff); return bits; }
    if (e < 113){ m |= 0x0800; bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1); return bits; }
    bits |= ((e - 112) << 10) | (m >> 1);
    bits += m & 1;
    return bits;
  };
})();

/* time formatting */
SS.fmtMin = function(min){                       // "3:47" hours:minutes
  min = Math.max(0, min);
  const h = Math.floor(min / 60), m = Math.floor(min % 60);
  return h + ':' + String(m).padStart(2, '0');
};
SS.fmtMET = function(sol, min){                  // "MET 004/13:22"
  const h = Math.floor(min / 60) % 24, m = Math.floor(min % 60);
  return 'MET ' + String(sol).padStart(3, '0') + '/' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
};

/* tiny event bus */
const handlers = {};
SS.on = (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); return () => { handlers[ev] = handlers[ev].filter(f => f !== fn); }; };
SS.emit = (ev, data) => { (handlers[ev] || []).slice().forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); };

/* storage, always guarded */
SS.store = {
  get(k, d){ try { const v = localStorage.getItem('ss.' + k); return v === null ? d : JSON.parse(v); } catch (e){ return d; } },
  set(k, v){ try { localStorage.setItem('ss.' + k, JSON.stringify(v)); } catch (e){} }
};

/* game clock (advances only when unpaused) */
SS.clock = { game: 0, real: 0, ui: 0 };

/* canvas helper */
SS.canvas = function(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
})();
