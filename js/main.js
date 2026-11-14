/* Shackleton Station — boot, input, loop, menus. One game: the kids' Moon base mission, played first-person. */
(function(){
'use strict';
const SS = window.SS, UI = SS.ui, $ = UI.$;
const W = SS.world, PL = SS.player;

/* ------------------------------------------------------------------ game state */
const G = SS.game = {
  renderer: null, settings: UI.loadSettings(), mode: 'loading', paused: false, frozen: true, overlay: true,
  sol: 1, metMin: 480, metSub: '', flags: {}, out: null, photos: [], inputLocked: false, captureRequest: null, doseClicks: 0
};

/* ------------------------------------------------------------------ overlay bookkeeping */
const BLOCKERS = ['title', 'settings', 'pause', 'loading', 'mx', 'kinfo'];
G.syncUi = function(){
  G.frozen = G.paused || BLOCKERS.some(id => !$(id).hidden);
  G.overlay = G.frozen;
  $('hud').hidden = G.mode !== 'play' || !$('loading').hidden || !$('title').hidden;
  $('kidhud').hidden = $('hud').hidden;
  if (matchMedia('(pointer: coarse)').matches) $('touch').hidden = G.mode !== 'play' || G.frozen;
  if (G.overlay && document.pointerLockElement) document.exitPointerLock();
  if (G.lockHint) G.lockHint();
};

/* ------------------------------------------------------------------ input */
const keys = {}, hits = new Set();
SS.input = { keys, mouseDX: 0, touchMove: null, hit: k => hits.has(k) };
let back = 'title';
function show(id, from){ back = from || back; $(id).hidden = false; G.syncUi(); }
function hide(id){ $(id).hidden = true; G.syncUi(); }
function pause(on){
  if (on && (G.mode !== 'play' || G.frozen)) return;
  G.paused = on; $('pause').hidden = !on; G.syncUi();
  SS.audio.pauseSpeech(on); if (on) SS.audio.alarm(false);
  if (!on) lock();
}
function handleEsc(){
  if (!$('kinfo').hidden){ SS.mission.closeInfo(); return; }
  if (!$('settings').hidden){ hide('settings'); if (back === 'pause') $('pause').hidden = false; G.syncUi(); return; }
  if (!$('mx').hidden){ SS.mission.esc(); return; }
  if (G.paused){ pause(false); return; }
  if (G.mode === 'play' && !G.frozen) pause(true);
}
window.addEventListener('keydown', e => {
  const k = e.key === ' ' ? ' ' : e.key.toLowerCase();
  if (k === 'tab') e.preventDefault();
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
  if (!e.repeat) hits.add(k);
  keys[k] = true;
  if (e.repeat) return;
  if (k === 'escape'){ if (locked || performance.now() - unlockedAt < 300) return; handleEsc(); return; }
  if (/^[1-9]$/.test(k)){ SS.emit('choice-key', +k); return; }
  if (k === ' '){
    if (UI.spaceTarget){ e.preventDefault(); const f = UI.spaceTarget; f(); hits.delete(' '); return; }
    if (PL.photo && !G.overlay){ e.preventDefault(); PL.shoot(); hits.delete(' '); return; }
    if (G.mode === 'play' && !G.overlay) e.preventDefault();
  }
  if (G.frozen || G.overlay) return;
  if (k === 'f') PL.togglePhoto();
  if (k === 'l'){ PL.headlamp = !PL.headlamp; if (SS.rover.boarded) SS.rover.lights = PL.headlamp; SS.audio.ui('toggle'); }
  if (k === 'v'){ PL.visor = !PL.visor; SS.audio.ui('toggle'); }
});
window.addEventListener('keyup', e => { const k = e.key === ' ' ? ' ' : e.key.toLowerCase(); keys[k] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

let locked = false, dragging = false, unlockedAt = -1e9;
function lock(){
  if (G.overlay || G.mode !== 'play' || matchMedia('(pointer: coarse)').matches) return;
  const c = G.renderer.domElement;
  try { const r = c.requestPointerLock && c.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {}
}
G.lock = lock;
document.addEventListener('pointerlockchange', () => {
  const was = locked;
  locked = document.pointerLockElement === G.renderer.domElement;
  if (was && !locked) unlockedAt = performance.now();
  lockHint();
});
/* while playing with the mouse free, a hint says how to grab it again */
function lockHint(){
  const h = $('lockHint'); if (!h) return;
  h.hidden = locked || G.mode !== 'play' || G.overlay || matchMedia('(pointer: coarse)').matches;
  h.innerHTML = 'Mouse is free · <b>click</b> to look around' + (G.mode === 'play' ? ' · <kbd>Esc</kbd> again to pause' : '');
  $('lockOn').hidden = !locked;
}
G.lockHint = lockHint;
/* clicking anywhere on the game (not on a menu) locks the mouse */
document.addEventListener('mousedown', e => {
  if (e.button !== 0 || locked || G.mode !== 'play' || G.overlay) return;
  if (e.target.closest && e.target.closest('button, a, input, select, .overlay')) return;
  lock();
});
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
window.addEventListener('mousemove', e => { if (G.mode !== 'play') return; if (locked || dragging) look(e.movementX, e.movementY); });
window.addEventListener('mouseup', () => { dragging = false; });

/* ------------------------------------------------------------------ menus */
function start(){
  ['title', 'pause', 'settings'].forEach(id => $(id).hidden = true);
  G.paused = false;
  SS.audio.init(); UI.applySettings();
  G.mode = 'play';
  SS.mission.start();
  G.syncUi();
}
function toTitle(){
  SS.mission.stop();
  G.mode = 'title'; G.paused = false;
  BLOCKERS.forEach(id => $(id).hidden = true);
  const t = $('title'); t.hidden = false; t.classList.remove('reveal'); void t.offsetWidth; t.classList.add('reveal');
  G.syncUi();
  SS.audio.alarm(false);
}
G.start = start; G.toTitle = toTitle;
$('mPlay').addEventListener('click', start);
$('mHow').addEventListener('click', () => SS.mission.showHelp());
$('mData').addEventListener('click', () => SS.mission.showData());
$('mSettings').addEventListener('click', () => { SS.audio.init(); UI.renderSettings(); show('settings', 'title'); });
$('pResume').addEventListener('click', () => pause(false));
$('pRestart').addEventListener('click', () => { G.paused = false; $('pause').hidden = true; SS.audio.pauseSpeech(false); start(); });
$('pSettings').addEventListener('click', () => { $('pause').hidden = true; UI.renderSettings(); show('settings', 'pause'); });
$('pSources').addEventListener('click', () => SS.mission.showData());
$('pQuit').addEventListener('click', () => { SS.audio.pauseSpeech(false); toTitle(); });
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => {
  const ov = b.closest('.overlay'); ov.hidden = true;
  if (back === 'pause') $('pause').hidden = false;
  G.syncUi();
}));
function liveWx(){
  const N = SS.nasa, el = $('liveWx');
  if (!el) return;
  if (N.status === 'live' && N.week) el.innerHTML = '<span class="dot live"></span>Real space weather, last 7 days: <b>' + N.week.count + '</b> big solar flare' + (N.week.count === 1 ? '' : 's') + (N.week.strongest ? ' (strongest ' + UI.esc(N.week.strongest.cls) + ')' : '') + ' · NASA DONKI';
  else if (N.status === 'offline') el.innerHTML = '<span class="dot arch"></span>Offline right now: the game uses real flares from NASA\'s archive';
}
SS.on('nasa', liveWx);

/* ------------------------------------------------------------------ touch */
if (matchMedia('(pointer: coarse)').matches){
  const stick = $('stick'), knob = stick.querySelector('i');
  let mv = null, lk = null;
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
let headlamp, winT = 0, titleT = 0;
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
  SS.nasa.load();
  await frameYield();
  UI.loading(0.15, 'Shaping the Moon\'s south pole');
  await frameYield();
  W.build();
  UI.loading(0.4, 'Laying down moondust');
  await frameYield();
  W.init(r);
  UI.loading(0.6, 'Working out where the Sun shines');
  await frameYield();
  SS.mission.sun('day');
  UI.loading(0.78, 'Building the base');
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
  SS.mission.build();
  UI.applySettings();
  UI.loading(0.95, 'Getting the crew ready');
  await frameYield();
  r.compile(W.scene, W.camera);
  UI.loading(1, 'Ready');
  await frameYield();
  G.mode = 'title';
  $('loading').hidden = true; $('title').hidden = false;
  G.syncUi(); liveWx();
  if (DEBUG) window.SSD = { start, G, SS };
  if (/fast/.test(location.search)){ SS.radio.fast = true; SS.audio.voiceOn = false; G.settings.voice = false; }
  if (/play=1/.test(location.search)) start();
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

  if (G.mode === 'title' || G.mode === 'loading'){
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
  }
  SS.mission.tick(dt, dtR);
  SS.input.mouseDX = 0;

  const ext = PL.scene === 'ext';
  W.update(dt, cam, { headlamp: PL.headlamp, visor: PL.visor, interior: !ext });
  headlamp.intensity = ext && PL.headlamp ? 3.4 : 0;
  SS.audio.update(dtR, {
    inSuit: ext && !G.frozen, metW: PL.suit.metW, co2: PL.suit.co2, fan: ext,
    cabin: PL.scene === 'hab', rover: SS.rover.v, roverOn: SS.rover.boarded && !G.frozen,
    drill: 0, doseClicks: G.frozen ? 0 : G.doseClicks
  });
  UI.update(dtR);

  let scene = W.scene;
  if (PL.scene === 'hab'){
    scene = SS.interior.hab.scene;
    winT -= dtR; if (winT <= 0){ winT = 3; cam.updateMatrixWorld(); SS.interior.renderWindow(G.renderer); }
    G.renderer.toneMappingExposure = 1.0;
  }
  cam.updateMatrixWorld();
  G.renderer.render(scene, cam);

  if (G.captureRequest){
    G.captureRequest = null;
    UI.flash(0.18);
    UI.toast('📸 Photo taken!', 'ok');
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
