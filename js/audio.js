/* Shackleton Station — audio.
   In vacuum the only sounds are the ones conducted through the suit or carried by radio,
   so everything here is either suit-borne (breathing, fan, footfalls, tools) or on the radio bus. */
(function(){
'use strict';
const SS = window.SS;
const A = SS.audio = { ctx: null, ready: false, volume: 0.8, voiceOn: true };
let master, suitBus, radioBus, cabinBus, noiseBuf;
let breath = null, fan = null, cabin = null, motor = null, drill = null, alarm = null;
let alarmOn = false, alarmT = 0, alarmFlip = false;

function noiseSrc(){
  const s = A.ctx.createBufferSource();
  s.buffer = noiseBuf; s.loop = true;
  s.loopStart = Math.random(); s.loopEnd = 1.9;
  return s;
}
function filt(type, f, q){
  const b = A.ctx.createBiquadFilter();
  b.type = type; b.frequency.value = f; if (q !== undefined) b.Q.value = q;
  return b;
}
function gain(v){ const g = A.ctx.createGain(); g.gain.value = v; return g; }
function chain(){ for (let i = 0; i < arguments.length - 1; i++) arguments[i].connect(arguments[i + 1]); return arguments[arguments.length - 1]; }

A.init = function(){
  if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
  try { A.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  const c = A.ctx;
  master = gain(A.volume); master.connect(c.destination);
  noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  suitBus = gain(1); suitBus.connect(master);
  cabinBus = gain(1); cabinBus.connect(master);
  radioBus = gain(0.9);
  chain(radioBus, filt('highpass', 320), filt('lowpass', 3300), master);

  /* breathing: filtered noise shaped per breath cycle */
  const bs = noiseSrc(), bbp = filt('bandpass', 900, 0.8), bg = gain(0);
  chain(bs, bbp, filt('lowpass', 2400), bg, suitBus); bs.start();
  breath = { bp: bbp, g: bg, phase: 0 };

  /* PLSS fan */
  const fs = noiseSrc(), fg = gain(0);
  chain(fs, filt('lowpass', 520), fg, suitBus); fs.start();
  const fo = c.createOscillator(); fo.type = 'sine'; fo.frequency.value = 212;
  const fog = gain(0); chain(fo, fog, suitBus); fo.start();
  fan = { g: fg, og: fog, on: false };

  /* cabin air handling (IVA) */
  const cs = noiseSrc(), cg = gain(0);
  chain(cs, filt('lowpass', 340), cg, cabinBus); cs.start();
  const co = c.createOscillator(); co.type = 'sine'; co.frequency.value = 120;
  const cog = gain(0); chain(co, cog, cabinBus); co.start();
  cabin = { g: cg, og: cog };

  /* LTV drive motors, heard through the seat */
  const mo = c.createOscillator(); mo.type = 'sawtooth'; mo.frequency.value = 60;
  const mlp = filt('lowpass', 380), mg = gain(0);
  chain(mo, mlp, mg, suitBus); mo.start();
  const mn = noiseSrc(), mng = gain(0);
  chain(mn, filt('lowpass', 160), mng, suitBus); mn.start();
  motor = { o: mo, g: mg, ng: mng };

  /* drill */
  const dn = noiseSrc(), dbp = filt('bandpass', 380, 1.2), dg = gain(0);
  chain(dn, dbp, dg, suitBus); dn.start();
  const dosc = c.createOscillator(); dosc.type = 'square'; dosc.frequency.value = 55;
  const dog = gain(0); chain(dosc, filt('lowpass', 300), dog, suitBus); dosc.start();
  drill = { g: dg, og: dog, o: dosc, bp: dbp };

  /* master alarm tone */
  const ao = c.createOscillator(); ao.type = 'square'; ao.frequency.value = 1000;
  const ag = gain(0); chain(ao, filt('lowpass', 2600), ag, suitBus); ao.start();
  alarm = { o: ao, g: ag };

  A.ready = true;
};

A.setVolume = function(v){ A.volume = v; if (master) master.gain.setTargetAtTime(v, A.ctx.currentTime, 0.05); };
A.suspend = function(on){ if (!A.ctx) return; if (on) A.ctx.suspend(); else A.ctx.resume(); };

/* continuous layers, called every frame */
A.update = function(dt, st){
  if (!A.ready) return;
  const t = A.ctx.currentTime;
  /* breathing */
  if (st.inSuit){
    const period = SS.clamp(5.0 - (st.metW - 110) / 95, 1.7, 5.0);
    breath.phase += dt / period;
    if (breath.phase >= 1) breath.phase -= 1;
    const p = breath.phase;
    let amp = 0, f = 900;
    if (p < 0.36){ amp = Math.sin(p / 0.36 * Math.PI); f = 1550; }
    else if (p > 0.44 && p < 0.92){ amp = Math.sin((p - 0.44) / 0.48 * Math.PI) * 0.85; f = 680; }
    let k = SS.clamp(0.018 + (st.metW - 110) / 380 * 0.03, 0.018, 0.05);
    if (st.co2 > 8) k *= 1.4;
    breath.g.gain.setTargetAtTime(amp * k, t, 0.04);
    breath.bp.frequency.setTargetAtTime(f, t, 0.08);
  } else {
    breath.g.gain.setTargetAtTime(0, t, 0.2);
  }
  /* fan */
  const fanOn = st.inSuit && st.fan;
  fan.g.gain.setTargetAtTime(fanOn ? 0.03 : 0, t, fanOn ? 0.4 : 0.08);
  fan.og.gain.setTargetAtTime(fanOn ? 0.004 : 0, t, 0.3);
  /* cabin */
  cabin.g.gain.setTargetAtTime(st.cabin ? 0.035 : 0, t, 0.5);
  cabin.og.gain.setTargetAtTime(st.cabin ? 0.003 : 0, t, 0.5);
  /* rover */
  const sp = Math.abs(st.rover || 0);
  motor.o.frequency.setTargetAtTime(48 + sp * 34, t, 0.1);
  motor.g.gain.setTargetAtTime(st.roverOn ? 0.008 + sp * 0.006 : 0, t, 0.15);
  motor.ng.gain.setTargetAtTime(st.roverOn ? sp * 0.025 : 0, t, 0.1);
  /* drill */
  const dl = st.drill || 0;
  drill.g.gain.setTargetAtTime(dl * 0.08, t, 0.05);
  drill.og.gain.setTargetAtTime(dl * 0.02, t, 0.05);
  drill.o.frequency.setTargetAtTime(40 + dl * 40, t, 0.1);
  drill.bp.frequency.setTargetAtTime(260 + dl * 380, t, 0.1);
  /* master alarm, alternating tone */
  if (alarmOn){
    alarmT += dt;
    if (alarmT > 0.28){ alarmT = 0; alarmFlip = !alarmFlip; alarm.o.frequency.setValueAtTime(alarmFlip ? 1000 : 740, t); }
    alarm.g.gain.setTargetAtTime(0.035, t, 0.01);
  } else alarm.g.gain.setTargetAtTime(0, t, 0.02);
  /* dosimeter: Poisson clicks */
  const rate = st.doseClicks || 0;
  if (rate > 0){
    const n = Math.min(6, Math.floor(rate * dt + Math.random()));
    for (let i = 0; i < n; i++) click(t + Math.random() * dt);
  }
};

function burst(dest, t, dur, type, f, q, g0){
  const c = A.ctx;
  const s = noiseSrc(); const bq = filt(type, f, q); const g = gain(0);
  chain(s, bq, g, dest);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(g0, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.start(t); s.stop(t + dur + 0.05);
}
function tone(dest, t, dur, f, g0, type){
  const c = A.ctx;
  const o = c.createOscillator(); o.type = type || 'sine'; o.frequency.value = f;
  const g = gain(0); chain(o, g, dest);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(g0, t + 0.01);
  g.gain.setValueAtTime(g0, t + dur - 0.02);
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.start(t); o.stop(t + dur + 0.05);
}
function click(t){ burst(suitBus, t, 0.012, 'highpass', 2600, 0.7, 0.12); }

A.step = function(hard){ if (!A.ready) return; burst(suitBus, A.ctx.currentTime, hard ? 0.16 : 0.1, 'lowpass', 190, 0.7, hard ? 0.22 : 0.13); };
A.clunk = function(){ if (!A.ready) return; const t = A.ctx.currentTime; burst(suitBus, t, 0.25, 'lowpass', 140, 1, 0.35); tone(suitBus, t, 0.12, 70, 0.12); };
A.quindar = function(end){ if (!A.ready) return; tone(radioBus, A.ctx.currentTime, 0.25, end ? 2475 : 2525, 0.05); };
A.squelch = function(){ if (!A.ready) return; burst(radioBus, A.ctx.currentTime, 0.14, 'bandpass', 1800, 0.6, 0.06); };
A.shutter = function(){ if (!A.ready) return; const t = A.ctx.currentTime; burst(suitBus, t, 0.04, 'bandpass', 2200, 2, 0.12); burst(suitBus, t + 0.07, 0.05, 'bandpass', 1400, 2, 0.1); };
A.hiss = function(dur){
  if (!A.ready) return;
  const c = A.ctx, t = c.currentTime;
  const s = noiseSrc(); const hp = filt('highpass', 2400); const g = gain(0);
  chain(s, hp, g, cabinBus);
  g.gain.setValueAtTime(0.0, t);
  g.gain.linearRampToValueAtTime(0.09, t + 0.3);
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  s.start(t); s.stop(t + dur + 0.1);
};
A.alarm = function(on){ alarmOn = !!on; };
A.ui = function(kind){
  if (!A.ready) return;
  const t = A.ctx.currentTime;
  if (kind === 'toggle'){ burst(master, t, 0.03, 'bandpass', 3000, 3, 0.1); tone(master, t, 0.03, 180, 0.05); }
  else if (kind === 'ok'){ tone(master, t, 0.08, 880, 0.03); tone(master, t + 0.09, 0.1, 1320, 0.03); }
  else if (kind === 'err'){ tone(master, t, 0.16, 220, 0.05, 'square'); }
  else if (kind === 'caution'){ tone(master, t, 0.18, 660, 0.04); tone(master, t + 0.22, 0.18, 660, 0.04); }
  else tone(master, t, 0.04, 1200, 0.02);
};

/* ---------- speech ---------- */
let voices = [];
function loadVoices(){
  try { voices = window.speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); } catch (e) { voices = []; }
}
if ('speechSynthesis' in window){ loadVoices(); try { window.speechSynthesis.onvoiceschanged = loadVoices; } catch (e) {} }
const PREF = {
  CAPCOM: ['Daniel', 'Google UK English Male', 'Alex', 'Aaron', 'Arthur', 'Fred', 'Microsoft Guy', 'Rishi'],
  IV:     ['Samantha', 'Google US English', 'Microsoft Aria', 'Karen', 'Tessa', 'Moira'],
  EV2:    ['Rishi', 'Tom', 'Oliver', 'Microsoft Davis', 'Google UK English Male', 'Daniel'],
  FLIGHT: ['Karen', 'Serena', 'Moira', 'Microsoft Jenny', 'Victoria', 'Fiona'],
  EV1:    ['Alex', 'Aaron', 'Microsoft Guy', 'Google US English']
};
const PITCH = { CAPCOM: 0.95, IV: 1.05, EV2: 1.02, FLIGHT: 1.0, EV1: 1.0 };
const RATE  = { CAPCOM: 1.06, IV: 1.04, EV2: 1.05, FLIGHT: 0.98, EV1: 1.05 };
function pickVoice(sp){
  if (!voices.length) loadVoices();
  const prefs = PREF[sp] || PREF.CAPCOM;
  for (const n of prefs){ const v = voices.find(v => v.name.indexOf(n) !== -1); if (v) return v; }
  const idx = { CAPCOM: 0, IV: 1, EV2: 2, FLIGHT: 3, EV1: 4 }[sp] || 0;
  return voices.length ? voices[idx % voices.length] : null;
}
A.speak = function(speaker, text){
  return new Promise(res => {
    if (!A.voiceOn || !('speechSynthesis' in window)) return res(false);
    let done = false;
    const finish = () => { if (!done){ done = true; res(true); } };
    try {
      const clean = text.replace(/[—–]/g, ', ').replace(/\bEV1\b/g, 'E V 1').replace(/\bEV2\b/g, 'E V 2')
                        .replace(/\bIV\b/g, 'I V').replace(/\bLTV\b/g, 'L T V').replace(/\bPLSS\b/g, 'pliss')
                        .replace(/\bECLSS\b/g, 'eekliss').replace(/\bVSAT\b/g, 'V-sat').replace(/\bppCO2\b/g, 'P P C O 2')
                        .replace(/\bCO2\b/g, 'C O 2').replace(/\bO2\b/g, 'O 2').replace(/\bSOP\b/g, 'S O P')
                        .replace(/\bISRU\b/g, 'is-roo').replace(/\bPSR\b/g, 'P S R').replace(/\bDCM\b/g, 'D C M')
                        .replace(/\bPDU\b/g, 'P D U').replace(/\bmSv\b/g, 'millisieverts').replace(/\bkW\b/g, 'kilowatts');
      const u = new SpeechSynthesisUtterance(clean);
      const v = pickVoice(speaker); if (v) u.voice = v;
      u.rate = RATE[speaker] || 1; u.pitch = PITCH[speaker] || 1; u.volume = 0.95;
      u.onend = finish; u.onerror = finish;
      window.speechSynthesis.speak(u);
      setTimeout(finish, 1500 + clean.length * 85);
    } catch (e) { finish(); }
  });
};
A.stopSpeech = function(){ try { window.speechSynthesis.cancel(); } catch (e) {} };
A.pauseSpeech = function(on){ try { if (on) window.speechSynthesis.pause(); else window.speechSynthesis.resume(); } catch (e) {} };
})();
