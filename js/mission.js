/* Shackleton Station — the mission. You are the commander of a Moon base for 6 days, played first-person:
   walk (WASD), look (mouse), use things (E), drive the rover. Three things to keep in balance:
   AIR & FOOD, POWER and RADIATION. Real solar flares from NASA DONKI decide when the Sun's storms hit.
   Every job you do costs time, suit air, battery or radiation. Nothing is free. */
(function(){
'use strict';
const SS = window.SS;
const MS = SS.mission = { active: false };
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rnd = (a, b) => a + Math.random() * (b - a);
const fmtDate = d => { try { return new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return d; } };
const clock = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

/* ---------------------------------------------------------------- rules: small numbers kids can reason about */
const DAYS = 6, DAY_LEN = 150;                 // seconds of play per base day
const GEN = { day: 12, shadow: 2 };            // power the solar panels make per day
const LOAD = { base: 4, gh: 3, water: 3, lab: 3 };
const BATT_CAP = 14, AIR_CAP = 8, LIMIT = 250, SHIELD_MAX = 3, SHIELD_COST = 3;
const SUIT_SECS = 210;                         // seconds of suit air on a full tank
const COSMIC = 1.37;                           // mSv per day on the Moon (Chang'e-4)
const STORM = { warn: 40, len: 35 };
const DOSE = { huge: 120, big: 60, med: 20 };  // game estimate: mSv if outside for a whole storm
const SITE_SHADOW_DAY = 4;

const FACTS = [
  { t: 'On the Moon you would get about 1.4 millisieverts of radiation a day. That is around 200 times more than the natural background on Earth.', s: 'Chang\'e-4 Lunar Lander Neutrons and Dosimetry experiment — Zhang et al., Science Advances 6, eaaz1334 (2020)' },
  { t: 'Light from a solar flare reaches us in about 8 minutes. The fastest radiation particles can arrive within tens of minutes, so warnings have to be quick.', s: 'NOAA Space Weather Prediction Center; NASA DONKI' },
  { t: 'Radio signals take 1.3 seconds to reach the Moon, but 3 to 22 minutes to reach Mars. Mars crews often have to decide things without waiting for Earth.', s: 'NASA Deep Space Network' },
  { t: 'Astronauts on the International Space Station grew red romaine lettuce. Tests showed it was safe to eat and as nutritious as lettuce grown on Earth.', s: 'NASA Veggie — Khodadad et al., Frontiers in Plant Science 11, 199 (2020)' },
  { t: 'Astronaut Scott Kelly spent 340 days in space while his twin brother stayed on Earth. Most of the changes in his body went back to normal after he landed.', s: 'NASA Twins Study — Garrett-Bakelman et al., Science 364, eaau8650 (2019)' },
  { t: 'In 2009 NASA crashed a rocket stage into a dark crater near the Moon\'s south pole. The cloud it kicked up was about 5.6% water ice.', s: 'LCROSS — Colaprete et al., Science 330, 463 (2010)' },
  { t: 'Some ridges near the Moon\'s south pole are sunlit more than 80% of the time, which is why bases are planned there. But there are still dark spells.', s: 'Lunar Reconnaissance Orbiter laser altimeter — Mazarico et al., Icarus 211, 1066 (2011)' },
  { t: 'Water and moondust are good radiation shields. NASA\'s Orion capsule has the crew build a storm shelter out of stowage bags if a solar storm hits.', s: 'NASA Orion / Artemis program' },
  { t: 'Without gravity pulling on them, astronauts can lose about 1 to 1.5% of the bone in their hips and legs every month. That is why they exercise every day.', s: 'NASA Human Research Program' },
  { t: 'On the Moon you weigh about one sixth of what you weigh on Earth. That is why astronauts bounce when they run.', s: 'NASA: lunar surface gravity 1.62 m/s²' }
];

/* ---------------------------------------------------------------- state */
let M = null;
const W = () => SS.world, PL = () => SS.player, R = () => SS.rover, B = () => SS.base, MAP = () => SS.MAP;
const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
function flareTier(f){ return f.letter === 'X' && f.mag >= 5 ? 'huge' : f.letter === 'X' ? 'big' : 'med'; }

MS.sun = function(kind){
  const w = W(), s = kind === 'night' ? { az: 306.6, el: -0.4 } : { az: 184.6, el: 4.5 };
  if (!w._sun || w._sun.az !== s.az || w._sun.el !== s.el){ w.setSun(s.az, s.el); w._sun = s; }
};

function newState(){
  const st = {
    day: 1, t: 0, air: 4, batt: 10, shield: 0, dose: 0, stars: 0, starFrac: 0, suit: 100,
    sys: { gh: true, water: true, lab: false }, carrying: 0, delivered: 0, iceDone: false,
    dusty: false, pump: false, emergency: false, sheltered: false, asked: false, warnedSuit: false,
    flare: null, flares: [], events: {}, rocks: [], dayStart: null,
    stats: { shelterDose: 0, outsideDose: 0, storms: 0, inShelter: 0, inHab: 0, outside: 0, rescues: 0, lostSamples: 0, emergencySecs: 0, digs: 0, minAir: 4, asked: 0 }
  };
  const picks = SS.nasa.pick(2), days = [];
  while (days.length < picks.length){ const d = 2 + Math.floor(Math.random() * (DAYS - 1)); if (days.indexOf(d) < 0) days.push(d); }
  st.flares = picks.map((f, i) => ({ day: days[i], at: rnd(0.25, 0.6) * DAY_LEN, f, phase: 'wait', t: 0, dose: 0 }));
  const evDays = [2, 3, 5, 6].sort(() => Math.random() - 0.5);
  st.events[evDays[0]] = 'dust'; st.events[evDays[1]] = 'pump';
  return st;
}

/* ---------------------------------------------------------------- world staging */
function gState(){
  const dec = Object.assign(SS.outpost.decisionsDefault(), { siteId: 'R-B', siteKind: 'ridge' });
  return { man: { vsat: 2, fsp: 0, battery: 1, hab: 'inflatable', eclss: 1, isru: 1, greenhouse: 1, shelter: 0, excavator: 1 },
    flags: { powerOn: true, array1: true, arraysAll: true, palletTaken: true, arrayYaw: Math.PI - 184.6 * SS.DEG }, dec, sol: 8, habDark: false };
}
function syncWorld(){
  const g = gState();
  g.habDark = M && M.emergency;
  B().sync(g);
  const o = B().o;
  o.berm.visible = M && M.shield > 0;
  if (M && M.shield > 0) o.berm.scale.set(1.25, 0.45 + 0.28 * M.shield, 0.95);
  SS.models.greenhousePower(!!(M && M.sys.gh && !M.pump && !M.emergency));
  SS.models.habPower(!(M && M.emergency));
}

/* rock samples: real-looking boulders with a marker, re-scattered every morning */
const rockPool = [];
function scatterRocks(n){
  const w = W(), o = B().obstacles();
  M.rocks = [];
  rockPool.forEach(r => { r.visible = false; });
  let tries = 0;
  while (M.rocks.length < n && tries++ < 400){
    const a = Math.random() * Math.PI * 2, d = rnd(22, 95), x = 25 + Math.cos(a) * d, z = 18 + Math.sin(a) * d;
    if (w.isPSR(x, z) || !w.inBounds(x, z)) continue;
    if (o.some(b => SS.dist(x, z, b.x, b.z) < b.r + 3)) continue;
    if (M.rocks.some(r => SS.dist(x, z, r.x, r.z) < 18)) continue;
    const mesh = rockPool[M.rocks.length];
    mesh.position.set(x, w.H(x, z) + 0.12, z); mesh.rotation.y = Math.random() * 6; mesh.visible = true;
    M.rocks.push({ x, z, mesh, id: 'rock' + M.rocks.length });
  }
  M.rocks.forEach(r => SS.interact.add({ id: r.id, x: r.x, z: r.z, r: 2.4, cone: 0.1,
    label: () => 'Pick up the rock sample', use: () => pickRock(r) }));
}
function pickRock(r){
  SS.interact.remove(r.id); r.mesh.visible = false; r.done = true;
  M.carrying++;
  SS.audio.ui('click');
  SS.ui.toast('🪨 Rock sample picked up! Bring it back to the habitat.', 'ok');
  if (M.carrying === 1) say('CREW', 'Nice find! Bring the samples inside and we can study them. Watch your suit air on the way back.');
}

/* ---------------------------------------------------------------- talking on the radio */
function say(sp, text, delay){ return SS.radio.say(sp, text, { delay: delay || 0 }); }
function mc(text){ pulse(); return say('MC', text, 1.3); }   // light takes 1.3 s from Earth to the Moon
function pulse(){ const p = $('kxPulse'); if (!p) return; p.classList.remove('go'); void p.offsetWidth; p.classList.add('go'); }

/* ---------------------------------------------------------------- interactables */
function setupInteract(){
  const IX = SS.interact, Mp = MAP(), w = W();
  IX.items = IX.items.filter(i => i.id === 'ltv-board');
  /* habitat door, outside */
  IX.add({ id: 'hab-door', x: Mp.habLock.x + 1.3, z: Mp.habLock.z, r: 3.0, cone: -1,
    label: () => M.flare && M.flare.phase !== 'wait' && M.flare.phase !== 'done' ? 'GET INSIDE the habitat!' : 'Go inside (refills your suit air)',
    use: () => goInside() });
  /* inside the habitat */
  const S = SS.interior.hab.spots;
  IX.add({ id: 'hab-exit', scene: 'hab', x: S.hatch.x - 0.3, z: 0, r: 1.4, cone: -1, label: 'Go outside', use: () => goOutside() });
  IX.add({ id: 'power', scene: 'hab', x: S.eps.x, z: S.eps.z, r: 1.5, cone: -1, label: 'Use the power console', use: () => powerConsole() });
  IX.add({ id: 'radio', scene: 'hab', x: 1.8, z: 0.15, r: 1.3, cone: -1, label: () => M.asked ? 'Radio (already called today)' : 'Call Mission Control on the radio', enabled: () => true, use: () => callEarth() });
  IX.add({ id: 'shelter', scene: 'hab', x: S.shelter.x, z: S.shelter.z, r: 1.4, cone: -1,
    label: () => M.sheltered ? 'You are in the storm shelter' : (M.flare && (M.flare.phase === 'warn' || M.flare.phase === 'storm')) ? 'Get into the STORM SHELTER' : 'Storm shelter (for solar storms)',
    use: () => takeShelter() });
  IX.add({ id: 'sleep', scene: 'hab', x: -1.9, z: 0.72, r: 1.3, cone: -1, label: 'Go to sleep (end the day)', enabled: () => !(M.flare && M.flare.phase !== 'wait' && M.flare.phase !== 'done'), use: () => endDay(true) });
  /* outside jobs */
  const ex = B().o.excavator.position;
  IX.add({ id: 'dig', x: ex.x, z: ex.z, r: 3.4, cone: -1, hold: 5, keep: true,
    label: () => M.shield >= SHIELD_MAX ? 'Shield wall is finished' : 'Pile moondust on the shield wall (uses ' + SHIELD_COST + ' battery)',
    enabled: () => M.shield < SHIELD_MAX, use: () => dig() });
  IX.add({ id: 'pump', x: Mp.greenhouse.x, z: Mp.greenhouse.z + 4.2, r: 3.4, cone: -1, hold: 4, keep: true,
    label: 'Fix the greenhouse pump', enabled: () => M.pump, use: () => { M.pump = false; syncWorld(); SS.ui.toast('🔧 Greenhouse pump fixed! The plants are growing again.', 'ok'); say('CREW', 'Pump is running again. Thanks, commander!'); } });
  const site = Mp.sites.find(s => s.id === 'R-B'), arr = B().arrayPositions(site, 2)[0];
  M.arrayPos = { x: arr.x + 2.6, z: arr.z + 1.5 };
  IX.add({ id: 'clean', x: arr.x + 2.6, z: arr.z + 1.5, r: 4, cone: -1, hold: 4, keep: true,
    label: 'Brush the dust off the solar panels', enabled: () => M.dusty, use: () => { M.dusty = false; SS.ui.toast('🧹 Solar panels clean! Full power again.', 'ok'); mc('We can see your power is back up. Nice work out there.'); } });
  IX.add({ id: 'ice', x: Mp.rim.x, z: Mp.rim.z, r: 4, cone: -1, hold: 3,
    label: 'Scoop up the icy soil sample', enabled: () => !M.iceDone, use: () => { M.iceDone = true; M.carrying += 3; SS.ui.toast('🧊 Icy soil collected! Worth 3 stars once it is back at the habitat.', 'ok'); mc('An ice sample from the crater? Scientists here are cheering. Get it home safely.'); } });
}

function goInside(){
  const P = PL();
  if (R().boarded) return;
  P.teleport('hab', SS.interior.hab.spots.spawn.x, 0, Math.PI / 2);
  SS.npc.set('hidden');
  SS.audio.clunk();
  if (M.carrying){
    const got = M.carrying; M.stars += got; M.delivered += got; M.carrying = 0;
    SS.ui.toast('⭐ +' + got + ' science star' + (got > 1 ? 's' : '') + ' for the samples!', 'ok');
  }
}
function goOutside(){
  const Mp = MAP(), P = PL();
  P.teleport('ext', Mp.habLock.x + 3.2, Mp.habLock.z + 0.5, yawTo(Mp.habLock.x, Mp.habLock.z, 20, 10));
  SS.npc.place(Mp.habLock.x + 3.5, Mp.habLock.z + 3, 0); SS.npc.set('follow');
  SS.audio.clunk();
}
function takeShelter(){
  if (!M.flare || (M.flare.phase !== 'warn' && M.flare.phase !== 'storm')){ SS.ui.toast('The storm shelter has extra-thick walls. Use it when a solar storm is coming.'); return; }
  if (M.sheltered) return;
  M.sheltered = true;
  const P = PL(), S = SS.interior.hab.spots.shelter;
  P.x = S.x; P.z = 0.5; P.yaw = 0; P.mode = 'locked';
  SS.ui.toast('🛡️ You are in the storm shelter. Wait here until the storm passes.', 'ok');
  say('CREW', 'Everyone is in. Thick walls all around us. Now we wait.');
}
function dig(){
  if (M.batt < SHIELD_COST){ SS.ui.toast('🔋 Not enough battery to run the digger (needs ' + SHIELD_COST + ').', 'err'); return; }
  M.batt -= SHIELD_COST; M.shield++; M.stats.digs++;
  syncWorld();
  SS.ui.toast('🛡️ Shield wall is now level ' + M.shield + ' of ' + SHIELD_MAX + '!', 'ok');
  if (M.shield === 1) say('CREW', 'That moondust wall will soak up radiation every day, and even more in a storm.');
}

/* ---------------------------------------------------------------- power console (inside the habitat) */
function power(){
  const gen = (M.day === SITE_SHADOW_DAY ? GEN.shadow : GEN.day) * (M.dusty ? 0.5 : 1);
  const s = M.sys, load = LOAD.base + (s.gh ? LOAD.gh : 0) + (s.water ? LOAD.water : 0) + (s.lab ? LOAD.lab : 0);
  return { gen, load, net: gen - load };
}
function airRate(){
  const s = M.sys;
  return -1 + (s.gh && !M.pump ? 0.6 : 0) + (s.water ? 0.6 : 0) - (M.emergency ? 1 : 0);
}
function powerConsole(){
  const p = power(), s = M.sys, ar = airRate();
  const days = p.net < 0 ? M.batt / -p.net : null;
  const tog = (k, icon, name, use, what) => '<button type="button" class="kx-tog' + (s[k] ? ' on' : '') + '" data-tog="' + k + '"><span class="i">' + icon + '</span><b>' + name + '</b><small>' + what + '</small><em>' + (s[k] ? 'ON' : 'OFF') + ' · uses ' + use + ' ⚡</em></button>';
  open('<div class="kx-kick">Habitat power console</div><h2>Choose what gets power</h2>' +
    '<div class="kx-flow"><div><span>☀️ Solar panels make</span><b>' + p.gen + ' ⚡/day</b>' + (M.day === SITE_SHADOW_DAY ? '<small>Long shadow today</small>' : M.dusty ? '<small>Dusty panels: half power!</small>' : '') + '</div>' +
      '<div><span>🏠 Habitat uses</span><b>' + p.load + ' ⚡/day</b><small>Lights, heat and air fans always need ' + LOAD.base + '</small></div>' +
      '<div class="' + (p.net >= 0 ? 'good' : 'bad') + '"><span>🔋 Battery</span><b>' + (p.net >= 0 ? 'filling +' : 'draining ') + p.net + '/day</b><small>' + (days !== null ? 'Empty in about ' + (days < 1 ? 'less than a day' : days.toFixed(1) + ' days') : M.batt >= BATT_CAP ? 'Full: extra power is wasted' : 'Charging') + '</small></div></div>' +
    '<div class="kx-togs">' +
      tog('gh', '🥬', 'Greenhouse', LOAD.gh, 'Grows food and makes oxygen' + (M.pump ? ' (pump broken!)' : '')) +
      tog('water', '💧', 'Water maker', LOAD.water, 'Melts ice for drinking water and air') +
      tog('lab', '🔬', 'Science lab', LOAD.lab, 'Earns 3 ⭐ a day') +
    '</div>' +
    '<p class="kx-note">Air &amp; food: <b class="' + (ar >= 0 ? 'good' : 'bad') + '">' + (ar >= 0 ? '+' : '') + ar.toFixed(1) + ' day per day</b>. Four people use 1 day of supplies every day. The greenhouse and water maker each win some back.</p>' +
    '<div class="kx-actions"><button type="button" class="primary" data-close>Done</button></div>');
  $('mxCard').querySelectorAll('[data-tog]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.tog; M.sys[k] = !M.sys[k]; if (M.emergency && M.sys[k]) M.sys[k] = M.batt > 0; syncWorld(); SS.audio.ui('toggle'); powerConsole(); }));
}

/* ---------------------------------------------------------------- Mission Control: advice arrives after the light delay */
function tip(){
  const p = power();
  if (M.day < SITE_SHADOW_DAY && SITE_SHADOW_DAY - M.day <= 2 && M.batt < 10) return 'The long shadow comes on day ' + SITE_SHADOW_DAY + '. Your panels will make only ' + GEN.shadow + ' power. Fill the battery now: switch off something you can live without.';
  if (M.air < 2.5) return 'Your air and food stores are low. Keep the greenhouse and the water maker running.';
  if (p.net < -3 && M.batt < 6) return 'Your battery is draining fast. Switch off the science lab for a while.';
  if (M.shield === 0) return 'Build the shield wall at the digger. It protects you every day and in every solar storm.';
  if (M.dusty) return 'Your solar panels are dusty. Drive the rover up to the ridge and brush them off.';
  if (!M.iceDone) return 'There may be ice at the crater rim. Take the rover. It is a long way, so watch your suit air.';
  return 'Everything looks good from here. Spare power can go to the science lab.';
}
function callEarth(){
  if (M.asked){ SS.ui.toast('You already called today. Mission Control will check in tomorrow.'); return; }
  M.asked = true; M.stats.asked++;
  say('EV1', 'Shackleton Base to Houston, what do you recommend?');
  pulse();
  setTimeout(() => { if (M && M.active) mc(tip()); }, 1300);   // our signal out (1.3 s) + theirs back (1.3 s, in mc)
  SS.ui.toast('📡 Radio signals take 1.3 s each way to Earth. To Mars it would be up to 22 minutes!');
}

/* ---------------------------------------------------------------- solar flares (real DONKI events) */
function flareTick(dt){
  const P = PL(), f = M.flare || M.flares.find(x => x.day === M.day && x.phase === 'wait' && M.t >= x.at);
  if (!f) return;
  if (f.phase === 'wait'){
    M.flare = f; f.phase = 'warn'; f.t = 0; M.stats.storms++;
    SS.audio.alarm(true); setTimeout(() => SS.audio.alarm(false), 2200);
    const tier = flareTier(f.f);
    mc('Flare alert! We just saw ' + (tier === 'huge' ? 'a huge' : tier === 'big' ? 'a big' : 'a medium') + ' solar flare. Radiation could reach you in under a minute. Get inside the habitat. The storm shelter is safest!');
    return;
  }
  f.t += dt;
  const tier = flareTier(f.f), inHab = P.scene === 'hab';
  if (f.phase === 'warn' && f.t >= STORM.warn){ f.phase = 'storm'; f.t = 0; say('CREW', M.sheltered ? 'Radiation is arriving. Stay put!' : inHab ? 'It is here! Get to the shelter if you can!' : 'Commander, the storm is here and you are outside!'); }
  else if (f.phase === 'storm'){
    const rate = DOSE[tier] / STORM.len, where = M.sheltered ? 0.08 : inHab ? 0.35 * (1 - 0.25 * M.shield) : 1;
    const d = rate * where * dt;
    f.dose += d; M.dose += d;
    if (M.sheltered) M.stats.inShelter += dt; else if (inHab) M.stats.inHab += dt; else M.stats.outside += dt;
    SS.game.doseClicks = M.sheltered ? 0.5 : inHab ? 2 : 8;
    if (f.t >= STORM.len){
      f.phase = 'done'; M.flare = null; SS.game.doseClicks = 0;
      const outside = DOSE[tier];
      if (M.sheltered){ M.sheltered = false; P.mode = 'walk'; }
      M.stats.shelterDose += f.dose;
      say('MC', 'The storm has passed. Your crew got ' + f.dose.toFixed(1) + ' millisieverts. Out in the open it would have been ' + outside + '.', 1.3);
      SS.ui.toast('☢️ Storm over: +' + f.dose.toFixed(1) + ' mSv (outside would have been ' + outside + ')', f.dose < outside * 0.2 ? 'ok' : 'err');
    }
  }
}

/* ---------------------------------------------------------------- per frame */
MS.tick = function(dt, dtR){
  if (!M || !MS.active) return;
  hud(dtR);
  if (dt <= 0) return;
  const P = PL(), f = dt / DAY_LEN, outside = P.scene === 'ext';
  M.t += dt;
  /* power */
  let p = power();
  M.batt += p.net * f;
  if (M.batt <= 0){
    M.batt = 0;
    if (M.sys.gh || M.sys.water || M.sys.lab){
      M.sys = { gh: false, water: false, lab: false }; syncWorld();
      say('CREW', 'The battery is empty! I had to switch everything off except the air fans.');
    }
    p = power();
    const em = p.net < 0;
    if (em !== M.emergency){ M.emergency = em; syncWorld(); if (em) mc('We see your base on emergency power. Air is running low. Use any power you get for life support.'); }
  } else if (M.emergency){ M.emergency = false; syncWorld(); }
  if (M.batt > BATT_CAP) M.batt = BATT_CAP;
  if (M.emergency) M.stats.emergencySecs += dt;
  /* air & food, science, radiation */
  M.air = Math.min(AIR_CAP, M.air + airRate() * f);
  M.stats.minAir = Math.min(M.stats.minAir, M.air);
  if (M.sys.lab && !M.emergency){ M.starFrac += 3 * f; while (M.starFrac >= 1){ M.starFrac--; M.stars++; SS.ui.toast('🔬 The lab finished an experiment: +1 ⭐', 'ok'); } }
  M.dose += COSMIC * f * (outside ? 1 : 1 - 0.15 * M.shield);
  /* suit air */
  if (outside){
    const k = R().boarded ? 0.8 : P.lope ? 1.6 : P.working ? 1.3 : 1;
    M.suit = Math.max(0, M.suit - 100 / SUIT_SECS * k * dt);
    if (M.suit < 30 && !M.warnedSuit){ M.warnedSuit = true; say('CREW', 'Commander, your suit air is getting low. Head back to the habitat!'); SS.audio.ui('caution'); }
    if (M.suit <= 0) rescue();
  } else {
    M.suit = Math.min(100, M.suit + 40 * dt);
    if (M.suit > 60) M.warnedSuit = false;
  }
  flareTick(dt);
  /* end of mission conditions, end of day */
  if (M.air <= 0) return finish('air');
  if (M.dose >= LIMIT) return finish('dose');
  if (M.t >= DAY_LEN && !(M.flare && M.flare.phase !== 'done')) endDay(false);
};
function rescue(){
  const lost = M.carrying;
  if (R().boarded) R().exit();
  M.carrying = 0; M.stats.rescues++; M.stats.lostSamples += lost;
  goInside();
  M.suit = 20;
  open('<div class="kx-icon">🧑‍🚀</div><div class="kx-kick">Suit air ran out</div><h2>Your crewmate brought you back</h2>' +
    '<p>Your suit air ran out, so Sam came out and helped you back inside. Everyone is safe' + (lost ? ', but the ' + lost + ' sample' + (lost > 1 ? 's' : '') + ' you were carrying got left behind' : '') + '.</p>' +
    '<p>Real spacewalkers always watch their oxygen and plan how long it will take to walk back. That is called the <b>walkback</b>.</p>' +
    '<div class="kx-actions"><button type="button" class="primary" data-close>Got it</button></div>');
}

/* ---------------------------------------------------------------- days */
function beginDay(first){
  M.t = 0; M.asked = false;
  M.dayStart = { air: M.air, batt: M.batt, stars: M.stars, dose: M.dose };
  MS.sun(M.day === SITE_SHADOW_DAY ? 'night' : 'day');
  syncWorld();
  scatterRocks(4);
  const ev = M.events[M.day];
  if (ev === 'dust') M.dusty = true;
  if (ev === 'pump') M.pump = true;
  syncWorld();
  const msgs = [];
  if (first){ M.morning = msgs; msgs.push('Good morning, commander. Welcome to Shackleton Base. Look around, collect rock samples, and check the power console inside the habitat.'); return; }
  if (M.day === SITE_SHADOW_DAY) msgs.push('The Sun has dipped behind the hills. Your solar panels will make very little power today. Press L for your headlamp.');
  else msgs.push('Good morning! ' + DAYS + ' days is the plan, and this is day ' + M.day + '.');
  if (ev === 'dust') msgs.push('A supply lander just touched down nearby and sprayed dust all over your solar panels. They are only making half power. Drive the rover up to the ridge and brush them off.');
  if (ev === 'pump') msgs.push('The greenhouse pump is clogged with roots. The plants will stop making food and oxygen until someone fixes it.');
  if (M.day === SITE_SHADOW_DAY - 1) msgs.push('Heads up: tomorrow the long shadow arrives. Make sure your battery is full tonight.');
  msgs.forEach(t => mc(t));
}
function endDay(slept){
  if (!M || M.ending) return;
  const d0 = M.dayStart, log = [];
  const dAir = M.air - d0.air, dBatt = M.batt - d0.batt, dStars = M.stars - d0.stars, dDose = M.dose - d0.dose;
  log.push([dAir >= 0 ? 'good' : 'bad', '💨 Air &amp; food: ' + (dAir >= 0 ? '+' : '') + dAir.toFixed(1) + ' (now ' + M.air.toFixed(1) + ' days)']);
  log.push([dBatt >= 0 ? 'good' : 'bad', '🔋 Battery: ' + (dBatt >= 0 ? '+' : '') + dBatt.toFixed(1) + ' (now ' + M.batt.toFixed(0) + ' / ' + BATT_CAP + ')']);
  log.push([dStars > 0 ? 'good' : '', '⭐ Science stars: +' + dStars + (M.carrying ? ' (still carrying ' + M.carrying + ' outside!)' : '')]);
  log.push([dDose > 5 ? 'bad' : '', '☢️ Radiation: +' + dDose.toFixed(1) + ' mSv']);
  if (M.dusty) log.push(['bad', '🟫 The solar panels are still dusty.']);
  if (M.pump) log.push(['bad', '🔧 The greenhouse pump is still broken.']);
  const fact = FACTS[(M.day * 3) % FACTS.length];
  const last = M.day >= DAYS;
  M.ending = true;
  open('<div class="kx-kick">End of day ' + M.day + ' of ' + DAYS + '</div><h2>' + (last ? 'Mission complete!' : slept ? 'Goodnight, commander' : 'The day is over') + '</h2>' +
    '<ul class="kx-log">' + log.map(x => '<li class="' + x[0] + '">' + x[1] + '</li>').join('') + '</ul>' +
    '<div class="kx-fact"><b>🔭 Real science</b><p>' + esc(fact.t) + '</p><small>' + esc(fact.s) + '</small></div>' +
    '<div class="kx-actions"><button type="button" class="primary" id="mxNext">' + (last ? 'See the mission report' : 'Start day ' + (M.day + 1) + ' ▶') + '</button></div>');
  $('mxNext').addEventListener('click', e => {
    if (!M || !M.ending || e.currentTarget.disabled) return;
    e.currentTarget.disabled = true;
    M.ending = false;
    if (last) return finish('done');
    M.day++;
    close();
    if (PL().scene === 'ext' && !slept){ /* stay where you are */ }
    beginDay(false);
  });
}

/* ---------------------------------------------------------------- report */
function finish(why){
  if (!M || M.over) return;
  M.over = why;
  const st = M, d = st.stats, ok = why === 'done';
  SS.game.doseClicks = 0; SS.audio.alarm(false);
  const medal = !ok ? null : st.stars >= 22 ? ['🥇', 'Gold'] : st.stars >= 13 ? ['🥈', 'Silver'] : ['🥉', 'Bronze'];
  const learn = [];
  if (d.storms){
    if (d.inShelter > d.outside && d.inShelter >= d.inHab) learn.push('You hid in the storm shelter during solar storms. Thick walls block most of the radiation, which is exactly what real crews plan to do.');
    else if (d.outside > 0) learn.push('You were outside during a solar storm. Out in the open nothing blocks the radiation, which is why crews race to shelter when a flare is spotted.');
    else learn.push('You stayed inside the habitat during solar storms. The walls helped, but the storm shelter blocks even more.');
  }
  learn.push(st.shield ? 'Your shield wall (level ' + st.shield + ') cut down the radiation every single day. Future Moon bases may pile up moondust for the same reason.' : 'You never built the shield wall. It costs battery power, but it protects the crew every day and in every storm.');
  if (d.emergencySecs > 5) learn.push('The battery ran empty and the base went on emergency power. Living on solar power means saving energy for dark times, like the long shadow on day ' + SITE_SHADOW_DAY + '.');
  else learn.push('You never ran out of power, even through the long shadow on day ' + SITE_SHADOW_DAY + '. That takes planning!');
  if (d.rescues) learn.push('Your suit ran out of air ' + d.rescues + ' time' + (d.rescues > 1 ? 's' : '') + '. Real spacewalkers always plan their walk back before they set out.');
  if (st.iceDone) learn.push('You brought back icy soil from the crater. Water ice at the Moon\'s south pole could one day give astronauts water, air and rocket fuel.');
  learn.push('Mission Control\'s messages took 1.3 seconds to arrive. On Mars it can be 22 minutes, so Mars crews must make urgent choices on their own.');
  const why2 = why === 'air' ? 'The base ran out of air &amp; food, so the crew flew home early. Nobody was hurt, but the mission ended on day ' + st.day + '.'
    : why === 'dose' ? 'The crew reached the radiation safety limit, so they flew home early to stay healthy. The mission ended on day ' + st.day + '.'
    : 'All four crew members stayed safe for ' + DAYS + ' days on the Moon.';
  const flares = st.flares.map(x => x.f);
  open('<div class="kx-report"><div class="kx-medal">' + (medal ? medal[0] : '🚀') + '</div>' +
    '<div class="kx-kick">Shackleton Base · mission report</div>' +
    '<h2>' + (ok ? medal[1] + ' mission!' : 'Crew safely home') + '</h2><p>' + why2 + '</p>' +
    '<div class="kx-stats"><div><b>' + st.stars + '</b><small>⭐ science stars</small></div><div><b>' + st.dose.toFixed(0) + '</b><small>☢️ mSv radiation</small></div><div><b>' + d.minAir.toFixed(1) + '</b><small>💨 lowest air &amp; food</small></div><div><b>' + st.shield + '</b><small>🛡️ shield level</small></div></div>' +
    '<h3>What you learned</h3><ul class="kx-learn">' + learn.map(x => '<li>' + x + '</li>').join('') + '</ul>' +
    '<h3>Real NASA data in this mission</h3><ul class="kx-learn data">' + flares.map(f => '<li>☀️ ' + esc(f.cls) + ' solar flare' + (f.date ? ', ' + fmtDate(f.date) : '') + (f.region ? ', sunspot group ' + esc(f.region) : '') + ' <small>NASA DONKI · ' + (f.source === 'live' ? 'live' : 'archived') + '</small></li>').join('') +
      '<li>☢️ Everyday Moon radiation: 1.37 mSv a day <small>Chang\'e-4 LND, 2020</small></li></ul>' +
    '<p class="kx-try">' + (ok ? 'Every mission is different: new flares, new surprises. Can you beat ' + st.stars + ' stars?' : 'Every mission is different. Try again with a new plan!') + '</p>' +
    '<div class="kx-actions row"><button type="button" class="primary" id="mxAgain">Play again</button><button type="button" id="mxMenu">Main menu</button></div></div>', 'wide');
  $('mxAgain').addEventListener('click', () => SS.game.start());
  $('mxMenu').addEventListener('click', () => SS.game.toTitle());
}

/* ---------------------------------------------------------------- HUD */
let hudT = 0;
function hud(dt){
  hudT += dt; if (hudT < 0.12) return; hudT = 0;
  const P = PL(), outside = P.scene === 'ext', p = power();
  const bar = (v, max, cls) => '<div class="kx-bar ' + cls + '"><i style="width:' + SS.clamp(v / max * 100, 0, 100).toFixed(1) + '%"></i></div>';
  const lowAir = M.air < 1.5, lowSuit = M.suit < 30;
  $('kxGauges').innerHTML =
    '<div class="kx-g' + (lowAir ? ' alert' : '') + '"><div class="kx-gh"><span>💨 Air &amp; food</span><b>' + M.air.toFixed(1) + ' days</b></div>' + bar(M.air, AIR_CAP, 'air') + '<small>' + (airRate() >= 0 ? 'Steady or growing' : 'Going down: ' + airRate().toFixed(1) + ' a day') + '</small></div>' +
    '<div class="kx-g' + (M.emergency ? ' alert' : '') + '"><div class="kx-gh"><span>🔋 Battery</span><b>' + M.batt.toFixed(0) + ' / ' + BATT_CAP + '</b></div>' + bar(M.batt, BATT_CAP, 'batt') + '<small>' + (M.emergency ? 'EMPTY: emergency power!' : (p.net >= 0 ? 'Charging +' : 'Draining ') + p.net + ' a day') + '</small></div>' +
    (outside || M.suit < 100 ? '<div class="kx-g' + (lowSuit ? ' alert' : '') + '"><div class="kx-gh"><span>🧑‍🚀 Suit air</span><b>' + M.suit.toFixed(0) + '%</b></div>' + bar(M.suit, 100, 'suit') + '<small>' + (outside ? (lowSuit ? 'Head back to the habitat!' : 'Refills inside the habitat') : 'Refilling…') + '</small></div>' : '') +
    '<div class="kx-g' + (M.dose > LIMIT * 0.6 ? ' alert' : '') + '"><div class="kx-gh"><span>☢️ Radiation</span><b>' + M.dose.toFixed(1) + ' mSv</b></div>' + bar(M.dose, LIMIT, 'dose') + '<small>Safety limit ' + LIMIT + ' mSv (millisieverts)</small></div>' +
    '<div class="kx-g row"><span>🛡️ Shield ' + [0, 1, 2].map(i => '<i class="pip' + (i < M.shield ? ' on' : '') + '"></i>').join('') + '</span><span>⭐ <b>' + M.stars + '</b>' + (M.carrying ? ' <em>+' + M.carrying + ' carrying</em>' : '') + '</span></div>';
  $('kxDay').textContent = 'Day ' + M.day + ' of ' + DAYS;
  $('kxSun').style.width = SS.clamp(M.t / DAY_LEN * 100, 0, 100).toFixed(1) + '%';
  $('kxDayIcon').textContent = M.day === SITE_SHADOW_DAY ? '🌑' : '☀️';
  /* flare banner */
  const f = M.flare, ban = $('kxBanner');
  if (f && f.phase === 'warn'){ ban.hidden = false; ban.className = 'kx-banner warn'; ban.innerHTML = '☀️ SOLAR FLARE! Radiation arrives in <b>' + clock(STORM.warn - f.t) + '</b>. ' + (P.scene === 'hab' ? (M.sheltered ? 'You are in the shelter.' : 'Go to the STORM SHELTER at the far end!') : 'GET INSIDE THE HABITAT!') + '<small>Real flare: ' + esc(f.f.cls) + (f.f.date ? ' on ' + fmtDate(f.f.date) : '') + ' · NASA DONKI ' + (f.f.source === 'live' ? '(live)' : '(archived)') + '</small>'; }
  else if (f && f.phase === 'storm'){ ban.hidden = false; ban.className = 'kx-banner storm'; ban.innerHTML = '☢️ RADIATION STORM · ends in <b>' + clock(STORM.len - f.t) + '</b> · ' + (M.sheltered ? 'Safe in the shelter' : P.scene === 'hab' ? 'Inside: walls help, the shelter helps more' : 'You are OUTSIDE!') + '<small>Storm dose so far: ' + f.dose.toFixed(1) + ' mSv</small>'; }
  else ban.hidden = true;
  /* jobs */
  const jobs = [], marks = [];
  const Mp = MAP();
  if (f && f.phase !== 'done') jobs.push(['urgent', P.scene === 'hab' ? '🛡️ Get into the storm shelter' : '🏃 Get inside the habitat!']);
  if (M.carrying) jobs.push(['', '🪨 Bring ' + M.carrying + ' sample' + (M.carrying > 1 ? 's' : '') + ' back to the habitat']);
  const left = M.rocks.filter(r => !r.done);
  if (left.length) jobs.push(['', '🪨 Collect rock samples (' + left.length + ' nearby)']);
  if (M.dusty) jobs.push(['bad', '🟫 Brush the dust off the solar panels (ridge: take the rover)']);
  if (M.pump) jobs.push(['bad', '🔧 Fix the greenhouse pump']);
  if (M.day < SITE_SHADOW_DAY) jobs.push(['', '🌑 Long shadow on day ' + SITE_SHADOW_DAY + ': save battery']);
  if (M.shield < SHIELD_MAX) jobs.push(['opt', '🛡️ Build the shield wall at the digger (' + M.shield + '/' + SHIELD_MAX + ')']);
  if (!M.iceDone) jobs.push(['opt', '🧊 Bonus: icy soil at the crater rim (far: take the rover)']);
  if (M.day === 1 && !M.sys.lab) jobs.push(['opt', '⚡ Check the power console inside']);
  $('kxJobs').innerHTML = jobs.slice(0, 6).map(j => '<li class="' + j[0] + '">' + j[1] + '</li>').join('');
  if (f && f.phase !== 'done' && outside) SS.ui.waypoint({ x: Mp.habLock.x + 1.3, z: Mp.habLock.z, label: 'HABITAT', h: 4 });
  else if (M.carrying && outside) SS.ui.waypoint({ x: Mp.habLock.x + 1.3, z: Mp.habLock.z, label: 'Habitat door', h: 4 });
  else SS.ui.waypoint(null);
  left.forEach(r => marks.push({ x: r.x, z: r.z, label: 'Rock', h: 1.6 }));
  if (M.dusty) marks.push({ x: M.arrayPos.x, z: M.arrayPos.z, label: 'Dusty panels', h: 6 });
  if (M.pump) marks.push({ x: Mp.greenhouse.x, z: Mp.greenhouse.z + 4.2, label: 'Greenhouse pump', h: 4 });
  if (M.shield < SHIELD_MAX){ const e = B().o.excavator.position; marks.push({ x: e.x, z: e.z, label: 'Digger', h: 3.5 }); }
  if (!M.iceDone) marks.push({ x: Mp.rim.x, z: Mp.rim.z, label: 'Ice', h: 2.5 });
  if (!(f && f.phase !== 'done') && !M.carrying) marks.push({ x: Mp.habLock.x + 1.3, z: Mp.habLock.z, label: 'Habitat', h: 4 });
  SS.ui.markers(marks);
  $('kxHint').innerHTML = R().boarded ? '<kbd>W</kbd><kbd>S</kbd> drive · <kbd>A</kbd><kbd>D</kbd> steer · <kbd>Space</kbd> brake · <kbd>E</kbd> get out'
    : '<kbd>W A S D</kbd> walk · <kbd>Mouse</kbd> look · <kbd>Shift</kbd> run · <kbd>Space</kbd> jump · <kbd>E</kbd> use · <kbd>L</kbd> lamp · <kbd>Esc</kbd> pause';
}

/* ---------------------------------------------------------------- overlay panels */
function open(html, cls){
  const c = $('mxCard');
  c.className = 'kx-card' + (cls ? ' ' + cls : '');
  c.innerHTML = html;
  c.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  $('mx').hidden = false; SS.game.syncUi();
  const f = c.querySelector('button.primary'); if (f) f.focus({ preventScroll: true });
}
function close(){ $('mx').hidden = true; SS.game.syncUi(); SS.game.lock(); }
MS.esc = function(){ if (!M || M.ending || M.over) return; const go = $('mxGo'); if (go) go.click(); else if ($('mxCard').querySelector('[data-close]')) close(); };

function info(html){
  $('kinfoCard').innerHTML = html + '<div class="kx-actions"><button type="button" class="primary" id="kinfoBack">Back</button></div>';
  $('kinfo').hidden = false; SS.game.syncUi();
  $('kinfoBack').addEventListener('click', MS.closeInfo);
  $('kinfoBack').focus({ preventScroll: true });
}
MS.closeInfo = function(){ $('kinfo').hidden = true; SS.game.syncUi(); };
MS.showHelp = function(){
  info('<div class="kx-kick">How to play</div><h2>Keep your crew safe for ' + DAYS + ' days</h2>' +
    '<ol class="kx-how"><li><b>Walk around the base</b> with <kbd>W A S D</kbd> and look with the mouse. Hold <kbd>Shift</kbd> to bounce-run (you weigh one sixth on the Moon!). Press <kbd>E</kbd> to use things.</li>' +
    '<li><b>💨 Air &amp; food</b> must never reach zero. Four people use one day of supplies every day. The greenhouse and water maker win some back, but they need power.</li>' +
    '<li><b>🔋 Power</b> comes from the solar panels. Choose what gets it at the <b>power console inside the habitat</b>. The science lab earns stars but uses power too. A long shadow comes on day ' + SITE_SHADOW_DAY + ', so save up!</li>' +
    '<li><b>☢️ Radiation</b> comes from space every day. When the Sun flares (real NASA flares!), you have less than a minute to get inside. The storm shelter is safest.</li>' +
    '<li><b>🧑‍🚀 Suit air</b> runs down while you are outside. Go back inside to refill it.</li>' +
    '<li><b>⭐ Stars:</b> collect rock samples and bring them home, run the lab, and fetch icy soil from the crater with the rover.</li></ol>' +
    '<p>No choice is free. Every mission is different, so if things go wrong, try a new plan!</p>');
};
MS.showData = function(){
  const N = SS.nasa, w = N.week, live = N.status === 'live';
  info('<div class="kx-kick">Real NASA data</div><h2>Where the numbers come from</h2>' +
    '<div class="kx-real ' + (live ? 'live' : 'arch') + '"><b>' + (live ? '🟢 Live: NASA DONKI space weather' : N.status === 'loading' ? '⏳ Connecting to NASA DONKI…' : '🟠 Archived: no live connection right now') + '</b><br>' +
      (live ? 'The solar flares in your mission are real flares from the past 60 days, downloaded from NASA\'s DONKI database.' + (w ? ' In the last 7 days the Sun produced <b>' + w.count + '</b> big (M- or X-class) flare' + (w.count === 1 ? '' : 's') + (w.strongest ? ', strongest ' + esc(w.strongest.cls) + ' on ' + fmtDate(w.strongest.date) : '') + '.' : '')
        : 'The game could not reach NASA DONKI' + (N.error ? ' (' + esc(N.error) + ')' : '') + ', so it uses an archive of ' + N.ARCHIVE.length + ' real, famous flares from NASA records. They are real events, just not today\'s.') + '</div>' +
    '<table class="kx-src"><tr><th>In the game</th><th>Real source</th></tr>' +
      '<tr><td>☀️ Solar flares: dates, sizes, sunspot groups</td><td>NASA DONKI space weather database (api.nasa.gov)</td></tr>' +
      '<tr><td>☢️ Everyday Moon radiation: 1.37 mSv a day</td><td>Chang\'e-4 LND, Zhang et al., Science Advances 2020</td></tr>' +
      '<tr><td>⚠️ Radiation safety limit: 250 mSv</td><td>NASA-STD-3001, 30-day limit for blood-forming organs</td></tr>' +
      '<tr><td>📡 Radio delay: 1.3 s to the Moon, up to 22 min to Mars</td><td>Speed of light over the real distances (NASA Deep Space Network)</td></tr>' +
      '<tr><td>🌑 Sunlight and long shadows at the south pole</td><td>Lunar Reconnaissance Orbiter illumination maps</td></tr>' +
      '<tr><td>🧊 Ice in dark craters</td><td>LCROSS, Colaprete et al., Science 2010</td></tr>' +
      '<tr><td>🥬 Growing food, astronaut health facts</td><td>NASA Veggie, Twins Study, Human Research Program. Explore the data at osdr.nasa.gov</td></tr>' +
      '<tr><td>🌍 Moon gravity: one sixth of Earth\'s</td><td>1.62 m/s², used by the walking and jumping in the game</td></tr>' +
    '</table>' +
    '<p class="kx-fine"><b>Simplified for the game:</b> the radiation from a solar flare is an estimate based on the flare\'s size (big flares often, but not always, cause radiation storms). Power is in game units, a base day lasts ' + clock(DAY_LEN) + ' minutes of play, and the mission lasts ' + DAYS + ' days.</p>');
};

/* ---------------------------------------------------------------- build / start / stop */
MS.build = function(){
  SS.ui.CALL.MC = { name: 'Mission Control', sub: 'Houston · 1.3 s away', color: '#62D0F5', ground: true };
  SS.ui.CALL.CREW = { name: 'Sam', sub: 'Crewmate · in the habitat', color: '#FFD37A' };
  SS.ui.CALL.EV1 = { name: 'You', sub: 'Commander', color: '#FFFFFF' };
  B().sync(gState()); B().o.berm.visible = false;            // the title screen shows the finished base
  for (let i = 0; i < 6; i++){
    const r = SS.models.boulder(0.32 + (i % 3) * 0.06, 40 + i * 7);
    r.visible = false; W().scene.add(r); rockPool.push(r);
  }
  $('kidhud').innerHTML =
    '<div class="kx-top"><div class="kx-day"><span id="kxDayIcon">☀️</span><b id="kxDay"></b><span class="kx-sunbar"><i id="kxSun"></i></span></div>' +
      '<div class="kx-radio"><span>🌍</span><span class="kx-wire"><i id="kxPulse"></i></span><span>🌕</span><small>1.3 s radio delay</small></div></div>' +
    '<div class="kx-gauges" id="kxGauges"></div>' +
    '<aside class="kx-jobs"><div class="kx-kick">Today\'s jobs</div><ul id="kxJobs"></ul></aside>' +
    '<div class="kx-banner" id="kxBanner" hidden></div>' +
    '<div class="kx-hint" id="kxHint"></div>';
};
MS.start = function(){
  MS.stop(true);
  M = newState(); MS.active = true;
  SS.radio.flush();
  const P = PL(), Mp = MAP(), Rv = R();
  SS.world.cable.reset([]); SS.world.clearDecals();
  Rv.place(Mp.rover.x, Mp.rover.z, -2.2); Rv.enabled = true; Rv.boarded = false; Rv.lights = false; Rv.tow = null; Rv.paying = false;
  P.resetSuit(); P.headlamp = false; P.visor = false; P.photo = false; P.mode = 'walk'; P.showTool(null);
  syncWorld();
  setupInteract();
  const sx = Mp.habLock.x + 3.4, sz = Mp.habLock.z - 1.5;
  P.teleport('ext', sx, sz, yawTo(sx, sz, 12, 4));
  SS.npc.place(sx + 1.5, sz + 2.5, 0); SS.npc.set('follow');
  SS.interior.hab.setMode('on');
  const iv = SS.interior.hab.iv; iv.group.position.set(-0.5, 0, 0.62); iv.group.rotation.y = Math.PI; iv.group.visible = true;   // Sam stands clear of the radio desk
  beginDay(true);
  open('<div class="kx-kick">Moon Base Shackleton · ages 7–12</div><h2>You are the commander!</h2>' +
    '<p>You are standing on the Moon, at the rim of Shackleton crater near the south pole. Four astronauts live in this base, and for the next <b>' + DAYS + ' days</b> it is your job to keep them breathing, fed and safe from radiation, and to make discoveries.</p>' +
    '<div class="kx-keys"><div><kbd>W A S D</kbd><span>walk</span></div><div><kbd>Mouse</kbd><span>look around</span></div><div><kbd>Shift</kbd><span>bounce-run</span></div><div><kbd>Space</kbd><span>jump</span></div><div><kbd>E</kbd><span>use, pick up, get in the rover</span></div><div><kbd>Esc</kbd><span>pause</span></div></div>' +
    '<p class="kx-note">Watch the <b>jobs list</b> on the right and the markers in the world. Solar flares in this game are <b>real flares recorded by NASA</b>: when one hits, run for cover!</p>' +
    '<div class="kx-actions row"><button type="button" class="primary" id="mxGo">Start exploring ▶</button><button type="button" id="mxHow">How to play</button></div>', 'wide');
  $('mxHow').addEventListener('click', MS.showHelp);
  $('mxGo').addEventListener('click', () => { close(); (M.morning || []).forEach(t => mc(t)); M.morning = null; });
};
MS.stop = function(){
  MS.active = false;
  if (!M) return;
  M = null;
  const Rv = R();
  if (Rv.boarded){ Rv.boarded = false; PL().mode = 'walk'; }
  Rv.enabled = false; Rv.lights = false;
  SS.interact.items = SS.interact.items.filter(i => i.id === 'ltv-board');
  rockPool.forEach(r => { r.visible = false; });
  SS.npc.set('hidden');
  SS.ui.waypoint(null); SS.ui.markers([]);
  SS.radio.flush();
  SS.game.doseClicks = 0; SS.audio.alarm(false);
  $('mx').hidden = true;
  PL().teleport('ext', 0, 0, 0);
  MS.sun('day');
  B().sync(gState()); B().o.berm.visible = false;
};
MS.state = () => M;
})();
