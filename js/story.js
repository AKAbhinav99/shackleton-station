/* Shackleton Station — the integrated sim: seven chapters played as async scripts. */
(function(){
'use strict';
const SS = window.SS, UI = SS.ui;
const ST = SS.story = { token: 0, idx: -1, intent: null, hooks: [] };
class Abort extends Error {}
ST.Abort = Abort;

/* ------------------------------------------------------------------ script plumbing */
const waiters = [];
ST.tick = function(dt){
  for (let i = waiters.length - 1; i >= 0; i--){
    const w = waiters[i];
    if (w.tok !== ST.token){ waiters.splice(i, 1); w.rej(new Abort()); continue; }
    let ok = false; try { ok = w.cond(); } catch (e) { console.error(e); }
    if (ok){ waiters.splice(i, 1); w.res(); }
  }
  ST.hooks = ST.hooks.filter(h => h.tok === ST.token && !h.dead);
  ST.hooks.forEach(h => { try { if (h.fn(dt) === false) h.dead = true; } catch (e) { console.error(e); h.dead = true; } });
};
function ctx(tok){
  const alive = () => { if (tok !== ST.token) throw new Abort(); };
  const c = {
    alive,
    say: async (sp, text, o) => { alive(); await SS.radio.say(sp, text, o); alive(); },
    tell: (sp, text, o) => { SS.radio.say(sp, text, o); },
    choose: async (opts, o) => { alive(); const r = await SS.radio.choose(opts, o); alive(); return r; },
    until: cond => new Promise((res, rej) => waiters.push({ cond, res, rej, tok })),
    wait: async s => { alive(); await SS.after(s); alive(); },
    event: (name, filter) => new Promise((res, rej) => {
      let off = null;
      const w = { cond: () => false, res: () => {}, rej: e => { if (off) off(); rej(e); }, tok };
      off = SS.on(name, d => { if (!filter || filter(d)){ off(); w.tok = -1; res(d); } });
      waiters.push(w);
    }),
    every: fn => { ST.hooks.push({ fn, tok }); },
    stream: (name, filter) => {
      const q = []; let wake = null;
      const off = SS.on(name, d => { if (filter && !filter(d)) return; if (wake){ const w = wake; wake = null; w(d); } else q.push(d); });
      return {
        off,
        next: () => new Promise((res, rej) => {
          if (q.length) return res(q.shift());
          wake = res;
          waiters.push({ cond: () => false, res: () => {}, rej: e => { off(); rej(e); }, tok });
        })
      };
    },
    flag: (name, filter) => { const f = { hit: false, data: null }; f.off = SS.on(name, d => { if (!filter || filter(d)){ f.hit = true; f.data = d; } }); return f; },
    obj: (t, steps) => UI.objective(t, steps, c.kicker),
    step: i => UI.step(i),
    wp: w => UI.waypoint(w),
    note: (t, s) => UI.note(t, s)
  };
  return c;
}

/* ------------------------------------------------------------------ helpers */
const G = () => SS.game;
const PL = () => SS.player;
const M = () => SS.MAP;
const yawTo = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz));
const near = (x, z, r) => SS.dist(PL().x, PL().z, x, z) < r;
const sunForSol = sol => ({ az: (148 + sol * 12.2) % 360, el: SS.outpost.isNight(sol) ? -0.4 : 4.5 });
ST.sunForSol = sunForSol;
function metric(){ return G().metrics; }
function dev(note){ metric().procDev++; metric().procNotes.push(note); SS.audio.ui('err'); }
function eva(n){
  const g = G(), p = PL();
  p.resetSuit();
  g.evaNo = n;
  g.track = [];
  g.evaStart = { dist: p.distance, odo: SS.rover.odo };
  g.onEva = true;
  SS.dcm.state = { pwr: true, fan: true, o2: true, h2o: true, purge: false, comm: true }; SS.dcm.guard = false;
  SS.dcm.setChecklist(null);
}
function endEva(note){
  const g = G(), S = PL().suit;
  if (!g.onEva) return;
  g.onEva = false;
  const walk = PL().distance - g.evaStart.dist, drive = SS.rover.odo - g.evaStart.odo;
  metric().evas.push({ n: g.evaNo, sol: g.sol, dur: SS.fmtMin(S.evaMin), dist: Math.round(walk) + ' m walk · ' + Math.round(drive) + ' m LTV',
    margin: (S.minMargin >= 0 ? '+' : '−') + SS.fmtMin(Math.abs(Math.min(S.minMargin, 480))), minMargin: S.minMargin, reserve: S.reserveHit, note: note || '' });
  g.dec.ev1Eva = (g.dec.ev1Eva || 0) + S.dose;
  if (S.reserveHit) SS.outpost.violate(g.out, 'FR-6', 'EVA ' + g.evaNo + ' ran into the PLSS reserve');
  S.dose = 0; S.doseRate = 0;
  SS.photoTarget = null;
  UI.waypoint(null); UI.markers([]);
  SS.npc.set('hidden');
}
function evaSummary(title, extra){
  const S = PL().suit, g = G(), e = metric().evas[metric().evas.length - 1];
  const rows = [['Duration', SS.fmtMin(S.evaMin) + ' (h:mm)'], ['Traverse', e ? e.dist : '—'], ['PLSS remaining', SS.fmtMin(S.o2)], ['Minimum walkback margin', e ? e.margin : '—']].concat(extra || []);
  return UI.summary({ kicker: 'EVA ' + g.evaNo + ' · Sol ' + g.sol, title, rows, note: '' });
}
function world(opts){
  const g = G(), W = SS.world, B = SS.base;
  g.sol = opts.sol;
  g.metMin = opts.met !== undefined ? opts.met : 8 * 60;
  const sun = opts.sun || sunForSol(opts.sol);
  if (!W._sun || W._sun.az !== sun.az || W._sun.el !== sun.el){ W.setSun(sun.az, sun.el); W._sun = sun; }
  g.nightShedGH = SS.outpost.isNight(g.sol) && g.dec.policy.greenhouse === 'shed';
  B.sync(g);
  if (opts.rover) SS.rover.place(opts.rover.x, opts.rover.z, opts.rover.h);
  SS.rover.enabled = opts.roverEnabled !== false;
  SS.rover.paying = false; SS.rover.tow = null; SS.rover.lights = !!opts.lights;
  if (SS.rover.boarded){ SS.rover.boarded = false; }
  SS.npc.set('hidden');
  SS.interior.hab.setMode(opts.habMode || (g.flags.powerOn ? (SS.outpost.isNight(g.sol) ? 'night' : 'on') : 'off'));
  SS.interior.hab.setShelter(!!g.man.shelter);
  SS.interior.hab.iv.group.visible = !!opts.ivInHab;
  SS.interior.renderWindow(g.renderer);
  if (opts.player) PL().teleport(opts.player.scene || 'ext', opts.player.x, opts.player.z, opts.player.yaw, opts.player.y);
  PL().headlamp = !!opts.lights;
  PL().visor = false;
  SS.interact.clear();
  SS.world.cable.reset(g.cablePts || []);
}
function habScreens(){
  const H = SS.interior.hab, g = G(), O = SS.outpost;
  H.setScreen('eclss', 'ECLSS', g.flags.eclssOn ? [['LOOP CLOSED', '#39D07A'], ['ppO2 21.3 kPa'], ['ppCO2 2.1 mmHg'], ['WRS 93%']] : [['STANDBY', '#F5B324'], ['SURVIVAL HEATERS']]);
  const gen = O.generation(g.man, g.dec, g.sol), cap = O.capacity(g.man, g.dec, g.sol);
  H.setScreen('eps', 'EPS', [['GEN ' + gen.toFixed(1) + ' kW', gen < 7.7 ? '#F5B324' : '#39D07A'], ['STORAGE ' + (cap ? Math.round(g.out.batt / cap * 100) + '%' : 'NONE')], [O.isNight(g.sol) ? 'DARKNESS' : 'SUNLIT']]);
}

/* ------------------------------------------------------------------ chapter definitions */
const CH = ST.CH = [];

/* ============ 0 · FLIGHT READINESS REVIEW ============ */
CH.push({
  id: 'frr', title: 'Flight Readiness Review', kicker: 'Chapter 0 · Planning', short: 'Build the 26 t manifest and face the console poll',
  meta: 'L−30 days · Mission Control, Houston',
  lede: 'Before anyone walks on Shackleton, the cargo has to be chosen. One lander, twenty-six tonnes. Power, storage, habitat, life support, water, food and shielding all compete for the same mass, and every console on the flight control team will tell you exactly what your choices cost.',
  obj: ['Choose what the cargo lander carries', 'Read the console poll', 'Accept or fix any NO-GO'],
  noCard: false,
  async run(c){
    const g = G();
    const r = await SS.frr.open(g.man || SS.outpost.manifestDefault());
    g.man = r.man;
    g.metrics.nogo = r.polls.filter(p => p.s === 'nogo').map(p => p.c);
    g.metrics.waivers = r.nogo;
    g.out = SS.outpost.newState(g.man, g.dec);
    const mass = SS.outpost.mass(g.man);
    const quote = r.nogo
      ? 'I will sign it, but understand what I am signing: ' + g.metrics.nogo.join(' and ') + ' said no, and you told them you would fly anyway. That is on the record now.'
      : 'Every console is go. That does not mean nothing will go wrong. It means that when it does, you will have the hardware to deal with it.';
    await UI.summary({ kicker: 'Flight Readiness Review', title: r.nogo ? 'Manifest approved with ' + r.nogo + ' accepted risk' + (r.nogo > 1 ? 's' : '') : 'Manifest approved — all GO',
      rows: [['Landed mass', mass.toFixed(1) + ' of 26.0 t'], ['Solar arrays', String(g.man.vsat)], ['Fission unit', g.man.fsp ? 'yes' : 'no'], ['Storage', g.man.battery * 100 + ' kWh'],
             ['Habitat', g.man.hab], ['Ice plant', g.man.isru ? 'yes' : 'no'], ['Crops', g.man.greenhouse ? 'yes' : 'no'], ['Storm protection', g.man.shelter ? 'shelter' : g.man.excavator ? 'regolith berm' : 'none']],
      note: 'FLIGHT: “' + quote + '”' });
  }
});

