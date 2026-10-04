/* Shackleton Station — procedural hardware. Every element is built from primitives at load time;
   there are no external assets. */
(function(){
'use strict';
const SS = window.SS;
const MD = SS.models = {};
const V2 = THREE.Vector2;

/* ------------------------------------------------------------------ textures */
function facetNormal(){
  const S = 256, c = SS.canvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S);
  const r = SS.rng(5), pts = [];
  for (let i = 0; i < 70; i++) pts.push({ x: r() * S, y: r() * S, nx: (r() - 0.5) * 1.3, ny: (r() - 0.5) * 1.3 });
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++){
    let best = 1e9, bi = 0;
    for (let i = 0; i < pts.length; i++){
      let dx = Math.abs(x - pts[i].x), dy = Math.abs(y - pts[i].y);
      if (dx > S / 2) dx = S - dx; if (dy > S / 2) dy = S - dy;
      const d = dx * dx + dy * dy; if (d < best){ best = d; bi = i; }
    }
    const p = pts[bi], l = Math.hypot(p.nx, p.ny, 1), k = (y * S + x) * 4;
    img.data[k] = (p.nx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (p.ny / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t;
}
function mliTex(){
  const S = 256, c = SS.canvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#EDEBE6'; g.fillRect(0, 0, S, S);
  const r = SS.rng(8);
  for (let i = 0; i < 1800; i++){ g.fillStyle = 'rgba(0,0,0,' + (r() * 0.035) + ')'; g.fillRect(r() * S, r() * S, 2, 2); }
  g.strokeStyle = 'rgba(120,118,112,0.35)'; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++){ g.beginPath(); g.moveTo(0, i * 64); g.lineTo(S, i * 64); g.stroke(); g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, S); g.stroke(); }
  g.fillStyle = 'rgba(110,108,102,0.35)';
  for (let y = 16; y < S; y += 32) for (let x = 16; x < S; x += 32) g.fillRect(x - 1, y - 1, 2, 2);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; return t;
}
function solarTex(){
  const c = SS.canvas(256, 512), g = c.getContext('2d');
  g.fillStyle = '#0E1A3A'; g.fillRect(0, 0, 256, 512);
  for (let y = 0; y < 512; y += 16) for (let x = 0; x < 256; x += 16){
    g.fillStyle = (x + y) % 32 ? '#16285A' : '#132250'; g.fillRect(x + 1, y + 1, 14, 14);
  }
  g.fillStyle = 'rgba(200,210,230,0.5)';
  for (let y = 0; y < 512; y += 64) g.fillRect(0, y, 256, 2);
  g.fillRect(126, 0, 3, 512);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
function labelTex(text, opts){
  opts = opts || {};
  const c = SS.canvas(opts.w || 256, opts.h || 96), g = c.getContext('2d');
  g.fillStyle = opts.bg || '#E9E7E2'; g.fillRect(0, 0, c.width, c.height);
  if (opts.stripe){ g.fillStyle = opts.stripe; g.fillRect(0, 0, c.width, 10); g.fillRect(0, c.height - 10, c.width, 10); }
  g.fillStyle = opts.fg || '#1A1C20';
  g.font = '700 ' + (opts.size || 44) + 'px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
MD.labelTex = labelTex;

let MT = null;
function mats(){
  if (MT) return MT;
  const mk = SS.world.mkMat;
  const mli = mliTex(), foil = facetNormal();
  MT = {
    white: mk({ color: 0xF2F0EB, roughness: 0.84, metalness: 0, map: mli }),
    hard:  mk({ color: 0xDCDFE3, roughness: 0.42, metalness: 0.18 }),
    gold:  mk({ color: 0xCFA24A, roughness: 0.26, metalness: 0.95, normalMap: foil, normalScale: new V2(0.7, 0.7) }),
    silver:mk({ color: 0xC8CCD2, roughness: 0.22, metalness: 0.95, normalMap: foil, normalScale: new V2(0.5, 0.5) }),
    dark:  mk({ color: 0x2B2F36, roughness: 0.58, metalness: 0.45 }),
    metal: mk({ color: 0xA6ADB6, roughness: 0.3, metalness: 0.9 }),
    black: mk({ color: 0x131518, roughness: 0.55, metalness: 0.2 }),
    orange:mk({ color: 0xE0561B, roughness: 0.6, metalness: 0.05 }),
    solar: mk({ color: 0xFFFFFF, map: solarTex(), roughness: 0.28, metalness: 0.55 }),
    glass: mk({ color: 0x0B1118, roughness: 0.06, metalness: 0.95 }),
    rad:   mk({ color: 0xF6F6F2, roughness: 0.32, metalness: 0.05 }),
    tire:  mk({ color: 0x5A5E64, roughness: 0.55, metalness: 0.75 }),
    win:   mk({ color: 0x0E1216, emissive: 0xFFC98A, emissiveIntensity: 0, roughness: 0.18, metalness: 0.4 }),
    ledG:  mk({ color: 0x0A140E, emissive: 0x39FF8A, emissiveIntensity: 1.6, roughness: 0.4 }),
    ledA:  mk({ color: 0x140E04, emissive: 0xFFB020, emissiveIntensity: 1.6, roughness: 0.4 }),
    ledR:  mk({ color: 0x160404, emissive: 0xFF3B2E, emissiveIntensity: 1.8, roughness: 0.4 }),
    head:  mk({ color: 0xFFF4DC, emissive: 0xFFF4DC, emissiveIntensity: 0, roughness: 0.3 }),
    regol: mk({ color: 0x9C9993, roughness: 1, metalness: 0, map: SS.world.regolith.map, normalMap: SS.world.regolith.nrm, flatShading: true }, { lunar: true }),
    suit:  mk({ color: 0xF4F3EF, roughness: 0.9, metalness: 0, map: mli }),
    visor: mk({ color: 0xD8A640, roughness: 0.12, metalness: 1.0 }),
    grow:  mk({ color: 0xFFFFFF, transparent: true, opacity: 0.32, emissive: 0xE35BD6, emissiveIntensity: 0.0, roughness: 0.15, metalness: 0, side: THREE.DoubleSide, depthWrite: false }),
    leaf:  mk({ color: 0x2F6B3A, emissive: 0x1C5A2A, emissiveIntensity: 0.0, roughness: 0.8 })
  };
  return MT;
}
MD.mats = mats;

/* ------------------------------------------------------------------ primitives */
function sh(m){ m.castShadow = true; m.receiveShadow = true; return m; }
function box(w, h, d, mat, x, y, z){ const m = sh(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)); m.position.set(x || 0, y || 0, z || 0); return m; }
function cyl(rt, rb, h, seg, mat, x, y, z, open){ const m = sh(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!open), mat)); m.position.set(x || 0, y || 0, z || 0); return m; }
function sph(r, mat, x, y, z, ws, hs){ const m = sh(new THREE.Mesh(new THREE.SphereGeometry(r, ws || 20, hs || 14), mat)); m.position.set(x || 0, y || 0, z || 0); return m; }
function strut(a, b, r, mat){
  const va = new THREE.Vector3(a[0], a[1], a[2]), vb = new THREE.Vector3(b[0], b[1], b[2]);
  const len = va.distanceTo(vb);
  const m = sh(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat));
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  return m;
}
MD.box = box; MD.cyl = cyl; MD.strut = strut;

