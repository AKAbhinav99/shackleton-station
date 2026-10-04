/* Shackleton Station — interactive panels: suit DCM, habitat PCS, traverse map, manifest/FRR, debrief. */
(function(){
'use strict';
const SS = window.SS, UI = SS.ui, $ = UI.$, esc = UI.esc;

/* =================================================================== DCM */
const D = SS.dcm = { state: { pwr: false, fan: false, o2: false, h2o: false, purge: false, comm: true }, guard: false };
const SWITCHES = [
  { id: 'pwr', lab: 'PWR', up: 'BATT', down: 'EXT' },
  { id: 'fan', lab: 'FAN', up: 'ON', down: 'OFF' },
  { id: 'o2', lab: 'O₂', up: 'ON', down: 'OFF' },
  { id: 'h2o', lab: 'H₂O', up: 'ON', down: 'OFF' },
  { id: 'purge', lab: 'PURGE', up: 'OPEN', down: 'CLSD', guard: true },
  { id: 'comm', lab: 'COMM', up: 'A', down: 'B' }
];
D.render = function(){
  const box = $('switches'); box.innerHTML = '';
  SWITCHES.forEach(s => {
    const on = !!D.state[s.id];
    const b = document.createElement('button'); b.type = 'button';
    b.className = 'sw ' + (on ? 'up' : 'down') + (s.guard ? ' guarded' + (D.guard ? ' open' : '') : '');
    b.innerHTML = '<span class="lab">' + s.lab + '</span><span class="pos">' + s.up + '</span><span class="base"><span class="bat"></span></span><span class="pos">' + s.down + '</span>';
    b.addEventListener('click', () => {
      if (s.guard && !D.guard){ D.guard = true; SS.audio.ui('toggle'); D.render(); SS.emit('dcm', { id: 'guard', value: true }); return; }
      D.state[s.id] = !D.state[s.id];
      if (s.guard && !D.state[s.id]) D.guard = false;
      SS.audio.ui('toggle');
      D.render();
      SS.emit('dcm', { id: s.id, value: D.state[s.id] });
    });
    box.appendChild(b);
  });
  D.lcd();
};
D.lcd = function(){
  const S = SS.player.suit, st = D.state;
  const cw = SS.player.cw && SS.player.cw[0];
  const l1 = cw ? (cw.lvl === 'warn' ? '*' : '-') + cw.msg.toUpperCase().slice(0, 18) : 'PWR ' + (st.pwr ? 'BATT' : 'EXT ') + '  FAN ' + (st.fan && S.fan ? 'ON ' : 'OFF');
  const l2 = 'P ' + S.pressure.toFixed(1) + ' PSI  O2 ' + (st.o2 ? Math.round(S.o2 / 4.8) + '%' : '--') + (st.purge ? ' PRG' : '');
  $('lcd1').textContent = l1; $('lcd2').textContent = l2;
};
D.setChecklist = function(page, steps, cur, foot){
  $('cuffPage').textContent = page || '';
  $('cuffList').innerHTML = (steps || []).map((s, i) => '<li class="' + (i < cur ? 'done' : i === cur ? 'cur' : '') + '">' + esc(s) + '</li>').join('');
  $('cuffFoot').textContent = foot || '';
  $('cuff').hidden = !steps;
};
D.open = function(){ if (D.isOpen) return; D.isOpen = true; D.render(); $('dcm').hidden = false; SS.game.syncUi(); SS.emit('dcm-open'); };
D.close = function(){ if (!D.isOpen) return; D.isOpen = false; $('dcm').hidden = true; SS.game.syncUi(); SS.emit('dcm-close'); };
D.toggle = function(){ if (D.isOpen) D.close(); else D.open(); };
(function(){
  const leak = $('pbLeak'); let t0 = 0;
  const down = e => { e.preventDefault(); t0 = SS.clock.ui; leak.classList.add('held'); SS.emit('leak', { down: true }); };
  const up = () => { if (!t0) return; const d = SS.clock.ui - t0; t0 = 0; leak.classList.remove('held'); SS.emit('leak', { down: false, held: d }); };
  leak.addEventListener('mousedown', down); leak.addEventListener('touchstart', down, { passive: false });
  window.addEventListener('mouseup', up); window.addEventListener('touchend', up);
  $('pbAck').addEventListener('click', () => { UI.ackCW(); SS.audio.ui('toggle'); });
})();

/* =================================================================== PCS */
const P = SS.pcs = { tab: 'eclss', isOpen: false, tabs: ['eclss', 'eps', 'rad'] };
const E = P.eclss = { rpc: false, cdra: false, wrs: false, valve: false, oga: 'off', ppO2: 19.4, co2: 5.6, devs: 0, done: false, log: [] };
P.resetEclss = function(done){
  Object.assign(E, { rpc: !!done, cdra: !!done, wrs: !!done, valve: !!done, oga: done ? 'norm' : 'off', ppO2: done ? 21.3 : 19.4, co2: done ? 2.1 : 5.6, devs: 0, done: !!done, log: [] });
};
const ESTEPS = [
  ['Close RPC-17 — power the ECLSS rack', () => E.rpc],
  ['CDRA to ACTIVE — start CO₂ removal', () => E.cdra],
  ['WRS to PROCESS — start water recovery', () => E.wrs],
  ['Open V-OGA-1 — water supply to the OGA', () => E.valve],
  ['OGA to NORMAL — start oxygen generation', () => E.oga === 'norm'],
  ['Verify ppO₂ 20.5–22.0 kPa and ppCO₂ below 4.0 mmHg', () => E.ppO2 >= 20.5 && E.ppO2 <= 22 && E.co2 < 4]
];
function status(msg, err){ const s = $('pcsStatus'); s.textContent = msg; s.className = 'pcs-status' + (err ? ' err' : ''); if (err) SS.audio.ui('err'); }
function eclssAct(id){
  if (E.done && id !== 'noop'){ status('ECLSS nominal — no action required'); return; }
  if (id !== 'rpc' && !E.rpc){ E.devs++; status('NO RESPONSE — ECLSS rack unpowered (RPC-17 open). Procedure deviation logged.', true); SS.emit('eclss', { dev: 'unpowered' }); return; }
  if (id === 'rpc'){ E.rpc = !E.rpc; status(E.rpc ? 'RPC-17 CLOSED — rack powered, 4.2 kW' : 'RPC-17 OPEN'); }
  else if (id === 'cdra'){ E.cdra = !E.cdra; status(E.cdra ? 'CDRA ACTIVE — beds cycling' : 'CDRA STANDBY'); }
  else if (id === 'wrs'){ E.wrs = !E.wrs; status(E.wrs ? 'WRS PROCESS — 93% recovery' : 'WRS STANDBY'); }
  else if (id === 'valve'){ E.valve = !E.valve; status(E.valve ? 'V-OGA-1 OPEN — 28 psi at OGA inlet' : 'V-OGA-1 CLOSED'); if (!E.valve && E.oga === 'norm'){ E.oga = 'fault'; E.devs++; status('OGA FAULT — inlet pressure lost with cell stack running', true); } }
  else if (id === 'oga'){
    if (E.oga === 'fault'){ E.oga = 'off'; status('OGA reset to OFF — fault cleared'); }
    else if (E.oga === 'norm'){ E.oga = 'off'; status('OGA OFF'); }
    else if (!E.valve){ E.oga = 'fault'; E.devs++; status('OGA FAULT — LOW INLET PRESSURE. Cell stack dry-start protection tripped. Deviation logged.', true); SS.emit('eclss', { dev: 'dry' }); }
    else { E.oga = 'norm'; status('OGA NORMAL — electrolysis 3.3 kg O₂ per sol'); }
  }
  SS.audio.ui('toggle');
  P.render();
}
function schematic(){
  const on = '#138A45', off = '#FFFFFF', fault = '#E8A317';
  const nodeFill = v => v === true || v === 'norm' ? on : v === 'fault' ? fault : off;
  const tc = v => v === true || v === 'norm' ? '#fff' : '#10151B';
  const lineC = a => a ? '#1E88E5' : '#8A939E';
  const oxy = E.oga === 'norm';
  return '<svg class="schem" viewBox="0 0 700 380">' +
    '<g stroke-width="4" fill="none">' +
      '<path d="M130 250 H250" stroke="' + lineC(E.valve) + '"/>' +
      '<path d="M290 250 H380" stroke="' + lineC(E.valve && oxy) + '"/>' +
      '<path d="M480 250 H560 V200" stroke="' + lineC(oxy) + '"/>' +
      '<path d="M560 140 V95 H480" stroke="' + lineC(E.cdra) + '"/>' +
      '<path d="M380 95 H300" stroke="' + lineC(E.cdra) + '"/><path d="M300 95 V60" stroke="' + lineC(E.cdra) + '" stroke-dasharray="6 5"/>' +
      '<path d="M600 170 H650 V330 H80 V290" stroke="' + lineC(E.wrs) + '"/>' +
    '</g>' +
    '<g stroke="#8A939E" stroke-width="2" stroke-dasharray="4 4" fill="none"><path d="M40 40 H660"/></g>' +
    '<g class="node" data-n="rpc"><rect x="40" y="20" width="150" height="40" rx="3" fill="' + nodeFill(E.rpc) + '"/><text x="115" y="45" text-anchor="middle" fill="' + tc(E.rpc) + '">RPC-17 ' + (E.rpc ? 'CLOSED' : 'OPEN') + '</text></g>' +
    '<text class="lbl" x="200" y="45">120 V DC bus → ECLSS rack</text>' +
    '<g><rect x="40" y="210" width="90" height="80" rx="3" fill="#EEF1F4"/><rect x="40" y="' + (290 - 60) + '" width="90" height="60" fill="#9CC3E8"/><text x="85" y="200" text-anchor="middle">WATER</text><text class="lbl" x="85" y="306" text-anchor="middle">potable bus</text></g>' +
    '<g class="node" data-n="valve"><circle cx="270" cy="250" r="20" fill="' + nodeFill(E.valve) + '"/><path d="M258 238 L282 262 M282 238 L258 262" stroke="' + (E.valve ? '#fff' : '#10151B') + '" stroke-width="3" transform="rotate(' + (E.valve ? 45 : 0) + ' 270 250)"/><text x="270" y="290" text-anchor="middle">V-OGA-1</text></g>' +
    '<g class="node" data-n="oga"><rect x="380" y="220" width="100" height="60" rx="3" fill="' + nodeFill(E.oga) + '"/><text x="430" y="245" text-anchor="middle" fill="' + tc(E.oga) + '">OGA</text><text x="430" y="266" text-anchor="middle" class="lbl" fill="' + tc(E.oga) + '">' + (E.oga === 'norm' ? 'NORMAL' : E.oga === 'fault' ? 'FAULT' : 'OFF') + '</text></g>' +
    '<text class="lbl" x="430" y="300" text-anchor="middle">H₂O → O₂ + H₂</text>' +
    '<g class="node" data-n="cdra"><rect x="380" y="65" width="100" height="60" rx="3" fill="' + nodeFill(E.cdra) + '"/><text x="430" y="90" text-anchor="middle" fill="' + tc(E.cdra) + '">CDRA</text><text x="430" y="111" text-anchor="middle" class="lbl" fill="' + tc(E.cdra) + '">' + (E.cdra ? 'ACTIVE' : 'STANDBY') + '</text></g>' +
    '<text class="lbl" x="300" y="55" text-anchor="middle">CO₂ vent</text>' +
    '<g><circle cx="560" cy="170" r="42" fill="#F6F8FA" stroke="#1D2733" stroke-width="1.5"/><text x="560" y="164" text-anchor="middle">CABIN</text><text class="lbl" x="560" y="182" text-anchor="middle">4 crew</text></g>' +
    '<g class="node" data-n="wrs"><rect x="160" y="310" width="120" height="44" rx="3" fill="' + nodeFill(E.wrs) + '"/><text x="220" y="337" text-anchor="middle" fill="' + tc(E.wrs) + '">WRS ' + (E.wrs ? 'PROCESS' : 'STANDBY') + '</text></g>' +
    '<text class="lbl" x="400" y="345">condensate + urine → potable (93%)</text>' +
  '</svg>';
}
function gauges(){
  const g = (n, x, cls) => '<div class="gauge"><div class="n">' + n + '</div><div class="x ' + cls + '">' + x + '</div></div>';
  return '<div class="gauges">' +
    g('ppO₂', E.ppO2.toFixed(1) + ' kPa', E.ppO2 >= 20.5 && E.ppO2 <= 22 ? 'ok' : E.ppO2 < 19.5 ? 'bad' : 'caut') +
    g('ppCO₂', E.co2.toFixed(1) + ' mmHg', E.co2 < 4 ? 'ok' : E.co2 > 6 ? 'bad' : 'caut') +
    g('Cabin', '14.7 psi', '') +
    g('Rack load', (E.rpc ? (0.4 + (E.cdra ? 1.2 : 0) + (E.wrs ? 0.9 : 0) + (E.oga === 'norm' ? 1.7 : 0)).toFixed(1) : '0.0') + ' kW', '') + '</div>';
}
function eclssProc(){
  let cur = ESTEPS.findIndex(s => !s[1]());
  if (cur === -1) cur = ESTEPS.length;
  const items = ESTEPS.map((s, i) => '<li class="' + (s[1]() && i < cur ? 'done' : i === cur ? 'cur' : '') + '">' + esc(s[0]) + '</li>').join('');
  const ready = ESTEPS.every(s => s[1]());
  return '<h4>ECLSS ACTIVATION</h4><div class="pid">PROC 2.104 · SURFACE HAB 1 · REV C</div><ol>' + items + '</ol>' +
    (E.done ? '<div class="warnbox" style="background:#DDF3E5;border-color:#138A45">Loop closed. Reported to Houston.</div>'
      : '<button class="pcsbtn go" id="eclssReport" type="button"' + (ready ? '' : ' disabled') + '>Report loop closed</button>') +
    '<div class="warnbox"><b>Caution:</b> never start the OGA cell stack without inlet water pressure. A dry start trips pump protection and costs a restart.</div>' +
    (E.devs ? '<div class="warnbox">Procedure deviations this activation: ' + E.devs + '</div>' : '');
}

P.policy = null;
function epsView(){
  const G = SS.game, O = SS.outpost, C = O.C, man = G.man, dec = G.dec;
  const pol = P.policy || (P.policy = JSON.parse(JSON.stringify(dec.policy)));
  const genNow = O.generation(man, dec, G.sol);
  const nightSol = G.sol <= 17 ? 13 : 31;
  const genDark = O.generation(man, dec, nightSol);
  const cap = O.capacity(man, dec, G.sol);
  const soc = cap ? G.out.batt / cap : 0;
  const tgl = (key, disabled) => '<span class="tgl"><button type="button" data-pol="' + key + ':on" class="' + (pol[key] === 'on' ? 'on' : '') + '"' + (disabled ? ' disabled' : '') + '>RUN</button><button type="button" data-pol="' + key + ':shed" class="' + (pol[key] === 'shed' ? 'on shed' : '') + '"' + (disabled ? ' disabled' : '') + '>SHED</button></span>';
  const rows = [
    ['Habitat housekeeping', C.HAB_KW, 'Critical — thermal, avionics, lighting', '<b>RUN</b>'],
    ['ECLSS rack', C.ECLSS_KW, 'Critical — CO₂ removal, O₂ generation', '<b>RUN</b>'],
    ['Ice processing plant', man.isru ? C.ISRU_KW : 0, man.isru ? '+' + C.ISRU_WATER.toFixed(1) + ' kg water per sol' : 'Not manifested', man.isru ? tgl('isru') : '—'],
    ['Crop production', man.greenhouse ? C.GH_KW : 0, man.greenhouse ? '−' + C.GH_FOOD + ' kg stored food per sol' : 'Not manifested', man.greenhouse ? tgl('greenhouse') : '—']
  ];
  const dec2 = Object.assign({}, dec, { policy: pol });
  const toSol = P.projectTo || Math.min(G.out.endSol, nightSol + 6);
  const proj = O.project(man, dec2, toSol, G.out);
  const hist = proj.history.filter(h => h.sol >= G.sol);
  const unpowered = proj.violations.filter(v => v.id === 'FR-3' && v.sol > G.sol).reduce((a, v) => a + v.count, 0);
  const minSoc = hist.reduce((a, h) => Math.min(a, h.soc === undefined ? 1 : h.soc), 1);
  let h = '<table class="eps"><tr><th>Load</th><th>kW</th><th>Effect</th><th>Darkness table</th></tr>' +
    rows.map(r => '<tr><td>' + r[0] + '</td><td class="n">' + (r[1] ? r[1].toFixed(1) : '—') + '</td><td>' + r[2] + '</td><td>' + r[3] + '</td></tr>').join('') + '</table>';
  h += '<div class="gauges">' +
    '<div class="gauge"><div class="n">Generation now</div><div class="x">' + genNow.toFixed(1) + ' kW</div></div>' +
    '<div class="gauge"><div class="n">In darkness</div><div class="x ' + (genDark < C.HAB_KW + C.ECLSS_KW ? 'bad' : 'ok') + '">' + genDark.toFixed(1) + ' kW</div></div>' +
    '<div class="gauge"><div class="n">Storage</div><div class="x">' + (cap ? Math.round(soc * 100) + '% of ' + cap : 'none') + '</div></div>' +
    '<div class="gauge"><div class="n">Critical bus short</div><div class="x ' + (unpowered ? 'bad' : 'ok') + '">' + unpowered + (unpowered === 1 ? ' sol' : ' sols') + '</div></div></div>';
  h += '<canvas id="epsChart" width="720" height="190"></canvas>';
  h += '<div style="font-size:12.5px;color:#4A5563;margin-top:6px">Projection to sol ' + toSol + ' with this load table (darkness shaded, red ticks mark sols with the habitat unpowered). Minimum storage ' + Math.round(minSoc * 100) + '%.</div>';
  if (P.projectTo){
    const rat = !!G.dec.rations;
    h += '<table class="eps" style="margin-top:10px"><tr><th>Contingency consumables</th><th>Effect</th><th>Plan</th></tr><tr><td>Crew rations</td><td>Intake −15% after sol 30. Flight surgeon accepts it for up to 30 days; performance and morale cost.</td><td><span class="tgl"><button type="button" data-rat="0" class="' + (rat ? '' : 'on') + '">NOMINAL</button><button type="button" data-rat="1" class="' + (rat ? 'on shed' : '') + '">CONTINGENCY</button></span></td></tr></table>';
    const f = (v, s) => Math.max(0, Math.round(v)) + ' kg (' + Math.round(v / s * 100) + '%)';
    h += '<div class="gauges">' +
      '<div class="gauge"><div class="n">O₂ · sol ' + toSol + '</div><div class="x ' + (proj.o2 / C.START.o2 < 0.2 ? 'bad' : 'ok') + '">' + f(proj.o2, C.START.o2) + '</div></div>' +
      '<div class="gauge"><div class="n">Water · sol ' + toSol + '</div><div class="x ' + (proj.water / C.START.water < 0.2 ? 'bad' : 'ok') + '">' + f(proj.water, C.START.water) + '</div></div>' +
      '<div class="gauge"><div class="n">Food · sol ' + toSol + '</div><div class="x ' + (proj.food / C.START.food < 0.2 ? (proj.food <= 0 ? 'bad' : 'caut') : 'ok') + '">' + f(proj.food, C.START.food) + '</div></div>' +
      '<div class="gauge"><div class="n">Outcome</div><div class="x ' + (proj.over && !proj.over.ok ? 'bad' : 'ok') + '">' + (proj.over && !proj.over.ok ? 'Fails sol ' + proj.sol : 'Holds') + '</div></div></div>';
  }
  setTimeout(() => {
    const cv = $('epsChart'); if (!cv) return;
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, p = 28;
    g.fillStyle = '#EEF1F4'; g.fillRect(0, 0, W, H);
    const s0 = G.sol, s1 = Math.max(s0 + 1, hist[hist.length - 1].sol);
    const X = s => p + (W - p - 10) * (s - s0) / (s1 - s0), Y = v => 10 + (H - 40) * (1 - v);
    g.fillStyle = 'rgba(40,50,110,.14)'; C.NIGHTS.forEach(n => { if (n[1] >= s0 && n[0] <= s1) g.fillRect(X(Math.max(s0, n[0] - 0.5)), 10, X(Math.min(s1, n[1] + 0.5)) - X(Math.max(s0, n[0] - 0.5)), H - 40); });
    g.strokeStyle = '#9AA2AC'; g.beginPath(); g.moveTo(p, Y(0)); g.lineTo(W - 10, Y(0)); g.stroke();
    g.fillStyle = '#4A5563'; g.font = '11px IBM Plex Mono'; g.fillText('100%', 0, Y(1) + 4); g.fillText('0%', 6, Y(0) + 4);
    g.strokeStyle = '#B26B00'; g.lineWidth = 2.5; g.beginPath();
    hist.forEach((q, i) => { const x = X(q.sol), y = Y(q.soc === undefined ? 0 : q.soc); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    proj.history.forEach(q => { if (q.sol > s0 && proj.violations.some(v => v.id === 'FR-3' && q.sol >= v.sol && q.sol <= v.last)){ g.fillStyle = '#C43A2A'; g.fillRect(X(q.sol) - 3, H - 26, 6, 10); } });
    for (let s = s0; s <= s1; s += 2){ g.fillStyle = '#4A5563'; g.fillText('S' + s, X(s) - 8, H - 4); }
  }, 0);
  return h;
}
function epsProc(){
  const G = SS.game;
  const trip = G.dec.battBTrip && !G.flags.battFixed;
  return '<h4>DARKNESS LOAD TABLE</h4><div class="pid">EPS 4.2 · LOAD SHED PRIORITY</div>' +
    '<ol><li>Critical loads (habitat, ECLSS) are never shed by the table.</li><li>Choose which loads run through darkness.</li><li>Check the projection: storage must carry the habitat to sunrise.</li><li>Load the table to the EPS controller.</li></ol>' +
    (trip ? '<div class="warnbox"><b>STRING B TRIPPED</b> — overtemperature. Storage capacity reduced until the breaker is reset at the yard.</div>' : '') +
    '<button class="pcsbtn go" id="epsCommit" type="button">Load table to EPS</button>' +
    '<div class="warnbox" style="background:#EEF1F4;border-color:#6B737D">When storage is exhausted the controller sheds automatically in priority order: crops, ISRU, ECLSS, habitat. By then you have already lost the choice.</div>';
}
function radView(){
  const G = SS.game, O = SS.outpost, C = O.C, man = G.man;
  const sh = O.shield(man, G.sol);
  const h = G.out.history;
  let s = '<div class="gauges">' +
    '<div class="gauge"><div class="n">Crew dose</div><div class="x">' + G.out.dose.toFixed(1) + ' mSv</div></div>' +
    '<div class="gauge"><div class="n">EV1 personal</div><div class="x">' + (G.out.dose + (G.dec.ev1Extra || 0) + SS.player.suit.dose).toFixed(1) + ' mSv</div></div>' +
    '<div class="gauge"><div class="n">30-day limit</div><div class="x">' + C.DOSE_LIMIT + ' mSv</div></div>' +
    '<div class="gauge"><div class="n">Habitat SPE factor</div><div class="x">×' + sh.spe.toFixed(2) + '</div></div></div>';
  s += '<table class="eps" style="margin-top:12px"><tr><th>Shielding available</th><th>GCR factor</th><th>SPE factor</th></tr>' +
    '<tr><td>' + (man.hab === 'metal' ? 'Metallic habitat' : 'Inflatable habitat') + '</td><td class="n">' + (man.hab === 'metal' ? '0.60' : '0.85') + '</td><td class="n">' + (man.hab === 'metal' ? '0.45' : '0.85') + '</td></tr>' +
    (man.excavator ? '<tr><td>Regolith berm ' + (G.sol >= C.BERM_SOL ? '(complete)' : '(in work)') + '</td><td class="n">×0.41</td><td class="n">0.035</td></tr>' : '') +
    (man.shelter ? '<tr><td>Storm shelter</td><td class="n">0.40</td><td class="n">0.05</td></tr>' : '') + '</table>';
  s += '<div style="margin-top:14px"><button class="pcsbtn go" id="radShelter" type="button"' + (G.flags.sprAvailable ? '' : ' disabled') + '>' + (G.flags.sheltered ? 'Crew in shelter' : 'Command crew to storm shelter') + '</button></div>';
  return s;
}
P.render = function(){
  const tab = P.tab;
  document.querySelectorAll('#pcsTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('#pcsTabs button').forEach(b => b.hidden = P.tabs.indexOf(b.dataset.tab) === -1);
  $('pcsTitle').textContent = 'PCS — ' + { eclss: 'ECLSS', eps: 'Electrical Power', rad: 'Radiation' }[tab] + ' · Surface Habitat 1';
  if (tab === 'eclss'){ $('pcsMain').innerHTML = schematic() + gauges(); $('pcsProc').innerHTML = eclssProc(); }
  else if (tab === 'eps'){ $('pcsMain').innerHTML = epsView(); $('pcsProc').innerHTML = epsProc(); }
  else { $('pcsMain').innerHTML = radView(); $('pcsProc').innerHTML = '<h4>SPACE WEATHER</h4><div class="pid">RAD 1.3 · SRAG CONSOLE DATA</div><p style="font-size:13px;line-height:1.5">Solar particle events are mostly protons, stopped efficiently by mass. Cosmic rays are not. That is why a few metres of regolith or a water-walled shelter make the difference during an event and much less the rest of the time.</p>'; }
  $('pcsMain').querySelectorAll('.node').forEach(n => n.addEventListener('click', () => eclssAct(n.dataset.n)));
  const rep = $('eclssReport'); if (rep) rep.addEventListener('click', () => { E.done = true; SS.audio.ui('ok'); status('LOOP CLOSED — reported to Houston'); P.render(); SS.emit('eclss-done', { devs: E.devs }); });
  $('pcsMain').querySelectorAll('[data-pol]').forEach(b => b.addEventListener('click', () => { const [k, v] = b.dataset.pol.split(':'); P.policy[k] = v; SS.audio.ui('toggle'); P.render(); }));
  $('pcsMain').querySelectorAll('[data-rat]').forEach(b => b.addEventListener('click', () => { SS.game.dec.rations = b.dataset.rat === '1'; SS.audio.ui('toggle'); P.render(); }));
  const cm = $('epsCommit'); if (cm) cm.addEventListener('click', () => { SS.game.dec.policy = JSON.parse(JSON.stringify(P.policy)); SS.audio.ui('ok'); status('LOAD TABLE ACCEPTED BY EPS CONTROLLER'); SS.emit('eps-commit', SS.game.dec.policy); });
  const sb = $('radShelter'); if (sb) sb.addEventListener('click', () => { SS.emit('shelter-cmd'); P.render(); });
};
P.open = function(tab, tabs){ P.tabs = tabs || P.tabs; P.tab = tab || P.tab; P.policy = null; P.isOpen = true; P.render(); $('pcs').hidden = false; SS.game.syncUi(); };
P.close = function(){ P.isOpen = false; $('pcs').hidden = true; SS.game.syncUi(); SS.emit('pcs-close'); };
document.querySelectorAll('#pcsTabs button').forEach(b => b.addEventListener('click', () => { P.tab = b.dataset.tab; P.render(); }));
P.tick = function(dt){
  if (E.rpc && E.cdra) E.co2 = SS.damp(E.co2, 2.1, 0.35, dt); else E.co2 += dt * 0.02;
  if (E.rpc && E.oga === 'norm') E.ppO2 = SS.damp(E.ppO2, 21.3, 0.4, dt); else E.ppO2 -= dt * 0.004;
  if (P.isOpen && P.tab === 'eclss'){
    P._t = (P._t || 0) + dt;
    if (P._t > 0.25){ P._t = 0; const g = $('pcsMain').querySelector('.gauges'); if (g) g.outerHTML = gauges(); const ready = ESTEPS.every(s => s[1]()); const btn = $('eclssReport'); if (btn && btn.disabled === ready) P.render(); }
  }
};

/* =================================================================== map */
const MP = SS.map = { isOpen: false, mode: 'view', pick: null, range: 330 };
let hill = null;
function buildHill(){
  const W = SS.world, N = 256, c = SS.canvas(N, N), g = c.getContext('2d'), img = g.createImageData(N, N);
  const R = MP.range;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++){
    const x = -R + (i + 0.5) / N * 2 * R, z = -R + (j + 0.5) / N * 2 * R;
    const gr = W.grad(x, z);
    const nx = -gr.x, nz = -gr.z, l = Math.hypot(nx, 1, nz);
    const lx = -0.5, ly = 0.7, lz = -0.5;
    let sh = (nx * lx + ly + nz * lz) / l / Math.hypot(lx, ly, lz);
    let v = 30 + sh * 150 + W.H(x, z) * 1.6;
    let r = v, gg = v, b = v * 1.02;
    if (W.isPSR(x, z)){ r = r * 0.45 + 18; gg = gg * 0.45 + 20; b = b * 0.5 + 60; }
    const k = (j * N + i) * 4;
    img.data[k] = SS.clamp(r, 0, 255); img.data[k + 1] = SS.clamp(gg, 0, 255); img.data[k + 2] = SS.clamp(b, 0, 255); img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  hill = c;
}
MP.draw = function(){
  if (!hill) buildHill();
  const cv = $('mapCanvas'), g = cv.getContext('2d'), S = cv.width, R = MP.range;
  const X = x => (x + R) / (2 * R) * S, Z = z => (z + R) / (2 * R) * S;
  g.imageSmoothingEnabled = true;
  g.drawImage(hill, 0, 0, S, S);
  const G = SS.game, M = SS.MAP, PL = SS.player;
  g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,.07)';
  for (let v = -300; v <= 300; v += 100){ g.beginPath(); g.moveTo(X(v), 0); g.lineTo(X(v), S); g.stroke(); g.beginPath(); g.moveTo(0, Z(v)); g.lineTo(S, Z(v)); g.stroke(); }
  /* track + cable */
  if (G.track && G.track.length > 1){ g.strokeStyle = 'rgba(255,255,255,.45)'; g.setLineDash([3, 4]); g.beginPath(); G.track.forEach((p, i) => i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z))); g.stroke(); g.setLineDash([]); }
  const cab = SS.world.cable.pts;
  if (cab.length > 1){ g.strokeStyle = '#E0561B'; g.lineWidth = 2.5; g.beginPath(); cab.forEach((p, i) => i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z))); g.stroke(); }
  /* sites */
  g.font = '600 12px "Barlow Condensed", sans-serif'; g.textAlign = 'left';
  M.sites.forEach(s => {
    const chosen = G.dec.siteId === s.id;
    g.strokeStyle = chosen ? '#56D68E' : '#FFB020'; g.lineWidth = 2;
    g.beginPath(); g.arc(X(s.x), Z(s.z), 7, 0, 7); g.stroke();
    g.fillStyle = '#fff'; g.fillText(s.label + '  ' + (s.kind === 'ridge' ? '86%' : '62%'), X(s.x) + 10, Z(s.z) + 4);
  });
  const dot = (p, col, lab, r) => { g.fillStyle = col; g.beginPath(); g.arc(X(p.x), Z(p.z), r || 5, 0, 7); g.fill(); if (lab){ g.fillStyle = 'rgba(255,255,255,.9)'; g.fillText(lab, X(p.x) + 8, Z(p.z) + 4); } };
  dot(M.lander, '#DCEFF8', 'Lander'); dot(M.hab, '#DCEFF8', 'Habitat');
  dot(M.st1, '#FFB020', 'ST-1', 4); dot(M.st2, '#FFB020', 'ST-2', 4); dot(M.yard, '#9FD3F2', 'Storage yard', 4);
  if (G.man.isru) dot(M.isru, '#9FD3F2', 'Ice plant', 4);
  dot(M.cargo, '#9FD3F2', 'Cargo pad', 4);
  const rpos = MP.mode === 'reactor' && MP.pick ? MP.pick : G.dec.reactor;
  if (rpos && G.man.fsp){
    g.strokeStyle = 'rgba(255,75,58,.8)'; g.setLineDash([5, 4]); g.lineWidth = 1.5;
    g.beginPath(); g.arc(X(rpos.x), Z(rpos.z), 100 / (2 * R) * S, 0, 7); g.stroke(); g.setLineDash([]);
    dot(rpos, '#FF4B3A', 'FSP-1', 5);
  }
  if (SS.rover && SS.rover.group){ g.fillStyle = '#62D0F5'; g.fillRect(X(SS.rover.x) - 4, Z(SS.rover.z) - 4, 8, 8); }
  if (SS.npc && SS.npc.mode !== 'hidden'){ g.fillStyle = '#B6E86F'; g.beginPath(); g.arc(X(SS.npc.x), Z(SS.npc.z), 3.5, 0, 7); g.fill(); }
  if (UI.wp){ g.save(); g.translate(X(UI.wp.x), Z(UI.wp.z)); g.rotate(Math.PI / 4); g.strokeStyle = '#FF5A1F'; g.lineWidth = 2.5; g.strokeRect(-6, -6, 12, 12); g.restore(); }
  if (PL.scene === 'ext'){
    g.save(); g.translate(X(PL.x), Z(PL.z)); g.rotate(-PL.yaw + Math.PI);
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, 9); g.lineTo(6, -6); g.lineTo(-6, -6); g.closePath(); g.fill(); g.restore();
  }
  /* north + scale */
  g.fillStyle = '#fff'; g.font = '700 14px "Barlow Condensed", sans-serif'; g.fillText('N', S - 26, 26);
  g.beginPath(); g.moveTo(S - 22, 32); g.lineTo(S - 26, 44); g.lineTo(S - 18, 44); g.fill();
  const sb = 100 / (2 * R) * S;
  g.fillRect(20, S - 26, sb, 3); g.font = '11px "IBM Plex Mono", monospace'; g.fillText('100 m', 20, S - 32);
};
MP.open = function(opts){
  opts = opts || {};
  MP.mode = opts.mode || 'view'; MP.pick = null; MP.onPick = opts.onPick || null;
  MP.isOpen = true;
  $('mapTitle').textContent = opts.title || 'Shackleton connecting ridge';
  $('mapInfo').textContent = opts.info || 'Array sites show annual sunlight from LOLA-style illumination mapping. Ridge sites keep partial sun through the darkness gaps; the flats do not. The blue region is permanent shadow.';
  $('mapActions').innerHTML = '';
  MP.draw();
  $('map').hidden = false; SS.game.syncUi();
};
MP.close = function(){ if (!MP.isOpen) return; if (MP.mode === 'reactor' && MP.mustPick) return; MP.isOpen = false; $('map').hidden = true; SS.game.syncUi(); };
$('mapCanvas').addEventListener('click', e => {
  if (MP.mode !== 'reactor') return;
  const r = e.target.getBoundingClientRect(), S = MP.range;
  const x = ((e.clientX - r.left) / r.width) * 2 * S - S, z = ((e.clientY - r.top) / r.height) * 2 * S - S;
  const W = SS.world, M = SS.MAP, G = SS.game;
  let err = '';
  if (W.isPSR(x, z) || SS.dist(x, z, M.crater.x, M.crater.z) < M.crater.r + 10) err = 'Inside the crater — no emplacement in permanent shadow.';
  else if (Math.hypot(W.grad(x, z).x, W.grad(x, z).z) > 0.25) err = 'Slope too steep for the emplacement rover.';
  else if (SS.dist(x, z, M.hab.x, M.hab.z) < 18 || SS.dist(x, z, M.lander.x, M.lander.z) < 18) err = 'Too close to crewed hardware to emplace safely.';
  if (err){ $('mapInfo').textContent = err; SS.audio.ui('err'); return; }
  MP.pick = { x, z };
  const d = SS.dist(x, z, M.hab.x, M.hab.z), dose = SS.outpost.C.REACTOR_K / (d * d);
  $('mapInfo').innerHTML = '<b>' + Math.round(d) + ' m</b> from the habitat. Dose at the habitat ' + dose.toFixed(2) + ' mSv/sol — ' +
    (d >= 100 ? '<span style="color:var(--ok)">outside the 100 m exclusion radius.</span>' : '<span style="color:var(--warn)">inside the exclusion radius (FR-5).</span>') +
    ' Cable run ' + Math.round(d * 1.15) + ' m.';
  $('mapActions').innerHTML = '<button class="btn" id="mapConfirm" type="button">Confirm emplacement</button>';
  $('mapConfirm').addEventListener('click', () => { const p = MP.pick; MP.mustPick = false; MP.close(); SS.audio.ui('ok'); if (MP.onPick) MP.onPick(p); });
  MP.draw();
});