/* ============ 1 · EGRESS ============ */
CH.push({
  id: 'egress', title: 'Egress', kicker: 'Chapter 1 of 7', short: 'Suit checklist, depress, first steps, geology at Station 1',
  meta: 'EVA 1 · Sol 1 · Lander airlock', sol: 1,
  lede: 'Your first surface EVA. Configure the suit in checklist order, depress the airlock, and take the first steps at the lunar south pole. Then do what crews are actually sent to do: careful geology.',
  obj: ['DCM checklist and leak check', 'Comm check and depress', 'Descend to the surface', 'Station 1: context photo and scoop sample'],
  setup(){
    world({ sol: 1, met: 7 * 60 + 40, player: { scene: 'airlock', x: 0, z: -0.45, yaw: Math.PI }, rover: { x: M().rover.x, z: M().rover.z, h: -2.2 } });
    const S = PL().suit; S.pressure = 0; S.fan = false; S.o2 = 480;
    G().onEva = false;
    SS.dcm.state = { pwr: false, fan: false, o2: false, h2o: false, purge: false, comm: true }; SS.dcm.guard = false;
    SS.interior.airlock.setPressure(10.2); SS.interior.airlock.setHatch(0);
    G().metSub = 'Descent element airlock';
  },
  async run(c){
    const g = G(), p = PL(), S = p.suit, A = SS.interior.airlock;
    g.suitPowered = false;
    c.obj('Egress preparation', ['Configure the suit on the DCM', 'Leak check', 'Comm check', 'Depress the airlock', 'Egress and descend']);
    await c.wait(1.0);
    const dcmQ = c.stream('dcm', d => d.id !== 'guard');
    const leakQ = c.stream('leak', d => !d.down);
    c.tell('IV', 'EV1, IV. You are suited and sealed. We take it by the cuff checklist, page two. Open your DCM — Tab.');
    UI.toast('Press Tab to open your DCM');
    SS.dcm.setChecklist('PG 2 · PRE-EVA', ['PWR — BATT', 'FAN — ON', 'O₂ — ON', 'H₂O — ON', 'LEAK CHECK — hold 3 s'], 0, 'Circulation before oxygen: fan before O₂.');
    await c.until(() => SS.dcm.isOpen);
    const order = ['pwr', 'fan', 'o2', 'h2o'];
    const lines = {
      pwr: 'Battery power. Good.', fan: 'Fan is spinning — hear it? That is your air moving. O₂ on.',
      o2: 'Suit coming up. Four point three psi. Cooling water on.', h2o: 'Water flowing through the garment. Leak check: press and hold LEAK CHECK.'
    };
    let cur = 0;
    while (cur < order.length){
      const ev = await dcmQ.next();
      const want = order[cur], i = order.indexOf(ev.id);
      if (ev.id === want && ev.value){
        if (want === 'fan') S.fan = true;
        if (want === 'o2'){ const t0 = SS.clock.ui; c.every(() => { S.pressure = Math.min(4.3, (SS.clock.ui - t0) * 1.6); SS.dcm.lcd(); return S.pressure < 4.3; }); }
        if (want === 'pwr') g.suitPowered = true;
        cur++;
        SS.dcm.setChecklist('PG 2 · PRE-EVA', ['PWR — BATT', 'FAN — ON', 'O₂ — ON', 'H₂O — ON', 'LEAK CHECK — hold 3 s'], cur, 'Circulation before oxygen: fan before O₂.');
        c.tell('IV', lines[want]);
      } else if (ev.value && i > cur){
        dev('DCM: ' + ev.id.toUpperCase() + ' selected before ' + want.toUpperCase());
        SS.dcm.state[ev.id] = false; SS.dcm.render();
        c.tell('IV', ev.id === 'o2' && want === 'fan' ? 'Negative, EV1 — fan before O₂. We need circulation first or you sit in your own CO₂. Back it out.' : 'EV1, IV — negative, we are on ' + want.toUpperCase() + '. Back that out and follow the cuff.');
      } else if (!ev.value && i >= 0 && i < cur){
        SS.dcm.state[ev.id] = true; SS.dcm.render();
        c.tell('IV', 'Leave that on, EV1.');
      } else if (ev.id === 'purge'){
        SS.dcm.state.purge = false; SS.dcm.guard = false; SS.dcm.render();
        dev('DCM: purge valve opened during pre-EVA');
        c.tell('IV', 'Close the purge, EV1. That is your emergency oxygen.');
      }
    }
    c.step(1);
    let leakOK = false;
    while (!leakOK){
      const ev = await leakQ.next();
      if (ev.held >= 2.5) leakOK = true;
      else UI.toast('Hold LEAK CHECK for three seconds');
    }
    dcmQ.off(); leakQ.off();
    SS.dcm.setChecklist('PG 2 · PRE-EVA', ['PWR — BATT', 'FAN — ON', 'O₂ — ON', 'H₂O — ON', 'LEAK CHECK — hold 3 s'], 5, 'Complete.');
    await c.say('IV', 'Decay point zero two psi per minute. Limit is point one. Good suit. Close the DCM.');
    await c.until(() => !SS.dcm.isOpen);
    c.step(2);
    await c.say('CAPCOM', 'EV1, Houston. Comm check.');
    const r = await c.choose([
      { text: 'Houston, EV1. Loud and clear.', score: 1 },
      { text: 'Yeah, I have got you fine.', score: 0 },
      { text: 'Go ahead.', score: 0 }], { timeout: 18 });
    if (r === 0) await c.say('CAPCOM', 'Loud and clear, EV1. You are go for depress.', { delay: 2.6 });
    else if (r < 0) { await c.say('CAPCOM', 'EV1, Houston. How do you read?', { delay: 1 }); await c.say('CAPCOM', 'We will take silence as loud and clear. Callsigns first on this loop, please. Go for depress.'); }
    else await c.say('CAPCOM', 'Copy, EV1. Callsign first on the loop, please — it keeps two hundred people from guessing who is talking. Go for depress.', { delay: 2.6 });
    c.note('Everything you say reaches Houston about 1.3 seconds later, and their answer takes another 1.3 to come back. That light-time is why CAPCOM always seems to pause before answering, and why surface crews are trained to act on their own and report, rather than wait to be told.', 'Earth–Moon distance 384,400 km at the speed of light');
    c.step(3);
    await c.say('IV', 'Depress valve is on your right. Hold it open until the gauge reads zero.');
    let hissing = false, depressed = false;
    SS.interact.add({ id: 'depress', scene: 'airlock', x: -0.75, z: 0.55, r: 1.4, cone: -1, hold: 7, keep: true, label: 'Depress valve',
      progress: (pr, rel) => { A.setPressure(10.2 * (1 - pr)); if (!rel && !hissing){ hissing = true; SS.audio.hiss(7.5); } if (rel) hissing = false; },
      use: () => { depressed = true; A.setPressure(0); } });
    await c.until(() => depressed);
    SS.interact.remove('depress');
    await c.say('IV', 'Zero point zero. Equalized. The hatch is yours, EV1.');
    let open = false;
    SS.interact.add({ id: 'hatch', scene: 'airlock', x: 0, z: 1.1, r: 1.6, cone: -1, label: 'Open the outer hatch', once: true, use: () => { open = true; } });
    await c.until(() => open);
    const t0 = SS.clock.ui;
    c.every(() => { const t = SS.smooth(0, 1.6, SS.clock.ui - t0); A.setHatch(t); return t < 1; });
    await c.wait(1.7);
    UI.flash();
    const g0 = SS.world.H(0, 0);
    PL().teleport('ext', 0, 3.7, 0, g0 + 4.41);
    PL().mode = 'porch';
    g.onEva = true; eva(1);
    g.metSub = 'EVA 1 · Shackleton connecting ridge';
    c.step(4);
    await c.say('CAPCOM', 'EV1, Houston. Go for egress. The sun is low in the south-south-east, right down your line of sight at the bottom of the ladder. V drops your gold visor.');
    let down = false;
    SS.interact.add({ id: 'ladder', x: 0, z: 4.4, r: 2.5, cone: -1, label: 'Descend the ladder', once: true, use: () => { down = true; } });
    await c.until(() => down);
    await PL().ladderDown();
    c.step(5);
    await c.say('CAPCOM', 'Houston copies boots on the regolith. Welcome to Shackleton, EV1.');
    const r2 = await c.choose([
      { text: 'Houston, EV1 is on the surface. Beginning traverse to Station 1.', score: 1 },
      { text: 'It is all shadow out here. The sun is barely off the horizon.', score: 0 },
      { text: 'Stand by, Houston. Taking it in.', score: 0 }], { timeout: 25, prompt: 'First words on the loop' });
    if (r2 === 1) await c.say('CAPCOM', 'That is the pole, EV1. The sun never gets more than a degree or two above the horizon. Every shadow here is a hundred meters long.', { delay: 2.6 });
    else if (r2 === 2) await c.say('CAPCOM', 'Take your time, EV1. We will wait.', { delay: 2.6 });
    else await c.say('CAPCOM', 'Copy, EV1. Proceed to Station 1.', { delay: 2.6 });
    c.note('No stars, no haze. Your eyes are adapted to the sunlit ground, so the sky reads empty black — the same reason Apollo photographs show no stars. And with no atmosphere there is no haze: a ridge two kilometres away is as sharp as your boots.', 'Apollo surface photography; vacuum optics');
    SS.npc.place(0.9, 7.6, Math.PI); SS.npc.set('follow');
    await c.say('EV2', 'EV2 is on the surface. Right behind you, EV1.');
    c.obj('Station 1 — geology', ['Traverse to Station 1', 'Context photograph', 'Scoop sample from the fillet', 'Return to the lander']);
    c.wp({ x: M().st1.x, z: M().st1.z, label: 'ST-1', h: 3 });
    await c.say('IV', 'Station 1 is the big block about sixty meters out, bearing two-three-zero. Try the lope — hold Shift. Let your hips do the work.');
    await c.until(() => near(M().st1.x, M().st1.z, 16));
    c.step(1);
    SS.photoTarget = { x: M().st1.x, y: SS.world.H(M().st1.x, M().st1.z) + 1.0, z: M().st1.z, min: 6, max: 22, caption: 'Station 1 context' };
    const shot1 = c.flag('photo', d => d.ok);
    const why1 = SS.on('photo', d => { if (!d.ok && d.why) UI.toast(d.why, 'err'); });
    await c.say('CAPCOM', 'EV1, the science backroom would like a context image first: from about ten meters, whole block in frame. F raises the camera.');
    await c.until(() => shot1.hit);
    shot1.off(); why1();
    if (PL().photo) PL().togglePhoto();
    SS.photoTarget = null;
    await c.say('CAPCOM', 'Got the downlink. Nice frame, EV1.', { delay: 2.6 });
    c.step(2);
    const sa = SS.world.sun.az * SS.DEG;
    const fx = M().st1.x - Math.sin(sa) * 2.6, fz = M().st1.z + Math.cos(sa) * 2.6;
    UI.markers([{ x: fx, z: fz, label: 'FILLET', h: 0.8 }]);
    await c.say('CAPCOM', 'Now a scoop from the fillet — the soil banked against the down-sun side of the block. Hold E to scoop. EV2 has the bags.');
    SS.npc.goto(fx + 1.2, fz + 0.8);
    let scooped = false;
    SS.interact.add({ id: 'scoop', x: fx, z: fz, r: 2.2, cone: -1, hold: 4, label: 'Scoop sample — fillet',
      progress: (pr, rel) => { PL().showTool(rel ? null : 'scoop'); if (!rel && Math.random() < 0.3) SS.world.dust(fx, SS.world.H(fx, fz), fz, 0, 0, 3, 0.25, 0.7); if (PL().tools) PL().tools.scoop.rotation.x = -0.9 + Math.sin(pr * 12) * 0.25; },
      use: () => { scooped = true; PL().showTool(null); } });
    await c.until(() => scooped);
    SS.interact.remove('scoop'); UI.markers([]);
    SS.npc.set('work');
    await c.say('EV2', 'Bag one-zero-one, sealed and stowed. It weighs almost nothing up here.');
    SS.npc.set('follow');
    metric().samples = (metric().samples || 0) + 1;
    await c.say('CAPCOM', 'Science is very happy, EV1. That fillet has been collecting fragments for a very long time. Head back to the ladder — you are at ' + SS.fmtMin(PL().suit.o2) + ' on the PLSS.', { delay: 2.6 });
    c.step(3);
    c.wp({ x: M().ladder.x, z: M().ladder.z + 0.6, label: 'LADDER', h: 2 });
    let inn = false;
    SS.interact.add({ id: 'ingress', x: 0, z: 7.0, r: 2.6, cone: -1, label: 'Climb the ladder — end EVA 1', once: true, use: () => { inn = true; } });
    await c.until(() => inn);
    endEva('First egress; Station 1 geology');
    await evaSummary('EVA 1 complete', [['Samples', '1 scoop (fillet, ST-1)'], ['Photographs', String(g.photos.length)]]);
  }
});