/* ------------------------------------------------------------------ lander */
MD.lander = function(){
  const m = mats(), g = new THREE.Group();
  const ds = cyl(4.1, 4.4, 3.0, 8, m.gold, 0, 2.75, 0); ds.rotation.y = Math.PI / 8; g.add(ds);
  const deck = cyl(4.35, 4.35, 0.16, 8, m.dark, 0, 4.3, 0); deck.rotation.y = Math.PI / 8; g.add(deck);
  g.add(cyl(1.5, 2.3, 0.9, 18, m.dark, 0, 0.95, 0, true));
  g.add(cyl(0.9, 1.5, 0.5, 18, m.metal, 0, 1.55, 0));
  for (let k = 0; k < 4; k++){
    const a = k * Math.PI / 2 + Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
    g.add(strut([c * 3.7, 2.3, s * 3.7], [c * 6.1, 0.3, s * 6.1], 0.13, m.metal));
    g.add(strut([c * 3.2, 1.3, s * 3.2], [c * 6.1, 0.3, s * 6.1], 0.08, m.metal));
    g.add(strut([c * 4.2, 3.6, s * 4.2], [c * 5.3, 1.0, s * 5.3], 0.07, m.metal));
    g.add(cyl(0.8, 0.9, 0.22, 16, m.dark, c * 6.1, 0.14, s * 6.1));
  }
  const cab = cyl(2.5, 2.7, 3.8, 24, m.hard, 0, 6.3, 0); g.add(cab);
  const dome = sph(2.5, m.hard, 0, 8.2, 0, 24, 12); dome.scale.y = 0.42; g.add(dome);
  g.add(cyl(2.72, 2.72, 0.12, 24, m.dark, 0, 4.45, 0));
  g.add(cyl(2.55, 2.55, 0.1, 24, m.dark, 0, 8.18, 0));
  /* hatch facing +z */
  const hf = box(1.45, 1.9, 0.18, m.dark, 0, 5.45, 2.62); g.add(hf);
  const hd = box(1.2, 1.65, 0.1, m.orange, 0, 5.45, 2.72); g.add(hd);
  MD.landerHatch = hd;
  [[-0.9, 7.2, 2.35], [0.9, 7.2, 2.35]].forEach(p => { const w = box(0.5, 0.36, 0.06, m.glass, p[0], p[1], p[2]); w.rotation.y = p[0] * 0.2; g.add(w); });
  for (let k = 0; k < 4; k++){
    const a = k * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    const q = box(0.35, 0.35, 0.35, m.dark, c * 2.6, 7.6, s * 2.6); q.rotation.y = -a; g.add(q);
  }
  /* porch, rails, ladder */
  g.add(box(2.4, 0.12, 1.9, m.dark, 0, 4.35, 3.75));
  [[-1.15, 3.75], [1.15, 3.75]].forEach(p => { g.add(strut([p[0], 4.4, 2.8], [p[0], 4.4, 4.7], 0.03, m.metal)); g.add(strut([p[0], 5.35, 2.8], [p[0], 5.35, 4.7], 0.03, m.metal)); g.add(strut([p[0], 4.4, 4.7], [p[0], 5.35, 4.7], 0.03, m.metal)); });
  const lt = [0, 4.35, 4.7], lb = [0, 0.05, 6.55];
  [-0.38, 0.38].forEach(x => g.add(strut([x, lt[1], lt[2]], [x, lb[1], lb[2]], 0.035, m.metal)));
  for (let i = 1; i < 14; i++){
    const t = i / 14, y = SS.lerp(lt[1], lb[1], t), z = SS.lerp(lt[2], lb[2], t);
    g.add(strut([-0.38, y, z], [0.38, y, z], 0.025, m.metal));
  }
  /* comms */
  g.add(cyl(0.05, 0.05, 2.2, 6, m.metal, -1.2, 9.3, -0.6));
  const dish = sph(0.9, m.hard, -1.2, 10.4, -0.6, 20, 8); dish.scale.set(1, 0.3, 1); dish.rotation.z = 0.5; g.add(dish);
  /* cargo deck on -x */
  g.add(box(2.6, 0.14, 3.0, m.dark, -5.3, 3.2, 0));
  g.add(strut([-4.0, 3.2, -1.3], [-6.4, 3.2, -1.3], 0.06, m.metal));
  [[-5.8, 3.7, -0.7, 1.1], [-4.8, 3.65, 0.6, 0.9]].forEach(q => g.add(box(q[3], q[3], q[3], m.white, q[0], q[1], q[2])));
  return g;
};

