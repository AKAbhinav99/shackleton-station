/* Shackleton Station — HUD, radio, flow screens and menus. */
(function(){
'use strict';
const SS = window.SS;
const UI = SS.ui = {};
const $ = id => document.getElementById(id);
UI.$ = $;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
UI.esc = esc;

/* ------------------------------------------------------------------ pausable timers */
const waits = [];
SS.after = sec => new Promise(res => waits.push({ t: SS.clock.ui + sec, res }));
SS.tickTimers = function(){
  for (let i = waits.length - 1; i >= 0; i--) if (SS.clock.ui >= waits[i].t){ const w = waits.splice(i, 1)[0]; w.res(); }
};

/* ------------------------------------------------------------------ patch */
UI.patches = function(){
  const tpl = $('patchTpl');
  document.querySelectorAll('.patchslot').forEach(s => { if (!s.firstChild) s.appendChild(tpl.content.cloneNode(true)); });
};

/* ------------------------------------------------------------------ radio */
const CALL = UI.CALL = {
  CAPCOM: { name: 'CAPCOM', sub: 'Houston · Marsh', color: '#62D0F5', ground: true },
  FLIGHT: { name: 'FLIGHT', sub: 'Houston · Ashby', color: '#FF9B6B', ground: true },
  SIMSUP: { name: 'SIM SUP', sub: 'Training · Hollis', color: '#FF6B5E', ground: true },
  IV:     { name: 'IV', sub: 'Okafor', color: '#FFD37A' },
  EV2:    { name: 'EV2', sub: 'Mori', color: '#B6E86F' },
  EV1:    { name: 'EV1', sub: 'You', color: '#FFFFFF' }
};
const R = SS.radio = { q: Promise.resolve(), gen: 0, open: null };
function caption(sp){
  const c = CALL[sp] || CALL.CAPCOM;
  const el = document.createElement('div');
  el.className = 'cap';
  el.style.borderLeftColor = c.color;
  el.innerHTML = '<div class="who" style="color:' + c.color + '">' + c.name + '<small>' + c.sub + '</small></div><div class="txt"></div>';
  const box = $('captions');
  box.appendChild(el);
  while (box.children.length > 3) box.removeChild(box.firstChild);
  return el;
}
async function line(sp, text, opts, my){
  if (opts.delay) await SS.after(opts.delay);
  if (my !== R.gen) return;
  const c = CALL[sp] || CALL.CAPCOM;
  if (c.ground) SS.audio.quindar(false); else SS.audio.squelch();
  await SS.after(c.ground ? 0.28 : 0.12);
  if (my !== R.gen) return;
  const el = caption(sp), txt = el.querySelector('.txt');
  if (R.fast){ txt.textContent = text; await SS.after(0.12); (async () => { await SS.after(4); el.remove(); })(); return; }
  const speech = (opts.noVoice || sp === 'EV1') ? Promise.resolve() : SS.audio.speak(sp, text);
  const typing = (async () => {
    for (let i = 2; i <= text.length + 2; i += 3){
      if (my !== R.gen) return;
      txt.textContent = text.slice(0, i);
      await SS.after(0.028);
    }
    txt.textContent = text;
  })();
  await Promise.all([typing, speech, SS.after(1.0 + text.length * 0.042)]);
  if (my !== R.gen) return;
  if (c.ground) SS.audio.quindar(true); else if (sp !== 'EV1') SS.audio.squelch();
  (async () => { await SS.after(opts.hold || 5); el.classList.add('fade'); await SS.after(0.7); el.remove(); })();
  await SS.after(0.35);
}
R.say = function(sp, text, opts){
  const my = R.gen;
  const job = R.q.then(() => line(sp, text, opts || {}, my));
  R.q = job.catch(() => {});
  return job;
};
R.flush = function(){
  R.gen++;
  R.q = Promise.resolve();
  SS.audio.stopSpeech();
  $('captions').innerHTML = '';
  if (R.open){ const o = R.open; R.open = null; $('choices').hidden = true; o.res(-1); }
};
R.choose = function(options, opts){
  opts = opts || {};
  const my = R.gen;
  return R.q.then(() => new Promise(res => {
    if (my !== R.gen) return res(-1);
    const box = $('choices');
    box.innerHTML = '<div class="q"><span>' + esc(opts.prompt || 'Reply on the loop') + '</span><span>Press 1–' + options.length + '</span></div>';
    options.forEach((o, i) => {
      const b = document.createElement('button'); b.type = 'button';
      b.innerHTML = '<kbd>' + (i + 1) + '</kbd><span>' + esc(o.text) + '</span>';
      b.addEventListener('click', () => pick(i));
      box.appendChild(b);
    });
    box.hidden = false;
    const t0 = SS.clock.ui;
    let timer = null;
    const pick = (i) => {
      if (!R.open) return;
      R.open = null; box.hidden = true;
      SS.audio.ui('toggle');
      const lat = SS.clock.ui - t0;
      if (i >= 0){ SS.emit('comm', { score: options[i].score || 0, latency: lat }); R.say('EV1', options[i].text); }
      else SS.emit('comm', { score: -1, latency: lat });
      res(i);
    };
    R.open = { res, pick, n: options.length };
    if (opts.timeout){ (async () => { await SS.after(opts.timeout); if (R.open && R.open.pick === pick) pick(-1); })(); }
  }));
};
SS.on('choice-key', n => { if (R.open && n >= 1 && n <= R.open.n) R.open.pick(n - 1); });

/* ------------------------------------------------------------------ objectives, notes, toasts */
UI.objective = function(title, steps, kicker){
  $('objTitle').textContent = title || '';
  if (kicker) $('objKicker').textContent = kicker;
  const ol = $('objSteps'); ol.innerHTML = '';
  (steps || []).forEach(s => { const li = document.createElement('li'); li.textContent = s; ol.appendChild(li); });
  UI.step(0);
};
UI.step = function(i){
  [...$('objSteps').children].forEach((li, k) => { li.className = k < i ? 'done' : k === i ? 'cur' : ''; });
};
let noteTimer = 0;
UI.note = function(text, src, dur){
  $('noteTxt').textContent = text; $('noteSrc').textContent = src || '';
  $('note').hidden = false;
  const my = ++noteTimer;
  SS.after(dur || 20).then(() => { if (my === noteTimer) $('note').hidden = true; });
};
UI.hideNote = () => { $('note').hidden = true; };
UI.toast = function(msg, kind){
  const t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = msg;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 3800);
};

/* ------------------------------------------------------------------ waypoints */
UI.wp = null; UI.minor = [];
UI.waypoint = function(w){ UI.wp = w; };
UI.markers = function(list){ UI.minor = list || []; };
const wpEls = [];
function wpEl(i){ if (!wpEls[i]){ const e = document.createElement('div'); e.className = 'wp'; e.innerHTML = '<i></i><span class="l"></span><span class="d"></span>'; $('markers').appendChild(e); wpEls[i] = e; } return wpEls[i]; }
const vtmp = new THREE.Vector3();
function drawMarkers(){
  const PL = SS.player, cam = SS.world.camera;
  const list = [];
  if (UI.wp && PL.scene === 'ext' && (UI.wp.scene || 'ext') === 'ext') list.push(Object.assign({ main: true }, UI.wp));
  if (PL.scene === 'ext') UI.minor.forEach(m => list.push(m));
  const W = innerWidth, H = innerHeight;
  list.forEach((m, i) => {
    const e = wpEl(i);
    const y = m.y !== undefined ? m.y : SS.world.H(m.x, m.z) + (m.h || 2.4);
    vtmp.set(m.x, y, m.z).project(cam);
    let sx = (vtmp.x * 0.5 + 0.5) * W, sy = (-vtmp.y * 0.5 + 0.5) * H;
    const behind = vtmp.z > 1;
    let edge = false;
    if (behind){ sx = W - sx; sy = H - 60; edge = true; }
    if (sx < 40 || sx > W - 40 || sy < 60 || sy > H - 90){ edge = true; }
    sx = SS.clamp(sx, 40, W - 40); sy = SS.clamp(sy, 70, H - 110);
    e.style.display = '';
    e.style.left = sx + 'px'; e.style.top = sy + 'px';
    e.className = 'wp' + (edge ? ' edge' : '') + (m.main ? '' : ' minor');
    const d = SS.dist(PL.x, PL.z, m.x, m.z);
    e.querySelector('.l').textContent = m.label || '';
    e.querySelector('.d').textContent = d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km';
  });
  for (let i = list.length; i < wpEls.length; i++) wpEls[i].style.display = 'none';
}

/* ------------------------------------------------------------------ compass */
function bearing(dx, dz){ let b = Math.atan2(dx, -dz) * 180 / Math.PI; return (b + 360) % 360; }
function drawCompass(){
  const c = $('compass'), g = c.getContext('2d'), PL = SS.player;
  const W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  const head = ((-PL.yaw * 180 / Math.PI) % 360 + 360) % 360;
  const span = 120, ppd = W / span;
  const X = b => { let d = b - head; d = ((d + 540) % 360) - 180; return W / 2 + d * ppd; };
  g.fillStyle = 'rgba(7,11,16,.55)'; g.fillRect(0, 12, W, 26);
  g.strokeStyle = 'rgba(220,239,248,.5)'; g.fillStyle = 'rgba(220,239,248,.85)';
  g.font = '600 13px "Barlow Condensed", sans-serif'; g.textAlign = 'center';
  for (let b = 0; b < 360; b += 5){
    const x = X(b); if (x < 0 || x > W) continue;
    const major = b % 30 === 0;
    g.beginPath(); g.moveTo(x, 38); g.lineTo(x, major ? 26 : 32); g.stroke();
    if (major){
      const lab = b === 0 ? 'N' : b === 90 ? 'E' : b === 180 ? 'S' : b === 270 ? 'W' : String(b).padStart(3, '0');
      g.fillStyle = (b % 90 === 0) ? '#FFFFFF' : 'rgba(220,239,248,.7)';
      g.fillText(lab, x, 23);
    }
  }
  const icon = (b, draw) => { const x = X(b); if (x > 8 && x < W - 8) draw(x); };
  const W_ = SS.world;
  if (W_.sun.el > -1) icon(W_.sun.az, x => { g.fillStyle = '#FFE7A6'; g.beginPath(); g.arc(x, 46, 4, 0, 7); g.fill(); });
  icon(18, x => { g.fillStyle = '#5FA8FF'; g.beginPath(); g.arc(x, 46, 3.5, 0, 7); g.fill(); });
  if (PL.scene === 'ext'){
    const M = SS.MAP;
    [[M.lander, 'LDR'], [M.hab, 'HAB']].forEach(([p, l]) => icon(bearing(p.x - PL.x, p.z - PL.z), x => { g.fillStyle = 'rgba(98,208,245,.9)'; g.font = '600 10px "IBM Plex Mono", monospace'; g.fillText(l, x, 52); }));
    if (UI.wp) icon(bearing(UI.wp.x - PL.x, UI.wp.z - PL.z), x => {
      g.fillStyle = '#FF5A1F'; g.beginPath(); g.moveTo(x, 8); g.lineTo(x + 6, 14); g.lineTo(x, 20); g.lineTo(x - 6, 14); g.closePath(); g.fill();
    });
  }
  g.fillStyle = '#FFFFFF';
  g.beginPath(); g.moveTo(W / 2, 40); g.lineTo(W / 2 - 5, 46); g.lineTo(W / 2 + 5, 46); g.closePath(); g.fill();
  g.font = '500 12px "IBM Plex Mono", monospace'; g.fillText(String(Math.round(head) % 360).padStart(3, '0') + '°', W / 2, 9);
}

/* ------------------------------------------------------------------ C&W */
let cwIdx = 0, cwT = 0, cwKey = '', acked = '';
UI.ackCW = function(){ acked = cwKey; SS.audio.alarm(false); };
function updateCW(dt){
  const list = SS.player.cw.slice().sort((a, b) => (a.lvl === 'warn' ? 0 : 1) - (b.lvl === 'warn' ? 0 : 1));
  const el = $('cw');
  if (!list.length || SS.player.scene !== 'ext'){ el.hidden = true; SS.audio.alarm(false); cwKey = ''; lampState(false, false); return; }
  const key = list.map(c => c.lvl + c.msg.replace(/[\d.:]+/g, '')).join('|');
  if (key !== cwKey){
    const hadWarn = cwKey.indexOf('warn') !== -1;
    cwKey = key;
    if (list.some(c => c.lvl === 'warn') && acked !== key) SS.audio.alarm(true);
    else if (!hadWarn) SS.audio.ui('caution');
  }
  if (acked === key) SS.audio.alarm(false);
  cwT += dt;
  if (cwT > 2.2){ cwT = 0; cwIdx++; }
  const c = list[cwIdx % list.length];
  el.hidden = false;
  el.className = c.lvl === 'warn' ? 'warn' : '';
  el.querySelector('.lvl').textContent = c.lvl === 'warn' ? 'WARNING' : 'CAUTION';
  el.querySelector('.msg').textContent = c.msg + (list.length > 1 ? '  (' + ((cwIdx % list.length) + 1) + '/' + list.length + ')' : '');
  lampState(list.some(c => c.lvl === 'warn'), list.some(c => c.lvl === 'caution'));
}
function lampState(w, c){ $('lampW').classList.toggle('on', w); $('lampC').classList.toggle('on', c); }

/* ------------------------------------------------------------------ HUD frame */
let hudT = 0;
function setV(id, text, cls){ const e = $(id); if (e.textContent !== text) e.textContent = text; if (cls !== undefined) e.className = 'v ' + cls; }
UI.update = function(dt){
  const PL = SS.player, S = PL.suit, G = SS.game;
  const ext = PL.scene === 'ext';
  const suited = S.worn && PL.scene !== 'hab';
  $('visor').hidden = !(ext && S.worn);
  $('visorTint').hidden = !(ext && PL.visor);
  $('compass').style.display = ext ? '' : 'none';
  $('suit').hidden = !suited;
  $('ltv').hidden = !(PL.mode === 'rover');
  $('outpost').hidden = !G.flags.powerOn;
  $('viewfinder').hidden = !PL.photo;
  $('crosshair').style.display = PL.photo ? 'none' : '';

  const co2 = S.co2;
  const k = ext ? SS.smooth(7.5, 22, co2) : 0;
  const pulse = 0.75 + 0.25 * Math.sin(SS.clock.ui * 2.4);
  $('co2fx').style.opacity = (k * pulse * 0.9).toFixed(3);
  const blur = ext ? SS.smooth(12, 28, co2) * 3.2 : 0;
  G.renderer.domElement.style.filter = blur > 0.05 ? 'blur(' + blur.toFixed(2) + 'px) saturate(' + (1 - blur * 0.15).toFixed(2) + ')' : '';

  drawMarkers();
  if (ext) drawCompass();
  updateCW(dt);

  /* prompt + hold ring */
  const it = SS.interact.cur;
  const showPrompt = it && PL.mode === 'walk' && !PL.photo && !G.inputLocked;
  $('prompt').hidden = !showPrompt;
  if (showPrompt){
    const lab = typeof it.label === 'function' ? it.label() : it.label;
    $('promptTxt').textContent = lab;
    $('promptKey').textContent = it.hold ? 'Hold E' : 'E';
  }
  const ring = $('ring');
  if (showPrompt && it.hold && it.prog > 0){ ring.removeAttribute('hidden'); $('ringFg').style.strokeDashoffset = (163.4 * (1 - it.prog)).toFixed(1); }
  else ring.setAttribute('hidden', '');
  if (PL.mode === 'rover' && SS.rover){
    $('prompt').hidden = true;
  }

  hudT += dt;
  if (hudT < 0.12) return;
  hudT = 0;
  $('metClock').textContent = SS.fmtMET(G.sol, G.metMin);
  $('metSub').textContent = G.metSub || '';
  if (suited){
    $('suitMode').textContent = PL.scene === 'airlock' ? 'AIRLOCK' : PL.mode === 'rover' ? 'EVA · LTV' : 'EVA ' + (G.evaNo || '');
    const o2c = S.o2 <= 60 ? 'warn' : S.o2 < 120 ? 'caution' : '';
    setV('sO2', SS.fmtMin(S.o2), o2c);
    $('sO2bar').style.width = (S.o2 / 480 * 100).toFixed(1) + '%';
    $('sO2bar').style.background = o2c === 'warn' ? 'var(--warn)' : o2c === 'caution' ? 'var(--caution)' : 'var(--ok)';
    setV('sWalk', ext ? (S.margin >= 0 ? '+' : '−') + SS.fmtMin(Math.abs(S.margin)) : '—', ext ? (S.margin < 0 ? 'warn' : S.margin < 60 ? 'caution' : 'ok') : '');
    $('sSopRow').hidden = !S.purge;
    setV('sSop', SS.fmtMin(S.sop) + ':' + String(Math.floor((S.sop % 1) * 60)).padStart(2, '0'), S.sop < 10 ? 'warn' : 'caution');
    setV('sPress', S.pressure.toFixed(1) + ' psi', S.pressure < 4.0 && S.worn && ext ? 'warn' : '');
    setV('sCO2', S.co2.toFixed(1) + ' mmHg', S.co2 > 15 ? 'warn' : S.co2 > 7.6 ? 'caution' : '');
    setV('sMet', Math.round(S.metW) + ' W', '');
    setV('sBatt', Math.round(S.batt) + '%', S.batt < 15 ? 'caution' : '');
    setV('sTemp', (ext ? Math.round(S.temp) : 21) + ' °C', '');
    setV('sDose', S.dose.toFixed(2) + ' mSv', S.doseRate > 0.2 ? 'caution' : '');
  }
  if (G.flags.powerOn && G.out){
    const O = SS.outpost, st = G.out, C = O.C;
    $('oSol').textContent = 'SOL ' + G.sol;
    const gen = O.generation(G.man, G.dec, G.sol), load = G.loadNow || 0;
    setV('oBus', (gen - load >= 0 ? '+' : '−') + Math.abs(gen - load).toFixed(1) + ' kW', gen - load >= 0 ? 'ok' : 'warn');
    const cap = O.capacity(G.man, G.dec, G.sol);
    const socNow = cap ? Math.min(1, st.batt / cap) : 0;
    setV('oBatt', cap ? Math.round(socNow * 100) + '%' : 'none', cap && socNow < 0.2 ? 'warn' : '');
    setV('oO2', Math.round(st.o2) + ' kg', st.o2 / C.START.o2 < 0.2 ? 'warn' : '');
    setV('oH2O', Math.round(st.water) + ' kg', st.water / C.START.water < 0.2 ? 'warn' : '');
    setV('oFood', Math.round(st.food) + ' kg', st.food / C.START.food < 0.2 ? 'warn' : '');
    setV('oDose', (st.dose + (G.dec.ev1Extra || 0) + PL.suit.dose).toFixed(1) + ' mSv', '');
  }
  if (PL.mode === 'rover' && SS.rover){
    const Rv = SS.rover;
    setV('lSpeed', (Math.abs(Rv.v) * 3.6).toFixed(1) + ' km/h', '');
    setV('lHdg', String(Math.round(((Rv.h * -180 / Math.PI + 180) % 360 + 360) % 360)).padStart(3, '0') + '°', '');
    setV('lAtt', Math.round(Rv.pitch * 57.3) + '° / ' + Math.round(Rv.roll * 57.3) + '°', Math.abs(Rv.pitch) > 0.3 ? 'caution' : '');
    setV('lOdo', Math.round(Rv.odo) + ' m', '');
    setV('lBatt', Math.round(Rv.batt) + '%', '');
    $('lLights').textContent = Rv.lights ? 'LIGHTS ON' : 'LIGHTS OFF';
    $('lCableRow').hidden = !Rv.paying;
    setV('lCable', Math.round(SS.world.cable.length) + ' m', '');
  }
  const pt = SS.photoTarget;
  $('vfTarget').textContent = pt ? 'TARGET · ' + pt.caption.toUpperCase() : '';
};

/* ------------------------------------------------------------------ meter (array tracking, drilling) */
UI.meter = function(opts){
  if (!opts){ $('meter').hidden = true; return; }
  $('meter').hidden = false;
  $('meterK').textContent = opts.k || '';
  $('meterV').textContent = opts.v || '';
  $('meterBar').style.width = (SS.clamp(opts.frac || 0, 0, 1) * 100).toFixed(1) + '%';
  $('meterBar').style.background = opts.color || 'var(--adv)';
  $('meterMark').style.left = ((opts.mark || 0) * 100).toFixed(1) + '%';
  $('meterMark').style.display = opts.mark ? '' : 'none';
  $('meterHint').innerHTML = opts.hint || '';
};

/* ------------------------------------------------------------------ flow screens */
function waitGo(btnId, overlayId){
  return new Promise(res => {
    const b = $(btnId);
    const done = () => { b.removeEventListener('click', done); UI.spaceTarget = null; $(overlayId).hidden = true; SS.game.syncUi(); SS.audio.ui('ok'); res(); };
    b.addEventListener('click', done);
    UI.spaceTarget = done;
  });
}
UI.card = function(c){
  $('cardKicker').textContent = c.kicker; $('cardTitle').textContent = c.title;
  $('cardMeta').textContent = c.meta || ''; $('cardLede').textContent = c.lede || '';
  $('cardObj').innerHTML = (c.obj || []).map(o => '<li>' + esc(o) + '</li>').join('');
  $('cardSim').hidden = !c.sim; $('cardSim').textContent = c.sim || '';
  $('card').hidden = false; SS.game.syncUi();
  return waitGo('cardGo', 'card');
};
UI.summary = function(s){
  $('sumK').textContent = s.kicker || 'EVA summary';
  $('sumTitle').textContent = s.title;
  $('sumKv').innerHTML = s.rows.map(r => '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>').join('');
  $('sumNote').textContent = s.note || '';
  $('summary').hidden = false; SS.game.syncUi();
  return waitGo('sumGo', 'summary');
};
UI.fail = function(title, text, canRetry){
  return new Promise(res => {
    $('failTitle').textContent = title; $('failTxt').textContent = text;
    $('failRetry').hidden = !canRetry;
    $('fail').hidden = false; SS.game.syncUi();
    const fin = v => { $('fail').hidden = true; SS.game.syncUi(); $('failRetry').onclick = $('failCont').onclick = null; res(v); };
    $('failRetry').onclick = () => fin('retry');
    $('failCont').onclick = () => fin('continue');
  });
};

/* time-lapse: advances the outpost model sol by sol, charting as it goes */
UI.timelapse = function(opts){
  return new Promise(res => {
    const G = SS.game, O = SS.outpost;
    $('timelapse').hidden = false; G.syncUi();
    $('tlLog').innerHTML = '';
    const log = (sol, text, cls) => { const li = document.createElement('li'); li.className = cls || ''; li.innerHTML = '<b>SOL ' + sol + '</b><span>' + esc(text) + '</span>'; $('tlLog').prepend(li); };
    (opts.intro || []).forEach(l => log(G.sol, l[0], l[1]));
    let skip = false, done = false;
    const finish = () => { if (done) return; done = true; UI.spaceTarget = null; $('timelapse').hidden = true; G.syncUi(); res(); };
    $('tlSkip').onclick = () => { skip = true; };
    UI.spaceTarget = () => { skip = true; };
    (async () => {
      while (G.sol < opts.to && !G.out.over){
        const prev = O.clone(G.out);
        O.tick(G.out, G.man, G.dec);
        G.sol = G.out.sol;
        (opts.events ? opts.events(G.sol, prev, G.out) : []).forEach(e => log(G.sol, e[0], e[1]));
        $('tlSol').textContent = 'SOL ' + G.sol;
        $('tlSub').textContent = O.isNight(G.sol) ? 'Darkness at the site · ' + G.out.gen.toFixed(1) + ' kW generated' : 'Sunlit · ' + G.out.gen.toFixed(1) + ' kW generated';
        drawSeries($('tlChart'), G.out.history, G.out.endSol, true);
        if (!skip) await SS.after(opts.pace || 0.45);
      }
      if (!skip) await SS.after(1.2);
      finish();
    })();
  });
};

/* shared chart: consumables %, battery SOC, dose */
function drawSeries(cv, hist, endSol, soc){
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, P = 30;
  g.clearRect(0, 0, W, H);
  g.strokeStyle = 'rgba(150,196,226,.14)'; g.lineWidth = 1;
  g.fillStyle = 'rgba(220,239,248,.55)'; g.font = '11px "IBM Plex Mono", monospace';
  let top = 1; hist.forEach(h => { top = Math.max(top, h.o2, h.water, h.food); });
  top = Math.ceil(top * 2) / 2;
  for (let i = 0; i <= 4; i++){
    const y = P / 2 + (H - P) * i / 4;
    g.beginPath(); g.moveTo(P + 8, y); g.lineTo(W - 6, y); g.stroke();
    g.fillText(Math.round(top * (1 - i / 4) * 100) + '%', 0, y + 4);
  }
  const X = s => P + 8 + (W - P - 14) * s / endSol, Y = v => P / 2 + (H - P) * (1 - Math.min(1, Math.max(0, v) / top));
  O_night(g, X, H, P);
  g.strokeStyle = 'rgba(255,75,58,.6)'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(P + 8, Y(0.2)); g.lineTo(W - 6, Y(0.2)); g.stroke(); g.setLineDash([]);
  const series = [['o2', '#7FD7F7'], ['water', '#5B8DEF'], ['food', '#6FD68F']];
  if (soc) series.push(['soc', '#FFB020']);
  series.forEach(([k, c]) => {
    g.strokeStyle = c; g.lineWidth = 2; g.beginPath();
    hist.forEach((h, i) => { const x = X(h.sol), y = Y(h[k] || 0); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
  });
  let lx = P + 12;
  series.forEach(([k, c]) => { g.fillStyle = c; g.fillRect(lx, 4, 10, 3); g.fillStyle = 'rgba(220,239,248,.8)'; const lab = k === 'o2' ? 'O₂' : k === 'soc' ? 'battery' : k; g.fillText(lab, lx + 14, 9); lx += 26 + g.measureText(lab).width; });
}
function O_night(g, X, H, P){
  g.fillStyle = 'rgba(40,50,110,.25)';
  SS.outpost.C.NIGHTS.forEach(n => { g.fillRect(X(n[0] - 0.5), P / 2, X(n[1] + 0.5) - X(n[0] - 0.5), H - P); });
  g.fillStyle = 'rgba(255,75,58,.12)';
  const s = SS.outpost.C.SPE; g.fillRect(X(s[0] - 0.5), P / 2, X(s[1] + 0.5) - X(s[0] - 0.5), H - P);
}
UI.drawSeries = drawSeries;

/* ------------------------------------------------------------------ flash */
UI.flash = function(dur){
  const f = $('flash'); f.style.transition = 'none'; f.style.opacity = '1';
  void f.offsetWidth;
  f.style.transition = 'opacity ' + (dur || 0.6) + 's ease-out'; f.style.opacity = '0';
};

/* ------------------------------------------------------------------ loading */
UI.loading = function(frac, text){ $('loadBar').style.width = (frac * 100).toFixed(0) + '%'; if (text) $('loadTxt').textContent = text; };

/* ------------------------------------------------------------------ settings */
const DEFAULT_SETTINGS = { voice: true, volume: 0.8, sens: 1.0, invert: false, fov: 70, quality: 'medium' };
UI.loadSettings = function(){ return Object.assign({}, DEFAULT_SETTINGS, SS.store.get('settings', {})); };
UI.renderSettings = function(){
  const S = SS.game.settings, box = $('setList');
  box.innerHTML = '';
  const row = (label, input, val) => { const l = document.createElement('label'); l.innerHTML = '<span>' + label + '</span>'; l.appendChild(input); const v = document.createElement('span'); v.className = 'val'; v.textContent = val || ''; l.appendChild(v); box.appendChild(l); return v; };
  const rng = (id, min, max, step, fmt) => { const i = document.createElement('input'); i.type = 'range'; i.id = 'set-' + id; i.min = min; i.max = max; i.step = step; i.value = S[id]; const v = row({ volume: 'Master volume', sens: 'Mouse sensitivity', fov: 'Field of view' }[id], i, fmt(S[id])); i.addEventListener('input', () => { S[id] = +i.value; v.textContent = fmt(S[id]); UI.applySettings(); }); };
  const chk = (id, label) => { const i = document.createElement('input'); i.type = 'checkbox'; i.id = 'set-' + id; i.checked = !!S[id]; row(label, i, ''); i.addEventListener('change', () => { S[id] = i.checked; UI.applySettings(); }); };
  chk('voice', 'Radio voices');
  rng('volume', 0, 1, 0.05, v => Math.round(v * 100) + '%');
  rng('sens', 0.4, 2.2, 0.1, v => v.toFixed(1) + '×');
  chk('invert', 'Invert look');
  rng('fov', 58, 88, 1, v => v + '°');
  const sel = document.createElement('select'); sel.id = 'set-quality';
  ['low', 'medium', 'high'].forEach(q => { const o = document.createElement('option'); o.value = q; o.textContent = q[0].toUpperCase() + q.slice(1); if (S.quality === q) o.selected = true; sel.appendChild(o); });
  row('Shadow quality', sel, '');
  sel.addEventListener('change', () => { S.quality = sel.value; UI.applySettings(); });
};
UI.applySettings = function(){
  const S = SS.game.settings;
  SS.audio.voiceOn = S.voice; SS.audio.setVolume(S.volume);
  SS.world.setShadowQuality(S.quality);
  SS.store.set('settings', S);
};

/* ------------------------------------------------------------------ sources */
UI.SOURCES = [
  ['O₂ 0.816, water 3.60, food 1.83 kg per crew-day', 'NASA Baseline Values and Assumptions Document, NASA/TP-2015-218570'],
  ['Water recovery 93%; electrolysis 1.125 kg H₂O per kg O₂', 'ISS Water Recovery System and Oxygen Generation Assembly'],
  ['Surface cosmic-ray dose 1.369 mSv/day', 'Chang’e-4 Lunar Lander Neutron & Dosimetry, Science Advances 6, eaaz1334 (2020)'],
  ['Dose limits: 250 mGy-Eq over 30 days, 600 mSv career', 'NASA-STD-3001, Space Flight Human-System Standard'],
  ['Water ice 5.6 ± 2.9 wt% in Cabeus regolith', 'Colaprete et al., Science 330, 463 (2010), LCROSS'],
  ['Permanently shadowed floors below 40 K', 'Paige et al., Science 330, 479 (2010), LRO Diviner'],
  ['Ridge illumination 80–90%; darkness gaps of days', 'LRO LOLA illumination mapping of the south pole'],
  ['Sun within ~1.5° of the horizon at the pole', 'Lunar polar illumination geometry (1.54° axial tilt)'],
  ['Solar array 10 kW class, vertical', 'NASA Vertical Solar Array Technology (VSAT) awards'],
  ['Fission surface power 10 kWe, 10-year life', 'Kilopower / KRUSTY test 2018; NASA–DOE Fission Surface Power'],
  ['LTV top speed 15 km/h', 'Artemis Lunar Terrain Vehicle requirements'],
  ['PLSS 8 h consumables; ~30 min purge on secondary O₂', 'EMU / xEMU consumables and SOP purge mode'],
  ['Suit pressure 4.3 psi; ppCO₂ caution ~7.6 mmHg', 'EMU operating pressure; NASA-STD-3001 CO₂ limits'],
  ['Particle event reference', 'August 1972 event; blood-forming-organ dose behind light shielding'],
  ['Earth–Moon light time ~1.3 s each way', 'Mean Earth–Moon distance 384,400 km'],
  ['Regolith dust in ballistic arcs, no haze', 'Vacuum: no drag, no atmospheric scattering (Apollo 15–17 LRV footage)']
];
UI.ASSUMPTIONS = [
  'Time is compressed. A sol of outpost time runs in the time-lapse; EVA consumables run at 0.35 EVA minutes per real second so an 8-hour PLSS lasts about 23 minutes of play.',
  'The sun sits 4.5° above the horizon for playability; the true maximum at Shackleton is about 1.5°, which would make every shadow three times longer.',
  'Power is a single bus with priority load shedding, not a distribution network with cable losses and converter efficiencies.',
  'Radiation uses scalar attenuation factors. Real shielding analysis uses transport codes such as HZETRN or Geant4 and depends on the event spectrum.',
  'Crop output is a caloric offset, not a crop model.',
  'ISRU throughput (300 kg regolith per sol) and extraction efficiency (60%) are assumptions; the ice concentration is measured.',
  'Walking pace is faster than Apollo crews managed (about 1 m/s) so traverses fit a play session; walkback margins are computed at a realistic 0.9 m/s.',
  'There is no thermal model beyond surface temperature readouts, and suit mobility limits are not simulated.'
];
UI.renderSources = function(){
  $('srcTable').innerHTML = '<tr><th>Value used</th><th>Source</th></tr>' + UI.SOURCES.map(s => '<tr><td>' + esc(s[0]) + '</td><td>' + esc(s[1]) + '</td></tr>').join('');
  $('srcAssume').innerHTML = UI.ASSUMPTIONS.map(a => '<li>' + esc(a) + '</li>').join('');
};
})();