/* ============ 2 · FIRST LIGHT ============ */
CH.push({
  id: 'power', title: 'First Light', kicker: 'Chapter 2 of 7', short: 'Tow the solar array, choose its site, deploy, lay cable',
  meta: 'EVA 2 · Sol 3 · Cargo pad', sol: 3,
  lede: 'The habitat is on survival heaters. Today you give it power: tow the vertical solar array off the cargo pad, choose where it stands, raise the mast, aim it at a sun that never climbs, and lay the cable home. Where you put it is the most important decision of the week.',
  obj: ['Drive the LTV and hitch the array pallet', 'Choose a site — ridge or flats', 'Deploy the mast and calibrate sun tracking', 'Lay cable to the habitat and connect'],
  setup(){
    world({ sol: 3, met: 8 * 60 + 5, player: { x: 0.4, z: 7.4, yaw: yawTo(0.4, 7.4, M().rover.x, M().rover.z) }, rover: { x: M().rover.x, z: M().rover.z, h: Math.atan2(M().cargo.x - M().rover.x, M().cargo.z - M().rover.z) } });
    G().flags.palletTaken = false; G().flags.array1 = false; G().flags.showSites = false;
    SS.base.sync(G());
    const pl = SS.base.o.pallet; pl.position.set(M().cargo.x, SS.world.H(M().cargo.x, M().cargo.z), M().cargo.z); pl.rotation.y = 0.3;
    G().metSub = 'EVA 2 · Cargo pad';
  },
  async run(c){
    const g = G(), R = SS.rover, B = SS.base, W = SS.world;
    eva(2);
    SS.npc.place(-1.4, 8.4, 0); SS.npc.set('follow');
    c.obj('Power: VSAT deployment', ['Board the LTV', 'Hitch the array pallet at the cargo pad', 'Choose a site and emplace the pallet', 'Deploy the mast', 'Calibrate sun tracking', 'Lay cable to the habitat PDU', 'Connect — first light']);
    c.wp({ x: R.x, z: R.z, label: 'LTV-1', h: 2.2 });
    await c.say('CAPCOM', 'Good morning, EV1. Big one today. The array pallet is on the cargo pad and the LTV is charged. Let us go make some power.');
    c.tell('IV', 'LTV: W and S throttle, A and D steer, Space brakes, E to get on and off. Fifteen kilometers an hour is the limit, and the limit is plenty.');
    await c.until(() => R.boarded);
    SS.npc.set('ride');
    c.step(1);
    c.wp({ x: M().cargo.x, z: M().cargo.z, label: 'CARGO PAD', h: 2.5 });
    await c.until(() => SS.dist(R.x, R.z, M().cargo.x, M().cargo.z) < 8 && Math.abs(R.v) < 0.6);
    await c.say('EV2', 'Hold it there. I will hook the pallet up.');
    await c.wait(1.2);
    R.hitch(B.o.pallet);
    await c.say('EV2', 'Pallet is latched. Cable reel is on your rear deck.');
    c.step(2);
    g.flags.showSites = true; B.sync(g);
    UI.markers(M().sites.map(s => ({ x: s.x, z: s.z, label: s.label + (s.kind === 'ridge' ? ' · 86%' : ' · 62%'), h: 2.5 })));
    c.wp(null);
    await c.say('CAPCOM', 'Pallet is yours. SPARTAN has five candidate sites — they are on your map, M. Ridge sites see the sun about eighty-six percent of the year and keep some of it through the darkness gaps. The flats are closer, and go completely dark for six sols at a time. Your call, EV1.');
    c.tell('IV', 'For the record, the ridge is a twelve-degree grade. The LTV will climb it.');
    let site = null;
    while (!site){
      await c.until(() => Math.abs(R.v) < 0.5 && M().sites.some(s => SS.dist(R.x, R.z, s.x, s.z) < 7));
      const s = M().sites.find(q => SS.dist(R.x, R.z, q.x, q.z) < 7);
      const r = await c.choose([{ text: 'Emplace the array at ' + s.label + '.', score: 0 }, { text: 'Keep driving.', score: 0 }], { prompt: s.label + ' · ' + (s.kind === 'ridge' ? 'ridge, 86% annual sun' : 'flats, 62% annual sun') });
      if (r === 0) site = s;
      else await c.until(() => SS.dist(R.x, R.z, s.x, s.z) > 10);
    }
    g.dec.siteId = site.id; g.dec.siteKind = site.kind; metric().siteKind = site.kind;
    UI.markers([]);
    R.unhitch();
    g.flags.palletTaken = true; g.flags.array1 = true;
    B.sync(g);
    const A = B.o.arrays[0];
    A.setDeploy(0);
    const sunYaw = Math.PI - SS.world.sun.az * SS.DEG;
    A.yaw.rotation.y = sunYaw + 1.3;
    await c.say('EV2', 'Pallet is down. Chocks in. It is all yours, EV1.');
    c.step(3);
    c.tell('IV', 'Dismount and walk to the control box on the pallet. Hold E to run the mast.');
    await c.until(() => !R.boarded);
    SS.npc.place(R.x - 2, R.z - 2, 0); SS.npc.set('follow');
    const ax = A.group.position.x, az = A.group.position.z;
    const bx = ax + 0.8, bz = az + 1.0;
    let deployed = false, half = false;
    SS.interact.add({ id: 'mast', x: bx, z: bz, r: 2.4, cone: -1, hold: 9, keep: true, label: 'Run the mast',
      progress: (pr) => { A.setDeploy(pr); if (pr > 0.5 && !half){ half = true; c.tell('EV2', 'Blankets are coming off the drum. Looks clean.'); } },
      use: () => { deployed = true; A.setDeploy(1); } });
    await c.until(() => deployed);
    SS.interact.remove('mast');
    c.step(4);
    await c.say('CAPCOM', 'SPARTAN needs the gimbal calibrated before the tracker takes over. Point the blankets square at the sun, EV1.');
    let calib = false;
    SS.interact.add({ id: 'gimbal', x: bx, z: bz, r: 2.4, cone: -1, label: 'Calibrate sun tracking', use: () => { calib = true; } });
    await c.until(() => calib);
    SS.interact.remove('gimbal');
    g.inputLocked = true;
    const illum = SS.outpost.illum(site.kind, false);
    let yawv = A.yaw.rotation.y, holdT = 0, locked = false;
    c.every(dt => {
      const K = SS.input.keys;
      yawv += ((K.a || K.arrowleft ? 1 : 0) - (K.d || K.arrowright ? 1 : 0)) * 0.55 * dt + SS.input.mouseDX * 0.003;
      A.yaw.rotation.y = yawv;
      const d = SS.angDiff(yawv, sunYaw), k = Math.max(0, Math.cos(d));
      const kw = 10 * illum * k;
      const good = k > 0.97;
      UI.meter({ k: 'Array output · ' + site.label, v: kw.toFixed(1) + ' kW', frac: k, mark: 0.97, color: good ? 'var(--ok)' : 'var(--adv)', hint: 'A / D or mouse to slew · <kbd>E</kbd> hold to lock when above the mark' });
      if (good && SS.input.keys.e){ holdT += dt; if (holdT > 1.2){ locked = true; } } else holdT = 0;
      return !locked;
    });
    await c.until(() => locked);
    g.inputLocked = false; UI.meter(null);
    g.flags.arrayYaw = sunYaw;
    SS.audio.ui('ok');
    await c.say('CAPCOM', 'Tracker has it. SPARTAN sees ' + (10 * illum).toFixed(1) + ' kilowatts at the array' + (site.kind === 'ridge' ? '.' : ' — the flats lose some sun to the ridge.'), { delay: 2.6 });
    c.step(5);
    c.wp({ x: M().pdu.x, z: M().pdu.z, label: 'PDU-1', h: 1.6 });
    c.tell('IV', 'Now the cable. The reel is on the LTV rear deck — it pays out as you drive. Take it to the power distribution unit beside the habitat.');
    await c.until(() => R.boarded);
    SS.npc.set('ride');
    W.cable.reset([{ x: ax, z: az }]); R.lastPay = null; R.paying = true;
    await c.until(() => SS.dist(R.x, R.z, M().pdu.x, M().pdu.z) < 16 && !R.boarded);
    R.paying = false;
    SS.npc.place(R.x + 1.5, R.z - 1.5, 0); SS.npc.set('follow');
    c.step(6);
    let mated = false;
    PL().showTool('connector');
    SS.interact.add({ id: 'pdu', x: M().pdu.x, z: M().pdu.z + 0.9, r: 2.4, cone: -1, label: 'Mate the array lead to PDU-1', once: true, use: () => { mated = true; } });
    await c.until(() => mated);
    PL().showTool(null);
    W.cable.add(M().pdu.x + 0.35, M().pdu.z + 0.5);
    g.cablePts = W.cable.pts.slice();
    SS.audio.clunk();
    await c.wait(0.8);
    g.flags.powerOn = true; B.sync(g);
    SS.base.o.pdu.userData.led.material = SS.models.mats().ledG;
    SS.audio.ui('ok');
    await c.say('CAPCOM', 'Houston copies bus voltage one-twenty and climbing. EV1 — that is first light at Shackleton.', { delay: 2.6 });
    await c.say('EV2', 'Would you look at that. The windows are lit.');
    await c.say('IV', 'Habitat is on main power. Survival heaters off. Nice work, both of you.');
    c.note('Cable is mass too: this run is ' + Math.round(W.cable.length) + ' m. At the pole the power source is rarely where the crew lives — the best sun is on the ridge, the best shielding is behind a rise, the ice is in the dark. Siting is an engineering decision, not a convenience.', 'Artemis surface architecture studies');
    if (g.man.vsat > 1) await c.say('CAPCOM', 'IV and EV2 will stand up the other ' + (g.man.vsat - 1) + ' array' + (g.man.vsat > 2 ? 's' : '') + ' beside yours tomorrow.');
    if (g.man.fsp){
      await c.say('CAPCOM', 'One more planning item. The fission unit comes off the cargo lander tomorrow and SPARTAN needs an emplacement point. Mark it on your map. Flight rules want the habitat outside a one hundred meter radius.');
      const pick = await new Promise(res => { SS.map.mustPick = true; SS.map.open({ mode: 'reactor', title: 'Emplace FSP-1', info: 'Click the map to choose where the reactor stands. The dashed ring is the 100 m exclusion radius. More distance means less dose and more cable.', onPick: res }); });
      g.dec.reactor = pick;
      const d = SS.dist(pick.x, pick.z, M().hab.x, M().hab.z);
      metric().reactorDist = d;
      if (d < 100){ await c.say('EV2', 'That is awfully close to where we sleep.'); await c.say('CAPCOM', 'Copy the emplacement. Houston notes it is inside the exclusion radius.', { delay: 2.6 }); }
      else await c.say('CAPCOM', 'Copy, ' + Math.round(d) + ' meters out. SPARTAN likes it.', { delay: 2.6 });
    }
    c.step(7);
    c.wp({ x: M().ladder.x, z: M().ladder.z + 0.6, label: 'LADDER', h: 2 });
    await c.say('CAPCOM', 'Head on home, EV1. Good day.');
    let inn = false;
    SS.interact.add({ id: 'ingress', x: 0, z: 7.0, r: 2.6, cone: -1, label: 'Climb the ladder — end EVA 2', once: true, use: () => { inn = true; } });
    await c.until(() => inn);
    endEva('VSAT at ' + site.label);
    await evaSummary('First light', [['Array site', site.label + ' (' + site.kind + ')'], ['Array output', (10 * illum).toFixed(1) + ' kW at full sun'], ['Cable laid', Math.round(W.cable.length) + ' m']]);
    g.flags.arraysAll = true;
  }
});