/* =================================================================== FRR / manifest */
const F = SS.frr = { man: null };
F.open = function(man){
  return new Promise(res => {
    F.man = JSON.parse(JSON.stringify(man));
    F.res = res;
    $('frr').hidden = false; SS.game.syncUi();
    F.render();
  });
};
F.render = function(){
  const O = SS.outpost, m = F.man, C = O.C;
  const box = $('frrItems'); box.innerHTML = '';
  O.ITEMS.forEach(it => {
    const el = document.createElement('div');
    const n = it.id === 'hab' ? 1 : (m[it.id] || 0);
    el.className = 'item' + (n ? ' on' : '');
    let ctl = '';
    if (it.choice) ctl = it.choice.map(c => '<button type="button" data-hab="' + c.id + '" class="' + (m.hab === c.id ? 'on' : '') + '">' + c.name + ' · ' + c.mass.toFixed(1) + ' t</button>').join('');
    else if (it.fixed) ctl = '<span class="cnt">1</span>';
    else if (it.max === 1) ctl = '<button type="button" data-set="' + it.id + ':0" class="' + (!n ? 'on' : '') + '">None</button><button type="button" data-set="' + it.id + ':1" class="' + (n ? 'on' : '') + '">Manifest</button>';
    else ctl = '<button type="button" data-add="' + it.id + ':-1">−</button><span class="cnt">' + n + '</span><button type="button" data-add="' + it.id + ':1">+</button>';
    const stat = it.choice ? it.choice.find(c => c.id === m.hab).stat : it.stat;
    const mass = it.choice ? it.choice.find(c => c.id === m.hab).mass : it.mass;
    el.innerHTML = '<div class="top"><span class="nm">' + it.name + '</span><span class="ms">' + mass.toFixed(1) + ' t' + (it.max > 1 ? ' each' : '') + '</span></div>' +
      '<div class="st">' + stat + '</div><div class="ds">' + it.desc + '</div><div class="src">' + it.src + '</div>' +
      '<div class="ctl">' + ctl + (it.required ? '<span class="req">REQUIRED</span>' : '') + '</div>';
    box.appendChild(el);
  });
  box.querySelectorAll('[data-hab]').forEach(b => b.addEventListener('click', () => { m.hab = b.dataset.hab; SS.audio.ui('toggle'); F.render(); }));
  box.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', () => { const [k, v] = b.dataset.set.split(':'); m[k] = +v; SS.audio.ui('toggle'); F.render(); }));
  box.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => { const [k, v] = b.dataset.add.split(':'); const it = O.ITEMS.find(i => i.id === k); m[k] = SS.clamp((m[k] || 0) + (+v), 0, it.max); SS.audio.ui('toggle'); F.render(); }));
  const mass = O.mass(m), over = mass > C.BUDGET;
  $('frrMass').textContent = mass.toFixed(1) + ' t';
  $('frrMassBar').style.width = Math.min(100, mass / C.BUDGET * 100) + '%';
  $('frrLeft').textContent = over ? 'Over by ' + (mass - C.BUDGET).toFixed(1) + ' t' : (C.BUDGET - mass).toFixed(1) + ' t unallocated';
  document.querySelector('.massmeter').classList.toggle('over', over);
  const r = O.frr(m), p = r.projection;
  UI.drawSeries($('frrChart'), p.history, C.EXTENDED, !!m.battery);
  const genDark = O.generation(m, { siteKind: 'ridge', policy: {} }, 13), crit = C.HAB_KW + C.ECLSS_KW;
  const kpi = (n, x, cls) => '<div class="kpi"><div class="n">' + n + '</div><div class="x ' + (cls || '') + '">' + x + '</div></div>';
  const spe = 2 * C.SPE_BFO * (m.shelter ? 0.05 : m.excavator ? 0.035 : (m.hab === 'metal' ? 0.45 : 0.85));
  $('frrKpis').innerHTML =
    kpi('Darkness bus', (genDark - crit >= 0 ? '+' : '') + (genDark - crit).toFixed(1) + ' kW', genDark >= crit ? 'ok' : m.battery ? 'caut' : 'bad') +
    kpi('Storage', m.battery * 100 + ' kWh', m.battery ? '' : 'caut') +
    kpi('Storm dose', Math.round(spe) + ' mSv', spe > 150 ? 'bad' : spe > 60 ? 'caut' : 'ok') +
    kpi('Water · sol 60', Math.max(0, Math.round(p.water)) + ' kg', p.water < 36 ? 'bad' : 'ok') +
    kpi('Food · sol 60', Math.max(0, Math.round(p.food)) + ' kg', p.food <= 0 ? 'bad' : p.food < 79 ? 'caut' : 'ok') +
    kpi('Projection', p.over && !p.over.ok ? 'Fails sol ' + p.sol : 'Holds to sol 60', p.over && !p.over.ok ? 'bad' : 'ok');
  $('frrPoll').innerHTML = r.polls.map(q => '<li><span class="c">' + q.c + '</span><span class="s ' + q.s + '">' + (q.s === 'go' ? 'GO' : q.s === 'nogo' ? 'NO-GO' : 'GO*') + '</span><span>' + esc(q.t) + '</span></li>').join('');
  const nogo = r.polls.filter(q => q.s === 'nogo').length;
  const btn = $('frrGo');
  btn.disabled = over || (!m.vsat && !m.fsp);
  btn.textContent = over ? 'Over allocation' : nogo ? 'Accept ' + nogo + ' NO-GO and fly' : 'Submit — all consoles GO';
  $('frrMsg').textContent = nogo ? 'You can fly with a NO-GO, but it will be on your record as an accepted risk.' : 'GO* marks a console that is go with a noted caution.';
  btn.onclick = () => {
    if (btn.disabled) return;
    $('frr').hidden = true; SS.game.syncUi(); SS.audio.ui('ok');
    F.res({ man: F.man, nogo, polls: r.polls });
  };
};