/* ------------------------------------------------------------------ surface habitat */
MD.hab = function(){
  const m = mats(), g = new THREE.Group();
  for (let sx = -1; sx <= 1; sx += 2) for (let sz = -1; sz <= 1; sz += 2){
    g.add(cyl(0.16, 0.2, 1.4, 8, m.metal, sx * 3.4, 0.7, sz * 1.7));
    g.add(cyl(0.45, 0.5, 0.12, 12, m.dark, sx * 3.4, 0.06, sz * 1.7));
  }
  const body = cyl(2.9, 2.9, 9.5, 32, m.white, 0, 4.2, 0); body.rotation.z = Math.PI / 2; g.add(body);
  [-4.75, 4.75].forEach(x => { const c = sph(2.9, m.white, x, 4.2, 0, 32, 16); c.scale.x = 0.34; g.add(c); });
  [-3.3, -1.1, 1.1, 3.3].forEach(x => { const r = sh(new THREE.Mesh(new THREE.TorusGeometry(2.93, 0.06, 8, 40), m.hard)); r.rotation.y = Math.PI / 2; r.position.set(x, 4.2, 0); g.add(r); });
  [-1.4, 1.4].forEach(z => {
    const p = box(4.2, 0.05, 1.7, m.rad, -0.6, 7.65, z * 1.02); p.rotation.x = z * 0.22; g.add(p);
    g.add(cyl(0.04, 0.04, 0.8, 6, m.metal, -0.6, 7.2, z * 0.7));
  });
  /* windows */
  const wins = [];
  [[-2.2, 4.8, 2.83], [0, 4.8, 2.85], [2.2, 4.8, 2.83], [-1.1, 4.8, -2.85]].forEach(p => {
    const w = sh(new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), m.win));
    w.position.set(p[0], p[1], p[2]); if (p[2] < 0) w.rotation.y = Math.PI; g.add(w); wins.push(w);
    const fr = sh(new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.04, 6, 20), m.dark)); fr.position.copy(w.position); fr.rotation.y = w.rotation.y; g.add(fr);
  });
  /* airlock at +x */
  const al = cyl(1.4, 1.4, 2.3, 24, m.hard, 6.0, 3.1, 0); al.rotation.z = Math.PI / 2; g.add(al);
  g.add(cyl(1.5, 1.5, 0.12, 24, m.dark, 7.18, 3.1, 0).rotateZ(Math.PI / 2));
  const hatch = box(0.08, 1.55, 1.05, m.orange, 7.26, 3.0, 0); g.add(hatch);
  g.add(box(0.1, 0.12, 0.5, m.metal, 7.34, 3.0, 0.3));
  for (let i = 0; i < 4; i++) g.add(box(0.9, 0.16, 1.6, m.dark, 7.6 + i * 0.28, 2.1 - i * 0.55, 0));
  g.add(cyl(0.06, 0.06, 2.2, 6, m.metal, 6.3, 1.1, 1.3)); g.add(cyl(0.06, 0.06, 2.2, 6, m.metal, 6.3, 1.1, -1.3));
  /* exterior lights */
  const lights = [];
  [[5.2, 5.6, 1.6], [5.2, 5.6, -1.6], [-5.0, 6.0, 0]].forEach(p => { const l = box(0.28, 0.14, 0.2, m.head, p[0], p[1], p[2]); g.add(l); lights.push(l); });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshBasicMaterial({ map: labelTex('SURFACE HABITAT 1', { size: 38, stripe: '#E0561B' }) }));
  sign.position.set(-1.2, 6.2, 2.62); sign.rotation.y = 0; sign.rotation.x = -0.35; g.add(sign);
  g.userData = { wins, lights };
  return g;
};
MD.habPower = function(on){
  const m = mats();
  m.win.emissiveIntensity = on ? 1.6 : 0.0;
  m.head.emissiveIntensity = on ? 2.2 : 0.0;
};