/* ============ 3 · CLOSING THE LOOP ============ */
CH.push({
  id: 'eclss', title: 'Closing the Loop', kicker: 'Chapter 3 of 7', short: 'Activate life support by procedure; build the darkness load table',
  meta: 'IVA · Sol 5 · Surface Habitat 1', sol: 5,
  lede: 'The crew moves out of the lander and into the habitat. Bring the life-support loop up by the procedure, in order. Then plan for the six sols of darkness that start on sol 12: decide which loads you can live without.',
  obj: ['ECLSS activation — procedure 2.104', 'Verify and report the loop closed', 'Build and load the darkness load table'],
  setup(){
    world({ sol: 5, met: 9 * 60, player: { scene: 'hab', x: 3.5, z: 0, yaw: Math.PI / 2 }, ivInHab: true });
    SS.pcs.resetEclss(false);
    PL().suit.worn = false;
    G().metSub = 'IVA · Surface Habitat 1';
    habScreens();
  },
  async run(c){
    const g = G(), H = SS.interior.hab;
    c.obj('Bring the habitat to life', ['ECLSS activation — procedure 2.104', 'Report the loop closed', 'Build the darkness load table', 'Load the table to the EPS']);
    await c.wait(0.8);
    await c.say('IV', 'Welcome home. She has been on survival heaters since landing. Let us bring the loop up — ECLSS rack, forward on the left.');
    let opened = false;
    SS.interact.add({ id: 'eclss-rack', scene: 'hab', x: H.spots.eclss.x, z: H.spots.eclss.z, r: 1.6, cone: -1, label: 'ECLSS rack — open PCS', use: () => { opened = true; SS.pcs.open('eclss', ['eclss']); } });
    await c.until(() => opened);
    c.tell('IV', 'Procedure 2.104 is on the right. Work it top to bottom. And whatever you do, do not start the oxygen generator dry.');
    const res = await c.event('eclss-done');
    if (res.devs) metric().procNotes.push('ECLSS activation: ' + res.devs + ' deviation' + (res.devs > 1 ? 's' : ''));
    metric().procDev += res.devs;
    g.flags.eclssOn = true; habScreens();
    c.step(1);
    await c.say('CAPCOM', 'Shackleton, Houston. ETHOS sees ppO₂ twenty-one point three and CO₂ coming down. The loop is closed.', { delay: 2.6 });
    c.note('The loop is closed on oxygen, not on water. Electrolysis turns 1.125 kg of water into each kilogram of oxygen, recovery loses 7% of everything the crew uses, and crops drink too. Without ice from the crater the tank only ever goes down.', 'ISS OGA and WRS performance; NASA BVAD');
    await c.until(() => !SS.pcs.isOpen);
    c.step(2);
    await c.say('IV', 'Now the hard one. On sol twelve we lose the sun for six sols. Build a darkness load table on the EPS rack — next rack aft.');
    SS.interact.remove('eclss-rack');
    SS.interact.add({ id: 'eps-rack', scene: 'hab', x: H.spots.eps.x, z: H.spots.eps.z, r: 1.6, cone: -1, label: 'EPS rack — open PCS', use: () => SS.pcs.open('eps', ['eclss', 'eps']) });
    let accepted = false;
    const epsQ = c.stream('eps-commit');
    while (!accepted){
      const pol = await epsQ.next();
      c.step(3);
      const proj = SS.outpost.project(g.man, Object.assign({}, g.dec, { policy: pol }), 18, g.out);
      const dark = proj.violations.filter(v => v.id === 'FR-3').reduce((a, v) => a + v.count, 0);
      if (dark){
        await c.say('CAPCOM', 'Shackleton, SPARTAN projects the critical bus running short for ' + dark + ' sol' + (dark > 1 ? 's' : '') + ' of darkness with that table — ECLSS duty-cycled, or worse. We recommend shedding more.', { delay: 2.6 });
        const r = await c.choose([{ text: 'Copy. Revising the table.', score: 1 }, { text: 'Understood. We will fly this table.', score: -1 }]);
        if (r === 1){ accepted = true; metric().policyRisk = true; }
      } else {
        await c.say('CAPCOM', 'SPARTAN concurs with the table. Minimum storage ' + Math.round(proj.minSOC * 100) + ' percent through the darkness.', { delay: 2.6 });
        accepted = true;
      }
    }
    epsQ.off();
    SS.interact.remove('eps-rack');
    if (SS.pcs.isOpen) SS.pcs.close();
    c.step(4);
    await c.say('IV', 'That is a good day. Go get some sleep — the first real night starts in a week.');
  }
});

