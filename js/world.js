/* Shackleton Station — world: terrain, south-pole lighting, sky, decals, dust.

   Lighting model
   --------------
   At the pole the sun never climbs more than a few degrees, so terrain shadows run for hundreds of
   metres. We bake, for every terrain grid point, the height a point would need to be raised to see
   the sun (horizon march along the sun azimuth). That map lives in a half-float texture and every
   lit material samples it in the fragment shader, so ridges shadow the flats, the crater floor stays
   dark, and a rover parked in the crater is dark too. Terrain also uses a lunar-Lambert photometric
   function, which is why grazing-lit regolith is brighter than a Lambertian surface would be. */
(function(){
'use strict';
const SS = window.SS;
const W = SS.world = {};

const SIZE = W.SIZE = 960, SEG = W.SEG = 384, N = W.N = SEG + 1, STEP = W.STEP = SIZE / SEG, HALF = W.HALF = SIZE / 2;
const heights = W.heights = new Float32Array(N * N);

/* ------------------------------------------------------------------ site plan */
const ridgeZ = x => -150 + 12 * Math.sin(x * 0.009);
const CR = { x: 300, z: 300, r: 200 };
const M = SS.MAP = {
  lander:  { x: 0, z: 0 },
  ladder:  { x: 0, z: 6.6 },
  hab:     { x: 40, z: 30 },
  habLock: { x: 49.4, z: 30 },
  pdu:     { x: 36, z: 36.8 },
  rover:   { x: 16, z: 13 },
  cargo:   { x: -34, z: -24 },
  yard:    { x: -6, z: -62 },
  st1:     { x: -44, z: 60 },
  st2:     { x: -165, z: ridgeZ(-165) + 10 },
  crater:  CR,
  reactorHint: { x: -150, z: 140 },
  greenhouse: { x: 40, z: 44 },
  shelter: { x: 28, z: 22 },
  sites: [
    { id: 'R-A', kind: 'ridge', x: -80, z: ridgeZ(-80), label: 'Ridge A' },
    { id: 'R-B', kind: 'ridge', x: 8,   z: ridgeZ(8),   label: 'Ridge B' },
    { id: 'R-C', kind: 'ridge', x: 92,  z: ridgeZ(92),  label: 'Ridge C' },
    { id: 'F-1', kind: 'flat',  x: -74, z: 6,           label: 'Flats 1' },
    { id: 'F-2', kind: 'flat',  x: 80,  z: -30,         label: 'Flats 2' }
  ],
  ridgeZ
};
(function(){
  const dx = M.hab.x - CR.x, dz = M.hab.z - CR.z, L = Math.hypot(dx, dz);
  M.isru = { x: CR.x + dx / L * (CR.r - 15), z: CR.z + dz / L * (CR.r - 15) };
  M.rim  = { x: CR.x + dx / L * (CR.r + 6),  z: CR.z + dz / L * (CR.r + 6) };
})();

const KEY_POINTS = () => [M.lander, M.hab, M.rover, M.cargo, M.yard, M.st1, M.st2, M.isru, M.rim, M.pdu, M.greenhouse, M.shelter, M.reactorHint].concat(M.sites);
const CORRIDORS = () => {
  const c = [[M.hab, M.cargo], [M.lander, M.st1], [M.hab, M.isru], [M.hab, M.st2], [M.hab, M.yard], [M.cargo, M.yard], [M.hab, M.lander]];
  M.sites.forEach(s => { c.push([M.cargo, s]); c.push([M.hab, s]); c.push([M.yard, s]); });
  return c;
};
function segDist(px, pz, a, b){
  const vx = b.x - a.x, vz = b.z - a.z;
  const t = SS.clamp(((px - a.x) * vx + (pz - a.z) * vz) / (vx * vx + vz * vz), 0, 1);
  return Math.hypot(px - (a.x + vx * t), pz - (a.z + vz * t));
}
W.nearCorridor = function(x, z, d){
  const cs = CORRIDORS();
  for (const c of cs) if (segDist(x, z, c[0], c[1]) < d) return true;
  return false;
};

/* ------------------------------------------------------------------ height field */
const craters = W.craters = [];
function baseH(x, z){
  const base = SS.smooth(70, 230, Math.hypot(x - 20, z - 18));
  let h = SS.fbm(x * 0.0042 + 11.3, z * 0.0042 - 4.1, 5) * 7.5 * (0.22 + 0.78 * base);
  h += SS.fbm(x * 0.021 + 3, z * 0.021 + 9, 3) * 0.9 * (0.4 + 0.6 * base);
  const dz = z - ridgeZ(x);
  h += 24 * Math.exp(-(dz * dz) / (2 * 52 * 52)) * (0.86 + 0.14 * SS.noise(x * 0.012, 3.3));
  if (z < ridgeZ(x)) h -= Math.min(18, (ridgeZ(x) - z) * 0.05);
  const d = Math.hypot(x - CR.x, z - CR.z);
  if (d < CR.r) h -= 50 * Math.pow(1 - (d / CR.r) * (d / CR.r), 1.5);
  h += 5 * Math.exp(-Math.pow((d - CR.r) / 40, 2));
  return h;
}
function craterH(x, z){
  let h = 0;
  for (let k = 0; k < craters.length; k++){
    const c = craters[k];
    const dx = x - c.x, dz = z - c.z;
    const lim = c.R * 2.5;
    if (dx > lim || dx < -lim || dz > lim || dz < -lim) continue;
    const r = Math.sqrt(dx * dx + dz * dz) / c.R;
    if (r < 1) h += -c.d + (c.d + c.rim) * r * r;
    else if (r < 2.5) h += c.rim * (Math.pow(r, -3) - 0.064) / 0.936;
  }
  return h;
}
function placeCraters(){
  const r = SS.rng(4242);
  const keys = KEY_POINTS();
  const tryAdd = (x, z, R) => {
    if (Math.hypot(x - CR.x, z - CR.z) < CR.r + R) return;
    for (const k of keys) if (Math.hypot(x - k.x, z - k.z) < R * 1.6 + 16) return;
    if (W.nearCorridor(x, z, R * 1.4 + 5)) return;
    for (const c of craters) if (Math.hypot(x - c.x, z - c.z) < (R + c.R) * 0.9) return;
    craters.push({ x, z, R, d: R * 0.34, rim: R * 0.075, young: r() < 0.08 });
  };
  for (let i = 0; i < 26; i++) tryAdd(r() * 900 - 450, r() * 900 - 450, 22 + r() * 34);
  for (let i = 0; i < 260; i++) tryAdd(r() * 920 - 460, r() * 920 - 460, 2.5 + Math.pow(r(), 2.4) * 20);
}
const FLAT = () => [
  { x: M.lander.x, z: M.lander.z, r0: 11, r1: 20 },
  { x: M.hab.x, z: M.hab.z, r0: 12, r1: 20 },
  { x: M.cargo.x, z: M.cargo.z, r0: 7, r1: 13 },
  { x: M.yard.x, z: M.yard.z, r0: 6, r1: 12 },
  { x: M.rover.x, z: M.rover.z, r0: 4, r1: 9 },
  { x: M.st1.x, z: M.st1.z, r0: 4, r1: 9 },
  { x: M.greenhouse.x, z: M.greenhouse.z, r0: 5, r1: 10 },
  { x: M.shelter.x, z: M.shelter.z, r0: 4, r1: 8 }
].concat(M.sites.map(s => ({ x: s.x, z: s.z, r0: 5, r1: 11 })));

function sampleRaw(x, z){ return baseH(x, z) + craterH(x, z); }

W.build = function(){
  placeCraters();
  const flats = FLAT().map(f => Object.assign({ h: sampleRaw(f.x, f.z) }, f));
  for (let j = 0; j < N; j++){
    const z = -HALF + j * STEP;
    for (let i = 0; i < N; i++){
      const x = -HALF + i * STEP;
      let h = sampleRaw(x, z);
      for (const f of flats){
        const d = Math.hypot(x - f.x, z - f.z);
        if (d < f.r1){ const s = SS.smooth(f.r0, f.r1, d); h = f.h * (1 - s) + h * s; }
      }
      heights[j * N + i] = h;
    }
  }
};

W.H = function(x, z){
  let fx = (x + HALF) / STEP, fz = (z + HALF) / STEP;
  fx = fx < 0 ? 0 : fx > SEG - 0.0001 ? SEG - 0.0001 : fx;
  fz = fz < 0 ? 0 : fz > SEG - 0.0001 ? SEG - 0.0001 : fz;
  const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * N + i;
  const a = heights[k], b = heights[k + 1], c = heights[k + N], d = heights[k + N + 1];
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
};
W.grad = function(x, z){
  const e = 1.2;
  return { x: (W.H(x + e, z) - W.H(x - e, z)) / (2 * e), z: (W.H(x, z + e) - W.H(x, z - e)) / (2 * e) };
};
W.normal = function(x, z){
  const g = W.grad(x, z);
  const v = new THREE.Vector3(-g.x, 1, -g.z);
  return v.normalize();
};
W.isPSR = (x, z) => Math.hypot(x - CR.x, z - CR.z) < CR.r * 0.94;
W.inBounds = (x, z) => Math.abs(x) < HALF - 6 && Math.abs(z) < HALF - 6;

/* ------------------------------------------------------------------ periodic noise for tiling textures */
function pnoise(x, y, per){
  const X = Math.floor(x), Y = Math.floor(y);
  const xf = x - X, yf = y - Y;
  const w = (a) => ((a % per) + per) % per;
  const h = (a, b) => Math.abs(Math.sin(w(a) * 127.1 + w(b) * 311.7) * 43758.5453) % 1;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h(X, Y), b = h(X + 1, Y), c = h(X, Y + 1), d = h(X + 1, Y + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
function regolithTextures(){
  const S = 512;
  const hgt = new Float32Array(S * S);
  const r = SS.rng(99);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++){
    let v = pnoise(x / 64, y / 64, 8) * 0.5 + pnoise(x / 24, y / 24, 21.333) * 0.3 + pnoise(x / 8, y / 8, 64) * 0.22;
    v += (r() - 0.5) * 0.35;
    hgt[y * S + x] = v;
  }
  for (let k = 0; k < 36; k++){                              // micro-craters and clods
    const cx = r() * S, cy = r() * S, rad = 3 + r() * 12, pit = r() < 0.65;
    for (let dy = -rad * 1.4; dy <= rad * 1.4; dy++) for (let dx = -rad * 1.4; dx <= rad * 1.4; dx++){
      const d = Math.hypot(dx, dy) / rad;
      const x = ((Math.round(cx + dx) % S) + S) % S, y = ((Math.round(cy + dy) % S) + S) % S;
      if (pit){ if (d < 1) hgt[y * S + x] -= (1 - d * d) * 0.45; else if (d < 1.4) hgt[y * S + x] += (1.4 - d) * 0.3; }
      else if (d < 1) hgt[y * S + x] += (1 - d) * 0.4;
    }
  }
  const cA = SS.canvas(S, S), gA = cA.getContext('2d'), iA = gA.createImageData(S, S);
  const cN = SS.canvas(S, S), gN = cN.getContext('2d'), iN = gN.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++){
    const k = y * S + x;
    const hx = hgt[y * S + ((x + 1) % S)] - hgt[y * S + ((x - 1 + S) % S)];
    const hy = hgt[((y + 1) % S) * S + x] - hgt[((y - 1 + S) % S) * S + x];
    const nx = -hx * 1.6, ny = -hy * 1.6, nz = 1, l = Math.hypot(nx, ny, nz);
    iN.data[k * 4] = (nx / l * 0.5 + 0.5) * 255;
    iN.data[k * 4 + 1] = (ny / l * 0.5 + 0.5) * 255;
    iN.data[k * 4 + 2] = (nz / l * 0.5 + 0.5) * 255;
    iN.data[k * 4 + 3] = 255;
    let a = 132 + hgt[k] * 14 + (r() - 0.5) * 18;
    const s = r();
    if (s < 0.003) a += 45; else if (s < 0.01) a -= 30;
    iA.data[k * 4] = SS.clamp(a * 1.02, 0, 255);
    iA.data[k * 4 + 1] = SS.clamp(a, 0, 255);
    iA.data[k * 4 + 2] = SS.clamp(a * 0.965, 0, 255);
    iA.data[k * 4 + 3] = 255;
  }
  gA.putImageData(iA, 0, 0); gN.putImageData(iN, 0, 0);
  const map = new THREE.CanvasTexture(cA), nrm = new THREE.CanvasTexture(cN);
  [map, nrm].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
  map.encoding = THREE.sRGBEncoding;
  return { map, nrm };
}

/* ------------------------------------------------------------------ materials with sun visibility */
const SUNVIS = { value: null };
const SUNVIS_X = { value: new THREE.Vector4(HALF, 1 / STEP, 1 / N, 0) };
const SUNVIS_FN = `
varying vec3 vWPos;
uniform sampler2D uSunVis;
uniform vec4 uSunVisX;
float ssSunVisAt(vec3 p){
  vec2 g = (p.xz + uSunVisX.x) * uSunVisX.y;
  vec2 uv = (g + 0.5) * uSunVisX.z;
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return 1.0;
  vec4 t = texture2D(uSunVis, uv);
  float soft = 0.18 + t.b * 0.0087;
  return smoothstep(t.g - soft, t.g + soft, p.y - t.r);
}
`;
let LIGHTS_CHUNK = null, LUNAR_CHUNK = null;
function buildChunks(){
  let lc = THREE.ShaderChunk.lights_fragment_begin;
  const reDir = /(directionalLight\s*=\s*directionalLights\[\s*i\s*\];\s*get\w+\(\s*directionalLight\s*,\s*geometry\s*,\s*directLight\s*\);)/;
  if (reDir.test(lc)) lc = lc.replace(reDir, '$1\n\t\tdirectLight.color *= ssSunVis;');
  else console.warn('[SS] sun visibility patch not applied');
  lc = lc.replace(/(irradiance\s*\+=\s*getHemisphereLightIrradiance\(\s*hemisphereLights\[\s*i\s*\]\s*,\s*geometry\s*\));/,
                  '$1 * mix(0.45, 1.0, ssSunVis);');
  LIGHTS_CHUNK = 'float ssSunVis = ssSunVisAt(vWPos);\n' + lc;
  let pc = THREE.ShaderChunk.lights_physical_pars_fragment;
  const reL = /vec3 irradiance = dotNL \* directLight\.color;/;
  if (reL.test(pc)) pc = pc.replace(reL,
    'float ssNV = saturate( dot( geometry.normal, geometry.viewDir ) );\n' +
    '\tfloat ssLS = dotNL > 0.0 ? ( 1.0 * dotNL / ( dotNL + ssNV + 0.1 ) + 0.5 * dotNL ) : 0.0;\n' +
    '\tvec3 irradiance = ssLS * directLight.color;');
  else console.warn('[SS] lunar photometry patch not applied');
  pc = pc.replace('reflectedLight.directSpecular += ( 1.0 - clearcoatDHR ) * irradiance * BRDF_Specular_GGX(', 'reflectedLight.directSpecular += 0.05 * ( 1.0 - clearcoatDHR ) * irradiance * BRDF_Specular_GGX(');
  LUNAR_CHUNK = pc;
}
W.mkMat = function(params, opts){
  opts = opts || {};
  if (!LIGHTS_CHUNK) buildChunks();
  const m = new THREE.MeshStandardMaterial(params);
  const lunar = !!opts.lunar;
  m.onBeforeCompile = function(shader){
    shader.uniforms.uSunVis = SUNVIS;
    shader.uniforms.uSunVisX = SUNVIS_X;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n' +
        '\tvec4 ssWp = vec4( transformed, 1.0 );\n' +
        '\t#ifdef USE_INSTANCING\n\tssWp = instanceMatrix * ssWp;\n\t#endif\n' +
        '\tvWPos = ( modelMatrix * ssWp ).xyz;');
    let f = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + SUNVIS_FN);
    f = f.replace('#include <lights_fragment_begin>', LIGHTS_CHUNK);
    if (lunar) f = f.replace('#include <lights_physical_pars_fragment>', LUNAR_CHUNK);
    shader.fragmentShader = f;
  };
  m.customProgramCacheKey = () => lunar ? 'ss-lunar' : 'ss-std';
  return m;
};

