/* Shackleton Station — outpost consumables, power and dose model.
   Rates are from NASA BVAD (NASA/TP-2015-218570) and the published measurements listed in SOURCES. */
(function(){
'use strict';
const SS = window.SS;
const O = SS.outpost = {};

const C = O.C = {
  CREW: 4,
  USE: { o2: 0.816, water: 3.60, food: 1.83 },
  METAB_WATER: 0.345,
  START: { o2: 60, water: 180, food: 395 },
  HAB_KW: 3.5, SURVIVAL_KW: 1.2, ECLSS_KW: 4.2, ISRU_KW: 6.0, GH_KW: 6.0,
  WATER_REC: 0.93, ELECTROLYSIS: 1.125,
  ISRU_REGOLITH: 300, ICE: 0.056, ISRU_EFF: 0.6,
  GH_FOOD: 1.8, GH_WATER: 2.0,
  VSAT_KW: 10, FSP_KW: 10, BATT_KWH: 100, DUST: 0.005,
  GCR: 1.369, SPE_BFO: 225, DOSE_LIMIT: 250, CAREER: 600,
  REACTOR_K: 900, EXCL: 100,
  ECLSS_SOL: 5, BERM_SOL: 6, GH_SOL: 4,
  NIGHTS: [[12, 17], [30, 35]], SPE: [23, 24], SLIP_SOL: 30, NOMINAL: 45, EXTENDED: 60,
  BUDGET: 26.0
};
C.ISRU_WATER = C.ISRU_REGOLITH * C.ICE * C.ISRU_EFF;

O.ITEMS = [
  { id: 'vsat', name: 'Vertical Solar Array', mass: 1.5, max: 3, unit: 'array',
    stat: '10 kW at full sun', desc: 'Stood on a 10 m mast because at the pole the sun stays within a few degrees of the horizon. Worth what its site is worth: a ridge keeps a third of output through darkness, the flats keep none.',
    src: 'NASA Vertical Solar Array Technology (VSAT), 10 kW class' },
  { id: 'fsp', name: 'Fission Surface Power', mass: 3.5, max: 1, unit: 'unit',
    stat: '10 kWe day and night', desc: 'Kilopower-derived reactor with a shadow shield. Output does not care about the sun. Dose at the habitat falls as the square of distance; flight rules want 100 m.',
    src: 'Kilopower / KRUSTY test 2018; NASA–DOE Fission Surface Power' },
  { id: 'battery', name: 'Battery Bank', mass: 1.0, max: 3, unit: 'bank',
    stat: '100 kWh each', desc: 'Two strings of lithium-ion cells with their own radiator. Storage sizing is set by the length of darkness, not by average demand.',
    src: '~150 Wh/kg cell level plus balance of system' },
  { id: 'hab', name: 'Surface Habitat', choice: [
      { id: 'inflatable', name: 'Inflatable', mass: 5.0, stat: 'GCR ×0.85 · SPE ×0.85' },
      { id: 'metal', name: 'Metallic', mass: 9.0, stat: 'GCR ×0.60 · SPE ×0.45' } ],
    required: true, desc: 'Home for four. Hull mass buys radiation protection — much more against solar protons than against cosmic rays, because GCR produces secondaries in the wall itself.',
    src: 'Scalar attenuation factors; see Data sources' },
  { id: 'eclss', name: 'Regenerative ECLSS', mass: 3.0, fixed: 1, required: true,
    stat: '93% water recovery', desc: 'Electrolysis for oxygen, CO₂ removal, water recovery. It closes the air loop by spending 1.125 kg of water per kg of oxygen.',
    src: 'ISS OGA and WRS; NASA BVAD' },
  { id: 'isru', name: 'Ice Processing Plant', mass: 4.0, max: 1, unit: 'plant',
    stat: '+10.1 kg water / sol', desc: 'Lands robotically on the crater rim. 300 kg regolith a sol × 5.6% ice × 60% extraction. Needs 6 kW and lives in permanent shadow.',
    src: 'Colaprete et al., Science 330 (2010) — LCROSS' },
  { id: 'greenhouse', name: 'Crop Production Module', mass: 3.5, max: 1, unit: 'module',
    stat: 'Displaces 1.8 kg food / sol', desc: '40 m² hydroponics under 6 kW of LEDs. It does not feed the crew; it stretches the manifest by roughly a quarter.',
    src: 'ISS VEGGIE / APH experience; 150 W/m² lighting' },
  { id: 'shelter', name: 'Storm Shelter', mass: 2.5, max: 1, unit: 'shelter',
    stat: 'SPE ×0.05', desc: 'A small volume walled with water and waste the outpost already carries. Dead mass until the sun flares.',
    src: 'Water as proton shielding; exploration architecture practice' },
  { id: 'excavator', name: 'Regolith Excavator', mass: 2.0, max: 1, unit: 'rover',
    stat: 'Berm by sol 6 · GCR ×0.41 · SPE ×0.035', desc: 'Piles 2 m of regolith over the habitat. The shielding is free; the five sols of digging are not.',
    src: '~360 g/cm² at 2 m of regolith' }
];

O.manifestDefault = function(){ return { vsat: 1, fsp: 0, battery: 0, hab: 'inflatable', eclss: 1, isru: 0, greenhouse: 0, shelter: 0, excavator: 0 }; };
O.mass = function(m){
  let t = 0;
  O.ITEMS.forEach(it => {
    if (it.id === 'hab') t += it.choice.find(c => c.id === m.hab).mass;
    else t += it.mass * (m[it.id] || 0);
  });
  return +t.toFixed(2);
};
O.decisionsDefault = function(){
  return { siteId: null, siteKind: 'ridge', reactor: null, policy: { isru: 'shed', greenhouse: 'shed' },
           battBTrip: false, sheltered: false, ev1Extra: 0, ev1Eva: 0 };
};

const isNight = O.isNight = sol => C.NIGHTS.some(n => sol >= n[0] && sol <= n[1]);
O.illum = (kind, night) => kind === 'ridge' ? (night ? 0.35 : 1.0) : (night ? 0 : 0.85);
O.habDist = function(dec){
  if (!dec.reactor) return Infinity;
  return SS.dist(dec.reactor.x, dec.reactor.z, SS.MAP.hab.x, SS.MAP.hab.z);
};
O.reactorDose = function(man, dec){
  if (!man.fsp) return 0;
  const d = Math.max(10, O.habDist(dec));
  return isFinite(d) ? C.REACTOR_K / (d * d) : 0;
};
O.shield = function(man, sol){
  const berm = man.excavator && sol >= C.BERM_SOL;
  const gcr = (man.hab === 'metal' ? 0.6 : 0.85) * (berm ? 0.41 : 1);
  const spe = berm ? 0.035 : (man.hab === 'metal' ? 0.45 : 0.85);
  return { gcr, spe, berm };
};

O.newState = function(man, dec){
  return {
    sol: 0, endSol: C.NOMINAL, slipped: false,
    o2: C.START.o2, water: C.START.water, food: C.START.food,
    batt: man.battery * C.BATT_KWH, dose: 0, darkSols: 0, maxDark: 0,
    gen: 0, demand: 0, ran: {}, minSOC: 1, over: null,
    history: [{ sol: 0, o2: 1, water: 1, food: 1, dose: 0, soc: man.battery ? 1 : 0 }],
    violations: []
  };
};
function violate(st, id, detail){
  const p = st.violations.find(v => v.id === id && v.detail === detail);
  if (p){ p.count++; p.last = st.sol; return; }
  st.violations.push({ id, detail, sol: st.sol, last: st.sol, count: 1 });
}
O.violate = violate;

O.capacity = function(man, dec, sol){
  let cap = man.battery * C.BATT_KWH;
  if (dec.battBTrip && sol >= 13 && sol <= 17) cap -= 50;
  return Math.max(0, cap);
};
O.generation = function(man, dec, sol){
  const night = isNight(sol);
  const kind = dec.siteKind || 'ridge';
  let arrays = man.vsat;
  if (dec.battBTrip && !man.battery && sol >= 13 && sol <= 17) arrays = Math.max(0, arrays - 1);
  const dust = 1 - C.DUST * (sol % 7);
  return arrays * C.VSAT_KW * O.illum(kind, night) * dust + (man.fsp ? C.FSP_KW : 0);
};

O.tick = function(st, man, dec){
  if (st.over) return;
  st.sol++;
  const sol = st.sol, night = isNight(sol), eclssOn = sol >= C.ECLSS_SOL;
  const gen = O.generation(man, dec, sol), cap = O.capacity(man, dec, sol);
  /* Hour-by-hour bus model.
     Daylight: the controller charges storage first and runs non-critical loads on what is left.
     Darkness: non-critical loads follow the load table, drawing storage down to a 10% reserve.
     Short of power, ECLSS is duty-cycled before the habitat itself goes dark. */
  const crit = eclssOn ? C.HAB_KW + C.ECLSS_KW : C.SURVIVAL_KW;
  const nonc = [];
  if (eclssOn){
    if (man.isru && !(night && dec.policy.isru === 'shed')) nonc.push('isru');
    if (man.greenhouse && sol >= C.GH_SOL && !(night && dec.policy.greenhouse === 'shed')) nonc.push('greenhouse');
  }
  const ncKW = nonc.reduce((a, k) => a + (k === 'isru' ? C.ISRU_KW : C.GH_KW), 0);
  const reserve = 0.1 * cap;
  let b = Math.min(st.batt, cap), ncH = 0, eclssH = 0, darkH = 0;
  for (let h = 0; h < 24; h++){
    let e = gen - crit, duty = 1, habOn = true;
    if (e >= 0){
      if (!night){ const ch = Math.min(e, cap - b); b += ch; e -= ch; if (ncKW) ncH += Math.min(1, e / ncKW); }
      else {
        let f = ncKW ? Math.min(1, e / ncKW) : 0;
        e -= f * ncKW;
        if (ncKW && f < 1){ const need = (1 - f) * ncKW, draw = Math.min(need, Math.max(0, b - reserve)); b -= draw; f += draw / ncKW; }
        ncH += f; b = Math.min(cap, b + e);
      }
    } else {
      const deficit = -e;
      if (night && ncKW){ const draw = Math.min(ncKW, Math.max(0, b - reserve - deficit)); b -= draw; ncH += draw / ncKW; }
      if (b >= deficit) b -= deficit;
      else {
        const short = deficit - b; b = 0;
        if (eclssOn){ duty = Math.max(0, 1 - short / C.ECLSS_KW); if (short > C.ECLSS_KW) habOn = false; }
        else habOn = false;
      }
    }
    eclssH += eclssOn ? duty : 0;
    if (!habOn) darkH++;
  }
  const frac = { eclss: eclssH / 24 };
  nonc.forEach(k => { frac[k] = ncH / 24; });
  const ran = { hab: darkH < 4, eclss: frac.eclss > 0.85 };
  nonc.forEach(k => { ran[k] = frac[k] > 0.05; });
  st.gen = gen; st.demand = crit + ncKW; st.ran = ran; st.darkHours = darkH; st.eclssDuty = frac.eclss;
  st.batt = Math.max(0, Math.min(cap, b));
  const soc = cap ? st.batt / cap : 0;
  if (cap && night) st.minSOC = Math.min(st.minSOC, soc);

  const severe = darkH >= 12 || (eclssOn && frac.eclss < 0.5);
  if (darkH >= 4) violate(st, 'FR-3', 'Habitat unpowered — CO₂ removal offline');
  else if (eclssOn && frac.eclss < 0.85) violate(st, 'FR-3', 'Critical bus short — ECLSS duty-cycled');
  if (severe){ st.darkSols++; st.maxDark = Math.max(st.maxDark, st.darkSols); } else st.darkSols = 0;
  st.shortSols = (st.shortSols || 0) + ((darkH >= 4 || (eclssOn && frac.eclss < 0.85)) ? 1 : 0);

  if (eclssOn){
    const U = C.USE, n = C.CREW, fe = frac.eclss;
    st.o2 -= n * U.o2;
    st.o2 += n * U.o2 * fe;
    st.water -= n * U.o2 * C.ELECTROLYSIS * fe;
    st.water -= n * U.water * (1 - C.WATER_REC * fe);
    st.water += n * C.METAB_WATER * fe;
    if (frac.isru) st.water += C.ISRU_WATER * frac.isru;
    if (frac.greenhouse){ st.water -= C.GH_WATER * frac.greenhouse; }
    st.food -= n * U.food * (dec.rations && sol > C.SLIP_SOL ? 0.85 : 1);
    if (frac.greenhouse) st.food += C.GH_FOOD * frac.greenhouse;
  }

  const sh = O.shield(man, sol);
  let dose = C.GCR * (eclssOn ? sh.gcr : 0.6) + (sol >= 4 ? O.reactorDose(man, dec) : 0);
  if (sol === C.SPE[0] || sol === C.SPE[1]){
    const f = (dec.sheltered && man.shelter) ? 0.05 : sh.spe;
    dose += C.SPE_BFO * f;
  }
  st.dose += dose;
  if (sol >= 4 && man.fsp && O.habDist(dec) < C.EXCL) violate(st, 'FR-5', 'Habitat inside the reactor exclusion radius (' + Math.round(O.habDist(dec)) + ' m)');

  if (eclssOn) [['Oxygen', st.o2 / C.START.o2], ['Water', st.water / C.START.water], ['Food', st.food / C.START.food]]
    .forEach(([n, f]) => { if (f < 0.2 && f > 0) violate(st, 'FR-2', n + ' reserve below 20%'); });

  if (sol === C.SLIP_SOL){ st.slipped = true; st.endSol = C.EXTENDED; }
  st.history.push({ sol, o2: st.o2 / C.START.o2, water: st.water / C.START.water, food: st.food / C.START.food, dose: st.dose, soc });

  const evDose = st.dose + (dec.ev1Extra || 0) + (dec.ev1Eva || 0);
  if (st.o2 <= 0) st.over = { ok: false, reason: 'o2' };
  else if (st.water <= 0) st.over = { ok: false, reason: 'water' };
  else if (st.food <= 0) st.over = { ok: false, reason: 'food' };
  else if (evDose >= C.DOSE_LIMIT){ violate(st, 'FR-1', 'Increment dose limit exceeded'); st.over = { ok: false, reason: 'dose' }; }
  else if (st.darkSols >= 3) st.over = { ok: false, reason: 'power' };
  else if (sol >= st.endSol) st.over = { ok: true, reason: 'complete' };
};
O.runTo = function(st, man, dec, sol){ while (!st.over && st.sol < sol) O.tick(st, man, dec); return st; };
O.clone = st => JSON.parse(JSON.stringify(st));

/* projection used by the manifest board and the EPS display */
O.project = function(man, dec, toSol, from){
  const st = from ? O.clone(from) : O.newState(man, dec);
  O.runTo(st, man, dec, toSol || C.EXTENDED);
  return st;
};

/* flight readiness review poll */
O.frr = function(man){
  const dec = Object.assign(O.decisionsDefault(), { siteKind: 'ridge', reactor: man.fsp ? { x: SS.MAP.reactorHint.x, z: SS.MAP.reactorHint.z } : null, sheltered: true });
  const p = O.project(man, dec, C.EXTENDED);
  const polls = [];
  const mass = O.mass(man);
  const gen0 = O.generation(man, dec, 14);
  const need = C.HAB_KW + C.ECLSS_KW;
  if (!man.vsat && !man.fsp) polls.push({ c: 'SPARTAN', s: 'nogo', t: 'No power generation manifested.' });
  else if (p.maxDark > 0) polls.push({ c: 'SPARTAN', s: 'nogo', t: 'Habitat bus cannot be held through a six-sol darkness gap: ' + gen0.toFixed(1) + ' kW available against ' + need.toFixed(1) + ' kW critical load' + (man.battery ? '' : ', and no storage') + '.' });
  else if (p.shortSols) polls.push({ c: 'SPARTAN', s: 'nogo', t: 'Critical bus runs short for ' + p.shortSols + ' sol' + (p.shortSols > 1 ? 's' : '') + ' of darkness — ECLSS would be duty-cycled. ' + (man.battery ? 'More storage or generation needed.' : 'No storage manifested.') });
  else if (p.minSOC < 0.2 && man.battery) polls.push({ c: 'SPARTAN', s: 'caution', t: 'Holds through darkness only by shedding loads; storage bottoms at ' + Math.round(p.minSOC * 100) + '%.' });
  else polls.push({ c: 'SPARTAN', s: 'go', t: 'Critical loads carried through darkness' + (man.battery ? ', minimum state of charge ' + Math.round(p.minSOC * 100) + '%.' : '.') });
  const water60 = p.water / C.START.water;
  if (!man.isru && (p.over && p.over.reason === 'water')) polls.push({ c: 'ETHOS', s: 'nogo', t: 'Water runs out on sol ' + p.sol + ' without ice processing.' });
  else if (!man.isru) polls.push({ c: 'ETHOS', s: 'caution', t: 'No ISRU — water balance is negative, ' + Math.max(0, Math.round(p.water)) + ' kg left at sol 60.' });
  else polls.push({ c: 'ETHOS', s: 'go', t: 'Loop closes on oxygen; ISRU carries the water balance.' });
  if (!man.shelter && !man.excavator) polls.push({ c: 'SRAG', s: 'nogo', t: 'No storm shielding. A 1972-class event would deliver about ' + Math.round(2 * C.SPE_BFO * (man.hab === 'metal' ? 0.45 : 0.85)) + ' mSv behind the habitat wall alone.' });
  else polls.push({ c: 'SRAG', s: 'go', t: (man.shelter ? 'Storm shelter' : 'Regolith berm by sol 6') + ' covers a particle event.' });
  const food60 = p.food / C.START.food;
  if (!man.greenhouse) polls.push({ c: 'SURGEON', s: 'caution', t: 'Food manifest covers 45 sols with margin, but only ' + Math.floor(C.START.food / (C.CREW * C.USE.food)) + ' sols in total. No contingency for a slip without crop production.' });
  else polls.push({ c: 'SURGEON', s: 'go', t: 'Crop production stretches food to ' + Math.floor(C.START.food / (C.CREW * C.USE.food - C.GH_FOOD)) + ' sols.' });
  polls.push({ c: 'EVA', s: 'go', t: 'Suits and LTV ready. Walkback and PLSS constraints briefed.' });
  if (mass > C.BUDGET) polls.push({ c: 'FLIGHT', s: 'nogo', t: 'Manifest exceeds the delivery allocation by ' + (mass - C.BUDGET).toFixed(1) + ' t.' });
  return { polls, projection: p };
};
})();