/* ============ 4 · INTO THE DARK ============ */
CH.push({
  id: 'psr', title: 'Into the Dark', kicker: 'Chapter 4 of 7', short: 'Drive into permanent shadow, drill for ice — and a suit failure',
  meta: 'EVA 3 · Sol 10 · Crater rim', sol: 10,
  lede: 'Inside the rim of Shackleton is ground that has not seen the sun in billions of years, at 40 kelvin, holding water ice. Drive there, drill the first core, and bring the data home. Sim Sup has a malfunction loaded for this EVA.',
  obj: ['Drive the LTV to the crater rim', 'Descend into permanent shadow', 'Drill the first ice core', 'Get home'],
  sim: 'SIM SUP: 1 malfunction loaded',
  setup(){
    const hx = M().habLock.x + 2.6, hz = M().habLock.z;
    const rx = M().hab.x + 16, rz = M().hab.z + 8;
    world({ sol: 10, met: 8 * 60 + 30, player: { x: hx, z: hz, yaw: yawTo(hx, hz, rx, rz) }, rover: { x: rx, z: rz, h: Math.atan2(M().isru.x - rx, M().isru.z - rz) } });
    G().metSub = 'EVA 3 · Shackleton rim';
    if (!SS.base.o.drivetube){
      const g = new THREE.Group(), m = SS.models.mats();
      [0, 2.1, 4.2].forEach(a => g.add(SS.models.strut([Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5], [0, 1.3, 0], 0.03, m.metal)));
      const tube = SS.models.cyl(0.04, 0.04, 1.4, 10, m.metal, 0, 1.0, 0); g.add(tube); g.userData.tube = tube;
      SS.base.o.drivetube = g; SS.world.scene.add(g);
    }
    const dt = SS.base.o.drivetube;
    const tx = M().isru.x + 3.5, tz = M().isru.z - 2;
    dt.position.set(tx, SS.world.H(tx, tz), tz);
    dt.visible = !G().man.isru;
  },
  async run(c){
    const g = G(), R = SS.rover, isru = !!g.man.isru;
    eva(3);
    const S = PL().suit;
    SS.npc.place(M().habLock.x + 3.5, M().habLock.z + 1.5, 0); SS.npc.set('follow');
    const site = isru ? { x: M().isru.x - 0.9, z: M().isru.z + 1.5 } : { x: SS.base.o.drivetube.position.x, z: SS.base.o.drivetube.position.z };
    c.obj('Ice prospecting', ['Drive to the crater rim', 'Descend into permanent shadow', isru ? 'Commission the ice plant' : 'Set the drive-tube sampler', 'Drill the first core', 'Return to the habitat']);
    c.wp({ x: M().rim.x, z: M().rim.z, label: 'RIM', h: 2 });
    await c.say('CAPCOM', 'EV1, today you go somewhere nobody has ever stood: inside a permanently shadowed region. The floor has not seen the sun in something like two billion years.');
    if (!isru) c.tell('CAPCOM', 'No ice plant was manifested, so this is a prospecting core only. SPARTAN and ETHOS both want to know what they are missing.');
    await c.until(() => R.boarded);
    SS.npc.set('ride');
    await c.wait(8);
    c.tell('CAPCOM', 'From the backroom: LCROSS hit Cabeus in 2009 and measured five point six percent water by mass in the plume. Today we find out if Shackleton agrees.');
    await c.until(() => SS.dist(R.x, R.z, M().rim.x, M().rim.z) < 16);
    c.step(1);
    c.wp({ x: site.x, z: site.z, label: isru ? 'ICE PLANT' : 'SAMPLER', h: 2 });
    await c.say('CAPCOM', 'Stop at the rim if you like. Once you are over the edge you lose the sun, and direct line of sight to us. IV will relay through the LTV.');
    await c.until(() => SS.world.sunVisAt(PL().x, PL().y + 1.5, PL().z) < 0.3 || SS.dist(PL().x, PL().z, site.x, site.z) < 12);
    await c.say('IV', 'Your temperature just fell off a cliff, EV1 — minus two hundred and thirty on the probe. Headlamps. L.');
    c.note('Your eyes and the suit camera are adapting: out of the sun, the stars come back. The floor here sits below 40 K — cold enough to hold water ice for geologic time, and cold enough to embrittle hardware that was never designed for it.', 'Paige et al., Science 330 (2010) — LRO Diviner');
    await c.until(() => !R.boarded && SS.dist(PL().x, PL().z, site.x, site.z) < 6);
    SS.npc.place(PL().x - 2, PL().z + 1, 0); SS.npc.set('follow');
    c.step(2);
    let ready = false;
    if (isru){
      SS.interact.add({ id: 'umb', x: site.x, z: site.z, r: 2.4, cone: -1, hold: 3, label: 'Mate the plant umbilical', once: true, use: () => { ready = true; } });
      await c.until(() => ready);
      SS.base.o.isru.led.material = SS.models.mats().ledG;
      await c.say('IV', 'Umbilical mated. Plant power is good. Drill head is yours.');
    } else {
      SS.interact.add({ id: 'tube', x: site.x, z: site.z, r: 2.4, cone: -1, hold: 3, label: 'Seat the drive tube', once: true, use: () => { ready = true; } });
      await c.until(() => ready);
      await c.say('IV', 'Tube is seated. Drive it down.');
    }
    c.step(3);
    let start = false;
    SS.interact.add({ id: 'drill', x: site.x, z: site.z, r: 2.4, cone: -1, label: 'Start the core', once: true, use: () => { start = true; } });
    await c.until(() => start);
    g.inputLocked = true;
    let depth = 0, torque = 0, stall = 0, stalls = 0, done = false, iceSaid = false;
    c.every(dt => {
      const hold = !!SS.input.keys.e && stall <= 0;
      const hard = depth > 0.45 ? 1.9 : 1.0;
      if (stall > 0) stall -= dt;
      torque = SS.clamp(torque + (hold ? 0.42 * hard : -1.0) * dt, 0, 1.05);
      if (hold) depth = Math.min(1, depth + dt * 0.14 * (1 - torque * 0.5));
      if (torque > 0.95){ stall = 1.6; stalls++; torque = 0.4; depth = Math.max(0, depth - 0.04); SS.audio.ui('err'); UI.toast('Auger stall — back off and let it spin up', 'err'); }
      if (isru) SS.base.o.isru.setDrill(depth); else SS.base.o.drivetube.userData.tube.position.y = 1.0 - depth * 0.9;
      SS.audio.drillLevel = hold ? 0.4 + torque * 0.6 : 0;
      if (depth > 0.45 && !iceSaid){ iceSaid = true; c.tell('IV', 'Torque just jumped. You are into something harder. Ease off, keep it in the green.'); }
      UI.meter({ k: (isru ? 'Plant drill' : 'Drive tube') + ' · depth ' + depth.toFixed(2) + ' m', v: stall > 0 ? 'STALL' : 'Torque ' + Math.round(torque * 100) + '%', frac: torque, mark: 0.8, color: torque > 0.8 ? 'var(--warn)' : torque > 0.6 ? 'var(--caution)' : 'var(--ok)', hint: 'Hold <kbd>E</kbd> to drive · release to let the torque fall · stay under the mark · target 1.00 m' });
      if (depth >= 1){ done = true; }
      return !done;
    });
    await c.until(() => done);
    g.inputLocked = false; UI.meter(null); SS.audio.drillLevel = 0;
    metric().drillStalls = stalls;
    metric().samples = (metric().samples || 0) + 1;
    await c.say('CAPCOM', 'EV1, the neutron spectrometer on that core reads five point eight weight percent. That is LCROSS-grade ice. The backroom is on its feet.', { delay: 2.6 });
    /* ---- SIM SUP: PLSS fan failure ---- */
    await c.wait(2.5);
    const failT = SS.clock.ui;
    S.fan = false;
    SS.audio.ui('caution');
    ST.checkpoint('fan');
    await runFanFailure(c, failT, site);
  }
});
async function runFanFailure(c, failT, site){
  const g = G(), S = PL().suit;
  S.incap = false;
  const failP = c.event('incap').then(() => 'incap');
  c.obj('MALFUNCTION — suit fan', ['Go to purge (DCM: lift guard, PURGE OPEN)', 'Drive to the habitat airlock', 'Ingress before the SOP runs out']);
  SS.dcm.setChecklist('PG 14 · FAN FAIL', ['Open DCM (Tab)', 'Lift PURGE guard', 'PURGE — OPEN', 'Terminate EVA — return to airlock'], 0, 'Purge vents the suit through the secondary oxygen pack: about 30 minutes.');
  let purged = S.purge;
  const off = SS.on('dcm', d => { if (d.id === 'purge' && d.value){ S.purge = true; purged = true; } });
  c.tell('IV', 'EV1, IV. I have lost your fan — speed is reading zero and your CO₂ is climbing. Go to purge.');
  const choice = c.choose([
    { text: 'Copy, IV. Going to purge. Terminating the EVA.', score: 1 },
    { text: 'Stand by — let me stow the drill first.', score: -1 },
    { text: 'Say again?', score: 0 }], { timeout: 20 });
  UI.toast('Tab — open the DCM. Lift the guard, then PURGE OPEN.');
  choice.then(r => {
    if (r === 1) c.tell('IV', 'Negative, EV1. Purge now. The drill can wait. You cannot.');
    else if (r === 2) c.tell('IV', 'Your fan has failed. Open the purge valve. Now, EV1.');
  }).catch(() => {});
  let nag = SS.clock.ui;
  c.every(() => { if (!purged && S.co2 > 12 && SS.clock.ui - nag > 12){ nag = SS.clock.ui; c.tell('IV', 'EV1, your CO₂ is ' + Math.round(S.co2) + '. Purge valve, now.'); } return !purged; });
  let result = await Promise.race([c.until(() => purged).then(() => 'purged'), failP]);
  off();
  if (result === 'purged'){
    metric().fanResp = SS.clock.ui - failT;
    SS.dcm.setChecklist('PG 14 · FAN FAIL', ['Open DCM (Tab)', 'Lift PURGE guard', 'PURGE — OPEN', 'Terminate EVA — return to airlock'], 3, 'SOP: 30 minutes. Walkback is the only number that matters now.');
    c.tell('IV', 'Purge flow confirmed. You have thirty minutes on the SOP. Get back to the airlock, EV1. EV2, stay with them.');
    c.step(1);
    c.wp({ x: M().habLock.x + 1.2, z: M().habLock.z, label: 'HAB AIRLOCK', h: 2.4 });
    let home = false;
    SS.interact.add({ id: 'ingress', x: M().habLock.x + 1.6, z: M().habLock.z, r: 3, cone: -1, label: 'Ingress — habitat airlock', once: true, use: () => { home = true; } });
    result = await Promise.race([c.until(() => home).then(() => 'home'), failP]);
  }
  if (result === 'incap'){
    metric().resets++;
    SS.audio.alarm(false);
    const r = await UI.fail('Sim terminated — EV1 incapacitated', S.purge
      ? 'The secondary oxygen pack ran dry before EV1 reached the airlock. In a real suit that is the end of the EVA and possibly of the crew member. The walkback margin was the number to watch from the moment the fan stopped.'
      : 'CO₂ in the helmet passed the point where a crew member can still act. The purge valve would have flushed it. Fan failure procedures are memory items for exactly this reason.', true);
    if (r === 'retry'){
      ST.restore('fan');
      Object.assign(PL().suit, { fan: false, co2: 3, purge: false, sop: 30, incap: false });
      SS.dcm.state.purge = false; SS.dcm.guard = false; SS.dcm.render();
      if (SS.rover.boarded){ SS.rover.boarded = false; }
      PL().teleport('ext', site.x + 2, site.z + 2, yawTo(site.x, site.z, M().hab.x, M().hab.z));
      SS.rover.place(site.x + 5, site.z - 3, Math.atan2(M().hab.x - site.x, M().hab.z - site.z));
      SS.npc.place(site.x, site.z + 3, 0); SS.npc.set('follow');
      SS.interact.remove('ingress'); UI.waypoint(null);
      return runFanFailure(c, SS.clock.ui, site);
    }
    metric().incap = true;
    if (metric().fanResp === null || metric().fanResp === undefined) metric().fanResp = 90;
  }
  c.step(2);
  UI.waypoint(null);
  endEva(result === 'home' ? 'Fan failure, purge, return' : 'EV1 incapacitated (sim) — EV2 recovered the crew member');
  SS.audio.alarm(false);
  Object.assign(PL().suit, { co2: 0.9, fan: true, purge: false, incap: false });
  if (result === 'home'){
    await c.say('CAPCOM', 'Repress complete. Welcome back, EV1. That is exactly how it is supposed to go.', { delay: 1 });
    await evaSummary('EVA 3 terminated — fan failure', [['Fan failure to purge', metric().fanResp.toFixed(1) + ' s'], ['SOP remaining at ingress', SS.fmtMin(PL().suit.sop)], ['Core', isruTxt()]]);
  } else {
    await c.say('EV2', 'I have you, EV1. I have you. Houston, EV2 is bringing EV1 in on my buddy line.');
    await evaSummary('EVA 3 — crew member incapacitated', [['Outcome', 'EV2 recovered EV1 to the airlock'], ['Core', isruTxt()]]);
  }
}
function isruTxt(){ return G().man.isru ? '1.0 m, 5.8 wt% H₂O' : '1.0 m drive tube, 5.8 wt% H₂O'; }

