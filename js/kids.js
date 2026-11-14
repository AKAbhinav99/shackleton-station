/* Shackleton Station — the kids' mission (ages 7–12).
   Three things to keep in balance: AIR & FOOD (life support), POWER (solar + battery) and the
   RADIATION SHIELD. Every day you share out a little power. Every choice costs something.
   Real solar flares from NASA DONKI decide what the Sun throws at you. */
(function(){
'use strict';
const SS = window.SS;
const K = SS.kids = { active: false };
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pickOne = a => a[Math.floor(Math.random() * a.length)];
const fmtDate = d => { try { return new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return d; } };

/* ---------------------------------------------------------------- rules (kept small on purpose) */
const DAYS = 15, NEED = 4, BATT_CAP = 8, AIR_CAP = 10, SHIELD_COST = 4, SHIELD_MAX = 3, SCI_COST = 2, LIMIT = 250;
const SITES = {
  moon: {
    id: 'moon', name: 'the Moon', base: 'Moon Base Shackleton', dayWord: 'Day',
    place: 'the rim of Shackleton crater, at the Moon\'s south pole',
    sun: 7, low: 2, lowName: 'Long shadow', lowIcon: '🌑', battery: 4, air: 6,
    cosmic: 1.37, flareMul: 1, delaySec: 1.3,
    lowText: 'The Sun has slipped behind the hills. For a few days your solar panels make very little power.',
    blurb: 'Near-constant sunshine on the crater rim, no air to stop radiation, and Earth only 1.3 seconds away by radio.'
  },
  mars: {
    id: 'mars', name: 'Mars', base: 'Mars Base Jezero', dayWord: 'Sol',
    place: 'Jezero crater on Mars, an old lake bed the Perseverance rover is exploring',
    sun: 5, low: 2, lowName: 'Dust storm', lowIcon: '🌪️', battery: 6, air: 6,
    cosmic: 0.64, flareMul: 0.3, delaySec: 0,
    lowText: 'A dust storm is blocking the Sun. Your solar panels make very little power until it clears.',
    blurb: 'Weaker sunshine and surprise dust storms, a thin atmosphere that blocks some radiation, and Earth up to 22 minutes away by radio.'
  }
};
const DOSE = { huge: 120, big: 50, med: 15 };     // game estimate: mSv to a crew member outside, unshielded, on the Moon

/* real, plain-language facts shown at the end of each day */
const FACTS = [
  { t: 'On the Moon you would get about 1.4 millisieverts of radiation a day. That is around 200 times more than the natural background on Earth.', s: 'Chang\'e-4 Lunar Lander Neutrons and Dosimetry experiment — Zhang et al., Science Advances 6, eaaz1334 (2020)' },
  { t: 'On Mars the Curiosity rover measures about 0.64 millisieverts a day: roughly half the Moon\'s, because Mars has a thin atmosphere that blocks some radiation.', s: 'Curiosity RAD — Hassler et al., Science 343, 1244797 (2014)' },
  { t: 'Light from a solar flare reaches us in about 8 minutes. The fastest radiation particles can arrive within tens of minutes, so warnings must be quick.', s: 'NOAA Space Weather Prediction Center; NASA DONKI' },
  { t: 'Radio signals take 1.3 seconds to reach the Moon, but 3 to 22 minutes to reach Mars, depending on where the two planets are.', s: 'NASA Deep Space Network' },
  { t: 'Astronauts on the International Space Station grew red romaine lettuce. Tests showed it was safe to eat and as nutritious as lettuce grown on Earth.', s: 'NASA Veggie — Khodadad et al., Frontiers in Plant Science 11, 199 (2020)' },
  { t: 'Astronaut Scott Kelly spent 340 days in space while his twin brother stayed on Earth. Most of the changes in his body went back to normal after he landed.', s: 'NASA Twins Study — Garrett-Bakelman et al., Science 364, eaau8650 (2019)' },
  { t: 'Without gravity pulling on them, astronauts can lose about 1 to 1.5% of the bone in their hips and legs every month. That is why they exercise every day.', s: 'NASA Human Research Program' },
  { t: 'In 2018 a dust storm covered the whole of Mars. It blocked the Sun from the Opportunity rover\'s solar panels, and the rover never woke up again.', s: 'NASA Jet Propulsion Laboratory, Opportunity mission' },
  { t: 'In 2009 NASA crashed a rocket stage into a dark crater near the Moon\'s south pole. The cloud it kicked up was about 5.6% water ice.', s: 'LCROSS — Colaprete et al., Science 330, 463 (2010)' },
  { t: 'Some ridges near the Moon\'s south pole are sunlit more than 80% of the time, which is why bases are planned there.', s: 'Lunar Reconnaissance Orbiter laser altimeter — Mazarico et al., Icarus 211, 1066 (2011)' },
  { t: 'Water is a great radiation shield. NASA\'s Orion capsule has the crew build a storm shelter out of stowage bags if a solar storm hits.', s: 'NASA Orion / Artemis program' },
  { t: 'A day on Mars is called a sol. It lasts 24 hours, 39 minutes and 35 seconds.', s: 'NASA Mars Exploration Program' }
];

/* ---------------------------------------------------------------- state */
let S = null;
function flareTier(f){ return f.letter === 'X' && f.mag >= 5 ? 'huge' : f.letter === 'X' ? 'big' : 'med'; }
function newState(siteId){
  const site = SITES[siteId];
  const st = {
    site, day: 1, air: site.air, batt: site.battery, shield: 0, prog: 0, dose: 0, stars: 0,
    plan: { life: NEED, shield: 0, sci: 0 }, low: new Set(), flares: {}, events: {}, used: [],
    pump: 0, dusty: 0, dented: 0, asked: false, answer: null, phase: 'plan', minAir: site.air,
    stats: { sheltered: 0, saved: 0, worked: 0, workDose: 0, asked: 0, waited: 0, lowAirDrop: 0, wasted: 0, walks: 0 },
    delayMin: siteId === 'mars' ? rnd(3, 22) : 0, log: []
  };
  /* the low-power stretch: predictable shadow on the Moon, a surprise storm on Mars */
  const len = siteId === 'moon' ? 3 : rnd(2, 4), start = siteId === 'moon' ? rnd(6, 9) : rnd(4, 10);
  for (let d = start; d < start + len && d <= DAYS; d++) st.low.add(d);
  st.lowStart = start; st.lowEnd = Math.min(DAYS, start + len - 1);
  /* three real flares on random days */
  const fl = SS.nasa.pick(3), days = [];
  while (days.length < fl.length){ const d = rnd(3, DAYS - 1); if (days.every(x => Math.abs(x - d) > 1)) days.push(d); }
  days.forEach((d, i) => { st.flares[d] = fl[i]; });
  /* other events on about half of the remaining days */
  const deck = ['walk', 'pump', 'dust', 'request', 'meteor', 'walk', 'request'];
  for (let d = 2; d <= DAYS; d++){
    if (st.flares[d] || Math.random() > 0.55) continue;
    st.events[d] = deck.splice(Math.floor(Math.random() * deck.length), 1)[0] || null;
    if (!deck.length) break;
  }
  return st;
}
const isLow = d => S.low.has(d);
const need = () => NEED + (S.pump > 0 ? 1 : 0);
const sunToday = () => Math.max(0, (isLow(S.day) ? S.site.low : S.site.sun) - (S.dusty > 0 ? 2 : 0) - (S.dented > 0 ? 1 : 0));
const pool = () => sunToday() + S.batt;
const spent = () => S.plan.life + S.plan.shield + S.plan.sci;
const shieldF = () => 1 - 0.25 * S.shield;

/* ---------------------------------------------------------------- 3D backdrop */
function sceneFor(){
  const W = SS.world, c = SS.game.renderer && SS.game.renderer.domElement;
  const night = S && S.site.id === 'moon' && isLow(S.day);
  const s = night ? SS.story.sunForSol(13) : SS.story.sunForSol(3);
  if (!W._sun || W._sun.az !== s.az || W._sun.el !== s.el){ W.setSun(s.az, s.el); W._sun = s; }
  if (c){
    const mars = S && S.site.id === 'mars', storm = mars && isLow(S.day);
    c.style.filter = mars ? 'sepia(.6) saturate(2.3) hue-rotate(-14deg) brightness(' + (storm ? 0.62 : 0.97) + ')' : '';
  }
  const root = $('kids');
  if (root){ root.dataset.site = S ? S.site.id : ''; root.classList.toggle('storm', !!(S && S.site.id === 'mars' && isLow(S.day))); }
}

/* ---------------------------------------------------------------- DOM */
function build(){
  const r = $('kids');
  r.innerHTML =
    '<div class="k-haze"></div>' +
    '<header class="k-top">' +
      '<div class="k-day"><b id="kDay"></b><span id="kDayOf"></span></div>' +
      '<div class="k-where" id="kWhere"></div>' +
      '<div class="k-delay" id="kDelay"><span class="k-earth">🌍</span><span class="k-wire"><i id="kPulse"></i></span><span class="k-home">🏠</span><small id="kDelayTxt"></small></div>' +
      '<nav class="k-nav"><button type="button" id="kHelpB">How to play</button><button type="button" id="kDataB">Real NASA data</button><button type="button" id="kQuitB">Quit</button></nav>' +
    '</header>' +
    '<aside class="k-gauges" id="kGauges"></aside>' +
    '<main class="k-main" id="kMain" aria-live="polite"></main>' +
    '<div class="k-modal" id="kModal" hidden><div class="k-card" id="kCard" role="dialog" aria-modal="true"></div></div>' +
    '<div class="k-modal info" id="kInfo" hidden><div class="k-card wide" id="kInfoCard" role="dialog" aria-modal="true"></div></div>';
  $('kHelpB').addEventListener('click', () => showHelp());
  $('kDataB').addEventListener('click', () => showData());
  $('kQuitB').addEventListener('click', () => K.exit());
  r.addEventListener('click', onClick);
}
/* click handlers live in three scopes so re-rendering one layer never breaks another */
const H = { plan: {}, modal: {}, info: {} };
let hid = 0, scope = 'plan';
function act(fn){ const id = scope + (++hid); H[scope][id] = fn; return id; }
function setScope(s){ scope = s; H[s] = {}; }
function onClick(e){
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const id = b.dataset.act, fn = H.plan[id] || H.modal[id] || H.info[id];
  if (fn){ SS.audio.ui && SS.audio.ui('toggle'); fn(b); }
}
function actInfo(fn){ const id = 'info' + (++hid); H.info[id] = fn; return id; }
function info(html){                                 // handlers for this layer are registered with actInfo while html is built
  $('kInfoCard').innerHTML = html;
  $('kInfo').hidden = false;
  const f = $('kInfoCard').querySelector('button.primary'); if (f) f.focus({ preventScroll: true });
}
function closeInfo(){ $('kInfo').hidden = true; H.info = {}; }
function modal(html, opts){
  $('kCard').className = 'k-card' + (opts && opts.cls ? ' ' + opts.cls : '');
  $('kCard').innerHTML = html;
  const live = new Set(Array.from($('kCard').querySelectorAll('[data-act]'), b => b.dataset.act));
  for (const id in H.modal) if (!live.has(id)) delete H.modal[id];
  $('kModal').hidden = false;
  const f = $('kCard').querySelector('button.primary, button[data-act]');
  if (f) f.focus({ preventScroll: true });
}
function closeModal(){ $('kModal').hidden = true; }

/* chips that show what a choice costs or gives */
const ICON = { air: '💨', batt: '🔋', power: '⚡', shield: '🛡️', dose: '☢️', star: '⭐', time: '⏱️' };
function chip(k, v, txt){
  const good = k === 'dose' ? v < 0 : v > 0;
  return '<span class="k-chip ' + (v === 0 ? 'zero' : good ? 'good' : 'bad') + '">' + ICON[k] + ' ' + (txt || ((v > 0 ? '+' : '') + v)) + '</span>';
}

/* ---------------------------------------------------------------- gauges */
function gauges(){
  const st = S, low = st.air <= 2, hot = st.dose >= LIMIT * 0.6;
  const bar = (v, max, cls, mark) => '<div class="k-bar ' + cls + '"><i style="width:' + Math.max(0, Math.min(100, v / max * 100)).toFixed(1) + '%"></i>' + (mark ? '<b style="left:' + mark + '%"></b>' : '') + '</div>';
  $('kGauges').innerHTML =
    '<div class="k-g air' + (low ? ' alert' : '') + '"><div class="k-gh"><span>💨 Air &amp; food</span><b>' + st.air + ' day' + (st.air === 1 ? '' : 's') + '</b></div>' + bar(st.air, AIR_CAP, 'air') +
      '<small>' + (low ? 'Running low! Feed the machines more power.' : 'Supplies left if the machines stopped.') + '</small></div>' +
    '<div class="k-g batt"><div class="k-gh"><span>🔋 Battery</span><b>' + st.batt + ' / ' + BATT_CAP + ' ⚡</b></div>' + bar(st.batt, BATT_CAP, 'batt') +
      '<small>Power you saved for later.</small></div>' +
    '<div class="k-g shield"><div class="k-gh"><span>🛡️ Shield wall</span><b>Level ' + st.shield + ' / ' + SHIELD_MAX + '</b></div>' +
      '<div class="k-pips">' + [0, 1, 2].map(i => '<i class="' + (i < st.shield ? 'on' : '') + '"></i>').join('') + '</div>' +
      '<small>' + (st.shield >= SHIELD_MAX ? 'Fully built.' : 'Next level: ' + st.prog + ' / ' + SHIELD_COST + ' ⚡ built.') + ' Each level blocks 25% of storm radiation.</small></div>' +
    '<div class="k-g dose' + (hot ? ' alert' : '') + '"><div class="k-gh"><span>☢️ Crew radiation</span><b>' + st.dose.toFixed(0) + ' mSv</b></div>' + bar(st.dose, LIMIT, 'dose', 100) +
      '<small>Safety limit ' + LIMIT + ' mSv. <abbr title="millisieverts: a unit for how much radiation a body absorbs">mSv?</abbr></small></div>' +
    '<div class="k-g stars"><div class="k-gh"><span>⭐ Science stars</span><b>' + st.stars + '</b></div><small>Discoveries for scientists back on Earth.</small></div>';
  $('kDay').textContent = st.site.dayWord + ' ' + Math.min(st.day, DAYS);
  $('kDayOf').textContent = 'of ' + DAYS;
  $('kWhere').innerHTML = esc(st.site.base) + (isLow(st.day) && st.day <= DAYS ? ' <span class="k-tag">' + st.site.lowIcon + ' ' + st.site.lowName + '</span>' : '');
  $('kDelayTxt').textContent = st.site.id === 'moon' ? 'Radio delay 1.3 s' : 'Radio delay ' + st.delayMin + ' min';
}

/* ---------------------------------------------------------------- planning a day */
function preview(){
  const p = S.plan, n = need(), out = [];
  const dAir = p.life >= n + 1 ? 1 : p.life - n;
  out.push(chip('air', dAir, dAir === 0 ? 'steady' : (dAir > 0 ? '+' : '') + dAir));
  let lvl = S.shield, prog = S.prog + p.shield; while (prog >= SHIELD_COST && lvl < SHIELD_MAX){ prog -= SHIELD_COST; lvl++; }
  if (p.shield) out.push(chip('shield', lvl - S.shield, lvl > S.shield ? '+' + (lvl - S.shield) + ' level' : prog + '/' + SHIELD_COST + ' built'));
  if (p.sci) out.push(chip('star', Math.floor(p.sci / SCI_COST)));
  const left = pool() - spent(), keep = Math.min(BATT_CAP, left);
  out.push(chip('batt', keep - S.batt, 'battery ' + keep));
  if (left > BATT_CAP) out.push('<span class="k-chip bad">⚠️ ' + (left - BATT_CAP) + ' ⚡ wasted: battery full</span>');
  return out.join('');
}
function forecast(){
  const st = S, out = [];
  if (st.site.id === 'moon' && st.day < st.lowStart) out.push('🌑 <b>Forecast:</b> long shadow on days ' + st.lowStart + '–' + st.lowEnd + '. The hills block the Sun on a schedule scientists can predict, so save power before then.');
  if (st.site.id === 'mars' && !isLow(st.day) && st.day < st.lowStart) out.push('🌪️ Dust storms on Mars can start with little warning. A full battery is your safety net.');
  if (isLow(st.day)) out.push(st.site.lowIcon + ' <b>' + st.site.lowName + ':</b> ' + st.site.lowText);
  if (st.pump > 0) out.push('🔧 Greenhouse pump is clogged: the machines need <b>' + need() + ' ⚡</b> today.');
  if (st.dusty > 0) out.push('🟫 Dusty solar panels: −2 ⚡ (' + st.dusty + ' more day' + (st.dusty > 1 ? 's' : '') + ').');
  if (st.dented > 0) out.push('☄️ Dented solar panel: −1 ⚡ (' + st.dented + ' more day' + (st.dented > 1 ? 's' : '') + ').');
  return out.map(x => '<li>' + x + '</li>').join('');
}
function row(key, icon, label, hint, max){
  const v = S.plan[key], room = pool() - spent();
  const dots = Array.from({ length: Math.max(v, 1) }, (_, i) => '<i class="' + (i < v ? 'on' : '') + '"></i>').join('');
  return '<div class="k-row ' + key + '"><div class="k-rl"><span class="k-ri">' + icon + '</span><div><b>' + label + '</b><small>' + hint + '</small></div></div>' +
    '<div class="k-stepper"><button type="button" aria-label="Less power to ' + label + '" data-act="' + act(() => { if (S.plan[key] > 0){ S.plan[key]--; plan(); } }) + '"' + (v <= 0 ? ' disabled' : '') + '>−</button>' +
    '<span class="k-v" aria-label="' + v + ' power">' + v + '</span>' +
    '<button type="button" aria-label="More power to ' + label + '" data-act="' + act(() => { if (pool() - spent() > 0 && S.plan[key] < max){ S.plan[key]++; plan(); } }) + '"' + (room <= 0 || v >= max ? ' disabled' : '') + '>+</button></div>' +
    '<div class="k-dots">' + dots + '</div></div>';
}
function plan(){
  S.phase = 'plan';
  setScope('plan');
  gauges(); sceneFor();
  const p = pool(), left = p - spent(), n = need();
  const shieldMax = S.shield >= SHIELD_MAX ? 0 : 12;
  $('kMain').innerHTML =
    '<section class="k-plan">' +
      '<header><div><div class="k-kick">Plan ' + S.site.dayWord.toLowerCase() + ' ' + S.day + '</div><h2>Share out today\'s power</h2></div>' +
      '<div class="k-pool"><span>☀️ ' + sunToday() + '</span><span>+ 🔋 ' + S.batt + '</span><b>= ' + p + ' ⚡</b></div></header>' +
      (S.day === 1 ? '<p class="k-coach">Every day the solar panels make some power ⚡. Tap <b>+</b> and <b>−</b> to share it out. Whatever you don\'t use is saved in the battery.</p>' : '') +
      (S.answer && S.answer.day === S.day ? '<div class="k-answer">📡 <b>Answer from Mission Control</b>' + (S.site.id === 'mars' ? ' <small>(to the question you sent yesterday)</small>' : '') + '<p>' + S.answer.text + '</p></div>' : '') +
      '<ul class="k-forecast">' + forecast() + '</ul>' +
      row('life', '💨', 'Air &amp; food machines', 'Need ' + n + ' ⚡ a day to keep 4 people breathing and fed. Give ' + (n + 1) + ' to grow extra.', 6) +
      row('shield', '🛡️', 'Build the shield wall', S.shield >= SHIELD_MAX ? 'Fully built!' : 'Piles moondust around the base. ' + SHIELD_COST + ' ⚡ = 1 level (' + S.prog + '/' + SHIELD_COST + ' so far).', shieldMax) +
      row('sci', '🔬', 'Science experiments', SCI_COST + ' ⚡ = 1 ⭐. This is why the crew is here!', 12) +
      '<div class="k-left">' + (left > 0 ? '<b>' + left + ' ⚡</b> left over → goes to the battery' : 'All power is shared out.') + '</div>' +
      '<div class="k-preview"><span>By tonight:</span>' + preview() + '</div>' +
      (S.plan.life < n ? '<p class="k-warn">⚠️ The machines need ' + n + ' ⚡. With ' + S.plan.life + ' you will use up ' + (n - S.plan.life) + ' day' + (n - S.plan.life > 1 ? 's' : '') + ' of stored air &amp; food.</p>' : '') +
      '<footer><button type="button" class="k-ask" data-act="' + act(ask) + '"' + (S.asked ? ' disabled' : '') + '>📡 ' + (S.asked ? 'Question sent' : 'Ask Mission Control') + '</button>' +
      '<button type="button" class="primary" data-act="' + act(runDay) + '">Start the ' + S.site.dayWord.toLowerCase() + ' ▶</button></footer>' +
    '</section>';
  scope = 'modal';
}

/* ---------------------------------------------------------------- talking to Earth: the delay is the lesson */
function tip(){
  const st = S;
  if (st.site.id === 'moon' && st.day < st.lowStart && st.lowStart - st.day <= 3 && st.batt < 6) return 'The long shadow starts on day ' + st.lowStart + '. Fill the battery now: you will need about ' + (NEED - st.site.low) * (st.lowEnd - st.lowStart + 1) + ' ⚡ saved to keep the air machines running.';
  if (st.air <= 3) return 'Your air and food stores are low. Give the machines ' + (need() + 1) + ' ⚡ for a few days so the greenhouse grows extra.';
  if (st.dose > LIMIT * 0.5) return 'Your crew has had a lot of radiation. If a solar storm comes, take shelter even if it costs you science.';
  if (st.shield === 0) return 'A shield wall cuts the radiation from every solar storm. It is slow to build, so starting early pays off.';
  if (st.batt < 3 && st.site.id === 'mars') return 'Keep some power in the battery. If a dust storm starts, the Sun will not help you for days.';
  return 'Looking good! Spare power can go into science. That is how you earn stars for the team on Earth.';
}
function ask(){
  if (S.asked) return;
  S.asked = true; S.stats.asked++;
  const text = tip();
  const pulse = $('kPulse');
  if (S.site.id === 'moon'){
    pulse.className = 'go'; pulse.style.animationDuration = '1.3s';
    plan();
    const at = $('kMain').querySelector('.k-ask'); if (at) at.textContent = '📡 Waiting 1.3 s for the reply…';
    setTimeout(() => { pulse.className = ''; S.answer = { day: S.day, text }; if (S.phase === 'plan') plan(); }, 2600);
  } else {
    pulse.className = 'go slow';
    S.answer = { day: S.day + 1, text };
    plan();
    const at = $('kMain').querySelector('.k-ask');
    if (at) at.textContent = '📡 Sent! The reply needs ' + S.delayMin * 2 + ' min round trip, so it arrives next sol';
  }
}

/* ---------------------------------------------------------------- running a day */
function runDay(){
  const st = S, p = st.plan, n = need(), l = [];
  const sun = sunToday(), total = sun + st.batt, left = total - spent();
  st.batt = Math.min(BATT_CAP, left);
  if (left > BATT_CAP){ st.stats.wasted += left - BATT_CAP; l.push(['bad', '⚡ ' + (left - BATT_CAP) + ' power wasted: the battery was already full.']); }
  const dAir = p.life >= n + 1 ? 1 : p.life - n;
  st.air = Math.min(AIR_CAP, st.air + dAir);
  if (dAir > 0) l.push(['good', '💨 The greenhouse grew extra food. Air &amp; food +1.']);
  else if (dAir < 0){ l.push(['bad', '💨 The machines were short of power. Air &amp; food ' + dAir + '.']); if (isLow(st.day)) st.stats.lowAirDrop -= dAir; }
  else l.push(['', '💨 The machines kept everyone breathing and fed.']);
  if (p.shield){
    st.prog += p.shield;
    let up = 0; while (st.prog >= SHIELD_COST && st.shield < SHIELD_MAX){ st.prog -= SHIELD_COST; st.shield++; up++; }
    if (st.shield >= SHIELD_MAX) st.prog = 0;
    l.push(['good', up ? '🛡️ The shield wall is now level ' + st.shield + '!' : '🛡️ Shield work: ' + st.prog + '/' + SHIELD_COST + ' towards the next level.']);
  }
  const cosmic = st.site.cosmic * (1 - 0.2 * st.shield);
  st.dose += cosmic;
  l.push(['', '☢️ Everyday space radiation: +' + cosmic.toFixed(1) + ' mSv' + (st.shield ? ' (the shield wall blocked some).' : '.')]);
  st.today = { sci: Math.floor(p.sci / SCI_COST), log: l };
  st.minAir = Math.min(st.minAir, st.air);
  if (st.pump > 0) st.pump--;
  if (st.dusty > 0) st.dusty--;
  if (st.dented > 0) st.dented--;
  gauges();
  const f = st.flares[st.day], e = st.events[st.day];
  if (f) flareEvent(f);
  else if (e && EVENTS[e]) EVENTS[e]();
  else summary();
}
function choice(label, chips, fn, cls){ return '<button type="button" class="k-choice' + (cls ? ' ' + cls : '') + '" data-act="' + act(fn) + '"><b>' + label + '</b><span class="k-chips">' + chips.join('') + '</span></button>'; }
function eventCard(icon, title, body, choices, extra){
  modal('<div class="k-ev-icon">' + icon + '</div><div class="k-kick">' + esc(S.site.dayWord + ' ' + S.day) + '</div><h2>' + title + '</h2><p>' + body + '</p>' + (extra || '') + '<div class="k-choices">' + choices.join('') + '</div>');
}
function done(msg, cls){ S.today.log.push([cls || '', msg]); closeModal(); summary(); }

/* solar flares: real DONKI events */
function flareEvent(f, asked){
  const st = S, tier = flareTier(f);
  const base = DOSE[tier] * st.site.flareMul * shieldF();
  const out = Math.round(base * 10) / 10, inside = Math.round(base * 0.15 * 10) / 10;
  const size = tier === 'huge' ? 'a HUGE' : tier === 'big' ? 'a big' : 'a medium';
  const real = '<div class="k-real"><b>📡 This flare really happened.</b> ' + esc(f.cls) + '-class flare' + (f.date ? ' on ' + fmtDate(f.date) : '') + (f.region ? ', from sunspot group ' + esc(f.region) : '') + '. ' + (f.note ? esc(f.note) + ' ' : '') +
    '<span class="k-src">Source: NASA DONKI ' + (f.source === 'live' ? '(downloaded live today)' : '(archived record: no live connection)') + '</span></div>';
  const sci = st.today.sci;
  const choices = [
    choice('Everyone into the storm shelter', [chip('dose', inside, '+' + inside + ' mSv'), chip('star', -sci, sci ? 'lose today\'s ' + sci + ' ⭐' : 'no work today'), chip('batt', -1)], () => {
      st.dose += inside; st.batt = Math.max(0, st.batt - 1); st.stats.sheltered++; st.stats.saved += out - inside; st.today.sci = 0;
      done('🛡️ You sheltered from the ' + f.cls + ' flare. Radiation +' + inside + ' mSv instead of +' + out + '. The shelter\'s fans used 1 🔋.', 'good');
    }, 'safe'),
    choice('Keep working outside', [chip('dose', out, '+' + out + ' mSv'), chip('star', 2)], () => {
      st.dose += out; st.stars += 2; st.stats.worked++; st.stats.workDose += out;
      done('🔬 You kept working through the ' + f.cls + ' flare: +2 ⭐, but radiation +' + out + ' mSv.', 'bad');
    })
  ];
  if (!asked){
    if (st.site.id === 'moon') choices.push(choice('Ask Mission Control first', [chip('time', 0, '1.3 s each way')], () => {
      modal('<div class="k-ev-icon">📡</div><h2>Calling Earth…</h2><div class="k-delay big"><span>🏠</span><span class="k-wire"><i class="go"></i></span><span>🌍</span></div><p>The radio signal is crossing 384,000 km at the speed of light.</p>');
      setTimeout(() => {
        const say = tier === 'med' && st.dose < LIMIT * 0.5 ? 'This one is medium-sized. You can choose either way, but stay close to the shelter.' : 'Forecasters expect a radiation storm from this one. We recommend the shelter.';
        flareEvent(f, '<div class="k-answer">📡 <b>Mission Control (2.6 s later):</b> “' + say + '”</div>');
      }, 2700);
    }));
    else {
      const half = Math.round(out * 0.5 * 10) / 10;
      choices.push(choice('Wait for Mission Control\'s advice', [chip('time', 0, st.delayMin * 2 + ' min round trip'), chip('dose', half, '+' + half + ' mSv while you wait'), chip('star', -sci, sci ? 'lose ' + sci + ' ⭐' : 'no work')], () => {
        st.dose += half; st.stats.waited++; st.today.sci = 0;
        done('📡 Your question took ' + st.delayMin + ' minutes to reach Earth and the answer took ' + st.delayMin + ' more. By then the particles had arrived: +' + half + ' mSv before you reached the shelter. On Mars, crews have to decide for themselves.', 'bad');
      }));
    }
  }
  const body = st.site.id === 'moon'
    ? 'Mission Control spotted ' + size + ' solar flare. Fast radiation particles could reach the base within the hour. Your shield wall (level ' + st.shield + ') will help, but the shelter blocks much more.'
    : 'Your own sensors spot ' + size + ' solar flare. Mars\' thin air blocks some of the particles, but not all. Earth is ' + st.delayMin + ' radio-minutes away, so any advice will come late.';
  eventCard('☀️', 'Solar flare!', body, choices, (typeof asked === 'string' ? asked : '') + real);
}

const EVENTS = {
  walk(){
    const moon = S.site.id === 'moon', d = moon ? 3 : 1.5;
    eventCard('👩‍🚀', moon ? 'Ice in the dark crater!' : 'A rock from the old lake!', moon
      ? 'Orbiting spacecraft have spotted signs of ice in a crater nearby. A moonwalk to collect a sample would be a big discovery, but spacesuits use oxygen and there is no shield outside.'
      : 'The crew spots layered rock like the lake-bed rocks Perseverance has been collecting. A spacewalk to sample it would thrill scientists, but suits use oxygen and there is no shield outside.', [
      choice('Go and collect it', [chip('star', 3), chip('air', -1), chip('dose', d, '+' + d + ' mSv')], () => { S.stars += 3; S.air = Math.max(0, S.air - 1); S.dose += d; S.stats.walks++; done('👩‍🚀 Sample collected! +3 ⭐. Spacesuit oxygen −1 air &amp; food, radiation +' + d + ' mSv.', 'good'); }),
      choice('Stay inside', [chip('star', 0, 'miss the discovery')], () => done('🏠 You played it safe. The discovery will have to wait.'))
    ]);
  },
  pump(){
    eventCard('🔧', 'The greenhouse pump is clogged', 'Plant roots have blocked the water pump. Fixing it takes a lot of power. If you leave it, the machines have to work harder for a few days.', [
      choice('Fix it now', [chip('batt', -2)], () => { S.batt = Math.max(0, S.batt - 2); done('🔧 Pump fixed, using 2 🔋.'); }),
      choice('Fix it later', [chip('power', 1, 'machines need 5 ⚡ for 3 days')], () => { S.pump = 3; done('🔧 The machines will need 5 ⚡ a day for the next 3 days.', 'bad'); })
    ]);
  },
  dust(){
    const moon = S.site.id === 'moon';
    eventCard('🟫', 'Dusty solar panels', moon ? 'Moondust kicked up by the rover has settled on the solar panels. Moondust is sharp and sticky.' : 'Wind has blown fine red dust over the solar panels.', [
      choice('Spacewalk to clean them', [chip('air', -1), chip('dose', 1.5, '+1.5 mSv')], () => { S.air = Math.max(0, S.air - 1); S.dose += 1.5; S.stats.walks++; done('🧹 Panels cleaned. Suit oxygen −1 air &amp; food, radiation +1.5 mSv.'); }),
      choice('Leave the dust', [chip('power', -2, '−2 ⚡ for 3 days')], () => { S.dusty = 3; done('🟫 The panels will make 2 ⚡ less for 3 days.', 'bad'); })
    ]);
  },
  request(){
    const mars = S.site.id === 'mars';
    eventCard('🧪', 'Scientists on Earth have a request', 'They want the crew to run an extra experiment on how plants grow in low gravity.' + (mars ? ' (Their message was sent ' + S.delayMin + ' minutes ago.)' : ''), [
      choice('Run the experiment', [chip('batt', -3), chip('star', 3)], () => { if (S.batt < 3){ S.today.log.push(['bad', '🔋 Not enough battery: you ran a smaller version for +1 ⭐.']); S.stars += 1; S.batt = 0; closeModal(); summary(); return; } S.batt -= 3; S.stars += 3; done('🧪 Experiment done: +3 ⭐ for 3 🔋.', 'good'); }),
      choice('Say no for now', [chip('star', 0, 'no stars')], () => done('🧪 You kept your battery for safety.'))
    ]);
  },
  meteor(){
    eventCard('☄️', 'A tiny meteorite hit a solar panel', 'Space rocks the size of a grain of sand hit at many kilometres per second. One has dented a panel.', [
      choice('Repair it', [chip('batt', -2)], () => { S.batt = Math.max(0, S.batt - 2); done('🔧 Panel repaired using 2 🔋.'); }),
      choice('Leave it', [chip('power', -1, '−1 ⚡ for 4 days')], () => { S.dented = 4; done('☄️ The dented panel makes 1 ⚡ less for 4 days.', 'bad'); })
    ]);
  }
};

/* ---------------------------------------------------------------- end of a day */
function summary(){
  const st = S;
  st.today.sci && (st.stars += st.today.sci, st.today.log.push(['good', '🔬 Experiments finished: +' + st.today.sci + ' ⭐.']));
  st.today.sci = 0;
  gauges();
  const fact = FACTS[(st.day * 5 + (st.site.id === 'mars' ? 1 : 0)) % FACTS.length];
  const over = st.air <= 0 ? 'air' : st.dose >= LIMIT ? 'dose' : st.day >= DAYS ? 'done' : null;
  modal('<div class="k-kick">End of ' + st.site.dayWord.toLowerCase() + ' ' + st.day + '</div><h2>' + (over === 'done' ? 'Mission complete!' : over ? 'Time to go home' : 'Day report') + '</h2>' +
    '<ul class="k-log">' + st.today.log.map(x => '<li class="' + x[0] + '">' + x[1] + '</li>').join('') + '</ul>' +
    '<div class="k-fact"><b>🔭 Real science</b><p>' + esc(fact.t) + '</p><small>' + esc(fact.s) + '</small></div>' +
    '<div class="k-choices"><button type="button" class="primary" data-act="' + act(() => { closeModal(); if (over) report(over); else nextDay(); }) + '">' + (over ? 'See the mission report' : 'Next ' + st.site.dayWord.toLowerCase() + ' ▶') + '</button></div>');
}
function nextDay(){
  const st = S;
  st.day++; st.asked = false;
  st.plan = { life: Math.min(need(), pool()), shield: 0, sci: 0 };
  plan();
  if (st.site.id === 'mars' && st.day === st.lowStart){
    eventCard('🌪️', 'A dust storm has started!', 'Dust is filling the sky. Your solar panels will make only ' + st.site.low + ' ⚡ a day until it clears, and nobody can say exactly when that will be.', [
      choice('Get ready', [chip('power', -(st.site.sun - st.site.low), 'less sun for a while')], () => closeModal())
    ]);
  }
}

/* ---------------------------------------------------------------- report */
function report(why){
  const st = S, ok = why === 'done', d = st.stats;
  const medal = !ok ? null : st.stars >= 18 ? ['🥇', 'Gold'] : st.stars >= 12 ? ['🥈', 'Silver'] : ['🥉', 'Bronze'];
  const learn = [];
  if (d.sheltered) learn.push('You went to the shelter ' + d.sheltered + ' time' + (d.sheltered > 1 ? 's' : '') + ' and avoided ' + d.saved.toFixed(0) + ' mSv of radiation, at the cost of a day\'s work each time. Real crews plan for exactly this trade.');
  if (d.worked) learn.push('You worked through ' + d.worked + ' solar flare' + (d.worked > 1 ? 's' : '') + ' and took ' + d.workDose.toFixed(0) + ' mSv for the extra stars. Radiation adds up over a career, so astronauts have a lifetime limit.');
  if (st.shield) learn.push('Your shield wall (level ' + st.shield + ') blocked radiation every day. Future bases may pile up moondust or use water for the same reason.');
  else learn.push('You never built a shield wall. It is slow and costly to build, but it protects the crew on every day after.');
  if (d.lowAirDrop) learn.push('During the ' + st.site.lowName.toLowerCase() + ' your air &amp; food dropped by ' + d.lowAirDrop + '. Saving power before a dark spell is one of the hardest parts of living on solar power.');
  else learn.push('You got through the ' + st.site.lowName.toLowerCase() + ' without running short. That takes planning ahead!');
  if (st.site.id === 'mars') learn.push('Radio messages took ' + st.delayMin + ' minutes each way. On Mars, the crew has to make urgent decisions without waiting for Earth.');
  if (d.wasted) learn.push(d.wasted + ' ⚡ went to waste because the battery was full. Spending spare power on science or the shield is better than wasting it.');
  const flares = Object.keys(st.flares).sort((a, b) => a - b).map(k => st.flares[k]);
  const why2 = why === 'air' ? 'The base ran out of air &amp; food, so the crew flew home early in their spaceship. Nobody was hurt, but the mission ended on ' + st.site.dayWord.toLowerCase() + ' ' + st.day + '.'
    : why === 'dose' ? 'The crew reached the radiation safety limit, so they flew home early to stay healthy. The mission ended on ' + st.site.dayWord.toLowerCase() + ' ' + st.day + '.'
    : 'All four crew members stayed safe for ' + DAYS + ' ' + st.site.dayWord.toLowerCase() + 's on ' + st.site.name + '.';
  modal('<div class="k-report"><div class="k-medal">' + (medal ? medal[0] : '🚀') + '</div>' +
    '<div class="k-kick">' + esc(st.site.base) + ' · mission report</div>' +
    '<h2>' + (ok ? medal[1] + ' mission!' : 'Crew safely home') + '</h2><p>' + why2 + '</p>' +
    '<div class="k-stats"><div><b>' + st.stars + '</b><small>⭐ science stars</small></div><div><b>' + st.dose.toFixed(0) + '</b><small>☢️ mSv radiation</small></div><div><b>' + st.minAir + '</b><small>💨 lowest air &amp; food</small></div><div><b>' + st.shield + '</b><small>🛡️ shield level</small></div></div>' +
    '<h3>What you learned</h3><ul class="k-learn">' + learn.map(x => '<li>' + x + '</li>').join('') + '</ul>' +
    '<h3>Real NASA data in this mission</h3><ul class="k-learn data">' + flares.map(f => '<li>☀️ ' + esc(f.cls) + ' flare' + (f.date ? ', ' + fmtDate(f.date) : '') + ' <small>NASA DONKI · ' + (f.source === 'live' ? 'live' : 'archived') + '</small></li>').join('') +
      '<li>☢️ Everyday radiation: ' + st.site.cosmic + ' mSv a day <small>' + (st.site.id === 'moon' ? 'Chang\'e-4 LND, 2020' : 'Curiosity RAD, 2014') + '</small></li></ul>' +
    '<p class="k-try">' + (ok ? 'Every mission is different: new flares, new surprises. Can you beat ' + st.stars + ' stars?' : 'Every mission is different. Try again with a new plan!') + '</p>' +
    '<div class="k-choices row">' +
      '<button type="button" class="primary" data-act="' + act(() => start(st.site.id)) + '">Play again</button>' +
      '<button type="button" data-act="' + act(() => start(st.site.id === 'moon' ? 'mars' : 'moon')) + '">Try ' + (st.site.id === 'moon' ? 'Mars' : 'the Moon') + '</button>' +
      '<button type="button" data-act="' + act(() => K.exit()) + '">Main menu</button></div></div>', { cls: 'wide' });
}

/* ---------------------------------------------------------------- info screens */
function showHelp(){
  info('<div class="k-kick">How to play</div><h2>Keep your crew safe for ' + DAYS + ' days</h2>' +
    '<ol class="k-how"><li><b>⚡ Share out the power.</b> Your solar panels make power every day. Spend it on the air &amp; food machines, the shield wall or science. Leftovers go in the battery.</li>' +
    '<li><b>💨 Air &amp; food</b> must never reach zero. The machines need 4 ⚡ a day, and giving them 5 grows extra.</li>' +
    '<li><b>☢️ Radiation</b> comes from space every day, and in big bursts when the Sun flares. The <b>🛡️ shield wall</b> and the storm shelter protect your crew.</li>' +
    '<li><b>📡 Earth is far away.</b> Radio messages travel at the speed of light: 1.3 seconds to the Moon, up to 22 minutes to Mars.</li>' +
    '<li><b>⭐ Science stars</b> are why you are there. Earn as many as you can without putting the crew in danger.</li></ol>' +
    '<p>There is no choice that costs nothing. Every mission is different, so if things go wrong, try a new plan!</p>' +
    '<div class="k-choices"><button type="button" class="primary" data-act="' + actInfo(closeInfo) + '">Got it</button></div>');
}
function showData(){
  const N = SS.nasa, w = N.week;
  const live = N.status === 'live';
  info('<div class="k-kick">Real NASA data</div><h2>Where the numbers come from</h2>' +
    '<div class="k-real ' + (live ? 'live' : 'arch') + '"><b>' + (live ? '🟢 Live: NASA DONKI space weather' : N.status === 'loading' ? '⏳ Connecting to NASA DONKI…' : '🟠 Archived: no live connection') + '</b><br>' +
      (live ? 'Solar flares in this game are real flares from the past 60 days, downloaded from NASA\'s DONKI database' + (N.fetchedAt ? ' at ' + new Date(N.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '') + '.' +
        (w ? ' In the last 7 days the Sun produced <b>' + w.count + '</b> M- or X-class flare' + (w.count === 1 ? '' : 's') + (w.strongest ? ', strongest ' + esc(w.strongest.cls) + ' on ' + fmtDate(w.strongest.date) : '') + '.' : '')
        : 'The game could not reach NASA DONKI' + (N.error ? ' (' + esc(N.error) + ')' : '') + ', so it is using an archive of ' + N.ARCHIVE.length + ' real, famous flares from NASA records. These are real events, but not today\'s.') + '</div>' +
    '<table class="k-src-table"><tr><th>In the game</th><th>Real source</th></tr>' +
      '<tr><td>☀️ Solar flares: dates, sizes, sunspot groups</td><td>NASA DONKI, Space Weather Database (api.nasa.gov)</td></tr>' +
      '<tr><td>☢️ Everyday radiation on the Moon: 1.37 mSv a day</td><td>Chang\'e-4 LND, Zhang et al., Science Advances 2020</td></tr>' +
      '<tr><td>☢️ Everyday radiation on Mars: 0.64 mSv a day</td><td>Curiosity RAD, Hassler et al., Science 2014</td></tr>' +
      '<tr><td>⚠️ Radiation safety limit: 250 mSv</td><td>NASA-STD-3001, 30-day limit for blood-forming organs</td></tr>' +
      '<tr><td>📡 Radio delay: Moon 1.3 s, Mars 3–22 min</td><td>Speed of light over the real distances (NASA Deep Space Network)</td></tr>' +
      '<tr><td>🌑 Predictable shadows at the Moon\'s south pole</td><td>Lunar Reconnaissance Orbiter illumination maps</td></tr>' +
      '<tr><td>🌪️ Surprise dust storms on Mars</td><td>2018 global dust storm, Opportunity rover (NASA JPL)</td></tr>' +
      '<tr><td>🥬 Growing food, astronaut health facts</td><td>NASA Veggie, Twins Study, Human Research Program. Explore the data at osdr.nasa.gov</td></tr>' +
    '</table>' +
    '<p class="k-fine"><b>Simplified for the game:</b> radiation from a solar flare is an estimate scaled by flare size (big flares often, but not always, cause radiation storms). The power numbers are game units, the mission lasts 15 days, and the crew is 4 people.</p>' +
    '<div class="k-choices"><button type="button" class="primary" data-act="' + actInfo(closeInfo) + '">Back</button></div>');
}

/* ---------------------------------------------------------------- start / setup / exit */
function setup(){
  S = null; sceneFor(); setScope('plan');
  $('kGauges').innerHTML = ''; $('kMain').innerHTML = '';
  $('kDay').textContent = ''; $('kDayOf').textContent = ''; $('kWhere').textContent = ''; $('kDelayTxt').textContent = '';
  const N = SS.nasa;
  const wx = N.status === 'live' && N.week ? '🟢 Real space weather, last 7 days: <b>' + N.week.count + '</b> M- or X-class solar flare' + (N.week.count === 1 ? '' : 's') + (N.week.strongest ? ' (strongest ' + esc(N.week.strongest.cls) + ')' : '') + '. Source: NASA DONKI.'
    : N.status === 'loading' ? '⏳ Checking today\'s real space weather with NASA…'
    : '🟠 Offline: using real flares from NASA\'s archive.';
  const card = id => { const s = SITES[id]; return '<button type="button" class="k-site ' + id + '" data-act="' + act(() => start(id)) + '"><span class="k-planet"></span><b>' + (id === 'moon' ? 'The Moon' : 'Mars') + '</b><small>' + s.blurb + '</small><em>' + (id === 'moon' ? 'Good first mission' : 'Harder') + '</em></button>'; };
  modal('<div class="k-kick">New mission · ages 7–12</div><h2>Where will you build your base?</h2>' +
    '<p>You are in charge of a base with 4 astronauts for ' + DAYS + ' days. Keep them breathing, fed and safe from radiation, and make discoveries along the way.</p>' +
    '<div class="k-sites">' + card('moon') + card('mars') + '</div>' +
    '<p class="k-wx" id="kWx">' + wx + '</p>' +
    '<div class="k-choices row"><button type="button" data-act="' + act(() => showHelp()) + '">How to play</button><button type="button" data-act="' + act(() => showData()) + '">Real NASA data</button><button type="button" data-act="' + act(() => K.exit()) + '">Back</button></div>', { cls: 'wide' });
}
function start(siteId){
  closeModal();
  S = newState(siteId);
  S.plan.life = Math.min(NEED, pool());
  plan();
}

K.open = function(opts){
  opts = opts || {};
  K.onExit = opts.onExit;
  const r = $('kids');
  if (!r.firstChild) build();
  r.hidden = false; K.active = true;
  SS.nasa.load().then(() => { const w = $('kWx'); if (w && !S && !$('kModal').hidden) setup(); });
  setup();
};
K.exit = function(){
  K.active = false; S = null;
  $('kids').hidden = true; closeModal(); closeInfo();
  const c = SS.game.renderer && SS.game.renderer.domElement; if (c) c.style.filter = '';
  const W = SS.world, s = SS.story.sunForSol(3);
  if (!W._sun || W._sun.az !== s.az || W._sun.el !== s.el){ W.setSun(s.az, s.el); W._sun = s; }
  if (K.onExit) K.onExit();
};
K.key = function(k){
  if (k === 'escape'){ if (!$('kInfo').hidden) closeInfo(); else K.exit(); return true; }
  return false;
};
K.state = () => S;
})();
