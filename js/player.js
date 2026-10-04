/* Shackleton Station — EV1: first-person movement, suit consumables, interaction, photography. */
(function(){
'use strict';
const SS = window.SS;
SS.EVA_TS = 0.35;                 // EVA minutes per real second (≈23 real minutes per 8 h PLSS)
const RESERVE = 60;               // minutes

const PL = SS.player = {
  x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: 0, grounded: true,
  mode: 'walk',                   // walk | rover | locked
  scene: 'ext',                   // ext | hab | airlock
  stride: 0, lastStep: 0, side: 1, lope: false, distance: 0,
  headlamp: false, visor: false, photo: false, fov: 70,
  working: false, carrying: null,
  suit: null, cw: []
};
PL.resetSuit = function(){
  PL.suit = { worn: true, o2: 480, sop: 30, purge: false, fan: true, pwr: true, o2On: true, h2o: true,
    pressure: 4.3, co2: 0.9, batt: 100, metW: 110, temp: -20, evaMin: 0, dose: 0, doseRate: 0,
    margin: 400, minMargin: 999, walkback: 0, reserveHit: false, incap: false };
};
PL.resetSuit();

/* ------------------------------------------------------------------ interaction registry */
const IX = SS.interact = { items: [], cur: null };
IX.add = function(it){ IX.remove(it.id); it.prog = it.prog || 0; IX.items.push(it); return it; };
IX.remove = function(id){ IX.items = IX.items.filter(i => i.id !== id); };
IX.clear = function(){ IX.items = IX.items.filter(i => i.persist); };
IX.find = function(){
  const fx = -Math.sin(PL.yaw), fz = -Math.cos(PL.yaw);
  let best = null, bs = 1e9;
  for (const it of IX.items){
    if ((it.scene || 'ext') !== PL.scene) continue;
    if (it.enabled && !it.enabled()) continue;
    const d = SS.dist(PL.x, PL.z, it.x, it.z);
    if (d > (it.r || 2.6)) continue;
    const dx = it.x - PL.x, dz = it.z - PL.z, l = Math.hypot(dx, dz) || 1;
    const facing = (dx * fx + dz * fz) / l;
    if (d > 1.1 && facing < (it.cone !== undefined ? it.cone : 0.3)) continue;
    const s = d - facing * 1.5;
    if (s < bs){ bs = s; best = it; }
  }
  return best;
};

/* ------------------------------------------------------------------ camera-attached tools */
let tools = null;
PL.initTools = function(camera){
  tools = new THREE.Group(); camera.add(tools);
  const scoop = SS.models.scoop(); scoop.position.set(0.32, -0.62, -0.75); scoop.rotation.set(-0.9, 0.2, 0.3); scoop.visible = false; tools.add(scoop);
  const conn = SS.models.connector(); conn.position.set(0.28, -0.32, -0.55); conn.visible = false; tools.add(conn);
  PL.tools = { scoop, conn };
};
PL.showTool = function(name){ if (!PL.tools) return; PL.tools.scoop.visible = name === 'scoop'; PL.tools.conn.visible = name === 'connector'; };

/* ------------------------------------------------------------------ placement helpers */
PL.teleport = function(scene, x, z, yaw, y){
  PL.scene = scene; PL.x = x; PL.z = z; PL.vx = PL.vz = PL.vy = 0;
  PL.yaw = yaw !== undefined ? yaw : PL.yaw; PL.pitch = -0.05;
  PL.y = y !== undefined ? y : (scene === 'ext' ? SS.world.H(x, z) : 0);
  PL.grounded = true; PL.mode = 'walk'; PL.photo = false;
};

let cutscene = null;
PL.ladderDown = function(){
  return new Promise(res => {
    const W = SS.world, M = SS.MAP;
    const g0 = W.H(M.lander.x, M.lander.z);
    PL.mode = 'locked';
    cutscene = { t: 0, dur: 4.2, from: { x: 0, y: g0 + 4.41, z: 4.35 }, to: { x: 0, y: W.H(0, 7.0), z: 7.0 }, res };
  });
};

/* ------------------------------------------------------------------ per-frame */
let obsCache = [], obsT = 0;
function collide(nx, nz){
  const list = obsCache;
  for (let k = 0; k < list.length; k++){
    const o = list[k], dx = nx - o.x, dz = nz - o.z, rr = o.r + 0.32;
    if (dx > rr || dx < -rr || dz > rr || dz < -rr) continue;
    const d = Math.hypot(dx, dz);
    if (d < rr && d > 1e-4){ nx = o.x + dx / d * rr; nz = o.z + dz / d * rr; }
  }
  return [nx, nz];
}
function footfall(lope, hard){
  const W = SS.world;
  PL.side = -PL.side;
  const rx = Math.cos(PL.yaw), rz = -Math.sin(PL.yaw);
  const fx = PL.x + rx * 0.13 * PL.side, fz = PL.z + rz * 0.13 * PL.side;
  if (PL.scene === 'ext'){
    W.bootprint(fx, fz, PL.yaw + Math.PI / 2);
    W.dust(fx, W.H(fx, fz), fz, PL.vx * 0.35, PL.vz * 0.35, lope ? 9 : 4, lope ? 0.55 : 0.3, lope ? 1.1 : 0.6);
  }
  SS.audio.step(hard || lope);
}

PL.update = function(dt){
  const W = SS.world, K = SS.input.keys, cam = W.camera;
  const ext = PL.scene === 'ext';
  PL.working = false;

  if (cutscene){
    const c = cutscene; c.t += dt;
    const t = SS.clamp(c.t / c.dur, 0, 1), e = t * t * (3 - 2 * t);
    const rung = Math.sin(t * Math.PI * 14) * 0.03 * (1 - t);
    PL.x = SS.lerp(c.from.x, c.to.x, e); PL.z = SS.lerp(c.from.z, c.to.z, e); PL.y = SS.lerp(c.from.y, c.to.y, e) + rung;
    PL.yaw = SS.lerp(0, Math.PI, SS.smooth(0.75, 1, t)); PL.pitch = SS.lerp(-0.25, -0.05, t);
    cam.position.set(PL.x, PL.y + 1.72, PL.z); cam.rotation.set(PL.pitch, PL.yaw, 0);
    if (t >= 1){ cutscene = null; PL.mode = 'walk'; PL.grounded = true; PL.vx = PL.vz = 0; SS.audio.step(true); SS.world.dust(PL.x, PL.y, PL.z, 0, 0, 14, 0.6, 0.8); c.res(); }
    suit(dt, 0);
    return;
  }
  if (PL.mode === 'rover'){ suit(dt, 0); return; }          // camera driven by rover
  if (PL.mode === 'locked'){ cam.position.set(PL.x, PL.y + (ext ? 1.72 : 1.62), PL.z); cam.rotation.set(PL.pitch, PL.yaw, 0); suit(dt, 0); return; }
  const blocked = SS.game.inputLocked || SS.game.overlay;
  if (PL.mode === 'porch'){
    cam.position.set(PL.x, PL.y + 1.72, PL.z); cam.rotation.set(PL.pitch, PL.yaw, 0);
    const tp = blocked ? null : IX.find(); IX.cur = tp;
    if (tp && SS.input.hit('e')){ const u = tp.use; if (tp.once) IX.remove(tp.id); u && u(); }
    suit(dt, 0); return;
  }

  /* input -> desired velocity */
  let fx = 0, fz = 0;
  if (!blocked){
    if (K.w || K.arrowup) fz += 1;
    if (K.s || K.arrowdown) fz -= 1;
    if (K.a || K.arrowleft) fx -= 1;
    if (K.d || K.arrowright) fx += 1;
    const tv = SS.input.touchMove; if (tv && (tv.x || tv.y)){ fx += tv.x; fz -= tv.y; }
  }
  const l = Math.hypot(fx, fz); if (l > 1){ fx /= l; fz /= l; }
  PL.lope = ext && !!K.shift && fz > 0.2 && !PL.photo;
  let vmax = ext ? (PL.lope ? 4.2 : 2.4) : 1.7;
  if (PL.carrying) vmax *= 0.7;
  if (PL.photo) vmax *= 0.35;
  const sn = Math.sin(PL.yaw), cs = Math.cos(PL.yaw);
  let tx = (-sn * fz + cs * fx) * vmax, tz = (-cs * fz - sn * fx) * vmax;
  if (ext){
    const g = W.grad(PL.x, PL.z), up = tx * g.x + tz * g.z;
    if (up > 0){ const k = SS.clamp(1 - up / Math.max(0.5, vmax) * 1.6, 0.2, 1); tx *= k; tz *= k; }
  }
  const acc = PL.grounded ? (ext ? 4.5 : 12) : 0.35;
  PL.vx = SS.damp(PL.vx, tx, acc, dt); PL.vz = SS.damp(PL.vz, tz, acc, dt);
  let nx = PL.x + PL.vx * dt, nz = PL.z + PL.vz * dt;
  if (ext){
    obsT -= dt;
    if (obsT <= 0){
      obsT = 0.5;
      obsCache = SS.base.obstacles().concat(W.obstacles.filter(o => Math.abs(o.x - PL.x) < 40 && Math.abs(o.z - PL.z) < 40));
      if (SS.rover && SS.rover.group) obsCache.push({ x: SS.rover.x, z: SS.rover.z, r: 1.6 });
    }
    [nx, nz] = collide(nx, nz);
    if (!W.inBounds(nx, nz)){ nx = PL.x; nz = PL.z; }
  } else {
    const b = (PL.scene === 'hab' ? SS.interior.hab : SS.interior.airlock).bounds;
    nx = SS.clamp(nx, b.x0, b.x1); nz = SS.clamp(nz, b.z0, b.z1);
  }
  const moved = Math.hypot(nx - PL.x, nz - PL.z);
  PL.distance += ext ? moved : 0;
  PL.x = nx; PL.z = nz;

  const gy = ext ? W.H(PL.x, PL.z) : 0;
  if (ext && SS.input.hit(' ') && PL.grounded && !blocked && !PL.photo){ PL.vy = 2.1; PL.grounded = false; }
  PL.vy -= (ext ? 1.62 : 9.8) * dt;
  PL.y += PL.vy * dt;
  if (PL.y <= gy){
    if (!PL.grounded && PL.vy < -1.0) footfall(true, true);
    PL.y = gy; PL.vy = 0; PL.grounded = true;
  }

  const hs = Math.hypot(PL.vx, PL.vz);
  if (PL.grounded && hs > 0.25){
    PL.stride += hs * dt / (PL.lope ? 1.9 : 1.0);
    const s = Math.floor(PL.stride);
    if (s !== PL.lastStep){ PL.lastStep = s; footfall(PL.lope); }
  }
  const ph = PL.stride % 1;
  const amp = !PL.grounded ? 0 : (PL.lope ? 0.13 : 0.03) * SS.clamp(hs / 2.2, 0, 1);
  const bob = PL.lope ? Math.abs(Math.sin(ph * Math.PI)) * amp : Math.sin(ph * Math.PI * 2) * amp;
  const eye = ext ? 1.72 : 1.62;
  cam.position.set(PL.x, PL.y + eye + bob, PL.z);
  cam.rotation.set(PL.pitch, PL.yaw, Math.sin(ph * Math.PI * 2) * 0.004 * hs);

  /* photography */
  PL.fov = SS.damp(PL.fov, PL.photo ? 30 : (SS.game.settings.fov || 70), 8, dt);
  if (Math.abs(cam.fov - PL.fov) > 0.05){ cam.fov = PL.fov; cam.updateProjectionMatrix(); }

  /* interaction */
  const t = blocked ? null : IX.find();
  if (IX.cur && IX.cur !== t && IX.cur.hold && !IX.cur.keep && IX.items.indexOf(IX.cur) !== -1){ IX.cur.prog = 0; if (IX.cur.progress) IX.cur.progress(0, true); }
  IX.cur = t;
  if (t && !PL.photo){
    if (t.hold){
      if (K.e){
        PL.working = true;
        t.prog = Math.min(1, t.prog + dt / t.hold);
        if (t.progress) t.progress(t.prog, false);
        if (t.prog >= 1){ t.prog = 0; const u = t.use; if (t.once) IX.remove(t.id); u && u(); }
      } else if (t.prog > 0){
        if (!t.keep) t.prog = 0;
        if (t.progress) t.progress(t.prog, true);
      }
    } else if (SS.input.hit('e')){
      const u = t.use; if (t.once) IX.remove(t.id); SS.audio.ui('click'); u && u();
    }
  }
  suit(dt, hs);
};

/* ------------------------------------------------------------------ suit consumables */
function suit(dt, hs){
  const S = PL.suit, W = SS.world;
  const onEva = S.worn && PL.scene === 'ext';
  const riding = PL.mode === 'rover';
  const target = !onEva ? 90 : 105 + (riding ? 10 : hs * 45 + (PL.lope ? 95 : 0) + (PL.carrying ? 80 : 0)) + (PL.working ? 170 : 0) + (PL.grounded ? 0 : 60);
  S.metW = SS.damp(S.metW, target, 0.9, dt);
  if (!onEva){
    S.co2 = SS.damp(S.co2, 0.8, 0.6, dt);
    S.doseRate = 0;
    PL.cw = [];
    return;
  }
  const ts = SS.EVA_TS * dt;
  S.evaMin += ts;
  S.o2 = Math.max(0, S.o2 - ts * (S.metW / 300));
  S.batt = Math.max(0, S.batt - ts / 480 * 100);
  if (S.purge) S.sop = Math.max(0, S.sop - ts);
  if (S.purge) S.co2 = SS.damp(S.co2, 0.5, 0.35, dt);
  else if (!S.fan) S.co2 += dt * 0.3 * Math.max(0.7, S.metW / 150);
  else S.co2 = SS.damp(S.co2, 0.9 + (S.metW - 100) / 450, 0.5, dt);
  S.temp = W.extTempC(PL.x, PL.y + 1, PL.z);
  S.dose += SS.outpost.C.GCR / 1440 * ts + S.doseRate * dt;
  let dmin = 1e9;
  SS.base.airlocks().forEach(a => { dmin = Math.min(dmin, SS.dist(PL.x, PL.z, a.x, a.z)); });
  S.walkback = dmin / 0.9 / 60 * 1.25;
  S.margin = S.o2 - RESERVE - S.walkback;
  S.minMargin = Math.min(S.minMargin, S.margin);
  if (S.o2 <= RESERVE && !S.reserveHit){ S.reserveHit = true; SS.emit('reserve'); }
  const cw = [];
  if (!S.fan) cw.push({ lvl: 'warn', msg: 'SUIT FAN FAIL' });
  if (S.co2 > 15) cw.push({ lvl: 'warn', msg: 'ppCO₂ HIGH ' + S.co2.toFixed(1) + ' mmHg' });
  else if (S.co2 > 7.6) cw.push({ lvl: 'caution', msg: 'ppCO₂ ' + S.co2.toFixed(1) + ' mmHg' });
  if (S.purge && S.sop < 10) cw.push({ lvl: 'warn', msg: 'SOP ' + SS.fmtMin(S.sop) + ' REMAINING' });
  if (S.o2 <= RESERVE) cw.push({ lvl: 'warn', msg: 'PRIMARY O₂ AT RESERVE' });
  else if (S.margin < 0) cw.push({ lvl: 'caution', msg: 'WALKBACK MARGIN' });
  if (S.doseRate > 0.2) cw.push({ lvl: 'caution', msg: 'PROTON FLUX' });
  PL.cw = cw;
  if (!S.incap && (S.co2 > 30 || (S.purge && S.sop <= 0))){ S.incap = true; SS.emit('incap'); }
}

/* ------------------------------------------------------------------ photography */
SS.photoTarget = null;
PL.togglePhoto = function(){
  if (PL.scene !== 'ext' || PL.mode !== 'walk') return;
  PL.photo = !PL.photo;
  SS.audio.ui('toggle');
};
PL.shoot = function(){
  if (!PL.photo) return;
  SS.audio.shutter();
  const T = SS.photoTarget;
  let ok = false, why = '';
  if (T){
    const cam = SS.world.camera;
    const v = new THREE.Vector3(T.x, T.y, T.z).project(cam);
    const d = SS.dist(PL.x, PL.z, T.x, T.z);
    const framed = v.z < 1 && Math.abs(v.x) < 0.4 && Math.abs(v.y) < 0.45;
    if (!framed) why = 'Target not framed';
    else if (d < (T.min || 3)) why = 'Too close for a context image — step back';
    else if (d > (T.max || 30)) why = 'Too far — move closer';
    else ok = true;
  }
  SS.game.captureRequest = { caption: T ? T.caption : 'EVA photograph', ok };
  SS.emit('photo', { ok, why, target: T });
};
})();
