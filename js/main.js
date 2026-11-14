/* Shackleton Station — boot, input, loop, menus. */
(function(){
'use strict';
const SS = window.SS, UI = SS.ui, $ = UI.$;
const W = SS.world, PL = SS.player, ST = SS.story, O = SS.outpost;

/* ------------------------------------------------------------------ game state */
function newMetrics(){ return { procDev: 0, procNotes: [], comm: [], fanResp: null, speResp: null, speOutside: false, evas: [], waivers: 0, nogo: [], siteKind: null, reactorDist: null, resets: 0, samples: 0 }; }
const G = SS.game = {
  renderer: null, settings: UI.loadSettings(), mode: 'loading', paused: false, frozen: true, overlay: true,
  sol: 0, metMin: 480, metSub: '', flags: {}, man: null, dec: O.decisionsDefault(), out: null,
  metrics: newMetrics(), photos: [], track: [], inputLocked: false, captureRequest: null, doseClicks: 0
};
function newGame(){
  G.sol = 0; G.metMin = 480; G.flags = {}; G.man = null; G.dec = O.decisionsDefault(); G.out = null;
  G.metrics = newMetrics(); G.photos = []; G.track = []; G.cablePts = []; G.inputLocked = false; G.habDark = false;
  SS.world.cable.reset([]); SS.world.clearDecals();
  SS.pcs.resetEclss(false);
  SS.rover.odo = 0; SS.rover.batt = 100;
  PL.distance = 0;
}
SS.on('comm', q => G.metrics.comm.push(q));

/* ------------------------------------------------------------------ overlay bookkeeping */
const BLOCKERS = ['intro', 'kids', 'title', 'chapters', 'settings', 'sources', 'pause', 'card', 'summary', 'fail', 'timelapse', 'frr', 'debrief', 'loading'];
const PANELS = ['dcm', 'pcs', 'map'];
G.syncUi = function(){
  G.frozen = G.paused || BLOCKERS.some(id => !$(id).hidden);
  G.overlay = G.frozen || PANELS.some(id => !$(id).hidden);
  $('hud').hidden = !(G.mode === 'play') || ['card', 'frr', 'debrief', 'loading', 'title', 'chapters'].some(id => !$(id).hidden);
  if (matchMedia('(pointer: coarse)').matches) $('touch').hidden = G.mode !== 'play';
  if (G.overlay && document.pointerLockElement) document.exitPointerLock();
};

/* ------------------------------------------------------------------ input */
const keys = {}, hits = new Set();
SS.input = { keys, mouseDX: 0, touchMove: null, hit: k => hits.has(k) };
let back = 'title';
function show(id, from){ back = from || back; $(id).hidden = false; G.syncUi(); }
function hide(id){ $(id).hidden = true; G.syncUi(); }
function canDCM(){ return G.mode === 'play' && !G.frozen && PL.suit.worn && PL.scene !== 'hab' && $('pcs').hidden && $('map').hidden; }
function pause(on){
  if (on && (G.mode !== 'play' || G.frozen)) return;
  G.paused = on; $('pause').hidden = !on; G.syncUi();
  SS.audio.pauseSpeech(on); if (on) SS.audio.alarm(false);
  if (!on) lock();
}
function handleEsc(){
  if (!$('settings').hidden){ hide('settings'); if (back === 'pause') $('pause').hidden = false; G.syncUi(); return; }
  if (!$('sources').hidden){ hide('sources'); if (back === 'pause') $('pause').hidden = false; G.syncUi(); return; }
  if (!$('chapters').hidden){ hide('chapters'); return; }
  if (!$('pcs').hidden){ SS.pcs.close(); lock(); return; }
  if (!$('dcm').hidden){ SS.dcm.close(); lock(); return; }
  if (!$('map').hidden){ SS.map.close(); lock(); return; }
  if (G.paused){ pause(false); return; }
  if (G.mode === 'play' && !G.frozen) pause(true);
}
window.addEventListener('keydown', e => {
  const k = e.key === ' ' ? ' ' : e.key.toLowerCase();
  if (k === 'tab') e.preventDefault();
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
  if (G.mode === 'intro'){ if (!e.repeat && SS.intro.key(k)) e.preventDefault(); return; }
  if (G.mode === 'kids'){ if (!e.repeat && SS.kids.key(k)) e.preventDefault(); return; }
  if (!e.repeat) hits.add(k);
  keys[k] = true;
  if (e.repeat) return;
  if (k === 'escape'){ handleEsc(); return; }
  if (/^[1-9]$/.test(k)){ SS.emit('choice-key', +k); return; }
  if (k === ' '){
    if (UI.spaceTarget){ e.preventDefault(); const f = UI.spaceTarget; f(); hits.delete(' '); return; }
    if (PL.photo && !G.overlay){ e.preventDefault(); PL.shoot(); hits.delete(' '); return; }
  }
  if (G.frozen) return;
  if (k === 'tab'){ if (!$('dcm').hidden) { SS.dcm.close(); lock(); } else if (canDCM()) SS.dcm.open(); return; }
  if (k === 'm' && G.mode === 'play'){ if (!$('map').hidden){ SS.map.close(); lock(); } else if ($('pcs').hidden && $('dcm').hidden) SS.map.open(); return; }
  if (G.overlay) return;
  if (k === 'f') PL.togglePhoto();
  if (k === 'l'){ PL.headlamp = !PL.headlamp; if (SS.rover.boarded) SS.rover.lights = PL.headlamp; SS.audio.ui('toggle'); }
  if (k === 'v'){ PL.visor = !PL.visor; SS.audio.ui('toggle'); }
  if (k === 'k') UI.ackCW();
});
window.addEventListener('keyup', e => { const k = e.key === ' ' ? ' ' : e.key.toLowerCase(); keys[k] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

let locked = false, dragging = false;
function lock(){
  if (G.overlay || G.mode !== 'play' || matchMedia('(pointer: coarse)').matches) return;
  const c = G.renderer.domElement;
  try { const r = c.requestPointerLock && c.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {}
}
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === G.renderer.domElement; });
function look(dx, dy){
  if (G.inputLocked || G.overlay){ SS.input.mouseDX += dx; return; }
  const s = 0.0022 * (G.settings.sens || 1), inv = G.settings.invert ? -1 : 1;
  if (PL.mode === 'rover'){
    SS.rover.lookYaw = SS.clamp(SS.rover.lookYaw - dx * s, -2.3, 2.3);
    SS.rover.lookPitch = SS.clamp(SS.rover.lookPitch - dy * s * inv, -0.9, 0.7);
  } else {
    PL.yaw -= dx * s; PL.pitch = SS.clamp(PL.pitch - dy * s * inv, -1.4, 1.4);
  }
}
window.addEventListener('mousemove', e => { if (G.mode !== 'play') return; if (locked || dragging) look(e.movementX, e.movementY); else if (G.inputLocked) SS.input.mouseDX += 0; });
window.addEventListener('mouseup', () => { dragging = false; });

/* ------------------------------------------------------------------ menus */
function chapterList(){
  const prog = SS.store.get('progress', 0);
  $('chapList').innerHTML = ST.CH.map((c, i) => '<li><button type="button" data-ch="' + i + '"><span class="n">' + String(i).padStart(2, '0') + '</span><span class="t">' + UI.esc(c.title) + '<small>' + UI.esc(c.short) + '</small></span><span class="m">' + (c.sol ? 'SOL ' + c.sol : 'L−30') + (i < prog ? ' · done' : '') + '</span></button></li>').join('');
  $('chapList').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { hide('chapters'); start(+b.dataset.ch); }));
}
function start(ch){
  if (G.mode === 'intro') return;
  ['title', 'debrief', 'chapters', 'pause'].forEach(id => $(id).hidden = true);
  G.paused = false;
  SS.audio.init(); UI.applySettings();
  newGame();
  G.mode = 'play'; G.syncUi();
  ST.play(ch).catch(e => console.error(e));
}
function toTitle(){
  ST.quit(); newGame();
  G.mode = 'title'; G.paused = false;
  BLOCKERS.concat(PANELS).forEach(id => $(id).hidden = true);
  $('title').hidden = false; G.syncUi();
  SS.audio.alarm(false);
  PL.teleport('ext', 0, 0, 0);
}
/* opening walkthrough: plays after loading, and from the title menu */
function playIntro(fromLoad){
  G.mode = 'intro'; G.paused = false;
  $('title').inert = true;
  if (document.pointerLockElement) document.exitPointerLock();
  SS.intro.start({
    fromLoad, renderer: G.renderer,
    onStart: () => { BLOCKERS.concat(PANELS).forEach(id => { if (id !== 'intro') $(id).hidden = true; }); G.syncUi(); },
    onDone: how => {
      G.mode = 'title'; titleT = 0;
      const t = $('title'); t.inert = false; t.hidden = false; t.classList.remove('reveal'); void t.offsetWidth; t.classList.add('reveal');
      G.syncUi();
      if (how === 'begin') start(0);
      else { const b = $('mBegin'); if (b && !matchMedia('(pointer: coarse)').matches) b.focus({ preventScroll: true }); }
    }
  });
  G.syncUi();
}
/* kids' mission: the main game */
function showTitle(){
  G.mode = 'title'; titleT = 0;
  const t = $('title'); t.inert = false; t.hidden = false; t.classList.remove('reveal'); void t.offsetWidth; t.classList.add('reveal');
  G.syncUi();
}
function playKids(){
  if (G.mode === 'intro') return;
  SS.audio.init();
  G.mode = 'kids'; $('title').hidden = true;
  SS.kids.open({ onExit: showTitle });
  G.syncUi();
}
function liveWx(){
  const N = SS.nasa, el = $('liveWx');
  if (!el) return;
  if (N.status === 'live' && N.week) el.innerHTML = '<span class="dot live"></span>Real space weather, last 7 days: <b>' + N.week.count + '</b> big solar flare' + (N.week.count === 1 ? '' : 's') + (N.week.strongest ? ' (strongest ' + UI.esc(N.week.strongest.cls) + ')' : '') + ' · NASA DONKI';
  else if (N.status === 'offline') el.innerHTML = '<span class="dot arch"></span>Offline: the game will use real flares from NASA\'s archive';
}
SS.on('nasa', liveWx);
$('mPlay').addEventListener('click', playKids);
$('mBegin').addEventListener('click', () => start(0));
$('mIntro').addEventListener('click', () => playIntro(false));
$('mChapters').addEventListener('click', () => { if (G.mode === 'intro') return; SS.audio.init(); chapterList(); show('chapters', 'title'); });
$('mSettings').addEventListener('click', () => { if (G.mode === 'intro') return; SS.audio.init(); UI.renderSettings(); show('settings', 'title'); });
$('mSources').addEventListener('click', () => { if (G.mode === 'intro') return; UI.renderSources(); show('sources', 'title'); });
$('pResume').addEventListener('click', () => pause(false));
$('pRestart').addEventListener('click', () => { G.paused = false; $('pause').hidden = true; BLOCKERS.forEach(id => { if (id !== 'loading' && id !== 'title') $(id).hidden = true; }); PANELS.forEach(id => $(id).hidden = true); SS.pcs.isOpen = false; SS.dcm.isOpen = false; SS.map.isOpen = false; G.syncUi(); SS.audio.pauseSpeech(false); ST.restartChapter(); });
$('pSettings').addEventListener('click', () => { $('pause').hidden = true; UI.renderSettings(); show('settings', 'pause'); });
$('pSources').addEventListener('click', () => { $('pause').hidden = true; UI.renderSources(); show('sources', 'pause'); });
$('pQuit').addEventListener('click', () => { SS.audio.pauseSpeech(false); toTitle(); });
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => {
  const ov = b.closest('.overlay'); ov.hidden = true;
  if (back === 'pause') $('pause').hidden = false;
  if (back === 'debrief') $('debrief').hidden = false;
  G.syncUi();
}));
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
  const id = b.dataset.close;
  if (id === 'dcm') SS.dcm.close(); else if (id === 'pcs') SS.pcs.close(); else if (id === 'map') SS.map.close();
  lock();
}));
SS.on('menu', a => {
  if (a === 'again') start(0);
  else if (a === 'chapters'){ $('debrief').hidden = true; chapterList(); show('chapters', 'debrief'); }
  else if (a === 'sources'){ $('debrief').hidden = true; UI.renderSources(); show('sources', 'debrief'); }
});
/* suit switches during an EVA: purge is the one that matters; anything else gets put back */
SS.on('dcm', d => {
  if (!G.onEva) return;
  if (d.id === 'purge'){ PL.suit.purge = d.value; return; }
  if (d.id === 'guard' || d.id === 'comm') return;
  if (!d.value){ SS.dcm.state[d.id] = true; SS.dcm.render(); UI.toast('IV: “Leave that on, EV1.”'); }
});

