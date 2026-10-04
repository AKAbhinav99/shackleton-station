/* Shackleton Station — placing and syncing outpost hardware in the exterior scene. */
(function(){
'use strict';
const SS = window.SS;
const B = SS.base = { o: {} };

function put(obj, x, z, yaw, dy){
  const W = SS.world;
  obj.position.set(x, W.H(x, z) + (dy || 0), z);
  if (yaw !== undefined) obj.rotation.y = yaw;
  SS.world.scene.add(obj);
  return obj;
}
B.put = put;

B.build = function(){
  const MD = SS.models, M = SS.MAP, o = B.o;
  o.lander = put(MD.lander(), M.lander.x, M.lander.z, 0);
  o.hab = put(MD.hab(), M.hab.x, M.hab.z, 0);
  o.pdu = put(MD.pdu(), M.pdu.x, M.pdu.z, 0);
  o.flag1 = put(MD.flag('ST-1', '#FFB020'), M.st1.x + 3.2, M.st1.z - 2.5);
  o.flag2 = put(MD.flag('ST-2', '#FFB020'), M.st2.x + 3.2, M.st2.z - 2.5);
  o.boulder1 = put(MD.boulder(1.9, 3), M.st1.x, M.st1.z, 0.4, 0.55);
  o.boulder2 = put(MD.boulder(1.5, 19), M.st2.x, M.st2.z, 1.2, 0.45);
  o.pallet = put(MD.cargoPallet(), M.cargo.x, M.cargo.z, 0.3);
  o.crates = [];
  [[3.4, 1.2, 1.1], [3.2, -1.8, 0.9], [-3.1, 1.6, 1.0]].forEach(p => {
    const c = MD.box(p[2], p[2], p[2] * 1.3, MD.mats().white); put(c, M.cargo.x + p[0], M.cargo.z + p[1], 0.2, p[2] / 2); o.crates.push(c);
  });
  o.siteMarkers = M.sites.map(s => put(MD.siteMarker(s.id), s.x, s.z, 0));
  o.arrays = [];
  for (let i = 0; i < 3; i++){ const v = MD.vsat(); v.group.visible = false; SS.world.scene.add(v.group); o.arrays.push(v); }
  o.isru = MD.isru(); put(o.isru.group, M.isru.x, M.isru.z, Math.atan2(M.hab.x - M.isru.x, M.hab.z - M.isru.z));
  o.reactor = MD.reactor(); o.reactor.visible = false; SS.world.scene.add(o.reactor);
  o.greenhouse = put(MD.greenhouse(), M.greenhouse.x, M.greenhouse.z, 0);
  o.shelter = put(MD.shelter(), M.shelter.x, M.shelter.z, 0.2);
  o.excavator = put(MD.excavator(), M.hab.x - 7, M.hab.z + 7, 0.8);
  o.berm = MD.berm(); o.berm.scale.set(1.25, 1, 0.95); put(o.berm, M.hab.x - 1.5, M.hab.z, 0, -0.9); o.berm.visible = false;
  o.yard = null;
};

/* rebuild the storage yard when the battery count is known */
B.setYard = function(n){
  const M = SS.MAP;
  if (B.o.yard){ SS.world.scene.remove(B.o.yard.group); B.o.yard = null; }
  B.o.yard = SS.models.yard(n);
  put(B.o.yard.group, M.yard.x, M.yard.z, 0);
  B.o.yard.group.visible = true;
  B.o.yard.units.forEach(u => u.g.visible = n > 0);
};

/* arrays: first at the chosen site, extras beside it, same illumination class */
B.arrayPositions = function(site, count){
  const out = [];
  const offs = [[0, 0], [-9, 3], [9, 3]];
  for (let i = 0; i < count; i++) out.push({ x: site.x + offs[i][0], z: site.z + offs[i][1] });
  return out;
};

B.sync = function(g){
  const o = B.o, man = g.man, f = g.flags, dec = g.dec, M = SS.MAP;
  const sol = g.sol;
  o.pallet.visible = !f.palletTaken;
  o.siteMarkers.forEach(m => m.visible = !!f.showSites);
  const site = dec.siteId ? M.sites.find(s => s.id === dec.siteId) : null;
  const pos = site ? B.arrayPositions(site, man.vsat) : [];
  o.arrays.forEach((a, i) => {
    const vis = !!site && i < man.vsat && (i === 0 ? f.array1 : f.arraysAll);
    a.group.visible = vis;
    if (vis){
      a.group.position.set(pos[i].x, SS.world.H(pos[i].x, pos[i].z), pos[i].z);
      if (i > 0 || f.arraysAll){ a.setDeploy(1); a.yaw.rotation.y = f.arrayYaw !== undefined ? f.arrayYaw : 0; }
    }
  });
  o.isru.group.visible = !!man.isru;
  o.reactor.visible = !!(man.fsp && dec.reactor && sol >= 4);
  if (o.reactor.visible) put(o.reactor, dec.reactor.x, dec.reactor.z, 0);
  o.greenhouse.visible = !!(man.greenhouse && sol >= 4);
  o.shelter.visible = !!man.shelter;
  o.excavator.visible = !!man.excavator;
  o.berm.visible = !!(man.excavator && sol >= 6);
  o.excavator.position.set(M.hab.x - (sol >= 6 ? 12 : 7), SS.world.H(M.hab.x - 7, M.hab.z + 7), M.hab.z + (sol >= 6 ? 10 : 7));
  SS.models.habPower(!!f.powerOn && !g.habDark);
  SS.models.greenhousePower(!!(man.greenhouse && sol >= 4 && f.powerOn && !g.habDark && !g.nightShedGH));
  if (!o.yard || o.yard.units.length !== Math.max(1, man.battery) || o.yard._n !== man.battery){ B.setYard(man.battery); o.yard._n = man.battery; }
};

/* collision circles for whatever is standing */
B.obstacles = function(){
  const o = B.o, M = SS.MAP, out = [];
  out.push({ x: M.lander.x, z: M.lander.z, r: 4.6 });
  for (let k = 0; k < 4; k++){ const a = k * Math.PI / 2 + Math.PI / 4; out.push({ x: Math.cos(a) * 6.1, z: Math.sin(a) * 6.1, r: 0.9 }); }
  for (let x = -5; x <= 5; x += 2.5) out.push({ x: M.hab.x + x, z: M.hab.z, r: 3.1 });
  out.push({ x: M.hab.x + 6.2, z: M.hab.z, r: 1.6 });
  out.push({ x: M.pdu.x, z: M.pdu.z, r: 0.8 });
  out.push({ x: M.st1.x, z: M.st1.z, r: 1.8 }); out.push({ x: M.st2.x, z: M.st2.z, r: 1.5 });
  if (o.pallet.visible) out.push({ x: M.cargo.x, z: M.cargo.z, r: 1.5 });
  o.crates.forEach(c => out.push({ x: c.position.x, z: c.position.z, r: 0.9 }));
  o.arrays.forEach(a => { if (a.group.visible) out.push({ x: a.group.position.x, z: a.group.position.z, r: 1.4 }); });
  if (o.isru.group.visible) out.push({ x: o.isru.group.position.x, z: o.isru.group.position.z, r: 2.0 });
  if (o.reactor.visible) out.push({ x: o.reactor.position.x, z: o.reactor.position.z, r: 1.7 });
  if (o.greenhouse.visible) for (let x = -3; x <= 3; x += 2) out.push({ x: M.greenhouse.x + x, z: M.greenhouse.z, r: 2.3 });
  if (o.shelter.visible) out.push({ x: M.shelter.x, z: M.shelter.z, r: 2.0 }, { x: M.shelter.x + 1.6, z: M.shelter.z, r: 1.6 }, { x: M.shelter.x - 1.6, z: M.shelter.z, r: 1.6 });
  if (o.berm.visible) for (let x = -7.5; x <= 1.5; x += 3) out.push({ x: M.hab.x + x, z: M.hab.z, r: 5.6 });
  if (o.yard){ o.yard.units.forEach(u => { if (u.g.visible) out.push({ x: M.yard.x + u.g.position.x, z: M.yard.z, r: 1.2 }); }); out.push({ x: M.yard.x, z: M.yard.z + 2.4, r: 0.8 }); }
  return out;
};

/* nearest airlock for walkback computations */
B.airlocks = function(){ const M = SS.MAP; return [{ x: M.ladder.x, z: M.ladder.z, name: 'lander' }, { x: M.habLock.x + 1.2, z: M.habLock.z, name: 'hab' }]; };
})();
