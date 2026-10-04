/* Shackleton Station — pressurized interiors: the lander airlock and the surface habitat.
   Each is its own scene; the habitat window shows a live render of the outside. */
(function(){
'use strict';
const SS = window.SS;
const I = SS.interior = {};

function std(p){ return new THREE.MeshStandardMaterial(p); }
function mesh(geo, mat, x, y, z){ const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); return m; }
function panelTex(kind, seed){
  const c = SS.canvas(256, 512), g = c.getContext('2d'), r = SS.rng(seed || 1);
  g.fillStyle = '#D9DCDF'; g.fillRect(0, 0, 256, 512);
  g.strokeStyle = 'rgba(80,86,94,0.5)'; g.lineWidth = 2; g.strokeRect(4, 4, 248, 504);
  if (kind === 'stow'){
    for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++){
      g.fillStyle = ['#E8E2D0', '#DCD6C4', '#EDE8DA'][Math.floor(r() * 3)];
      g.fillRect(14 + x * 120, 14 + y * 122, 108, 110);
      g.fillStyle = '#9AA0A8'; g.fillRect(14 + x * 120, 60 + y * 122, 108, 6);
      g.fillStyle = '#1E2A40'; g.font = '700 16px monospace'; g.fillText('CTB ' + (1000 + Math.floor(r() * 8999)), 22 + x * 120, 34 + y * 122);
    }
  } else if (kind === 'rack'){
    for (let y = 0; y < 6; y++){
      g.fillStyle = '#C3C8CE'; g.fillRect(14, 14 + y * 82, 228, 74);
      g.fillStyle = '#2B3038'; g.fillRect(24, 24 + y * 82, 60, 20);
      for (let k = 0; k < 5; k++){ g.fillStyle = r() < 0.7 ? '#39D07A' : '#F5B324'; g.fillRect(100 + k * 18, 30 + y * 82, 8, 8); }
      g.fillStyle = '#5E6670'; g.fillRect(190, 26 + y * 82, 40, 50);
    }
  } else if (kind === 'galley'){
    g.fillStyle = '#C7CCD2'; g.fillRect(14, 14, 228, 200);
    g.fillStyle = '#20252C'; g.fillRect(30, 40, 90, 60);
    g.fillStyle = '#3F8FD8'; g.fillRect(150, 40, 70, 30);
    g.fillStyle = '#E8E2D0'; for (let y = 0; y < 3; y++) g.fillRect(14, 240 + y * 88, 228, 76);
  }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
function screenTex(title, lines){
  const c = SS.canvas(512, 320), g = c.getContext('2d');
  g.fillStyle = '#0F2233'; g.fillRect(0, 0, 512, 320);
  g.fillStyle = '#1B3A55'; g.fillRect(0, 0, 512, 44);
  g.fillStyle = '#E6F1FA'; g.font = '700 26px monospace'; g.fillText(title, 16, 31);
  g.font = '20px monospace';
  (lines || []).forEach((l, i) => { g.fillStyle = l[1] || '#9FD3F2'; g.fillText(l[0], 18, 82 + i * 34); });
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
I.screenTex = screenTex;

/* ------------------------------------------------------------------ habitat interior */
function buildHab(){
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x05070A);
  const R = 2.8, L = 9.4, cy = 1.4;
  const wallMat = std({ color: 0xE3E5E6, roughness: 0.8, side: THREE.BackSide });
  const shell = mesh(new THREE.CylinderGeometry(R, R, L, 40, 1, true), wallMat, 0, cy, 0);
  shell.rotation.z = Math.PI / 2; s.add(shell);
  const capMat = std({ color: 0xD4D8DB, roughness: 0.7, side: THREE.DoubleSide });
  const capW = mesh(new THREE.CircleGeometry(R, 40), capMat, -L / 2, cy, 0); capW.rotation.y = Math.PI / 2; s.add(capW);
  const capE = mesh(new THREE.CircleGeometry(R, 40), capMat, L / 2, cy, 0); capE.rotation.y = -Math.PI / 2; s.add(capE);
  s.add(mesh(new THREE.BoxGeometry(L, 0.08, 2.4), std({ color: 0x8A9098, roughness: 0.6, metalness: 0.3 }), 0, -0.04, 0));
  for (let x = -4; x <= 4; x += 0.8) s.add(mesh(new THREE.BoxGeometry(0.02, 0.01, 2.3), std({ color: 0x5E646C }), x, 0.005, 0));
  /* ceiling light strips */
  const lightMat = std({ color: 0xFFFFFF, emissive: 0xFFF3E0, emissiveIntensity: 1.2 });
  [-0.55, 0.55].forEach(z => s.add(mesh(new THREE.BoxGeometry(8.2, 0.05, 0.18), lightMat, 0, 3.72, z)));
  const lamps = [-3, 0, 3].map(x => { const l = new THREE.PointLight(0xFFF1DE, 0.9, 9, 1.6); l.position.set(x, 3.2, 0); s.add(l); return l; });
  const hemi = new THREE.HemisphereLight(0xF2F4F8, 0x6A6F76, 0.45); s.add(hemi);
  /* racks along both walls */
  const rackFace = (kind, seed) => std({ map: panelTex(kind, seed), roughness: 0.7 });
  const racks = [
    { x: -3.0, z: -1, kind: 'stow' }, { x: -1.9, z: -1, kind: 'eclss' }, { x: -0.8, z: -1, kind: 'rack' },
    { x: 0.3, z: -1, kind: 'eps' }, { x: 1.4, z: -1, kind: 'rack' }, { x: 2.5, z: -1, kind: 'stow' },
    { x: -3.0, z: 1, kind: 'shelter' }, { x: -1.9, z: 1, kind: 'galley' }, { x: -0.8, z: 1, kind: 'stow' },
    { x: 0.3, z: 1, kind: 'rack' }, { x: 1.4, z: 1, kind: 'stow' }, { x: 2.5, z: 1, kind: 'rack' }
  ];
  const screens = {};
  racks.forEach((r, i) => {
    const depth = 0.62, w = 1.02, h = 2.2;
    const body = mesh(new THREE.BoxGeometry(w, h, depth), std({ color: 0xC9CDD2, roughness: 0.6 }), r.x, h / 2 + 0.05, r.z * (1.58));
    s.add(body);
    const kind = r.kind === 'eclss' || r.kind === 'eps' ? 'rack' : r.kind === 'shelter' ? 'stow' : r.kind;
    const face = mesh(new THREE.PlaneGeometry(w - 0.04, h - 0.04), rackFace(kind, i + 3), r.x, h / 2 + 0.05, r.z * (1.58 - depth / 2 - 0.002));
    if (r.z > 0) face.rotation.y = Math.PI;
    s.add(face);
    if (r.kind === 'eclss' || r.kind === 'eps'){
      const tex = screenTex(r.kind === 'eclss' ? 'ECLSS' : 'EPS', [['STANDBY', '#F5B324']]);
      const scr = mesh(new THREE.PlaneGeometry(0.62, 0.39), std({ map: tex, emissive: 0xFFFFFF, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.3 }), r.x, 1.45, r.z * (1.58 - depth / 2 - 0.006));
      s.add(scr); screens[r.kind] = { mesh: scr, tex };
      const tag = mesh(new THREE.PlaneGeometry(0.62, 0.1), std({ map: SS.models.labelTex(r.kind === 'eclss' ? 'ECLSS RACK 1' : 'EPS RACK 2', { size: 44, w: 256, h: 42, stripe: '#E0561B' }) }), r.x, 1.8, r.z * (1.58 - depth / 2 - 0.006));
      s.add(tag);
    }
    if (r.kind === 'shelter'){
      const hatch = mesh(new THREE.CircleGeometry(0.42, 24), std({ color: 0xE0561B, roughness: 0.5 }), r.x, 1.0, r.z * (1.58 - depth / 2 - 0.006));
      hatch.rotation.y = Math.PI; s.add(hatch);
      const tag = mesh(new THREE.PlaneGeometry(0.8, 0.14), std({ map: SS.models.labelTex('STORM SHELTER', { size: 40, w: 256, h: 44, stripe: '#E0561B' }) }), r.x, 1.62, r.z * (1.58 - depth / 2 - 0.006));
      tag.rotation.y = Math.PI; s.add(tag);
      screens.shelterHatch = hatch; screens.shelterTag = tag;
    }
  });
  /* table and laptops */
  s.add(mesh(new THREE.BoxGeometry(1.0, 0.05, 0.6), std({ color: 0x6E757E, metalness: 0.4, roughness: 0.5 }), 1.8, 0.92, 0));
  s.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8), std({ color: 0x6E757E }), 1.8, 0.46, 0));
  /* hatch to airlock (east) */
  const hatchMat = std({ color: 0xB9BEC4, roughness: 0.4, metalness: 0.4 });
  const hatch = mesh(new THREE.BoxGeometry(0.1, 1.9, 1.1), hatchMat, L / 2 - 0.06, 1.05, 0); s.add(hatch);
  s.add(mesh(new THREE.BoxGeometry(0.12, 0.08, 0.5), std({ color: 0xE0561B }), L / 2 - 0.12, 1.05, 0.3));
  /* window (west) with live exterior view */
  const rt = new THREE.WebGLRenderTarget(640, 400);
  rt.texture.encoding = THREE.sRGBEncoding;
  const win = mesh(new THREE.CircleGeometry(0.62, 40), new THREE.MeshBasicMaterial({ map: rt.texture }), -L / 2 + 0.03, 1.7, 0);
  win.rotation.y = Math.PI / 2; s.add(win);
  const frame = mesh(new THREE.TorusGeometry(0.64, 0.06, 10, 40), std({ color: 0x3A4048, metalness: 0.6, roughness: 0.4 }), -L / 2 + 0.05, 1.7, 0);
  frame.rotation.y = Math.PI / 2; s.add(frame);
  /* IV crewmember */
  const iv = SS.models.astronaut({ iva: true });
  iv.group.position.set(2.1, 0, 0.55); iv.group.rotation.y = -Math.PI / 2 - 0.4; iv.pose(0, 0);
  s.add(iv.group);

  const H = I.hab = {
    scene: s, lamps, hemi, lightMat, screens, rt, win, iv,
    bounds: { x0: -4.3, x1: 4.2, z0: -0.72, z1: 0.72 },
    spots: {
      eclss: { x: -1.9, z: -0.72, look: -Math.PI / 2 },
      eps:   { x: 0.3, z: -0.72 },
      hatch: { x: 4.2, z: 0 },
      shelter: { x: -3.0, z: 0.72 },
      window: { x: -4.3, z: 0 },
      spawn: { x: 3.5, z: 0, yaw: Math.PI / 2 }
    },
    winCam: new THREE.PerspectiveCamera(58, 640 / 400, 0.5, 6000)
  };
  H.setMode = function(mode){                     // 'on' | 'night' | 'off' | 'storm'
    const k = mode === 'on' ? 1 : mode === 'night' ? 0.55 : mode === 'storm' ? 0.4 : 0.12;
    lamps.forEach(l => { l.intensity = 0.9 * k; l.color.set(mode === 'off' ? 0xFF4030 : 0xFFF1DE); });
    hemi.intensity = 0.45 * k;
    lightMat.emissiveIntensity = 1.2 * k;
    lightMat.emissive.set(mode === 'off' ? 0xFF3020 : 0xFFF3E0);
  };
  H.setScreen = function(kind, title, lines){
    const sc = screens[kind]; if (!sc) return;
    const t = screenTex(title, lines);
    sc.mesh.material.map = t; sc.mesh.material.emissiveMap = t; sc.mesh.material.needsUpdate = true;
  };
  H.setShelter = function(has){ screens.shelterHatch.visible = has; screens.shelterTag.visible = has; };
  H.setMode('on');
}