MD.pdu = function(){
  const m = mats(), g = new THREE.Group();
  g.add(box(1.3, 1.1, 0.8, m.hard, 0, 0.6, 0));
  g.add(box(1.34, 0.12, 0.84, m.dark, 0, 1.18, 0));
  const port = cyl(0.14, 0.14, 0.12, 14, m.orange, 0.35, 0.75, 0.44); port.rotation.x = Math.PI / 2; g.add(port);
  const led = sph(0.04, m.ledA, -0.35, 0.95, 0.41, 8, 6); g.add(led);
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.25), new THREE.MeshBasicMaterial({ map: labelTex('PDU-1', { size: 54, stripe: '#E0561B' }) }));
  lbl.position.set(0, 0.62, 0.405); g.add(lbl);
  g.userData.led = led;
  return g;
};

MD.berm = function(){
  const m = mats();
  const geo = new THREE.CylinderGeometry(4.3, 6.2, 6.2, 36, 4);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++){
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + 0.06 * SS.noise(x * 0.9, z * 0.9 + y);
    p.setXYZ(i, x * n, y + (y > 3 ? 0.15 * SS.noise(x, z) : 0), z * n);
  }
  geo.computeVertexNormals();
  const mesh = sh(new THREE.Mesh(geo, m.regol));
  mesh.scale.set(1.75, 1, 1.0);
  return mesh;
};

/* ------------------------------------------------------------------ vertical solar array */
MD.vsat = function(){
  const m = mats(), g = new THREE.Group();
  g.add(box(2.3, 0.34, 2.3, m.dark, 0, 0.22, 0));
  [[-1.05, -1.05], [1.05, -1.05], [-1.05, 1.05], [1.05, 1.05]].forEach(p => g.add(box(0.18, 0.4, 0.18, m.orange, p[0], 0.3, p[1])));
  const yaw = new THREE.Group(); yaw.position.y = 0.4; g.add(yaw);
  yaw.add(cyl(0.34, 0.4, 0.5, 16, m.metal, 0, 0.25, 0));
  const mast = cyl(0.1, 0.13, 1, 10, m.metal, 0, 0.5, 0); yaw.add(mast);
  const canister = cyl(0.3, 0.3, 1.1, 14, m.white, 0, 1.0, 0); yaw.add(canister);
  const top = box(2.9, 0.1, 0.12, m.metal, 0, 1.6, 0); yaw.add(top);
  const wings = [];
  [-0.82, 0.82].forEach(x => {
    const w = sh(new THREE.Mesh(new THREE.BoxGeometry(1.35, 1, 0.035), m.solar));
    w.position.set(x, 1, 0.08); yaw.add(w); wings.push(w);
  });
  const ctl = box(0.55, 0.45, 0.35, m.hard, 0.8, 0.62, 1.0); g.add(ctl);
  const led = sph(0.045, m.ledA, 0.8, 0.9, 1.18, 8, 6); g.add(led);
  const api = { group: g, yaw, mast, canister, top, wings, led, t: 0 };
  api.setDeploy = function(t){
    api.t = t;
    const H = 10.0, mastT = SS.clamp(t / 0.55, 0, 1), wingT = SS.clamp((t - 0.45) / 0.55, 0, 1);
    const mh = 1.0 + (H - 1.0) * mastT;
    mast.scale.y = mh; mast.position.y = 0.5 + mh / 2;
    top.position.y = 0.5 + mh + 0.05;
    canister.visible = t < 0.98;
    const wh = Math.max(0.02, 8.6 * wingT);
    wings.forEach(w => { w.scale.y = wh; w.position.y = 0.5 + mh - 0.1 - wh / 2; w.visible = wingT > 0.01; });
  };
  api.setDeploy(0);
  return api;
};