/* ============ 5 · THE LONG NIGHT ============ */
CH.push({
  id: 'night', title: 'The Long Night', kicker: 'Chapter 5 of 7', short: 'Darkness, a battery trip, and an EVA by headlamp',
  meta: 'Sol 13 · Darkness · Surface Habitat 1', sol: 13,
  lede: 'The sun has gone under the ridge line for six sols. Whatever you manifested and wherever you stood the array now decides how the habitat lives. Then something trips — and the fix is outside, in the dark.',
  obj: ['Review the power state', 'Respond to the EPS trip', 'EVA by headlamp to the storage yard', 'Reset and return'],
  sim: 'SIM SUP: 1 malfunction loaded',
  setup(){
    world({ sol: 13, met: 3 * 60 + 20, player: { scene: 'hab', x: 3.4, z: 0, yaw: Math.PI / 2 }, ivInHab: true, habMode: 'night' });
    PL().suit.worn = false;
    G().metSub = 'IVA · Darkness';
    habScreens();
  },
  async run(c){
    const g = G(), O = SS.outpost, man = g.man, H = SS.interior.hab;
    c.obj('Darkness', ['Review the power state', 'Respond to the EPS trip', 'EVA to the storage yard', 'Reset and return']);
    await c.wait(0.8);
    const gen = O.generation(man, g.dec, g.sol), cap = O.capacity(man, g.dec, g.sol), soc = cap ? g.out.batt / cap : 0;
    await c.say('IV', 'Sol thirteen. The sun went under the ridge at oh-three-hundred. It is going to be a long week.');
    await c.say('CAPCOM', 'Shackleton, Houston. SPARTAN sees ' + gen.toFixed(1) + ' kilowatts ' + (gen > 0 ? 'coming in' : '— nothing coming in') + ', and storage at ' + (cap ? Math.round(soc * 100) + ' percent.' : 'zero. You have no storage.'), { delay: 1 });
    const proj = O.project(man, g.dec, 18, g.out);
    if (proj.maxDark >= 3 || (proj.over && proj.over.reason === 'power')){
      g.habDark = true; H.setMode('off'); SS.base.sync(g);
      SS.audio.alarm(true); await c.wait(1.2); SS.audio.alarm(false);
      await c.say('IV', 'That is the bus. Undervoltage — we are losing the habitat. CO₂ removal is offline.');
      await c.say('FLIGHT', 'Shackleton, FLIGHT. The outpost will not hold through this darkness. I am calling it: the crew goes to the lander safe haven and we end the increment. I am sorry.', { delay: 1 });
      metric().darkCrisis = true;
      O.runTo(g.out, man, g.dec, 17);
      if (!g.out.over) g.out.over = { ok: false, reason: 'power' };
      return 'debrief';
    }
    c.step(1);
    await c.wait(2);
    SS.audio.ui('caution'); await c.wait(0.4); SS.audio.ui('caution');
    g.dec.battBTrip = true; g.flags.battFixed = false;
    const hasBatt = man.battery > 0;
    await c.say('IV', hasBatt ? 'Caution tone — EPS. Battery string B just tripped on overtemperature. We have lost half a bank.' : 'Caution tone — EPS. PDU channel two just tripped. We have lost an array string on the main bus.');
    habScreens();
    SS.interact.add({ id: 'eps-rack', scene: 'hab', x: H.spots.eps.x, z: H.spots.eps.z, r: 1.6, cone: -1, label: 'EPS rack — open PCS', use: () => SS.pcs.open('eps', ['eclss', 'eps']) });
    UI.toast('The EPS rack shows the reduced capacity');
    await c.say('CAPCOM', 'Shackleton, SPARTAN has looked at the trip. The breaker will not reset remotely; it needs hands on it at the yard. That means an EVA, in the dark.', { delay: 2.6 });
    const r = await c.choose([
      { text: 'Copy, Houston. EV2 and I will suit up.', score: 1 },
      { text: 'Can we leave it tripped until sunrise?', score: 0 },
      { text: 'Is this really worth an EVA in the dark?', score: 0 }]);
    if (r !== 0){
      const short = O.project(man, g.dec, 18, g.out);
      await c.say('CAPCOM', 'We ran that. With it tripped, storage bottoms at ' + Math.round(short.minSOC * 100) + ' percent' + (short.maxDark ? ' and the habitat goes dark for ' + short.maxDark + ' sol' + (short.maxDark > 1 ? 's' : '') : '') + '. FLIGHT would like it reset.', { delay: 2.6 });
    }
    SS.interact.remove('eps-rack');
    if (SS.pcs.isOpen) SS.pcs.close();
    c.step(2);
    UI.flash(0.9);
    await c.wait(0.3);
    const hx = M().habLock.x + 2.6, hz = M().habLock.z;
    PL().teleport('ext', hx, hz, yawTo(hx, hz, M().yard.x, M().yard.z));
    eva(4);
    g.metSub = 'EVA 4 · Darkness';
    SS.npc.place(hx + 1.5, hz + 1.5, 0); SS.npc.set('follow');
    c.wp({ x: M().yard.x, z: M().yard.z + 2.4, label: 'STORAGE YARD', h: 2 });
    await c.say('IV', 'Suit checks are complete and you are outside. Lights, EV1 — L. The yard is about a hundred meters north.');
    let earthSaid = false;
    c.every(() => {
      if (!earthSaid && SS.dist(PL().x, PL().z, M().habLock.x, M().habLock.z) > 35){
        earthSaid = true;
        c.tell('IV', 'EV1, take a second. Look up, a little east of north. Earth is sitting right on the ridge line.');
        c.note('From the south pole, Earth never rises or sets. It hangs within a few degrees of the horizon, rocking with the Moon’s libration. The sun is gone for six sols; Earth has not moved.', 'Lunar libration; polar viewing geometry');
      }
      return !earthSaid;
    });
    await c.until(() => SS.dist(PL().x, PL().z, M().yard.x, M().yard.z + 2.4) < 4);
    c.step(3);
    const Y = SS.base.o.yard;
    const ui = hasBatt ? Math.min(1, Y.units.length - 1) : -1;
    let temp = 51.4, louver = 0, louverOpen = false, isolated = false, closed = false;
    UI.meter({ k: hasBatt ? 'String B · cell temperature' : 'PDU channel 2 · contactor temperature', v: temp.toFixed(1) + ' °C', frac: temp / 60, mark: 45 / 60, color: 'var(--warn)', hint: 'Reset limit 45 °C' });
    c.every(dt => {
      if (louverOpen) temp = Math.max(38, temp - dt * 0.9);
      UI.meter({ k: hasBatt ? 'String B · cell temperature' : 'PDU channel 2 · contactor temperature', v: temp.toFixed(1) + ' °C', frac: temp / 60, mark: 45 / 60, color: temp > 45 ? 'var(--warn)' : 'var(--ok)', hint: (closed ? 'Reset complete' : 'Reset limit 45 °C · procedure EPS 7.3 on your cuff') });
      return !closed;
    });
    SS.dcm.setChecklist('EPS 7.3 · STRING RESET', ['Verify string isolated', 'Open radiator louver (hold)', 'Wait: temperature below 45 °C', 'Close breaker'], 0, 'Closing a breaker on a hot string re-trips it.');
    const jx = M().yard.x, jz = M().yard.z + 2.4 + 0.6;
    SS.interact.add({ id: 'iso', x: jx, z: jz, r: 2.4, cone: -1, label: 'Verify the string is isolated', once: true, use: () => { isolated = true; } });
    await c.until(() => isolated);
    SS.dcm.setChecklist('EPS 7.3 · STRING RESET', ['Verify string isolated', 'Open radiator louver (hold)', 'Wait: temperature below 45 °C', 'Close breaker'], 1, '');
    await c.say('IV', 'Isolation confirmed. Open the louvers and let it dump heat to the sky.');
    const ux = M().yard.x + (ui >= 0 ? Y.units[ui].g.position.x : 0), uz = M().yard.z + 0.9;
    SS.interact.add({ id: 'louver', x: ux, z: uz, r: 2.4, cone: -1, hold: 3, once: true, label: 'Open the radiator louver', progress: pr => { if (louverOpen) return; louver = pr; if (ui >= 0) Y.setLouver(ui, pr); }, use: () => { louverOpen = true; louver = 1; if (ui >= 0) Y.setLouver(ui, 1); } });
    await c.until(() => louverOpen);
    SS.interact.remove('louver');
    SS.dcm.setChecklist('EPS 7.3 · STRING RESET', ['Verify string isolated', 'Open radiator louver (hold)', 'Wait: temperature below 45 °C', 'Close breaker'], 2, '');
    c.tell('EV2', 'Radiating to a four-kelvin sky. It will not take long.');
    let tries = 0;
    while (!closed){
      let pressed = false;
      SS.interact.add({ id: 'close', x: jx, z: jz, r: 2.4, cone: -1, label: 'Close the breaker', once: true, use: () => { pressed = true; } });
      await c.until(() => pressed);
      tries++;
      if (temp > 45){
        dev('EPS 7.3: breaker closed at ' + temp.toFixed(1) + ' °C — re-tripped');
        SS.audio.ui('caution');
        await c.say('IV', 'It re-tripped, EV1. Still ' + temp.toFixed(1) + ' degrees. Give it time.');
      } else closed = true;
    }
    if (ui >= 0) Y.setLed(ui, SS.models.mats().ledG);
    g.dec.battBTrip = false; g.flags.battFixed = true;
    SS.dcm.setChecklist(null);
    await c.say('CAPCOM', 'SPARTAN sees ' + (hasBatt ? 'string B' : 'channel two') + ' back on the bus. Nice work in the dark, EV1.', { delay: 2.6 });
    c.wp({ x: M().habLock.x + 1.2, z: M().habLock.z, label: 'HAB AIRLOCK', h: 2.4 });
    let home = false;
    SS.interact.add({ id: 'ingress', x: M().habLock.x + 1.6, z: M().habLock.z, r: 3, cone: -1, label: 'Ingress — habitat airlock', once: true, use: () => { home = true; } });
    await c.until(() => home);
    UI.meter(null);
    endEva('Night EVA, ' + (hasBatt ? 'string B' : 'PDU channel 2') + ' reset');
    await evaSummary('EVA 4 complete', [['Breaker attempts', String(tries)], ['Ext temp at yard', Math.round(SS.world.extTempC(M().yard.x, 1, M().yard.z)) + ' °C']]);
  }
});

/* ============ 6 · PROTON STORM ============ */
CH.push({
  id: 'spe', title: 'Proton Storm', kicker: 'Chapter 6 of 7', short: 'A solar particle event mid-EVA: get the crew under shielding',
  meta: 'EVA 5 · Sol 22 · Station 2, ridge', sol: 22,
  lede: 'You are two hundred and seventy metres from the habitat at the ridge science station when the sun flares. The protons will arrive in minutes, not hours. Everything you manifested for shielding is about to be tested.',
  obj: ['Station 2: context photograph', 'Respond to the space weather call', 'Return and get the crew under shielding'],
  sim: 'SIM SUP: space weather inject',
  setup(){
    const s = M().st2;
    const px = s.x + 8, pz = s.z + 7;
    world({ sol: 22, met: 10 * 60 + 15, player: { x: px, z: pz, yaw: yawTo(px, pz, s.x, s.z) }, rover: { x: s.x + 14, z: s.z + 12, h: Math.atan2(M().hab.x - s.x, M().hab.z - s.z) } });
    G().metSub = 'EVA 5 · Station 2';
    G().flags.sprAvailable = true; G().flags.sheltered = false;
  },
  async run(c){
    const g = G(), s = M().st2, man = g.man, O = SS.outpost;
    eva(5);
    const S = PL().suit;
    SS.npc.place(s.x + 10, s.z + 5, 0); SS.npc.set('follow');
    c.obj('Station 2 — anorthosite', ['Context photograph of the block', 'Scoop sample']);
    SS.photoTarget = { x: s.x, y: SS.world.H(s.x, s.z) + 0.9, z: s.z, min: 5, max: 20, caption: 'Station 2 context' };
    const shot2 = c.flag('photo', d => d.ok);
    const why2 = SS.on('photo', d => { if (!d.ok && d.why) UI.toast(d.why, 'err'); });
    const t2 = SS.clock.ui;
    await c.say('CAPCOM', 'EV1, the backroom wants the bright block at Station 2. They think it is anorthosite — original lunar crust, four and a half billion years old. Context image first.');
    await c.until(() => shot2.hit || SS.clock.ui - t2 > 34);
    shot2.off(); why2();
    if (PL().photo) PL().togglePhoto();
    SS.photoTarget = null;
    const alertT = SS.clock.ui, onsetIn = 128;
    const onset = alertT + onsetIn;
    await c.say('CAPCOM', 'EV1, Houston — break, break. SRAG reports an X-class flare on the western limb. Proton onset is forecast in forty-five minutes. Recommend you terminate and head for shelter.');
    c.obj('SPACE WEATHER — proton event', ['Terminate the EVA', 'Drive to the habitat', 'Ingress', 'Get the crew under shielding']);
    let decided = false, dithered = false;
    const r = await c.choose([
      { text: 'Copy, Houston. Terminating now. Heading back.', score: 1 },
      { text: 'Request ten minutes to finish the sample.', score: -1 },
      { text: 'Copy. What is the peak flux forecast?', score: 0 }], { timeout: 15 });
    if (r === 1){ dithered = true; await c.say('CAPCOM', 'EV1, FLIGHT says negative. Terminate. Now.', { delay: 2.6 }); }
    else if (r === 2) await c.say('CAPCOM', 'Above ten MeV, ten to the fourth by peak. EV1 — please head back.', { delay: 2.6 });
    else if (r < 0) await c.say('CAPCOM', 'EV1, Houston, did you copy? Terminate and head for shelter.', { delay: 1 });
    decided = true;
    metric().speChoice = r;
    c.step(1);
    c.wp({ x: M().habLock.x + 1.2, z: M().habLock.z, label: 'HAB AIRLOCK', h: 2.4 });
    let outsideAtOnset = null;
    c.every(dt => {
      const left = onset - SS.clock.ui;
      if (left > 0) UI.$('objTitle').textContent = 'Proton onset in ' + Math.floor(left / 60 * 45 / (onsetIn / 60)) + ' min';
      else {
        UI.$('objTitle').textContent = 'PROTON EVENT IN PROGRESS';
        if (outsideAtOnset === null){ outsideAtOnset = PL().scene === 'ext'; SS.audio.ui('caution'); if (outsideAtOnset) c.tell('IV', 'Onset, EV1. You are taking dose. Move.'); }
        S.doseRate = PL().scene === 'ext' ? 1.6 : 0;
      }
      SS.game.doseClicks = PL().scene === 'ext' ? (left > 0 ? 0.6 : 40) : 0;
      return g.flags.sheltered !== true || PL().scene === 'ext';
    });
    await c.until(() => SS.rover.boarded);
    metric().speResp = SS.clock.ui - alertT;
    SS.npc.set('ride');
    c.step(1);
    let home = false;
    SS.interact.add({ id: 'ingress', x: M().habLock.x + 1.6, z: M().habLock.z, r: 3, cone: -1, label: 'Ingress — habitat airlock', once: true, use: () => { home = true; } });
    await c.until(() => home);
    g.dec.ev1Extra = (g.dec.ev1Extra || 0) + S.dose;
    const proton = S.dose;
    S.doseRate = 0; g.doseClicks = 0;
    metric().speOutside = outsideAtOnset === true;
    metric().speDose = proton;
    endEva('Terminated for proton event');
    PL().teleport('hab', 3.4, 0, Math.PI / 2); PL().suit.worn = false;
    SS.interior.hab.setMode('storm');
    c.step(3);
    const H = SS.interior.hab;
    if (man.shelter){
      c.wp({ scene: 'hab', x: 0, z: 0 });
      await c.say('IV', 'Inside. Good. Everyone into the storm shelter — the hatch forward on the right. Go.');
      SS.interact.add({ id: 'shelter', scene: 'hab', x: H.spots.shelter.x, z: H.spots.shelter.z, r: 1.6, cone: -1, label: 'Enter the storm shelter', once: true, use: () => { g.flags.sheltered = true; } });
      await c.until(() => g.flags.sheltered === true);
      g.dec.sheltered = SS.clock.ui < onset + 20;
      await c.say('IV', 'Hatch closed. Four of us behind a metre of water and waste. Now we wait.');
    } else if (man.excavator && g.sol >= O.C.BERM_SOL){
      await c.say('IV', 'Inside. We stay in the core — the berm is our shelter. Two meters of regolith over our heads.');
      g.flags.sheltered = true; g.dec.sheltered = false;
    } else {
      await c.say('IV', 'Inside. We have no shelter and no berm. The best we can do is the centre of the habitat, behind the racks. Get down there.');
      g.flags.sheltered = true; g.dec.sheltered = false;
      metric().noShelter = true;
    }
    SS.game.doseClicks = 0;
    const f = (g.dec.sheltered && man.shelter) ? 0.05 : O.shield(man, 23).spe;
    await c.say('CAPCOM', 'Shackleton, SRAG projects about ' + Math.round(2 * O.C.SPE_BFO * f) + ' millisieverts for the crew over the event, behind the shielding you have. Stand by.', { delay: 2.6 });
  }
});

