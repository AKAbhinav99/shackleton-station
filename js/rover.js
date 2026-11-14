/* Shackleton Station — LTV (lunar terrain vehicle). Forward is +z in the model; heading h gives
   world forward (sin h, cos h). Top speed 15 km/h, per the LTV requirement. */
(function(){
'use strict';
const SS = window.SS;
const R = SS.rover = {
  x: 0, z: 0, y: 0, h: 0, v: 0, steer: 0, pitch: 0, roll: 0,
  boarded: false, lights: false, tow: null, paying: false, lastPay: null,
  odo: 0, batt: 100, lookYaw: 0, lookPitch: -0.08, lastTrack: 0, group: null
};
const VMAX = 4.17, WB = 2.5;

R.build = function(){
  const m = SS.models.ltv();
  R.model = m; R.group = m.group;
  SS.world.scene.add(m.group);
  R.spots = [];
  m.lights.forEach(l => {
    const s = new THREE.SpotLight(0xFFF4E0, 0, 55, 0.55, 0.5, 1.3);
    s.position.copy(l.position); m.body.add(s);
    const t = new THREE.Object3D(); t.position.set(l.position.x, 0.2, l.position.z + 10); m.body.add(t);
    s.target = t; R.spots.push(s);
  });
  R.ev2 = SS.models.astronaut({});
  R.ev2.group.visible = false; R.ev2.pose(0, 0, 'sit');
  m.body.add(R.ev2.group);
  R.ev2.group.position.set(-0.42, 0.14, -0.05);
  SS.interact.add({ id: 'ltv-board', persist: true, x: 0, z: 0, r: 3.2, cone: -1,
    label: () => 'Get in the rover', enabled: () => !R.boarded && R.enabled && SS.player.scene === 'ext' && SS.player.mode === 'walk',
    use: () => R.board() });
};
R.place = function(x, z, h){ R.x = x; R.z = z; R.h = h || 0; R.v = 0; R.settle(1); R.syncIx(); };
R.syncIx = function(){
  const it = SS.interact.items.find(i => i.id === 'ltv-board');
  if (it){ const sx = Math.cos(R.h), sz = -Math.sin(R.h); it.x = R.x + sx * 1.4; it.z = R.z + sz * 1.4; }
};
R.board = function(){
  if (R.boarded) return;
  R.boarded = true; R.v = 0; R.boardT = SS.clock.ui;
  const PL = SS.player; PL.mode = 'rover'; PL.photo = false;
  R.lookYaw = 0; R.lookPitch = -0.08;
  SS.audio.clunk();
  SS.emit('board');
};
R.exit = function(){
  if (!R.boarded || Math.abs(R.v) > 0.4) return false;
  R.boarded = false;
  const PL = SS.player;
  const sx = Math.cos(R.h), sz = -Math.sin(R.h);
  PL.teleport('ext', R.x + sx * 1.9, R.z + sz * 1.9, R.h + Math.PI + Math.PI / 2);
  SS.audio.step(true);
  SS.emit('exit');
  return true;
};

R.settle = function(k){
  const W = SS.world;
  const fx = Math.sin(R.h), fz = Math.cos(R.h), rx = Math.cos(R.h), rz = -Math.sin(R.h);
  const hf = (W.H(R.x + fx * 1.25 + rx, R.z + fz * 1.25 + rz) + W.H(R.x + fx * 1.25 - rx, R.z + fz * 1.25 - rz)) / 2;
  const hr = (W.H(R.x - fx * 1.25 + rx, R.z - fz * 1.25 + rz) + W.H(R.x - fx * 1.25 - rx, R.z - fz * 1.25 - rz)) / 2;
  const hl = (W.H(R.x + rx, R.z + rz)), hrr = W.H(R.x - rx, R.z - rz);
  const ty = (hf + hr) / 2, tp = Math.atan2(hf - hr, 2.5), tr = Math.atan2(hl - hrr, 2.0);
  R.y = SS.lerp(R.y, ty, k); R.pitch = SS.lerp(R.pitch, tp, k); R.roll = SS.lerp(R.roll, tr, k);
  const g = R.group;
  g.position.set(R.x, R.y, R.z);
  g.rotation.order = 'YXZ';
  g.rotation.set(-R.pitch, R.h, R.roll);
};

let obs = [], obsT = 0;
R.update = function(dt){
  if (!R.group) return;
  const K = SS.input.keys, W = SS.world, PL = SS.player;
  let thr = 0;
  if (R.boarded && !SS.game.inputLocked && !SS.game.overlay){
    let st = 0;
    if (K.w || K.arrowup) thr += 1;
    if (K.s || K.arrowdown) thr -= 1;
    if (K.a || K.arrowleft) st += 1;
    if (K.d || K.arrowright) st -= 1;
    const tv = SS.input.touchMove; if (tv && (tv.x || tv.y)){ thr -= tv.y; st -= tv.x; }
    if (K[' ']){ R.v = SS.damp(R.v, 0, 3, dt); thr = 0; }
    if (thr > 0) R.v += (R.v < 0 ? 2.2 : 0.95) * thr * dt;
    else if (thr < 0) R.v += (R.v > 0 ? 2.2 : 0.6) * thr * dt;
    else R.v = SS.damp(R.v, 0, 0.6, dt);
    R.v = SS.clamp(R.v, -1.4, VMAX);
    const maxSteer = 0.5 * (1 - 0.45 * Math.abs(R.v) / VMAX);
    R.steer = SS.damp(R.steer, st * maxSteer, 5, dt);
    if (SS.input.hit('e') && SS.clock.ui - (R.boardT || 0) > 0.5) R.exit();
  } else {
    R.v = SS.damp(R.v, 0, 2.5, dt); R.steer = SS.damp(R.steer, 0, 3, dt);
  }
  /* slope: gravity along track */
  if (Math.abs(R.v) > 0.25 || thr !== 0) R.v -= 1.62 * Math.sin(R.pitch) * dt * 0.8;
  else R.v = 0;                                            // wheel brakes hold a parked LTV on a slope
  if (Math.abs(R.pitch) > 0.36 && Math.sign(R.v) === Math.sign(R.pitch)) R.v *= 0.9;
  R.h += (R.v * Math.tan(R.steer) / WB) * dt;
  let nx = R.x + Math.sin(R.h) * R.v * dt, nz = R.z + Math.cos(R.h) * R.v * dt;
  obsT -= dt;
  if (obsT <= 0){
    obsT = 0.4;
    obs = SS.base.obstacles().concat(W.obstacles.filter(o => o.r > 0.55 && Math.abs(o.x - R.x) < 40 && Math.abs(o.z - R.z) < 40));
  }
  for (const o of obs){
    const dx = nx - o.x, dz = nz - o.z, rr = o.r + 1.7, d = Math.hypot(dx, dz);
    if (d < rr && d > 1e-4){
      nx = o.x + dx / d * rr; nz = o.z + dz / d * rr;
      if (Math.abs(R.v) > 1.2) SS.audio.clunk();
      R.v *= 0.3;
    }
  }
  if (!W.inBounds(nx, nz)){ nx = R.x; nz = R.z; R.v = 0; }
  const moved = SS.dist(R.x, R.z, nx, nz);
  R.x = nx; R.z = nz; R.odo += moved; R.batt = Math.max(0, R.batt - moved * 0.004);
  R.settle(SS.clamp(dt * 8, 0, 1));
  R.model.wheels.forEach(w => { w.spin.rotation.x += R.v * dt / 0.46; });
  R.model.wheels[0].g.rotation.y = R.model.wheels[1].g.rotation.y = R.steer;

  /* regolith: tracks and the rooster tails that made Apollo fenders a necessity */
  R.lastTrack += moved;
  const fx = Math.sin(R.h), fz = Math.cos(R.h), rx = Math.cos(R.h), rz = -Math.sin(R.h);
  if (R.lastTrack > 0.9){
    R.lastTrack = 0;
    [1, -1].forEach(s => W.track(R.x - fx * 1.25 + rx * 0.98 * s, R.z - fz * 1.25 + rz * 0.98 * s, R.h + Math.PI / 2));
  }
  if (Math.abs(R.v) > 0.7){
    [1, -1].forEach(s => {
      const wx = R.x - fx * 1.25 + rx * 0.98 * s, wz = R.z - fz * 1.25 + rz * 0.98 * s;
      W.dust(wx, W.H(wx, wz) + 0.1, wz, -fx * R.v * 0.5, -fz * R.v * 0.5, Math.ceil(Math.abs(R.v) * 0.8), 0.35, 0.6 + Math.abs(R.v) * 0.35);
    });
  }
  /* cable payout from the rear reel */
  if (R.paying){
    const hx = R.x - fx * 1.8, hz = R.z - fz * 1.8;
    if (!R.lastPay || SS.dist(hx, hz, R.lastPay.x, R.lastPay.z) > 1.6){ W.cable.add(hx, hz); R.lastPay = { x: hx, z: hz }; }
    R.model.reel.rotation.x += moved * 1.4;
  }
  /* towed pallet trails the hitch */
  if (R.tow){
    const hx = R.x - fx * 1.85, hz = R.z - fz * 1.85;
    const t = R.tow;
    let dx = t.x - hx, dz = t.z - hz; const d = Math.hypot(dx, dz) || 1;
    t.x = hx + dx / d * 2.6; t.z = hz + dz / d * 2.6;
    t.h = Math.atan2(-dx, -dz);
    t.obj.position.set(t.x, W.H(t.x, t.z) + 0.05, t.z); t.obj.rotation.y = t.h;
  }
  /* lights */
  const want = R.lights ? 3.2 : 0;
  R.spots.forEach(s => { s.intensity = want; });
  R.model.lightMat.emissiveIntensity = R.lights ? 2.4 : 0;
  R.syncIx();

  /* driver's-eye camera */
  if (R.boarded){
    const cam = W.camera;
    const seat = new THREE.Vector3(0.42, 1.78, -0.12);
    R.group.localToWorld(seat);
    cam.position.copy(seat);
    cam.rotation.set(R.lookPitch - R.pitch * 0.9, R.h + Math.PI + R.lookYaw, -R.roll * 0.9);
    PL.x = R.x; PL.z = R.z; PL.y = R.y; PL.yaw = R.h + Math.PI + R.lookYaw;
  }
  R.ev2.group.visible = !!R.ev2Riding;
};
R.hitch = function(obj){ R.tow = { obj, x: obj.position.x, z: obj.position.z, h: 0 }; SS.audio.clunk(); };
R.unhitch = function(){ const t = R.tow; R.tow = null; SS.audio.clunk(); return t; };
})();