/* ------------------------------------------------------------------ lunar terrain vehicle (forward = +z) */
MD.ltv = function(){
  const m = mats(), g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  body.add(box(1.75, 0.22, 3.3, m.dark, 0, 0.78, 0));
  body.add(box(1.6, 0.05, 2.3, m.metal, 0, 0.92, 0.1));
  body.add(box(1.8, 0.4, 0.5, m.hard, 0, 0.95, 1.55));
  const wheels = [];
  [[0.98, 1.25], [-0.98, 1.25], [0.98, -1.25], [-0.98, -1.25]].forEach(p => {
    const wg = new THREE.Group(); wg.position.set(p[0], 0.46, p[1]);
    const spin = new THREE.Group(); wg.add(spin);
    const tire = sh(new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.08, 8, 28), m.tire)); tire.rotation.y = Math.PI / 2; spin.add(tire);
    const hub = cyl(0.13, 0.13, 0.24, 12, m.dark); hub.rotation.z = Math.PI / 2; spin.add(hub);
    for (let k = 0; k < 6; k++){ const s = box(0.04, 0.7, 0.05, m.metal); s.rotation.x = k * Math.PI / 6; spin.add(s); }
    const fender = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.3, 16, 1, true, 0, Math.PI), m.hard));
    fender.rotation.z = Math.PI / 2; fender.rotation.y = Math.PI / 2; fender.position.y = 0.02; fender.material = m.hard;
    wg.add(fender);
    g.add(wg); wheels.push({ g: wg, spin });
  });
  [0.42, -0.42].forEach(x => {
    body.add(box(0.52, 0.08, 0.52, m.dark, x, 1.08, -0.15));
    const back = box(0.52, 0.6, 0.07, m.dark, x, 1.38, -0.44); back.rotation.x = -0.15; body.add(back);
  });
  body.add(cyl(0.035, 0.035, 0.5, 6, m.metal, 0.15, 1.2, 0.3));
  body.add(box(0.28, 0.05, 0.05, m.black, 0.15, 1.45, 0.3));
  const cons = box(0.7, 0.26, 0.08, m.dark, 0, 1.28, 0.66); cons.rotation.x = -0.6; body.add(cons);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), mats().ledG); scr.position.set(0, 1.3, 0.61); scr.rotation.x = -0.6 + Math.PI; scr.rotation.y = Math.PI; body.add(scr);
  body.add(strut([0.85, 0.9, -0.55], [0.85, 2.0, -0.55], 0.03, m.metal));
  body.add(strut([-0.85, 0.9, -0.55], [-0.85, 2.0, -0.55], 0.03, m.metal));
  body.add(strut([0.85, 2.0, -0.55], [-0.85, 2.0, -0.55], 0.03, m.metal));
  body.add(cyl(0.03, 0.03, 1.4, 6, m.metal, 0.74, 1.65, -1.05));
  const dish = sph(0.4, m.hard, 0.74, 2.4, -1.05, 16, 8); dish.scale.set(1, 0.28, 1); dish.rotation.x = 0.9; body.add(dish);
  body.add(cyl(0.02, 0.02, 1.2, 6, m.metal, -0.74, 1.55, -1.05));
  body.add(box(0.2, 0.14, 0.18, m.black, -0.74, 2.15, -1.05));
  const lights = [];
  const lightMat = SS.world.mkMat({ color: 0xFFF4DC, emissive: 0xFFF4DC, emissiveIntensity: 0, roughness: 0.3 });
  [0.55, -0.55].forEach(x => { const l = cyl(0.08, 0.08, 0.1, 12, lightMat, x, 1.02, 1.8); l.rotation.x = Math.PI / 2; body.add(l); lights.push(l); });
  body.add(box(1.5, 0.3, 0.9, m.hard, 0, 1.02, -1.3));
  const reel = cyl(0.36, 0.36, 1.0, 20, m.orange, 0, 1.45, -1.35); reel.rotation.z = Math.PI / 2; body.add(reel);
  body.add(box(0.2, 0.15, 0.25, m.dark, 0, 0.6, -1.75));
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshBasicMaterial({ map: labelTex('LTV-1', { size: 60, stripe: '#E0561B' }) }));
  lbl.position.set(0.9, 0.98, 0); lbl.rotation.y = Math.PI / 2; body.add(lbl);
  return { group: g, body, wheels, reel, lights, lightMat };
};

/* ------------------------------------------------------------------ ice processing plant */
MD.isru = function(){
  const m = mats(), g = new THREE.Group();
  for (let k = 0; k < 4; k++){
    const a = k * Math.PI / 2 + Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
    g.add(strut([c * 1.3, 1.4, s * 1.3], [c * 2.1, 0.12, s * 2.1], 0.07, m.metal));
    g.add(cyl(0.35, 0.4, 0.12, 12, m.dark, c * 2.1, 0.06, s * 2.1));
  }
  const deck = cyl(1.6, 1.6, 0.5, 8, m.gold, 0, 1.6, 0); deck.rotation.y = Math.PI / 8; g.add(deck);
  [[-0.5, 2.3, -0.5], [0.2, 2.3, -0.7]].forEach(p => g.add(sph(0.45, m.metal, p[0], p[1], p[2], 16, 12)));
  const drum = cyl(0.42, 0.42, 1.3, 16, m.hard, -0.3, 2.3, 0.6); drum.rotation.z = Math.PI / 2; g.add(drum);
  const rad = box(0.05, 1.4, 1.2, m.rad, -1.45, 2.6, 0); g.add(rad);
  [[0.75, -0.25], [1.25, -0.25], [0.75, 0.25], [1.25, 0.25]].forEach(p => g.add(cyl(0.035, 0.035, 3.2, 6, m.metal, p[0], 3.4, p[1])));
  g.add(box(0.7, 0.25, 0.7, m.dark, 1.0, 5.0, 0));
  const string = cyl(0.06, 0.06, 2.4, 10, m.metal, 1.0, 3.2, 0); g.add(string);
  const bit = sh(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 10), m.dark)); bit.rotation.x = Math.PI; g.add(bit);
  const panel = box(0.5, 0.4, 0.2, m.hard, -0.9, 1.95, 1.3); g.add(panel);
  const led = sph(0.045, m.ledA, -0.9, 2.2, 1.42, 8, 6); g.add(led);
  const lamp = box(0.25, 0.12, 0.2, m.head, 1.0, 4.8, 0.4); g.add(lamp);
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ map: labelTex('ICE PLANT 1', { size: 50, stripe: '#E0561B' }) }));
  lbl.position.set(0, 1.62, 1.62); g.add(lbl);
  const api = { group: g, string, bit, led, depth: 0 };
  api.setDrill = function(d){
    api.depth = d;
    string.position.y = 3.2 - d * 1.7;
    bit.position.set(1.0, 1.85 - d * 1.7, 0);
  };
  api.setDrill(0);
  return api;
};