/* ============ 7 · THE SLIP ============ */
CH.push({
  id: 'slip', title: 'The Slip', kicker: 'Chapter 7 of 7', short: 'Your ride home slips fifteen sols. Make the outpost last.',
  meta: 'Sol 30 · Surface Habitat 1', sol: 30,
  lede: 'Missions rarely end when the manifest says. The ascent vehicle has a problem, and the outpost you built has to carry four people fifteen sols further than it was planned for. Re-plan, commit, and live with it.',
  obj: ['Take the call from FLIGHT', 'Re-plan the load table to sol 60', 'Report to FLIGHT'],
  setup(){
    world({ sol: 30, met: 13 * 60 + 5, player: { scene: 'hab', x: 3.4, z: 0, yaw: Math.PI / 2 }, ivInHab: true });
    PL().suit.worn = false;
    G().metSub = 'IVA · Sol 30';
    habScreens();
  },
  async run(c){
    const g = G(), O = SS.outpost, H = SS.interior.hab;
    c.obj('The slip', ['Take the call from FLIGHT', 'Re-plan to sol 60 on the EPS', 'Report to FLIGHT']);
    await c.wait(1);
    await c.say('CAPCOM', 'Shackleton, Houston. Stand by for FLIGHT.');
    await c.say('FLIGHT', 'Shackleton, FLIGHT. I will not dress it up. The ascent vehicle has a boil-off problem and we are slipping your return fifteen sols. New departure is sol sixty. The consumables team is working the numbers. I need yours.', { delay: 1 });
    g.out.endSol = O.C.EXTENDED; g.out.slipped = true;
    const r = await c.choose([
      { text: 'Copy, FLIGHT. We will re-plan and send you a revised usage table.', score: 1 },
      { text: 'Understood. What is our margin?', score: 0 },
      { text: 'That is a lot to take in, FLIGHT.', score: 0 }]);
    if (r === 1) await c.say('FLIGHT', 'That is what I am asking you, Shackleton.', { delay: 2.6 });
    else if (r === 2) await c.say('FLIGHT', 'I know. Take a breath. Then give me numbers.', { delay: 2.6 });
    c.step(1);
    SS.pcs.projectTo = O.C.EXTENDED;
    const commit7 = c.flag('eps-commit');
    SS.interact.add({ id: 'eps-rack', scene: 'hab', x: H.spots.eps.x, z: H.spots.eps.z, r: 1.6, cone: -1, label: 'EPS rack — re-plan to sol 60', use: () => SS.pcs.open('eps', ['eclss', 'eps', 'rad']) });
    await c.say('IV', 'EPS rack. Let us see what sixty sols looks like.');
    c.tell('IV', 'Surgeon has cleared contingency rations if we need them — fifteen percent less intake. It is on the same page. Your call.');
    await c.until(() => commit7.hit);
    commit7.off();
    SS.pcs.projectTo = null;
    c.step(2);
    const proj = O.project(g.man, g.dec, O.C.EXTENDED, g.out);
    const margin = Math.min(proj.o2 / O.C.START.o2, proj.water / O.C.START.water, proj.food / O.C.START.food);
    if (proj.over && !proj.over.ok) await c.say('FLIGHT', 'Shackleton, that does not close. On this manifest it runs out on sol ' + proj.sol + '. We will work a contingency — but it does not close.', { delay: 2.6 });
    else if (margin < 0.2) await c.say('FLIGHT', 'It closes, but thin — ' + Math.round(margin * 100) + ' percent on your tightest consumable. We will be talking about a resupply lander. Thank you, Shackleton.', { delay: 2.6 });
    else await c.say('FLIGHT', 'That is a plan I can take upstairs. ' + Math.round(margin * 100) + ' percent on the tightest consumable. Thank you, Shackleton.', { delay: 2.6 });
    SS.interact.remove('eps-rack');
    if (SS.pcs.isOpen) SS.pcs.close();
  }
});

/* ------------------------------------------------------------------ time-lapse narration between chapters */
function tlEvents(sol, prev, st){
  const g = G(), O = SS.outpost, out = [];
  if (sol === 4 && g.man.vsat > 1) out.push([g.man.vsat - 1 + ' more array' + (g.man.vsat > 2 ? 's' : '') + ' stood up beside the first', 'good']);
  if (sol === 4 && g.man.fsp && g.dec.reactor) out.push(['Fission unit emplaced ' + Math.round(O.habDist(g.dec)) + ' m from the habitat', O.habDist(g.dec) < 100 ? 'bad' : 'good']);
  if (sol === 4 && g.man.greenhouse) out.push(['Crop module inflated and planted', 'good']);
  if (sol === O.C.BERM_SOL && g.man.excavator) out.push(['Regolith berm complete over the habitat', 'good']);
  if (O.C.NIGHTS.some(n => n[0] === sol)) out.push(['Sun below the ridge line — darkness begins', 'caut']);
  if (O.C.NIGHTS.some(n => n[1] + 1 === sol)) out.push(['Sunrise on the site', 'good']);
  if (sol === O.C.SPE[0]) out.push(['Proton event: crew dose +' + (st.dose - prev.dose).toFixed(1) + ' mSv this sol', 'bad']);
  if (sol === O.C.SLIP_SOL) out.push(['Return slipped — increment extended to sol 60', 'bad']);
  if (st.ran && !st.ran.hab) out.push(['HABITAT UNPOWERED — CO₂ removal offline', 'bad']);
  else if (O.isNight(sol) && st.ran && g.man.isru && !st.ran.isru) out.push(['Ice plant shed to protect the bus', 'caut']);
  const cap = O.capacity(g.man, g.dec, sol);
  if (cap && st.batt / cap < 0.1 && (!prev.batt || prev.batt / cap >= 0.1)) out.push(['Storage below 10%', 'bad']);
  if (st.water / O.C.START.water < 0.2 && prev.water / O.C.START.water >= 0.2) out.push(['Water below 20% reserve (FR-2)', 'bad']);
  if (st.food / O.C.START.food < 0.2 && prev.food / O.C.START.food >= 0.2) out.push(['Food below 20% reserve (FR-2)', 'bad']);
  if (st.over) out.push([st.over.ok ? 'Increment complete' : 'INCREMENT TERMINATED — ' + st.over.reason, st.over.ok ? 'good' : 'bad']);
  return out;
}
ST.timelapse = function(to, intro){
  const g = G();
  if (g.sol >= to) return Promise.resolve();
  return UI.timelapse({ to, intro, events: tlEvents, pace: 0.42 });
};

/* ------------------------------------------------------------------ checkpoints */
function snapshot(){
  const g = G();
  return JSON.parse(JSON.stringify({ man: g.man, dec: g.dec, out: g.out, flags: g.flags, sol: g.sol, metrics: g.metrics, cablePts: g.cablePts || [], photos: g.photos.length }));
}
let cps = {};
ST.checkpoint = name => { cps[name] = snapshot(); };
ST.restore = function(name){
  const s = cps[name]; if (!s) return;
  const g = G();
  g.man = s.man; g.dec = s.dec; g.out = s.out; g.flags = s.flags; g.sol = s.sol;
  const resets = g.metrics.resets; g.metrics = s.metrics; g.metrics.resets = resets;
  g.cablePts = s.cablePts; g.photos.length = Math.min(g.photos.length, s.photos);
};

/* fill decisions a player would have made in skipped chapters */
function prepare(i){
  const g = G(), O = SS.outpost;
  if (!g.man){ g.man = { vsat: 2, fsp: 0, battery: 1, hab: 'inflatable', eclss: 1, isru: 1, greenhouse: 1, shelter: 0, excavator: 1 }; }
  if (!g.out) g.out = O.newState(g.man, g.dec);
  if (i > 2){
    if (!g.dec.siteId){ g.dec.siteId = 'R-B'; g.dec.siteKind = 'ridge'; }
    g.flags.powerOn = true; g.flags.array1 = true; g.flags.arraysAll = true; g.flags.palletTaken = true;
    if (g.flags.arrayYaw === undefined) g.flags.arrayYaw = Math.PI - sunForSol(3).az * SS.DEG;
    if (g.man.fsp && !g.dec.reactor) g.dec.reactor = { x: M().reactorHint.x, z: M().reactorHint.z };
    if (!g.cablePts || !g.cablePts.length){
      const s = M().sites.find(q => q.id === g.dec.siteId);
      g.cablePts = []; for (let k = 0; k <= 30; k++){ const t = k / 30; g.cablePts.push({ x: SS.lerp(s.x, M().pdu.x + 0.35, t), z: SS.lerp(s.z, M().pdu.z + 0.5, t) }); }
    }
  }
  if (i > 3){ g.flags.eclssOn = true; SS.pcs.resetEclss(true); }
}

/* ------------------------------------------------------------------ campaign */
ST.play = async function(from){
  const g = G();
  ST.idx = from;
  let instant = from > 0;
  while (ST.idx < CH.length){
    const i = ST.idx, ch = CH[i];
    ST.token++;
    const tok = ST.token, c = ctx(tok);
    c.kicker = ch.kicker.toUpperCase() + (ch.meta ? ' · ' + ch.meta.split('·')[0].trim().toUpperCase() : '');
    SS.radio.flush(); UI.waypoint(null); UI.markers([]); UI.meter(null); UI.hideNote();
    g.inputLocked = false; g.habDark = false;
    try {
      if (i > 0){
        prepare(i);
        if (g.sol < ch.sol){
          if (instant || i === 1){ SS.outpost.runTo(g.out, g.man, g.dec, ch.sol); g.sol = g.out.sol; }
          else { g.mode = 'play'; await ST.timelapse(ch.sol); }
        }
        instant = false;
        cps = {}; ST.checkpoint('start');
      }
      if (ch.setup) ch.setup();
      g.mode = 'play';
      await UI.card({ kicker: ch.kicker, title: ch.title, meta: ch.meta, lede: ch.lede, obj: ch.obj, sim: ch.sim });
      g.chapterStart = SS.clock.ui;
      const r = await ch.run(c);
      SS.store.set('progress', Math.max(SS.store.get('progress', 0), i + 1));
      if (r === 'debrief') break;
      ST.idx++;
    } catch (e){
      if (!(e instanceof Abort)){ console.error(e); throw e; }
      if (ST.intent === 'restart'){ ST.intent = null; ST.restore('start'); continue; }
      if (ST.intent === 'jump'){ ST.intent = null; ST.idx = ST.jumpTo; instant = true; continue; }
      return;
    }
  }
  /* run out the increment and debrief */
  g.mode = 'play';
  if (!g.out.over) await ST.timelapse(g.out.endSol || 60, [['Final stretch of the increment', 'caut']]);
  SS.radio.flush();
  ST.debrief();
};
ST.restartChapter = function(){ ST.intent = 'restart'; ST.token++; SS.radio.flush(); };
ST.jump = function(i){ ST.intent = 'jump'; ST.jumpTo = i; ST.token++; SS.radio.flush(); };
ST.quit = function(){ ST.intent = 'quit'; ST.token++; SS.radio.flush(); };

