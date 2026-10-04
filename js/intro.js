/* Shackleton Station — opening walkthrough. A captioned fly-through of the whole training flow,
   staged in the real scene: keyframed camera, the actual hardware, and two suited crew. The side
   panels mirror the consoles each chapter uses. Esc or Skip returns to the title at any point. */
(function(){
'use strict';
const SS = window.SS;
const IN = SS.intro = { active: false, paused: false };
const $ = id => document.getElementById(id);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const span = (t, a, b) => clamp01((t - a) / (b - a));
const easeS = x => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(x));
const easeIO = x => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TOUCH = matchMedia('(pointer: coarse)').matches;

let W, M, B, R, MD, O, ST, I;
let S = [], GROUPS = [], D = null, BOOT_SUN = null, lamp = null, routePts = [];
const A = {};
const tmp = V(0, 0, 0), tmp2 = V(0, 0, 0), UP = V(0, 1, 0);
const mtx = new THREE.Matrix4(), qT = new THREE.Quaternion();
const pose = { p: V(0, 0, 0), l: V(0, 0, 0) };
const GP = (x, h, z) => V(x, W.H(x, z) + h, z);

/* ------------------------------------------------------------------ camera keyframes
   Hermite through positions and look targets with non-uniform Catmull-Rom tangents, so motion is
   continuous through every key and eases in and out at the ends of each shot. */
function keyed(keys){
  const n = keys.length;
  const m = keys.map((k, i) => {
    if (i === 0 || i === n - 1) return { p: V(0, 0, 0), l: V(0, 0, 0) };
    const a = keys[i - 1], b = keys[i + 1], dt = b.t - a.t;
    return { p: b.p.clone().sub(a.p).divideScalar(dt), l: b.l.clone().sub(a.l).divideScalar(dt) };
  });
  return function(t, out){
    if (t <= keys[0].t){ out.p.copy(keys[0].p); out.l.copy(keys[0].l); return out; }
    if (t >= keys[n - 1].t){ out.p.copy(keys[n - 1].p); out.l.copy(keys[n - 1].l); return out; }
    let i = 0; while (t > keys[i + 1].t) i++;
    const a = keys[i], b = keys[i + 1], h = b.t - a.t, s = (t - a.t) / h, s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    out.p.set(0, 0, 0).addScaledVector(a.p, h00).addScaledVector(m[i].p, h10 * h).addScaledVector(b.p, h01).addScaledVector(m[i + 1].p, h11 * h);
    out.l.set(0, 0, 0).addScaledVector(a.l, h00).addScaledVector(m[i].l, h10 * h).addScaledVector(b.l, h01).addScaledVector(m[i + 1].l, h11 * h);
    return out;
  };
}
function lookQ(p, l, out){ mtx.lookAt(p, l, UP); return out.setFromRotationMatrix(mtx); }

/* ------------------------------------------------------------------ outpost states */
function gState(kind){
  const full = { vsat: 2, fsp: 0, battery: 1, hab: 'inflatable', eclss: 1, isru: 1, greenhouse: 1, shelter: 0, excavator: 1 };
  const early = Object.assign({}, full, { isru: 0, greenhouse: 0, excavator: 0 });
  const dec = Object.assign(O.decisionsDefault(), { siteId: 'R-B', siteKind: 'ridge' });
  const flags = { powerOn: true, array1: true, arraysAll: true, palletTaken: true, arrayYaw: Math.PI - BOOT_SUN.az * SS.DEG };
  if (kind === 'bare') return { man: early, flags: { powerOn: false, palletTaken: false }, dec: O.decisionsDefault(), sol: 1 };
  if (kind === 'power') return { man: early, flags: { powerOn: false, array1: true, arraysAll: false, palletTaken: true }, dec, sol: 3 };
  if (kind === 'night') return { man: Object.assign({}, full, { battery: 2 }), flags, dec, sol: 13, nightShedGH: true };
  return { man: full, flags, dec, sol: 8 };                       // 'full' is the title-screen outpost
}
function setBase(kind){
  D.base = kind; B.sync(gState(kind));
  W.cable.reset([]); W.clearDecals(); B.o.isru.setDrill(0);
  if (kind === 'bare') B.put(B.o.pallet, M.cargo.x, M.cargo.z, 0.3);
}
function setSun(kind){                              // shares story.js's W._sun cache so chapters re-bake when needed
  const s = kind === 'night' ? ST.sunForSol(13) : BOOT_SUN;
  D.sun = kind;
  if (W._sun && W._sun.az === s.az && W._sun.el === s.el) return;
  W.setSun(s.az, s.el); W._sun = { az: s.az, el: s.el };
}

/* ------------------------------------------------------------------ LTV */
function ltvLights(on){ R.spots.forEach(s => { s.intensity = on ? 3.2 : 0; }); R.model.lightMat.emissiveIntensity = on ? 2.4 : 0; }
function ltvPark(x, z, h, lights){
  R.tow = null; R.paying = false; R.lastPay = null;
  R.x = x; R.z = z; R.h = h; R.v = 0; R.steer = 0; R.settle(1);
  R.model.wheels[0].g.rotation.y = R.model.wheels[1].g.rotation.y = 0;
  ltvLights(!!lights);
  R.ev2.group.visible = false;
}
function ltvDrive(curve, s, dt){
  const p = curve.getPointAt(clamp01(s)), tg = curve.getTangentAt(clamp01(s));
  const h = Math.atan2(tg.x, tg.z);
  let moved = Math.hypot(p.x - R.x, p.z - R.z);
  const jump = moved > 3;
  if (jump) moved = 0;
  const v = dt > 0 ? moved / dt : 0;
  if (dt > 0 && !jump){
    const dh = SS.angDiff(R.h, h) / dt;
    R.steer = SS.damp(R.steer, SS.clamp(Math.atan2(dh * 2.5, Math.max(v, 0.6)), -0.5, 0.5), 6, dt);
  }
  R.x = p.x; R.z = p.z; R.h = h; R.v = v;
  R.settle(jump || dt === 0 ? 1 : SS.clamp(dt * 8, 0, 1));
  R.model.wheels.forEach(w => { w.spin.rotation.x += moved / 0.46; });
  R.model.wheels[0].g.rotation.y = R.model.wheels[1].g.rotation.y = R.steer;
  const fx = Math.sin(R.h), fz = Math.cos(R.h), rx = Math.cos(R.h), rz = -Math.sin(R.h);
  D.trackAcc = (D.trackAcc || 0) + moved;
  if (D.trackAcc > 0.9){
    D.trackAcc = 0;
    [1, -1].forEach(k => W.track(R.x - fx * 1.25 + rx * 0.98 * k, R.z - fz * 1.25 + rz * 0.98 * k, R.h + Math.PI / 2));
  }
  if (v > 0.7) [1, -1].forEach(k => {
    const wx = R.x - fx * 1.25 + rx * 0.98 * k, wz = R.z - fz * 1.25 + rz * 0.98 * k;
    W.dust(wx, W.H(wx, wz) + 0.1, wz, -fx * v * 0.5, -fz * v * 0.5, Math.ceil(v * 0.8), 0.35, 0.6 + v * 0.35);
  });
  if (R.tow){
    const hx = R.x - fx * 1.85, hz = R.z - fz * 1.85, t = R.tow;
    const dx = t.x - hx, dz = t.z - hz, d = Math.hypot(dx, dz) || 1;
    t.x = hx + dx / d * 2.6; t.z = hz + dz / d * 2.6; t.h = Math.atan2(-dx, -dz);
    t.obj.position.set(t.x, W.H(t.x, t.z) + 0.05, t.z); t.obj.rotation.y = t.h;
  }
  if (R.paying){
    const hx = R.x - fx * 1.8, hz = R.z - fz * 1.8;
    if (!R.lastPay || SS.dist(hx, hz, R.lastPay.x, R.lastPay.z) > 1.6){ W.cable.add(hx, hz); R.lastPay = { x: hx, z: hz }; }
    R.model.reel.rotation.x += moved * 1.4;
  }
}
const flat = pts => new THREE.CatmullRomCurve3(pts.map(p => V(p[0], 0, p[1])), false, 'centripetal');

/* ------------------------------------------------------------------ crew */
function mkAstro(opts){
  const m = MD.astronaut(opts);
  m.group.visible = false; W.scene.add(m.group);
  return { m, x: 0, z: 0, y: null, yaw: 0, phase: 0, v: 0, amp: null, pose: 'walk', vis: false, px: 0, pz: 0, step: 0 };
}
function aPlace(a, x, z, yaw, p){
  if (a.m.group.parent !== W.scene) W.scene.add(a.m.group);
  a.m.group.position.set(0, 0, 0); a.m.group.rotation.set(0, 0, 0);
  Object.assign(a, { x, z, yaw: yaw || 0, pose: p || 'walk', y: null, amp: null, v: 0, vis: true, px: x, pz: z, seat: false });
}
function aHide(a){ a.vis = false; a.m.group.visible = false; }
function aSeat(a){                                   // ride in the LTV driver's seat
  R.model.body.add(a.m.group);
  a.m.group.position.set(0.42, 0.14, -0.05); a.m.group.rotation.set(0, 0, 0);
  a.m.pose(0, 0, 'sit'); a.m.group.visible = true; a.vis = true; a.seat = true;
}
function aUpdate(a, dt){
  const g = a.m.group;
  g.visible = a.vis;
  if (!a.vis || a.seat) return;
  const moved = Math.hypot(a.x - a.px, a.z - a.pz);
  const sp = dt > 0 && moved < 2 ? moved / dt : 0;
  a.v = dt > 0 ? SS.damp(a.v, sp, 8, dt) : a.v;
  a.phase += a.v * dt * 3.1;
  if (a.v > 0.3 && a.y === null){
    const st = Math.floor(a.phase / Math.PI);
    if (st !== a.step){
      a.step = st;
      const s = st % 2 ? 1 : -1, fx = a.x + Math.cos(a.yaw) * 0.13 * s, fz = a.z - Math.sin(a.yaw) * 0.13 * s;
      W.bootprint(fx, fz, a.yaw - Math.PI / 2);
      if (a.v > 1.8) W.dust(fx, W.H(fx, fz), fz, 0, 0, 3, 0.3, 0.6);
    }
  }
  g.position.set(a.x, a.y !== null ? a.y : W.H(a.x, a.z), a.z);
  g.rotation.y = a.yaw;
  if (a.pose === 'kneel') a.m.pose(SS.clock.ui, 1, 'kneel');
  else a.m.pose(a.phase, a.amp !== null ? a.amp : SS.clamp(a.v / 2.5, 0, 1));
  a.px = a.x; a.pz = a.z;
}
function aMove(a, x0, z0, x1, z1, s){ a.x = SS.lerp(x0, x1, s); a.z = SS.lerp(z0, z1, s); if (Math.hypot(x1 - x0, z1 - z0) > 0.01) a.yaw = Math.atan2(x1 - x0, z1 - z0); }
const faceTo = (a, x, z) => { a.yaw = Math.atan2(x - a.x, z - a.z); };
function headPos(a, out){ a.m.head.getWorldPosition(out); return out; }
function lampOn(on){ D.lamp = on; if (!on) lamp.intensity = 0; }
function lampFollow(){
  if (!D.lamp || !A.ev1.vis) { lamp.intensity = 0; return; }
  headPos(A.ev1, tmp);
  const fx = Math.sin(A.ev1.yaw), fz = Math.cos(A.ev1.yaw);
  lamp.position.set(tmp.x + fx * 0.25, tmp.y + 0.22, tmp.z + fz * 0.25);
  lamp.target.position.set(tmp.x + fx * 3.4, tmp.y - 1.3, tmp.z + fz * 3.4);
  lamp.target.updateMatrixWorld();
  lamp.intensity = 3.0;
}

/* ------------------------------------------------------------------ interior screens */
function setPressure(p){
  const g = I.airlock.gauge, old = g.material.map;
  I.airlock.setPressure(p);
  if (old && old !== g.material.map) old.dispose();
}
function setScreen(kind, title, lines){
  const sc = I.hab.screens[kind], old = sc && sc.mesh.material.map;
  I.hab.setScreen(kind, title, lines);
  if (old && sc && old !== sc.mesh.material.map) old.dispose();
}

/* ------------------------------------------------------------------ side panels
   Panels are declarative timelines: data-at / data-cls / data-cur / data-done toggle classes,
   data-num / data-bar / data-clock tween values (segments "from,to,t0,t1|..."), data-seq swaps text. */
function li(text, cur, done, extra){ return '<li' + (cur !== undefined ? ' data-cur="' + cur + '"' : '') + (done !== undefined ? ' data-done="' + done + '"' : '') + (extra || '') + '>' + text + '</li>'; }
function head(a, b){ return '<header><span>' + a + '</span><span>' + (b || '') + '</span></header>'; }
const PANELS = {
  stats: () => head('Training increment', 'SIM 07') +
    '<div class="ip-stats">' + [['4', 'crew · you are EV1'], ['45', 'sols on the surface'], ['26 t', 'of cargo to choose'], ['7', 'chapters, in flight order'], ['6', 'flight rules to hold'], ['2.6 s', 'radio round trip to Earth']]
      .map((s, i) => '<div data-at="' + (0.6 + i * 0.35).toFixed(2) + '"><b>' + s[0] + '</b><small>' + s[1] + '</small></div>').join('') + '</div>',

  manifest: () => {
    const base = { vsat: 2, fsp: 0, battery: 0, hab: 'inflatable', eclss: 1, isru: 1, greenhouse: 1, shelter: 0, excavator: 1 };
    const fixd = Object.assign({}, base, { battery: 2 });
    const mA = O.mass(base), mB = O.mass(fixd), BUD = O.C.BUDGET;
    const pA = O.frr(base).polls, pB = O.frr(fixd);
    const item = id => O.ITEMS.find(x => x.id === id);
    const rows = [['vsat', 2], ['hab'], ['eclss', 1], ['isru', 1], ['greenhouse', 1], ['excavator', 1]].map((r, i) => {
      const it = item(r[0]), mass = r[0] === 'hab' ? it.choice[0].mass : it.mass * r[1];
      const name = r[0] === 'hab' ? it.name + ' · ' + it.choice[0].name.toLowerCase() : it.name + (r[1] > 1 ? ' ×' + r[1] : '');
      return '<li data-at="' + (0.6 + i * 0.36).toFixed(2) + '"><span>' + esc(name) + '</span><em>' + mass.toFixed(1) + ' t</em></li>';
    }).join('');
    const bat = item('battery');
    const polls = pA.map((p, i) => {
      const fix = pB.polls[i] || p, flip = p.s !== fix.s;
      const lab = s => s === 'nogo' ? 'NO-GO' : s === 'caution' ? 'CAUTION' : 'GO';
      return '<li data-at="' + (3.4 + i * 0.3).toFixed(2) + '"><b>' + p.c + '</b><span class="s ' + p.s + '"' + (flip ? ' data-cls="' + fix.s + '@6.7"' : '') +
        (flip ? ' data-seq=\'' + JSON.stringify([[0, lab(p.s)], [6.7, lab(fix.s)]]).replace(/'/g, '&#39;') + '\'' : '') + '>' + lab(p.s) + '</span></li>';
    }).join('');
    const nogo = pA.find(p => p.s === 'nogo');
    return head('Cargo manifest · CL-2', '<b class="ip-mono" data-num="0,' + mA + ',0.6,2.6|' + mA + ',' + mB + ',6.0,6.6" data-suf=" t">0.0 t</b>') +
      '<div class="ip-track"><i data-bar="0,' + (mA / BUD * 100).toFixed(1) + ',0.6,2.6|' + (mA / BUD * 100).toFixed(1) + ',' + (mB / BUD * 100).toFixed(1) + ',6.0,6.6"></i><b class="lim" title="26 t allocation"></b></div>' +
      '<div class="ip-cap"><span>0 t</span><span>' + BUD + ' t allocation</span></div>' +
      '<ul class="ip-list">' + rows + '<li class="add" data-at="6.0"><span>+ ' + esc(bat.name) + ' ×2</span><em>' + (bat.mass * 2).toFixed(1) + ' t</em></li></ul>' +
      '<div class="ip-sub" data-at="3.2">Console poll</div><ul class="ip-poll">' + polls + '</ul>' +
      (nogo ? '<p class="ip-note bad" data-cls="on@4.6 gone@6.7">' + nogo.c + ': no storage — the habitat bus cannot hold through six sols of darkness.</p>' +
              '<p class="ip-note good" data-at="6.9">Fixed with storage: minimum state of charge ' + Math.round(pB.projection.minSOC * 100) + '% through darkness.</p>' : '');
  },

  dcm: () => head('DCM · suit display &amp; control', 'PG 2 · PRE-EVA') +
    '<div class="ip-lcd" data-seq=\'' + JSON.stringify([[0, 'PWR EXT   FAN OFF'], [0.5, 'PWR BATT  FAN OFF'], [1.0, 'PWR BATT  FAN ON'], [1.5, 'O2 ON     P 4.3 PSI'], [2.0, 'H2O ON    COOLING'], [2.2, 'LEAK CHK  HOLD...'], [3.0, 'LEAK CHK  0.0 PSI/MIN'], [3.1, 'DEPRESS IN WORK'], [4.6, 'EQUALIZED · OPEN HATCH']]) + '\'></div>' +
    '<div class="ip-sw">' + [['PWR', 'EXT', 'BATT', 0.5], ['FAN', 'OFF', 'ON', 1.0], ['O₂', 'OFF', 'ON', 1.5], ['H₂O', 'OFF', 'ON', 2.0], ['PURGE', 'CLSD', 'CLSD', 99, 'g'], ['COMM', 'A', 'A', 0]]
      .map(s => '<div class="sw' + (s[4] ? ' guard' : '') + '" data-cls="up@' + s[3] + '"><i></i><b>' + s[0] + '</b><small data-seq=\'' + JSON.stringify([[0, s[1]], [s[3], s[2]]]) + '\'>' + s[1] + '</small></div>').join('') + '</div>' +
    '<ol class="ip-cuff">' + li('PWR — BATT', 0, 0.5) + li('FAN — ON', 0.5, 1.0) + li('O₂ — ON', 1.0, 1.5) + li('H₂O — ON', 1.5, 2.0) + li('LEAK CHECK — hold 3 s', 2.0, 3.0) + li('DEPRESS — 0.0 psi', 3.0, 4.6) + '</ol>' +
    '<div class="ip-row big"><span>Airlock</span><b data-num="10.2,0,3.1,4.6" data-suf=" psi">10.2 psi</b></div>' +
    '<p class="ip-note">Circulation before oxygen: the fan goes on before O₂.</p>',

  suit: () => head('Your HUD · PLSS', 'EVA 1') +
    '<div class="ip-row big"><span>O₂ primary</span><b data-seq=\'' + JSON.stringify([[0, '8:00'], [2.5, '7:59']]) + '\'>8:00</b></div>' +
    '<div class="ip-track ok"><i style="width:100%"></i><b class="lim" style="left:12.5%"></b></div>' +
    '<div class="ip-grid"><div><span>Suit</span><b>4.3 psi</b></div><div><span>ppCO₂</span><b>0.9</b></div>' +
    '<div><span>Metabolic</span><b data-num="110,265,0.4,2.2" data-dec="0" data-suf=" W">110 W</b></div><div><span>Dose</span><b data-num="0,0.02,0,5" data-dec="2" data-suf=" mSv">0.00 mSv</b></div>' +
    '<div><span>Ext temp</span><b>−22 °C</b></div><div><span>Walkback</span><b class="ok" data-at="1.2">+7:42</b></div></div>' +
    '<p class="ip-note">Walkback margin is oxygen left minus the time to walk to an airlock. When it hits zero, you turn around.</p>',

  photo: () => head('Station 1 · geology', 'ST-1') +
    '<div class="ip-photo"><canvas id="iThumb" width="320" height="200"></canvas><span class="vf"></span><span class="lab" data-at="2.3">CONTEXT · ST-1 · 60 mm</span></div>' +
    '<ul class="ip-list">' + li('<span>Context photo</span><em data-at="2.3">downlinked</em>', 0, 2.3) + li('<span>Scoop sample</span><em data-at="4.0">bagged · 412 g</em>', 2.3, 4.0) + '</ul>' +
    '<p class="ip-note">Geology is why crews go: photograph before you touch, then sample.</p>',

  site: () => {
    const r = [O.illum('ridge', false), O.illum('ridge', true)], f = [O.illum('flat', false), O.illum('flat', true)];
    const pc = x => Math.round(x * 100) + '%';
    return head('Site selection', 'VSAT-01') +
      '<div class="ip-sites"><div class="site" data-cls="pick@2.4"><b>Ridge B</b><small>Daylight ' + pc(r[0]) + ' · darkness ' + pc(r[1]) + '</small><span>SELECTED</span></div>' +
      '<div class="site" data-cls="dim@2.4"><b>Flats 1</b><small>Daylight ' + pc(f[0]) + ' · darkness ' + pc(f[1]) + '</small><span></span></div></div>' +
      '<p class="ip-note">The ridge keeps a third of its output through the six-sol darkness. The flats keep none.</p>';
  },

  array: () => head('Array output', 'VSAT-01 · Ridge B') +
    '<div class="ip-big"><b id="iKw">0.0</b><small>kW</small></div>' +
    '<div class="ip-track"><i id="iKwBar" style="width:0"></i><b class="lim" style="left:100%"></b></div>' +
    '<ul class="ip-list">' + li('<span>Mast — deploy to 10 m</span>', 0, 4.6) + li('<span>Sun tracking — calibrate</span>', 4.6, 6.3) + li('<span>Cable to habitat PDU</span><em id="iCable">0 m</em>', 3.8, 8.1) + '</ul>' +
    '<div class="ip-row good" data-at="8.1"><span>Habitat bus</span><b>POWERED</b></div>',

  eclss: () => head('PROC 2.104 · ECLSS activation', 'REV C') +
    '<ol class="ip-cuff">' + li('Close RPC-17 — power the rack', 0.3, 0.9) + li('CDRA to ACTIVE — CO₂ removal', 0.9, 1.5) + li('WRS to PROCESS — water recovery', 1.5, 2.1) +
    li('Open V-OGA-1 — water to the OGA', 2.1, 2.7) + li('OGA to NORMAL — oxygen generation', 2.7, 3.3) + li('Verify ppO₂ and ppCO₂', 3.3, 4.6) + '</ol>' +
    '<div class="ip-grid two"><div><span>ppO₂</span><b data-num="19.4,21.3,3.0,4.6" data-suf=" kPa">19.4 kPa</b></div><div><span>ppCO₂</span><b data-num="5.6,2.1,1.2,4.6" data-suf=" mmHg">5.6 mmHg</b></div></div>' +
    '<div class="ip-sub" data-at="5.2">Darkness load table · sols 12–17</div>' +
    '<table class="ip-loads"><tr data-at="5.4"><td>Habitat core</td><td>' + O.C.HAB_KW + ' kW</td><td class="crit">CRIT</td></tr>' +
    '<tr data-at="5.7"><td>ECLSS</td><td>' + O.C.ECLSS_KW + ' kW</td><td class="crit">CRIT</td></tr>' +
    '<tr data-at="6.0"><td>Ice plant</td><td>' + O.C.ISRU_KW + ' kW</td><td data-seq=\'[[0,"ON"],[7.0,"SHED"]]\' data-cls="shed@7.0">ON</td></tr>' +
    '<tr data-at="6.3"><td>Crop lights</td><td>' + O.C.GH_KW + ' kW</td><td data-seq=\'[[0,"ON"],[7.6,"SHED"]]\' data-cls="shed@7.6">ON</td></tr></table>',

  psr: () => head('Ice plant 1 · core 1', 'PSR · 40 K') +
    '<div class="ip-row big"><span>Core depth</span><b data-num="0,1,1.2,5.0" data-dec="2" data-suf=" m">0.00 m</b></div>' +
    '<div class="ip-track"><i data-bar="0,100,1.2,5.0"></i></div>' +
    '<div class="ip-row" data-at="5.2"><span>Water ice</span><b>' + (O.C.ICE * 100).toFixed(1) + ' wt%</b></div>' +
    '<div class="ip-cw" data-at="6.3">WARN · FAN FAIL — ppCO₂ RISING</div>' +
    '<ol class="ip-cuff" data-at="6.5">' + li('Open DCM', 6.5, 7.0) + li('Lift PURGE guard', 7.0, 7.5) + li('PURGE — OPEN', 7.5, 8.0) + li('Terminate EVA — return to airlock', 8.0) + '</ol>' +
    '<div class="ip-row big" data-at="8.0"><span>Purge time left</span><b class="warn" data-clock="1800,1786,8.0,10">30:00</b></div>',

  trip: () => head('EPS · caution', 'Sol 13 · darkness') +
    '<div class="ip-cw caut" data-at="0.3">CAUTION · STRING B — OVERTEMP TRIP</div>' +
    '<div class="ip-row big"><span>String B temp</span><b data-num="58,43.6,4.2,6.8" data-suf=" °C">58.0 °C</b></div>' +
    '<div class="ip-track hot"><i data-bar="72,54,4.2,6.8"></i><b class="lim" style="left:56%"></b></div>' +
    '<div class="ip-cap"><span>reset below 45 °C</span><span></span></div>' +
    '<ol class="ip-cuff">' + li('Verify string isolated', 0.6, 2.0) + li('Open radiator louver (hold)', 2.0, 4.2) + li('Wait: temperature below 45 °C', 4.2, 6.8) + li('Close breaker', 6.8, 7.4) + '</ol>' +
    '<div class="ip-row good" data-at="7.4"><span>String B</span><b>ONLINE</b></div>' +
    '<p class="ip-note">Close the breaker on a hot string and it trips again.</p>',

  spe: () => head('Space weather · SRAG', 'Sol 22') +
    '<div class="ip-cw" data-at="2.6">X-CLASS FLARE · WESTERN LIMB</div>' +
    '<div class="ip-row big" data-at="2.8"><span>Proton onset</span><b class="warn" data-clock="2700,2580,2.8,9">45:00</b></div>' +
    '<div class="ip-grid two" data-at="4.2"><div><span>To shelter</span><b>' + Math.round(SS.dist(M.st2.x, M.st2.z, M.hab.x, M.hab.z) / 10) * 10 + ' m</b></div><div><span>LTV time</span><b>≈ 1:10</b></div></div>' +
    '<ul class="ip-list">' + li('<span>Terminate the EVA</span>', 3.4, 4.2) + li('<span>Drive home, crew to shelter</span>', 4.2) + '</ul>' +
    '<div class="ip-rule" data-at="6.0"><b>FR-4</b> Crew under storm shielding before particle arrival</div>',

  slip: () => head('FLIGHT · return slip', '+15 sols') +
    '<div class="ip-cw caut" data-at="0.3">ASCENT VEHICLE — RETURN SOL 45 → 60</div>' +
    '<div class="ip-sub" data-at="1.0">Projected to sol 60</div>' +
    '<div class="ip-bars" data-at="1.1">' +
      '<div><span>O₂</span><i><b data-bar="0,100,1.2,2.4"></b></i><em>OK</em></div>' +
      '<div><span>Water</span><i><b data-bar="0,100,1.3,2.5"></b></i><em>OK</em></div>' +
      '<div><span>Food</span><i><b class="food" data-bar="0,86,1.4,2.6|86,100,5.6,6.6" data-cls="ok@5.6"></b></i><em data-seq=\'[[0,"SHORT"],[5.6,"OK"]]\' data-cls="ok@5.6" class="bad">SHORT</em></div>' +
      '<s></s></div>' +
    '<div class="ip-toggle" data-cls="on@4.8"><span>Contingency rations ×0.85 after sol 30</span><i></i></div>' +
    '<p class="ip-note">Rations stretch food but cost crew performance — a real flight-surgeon trade.</p>',

  debrief: () => head('Flight director’s debrief', 'Sample') +
    '<ul class="ip-comp">' + [['Procedures &amp; checklist discipline', 84, 'Meets', 'me'], ['Communication', 92, 'Exceeds', 'ex'], ['Situational awareness', 79, 'Meets', 'me'],
      ['Decision making', 90, 'Exceeds', 'ex'], ['Consumables management', 76, 'Meets', 'me'], ['Mission outcome', 88, 'Meets', 'me']]
      .map((c, i) => { const t0 = 0.6 + i * 0.45; return '<li data-at="' + t0.toFixed(2) + '"><span>' + c[0] + '</span><em class="' + c[3] + '">' + c[2] + '</em><i><b data-bar="0,' + c[1] + ',' + t0.toFixed(2) + ',' + (t0 + 0.8).toFixed(2) + '"></b></i></li>'; }).join('') + '</ul>' +
    '<div class="ip-rules" data-at="3.6">' + ['FR-1', 'FR-2', 'FR-3', 'FR-4', 'FR-5', 'FR-6'].map((f, i) => '<span data-cls="ok@' + (3.7 + i * 0.12).toFixed(2) + '">' + f + '</span>').join('') + '</div>' +
    '<div class="ip-rec" data-at="4.8">Recommended for flight assignment</div>',

  ready: () => head('Controls', TOUCH ? 'Touch' : 'Keyboard &amp; mouse') +
    '<div class="ip-keys">' + (TOUCH
      ? [['Left stick', 'move · drive'], ['Drag', 'look'], ['E button', 'interact'], ['Tap', 'radio replies']]
      : [['W A S D', 'move · drive'], ['Mouse', 'look'], ['E', 'interact (hold)'], ['Tab', 'suit DCM'], ['M', 'traverse map'], ['F', 'camera'], ['L', 'headlamp'], ['1 2 3', 'radio replies']])
      .map((k, i) => '<div data-at="' + (0.3 + i * 0.12).toFixed(2) + '"><kbd>' + k[0] + '</kbd><span>' + k[1] + '</span></div>').join('') + '</div>' +
    '<div class="ip-cta" data-at="1.4"><button type="button" class="btn" id="iBegin">Begin training</button><button type="button" class="btn ghost" id="iMenu">Main menu</button></div>'
};

function parseSegs(s){ return s.split('|').map(x => x.split(',').map(Number)); }
function segVal(segs, t){
  let v = segs[0][0];
  for (const g of segs) if (t >= g[2]) v = g[0] + (g[1] - g[0]) * easeS(span(t, g[2], g[3]));
  return v;
}
function compileTL(root){
  const out = [];
  root.querySelectorAll('[data-at],[data-cls],[data-cur],[data-done],[data-num],[data-bar],[data-seq],[data-clock]').forEach(el => {
    const d = el.dataset, n = { el };
    const cls = [];
    if (d.at) cls.push(['on', +d.at]);
    if (d.cls) d.cls.split(' ').forEach(s => { const q = s.split('@'); cls.push([q[0], +q[1]]); });
    if (cls.length) n.cls = cls;
    if (d.cur !== undefined || d.done !== undefined){ n.cur = d.cur !== undefined ? +d.cur : null; n.done = d.done !== undefined ? +d.done : null; }
    if (d.num) { n.num = parseSegs(d.num); n.dec = d.dec !== undefined ? +d.dec : 1; n.suf = d.suf || ''; }
    if (d.bar) n.bar = parseSegs(d.bar);
    if (d.seq) n.seq = JSON.parse(d.seq);
    if (d.clock) n.clock = parseSegs(d.clock);
    out.push(n);
  });
  return out;
}
function setText(el, s){ if (el._s !== s){ el._s = s; el.textContent = s; } }
function runTL(nodes, t){
  for (const n of nodes){
    const el = n.el;
    if (n.cls) for (const c of n.cls) el.classList.toggle(c[0], t >= c[1]);
    if (n.cur !== undefined){
      const done = n.done !== null && t >= n.done;
      el.classList.toggle('done', done);
      el.classList.toggle('cur', !done && n.cur !== null && t >= n.cur);
    }
    if (n.num) setText(el, segVal(n.num, t).toFixed(n.dec) + n.suf);
    if (n.bar){ const w = segVal(n.bar, t).toFixed(1) + '%'; if (el._w !== w){ el._w = w; el.style.width = w; } }
    if (n.seq){ let s = n.seq[0][1]; for (const q of n.seq) if (t >= q[0]) s = q[1]; setText(el, s); }
    if (n.clock){ const v = Math.max(0, Math.round(segVal(n.clock, t))); setText(el, Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0')); }
  }
}

/* ------------------------------------------------------------------ the storyboard */
function buildScenes(){
  const CH = ST.CH, site = M.sites.find(s => s.id === 'R-B'), st1 = M.st1, st2 = M.st2, hab = M.hab, isru = M.isru, yard = M.yard;
  const chap = (i, l) => ({ k: [CH[i].kicker, CH[i].meta].filter(Boolean).join(' · '), t: CH[i].title, l, obj: CH[i].obj });
  const CAP = {
    open: { k: 'Lunar south pole · 89.9° S', t: 'Shackleton Station', l: 'At the pole the sun circles the horizon and never climbs more than a few degrees. Shadows run for hundreds of metres, and some crater floors have not seen daylight in billions of years.' },
    brief: { k: 'Integrated training simulation', t: 'You are EV1', l: 'Lead spacewalker for a crew of four. Plan the cargo, build the outpost by hand and keep it alive, while Mission Control grades every decision against flight rules.' },
    frr: chap(0, 'One cargo lander, 26 tonnes. Power, storage, life support, water, food and shielding all compete for the same mass, and every console polls GO or NO-GO on what you send.'),
    egress: chap(1, 'Configure the suit in checklist order (circulation before oxygen), depress the airlock and take the first steps. Then do real geology: a context photo and a scoop sample.'),
    power: chap(2, 'Tow the array to its site, choose ridge or flats, raise the 10 m mast and aim it at a sun that never climbs. Then lay the cable home.'),
    eclss: chap(3, 'Bring life support up by procedure, in order. Skip a step and the oxygen generator trips. Then choose which loads to shed for six sols of darkness.'),
    psr: chap(4, 'Drive into ground that has not seen the sun in billions of years and drill the first ice core at 40 kelvin. Sim Sup has a malfunction loaded.'),
    night: chap(5, 'The sun drops below the ridge for six sols. A battery string trips on overtemperature, and the fix is outside, by headlamp. Close the breaker hot and it trips again.'),
    spe: chap(6, 'Two hundred and seventy metres from home, the sun flares. Protons arrive in minutes, not hours. Get the crew under shielding before onset.'),
    slip: chap(7, 'The ride home slips fifteen sols. Re-plan the load table to sol 60, decide on rations, and live with the result.'),
    debrief: { k: 'After the increment', t: 'Debrief', l: 'The flight director grades six competencies, lists every flight-rule finding, charts your consumables and dose, and makes a recommendation.' },
    ready: { k: 'Your turn', t: 'Begin training', l: 'Every rate comes from published NASA data. Every decision is graded. Good luck, EV1.' }
  };
  GROUPS = [
    { n: '', label: 'Intro' }, { n: '00', label: 'Readiness review' }, { n: '01', label: 'Egress' }, { n: '02', label: 'First Light' },
    { n: '03', label: 'Closing the Loop' }, { n: '04', label: 'Into the Dark' }, { n: '05', label: 'The Long Night' }, { n: '06', label: 'Proton Storm' },
    { n: '07', label: 'The Slip' }, { n: '', label: 'Debrief' }, { n: '', label: 'Your turn' }
  ];
  const ev1Tag = (t0, t1, s) => ({ at: () => { headPos(A.ev1, tmp2); tmp2.y += 0.55; return tmp2; }, k: 'EV1 · you', s, t0, t1 });
  const ev2Tag = (t0, t1, s) => ({ at: () => { headPos(A.ev2, tmp2); tmp2.y += 0.55; return tmp2; }, k: 'EV2 · Mori', s, t0, t1 });

  /* ---- shared geometry */
  const earthDir = W.EARTH_DIR;
  const openP0 = GP(-36, 3.0, 182);
  const dIn = V(M.crater.x - isru.x, 0, M.crater.z - isru.z).normalize(), dPerp = V(dIn.z, 0, -dIn.x);
  const ltvPsr = { x: isru.x - dIn.x * 8, z: isru.z - dIn.z * 8 };
  const ltvSpe = { x: st2.x + 14, z: st2.z + 12 };
  const orbit = a => ({ x: 22 + Math.cos(a) * 58, z: 16 + Math.sin(a) * 58 });
  const above = (fn, dy) => () => { fn(tmp2); tmp2.y += dy; return tmp2; };

  /* ---- spe crew: terminate the EVA and lope for the LTV */
  function speCrew(t, dt){
    const ev1 = A.ev1, ev2 = A.ev2;
    const b1 = { x: R.x + Math.cos(R.h) * 1.9, z: R.z - Math.sin(R.h) * 1.9 }, b2 = { x: R.x - Math.cos(R.h) * 1.9, z: R.z + Math.sin(R.h) * 1.9 };
    if (t < 3.4){ ev1.pose = 'kneel'; return; }
    ev1.pose = 'walk';
    [[ev1, b1, 0], [ev2, b2, 0.25]].forEach(q => {
      const a = q[0], b = q[1];
      if (!a.vis) return;
      if (t < 4.0 + q[2]){ a.yaw += SS.angDiff(a.yaw, Math.atan2(b.x - a.x, b.z - a.z)) * Math.min(1, dt * 4); return; }
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d < 0.9){ aHide(a); return; }
      const st = Math.min(d, 2.3 * dt);
      a.x += dx / d * st; a.z += dz / d * st; a.yaw = Math.atan2(dx, dz);
    });
  }

  S = [
  /* ======================================================= intro */
  { id: 'open', g: 0, dur: 6.5, tr: 'start', fov: 48, cap: CAP.open,
    cam: keyed([{ t: 0, p: openP0, l: openP0.clone().add(V(32, 7.5, -95)) }, { t: 6.5, p: GP(-18, 8.5, 128), l: GP(20, 4, 12) }]),
    tags: [{ at: () => tmp2.copy(W.camera.position).addScaledVector(earthDir, 1400), k: 'Earth', s: '384,400 km · it never climbs high here', t0: 1.0, t1: 6.0 }],
    setup(){ setSun('day'); setBase('bare'); ltvPark(M.rover.x, M.rover.z, -2.2); aHide(A.ev1); aHide(A.ev2); lampOn(false); clearGameplay(); } },
  { id: 'brief', g: 0, dur: 7, tr: 'fly', fov: 55, cap: CAP.brief, panel: 'stats',
    cam: keyed([{ t: 0, p: GP(-30, 44, 96), l: GP(24, 0, 12) }, { t: 7, p: GP(-66, 48, 34), l: GP(20, 0, 2) }]),
    tags: [{ at: GP(0, 11.5, 0), k: 'Lander', s: 'Crew cabin · airlock', t0: 0.8, t1: 6.5 },
           { at: GP(hab.x, 6.5, hab.z), k: 'Surface Habitat 1', s: 'Unpowered · on survival heaters', t0: 1.3, t1: 6.5 },
           { at: GP(M.cargo.x, 3.4, M.cargo.z), k: 'Cargo pad', s: 'Everything you manifest lands here', t0: 1.8, t1: 6.5 },
           { at: GP(site.x, 4, site.z), k: 'Connecting ridge', s: 'Best sun · far from home', t0: 2.3, t1: 6.5 }],
    setup(how){ if (how !== 'fly') S[0].setup(); } },
  { id: 'frr', g: 1, dur: 9, tr: 'fly', fov: 50, cap: CAP.frr, panel: 'manifest', ticks: [0, [3.0, 5.4, 7.0]],
    cam: (function(){
      const c = M.cargo, P = (a, r, h) => GP(c.x + Math.cos(a) * r, h, c.z + Math.sin(a) * r);
      return keyed([{ t: 0, p: P(0.8, 19, 7.5), l: GP(c.x, 1.0, c.z) }, { t: 4.5, p: P(1.35, 17.5, 6.4), l: GP(c.x, 1.1, c.z - 1) }, { t: 9, p: P(1.9, 16.5, 5.6), l: GP(c.x - 0.5, 1.2, c.z - 2) }]);
    })(),
    tags: [{ at: GP(M.cargo.x, 3.7, M.cargo.z), k: 'VSAT-01', s: 'Solar array, stowed on its pallet', t0: 0.6, t1: 4.0 },
           { at: GP(M.cargo.x + 3.4, 2.6, M.cargo.z + 1.2), k: 'Cargo pad', s: 'One lander · 26 t', t0: 4.4, t1: 8.6 }],
    setup(how){ if (how !== 'fly') S[0].setup(); } },

  /* ======================================================= chapter 1 */
  { id: 'egress-a', g: 2, dur: 6, tr: 'dip', where: 'airlock', fov: 70, cap: CAP.egress, panel: 'dcm', ticks: [0, [3.0, 4.7]],
    card: { k: 'Landing plus one day', v: 'SOL 1', s: '07:40 · lander airlock' },
    cam: keyed([{ t: 0, p: V(0.32, 1.62, -0.6), l: V(-1.13, 1.42, 0.55) }, { t: 2.9, p: V(0.22, 1.61, -0.42), l: V(-0.95, 1.36, 0.8) }, { t: 6, p: V(0.05, 1.58, 0.35), l: V(0.03, 1.22, 1.6) }]),
    tags: [{ at: V(-1.13, 1.86, 0.55), k: 'Depress panel', s: 'Airlock pressure', t0: 0.5, t1: 3.8 }, { at: V(0.0, 2.08, 1.34), k: 'Outer hatch', s: 'Opens at 0.0 psi', t0: 4.3, t1: 5.8 }],
    setup(){
      setSun('day'); setBase('bare'); ltvPark(M.rover.x, M.rover.z, -2.2); lampOn(false);
      I.airlock.setHatch(0); setPressure(10.2); this._p = 10.2;
      aPlace(A.ev1, 0.3, 7.6, Math.atan2(st1.x, st1.z));
      aPlace(A.ev2, 0, 5.02, Math.PI); A.ev2.y = W.H(0, 0) + 4.35;
    },
    update(t){
      const p = Math.round((10.2 * (1 - easeS(span(t, 3.1, 4.6)))) * 2) / 2;
      if (p !== this._p){ this._p = p; setPressure(p); }
      I.airlock.setHatch(easeS(span(t, 4.4, 6.0)));
    } },
  { id: 'egress-b', g: 2, dur: 5, tr: 'white', fov: 54, cap: CAP.egress, panel: 'suit', ticks: [2, [3.6]],
    cam: keyed([{ t: 0, p: GP(4.6, 1.5, 15.5), l: GP(0.2, 2.2, 7.6) }, { t: 5, p: GP(2.6, 1.35, 15.2), l: GP(-2.2, 1.3, 11.2) }]),
    tags: [ev1Tag(0.7, 4.6, 'First steps'), ev2Tag(1.6, 4.6, 'Down the ladder')],
    setup(how){ if (how !== 'white'){ S[3].setup(); } },
    update(t){
      const d = V(st1.x, 0, st1.z).normalize(), s = Math.max(0, t - 0.2) * 1.15;
      aMove(A.ev1, 0.3, 7.6, 0.3 + d.x * 6, 7.6 + d.z * 6, Math.min(1, s / 6));
      const e = A.ev2, k = span(t, 0.0, 3.4);
      e.x = 0; e.z = SS.lerp(4.7, 6.55, k) + 0.32; e.y = W.H(0, 0) + SS.lerp(4.35, 0.05, k); e.amp = k < 1 ? 0.35 : null; e.yaw = Math.PI;
      if (k >= 1){ e.y = null; e.yaw = Math.PI + SS.angDiff(Math.PI, Math.atan2(A.ev1.x - e.x, A.ev1.z - e.z)) * span(t, 3.4, 4.6); }
    } },
  { id: 'geo', g: 2, dur: 5.5, tr: 'dissolve', fov: 46, cap: CAP.egress, panel: 'photo', ticks: [3, [4.2]],
    cam: keyed([{ t: 0, p: GP(st1.x + 6.8, 2.5, st1.z + 9.2), l: GP(st1.x - 0.4, 1.0, st1.z + 1.4) }, { t: 5.5, p: GP(st1.x + 3.6, 2.0, st1.z + 9.8), l: GP(st1.x - 0.6, 0.9, st1.z + 1.2) }]),
    tags: [{ at: GP(st1.x, 3.0, st1.z), k: 'Station 1', s: 'Breccia boulder', t0: 0.5, t1: 5.0 }],
    setup(){
      setSun('day'); setBase('bare'); ltvPark(M.rover.x, M.rover.z, -2.2); lampOn(false);
      aPlace(A.ev1, st1.x + 0.9, st1.z + 2.5, 0, 'kneel'); faceTo(A.ev1, st1.x, st1.z);
      aPlace(A.ev2, st1.x + 3.4, st1.z + 2.0); faceTo(A.ev2, st1.x, st1.z);
      this._shot = false;
    },
    update(t){ if (t >= 2.2 && !this._shot){ this._shot = true; SS.ui.flash(0.3); D.thumb = $('iThumb'); } } },

  /* ======================================================= chapter 2 */
  { id: 'power-a', g: 3, dur: 4.5, tr: 'dissolve', fov: 48, cap: CAP.power, panel: 'site', ticks: [0, [3.8]],
    cam: keyed([{ t: 0, p: GP(5.0, 2.3, -88.5), l: GP(-7.8, 1.2, -88) }, { t: 4.5, p: GP(10.2, 2.7, -109.5), l: GP(-2.4, 1.1, -110) }]),
    tags: [{ at: () => tmp2.set(R.x, R.y + 2.9, R.z), k: 'LTV-1', s: 'Towing VSAT-01 · 15 km/h max', t0: 0.4, t1: 4.2 }],
    path: flat([[-7.2, -90], [-5.6, -98], [-3.4, -106], [-1.6, -112]]),
    setup(){
      setSun('day'); setBase('bare'); lampOn(false); aHide(A.ev2);
      ltvPark(-7.2, -90, 0);
      ltvDrive(this.path, 0, 0); ltvDrive(this.path, 0.001, 0);
      const fx = Math.sin(R.h), fz = Math.cos(R.h);
      R.tow = { obj: B.o.pallet, x: R.x - fx * 4.45, z: R.z - fz * 4.45, h: R.h };
      B.o.pallet.visible = true;
      aSeat(A.ev1); R.ev2.group.visible = true;
    },
    update(t, dt){ ltvDrive(this.path, span(t, 0, 4.5), dt); } },
  { id: 'power-b', g: 3, dur: 8.5, tr: 'dissolve', fov: 50, cap: CAP.power, panel: 'array', ticks: [1, [0.9, 6.3, 8.1]],
    cam: keyed([{ t: 0, p: GP(site.x - 6.5, 2.4, site.z + 15), l: GP(site.x - 1.6, 3.6, site.z + 1) }, { t: 4.6, p: GP(site.x - 10, 6.2, site.z + 19.5), l: GP(site.x - 2.2, 6.4, site.z + 1) },
                { t: 8.5, p: GP(site.x - 14, 10.5, site.z + 28), l: GP(site.x + 1.5, 4.6, site.z + 6) }]),
    tags: [{ at: () => tmp2.set(site.x, W.H(site.x, site.z) + 1.4 + 10 * easeS(span(D.t, 0.8, 4.6)), site.z), k: 'VSAT-01', s: '10 kW · 10 m mast', t0: 1.0, t1: 7.6 }, ev1Tag(0.5, 3.6, 'At the control box')],
    path: flat([[site.x + 3.6, site.z + 4.6], [site.x + 5.4, site.z + 11], [site.x + 8.2, site.z + 17], [site.x + 11, site.z + 23]]),
    setup(){
      setSun('day'); setBase('power'); lampOn(false); aHide(A.ev2);
      const a = B.o.arrays[0]; a.setDeploy(0); a.yaw.rotation.y = 0; this._lit = false;
      ltvPark(site.x + 3.6, site.z + 4.6, 0); ltvDrive(this.path, 0, 0); R.ev2.group.visible = true;
      const fx = Math.sin(R.h), fz = Math.cos(R.h), rear = { x: R.x - fx * 1.8, z: R.z - fz * 1.8 };
      W.cable.reset([{ x: site.x + 0.3, z: site.z + 1.2 }, rear]);
      R.paying = true; R.lastPay = rear;
      aPlace(A.ev1, site.x + 1.6, site.z + 2.3); faceTo(A.ev1, site.x + 0.8, site.z + 1.0);
    },
    update(t, dt){
      const a = B.o.arrays[0], dep = easeS(span(t, 0.8, 4.6)), yaw = Math.PI - BOOT_SUN.az * SS.DEG;
      a.setDeploy(dep);
      a.yaw.rotation.y = SS.angDiff(0, yaw) * easeS(span(t, 4.8, 6.3));
      if (t >= 3.8) ltvDrive(this.path, Math.pow(span(t, 3.8, 8.5), 1.5), dt);
      const kw = 10 * clamp01((dep - 0.45) / 0.55) * (0.3 + 0.7 * easeS(span(t, 4.8, 6.3)));
      const k = $('iKw'); if (k){ setText(k, kw.toFixed(1)); $('iKwBar').style.width = (kw * 10).toFixed(1) + '%'; setText($('iCable'), Math.round(W.cable.length) + ' m'); }
      if (t >= 8.1 && !this._lit){ this._lit = true; MD.habPower(true); }
    } },

  /* ======================================================= chapter 3 */
  { id: 'eclss', g: 4, dur: 9, tr: 'dissolve', where: 'hab', fov: 66, cap: CAP.eclss, panel: 'eclss', ticks: [0, [4.6, 5.2, 7.9]],
    cam: keyed([{ t: 0, p: V(3.7, 1.68, 0.42), l: V(-3, 1.45, -0.25) }, { t: 4.2, p: V(1.4, 1.64, 0.48), l: V(-1.9, 1.42, -1.25) }, { t: 9, p: V(-0.45, 1.6, 0.42), l: V(-1.95, 1.4, -1.3) }]),
    tags: [{ at: V(2.1, 1.95, 0.55), k: 'IV crewmember', s: 'Runs the habitat side', t0: 0.5, t1: 3.4 },
           { at: V(-1.9, 2.02, -1.27), k: 'ECLSS rack 1', s: 'CO₂ removal · water recovery · O₂ generation', t0: 1.4, t1: 8.6 }],
    setup(){
      setSun('day'); setBase('full'); ltvPark(M.rover.x, M.rover.z, -2.2); aHide(A.ev1); aHide(A.ev2); lampOn(false);
      I.hab.setMode('on'); I.hab.iv.group.visible = true; setScreen('eclss', 'ECLSS', [['STANDBY', '#F5B324']]); this._on = false;
      if (D.renderer) I.renderWindow(D.renderer);
    },
    update(t){ if (t >= 4.6 && !this._on){ this._on = true; setScreen('eclss', 'ECLSS', [['ACTIVE', '#39D07A'], ['ppO2 21.3 kPa', '#9FD3F2']]); } } },

  /* ======================================================= chapter 4 */
  { id: 'psr', g: 5, dur: 10, tr: 'dissolve', fov: 50, cap: CAP.psr, panel: 'psr', ticks: [0, [1.0, 2.6, 5.2]],
    cam: keyed([{ t: 0, p: GP(isru.x - dIn.x * 30 + dPerp.x * 9, 10, isru.z - dIn.z * 30 + dPerp.z * 9), l: GP(isru.x, 1.5, isru.z) },
                { t: 10, p: GP(isru.x - dIn.x * 11.5 + dPerp.x * 5.5, 2.8, isru.z - dIn.z * 11.5 + dPerp.z * 5.5), l: GP(isru.x - dIn.x * 1.5, 1.3, isru.z - dIn.z * 1.5) }]),
    tags: [{ at: GP(isru.x, 6.4, isru.z), k: 'Ice plant 1', s: 'Inside permanent shadow · 40 K', t0: 0.8, t1: 5.8 },
           { at: () => { headPos(A.ev1, tmp2); tmp2.y += 0.55; return tmp2; }, k: 'EV1 · fan failure', s: 'CO₂ rising — purge', t0: 6.5, t1: 9.6, cls: 'warn' }],
    setup(){
      setSun('day'); setBase('full'); aHide(A.ev2);
      ltvPark(ltvPsr.x, ltvPsr.z, Math.atan2(dIn.x, dIn.z), true);
      B.o.isru.setDrill(0); B.o.isru.group.updateMatrixWorld(true);
      const drill = B.o.isru.group.localToWorld(V(1.0, 0, 0));
      aPlace(A.ev2, drill.x - dIn.x * 1.2 + dPerp.x * 0.5, drill.z - dIn.z * 1.2 + dPerp.z * 0.5, 0, 'kneel'); faceTo(A.ev2, drill.x, drill.z);
      aPlace(A.ev1, isru.x - dIn.x * 3.6 + dPerp.x * 2.4, isru.z - dIn.z * 3.6 + dPerp.z * 2.4); faceTo(A.ev1, drill.x, drill.z);
      this._e = { x: A.ev1.x, z: A.ev1.z };
      lampOn(true);
    },
    update(t){
      B.o.isru.setDrill(easeS(span(t, 1.2, 5.0)));
      if (t >= 7.8){ const e = this._e, b = { x: ltvPsr.x + dPerp.x * 1.9, z: ltvPsr.z + dPerp.z * 1.9 }; aMove(A.ev1, e.x, e.z, b.x, b.z, Math.min(1, (t - 7.8) * 1.15 / SS.dist(e.x, e.z, b.x, b.z))); }
      const red = t > 6.3 && t < 9.4 ? (REDUCED ? 0.6 : 0.55 + 0.45 * Math.sin((t - 6.3) * 8)) * (1 - span(t, 8.4, 9.4)) : 0;
      $('iRed').style.opacity = red.toFixed(3);
    },
    leave(){ $('iRed').style.opacity = '0'; } },

  /* ======================================================= chapter 5 */
  { id: 'night', g: 6, dur: 8, tr: 'dip', fov: 50, cap: CAP.night, panel: 'trip', ticks: [0, [0.6, 2.0, 3.4, 7.4]],
    card: { k: 'Time advance', v: 'SOL 13', s: 'Darkness · the sun is below the ridge for six sols' },
    cam: (function(){
      const ux = yard.x + 1.4, uz = yard.z;
      return keyed([{ t: 0, p: GP(ux - 1.8, 1.9, uz + 9.5), l: GP(ux + 0.6, 1.35, uz) }, { t: 8, p: GP(ux - 1.3, 1.75, uz + 6.6), l: GP(ux + 0.5, 1.2, uz + 0.2) }]);
    })(),
    tags: [{ at: () => { unitPos(1, tmp2); tmp2.y += 2.0; return tmp2; }, k: 'String B', s: 'Tripped · overtemperature', t0: 0.6, t1: 6.6, cls: 'warn' },
           { at: () => { unitPos(1, tmp2); tmp2.y += 2.0; return tmp2; }, k: 'String B', s: 'Breaker closed · online', t0: 7.4, t1: 7.95, cls: 'ok' }],
    setup(){
      setSun('night'); setBase('night'); aHide(A.ev2);
      { const ux = yard.x + 1.4, lx = ux + 8.5, lz = yard.z + 8; ltvPark(lx, lz, Math.atan2(ux - lx, yard.z + 0.5 - lz), true); }
      const y = B.o.yard, mats = MD.mats(); y.setLed(1, mats.ledR); y.setLouver(1, 0); this._led = 'r';
      const u = unitPos(1, V(0, 0, 0));
      this._w = [u.x + 1.7, u.z + 6.0, u.x + 1.05, u.z + 1.8];
      aPlace(A.ev1, this._w[0], this._w[1]); lampOn(true);
    },
    update(t){
      const w = this._w, y = B.o.yard, mats = MD.mats();
      aMove(A.ev1, w[0], w[1], w[2], w[3], easeS(span(t, 0.1, 3.4)));
      if (t > 3.4) faceTo(A.ev1, w[2] - 1.2, w[3] - 3);
      y.setLouver(1, easeS(span(t, 2.4, 3.8)));
      const led = t >= 6.8 ? 'g' : t >= 4.4 ? 'a' : 'r';
      if (led !== this._led){ this._led = led; y.setLed(1, led === 'g' ? mats.ledG : led === 'a' ? mats.ledA : mats.ledR); }
    } },

  /* ======================================================= chapter 6 */
  { id: 'spe', g: 7, dur: 9, tr: 'dip', fov: 48, cap: CAP.spe, panel: 'spe', ticks: [0, [1.8, 4.0]], route: true,
    card: { k: 'Time advance', v: 'SOL 22', s: 'Ridge science station · EVA 5' },
    cam: keyed([{ t: 0, p: GP(st2.x - 3, 2.1, st2.z + 9), l: GP(st2.x + 1.8, 0.9, st2.z + 1) }, { t: 4.2, p: GP(st2.x - 2, 3.6, st2.z + 11.5), l: GP(st2.x + 8, 1.2, st2.z + 6) },
                { t: 9, p: GP(st2.x - 9, 9.5, st2.z - 7), l: GP(st2.x + 70, 0, st2.z + 62) }]),
    tags: [{ at: GP(st2.x, 2.6, st2.z), k: 'Station 2', s: 'Ridge sample site', t0: 0.5, t1: 3.0 },
           { at: GP(hab.x, 7, hab.z), k: 'Habitat · storm shelter', s: Math.round(SS.dist(st2.x, st2.z, hab.x, hab.z) / 10) * 10 + ' m away', t0: 5.6, t1: 8.8, cls: 'warm' }],
    setup(){
      setSun('day'); setBase('full'); lampOn(false);
      ltvPark(ltvSpe.x, ltvSpe.z, Math.atan2(hab.x - ltvSpe.x, hab.z - ltvSpe.z));
      aPlace(A.ev1, st2.x + 1.9, st2.z + 1.2, 0, 'kneel'); faceTo(A.ev1, st2.x, st2.z);
      aPlace(A.ev2, st2.x + 3.3, st2.z + 3.4); faceTo(A.ev2, A.ev1.x, A.ev1.z);
      D.boarded = 0; D.bg = speCrew; D.bgT = 0;
    } },

  /* ======================================================= chapter 7 and the debrief */
  { id: 'slip', g: 8, dur: 8, tr: 'dissolve', fov: 54, cap: CAP.slip, panel: 'slip', ticks: [0, [1.6, 5.4, 7.2]],
    cam: keyed([{ t: 0, p: GP(-26, 56, 112), l: GP(24, 0, 18) }, { t: 8, p: GP(72, 60, 104), l: GP(24, 0, 18) }]),
    tags: [{ at: GP(hab.x, 7, hab.z), k: 'Surface Habitat 1', s: 'Four crew · sol 30', t0: 0.6, t1: 7.5 },
           { at: GP(site.x, 12.5, site.z), k: 'Solar arrays', s: 'Ridge B · 2 × 10 kW', t0: 1.2, t1: 7.5 },
           { at: GP(yard.x, 3.4, yard.z), k: 'Storage yard', s: 'Batteries for the dark', t0: 1.8, t1: 7.5 }],
    setup(){ endCrew(); } },
  { id: 'debrief', g: 9, dur: 8, tr: 'fly', fov: 55, cap: CAP.debrief, panel: 'debrief',
    cam: (function(){
      const p0 = GP(-40, 36, 140), p1 = GP(-54, 30, 152);
      return keyed([{ t: 0, p: p0, l: GP(20, 2, 12) }, { t: 8, p: p1, l: p1.clone().addScaledVector(earthDir, 200).add(V(0, -24, 0)) }]);
    })(),
    tags: [{ at: () => tmp2.copy(W.camera.position).addScaledVector(earthDir, 1400), k: 'Earth', s: 'Mission Control is 2.6 s away by radio', t0: 4.6, t1: 7.6 }],
    setup(how){ if (how !== 'fly') endCrew(); } },
  { id: 'ready', g: 10, dur: 6.5, tr: 'fly', fov: 62, cap: CAP.ready, panel: 'ready', final: true,
    cam(t, out){
      const a = 2.2 - 0.035 * (this.dur - t), o = orbit(a), c = { x: 22, z: 16 };
      out.p.set(o.x, W.H(o.x, o.z) + 11, o.z); out.l.set(c.x, W.H(c.x, c.z) + 3.5, c.z);
      return out;
    },
    setup(how){ if (how !== 'fly') endCrew(); } }
  ];
  function endCrew(){ setSun('day'); setBase('full'); ltvPark(M.rover.x, M.rover.z, -2.2); aHide(A.ev1); aHide(A.ev2); lampOn(false); D.bg = null; }

  /* route from Station 2 to the habitat, sampled on the ground */
  const home = flat([[st2.x + 2, st2.z + 3], [-95, -100], [-40, -52], [12, -9], [35, 14], [M.habLock.x + 1.6, M.habLock.z]]);
  routePts = home.getSpacedPoints(56).map(p => V(p.x, W.H(p.x, p.z) + 0.45, p.z));
  S.forEach((s, i) => { s.i = i; if (!s.where) s.where = 'ext'; });
  GROUPS.forEach((g, gi) => { g.scenes = S.filter(s => s.g === gi); g.dur = g.scenes.reduce((a, s) => a + s.dur, 0); });
}
function clearGameplay(){
  if (SS.npc && SS.npc.model) SS.npc.set('hidden');
  if (SS.player && SS.player.showTool) SS.player.showTool(null);
}
function unitPos(i, out){
  const y = B.o.yard, u = y && y.units[i];
  out.set(M.yard.x + (u ? u.g.position.x : 0), W.H(M.yard.x, M.yard.z), M.yard.z);
  return out;
}

/* ------------------------------------------------------------------ overlay */
const tagEls = [];
function buildDom(){
  const tg = $('iTags');
  for (let i = 0; i < 6; i++){
    const e = document.createElement('div'); e.className = 'itag';
    e.innerHTML = '<i></i><span class="ln"></span><div class="lb"><b></b><small></small></div>';
    tg.appendChild(e); tagEls.push({ el: e, b: e.querySelector('b'), s: e.querySelector('small'), spec: null });
  }
  $('iTrack').innerHTML = GROUPS.map((g, i) => '<li><button type="button" data-g="' + i + '" title="' + esc(g.label) + '" aria-label="' + esc((g.n ? 'Chapter ' + +g.n + ': ' : '') + g.label) + '">' +
    '<span class="n">' + (g.n || '·') + '</span><span class="t">' + esc(g.label) + '</span><i><b></b></i></button></li>').join('');
  $('iTrack').querySelectorAll('button').forEach(b => b.addEventListener('click', () => IN.seekGroup(+b.dataset.g)));
  $('iSkip').addEventListener('click', () => IN.skip());
  $('iPause').addEventListener('click', () => IN.togglePause());
  $('iNext').addEventListener('click', () => IN.step(1));
  $('iPrev').addEventListener('click', () => IN.step(-1));
  $('iPanel').addEventListener('click', e => {
    if (e.target.id === 'iBegin') finish('begin');
    else if (e.target.id === 'iMenu') finish('skip');
  });
}
function renderCaption(cap){
  const c = $('iCap');
  c.classList.remove('in', 'out'); void c.offsetWidth;
  $('iKicker').textContent = cap.k; $('iTitle').textContent = cap.t; $('iLede').textContent = cap.l || '';
  const ol = $('iObj');
  ol.innerHTML = (cap.obj || []).map((o, i) => '<li style="--d:' + (0.45 + i * 0.12).toFixed(2) + 's">' + esc(o) + '</li>').join('');
  ol.hidden = !(cap.obj && cap.obj.length);
  c.classList.add('in');
  D.cap = cap; D.objEls = Array.from(ol.children);
}
function renderPanel(sc){
  const p = $('iPanel');
  p.classList.remove('in'); void p.offsetWidth;
  D.barH = document.querySelector('#intro .ibar.top').getBoundingClientRect().height || 56;
  if (!sc.panel){ p.innerHTML = ''; p.hidden = true; D.tl = []; D.panelRect = null; return; }
  p.hidden = false;
  p.innerHTML = PANELS[sc.panel]();
  p.dataset.kind = sc.panel;
  D.tl = compileTL(p);
  runTL(D.tl, 0);
  p.classList.add('in');
  const r = p.getBoundingClientRect();
  D.panelRect = { left: r.left - 18, bottom: r.bottom };
}
function bindTags(sc){
  tagEls.forEach((t, i) => {
    const s = sc.tags && sc.tags[i];
    t.spec = s || null;
    t.el.classList.remove('on', 'warn', 'ok', 'warm');
    t.lw = 0;
    if (s){ t.b.textContent = s.k; t.s.textContent = s.s || ''; if (s.cls) t.el.classList.add(s.cls); }
  });
}
function updateTags(t){
  const cam = W.camera, w = innerWidth, h = innerHeight;
  for (const tg of tagEls){
    const s = tg.spec;
    if (!s){ continue; }
    const p = typeof s.at === 'function' ? s.at() : s.at;
    tmp.copy(p).project(cam);
    const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05 && t >= s.t0 && t <= s.t1 && !D.closing;
    tg.el.classList.toggle('on', vis);
    if (tmp.z < 1){
      const x = (tmp.x + 1) / 2 * w, y = (1 - tmp.y) / 2 * h;
      tg.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      const pr = D.panelRect, top = D.barH + 96;
      const want = x > w * 0.72 || !!(pr && pr.left > w * 0.3 && x > pr.left - 250 && y - 110 < pr.bottom);
      tg.el.classList.toggle('flip', want && x > (tg.lw || (tg.lw = tg.el.querySelector('.lb').offsetWidth || 180)) + 8);
      tg.el.classList.toggle('down', y < top);
    }
  }
}
function updateRoute(sc, t){
  const path = $('iRoutePath'), glow = $('iRouteGlow');
  let a = 0;
  if (sc.where !== 'ext') D.routeFade = 0;
  if (sc.route) a = span(t, 4.4, 5.0) * (1 - span(t, sc.dur - 0.3, sc.dur + 0.4));
  else if (D.routeFade > 0){ D.routeFade = Math.max(0, D.routeFade - (D.dtR || 0) / 0.8); a = D.routeFade; }
  if (sc.route) D.routeFade = a;
  if (a <= 0.001){ if (path._d !== ''){ path._d = ''; path.setAttribute('d', ''); glow.setAttribute('d', ''); } $('iRoute').style.opacity = '0'; return; }
  const f = sc.route ? span(t, 4.4, 6.6) : 1, cam = W.camera, w = innerWidth, h = innerHeight;
  const last = f * (routePts.length - 1);
  let d = '', pen = false;
  for (let i = 0; i <= Math.ceil(last); i++){
    const k = Math.min(i, last);
    const i0 = Math.floor(k), i1 = Math.min(routePts.length - 1, i0 + 1);
    tmp.copy(routePts[i0]).lerp(routePts[i1], k - i0).project(cam);
    if (tmp.z >= 1){ pen = false; continue; }
    d += (pen ? 'L' : 'M') + ((tmp.x + 1) / 2 * w).toFixed(1) + ' ' + ((1 - tmp.y) / 2 * h).toFixed(1);
    pen = true;
  }
  path._d = d; path.setAttribute('d', d); glow.setAttribute('d', d);
  if (!REDUCED) path.style.strokeDashoffset = (-(SS.clock.ui * 26) % 18).toFixed(1);
  $('iRoute').style.opacity = a.toFixed(3);
}
function updateTrack(){
  const gi = S[D.i].g, g = GROUPS[gi];
  let before = 0;
  for (const s of g.scenes){ if (s.i === D.i) break; before += s.dur; }
  const f = clamp01((before + Math.min(D.t, S[D.i].dur)) / g.dur);
  const lis = $('iTrack').children;
  for (let i = 0; i < lis.length; i++){
    const b = lis[i].querySelector('b');
    const w = i < gi ? '100%' : i > gi ? '0%' : (f * 100).toFixed(1) + '%';
    if (b._w !== w){ b._w = w; b.style.width = w; }
    lis[i].classList.toggle('cur', i === gi); lis[i].classList.toggle('done', i < gi);
  }
}
function updateObjectives(sc, t){
  if (!D.objEls || !sc.ticks) return;
  const done = sc.ticks[0] + sc.ticks[1].filter(x => t >= x).length;
  D.objEls.forEach((e, i) => { e.classList.toggle('done', i < done); e.classList.toggle('cur', i === done); });
}

/* ------------------------------------------------------------------ director */
const FADE = { el: null, v: 0, to: 0, rate: 1, then: null };
const WHITE = { el: null, v: 0, to: 0, rate: 1, then: null };
function fade(F, to, secs, then){ F.to = to; F.rate = 1 / Math.max(0.01, secs); F.then = then || null; }
function stepFade(F, dt){
  if (F.v !== F.to){
    const d = F.rate * dt;
    F.v = F.v < F.to ? Math.min(F.to, F.v + d) : Math.max(F.to, F.v - d);
    F.el.style.opacity = F.v.toFixed(3);
  }
  if (F.v === F.to && F.then){ const f = F.then; F.then = null; f(); }
}

IN.build = function(){
  W = SS.world; M = SS.MAP; B = SS.base; R = SS.rover; MD = SS.models; O = SS.outpost; ST = SS.story; I = SS.interior;
  BOOT_SUN = { az: W.sun.az, el: W.sun.el };
  A.ev1 = mkAstro({ stripes: true }); A.ev2 = mkAstro({});
  /* the helmet lamp lives in the scene permanently, so toggling it never changes the light count */
  lamp = new THREE.SpotLight(0xFFF3E4, 0, 40, 0.5, 0.55, 1.3);
  lamp.target = new THREE.Object3D();
  W.scene.add(lamp); W.scene.add(lamp.target);
  FADE.el = $('iFade'); WHITE.el = $('iWhite');
  D = { base: null, sun: 'day' };
  buildScenes();
  buildDom();
  D = null;
};

IN.start = function(opts){
  opts = opts || {};
  D = { i: -1, t: 0, paused: false, opts, renderer: opts.renderer, base: null, sun: null, bg: null, bgT: 0, hold: 0, closing: false, cap: null, tl: [], switching: null };
  IN.active = true; IN.paused = false;
  const root = $('intro');
  root.hidden = false; root.classList.remove('closing', 'on', 'paused');
  $('iPause').textContent = '❚❚'; $('iPause').setAttribute('aria-label', 'Pause');
  $('iCap').classList.remove('in', 'out'); $('iPanel').classList.remove('in'); $('iPanel').hidden = true;
  $('iCard').classList.remove('on'); $('iSnap').style.opacity = '0'; $('iRed').style.opacity = '0'; $('iRoute').style.opacity = '0';
  WHITE.v = 0; WHITE.to = 0; WHITE.then = null; WHITE.el.style.opacity = '0';
  FADE.then = null;
  const go = () => {
    if (opts.onStart) opts.onStart();
    enter(0, 'start');
    void root.offsetWidth; root.classList.add('on');
    fade(FADE, 0, opts.fromLoad ? 1.6 : 1.1);
  };
  if (opts.fromLoad){ FADE.v = 1; FADE.el.style.opacity = '1'; go(); }
  else { FADE.v = 0; FADE.el.style.opacity = '0'; fade(FADE, 1, 0.45, go); }
};

function enter(i, how){
  const prev = S[D.i];
  if (prev && prev.leave) prev.leave();
  const cam = W.camera;
  D.fly = how === 'fly' ? { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov, dur: 0, lift: 0 } : null;
  D.i = i; D.t = 0; D.switching = null; D.hold = 0;
  const sc = S[i];
  if (how !== 'fly' && how !== 'white') D.bg = null;
  sc.setup(how);
  if (D.fly){
    sc.cam(0, pose);
    const dist = pose.p.distanceTo(D.fly.p);
    D.fly.dur = SS.clamp(dist / 70, 1.5, 3.2);
    D.fly.lift = SS.clamp(dist * 0.14, 0, 36);
  }
  if (how === 'dip' && sc.card){
    $('iCardK').textContent = sc.card.k; $('iCardV').textContent = sc.card.v; $('iCardS').textContent = sc.card.s;
    $('iCard').classList.add('on');
    D.hold = 1.7;
  }
  if (sc.cap !== D.cap) renderCaption(sc.cap); else $('iCap').classList.remove('out');
  renderPanel(sc);
  bindTags(sc);
  const gi = sc.g;
  $('iStep').textContent = String(gi + 1).padStart(2, '0') + ' / ' + String(GROUPS.length).padStart(2, '0');
  $('intro').dataset.scene = sc.id;
}

function schedule(i, how){
  if (D.switching) return;
  if (REDUCED && how === 'fly') how = 'dissolve';
  D.switching = { i, how };
  if (how === 'dip') fade(FADE, 1, 0.5, () => enter(i, 'dip'));
  else if (how === 'white') fade(WHITE, 1, 0.42, () => { enter(i, 'white'); fade(WHITE, 0, 1.1); });
  else if (how === 'dissolve') D.snapReq = i;
  else enter(i, how);
}

IN.timeScale = 1;                                   // dev hook: run the walkthrough faster for testing
IN.update = function(dtR, renderer){
  if (!D) return 'ext';
  dtR *= IN.timeScale;
  if (renderer) D.renderer = renderer;
  D.dtR = dtR;
  stepFade(FADE, dtR); stepFade(WHITE, dtR);
  if (D.done) return 'ext';
  if (D.snapA > 0){ D.snapA = Math.max(0, D.snapA - dtR / 0.85); $('iSnap').style.opacity = easeS(D.snapA).toFixed(3); }
  const sc = S[D.i];
  if (!sc) return 'ext';
  const dt = D.paused || D.done ? 0 : dtR;

  if (D.hold > 0 && !D.paused){
    D.hold -= dtR;
    if (D.hold <= 0){ D.hold = 0; $('iCard').classList.remove('on'); fade(FADE, 0, 0.8); }
  }
  const run = D.hold > 0 ? 0 : dt;
  D.t += run;
  if (D.bg) { D.bgT += run; D.bg(D.bgT, run); }

  if (!D.switching && !D.closing && !D.paused && D.hold <= 0){
    const nx = sc.final ? -1 : D.i + 1;
    if (nx < 0){
      if (D.t >= sc.dur - 0.9 && !$('intro').classList.contains('closing')){ $('intro').classList.add('closing'); }
      if (D.t >= sc.dur){ finish('end'); return sc.where; }
    } else {
      const how = S[nx].tr, lead = how === 'dip' ? 0.5 : how === 'white' ? 0.42 : 0;
      if (D.t >= sc.dur - lead) schedule(nx, how);
    }
  }

  /* camera */
  const cam = W.camera;
  let tc = D.t;
  if (REDUCED && !sc.final){ const mid = sc.dur / 2; tc = mid + (tc - mid) * 0.3; }
  sc.cam(tc, pose);
  if (sc.where === 'ext' && !sc.final){
    const sw = 0.12;
    pose.l.x += Math.sin(D.t * 0.61 + sc.i) * sw; pose.l.y += Math.sin(D.t * 0.47 + sc.i * 2) * sw * 0.6;
  }
  lookQ(pose.p, pose.l, qT);
  let fov = sc.fov;
  if (D.fly && D.t < D.fly.dur){
    const w = easeIO(D.t / D.fly.dur);
    cam.position.lerpVectors(D.fly.p, pose.p, w);
    cam.position.y += Math.sin(Math.PI * w) * D.fly.lift;
    cam.quaternion.copy(D.fly.q).slerp(qT, w);
    fov = SS.lerp(D.fly.fov, sc.fov, w);
  } else { cam.position.copy(pose.p); cam.quaternion.copy(qT); }
  if (sc.where === 'ext'){ const g = W.H(cam.position.x, cam.position.z) + 1.1; if (cam.position.y < g) cam.position.y = g; }
  if (Math.abs(cam.fov - fov) > 0.01){ cam.fov = fov; cam.updateProjectionMatrix(); }

  /* actors */
  if (sc.update) sc.update(D.t, run);
  aUpdate(A.ev1, run); aUpdate(A.ev2, run);
  lampFollow();

  /* overlay */
  runTL(D.tl, D.t);
  updateObjectives(sc, D.t);
  updateTags(D.t);
  updateRoute(sc, D.t);
  updateTrack();
  if (!sc.final && D.t > sc.dur - 0.4 && S[sc.i + 1] && S[sc.i + 1].cap !== sc.cap) $('iCap').classList.add('out');
  return sc.where;
};

IN.afterRender = function(renderer){
  if (!D) return;
  if (D.thumb){
    const c = D.thumb, g = c.getContext('2d'), src = renderer.domElement;
    const sw = src.width, sh = src.height, cw = Math.min(sw, sh * 1.6), ch = cw / 1.6;
    try { g.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, c.width, c.height); } catch (e) {}
    c.parentNode.classList.add('shot');
    D.thumb = null;
  }
  if (D.snapReq !== undefined && D.snapReq !== null){
    const i = D.snapReq; D.snapReq = null;
    const c = $('iSnap'), src = renderer.domElement;
    if (c.width !== src.width || c.height !== src.height){ c.width = src.width; c.height = src.height; }
    try { c.getContext('2d').drawImage(src, 0, 0); D.snapA = 1; c.style.opacity = '1'; } catch (e) { D.snapA = 0; }
    enter(i, 'dissolve');
  }
};

/* jumps: dissolve straight to the first shot of a group */
function jump(i){
  if (!D || D.closing || D.i < 0) return;
  i = SS.clamp(i, 0, S.length - 1);
  D.switching = null; FADE.then = null; WHITE.then = null;
  $('iCard').classList.remove('on'); D.hold = 0;
  fade(FADE, 0, 0.35); fade(WHITE, 0, 0.35);
  D.routeFade = 0;
  $('intro').classList.remove('closing');
  D.switching = { i, how: 'dissolve' }; D.snapReq = i;
}
IN.seekGroup = function(g){ const s = GROUPS[g] && GROUPS[g].scenes[0]; if (s) jump(s.i); };
IN.step = function(dir){
  if (!D || D.i < 0 || D.closing) return;
  const g = S[D.i].g;
  if (dir < 0 && (D.t > 1.5 || S[D.i] !== GROUPS[g].scenes[0])) IN.seekGroup(g);
  else IN.seekGroup(SS.clamp(g + dir, 0, GROUPS.length - 1));
};
IN.togglePause = function(){
  if (!D || D.closing) return;
  D.paused = IN.paused = !D.paused;
  $('intro').classList.toggle('paused', D.paused);
  if (D.paused) $('intro').classList.remove('closing');
  $('iPause').textContent = D.paused ? '▶' : '❚❚';
  $('iPause').setAttribute('aria-label', D.paused ? 'Play' : 'Pause');
};
IN.skip = function(){ finish('skip'); };
/* dev hook (?debug=1): hold the walkthrough on scene i at time t */
IN.state = () => D && { scene: S[D.i] && S[D.i].id, t: +D.t.toFixed(2), fade: +FADE.v.toFixed(2), white: +WHITE.v.toFixed(2), snap: +(D.snapA || 0).toFixed(2), hold: +D.hold.toFixed(2), paused: D.paused, closing: D.closing, base: D.base, sun: D.sun };
IN.debugAt = function(i, t){
  if (!D) return;
  FADE.then = null; WHITE.then = null; fade(FADE, 0, 0.01); fade(WHITE, 0, 0.01); $('iCard').classList.remove('on');
  enter(i, 'seek'); D.hold = 0; D.t = 0;
  const step = 1 / 30;
  for (let k = 0; k < t; k += step){ D.paused = false; IN.update(step); }
  D.paused = IN.paused = true;
};
IN.key = function(k){
  if (!D) return false;
  if (k === 'escape'){ IN.skip(); return true; }
  if (k === 'arrowright'){ IN.step(1); return true; }
  if (k === 'arrowleft'){ IN.step(-1); return true; }
  if (k === ' ' || k === 'p'){ IN.togglePause(); return true; }
  return false;
};

function finish(how){
  if (!D || D.closing) return;
  D.closing = true; D.paused = false;
  D.snapReq = null; WHITE.then = null;
  fade(WHITE, 0, 0.3);
  const done = () => {
    restore();
    const opts = D.opts;
    D.done = true;
    IN.active = false;
    if (opts.onDone) opts.onDone(how);
    const root = $('intro');
    root.classList.add('closing');
    const mine = D;
    setTimeout(() => {
      if (D !== mine) return;
      root.hidden = true; root.classList.remove('closing', 'on', 'paused'); FADE.v = 0; FADE.el.style.opacity = '0'; D = null;
      if (SS.game && SS.game.syncUi) SS.game.syncUi();
    }, 800);
  };
  if (how === 'end') done();
  else { $('iCap').classList.add('out'); fade(FADE, 1, 0.38, done); }
}
IN.finish = finish;
addEventListener('resize', () => {
  if (!D || D.i < 0) return;
  D.barH = document.querySelector('#intro .ibar.top').getBoundingClientRect().height || 56;
  const p = $('iPanel'), r = p.getBoundingClientRect();
  D.panelRect = p.hidden ? null : { left: r.left - 18, bottom: r.bottom };
});

/* put the world back exactly as the title screen and the chapters expect it */
function restore(){
  aHide(A.ev1); aHide(A.ev2);
  if (A.ev1.m.group.parent !== W.scene) W.scene.add(A.ev1.m.group);
  lampOn(false); lamp.intensity = 0;
  R.tow = null; R.paying = false; R.lastPay = null; R.ev2Riding = false; R.ev2.group.visible = false;
  R.place(M.rover.x, M.rover.z, -2.2); ltvLights(false);
  R.model.wheels[0].g.rotation.y = R.model.wheels[1].g.rotation.y = 0; R.steer = 0;
  B.put(B.o.pallet, M.cargo.x, M.cargo.z, 0.3);
  B.o.isru.setDrill(0);
  if (B.o.yard){ B.o.yard.units.forEach((u, i) => { B.o.yard.setLouver(i, 0); B.o.yard.setLed(i, MD.mats().ledG); }); }
  W.cable.reset([]); W.clearDecals(); clearGameplay();
  setSun('day');
  setBase('full');
  I.airlock.setHatch(0); setPressure(10.2);
  I.hab.setMode('on');
  setScreen('eclss', 'ECLSS', [['STANDBY', '#F5B324']]);
  $('iRed').style.opacity = '0'; $('iRoute').style.opacity = '0'; $('iCard').classList.remove('on');
  D.bg = null;
}
})();