/* ------------------------------------------------------------------ fission surface power */
MD.reactor = function(){
  const m = mats(), g = new THREE.Group();
  g.add(cyl(1.3, 1.6, 0.4, 16, m.dark, 0, 0.2, 0));
  const shield = sh(new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.6, 20), m.silver)); shield.position.y = 1.2; shield.rotation.x = Math.PI; g.add(shield);
  g.add(cyl(0.45, 0.45, 1.5, 16, m.metal, 0, 2.6, 0));
  g.add(cyl(0.12, 0.12, 4.0, 8, m.metal, 0, 5.0, 0));
  for (let k = 0; k < 6; k++){
    const a = k * Math.PI / 3;
    const p = box(0.9, 3.6, 0.04, m.rad, Math.cos(a) * 0.9, 5.1, Math.sin(a) * 0.9);
    p.rotation.y = -a + Math.PI / 2; p.rotation.z = 0.12;
    g.add(p);
  }
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshBasicMaterial({ map: labelTex('FSP-1  ⚠ EXCLUSION 100 M', { size: 30, stripe: '#E0561B', w: 512 }) }));
  lbl.position.set(0, 0.55, 1.62); g.add(lbl);
  return g;
};

/* ------------------------------------------------------------------ crop module */
MD.greenhouse = function(){
  const m = mats(), g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 7, 28, 1, true, -Math.PI / 2, Math.PI), m.grow);
  shell.rotation.z = Math.PI / 2; shell.position.y = 0.2; g.add(shell);
  [-3.5, 3.5].forEach(x => { const c = sh(new THREE.Mesh(new THREE.CircleGeometry(2.3, 28, 0, Math.PI), m.hard)); c.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2; c.position.set(x, 0.2, 0); g.add(c); });
  g.add(box(7.1, 0.25, 4.7, m.dark, 0, 0.12, 0));
  [-1, 1].forEach(z => {
    g.add(box(6.2, 0.1, 0.8, m.hard, 0, 1.0, z * 1.1));
    for (let i = 0; i < 12; i++){ const l = sph(0.2, m.leaf, -2.8 + i * 0.5, 1.2, z * 1.1, 8, 6); l.scale.y = 0.6; g.add(l); }
  });
  return g;
};
MD.greenhousePower = function(on){ const m = mats(); m.grow.emissiveIntensity = on ? 0.55 : 0; m.leaf.emissiveIntensity = on ? 0.25 : 0; };

MD.shelter = function(){
  const m = mats(), g = new THREE.Group();
  const s = cyl(1.7, 1.7, 4.2, 24, m.hard, 0, 0.55, 0); s.rotation.z = Math.PI / 2; g.add(s);
  for (let i = 0; i < 14; i++){
    const a = i / 14 * Math.PI;
    const b = box(0.9, 0.35, 0.55, m.regol, -1.6 + (i % 7) * 0.53, 0.55 + Math.sin(a) * 1.75, Math.cos(a) * 1.75);
    b.rotation.x = -a + Math.PI / 2; g.add(b);
  }
  g.add(box(0.9, 1.2, 0.1, m.orange, 2.15, 0.6, 0).rotateY(Math.PI / 2));
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshBasicMaterial({ map: labelTex('STORM SHELTER', { size: 44, stripe: '#E0561B' }) }));
  lbl.position.set(0, 1.9, 1.2); lbl.rotation.x = -0.6; g.add(lbl);
  return g;
};

/* ------------------------------------------------------------------ energy storage yard */
MD.yard = function(nBatt){
  const m = mats(), g = new THREE.Group(), units = [];
  const n = Math.max(1, nBatt);
  for (let i = 0; i < n; i++){
    const u = new THREE.Group(); u.position.set((i - (n - 1) / 2) * 2.8, 0, 0);
    u.add(box(2.1, 1.35, 1.25, m.hard, 0, 0.75, 0));
    for (let f = 0; f < 6; f++) u.add(box(0.05, 0.3, 1.2, m.rad, -0.8 + f * 0.32, 1.58, 0));
    const louver = new THREE.Group(); louver.position.set(0, 0.75, 0.64); u.add(louver);
    const slats = [];
    for (let s = 0; s < 5; s++){ const sl = box(1.7, 0.2, 0.03, m.silver, 0, -0.42 + s * 0.21, 0); louver.add(sl); slats.push(sl); }
    const led = sph(0.05, m.ledG, 0.85, 1.25, 0.64, 8, 6); u.add(led);
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.24), new THREE.MeshBasicMaterial({ map: labelTex('STRING ' + String.fromCharCode(65 + i), { size: 52, stripe: '#E0561B' }) }));
    lbl.position.set(-0.45, 1.27, 0.635); u.add(lbl);
    g.add(u); units.push({ g: u, slats, led });
  }
  const jb = new THREE.Group(); jb.position.set(0, 0, 2.4); g.add(jb);
  jb.add(box(1.2, 1.2, 0.7, m.hard, 0, 0.65, 0));
  jb.add(box(0.9, 0.5, 0.05, m.dark, 0, 0.8, 0.37));
  const jled = sph(0.05, m.ledG, 0.4, 1.1, 0.37, 8, 6); jb.add(jled);
  const jl = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.24), new THREE.MeshBasicMaterial({ map: labelTex('MAIN BUS JUNCTION', { size: 36, stripe: '#E0561B' }) }));
  jl.position.set(0, 1.12, 0.36); jb.add(jl);
  return { group: g, units, jled, setLouver(i, t){ const u = units[i]; if (!u) return; u.slats.forEach(s => s.rotation.x = t * 1.1); }, setLed(i, mat){ const u = units[i]; if (u) u.led.material = mat; } };
};