/* ------------------------------------------------------------------ lander airlock */
function buildAirlock(){
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x05070A);
  const wall = std({ color: 0xCDD1D5, roughness: 0.75, side: THREE.BackSide });
  s.add(mesh(new THREE.BoxGeometry(2.4, 2.4, 2.8), wall, 0, 1.2, 0));
  s.add(mesh(new THREE.BoxGeometry(2.3, 0.04, 2.7), std({ color: 0x777D85, roughness: 0.5, metalness: 0.4 }), 0, 0.02, 0));
  const light = std({ color: 0xFFFFFF, emissive: 0xE6F0FF, emissiveIntensity: 1.3 });
  s.add(mesh(new THREE.BoxGeometry(1.4, 0.04, 0.2), light, 0, 2.38, -0.4));
  const lamp = new THREE.PointLight(0xE6F0FF, 1.0, 7, 1.5); lamp.position.set(0, 2.0, -0.3); s.add(lamp);
  const hemi = new THREE.HemisphereLight(0xEEF2F8, 0x555A61, 0.35); s.add(hemi);
  /* outer hatch at +z */
  const hatchG = new THREE.Group(); hatchG.position.set(-0.55, 1.05, 1.38); s.add(hatchG);
  const door = mesh(new THREE.BoxGeometry(1.1, 1.75, 0.08), std({ color: 0xE0561B, roughness: 0.5 }), 0.55, 0, 0); hatchG.add(door);
  const port = mesh(new THREE.CircleGeometry(0.16, 20), std({ color: 0xFFFFFF, emissive: 0xFFF6E2, emissiveIntensity: 2.2 }), 0.55, 0.35, -0.045);
  port.rotation.y = Math.PI; hatchG.add(port);
  const glow = new THREE.PointLight(0xFFF6E2, 0, 6, 1.4); glow.position.set(0, 1.1, 1.0); s.add(glow);
  /* depress panel on the right wall */
  const pnl = mesh(new THREE.BoxGeometry(0.06, 0.55, 0.5), std({ color: 0x2C3139, roughness: 0.5 }), -1.17, 1.35, 0.55); s.add(pnl);
  const gaugeTex = screenTex('AIRLOCK', [['P  10.2 psi', '#39D07A']]);
  const gauge = mesh(new THREE.PlaneGeometry(0.42, 0.26), std({ map: gaugeTex, emissive: 0xFFFFFF, emissiveMap: gaugeTex, emissiveIntensity: 0.9 }), -1.13, 1.45, 0.55);
  gauge.rotation.y = Math.PI / 2; s.add(gauge);
  const valve = mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 16), std({ color: 0xE0561B }), -1.12, 1.18, 0.55); valve.rotation.y = Math.PI / 2; s.add(valve);
  /* suit stowage behind */
  s.add(mesh(new THREE.BoxGeometry(0.8, 1.3, 0.4), std({ map: panelTex('stow', 12) }), -0.6, 0.9, -1.15));
  s.add(mesh(new THREE.BoxGeometry(0.8, 1.3, 0.4), std({ map: panelTex('rack', 13) }), 0.4, 0.9, -1.15));
  I.airlock = {
    scene: s, hatchG, glow, gauge, valve, lamp,
    bounds: { x0: -0.85, x1: 0.85, z0: -0.75, z1: 0.95 },
    spots: { valve: { x: -0.7, z: 0.55 }, hatch: { x: 0, z: 1.2 }, spawn: { x: 0, z: -0.45, yaw: Math.PI } },
    setPressure(p){
      const t = screenTex('AIRLOCK', [['P ' + p.toFixed(1).padStart(5) + ' psi', p > 0.3 ? '#F5B324' : '#39D07A'], [p > 0.3 ? 'DEPRESS IN WORK' : 'EQUALIZED', '#9FD3F2']]);
      gauge.material.map = t; gauge.material.emissiveMap = t; gauge.material.needsUpdate = true;
    },
    setHatch(t){ hatchG.rotation.y = -t * 1.7; glow.intensity = t * 2.5; }
  };
}

I.build = function(){ buildHab(); buildAirlock(); };

/* live window: render the outside from the habitat's west end */
I.renderWindow = function(renderer){
  const H = I.hab, M = SS.MAP, W = SS.world;
  const x = M.hab.x - 5.0, z = M.hab.z, y = W.H(x, z) + 4.8;
  H.winCam.position.set(x, y, z);
  H.winCam.rotation.order = 'YXZ';
  H.winCam.rotation.set(-0.04, Math.PI / 2, 0);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(H.rt);
  renderer.render(W.scene, H.winCam);
  renderer.setRenderTarget(prev);
};
})();
