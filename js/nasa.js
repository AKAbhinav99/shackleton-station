/* Shackleton Station — real NASA data for the kids' mission.
   Solar flares come from NASA DONKI (Space Weather Database Of Notifications, Knowledge, Information).
   The game asks DONKI for the past year of flares. If the request fails (offline, rate limit, blocked),
   it falls back to an archive of real, well-documented flares and says so on screen: archived data
   is never shown as live. */
(function(){
'use strict';
const SS = window.SS;
const N = SS.nasa = { status: 'idle', source: 'archive', flares: [], week: null, fetchedAt: null, error: null };

/* Real flares from NASA/NOAA records. Peak class from GOES X-ray measurements. */
N.ARCHIVE = [
  { date: '2024-10-03', cls: 'X9.0', region: '13842', note: 'The biggest flare of Solar Cycle 25 so far.' },
  { date: '2024-10-01', cls: 'X7.1', region: '13842', note: 'Same sunspot group, two days earlier.' },
  { date: '2024-05-14', cls: 'X8.7', region: '13664', note: 'From the sunspot group behind the May 2024 auroras.' },
  { date: '2024-05-11', cls: 'X5.8', region: '13664', note: 'Part of the storm that made auroras visible far from the poles.' },
  { date: '2024-02-22', cls: 'X6.3', region: '13590', note: 'One of the strongest flares of early 2024.' },
  { date: '2023-12-14', cls: 'X2.8', region: null, note: 'Disrupted radio signals on Earth for about an hour.' },
  { date: '2021-10-28', cls: 'X1.0', region: '12887', note: 'Sent fast particles all the way to Earth\'s ground.' },
  { date: '2017-09-10', cls: 'X8.2', region: '12673', note: 'Caused a radiation storm seen by Curiosity on Mars.' },
  { date: '2017-09-06', cls: 'X9.3', region: '12673', note: 'The strongest flare of Solar Cycle 24.' },
  { date: '2003-10-28', cls: 'X17.2', region: '10486', note: 'One of the famous Halloween 2003 storms.' },
  { date: '2003-11-04', cls: 'X28', region: '10486', note: 'So strong it overloaded the measuring instruments: about X28.' }
];

N.parseClass = function(c){
  const m = /^([ABCMX])(\d+(?:\.\d+)?)/.exec(c || '');
  if (!m) return null;
  const mag = +m[2];
  return { letter: m[1], mag, score: { A: 0, B: 1, C: 2, M: 3, X: 4 }[m[1]] * 100 + mag };
};
const ymd = d => d.toISOString().slice(0, 10);
const CACHE = 'donki.flr.v2', MAX_AGE = 60 * 60 * 1000;   // cache an hour: DEMO_KEY allows only ~10 requests an hour
const KEY = (function(){ try { return new URLSearchParams(location.search).get('nasakey') || 'DEMO_KEY'; } catch (e){ return 'DEMO_KEY'; } })();
const SPAN = 60;                                          // DONKI rejects ranges longer than 60 days

/* DONKI notifications carry flare reports as text: pull class, date and sunspot region out of them */
function fromNotifications(list){
  return list.map(n => {
    const b = n.messageBody || '';
    const c = /\b([MX]\d+(?:\.\d+)?)\b/.exec(b);
    if (!c) return null;
    const pk = /peak[^0-9]{0,40}(\d{4}-\d{2}-\d{2})T?(\d{2}:\d{2})?/i.exec(b) || /(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(b);
    const ar = /active region\s*(?:\(AR\)\s*)?#?(\d{4,5})/i.exec(b);
    const t = n.messageIssueTime || '';
    return { classType: c[1], peakTime: pk ? pk[1] + 'T' + (pk[2] || '00:00') + 'Z' : t, activeRegionNum: ar ? ar[1] : null, link: n.messageURL || null };
  }).filter(Boolean).filter((f, i, a) => a.findIndex(g => g.classType === f.classType && (g.peakTime || '').slice(0, 13) === (f.peakTime || '').slice(0, 13)) === i);
}

function archive(){
  return N.ARCHIVE.map(f => Object.assign({ time: null, link: 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/search/', source: 'archive' }, f, N.parseClass(f.cls)));
}
function digest(list, now){
  const fl = list.map(f => {
    const c = N.parseClass(f.classType), t = f.peakTime || f.beginTime || '';
    return c && Object.assign({ date: t.slice(0, 10), time: t.slice(11, 16), cls: f.classType, region: f.activeRegionNum ? String(f.activeRegionNum) : null, link: f.link || null, source: 'live', note: null }, c);
  }).filter(f => f && (f.letter === 'M' || f.letter === 'X'));
  const since = ymd(new Date(now - 7 * 864e5));
  const wk = fl.filter(f => f.date >= since).sort((a, b) => b.score - a.score);
  return { flares: fl, week: { count: wk.length, strongest: wk[0] || null } };
}

N.load = function(){
  if (N._p) return N._p;
  const now = Date.now();
  const cached = SS.store.get(CACHE, null);
  if (cached && now - cached.at < MAX_AGE && cached.list && cached.list.length){
    Object.assign(N, digest(cached.list, cached.at), { status: 'live', source: 'live', fetchedAt: cached.at });
    if (N.flares.length) return (N._p = Promise.resolve(N));
  }
  N.status = 'loading';
  const range = 'startDate=' + ymd(new Date(now - SPAN * 864e5)) + '&endDate=' + ymd(new Date(now)) + '&api_key=' + encodeURIComponent(KEY);
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const to = setTimeout(() => ctl && ctl.abort(), 10000);
  const get = path => fetch('https://api.nasa.gov/DONKI/' + path + range, ctl ? { signal: ctl.signal } : {})
    .then(r => { if (!r.ok){ const e = new Error(r.status === 429 ? 'NASA rate limit reached, try again in an hour' : 'DONKI answered ' + r.status); e.status = r.status; throw e; } return r.json(); });
  /* the flare catalogue first; if that endpoint is down, the notifications feed reports the same flares */
  N._p = get('FLR?')
    .catch(e => { if (e.status === 429 || e.name === 'AbortError') throw e; return get('notifications?type=FLR&').then(fromNotifications); })
    .then(list => {
      if (!Array.isArray(list)) throw new Error('unexpected reply');
      const d = digest(list, now);
      if (!d.flares.length) throw new Error('no M or X flares in the past ' + SPAN + ' days');
      Object.assign(N, d, { status: 'live', source: 'live', fetchedAt: now });
      SS.store.set(CACHE, { at: now, list: list.map(f => ({ classType: f.classType, peakTime: f.peakTime, beginTime: f.beginTime, activeRegionNum: f.activeRegionNum, link: f.link })) });
    })
    .catch(e => {
      Object.assign(N, { status: 'offline', source: 'archive', flares: archive(), week: null, error: String(e && e.message || e) });
    })
    .then(() => { clearTimeout(to); SS.emit('nasa', N); return N; });
  return N._p;
};

/* n flares for one playthrough: drawn from the strongest of the year, at least one X-class when there is one */
N.pick = function(n){
  const pool = N.flares.slice().sort((a, b) => b.score - a.score).slice(0, 24);
  const out = [];
  const xs = pool.filter(f => f.letter === 'X');
  if (xs.length) out.push(xs[Math.floor(Math.random() * xs.length)]);
  while (out.length < n && out.length < pool.length){
    const f = pool[Math.floor(Math.random() * pool.length)];
    if (out.indexOf(f) < 0) out.push(f);
  }
  return out;
};
})();