/* ------------------------------------------------------------------ regolith excavator */
MD.excavator = function(){
  const m = mats(), g = new THREE.Group();
  g.add(box(0.9, 0.5, 1.2, m.hard, 0, 0.55, 0));
  const drums = [];
  [-1, 1].forEach(s => {
    g.add(strut([0, 0.6, s * 0.55], [0, 0.5, s * 1.1], 0.05, m.metal));
    const d = cyl(0.36, 0.36, 1.0, 14, m.dark, 0, 0.42, s * 1.25); d.rotation.z = Math.PI / 2; g.add(d); drums.push(d);
  });
  g.userData.drums = drums;
  return g;
};

/* ------------------------------------------------------------------ markers */
MD.flag = function(text, color){
  const m = mats(), g = new THREE.Group();
  g.add(cyl(0.025, 0.025, 1.8, 6, m.metal, 0, 0.9, 0));
  const fm = new THREE.MeshBasicMaterial({ map: labelTex(text, { bg: color || '#E0561B', fg: '#140800', size: 56 }) });
  const f = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.32), fm); f.position.set(0.33, 1.62, 0.004); g.add(f);
  const fb = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.32), fm); fb.position.set(0.33, 1.62, -0.004); fb.rotation.y = Math.PI; g.add(fb);
  return g;
};
MD.siteMarker = function(text){
  const m = mats(), g = new THREE.Group();
  [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]].forEach(p => { g.add(cyl(0.05, 0.05, 1.1, 6, m.orange, p[0], 0.55, p[1])); });
  g.add(MD.flag(text, '#FFB020'));
  return g;
};
MD.boulder = function(size, seed){
  seed = seed || 3;
  const geo = new THREE.IcosahedronGeometry(1, 5);
  const p = geo.attributes.position, r = SS.rng(seed);
  const sx = 0.85 + r() * 0.3, sy = 0.62 + r() * 0.2, sz = 0.8 + r() * 0.3;
  const facets = [];
  for (let i = 0; i < 9; i++){ const v = new THREE.Vector3(r() - 0.5, r() * 0.6 - 0.1, r() - 0.5).normalize(); facets.push({ v, d: 0.78 + r() * 0.16 }); }
  const q = new THREE.Vector3();
  for (let i = 0; i < p.count; i++){
    q.set(p.getX(i), p.getY(i), p.getZ(i));
    let n = 1 + 0.16 * SS.noise(q.x * 1.8 + seed, q.z * 1.8 + q.y * 1.3) + 0.06 * SS.noise(q.x * 6 + seed, q.y * 6 - q.z * 3) + 0.025 * SS.noise(q.x * 17, q.z * 17 + q.y * 9);
    q.multiplyScalar(n);
    facets.forEach(f => { const dd = q.dot(f.v); if (dd > f.d) q.addScaledVector(f.v, -(dd - f.d) * 0.85); });
    p.setXYZ(i, q.x * sx, q.y * sy, q.z * sz);
  }
  geo.computeVertexNormals();
  if (!MD._boulderMat) MD._boulderMat = SS.world.mkMat({ color: 0xA29E97, roughness: 0.93, metalness: 0, map: SS.world.regolith.map, normalMap: SS.world.regolith.nrm, normalScale: new V2(1.2, 1.2) });
  const mesh = sh(new THREE.Mesh(geo, MD._boulderMat));
  mesh.scale.set(size, size, size);
  return mesh;
};
MD.cargoPallet = function(){
  const m = mats(), g = new THREE.Group();
  g.add(box(2.4, 0.3, 2.4, m.dark, 0, 0.3, 0));
  g.add(box(1.3, 1.6, 1.3, m.white, 0, 1.25, 0));
  g.add(cyl(0.34, 0.34, 1.3, 14, m.white, 0, 1.25, 0.95));
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.35), new THREE.MeshBasicMaterial({ map: labelTex('VSAT-01', { size: 60, stripe: '#E0561B' }) }));
  lbl.position.set(0, 1.4, 0.66); g.add(lbl);
  return g;
};

