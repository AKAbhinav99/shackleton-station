/* Shackleton Station — EV2, the buddy on every EVA. Nobody walks on the Moon alone. */
(function(){
'use strict';
const SS = window.SS;
const N = SS.npc = { x: 0, z: 0, y: 0, yaw: 0, v: 0, phase: 0, mode: 'hidden', target: null, onArrive: null, model: null };

N.build = function(){
  N.model = SS.models.astronaut({});
  N.model.group.visible = false;
  SS.world.scene.add(N.model.group);
};
N.place = function(x, z, yaw){ N.x = x; N.z = z; N.yaw = yaw || 0; N.y = SS.world.H(x, z); N.v = 0; };
N.set = function(mode, opts){
  N.mode = mode; opts = opts || {};
  N.target = opts.target || null; N.onArrive = opts.onArrive || null;
  N.model.group.visible = mode !== 'hidden' && mode !== 'ride';
  if (SS.rover) SS.rover.ev2Riding = mode === 'ride';
};
N.goto = function(x, z){ return new Promise(res => N.set('goto', { target: { x, z }, onArrive: res })); };

N.update = function(dt){
  if (!N.model || N.mode === 'hidden' || N.mode === 'ride') return;
  const W = SS.world, PL = SS.player;
  let tx = N.x, tz = N.z, speed = 0;
  if (N.mode === 'follow' && PL.scene === 'ext'){
    const px = PL.mode === 'rover' ? SS.rover.x : PL.x, pz = PL.mode === 'rover' ? SS.rover.z : PL.z;
    const bx = Math.sin(PL.yaw) * 3.2 + Math.cos(PL.yaw) * -1.8, bz = Math.cos(PL.yaw) * 3.2 - Math.sin(PL.yaw) * -1.8;
    tx = px + bx; tz = pz + bz;
    const d = SS.dist(N.x, N.z, tx, tz);
    speed = d > 1.2 ? SS.clamp(d * 0.9, 0.8, 4.3) : 0;
  } else if (N.mode === 'goto' && N.target){
    tx = N.target.x; tz = N.target.z;
    const d = SS.dist(N.x, N.z, tx, tz);
    speed = d > 0.6 ? SS.clamp(d * 0.8, 0.8, 3.2) : 0;
    if (d <= 0.6){ const cb = N.onArrive; N.set('idle'); if (cb) cb(); }
  }
  N.v = SS.damp(N.v, speed, 3, dt);
  if (N.v > 0.05){
    const dx = tx - N.x, dz = tz - N.z, l = Math.hypot(dx, dz) || 1;
    let nx = N.x + dx / l * N.v * dt, nz = N.z + dz / l * N.v * dt;
    const obs = SS.base.obstacles();
    for (const o of obs){
      const ox = nx - o.x, oz = nz - o.z, rr = o.r + 0.4, d = Math.hypot(ox, oz);
      if (d < rr && d > 1e-4){ nx = o.x + ox / d * rr; nz = o.z + oz / d * rr; }
    }
    if (PL.scene === 'ext'){
      const px = nx - PL.x, pz = nz - PL.z, d = Math.hypot(px, pz);
      if (d < 1.1 && d > 1e-4){ nx = PL.x + px / d * 1.1; nz = PL.z + pz / d * 1.1; }
    }
    N.yaw = Math.atan2(dx, dz);
    N.x = nx; N.z = nz;
    N.phase += N.v * dt * 3.1;
    if (Math.floor(N.phase / Math.PI) !== N._lastStep){
      N._lastStep = Math.floor(N.phase / Math.PI);
      const s = N._lastStep % 2 ? 1 : -1;
      const fx = N.x + Math.cos(N.yaw) * 0.13 * s, fz = N.z - Math.sin(N.yaw) * 0.13 * s;
      W.bootprint(fx, fz, N.yaw - Math.PI / 2);
      if (N.v > 2) W.dust(fx, W.H(fx, fz), fz, 0, 0, 3, 0.3, 0.6);
    }
  } else if (N.mode === 'follow' || N.mode === 'idle'){
    const px = PL.mode === 'rover' ? SS.rover.x : PL.x, pz = PL.mode === 'rover' ? SS.rover.z : PL.z;
    N.yaw += SS.angDiff(N.yaw, Math.atan2(px - N.x, pz - N.z)) * Math.min(1, dt * 1.5);
  }
  N.y = W.H(N.x, N.z);
  const g = N.model.group;
  g.position.set(N.x, N.y, N.z);
  g.rotation.y = N.yaw;
  if (N.mode === 'work') N.model.pose(SS.clock.game, 1, 'kneel');
  else N.model.pose(N.phase, SS.clamp(N.v / 2.5, 0, 1));
};
})();