/* ------------------------------------------------------------------ touch */
if (matchMedia('(pointer: coarse)').matches){
  $('touch').hidden = false;
  const stick = $('stick'), knob = stick.querySelector('i');
  let mv = null, lk = null;
  const cv = () => G.renderer.domElement;
  document.addEventListener('touchstart', e => {
    if (G.overlay) return;
    for (const t of e.changedTouches){
      if (t.target.id === 'tE') continue;
      if (t.clientX < innerWidth * 0.45 && mv === null) mv = t.identifier;
      else if (lk === null) lk = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    for (const t of e.changedTouches){
      if (t.identifier === mv){
        const r = stick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        let dx = (t.clientX - cx) / (r.width / 2), dy = (t.clientY - cy) / (r.height / 2);
        const m = Math.hypot(dx, dy); if (m > 1){ dx /= m; dy /= m; }
        SS.input.touchMove = { x: dx, y: dy }; knob.style.transform = 'translate(' + dx * 30 + 'px,' + dy * 30 + 'px)';
      } else if (lk && t.identifier === lk.id){ look((t.clientX - lk.x) * 2.2, (t.clientY - lk.y) * 2.2); lk.x = t.clientX; lk.y = t.clientY; }
    }
  }, { passive: true });
  const end = e => { for (const t of e.changedTouches){ if (t.identifier === mv){ mv = null; SS.input.touchMove = null; knob.style.transform = ''; } if (lk && t.identifier === lk.id) lk = null; } };
  document.addEventListener('touchend', end, { passive: true }); document.addEventListener('touchcancel', end, { passive: true });
  const te = $('tE');
  te.addEventListener('touchstart', e => { e.preventDefault(); keys.e = true; hits.add('e'); }, { passive: false });
  te.addEventListener('touchend', () => { keys.e = false; });
}

/* ------------------------------------------------------------------ boot */
const DEBUG = /debug/.test(location.search);
const raf = f => (DEBUG && document.hidden) ? setTimeout(f, 16) : requestAnimationFrame(f);
const frameYield = () => new Promise(r => raf(() => setTimeout(r, 0)));
let headlamp, winT = 0, trackT = 0, titleT = 0;
async function boot(){
  UI.patches();
  UI.loading(0.05, 'Starting renderer');
  const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  r.setSize(innerWidth, innerHeight);
  r.outputEncoding = THREE.sRGBEncoding;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  $('game').prepend(r.domElement);
  G.renderer = r;
  r.domElement.addEventListener('click', () => { if (PL.photo && locked){ PL.shoot(); return; } lock(); });
  r.domElement.addEventListener('mousedown', e => { if (e.button === 0 && !locked && G.mode === 'play' && !G.overlay){ dragging = true; if (PL.photo) PL.shoot(); } });
  await frameYield();
  UI.loading(0.15, 'Generating terrain — Shackleton connecting ridge');
  await frameYield();
  W.build();
  UI.loading(0.4, 'Building surface mesh and regolith');
  await frameYield();
  W.init(r);
  UI.loading(0.6, 'Computing south-pole illumination');
  await frameYield();
  const s = ST.sunForSol(3); W.setSun(s.az, s.el); W._sun = s;
  UI.loading(0.78, 'Emplacing hardware');
  await frameYield();
  SS.base.build();
  SS.rover.build(); SS.rover.place(SS.MAP.rover.x, SS.MAP.rover.z, -2.2);
  SS.npc.build();
  SS.interior.build();
  W.scene.add(W.camera);
  PL.initTools(W.camera);
  headlamp = new THREE.SpotLight(0xFFF3E4, 0, 70, 0.52, 0.6, 1.25);
  headlamp.position.set(0.12, 0.05, 0.1);
  headlamp.target.position.set(0, -0.8, -10);
  W.camera.add(headlamp); W.camera.add(headlamp.target);
  SS.intro.build();
  G.man = { vsat: 2, fsp: 0, battery: 1, hab: 'inflatable', eclss: 1, isru: 1, greenhouse: 1, shelter: 0, excavator: 1 };
  G.flags = { powerOn: true, array1: true, arraysAll: true, palletTaken: true, arrayYaw: Math.PI - s.az * SS.DEG };
  G.dec.siteId = 'R-B'; G.dec.siteKind = 'ridge'; G.sol = 8;
  SS.base.sync(G);
  UI.applySettings();
  UI.loading(0.95, 'Compiling shaders');
  await frameYield();
  r.compile(W.scene, W.camera);
  UI.loading(1, 'Ready');
  await frameYield();
  G.man = null; G.flags = {}; G.sol = 0;
  if (/debug/.test(location.search)) window.SSD = { start, G, ST, SS, playIntro };
  if (/fast/.test(location.search)){ SS.radio.fast = true; SS.audio.voiceOn = false; G.settings.voice = false; }
  const q = /chapter=(\d)/.exec(location.search);
  SS.nasa.load();
  if (q || !/intro=1/.test(location.search)){
    G.mode = 'title';
    $('loading').hidden = true; $('title').hidden = false;
    G.syncUi();
    if (q) start(+q[1]);
  } else {
    playIntro(true);
    $('loading').hidden = true; G.syncUi();
  }
  raf(frame);
}

/* ------------------------------------------------------------------ loop */
const clock = new THREE.Clock();
function frame(){
  raf(frame);
  const dtR = Math.min(0.05, clock.getDelta());
  if (!G.paused){ SS.clock.ui += dtR; SS.tickTimers(); }
  const dt = G.frozen || G.paused ? 0 : dtR;
  SS.clock.game += dt;
  const cam = W.camera;

  if (G.mode === 'intro'){
    const where = SS.intro.update(dtR, G.renderer);
    let scene = W.scene;
    if (where === 'ext'){ W.update(SS.intro.paused ? 0 : dtR, cam, {}); headlamp.intensity = 0; }
    else { scene = where === 'hab' ? SS.interior.hab.scene : SS.interior.airlock.scene; G.renderer.toneMappingExposure = 1.0; }
    cam.updateMatrixWorld();
    G.renderer.render(scene, cam);
    SS.intro.afterRender(G.renderer);
    return;
  }

  if (G.mode === 'title' || G.mode === 'loading' || G.mode === 'kids'){
    titleT += dtR;
    const a = titleT * 0.035 + 2.2, cx = 22, cz = 16, rr = 58;
    const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
    cam.position.set(x, W.H(x, z) + 11, z);
    cam.lookAt(cx, W.H(cx, cz) + 3.5, cz);
    cam.rotation.order = 'YXZ';
    if (cam.fov !== 62){ cam.fov = 62; cam.updateProjectionMatrix(); }
    W.update(dtR, cam, {});
    headlamp.intensity = 0;
    cam.updateMatrixWorld();
    G.renderer.render(W.scene, cam);
    return;
  }

  if (!G.paused && !G.frozen){
    PL.update(dt);
    SS.rover.update(dt);
    SS.npc.update(dt);
    SS.pcs.tick(dt);
    G.metMin += dt * SS.EVA_TS;
    ST.tick(dt);
    if (PL.scene === 'ext' && G.onEva){
      trackT += dt;
      const lp = G.track[G.track.length - 1];
      if (trackT > 0.5 && (!lp || SS.dist(lp.x, lp.z, PL.x, PL.z) > 3)){ trackT = 0; G.track.push({ x: PL.x, z: PL.z }); }
    }
  } else if (!G.paused){ ST.tick(0); }
  SS.input.mouseDX = 0;
  G.loadNow = G.out ? G.out.demand : 0;
  if (G.out && G.flags.powerOn){ G.out.batt = G.out.batt; }

  const ext = PL.scene === 'ext';
  W.update(dt, cam, { headlamp: PL.headlamp, visor: PL.visor, interior: !ext });
  headlamp.intensity = ext && PL.headlamp && PL.suit.worn ? 3.4 : 0;
  SS.audio.update(dtR, {
    inSuit: PL.suit.worn && PL.scene !== 'hab' && !G.frozen, metW: PL.suit.metW, co2: PL.suit.co2, fan: PL.suit.fan && PL.suit.worn && (G.onEva || PL.scene === 'airlock') && (G.suitPowered !== false || G.onEva),
    cabin: PL.scene === 'hab' && !G.habDark, rover: SS.rover.v, roverOn: SS.rover.boarded && !G.frozen,
    drill: G.frozen ? 0 : (SS.audio.drillLevel || 0), doseClicks: G.frozen ? 0 : G.doseClicks
  });
  UI.update(dtR);
  if (!$('dcm').hidden) SS.dcm.lcd();
  if (!$('map').hidden && (SS.clock.ui * 4 | 0) !== (SS.map._t || 0)){ SS.map._t = SS.clock.ui * 4 | 0; SS.map.draw(); }

  let scene = W.scene;
  if (PL.scene === 'hab'){
    scene = SS.interior.hab.scene;
    winT -= dtR; if (winT <= 0){ winT = 3; cam.updateMatrixWorld(); SS.interior.renderWindow(G.renderer); }
    G.renderer.toneMappingExposure = 1.0;
  } else if (PL.scene === 'airlock'){ scene = SS.interior.airlock.scene; G.renderer.toneMappingExposure = 1.0; }
  cam.updateMatrixWorld();
  G.renderer.render(scene, cam);

  if (G.captureRequest){
    const req = G.captureRequest; G.captureRequest = null;
    try {
      const c = SS.canvas(480, 300), g = c.getContext('2d');
      const src = G.renderer.domElement, sw = src.width, sh = src.height;
      const cw = Math.min(sw, sh * 1.6), ch = cw / 1.6;
      g.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, 480, 300);
      G.photos.push({ src: c.toDataURL('image/jpeg', 0.82), caption: req.caption, sol: G.sol, ok: req.ok });
    } catch (e) {}
    UI.flash(0.18);
    UI.toast(req.ok ? 'Photo downlinked — ' + req.caption : 'Photo saved', req.ok ? 'ok' : '');
  }
  hits.clear();
}

addEventListener('resize', () => {
  const cam = W.camera; if (!cam || !G.renderer) return;
  cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
  G.renderer.setSize(innerWidth, innerHeight);
});
boot().catch(e => { console.error(e); UI.loading(1, 'Error: ' + e.message); });
})();