/* ------------------------------------------------------------------ astronaut */
MD.astronaut = function(opts){
  opts = opts || {};
  const m = mats(), g = new THREE.Group();
  const suit = opts.iva ? SS.world.mkMat({ color: 0x3B5E8C, roughness: 0.8 }) : m.suit;
  const root = new THREE.Group(); g.add(root);
  const hip = new THREE.Group(); hip.position.y = 0.98; root.add(hip);
  const torso = new THREE.Group(); hip.add(torso);
  const chest = cyl(0.3, 0.25, 0.66, 16, suit, 0, 0.36, 0); chest.scale.z = 0.8; torso.add(chest);
  torso.add(cyl(0.26, 0.24, 0.18, 14, suit, 0, 0.0, 0));
  if (!opts.iva){
    torso.add(box(0.32, 0.2, 0.12, m.dark, 0, 0.45, 0.25));
    const plss = box(0.54, 0.74, 0.3, m.hard, 0, 0.42, -0.34); torso.add(plss);
    torso.add(box(0.5, 0.1, 0.26, m.dark, 0, 0.82, -0.34));
    if (opts.stripes) [-0.25, 0.25].forEach(x => torso.add(box(0.03, 0.5, 0.5, m.orange, x, 0.35, 0)));
  }
  const head = new THREE.Group(); head.position.y = 0.82; torso.add(head);
  if (opts.iva){
    head.add(sph(0.12, SS.world.mkMat({ color: 0xC99873, roughness: 0.7 }), 0, 0.1, 0, 14, 10));
    const hair = sph(0.125, SS.world.mkMat({ color: 0x1E1A18, roughness: 0.9 }), 0, 0.14, -0.015, 14, 10); hair.scale.y = 0.75; head.add(hair);
  } else {
    head.add(sph(0.22, m.hard, 0, 0.1, -0.01, 20, 14));
    const vis = sph(0.225, m.visor, 0, 0.1, 0.02, 20, 14); vis.scale.set(0.95, 0.85, 0.9); head.add(vis);
    head.add(box(0.06, 0.05, 0.08, m.head, 0.16, 0.24, 0.1));
    head.add(box(0.06, 0.05, 0.08, m.head, -0.16, 0.24, 0.1));
  }
  const limbs = {};
  [['L', 1], ['R', -1]].forEach(([k, s]) => {
    const sh_ = new THREE.Group(); sh_.position.set(0.36 * s, 0.6, 0); torso.add(sh_);
    sh_.add(cyl(0.085, 0.08, 0.34, 10, suit, 0, -0.17, 0));
    const el = new THREE.Group(); el.position.y = -0.34; sh_.add(el);
    el.add(cyl(0.075, 0.07, 0.3, 10, suit, 0, -0.15, 0));
    el.add(sph(0.075, m.dark, 0, -0.33, 0, 10, 8));
    const hp = new THREE.Group(); hp.position.set(0.13 * s, 0, 0); hip.add(hp);
    hp.add(cyl(0.105, 0.095, 0.46, 10, suit, 0, -0.23, 0));
    const kn = new THREE.Group(); kn.position.y = -0.46; hp.add(kn);
    kn.add(cyl(0.09, 0.08, 0.44, 10, suit, 0, -0.22, 0));
    kn.add(box(0.15, 0.12, 0.3, m.dark, 0, -0.47, 0.05));
    limbs[k] = { sh: sh_, el, hp, kn };
  });
  const api = { group: g, root, hip, torso, head, limbs };
  api.pose = function(phase, amt, mode){
    const L = limbs.L, R = limbs.R;
    if (mode === 'sit'){
      [L, R].forEach(q => { q.hp.rotation.x = -1.45; q.kn.rotation.x = 1.35; q.sh.rotation.x = -0.5; q.el.rotation.x = -0.6; });
      hip.position.y = 0.98; torso.rotation.x = -0.05; return;
    }
    if (mode === 'kneel'){
      L.hp.rotation.x = -1.2; L.kn.rotation.x = 1.3; R.hp.rotation.x = 0.1; R.kn.rotation.x = 1.4;
      L.sh.rotation.x = R.sh.rotation.x = -0.9 + Math.sin(phase * 3) * 0.1; L.el.rotation.x = R.el.rotation.x = -0.5;
      hip.position.y = 0.62; torso.rotation.x = 0.35; return;
    }
    const sw = Math.sin(phase) * 0.5 * amt;
    L.hp.rotation.x = sw; R.hp.rotation.x = -sw;
    L.kn.rotation.x = Math.max(0, -Math.cos(phase)) * 0.7 * amt; R.kn.rotation.x = Math.max(0, Math.cos(phase)) * 0.7 * amt;
    L.sh.rotation.x = -sw * 0.6; R.sh.rotation.x = sw * 0.6;
    L.sh.rotation.z = 0.12; R.sh.rotation.z = -0.12;
    L.el.rotation.x = R.el.rotation.x = -0.35 - 0.2 * amt;
    hip.position.y = 0.98 + Math.abs(Math.sin(phase)) * 0.18 * amt;
    torso.rotation.x = 0.08 * amt;
  };
  api.pose(0, 0);
  return api;
};

/* ------------------------------------------------------------------ first-person tools */
MD.scoop = function(){
  const m = mats(), g = new THREE.Group();
  g.add(cyl(0.018, 0.018, 0.9, 8, m.metal, 0, 0.45, 0));
  g.add(box(0.14, 0.05, 0.18, m.metal, 0, 0.92, 0.06));
  g.add(box(0.06, 0.12, 0.05, m.orange, 0, 0.05, 0));
  return g;
};
MD.connector = function(){
  const m = mats(), g = new THREE.Group();
  const c = cyl(0.06, 0.06, 0.24, 12, m.orange); c.rotation.x = Math.PI / 2; g.add(c);
  g.add(cyl(0.03, 0.03, 0.4, 8, m.dark, 0, 0, -0.3).rotateX(Math.PI / 2));
  return g;
};
})();