/* ------------------------------------------------------------------ sun visibility bake */
const needArr = new Float32Array(N * N), occArr = new Float32Array(N * N);
let visData = null, visTex = null;
W.sun = { az: 200, el: 3, dir: new THREE.Vector3(), night: false };
function hNear(x, z){
  const i = Math.round((x + HALF) / STEP), j = Math.round((z + HALF) / STEP);
  if (i < 0 || j < 0 || i >= N || j >= N) return -1e9;
  return heights[j * N + i];
}
W.bakeSun = function(azDeg, elDeg){
  const az = azDeg * SS.DEG, el = elDeg * SS.DEG;
  const sx = Math.sin(az), sz = -Math.cos(az), tanEl = Math.tan(el);
  let hmax = -1e9; for (let k = 0; k < heights.length; k++) if (heights[k] > hmax) hmax = heights[k];
  for (let j = 0; j < N; j++){
    const z0 = -HALF + j * STEP;
    for (let i = 0; i < N; i++){
      const k = j * N + i, x0 = -HALF + i * STEP, h0 = heights[k];
      let need = -60, occ = 0, d = STEP;
      while (d < 1000){
        const line = h0 + d * tanEl;
        if (line > hmax + 2) break;
        const th = hNear(x0 + sx * d, z0 + sz * d);
        if (th < -1e8) break;
        const e = th - line;
        if (e > need){ need = e; occ = d; if (need > 40) break; }
        d += d < 80 ? STEP : d < 260 ? STEP * 2 : STEP * 4;
      }
      if (Math.hypot(x0 - CR.x, z0 - CR.z) < CR.r * 0.94){ need = Math.max(need, 30); occ = Math.max(occ, 40); }
      needArr[k] = need; occArr[k] = occ;
    }
  }
  if (!visData) visData = new Uint16Array(N * N * 4);
  for (let k = 0; k < N * N; k++){
    visData[k * 4] = SS.toHalf(heights[k]);
    visData[k * 4 + 1] = SS.toHalf(needArr[k]);
    visData[k * 4 + 2] = SS.toHalf(occArr[k]);
    visData[k * 4 + 3] = 15360;
  }
  if (!visTex){
    visTex = new THREE.DataTexture(visData, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
    visTex.magFilter = visTex.minFilter = THREE.LinearFilter;
    visTex.generateMipmaps = false;
    visTex.wrapS = visTex.wrapT = THREE.ClampToEdgeWrapping;
    SUNVIS.value = visTex;
  }
  visTex.needsUpdate = true;
};
W.sunVisAt = function(x, y, z){
  let fx = (x + HALF) / STEP, fz = (z + HALF) / STEP;
  if (fx < 0 || fz < 0 || fx >= SEG || fz >= SEG) return 1;
  const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * N + i;
  const bl = (arr) => { const a = arr[k], b = arr[k + 1], c = arr[k + N], d = arr[k + N + 1]; return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz; };
  const need = bl(needArr), occ = bl(occArr), g = W.H(x, z);
  const soft = 0.18 + occ * 0.0087;
  return SS.smooth(need - soft, need + soft, y - g);
};
W.extTempC = function(x, y, z){
  if (W.isPSR(x, z) && W.sunVisAt(x, y, z) < 0.5) return -238;
  const v = W.sunVisAt(x, y, z);
  return SS.lerp(-168, -22, v);
};

/* ------------------------------------------------------------------ scene */
let scene, camera, renderer, sunLight, sunTarget, hemi, earthFill, terrain;
let starLayers = [], sunGlare, sunCore, earth, earthHalo, skirt;
W.exposure = 1;

W.init = function(r){
  renderer = r;
  scene = W.scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  camera = W.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 6000);
  camera.rotation.order = 'YXZ';

  const tex = regolithTextures();
  const aniso = renderer.capabilities.getMaxAnisotropy();
  tex.map.anisotropy = tex.nrm.anisotropy = Math.min(8, aniso);
  W.regolith = tex;

  /* terrain mesh */
  const pos = new Float32Array(N * N * 3), nor = new Float32Array(N * N * 3), uv = new Float32Array(N * N * 2), col = new Float32Array(N * N * 3);
  const young = craters.filter(c => c.young);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++){
    const k = j * N + i, x = -HALF + i * STEP, z = -HALF + j * STEP, y = heights[k];
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    const hl = heights[j * N + Math.max(0, i - 1)], hr = heights[j * N + Math.min(SEG, i + 1)];
    const hd = heights[Math.max(0, j - 1) * N + i], hu = heights[Math.min(SEG, j + 1) * N + i];
    let nx = -(hr - hl) / (2 * STEP), nz = -(hu - hd) / (2 * STEP), ny = 1;
    const l = Math.hypot(nx, ny, nz); nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l;
    uv[k * 2] = x / 4.5; uv[k * 2 + 1] = z / 4.5;
    let a = 0.9 + 0.1 * SS.fbm(x * 0.008 + 5, z * 0.008 - 2, 3) + 0.05 * SS.noise(x * 0.06, z * 0.06);
    for (const c of young){
      const d = Math.hypot(x - c.x, z - c.z) / c.R;
      if (d < 4){
        const ray = 0.5 + 0.5 * Math.sin(Math.atan2(z - c.z, x - c.x) * 9 + c.R);
        a += (d < 1.1 ? 0.18 : 0.14 * ray * (1 - (d - 1.1) / 2.9));
      }
    }
    if (W.isPSR(x, z)) a *= 0.92;
    col[k * 3] = a * 1.0; col[k * 3 + 1] = a * 0.985; col[k * 3 + 2] = a * 0.955;
  }
  const idx = new Uint32Array(SEG * SEG * 6);
  let p = 0;
  for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++){
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
    idx[p++] = a; idx[p++] = c; idx[p++] = b;
    idx[p++] = b; idx[p++] = c; idx[p++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  W.terrainMat = W.mkMat({ map: tex.map, normalMap: tex.nrm, normalScale: new THREE.Vector2(0.5, 0.5), vertexColors: true, roughness: 0.98, metalness: 0, color: 0x9C9993 }, { lunar: true });
  terrain = new THREE.Mesh(geo, W.terrainMat);
  terrain.receiveShadow = true;
  scene.add(terrain);

  buildSkirt();
  buildSky();

  /* lights */
  sunLight = new THREE.DirectionalLight(0xFFFBF2, 3.0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  const sc = sunLight.shadow.camera;
  sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 900;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.04;
  scene.add(sunLight);
  sunTarget = new THREE.Object3D(); scene.add(sunTarget); sunLight.target = sunTarget;
  hemi = new THREE.HemisphereLight(0x3A3D44, 0x8C8A84, 0.6);
  scene.add(hemi);
  earthFill = new THREE.DirectionalLight(0x9DB8E8, 0.05);
  scene.add(earthFill);

  buildRocks();
  buildDecals();
  buildDust();
  buildCable();
};

function buildSkirt(){
  const RS = [470, 520, 600, 720, 900, 1200, 1600, 2100, 2700, 3400, 4200];
  const AS = 160;
  const pos = [], col = [], idx = [];
  const mountains = [
    { a: 30, r: 2300, h: 380, w: 520 }, { a: 75, r: 2800, h: 260, w: 700 }, { a: 140, r: 2000, h: 180, w: 380 },
    { a: 205, r: 3100, h: 520, w: 900 }, { a: 250, r: 2400, h: 220, w: 460 }, { a: 318, r: 2600, h: 340, w: 640 }
  ];
  for (let ri = 0; ri < RS.length; ri++) for (let ai = 0; ai <= AS; ai++){
    const th = ai / AS * Math.PI * 2, rr = RS[ri];
    const x = Math.sin(th) * rr, z = -Math.cos(th) * rr;
    const ex = SS.clamp(x, -HALF + 1, HALF - 1), ez = SS.clamp(z, -HALF + 1, HALF - 1);
    const edge = W.H(ex, ez);
    let far = SS.fbm(x * 0.0012 + 7, z * 0.0012, 4) * 30;
    for (const m of mountains){
      const mx = Math.sin(m.a * SS.DEG) * m.r, mz = -Math.cos(m.a * SS.DEG) * m.r;
      const d = Math.hypot(x - mx, z - mz);
      far += m.h * Math.exp(-(d * d) / (2 * m.w * m.w)) * (0.85 + 0.15 * SS.noise(x * 0.004, z * 0.004));
    }
    const s = SS.smooth(470, 760, rr);
    pos.push(x, edge * (1 - s) + far * s - (rr * rr) / (2 * 1737000), z);
    const a = 0.82 + 0.08 * SS.noise(x * 0.003, z * 0.003);
    col.push(a, a * 0.985, a * 0.955);
  }
  const row = AS + 1;
  for (let ri = 0; ri < RS.length - 1; ri++) for (let ai = 0; ai < AS; ai++){
    const a = ri * row + ai, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  skirt = new THREE.Mesh(g, W.mkMat({ vertexColors: true, roughness: 1, metalness: 0, color: 0x8E8B86 }, { lunar: true }));
  scene.add(skirt);
}

function glowTex(inner, outer, stops){
  const c = SS.canvas(256, 256), g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, inner, 128, 128, outer);
  stops.forEach(s => gr.addColorStop(s[0], s[1]));
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
function earthTexture(){
  const w = 1024, h = 512, c = SS.canvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h);
  for (let y = 0; y < h; y++){
    const lat = (0.5 - y / h) * Math.PI;
    for (let x = 0; x < w; x++){
      const lon = x / w * Math.PI * 2;
      const cx = Math.cos(lat) * Math.cos(lon), cy = Math.sin(lat), cz = Math.cos(lat) * Math.sin(lon);
      const land = SS.fbm(cx * 1.6 + 4.2 + cz * 0.7, cy * 1.6 + cz * 1.3 - 2.1, 5);
      const cloud = SS.fbm(cx * 3.1 - 1 + cz * 2.2, cy * 5.2 + cz * 0.9 + 8, 5);
      let r, gg, b;
      if (land > 0.12){ const t = SS.clamp((land - 0.12) * 3, 0, 1); r = 70 + 90 * t; gg = 96 + 40 * t; b = 52 + 30 * t; }
      else { r = 18; gg = 52 + 30 * (land + 0.6); b = 118 + 40 * (land + 0.6); }
      if (Math.abs(cy) > 0.86){ r = gg = b = 235; }
      const cl = SS.clamp((cloud - 0.08) * 2.4, 0, 0.92);
      r = r + (245 - r) * cl; gg = gg + (248 - gg) * cl; b = b + (252 - b) * cl;
      const k = (y * w + x) * 4;
      img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
function buildSky(){
  const r = SS.rng(2024);
  const mk = (n, size, bright) => {
    const p = new Float32Array(n * 3), cl = new Float32Array(n * 3);
    for (let i = 0; i < n; i++){
      const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      p[i * 3] = s * Math.cos(th) * 3000; p[i * 3 + 1] = u * 3000; p[i * 3 + 2] = s * Math.sin(th) * 3000;
      const t = r(), k = bright * (0.55 + 0.45 * r());
      cl[i * 3] = k * (t < 0.2 ? 0.8 : t > 0.85 ? 1.0 : 0.95);
      cl[i * 3 + 1] = k * (t < 0.2 ? 0.88 : t > 0.85 ? 0.9 : 0.96);
      cl[i * 3 + 2] = k * (t < 0.2 ? 1.0 : t > 0.85 ? 0.78 : 1.0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    const m = new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = -2;
    scene.add(pts); starLayers.push(pts);
  };
  mk(6000, 1.1, 0.7); mk(1400, 1.8, 0.9); mk(160, 2.8, 1.0);

  sunGlare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(0, 128, [[0, 'rgba(255,252,240,0.95)'], [0.06, 'rgba(255,248,228,0.55)'], [0.25, 'rgba(255,236,200,0.12)'], [1, 'rgba(255,230,190,0)']]),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sunGlare.scale.set(420, 420, 1);
  sunCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(0, 128, [[0, 'rgba(255,255,255,1)'], [0.55, 'rgba(255,255,250,1)'], [0.7, 'rgba(255,250,235,0.35)'], [1, 'rgba(255,250,235,0)']]),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sunCore.scale.set(34, 34, 1);
  scene.add(sunGlare); scene.add(sunCore);

  earth = new THREE.Mesh(new THREE.SphereGeometry(27, 48, 32),
    new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 0.85, metalness: 0, emissive: 0x0A1426, emissiveIntensity: 0.35 }));
  earthHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(52, 128, [[0, 'rgba(120,170,255,0.35)'], [0.3, 'rgba(90,150,255,0.12)'], [1, 'rgba(90,150,255,0)']]),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  earthHalo.scale.set(76, 76, 1);
  scene.add(earth); scene.add(earthHalo);
}
W.EARTH_DIR = (function(){ const az = 18 * SS.DEG, el = 5.2 * SS.DEG; return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)); })();

/* ------------------------------------------------------------------ rocks */
W.obstacles = [];
function rockGeo(seed, detail){
  const g = new THREE.IcosahedronGeometry(1, detail);
  const r = SS.rng(seed), p = g.attributes.position;
  const sx = 0.8 + r() * 0.5, sy = 0.5 + r() * 0.35, sz = 0.8 + r() * 0.5;
  for (let i = 0; i < p.count; i++){
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + 0.22 * SS.noise(x * 2.1 + seed, z * 2.1 + y * 1.7) + 0.08 * SS.noise(x * 5 + seed, y * 5);
    p.setXYZ(i, x * sx * n, y * sy * n, z * sz * n);
  }
  const ng = g.index ? g.toNonIndexed() : g; ng.computeVertexNormals();
  return ng;
}
W.rockGeo = rockGeo;
function buildRocks(){
  const mat = W.mkMat({ color: 0x8E8C88, roughness: 0.96, metalness: 0, flatShading: true });
  W.rockMat = mat;
  const geos = [rockGeo(11, 1), rockGeo(23, 1), rockGeo(37, 1)];
  const r = SS.rng(777);
  const keys = KEY_POINTS();
  const buckets = [[], [], []];
  const place = (count, smin, smax, clearKey, clearPath, rimBias) => {
    let n = 0, tries = 0;
    while (n < count && tries < count * 25){
      tries++;
      const x = r() * 940 - 470, z = r() * 940 - 470;
      let bias = 0.3;
      for (const c of craters){ const d = Math.hypot(x - c.x, z - c.z) / c.R; if (d > 0.9 && d < 1.8){ bias = 1; break; } }
      const dc = Math.hypot(x - CR.x, z - CR.z); if (Math.abs(dc - CR.r) < 30) bias = 1;
      if (r() > bias * rimBias + (1 - rimBias)) continue;
      let ok = true;
      for (const k of keys) if (Math.hypot(x - k.x, z - k.z) < clearKey){ ok = false; break; }
      if (!ok) continue;
      if (clearPath && W.nearCorridor(x, z, clearPath)) continue;
      const s = smin + Math.pow(r(), 2.2) * (smax - smin);
      buckets[Math.floor(r() * 3)].push({ x, z, s, ry: r() * 6.28, rx: (r() - 0.5) * 0.5 });
      if (s > 0.7) W.obstacles.push({ x, z, r: s * 0.9 });
      n++;
    }
  };
  place(2200, 0.05, 0.3, 4, 0, 0.6);
  place(420, 0.3, 0.8, 8, 5, 0.8);
  place(70, 0.8, 2.4, 14, 10, 0.9);
  const dummy = new THREE.Object3D();
  buckets.forEach((b, i) => {
    const im = new THREE.InstancedMesh(geos[i], mat, b.length);
    b.forEach((q, k) => {
      dummy.position.set(q.x, W.H(q.x, q.z) - q.s * 0.22, q.z);
      dummy.rotation.set(q.rx, q.ry, 0);
      dummy.scale.set(q.s, q.s, q.s);
      dummy.updateMatrix();
      im.setMatrixAt(k, dummy.matrix);
    });
    im.castShadow = true; im.receiveShadow = true;
    scene.add(im);
  });
}

/* ------------------------------------------------------------------ decals: bootprints, wheel tracks */
function printTex(kind){
  const c = SS.canvas(128, 64), g = c.getContext('2d');
  g.clearRect(0, 0, 128, 64);
  if (kind === 'boot'){
    g.fillStyle = 'rgba(40,38,34,0.55)';
    g.beginPath(); g.ellipse(64, 32, 58, 24, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(20,19,17,0.55)';
    for (let i = 0; i < 12; i++){ g.fillRect(14 + i * 8.5, 12, 3.2, 40); }
    g.fillStyle = 'rgba(150,145,138,0.25)';
    for (let i = 0; i < 12; i++){ g.fillRect(18 + i * 8.5, 12, 2, 40); }
  } else {
    g.fillStyle = 'rgba(38,36,32,0.42)';
    g.fillRect(0, 6, 128, 52);
    g.fillStyle = 'rgba(18,17,15,0.5)';
    for (let i = 0; i < 16; i++){ g.beginPath(); g.moveTo(i * 8, 8); g.lineTo(i * 8 + 5, 32); g.lineTo(i * 8, 56); g.lineTo(i * 8 + 3, 56); g.lineTo(i * 8 + 8, 32); g.lineTo(i * 8 + 3, 8); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
function decalSet(tex, w, l, max){
  const g = new THREE.PlaneGeometry(l, w); g.rotateX(-Math.PI / 2);
  const m = W.mkMat({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 1, metalness: 0 });
  const im = new THREE.InstancedMesh(g, m, max);
  im.count = 0; im.frustumCulled = false; im.receiveShadow = true;
  scene.add(im);
  return { im, max, n: 0, dummy: new THREE.Object3D() };
}
let boots, tracks;
function buildDecals(){ boots = decalSet(printTex('boot'), 0.13, 0.32, 700); tracks = decalSet(printTex('track'), 0.32, 0.95, 1200); }
function pushDecal(set, x, z, yaw){
  const k = set.n % set.max;
  const d = set.dummy, n = W.normal(x, z);
  d.position.set(x, W.H(x, z) + 0.012, z);
  d.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  d.rotateY(yaw);
  d.scale.set(1, 1, 1);
  d.updateMatrix();
  set.im.setMatrixAt(k, d.matrix);
  set.im.instanceMatrix.needsUpdate = true;
  set.n++;
  set.im.count = Math.min(set.n, set.max);
}
W.bootprint = (x, z, yaw) => pushDecal(boots, x, z, yaw);
W.track = (x, z, yaw) => pushDecal(tracks, x, z, yaw);
W.clearDecals = () => { boots.n = 0; boots.im.count = 0; tracks.n = 0; tracks.im.count = 0; };

/* ------------------------------------------------------------------ dust: ballistic, no drag */
const DUST = 1400;
let dustGeo, dustPos, dustCol, dustVel, dustLife, dustHead = 0;
function buildDust(){
  dustPos = new Float32Array(DUST * 3); dustCol = new Float32Array(DUST * 3);
  dustVel = new Float32Array(DUST * 3); dustLife = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) dustPos[i * 3 + 1] = -9999;
  dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
  const dot = SS.canvas(32, 32), dg = dot.getContext('2d'), gr = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  dg.fillStyle = gr; dg.fillRect(0, 0, 32, 32);
  const pts = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.022, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, map: new THREE.CanvasTexture(dot), alphaTest: 0.02 }));
  pts.frustumCulled = false;
  scene.add(pts);
}
W.dust = function(x, y, z, vx, vz, n, spread, up){
  const vis = 0.25 + 0.75 * W.sunVisAt(x, y, z);
  for (let i = 0; i < n; i++){
    const k = dustHead; dustHead = (dustHead + 1) % DUST;
    dustPos[k * 3] = x + (Math.random() - 0.5) * 0.2; dustPos[k * 3 + 1] = y + 0.03; dustPos[k * 3 + 2] = z + (Math.random() - 0.5) * 0.2;
    const a = Math.random() * Math.PI * 2, s = Math.random() * spread;
    dustVel[k * 3] = vx + Math.cos(a) * s; dustVel[k * 3 + 1] = (up || 0.9) * (0.5 + Math.random()); dustVel[k * 3 + 2] = vz + Math.sin(a) * s;
    dustLife[k] = 4;
    const c = (0.34 + Math.random() * 0.12) * vis;
    dustCol[k * 3] = c; dustCol[k * 3 + 1] = c * 0.98; dustCol[k * 3 + 2] = c * 0.95;
  }
};
function updateDust(dt){
  let any = false;
  for (let k = 0; k < DUST; k++){
    if (dustLife[k] <= 0) continue;
    any = true;
    dustVel[k * 3 + 1] -= 1.62 * dt;
    dustPos[k * 3] += dustVel[k * 3] * dt; dustPos[k * 3 + 1] += dustVel[k * 3 + 1] * dt; dustPos[k * 3 + 2] += dustVel[k * 3 + 2] * dt;
    dustLife[k] -= dt;
    if (dustVel[k * 3 + 1] < 0 && dustPos[k * 3 + 1] < W.H(dustPos[k * 3], dustPos[k * 3 + 2])){ dustLife[k] = 0; dustPos[k * 3 + 1] = -9999; }
    else if (dustLife[k] <= 0) dustPos[k * 3 + 1] = -9999;
  }
  if (any){ dustGeo.attributes.position.needsUpdate = true; dustGeo.attributes.color.needsUpdate = true; }
}

/* ------------------------------------------------------------------ power cable ribbon */
const CABLE_MAX = 700;
let cableGeo, cablePos;
W.cable = { pts: [], length: 0 };
function buildCable(){
  cablePos = new Float32Array(CABLE_MAX * 2 * 3);
  const idx = [];
  for (let i = 0; i < CABLE_MAX - 1; i++){ const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  cableGeo = new THREE.BufferGeometry();
  cableGeo.setAttribute('position', new THREE.BufferAttribute(cablePos, 3));
  cableGeo.setIndex(idx);
  cableGeo.setDrawRange(0, 0);
  const m = W.mkMat({ color: 0xD65A1E, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(cableGeo, m); mesh.frustumCulled = false; mesh.receiveShadow = true;
  scene.add(mesh);
}
function rebuildCable(){
  const P = W.cable.pts;
  for (let i = 0; i < P.length; i++){
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const nx = -dz * 0.045, nz = dx * 0.045, y = W.H(P[i].x, P[i].z) + 0.035;
    cablePos.set([P[i].x + nx, y, P[i].z + nz, P[i].x - nx, y, P[i].z - nz], i * 6);
  }
  cableGeo.attributes.position.needsUpdate = true;
  cableGeo.setDrawRange(0, Math.max(0, (P.length - 1) * 6));
}
W.cable.reset = function(pts){
  W.cable.pts = (pts || []).slice(0, CABLE_MAX);
  W.cable.length = 0;
  for (let i = 1; i < W.cable.pts.length; i++) W.cable.length += SS.dist(W.cable.pts[i - 1].x, W.cable.pts[i - 1].z, W.cable.pts[i].x, W.cable.pts[i].z);
  rebuildCable();
};
W.cable.add = function(x, z){
  const P = W.cable.pts;
  if (P.length >= CABLE_MAX) return;
  if (P.length){ const l = P[P.length - 1]; W.cable.length += SS.dist(l.x, l.z, x, z); }
  P.push({ x, z });
  rebuildCable();
};

/* ------------------------------------------------------------------ sun + per-frame update */
W.setSun = function(az, el){
  W.sun.az = az; W.sun.el = el; W.sun.night = el < 0;
  const a = az * SS.DEG, e = el * SS.DEG;
  W.sun.dir.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
  W.bakeSun(az, el);
};
let adapt = 1;
W.update = function(dt, cam, opts){
  opts = opts || {};
  const cp = cam.position;
  sunTarget.position.set(cp.x, W.H(cp.x, cp.z), cp.z);
  sunLight.position.copy(sunTarget.position).addScaledVector(W.sun.dir, 450);
  sunLight.shadow.camera.updateProjectionMatrix();
  earthFill.position.copy(cp).addScaledVector(W.EARTH_DIR, 100);
  earthFill.target = sunTarget;

  const vis = W.sunVisAt(cp.x, cp.y, cp.z);
  const dark = opts.interior ? 0 : (1 - vis);
  hemi.intensity = W.sun.night ? 0.22 : 0.6;
  const target = opts.interior ? 1.0 : SS.lerp(1.0, opts.headlamp ? 1.8 : 2.4, dark);
  adapt = SS.damp(adapt, target, dark > 0.5 ? 0.6 : 1.6, dt);
  W.exposure = adapt;
  renderer.toneMappingExposure = adapt * (opts.visor ? 0.8 : 1);

  const starA = SS.smooth(1.25, 2.2, adapt) * (opts.visor ? 0.4 : 1);
  starLayers.forEach(s => { s.position.copy(cp); s.material.opacity = starA; s.visible = starA > 0.01; });

  sunCore.position.copy(cp).addScaledVector(W.sun.dir, 1500);
  sunGlare.position.copy(sunCore.position);
  sunGlare.material.opacity = opts.visor ? 0.35 : 1;
  sunCore.visible = sunGlare.visible = W.sun.el > -0.3;
  earth.position.copy(cp).addScaledVector(W.EARTH_DIR, 1500);
  earth.rotation.y += dt * 0.002;
  earthHalo.position.copy(earth.position);
  skirt.position.set(0, 0, 0);

  updateDust(dt);
};
W.setShadowQuality = function(q){
  const s = q === 'high' ? 4096 : q === 'low' ? 1024 : 2048;
  if (sunLight.shadow.mapSize.x !== s){
    sunLight.shadow.mapSize.set(s, s);
    if (sunLight.shadow.map){ sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
  }
};
})();