/* =================================================================== debrief */
SS.debrief = function(data){
  const b = $('debriefBody');
  const rateCls = r => r === 'Exceeds' ? 'ex' : r === 'Meets' ? 'me' : r === 'Needs improvement' ? 'ni' : 'un';
  const barC = r => r === 'Exceeds' ? 'var(--ok)' : r === 'Meets' ? 'var(--adv)' : r === 'Needs improvement' ? 'var(--caution)' : 'var(--warn)';
  let h = '<div class="db-head"><div class="patchslot"></div><div><div class="k">Post-sim debrief · Integrated Sim 07 · ' + esc(data.date) + '</div>' +
    '<h1>' + esc(data.headline) + '</h1><span class="rec ' + data.recCls + '">' + esc(data.rec) + '</span></div></div>';
  h += '<blockquote class="db-quote">' + esc(data.quote) + '<cite>FLIGHT — Ines Ashby, Flight Director</cite></blockquote>';
  h += '<div class="db-sec">Competency assessment</div><div class="comp">' + data.comps.map(c =>
    '<div class="c"><div class="n">' + esc(c.name) + '</div><div class="r ' + rateCls(c.rating) + '">' + esc(c.rating).toUpperCase() + '</div><div class="bar"><i style="width:' + c.score + '%;background:' + barC(c.rating) + '"></i></div><div class="e">' + esc(c.evidence) + '</div></div>').join('') + '</div>';
  h += '<div class="db-grid"><div><div class="k">Consumables and storage · % of manifest</div><canvas id="dbC1" width="560" height="220"></canvas></div><div><div class="k">Crew dose · mSv</div><canvas id="dbC2" width="560" height="220"></canvas></div></div>';
  h += '<div class="db-sec">Flight rule record</div><ul class="rules">' + data.rules.map(r => '<li class="' + (r.v ? 'v' : '') + '"><span class="id">' + r.id + '</span><span>' + esc(r.text) + (r.detail ? '<br><span class="src">' + esc(r.detail) + '</span>' : '') + '</span></li>').join('') + '</ul>';
  h += '<div class="db-sec">Engineering assessment</div><ul class="lessons">' + data.lessons.map(l => '<li class="' + l[0] + '">' + l[1] + '</li>').join('') + '</ul>';
  if (data.evas.length) h += '<div class="db-sec">EVA log</div><table class="evatable"><tr><th>EVA</th><th>Sol</th><th>Duration</th><th>Traverse</th><th>Min walkback margin</th><th>Notes</th></tr>' +
    data.evas.map(e => '<tr><td>' + e.n + '</td><td>' + e.sol + '</td><td>' + e.dur + '</td><td>' + e.dist + '</td><td>' + e.margin + '</td><td>' + esc(e.note || '') + '</td></tr>').join('') + '</table>';
  if (data.photos.length) h += '<div class="db-sec">Surface photography</div><div class="photos">' + data.photos.map(p => '<figure><img alt="' + esc(p.caption) + '" src="' + p.src + '"><figcaption>' + esc(p.caption) + ' · sol ' + p.sol + (p.ok ? '' : ' · off target') + '</figcaption></figure>').join('') + '</div>';
  h += '<div class="row-btns" style="margin-top:28px"><button class="btn" id="dbAgain" type="button">Run the sim again</button><button class="btn ghost" id="dbChapters" type="button">Chapter select</button><button class="btn ghost" id="dbSources" type="button">Data sources</button></div>';
  b.innerHTML = h;
  UI.patches();
  const G = SS.game;
  UI.drawSeries($('dbC1'), G.out.history, G.out.endSol, !!G.man.battery);
  (function(){
    const cv = $('dbC2'), g = cv.getContext('2d'), W = cv.width, H = cv.height, P = 30, C = SS.outpost.C;
    const hist = G.out.history, extra = (G.dec.ev1Extra || 0) + (data.evaDose || 0);
    const top = Math.max(C.DOSE_LIMIT, G.out.dose + extra) * 1.05;
    const X = s => P + 8 + (W - P - 14) * s / G.out.endSol, Y = v => 10 + (H - 40) * (1 - v / top);
    g.strokeStyle = 'rgba(150,196,226,.14)'; g.fillStyle = 'rgba(220,239,248,.55)'; g.font = '11px "IBM Plex Mono", monospace';
    for (let i = 0; i <= 4; i++){ const v = top * i / 4, y = Y(v); g.beginPath(); g.moveTo(P + 8, y); g.lineTo(W - 6, y); g.stroke(); g.fillText(Math.round(v), 0, y + 4); }
    g.strokeStyle = 'rgba(255,75,58,.8)'; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(P + 8, Y(C.DOSE_LIMIT)); g.lineTo(W - 6, Y(C.DOSE_LIMIT)); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#FF4B3A'; g.fillText('30-day limit', W - 110, Y(C.DOSE_LIMIT) - 6);
    g.strokeStyle = '#F5C84C'; g.lineWidth = 2.5; g.beginPath();
    hist.forEach((q, i) => { const v = q.dose + (q.sol >= 22 ? extra : 0); i ? g.lineTo(X(q.sol), Y(v)) : g.moveTo(X(q.sol), Y(v)); }); g.stroke();
    g.fillStyle = 'rgba(220,239,248,.55)'; g.fillText('sol 0', P + 8, H - 6); g.fillText('sol ' + G.out.endSol, W - 60, H - 6);
  })();
  $('debrief').hidden = false; SS.game.syncUi();
  $('dbAgain').onclick = () => SS.emit('menu', 'again');
  $('dbChapters').onclick = () => SS.emit('menu', 'chapters');
  $('dbSources').onclick = () => SS.emit('menu', 'sources');
};
})();