/* ------------------------------------------------------------------ evaluation */
function rating(s){ return s >= 85 ? 'Exceeds' : s >= 70 ? 'Meets' : s >= 50 ? 'Needs improvement' : 'Unsatisfactory'; }
ST.evaluate = function(){
  const g = G(), m = g.metrics, O = SS.outpost, st = g.out, C = O.C;
  const comps = [];
  /* procedures */
  let proc = 100 - m.procDev * 12 - m.resets * 10;
  comps.push({ name: 'Procedures & checklist discipline', score: SS.clamp(proc, 5, 100),
    evidence: m.procDev ? m.procDev + ' deviation' + (m.procDev > 1 ? 's' : '') + ': ' + m.procNotes.slice(0, 2).join('; ') + (m.procNotes.length > 2 ? '…' : '') : 'Every procedure worked in order, first time.' });
  /* communication */
  const cs = m.comm.reduce((a, q) => a + (q.score > 0 ? 9 : q.score < 0 ? -14 : 0) - (q.latency > 12 ? 4 : 0), 0);
  comps.push({ name: 'Communication', score: SS.clamp(72 + cs, 5, 100),
    evidence: m.comm.length + ' transmissions; ' + m.comm.filter(q => q.score > 0).length + ' by the book, ' + m.comm.filter(q => q.score < 0).length + ' that FLIGHT had to overrule or chase.' });
  /* situational awareness */
  const parts = [];
  if (m.fanResp !== null && m.fanResp !== undefined) parts.push(m.fanResp < 12 ? 100 : m.fanResp < 25 ? 82 : m.fanResp < 45 ? 62 : 38);
  if (m.speResp !== null && m.speResp !== undefined) parts.push((m.speOutside ? 45 : m.speResp < 50 ? 100 : 80) - (m.speChoice === 1 ? 15 : 0));
  if (m.incap) parts.push(10);
  const sa = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 75;
  comps.push({ name: 'Situational awareness', score: SS.clamp(sa, 5, 100),
    evidence: [m.fanResp !== undefined && m.fanResp !== null ? 'Fan failure to purge ' + m.fanResp.toFixed(0) + ' s' : null, m.speResp !== undefined && m.speResp !== null ? 'proton call to LTV ' + m.speResp.toFixed(0) + ' s' + (m.speOutside ? ', still outside at onset' : '') : null].filter(Boolean).join('; ') || 'No malfunctions reached.' });
  /* decision making */
  let dm = 78 - m.waivers * 14;
  if (m.siteKind === 'ridge') dm += 12; else if (m.siteKind === 'flat') dm -= 12;
  if (g.man.fsp && g.dec.reactor){ dm += O.habDist(g.dec) >= 100 ? 8 : -22; }
  if (st.maxDark) dm -= 25;
  if (m.policyRisk) dm -= 10;
  if (m.noShelter) dm -= 8;
  comps.push({ name: 'Decision making', score: SS.clamp(dm, 5, 100),
    evidence: [m.waivers ? m.waivers + ' NO-GO accepted at FRR' : 'Flew an all-GO manifest', m.siteKind ? 'array on the ' + (m.siteKind === 'ridge' ? 'ridge' : 'flats') : null, g.man.fsp && g.dec.reactor ? 'reactor ' + Math.round(O.habDist(g.dec)) + ' m out' : null, st.maxDark ? 'habitat went unpowered' : null].filter(Boolean).join('; ') + '.' });
  /* consumables */
  const minPlss = m.evas.reduce((a, e) => Math.min(a, e.minMargin), 999);
  const reserve = m.evas.some(e => e.reserve);
  const out = st.over && st.over.ok ? Math.min(st.o2 / C.START.o2, st.water / C.START.water, st.food / C.START.food) : 0;
  let cm = (reserve ? 40 : minPlss > 90 ? 95 : minPlss > 0 ? 80 : 55) * 0.5 + (st.over && st.over.ok ? (out >= 0.2 ? 95 : 70) : 30) * 0.5;
  comps.push({ name: 'Consumables management', score: SS.clamp(cm, 5, 100),
    evidence: 'Smallest PLSS walkback margin ' + (minPlss >= 999 ? 'n/a' : (minPlss >= 0 ? '+' : '−') + SS.fmtMin(Math.abs(minPlss))) + '; outpost ' + (st.over && st.over.ok ? 'closed sol ' + st.sol + ' with ' + Math.round(out * 100) + '% on its thinnest consumable' : 'did not reach its end date') + '.' });
  /* outcome */
  const frs = st.violations.length;
  const oc = st.over && st.over.ok ? SS.clamp(100 - frs * 7, 40, 100) : 22;
  comps.push({ name: 'Mission outcome', score: oc, evidence: st.over && st.over.ok ? 'Crew returned on sol ' + st.sol + ' with ' + frs + ' flight rule finding' + (frs === 1 ? '' : 's') + '.' : 'Increment terminated on sol ' + st.sol + ' (' + (st.over ? st.over.reason : 'incomplete') + ').' });
  comps.forEach(c => { c.score = Math.round(c.score); c.rating = rating(c.score); });
  return comps;
};
ST.debrief = function(){
  const g = G(), O = SS.outpost, st = g.out, C = O.C, m = g.metrics;
  const comps = ST.evaluate();
  const uns = comps.some(c => c.rating === 'Unsatisfactory'), ok = st.over && st.over.ok;
  const allMeet = comps.every(c => c.rating === 'Exceeds' || c.rating === 'Meets');
  const rec = !ok || uns ? ['Not recommended — repeat integrated sim', 'no'] : allMeet ? ['Recommended for flight assignment', 'go'] : ['Recommended pending remedial training', 'hold'];
  const best = comps.slice().sort((a, b) => b.score - a.score)[0], worst = comps.slice().sort((a, b) => a.score - b.score)[0];
  const quote = (ok ? 'The outpost made it to sol ' + st.sol + '. ' : 'We lost the increment on sol ' + st.sol + '. ') +
    'Your strongest area was ' + best.name.toLowerCase() + '. ' + (worst.score < 70 ? 'Where I need to see work is ' + worst.name.toLowerCase() + ': ' + worst.evidence.charAt(0).toLowerCase() + worst.evidence.slice(1) + ' ' : 'Nothing below standard. ') +
    (rec[1] === 'go' ? 'I would put you on a crew.' : rec[1] === 'hold' ? 'Close. Fix that, and come back.' : 'We run it again.');
  const rules = [
    ['FR-1', 'Crew dose below 250 mSv for the increment'],
    ['FR-2', 'Each consumable holds at least 20% reserve'],
    ['FR-3', 'The habitat stays powered'],
    ['FR-4', 'Crew under storm shielding before particle event arrival'],
    ['FR-5', 'Habitat outside the 100 m reactor exclusion radius'],
    ['FR-6', 'EVA terminates before PLSS reserve']
  ].map(([id, text]) => {
    const v = st.violations.filter(q => q.id === id);
    let detail = v.map(q => q.detail + ' — ' + q.count + ' sol' + (q.count > 1 ? 's' : '') + ' from sol ' + q.sol).join('; ');
    let viol = v.length > 0;
    if (id === 'FR-4' && (m.speOutside || m.noShelter)){ viol = true; detail = (m.speOutside ? 'EV1 outside at proton onset (' + (m.speDose || 0).toFixed(1) + ' mSv)' : '') + (m.noShelter ? (m.speOutside ? '; ' : '') + 'no shelter or berm available' : ''); }
    return { id, text, v: viol, detail: viol ? detail : 'No finding.' };
  });
  const lessons = [];
  const kind = g.dec.siteKind;
  if (kind === 'ridge') lessons.push(['pos', '<b>Array on the connecting ridge.</b> It kept about a third of its output through both darkness gaps; the same hardware on the flats would have given nothing for twelve sols.']);
  else if (kind === 'flat') lessons.push(['neg', '<b>Array on the flats.</b> Closer and easier to reach — and completely dark for six sols at a time. Every darkness hour came out of storage.']);
  if (!g.man.battery) lessons.push(['neg', '<b>No storage.</b> Without batteries the habitat bus is only as steady as the generation at that moment.']);
  if (g.man.fsp && g.dec.reactor){ const d = O.habDist(g.dec); lessons.push(d >= 100 ? ['pos', '<b>Reactor at ' + Math.round(d) + ' m.</b> Continuous power through darkness with negligible dose at the habitat.'] : ['neg', '<b>Reactor at ' + Math.round(d) + ' m.</b> Inside the exclusion radius: ' + O.reactorDose(g.man, g.dec).toFixed(2) + ' mSv every sol, for nothing but a shorter cable.']); }
  if (g.man.excavator) lessons.push(['pos', '<b>Regolith berm.</b> Local material turned the habitat into a storm shelter at zero launch mass.']);
  if (g.man.shelter) lessons.push(['pos', '<b>Storm shelter.</b> Dead mass for twenty-two sols, and the reason the particle event cost ' + (g.dec.sheltered ? 'almost nothing.' : 'less than it could have.')]);
  if (!g.man.shelter && !g.man.excavator) lessons.push(['neg', '<b>No storm shielding.</b> Protons are easy to stop with mass — and you had none to spare.']);
  if (g.man.isru) lessons.push(['pos', '<b>Ice processing.</b> The only thing on the surface that makes the water tank go up. Electrolysis alone drinks 3.7 kg a sol.']);
  else lessons.push(['neg', '<b>No ice processing.</b> With 93% recovery and electrolysis on the same tank, water only ever goes down.']);
  if (g.man.greenhouse) lessons.push(['pos', '<b>Crops.</b> A quarter of the diet — not closure, but the margin that absorbed a fifteen-sol slip.']);
  else lessons.push(['neg', '<b>No crops.</b> The food manifest covered the plan, not the slip. Food is the loop nobody can close yet.']);
  if (g.dec.rations) lessons.push(['pos', '<b>Contingency rations.</b> Fifteen percent less intake for thirty sols bought about thirty kilograms of margin. It is a real tool — and a real cost in crew performance, which is why it is a flight surgeon decision.']);
  if (m.fanResp !== undefined && m.fanResp !== null) lessons.push([m.fanResp < 25 ? 'pos' : 'neg', '<b>Fan failure.</b> ' + m.fanResp.toFixed(0) + ' s from the fan stopping to the purge valve opening. The memory item exists because CO₂ in a helmet takes away the judgement you would need to find it.']);
  SS.debrief({
    date: 'Sol ' + st.sol,
    headline: ok ? 'Increment complete' : 'Increment terminated',
    rec: rec[0], recCls: rec[1], quote, comps, rules, lessons,
    evas: m.evas, photos: g.photos, evaDose: g.dec.ev1Eva || 0
  });
  g.mode = 'debrief';
};
})();
