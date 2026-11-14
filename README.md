# Shackleton Station

A browser game for kids aged 7–12: run a base on the Moon or Mars with four astronauts, and keep them breathing, fed and safe from radiation for 15 days. Built for the NASA Space Apps Challenge on teaching real deep-space trade-offs through play. Independent educational project, not affiliated with or endorsed by NASA.

**No download, no account, no build step.** Serve the folder with any static server (or GitHub Pages) and open `index.html`.

```
python3 -m http.server 8000
```

## How the mission works

Each day the solar panels make a little power. The player shares it out between three things, and **no choice is free**:

| | What it does | What it costs |
|---|---|---|
| 💨 Air & food machines | Need 4 power a day for 4 crew; 5 grows extra | Power you can't spend on anything else |
| 🛡️ Shield wall | Each level blocks 25% of solar-storm radiation and some everyday radiation | Slow: 4 power per level |
| 🔬 Science | 2 power = 1 star, the reason the crew is there | Power you didn't save for a dark spell |

Leftover power goes into a battery, which has a limit, so power can also be wasted. The pressure comes from things the player can't control:

- **Real solar flares** (see below). When one hits, the crew can take shelter (safe, but they lose the day's science and some battery), keep working (stars, but a big radiation dose), or ask Mission Control.
- **Communication delay** is a real mechanic. On the Moon, Earth answers in 1.3 seconds, so asking is free. On Mars the one-way delay is 3–22 minutes (random each game). Waiting for advice costs radiation, and a question to Mission Control is answered the next sol, about yesterday's situation.
- **Low-power spells.** On the Moon a predictable long shadow (forecast from day 1) tests whether you saved ahead. On Mars a surprise dust storm does the same, without a warning.
- **Events** with two-sided choices: a moonwalk for an ice sample (stars vs. suit oxygen and radiation), a clogged greenhouse pump, dusty solar panels, a meteorite strike, and extra experiment requests from Earth.

Every playthrough draws different flares, event days, shadow or storm timing and Mars delay. Running out of air or reaching the radiation limit sends the crew home early rather than "killing" them, and the report explains what happened and suggests a new plan. The Moon is the easier first mission; Mars is harder.

Plain language throughout: jargon (millisievert, sol, solar flare) is explained where it appears. After each day a **Real science** card shares one sourced fact.

## Real NASA data and why it is used

| In the game | Dataset or source | Why |
|---|---|---|
| Solar flares: date, X/M class, sunspot group | **NASA DONKI** (Space Weather Database of Notifications, Knowledge, Information), fetched live from `api.nasa.gov` | Players face flares the Sun really produced in the past 60 days; the event card says which flare it was and where the data came from |
| "Real space weather, last 7 days" on the title | NASA DONKI | Links the game to what the Sun is doing right now |
| Everyday radiation: Moon 1.37 mSv/day | Chang'e-4 LND, Zhang et al., *Science Advances* 6, eaaz1334 (2020) | Measured on the lunar surface |
| Everyday radiation: Mars 0.64 mSv/day | Curiosity RAD, Hassler et al., *Science* 343 (2014) | Measured on the Martian surface |
| Radiation limit 250 mSv | NASA-STD-3001 (30-day limit for blood-forming organs) | The real standard crews are held to |
| Radio delay | Speed of light over Earth–Moon and Earth–Mars distances | Turns distance into a decision |
| Predictable lunar shadows, surprise Mars dust storms | LRO illumination mapping; 2018 global dust storm (Opportunity) | Real reasons solar power fails |
| Real-science cards | NASA Veggie (Khodadad et al. 2020), Twins Study (Garrett-Bakelman et al. 2019), Human Research Program, LCROSS, Curiosity RAD; links to osdr.nasa.gov | Astronaut health and space biology findings, in kid language |

**Live vs. archived.** DONKI is called once per hour per browser (results are cached). If NASA can't be reached, the game falls back to an archive of 11 famous real flares (2003–2024) and says "archived" everywhere it shows them; static data is never presented as live. If the flare catalogue endpoint is down, the loader reads the same flares from DONKI's notifications feed. NASA's shared `DEMO_KEY` allows only about 10 requests an hour per address, so for judging or classrooms add your own free key from api.nasa.gov: `index.html?nasakey=YOUR_KEY`.

**Simplified for play:** flare radiation is an estimate scaled by flare size (big flares often, but not always, cause radiation storms); power is in game units; 4 crew, 15 days. These simplifications are listed in-game under **Real NASA data**.

## For older players and classrooms

The title screen also offers the original **Astronaut training mode (12+)**: a first-person, seven-chapter simulation with suit checklists, flight rules, a cargo manifest review and a flight-director debrief. The sections below describe it.

## Opening walkthrough

The training mode has a two-minute captioned fly-through of the whole training flow, staged in the real 3D scene with the actual hardware and two suited crew. It walks through every chapter step by step: the objectives tick off as each shot plays, and a side panel shows the console that chapter is played on (manifest and console poll, suit DCM, array output, ECLSS procedure, drill and fan-failure checklist, battery reset, space-weather call, consumables re-plan, debrief). It ends on the title screen, or goes straight into chapter 0 from **Begin training**.

**Skip intro** (or `Esc`) leaves at any point. `←` / `→` step between chapters, `Space` pauses, and the progress track is clickable. Open it from **Watch the training tour** on the title menu. Add `?intro=1` to play it on load. With `prefers-reduced-motion`, camera flights become dissolves and drift is reduced.

## The campaign

| # | Chapter | What you do |
|---|---|---|
| 0 | Flight Readiness Review | Build a 26 t cargo manifest. A live trade study projects power, storage, water, food and storm dose to sol 60; SPARTAN, ETHOS, SRAG and the surgeon poll GO / NO-GO. |
| 1 | Egress | Configure your suit on the DCM in checklist order, leak check, comm check, depress the airlock, descend the ladder, photograph and sample Station 1. |
| 2 | First Light | Drive the LTV, tow the solar array pallet, choose ridge or flats, raise the mast, calibrate sun tracking, lay 150–250 m of cable, bring the habitat onto main power. Site the reactor if you manifested one. |
| 3 | Closing the Loop | Bring life support up by procedure on the habitat console (don't dry-start the oxygen generator), then build the darkness load table. |
| 4 | Into the Dark | Drive into a permanently shadowed crater, drill an ice core by torque — then your suit fan fails. Purge, and get home on 30 minutes of emergency oxygen. |
| 5 | The Long Night | Six sols of darkness, a battery string trips, and the fix is an EVA by headlamp: isolate, open the radiator louver, wait for the string to cool, reset. |
| 6 | Proton Storm | A flare forecast mid-EVA 270 m from home. Terminate, drive back, get the crew under shielding before the protons arrive. |
| 7 | The Slip | Your ride home slips fifteen sols. Re-plan to sol 60, decide on contingency rations, and live with the outcome. |

A post-sim debrief grades six competencies (procedures, communication, situational awareness, decision making, consumables management, outcome), records every flight rule finding, charts consumables and dose, logs each EVA and shows your surface photographs.

## Realism, sourced

| Quantity | Value | Source |
|---|---|---|
| Crew metabolic loads | O₂ 0.816, water 3.60, food 1.83 kg per crew-day | NASA BVAD, NASA/TP-2015-218570 |
| Water recovery; electrolysis | 93%; 1.125 kg H₂O per kg O₂ | ISS WRS and OGA |
| Surface cosmic-ray dose | 1.369 mSv/day | Chang'e-4 LND, *Science Advances* 6, eaaz1334 (2020) |
| Dose limits | 250 mGy-Eq over 30 days; 600 mSv career | NASA-STD-3001 |
| Water ice in regolith | 5.6 ± 2.9 wt% | Colaprete et al., *Science* 330, 463 (2010) |
| PSR floor temperature | below 40 K | Paige et al., *Science* 330, 479 (2010) |
| Ridge illumination | 80–90%, darkness gaps of days | LRO LOLA illumination mapping |
| Solar array / fission power | 10 kW VSAT class / 10 kWe Kilopower-derived | NASA VSAT; KRUSTY 2018, NASA–DOE FSP |
| LTV top speed | 15 km/h | Artemis LTV requirements |
| PLSS | 8 h consumables, ~30 min purge on secondary O₂ | EMU / xEMU |
| Suit pressure; CO₂ caution | 4.3 psi; ~7.6 mmHg | EMU; NASA-STD-3001 |

Other details: 1.3 s Earth–Moon light time before CAPCOM answers; Quindar tones on ground transmissions; dust flying in clean ballistic arcs with no drag; no stars in sunlight until your eyes dark-adapt; Earth fixed low on the horizon; a bus model that charges storage first in daylight, sheds loads by table in darkness and duty-cycles ECLSS before the habitat goes dark.

Deliberate simplifications are listed in-sim under **Data sources**: time compression, a sun at 4.5° instead of the real ~1.5°, scalar radiation attenuation instead of a transport code, crops as a caloric offset, an assumed ISRU throughput, no thermal model.

## Controls

`W A S D` move / drive · mouse look · `Shift` lope · `Space` hop / brake · `E` interact (hold where shown) · `Tab` suit DCM · `M` map · `F` camera · `L` headlamp · `V` gold sun visor · `1 2 3` radio replies · `Esc` pause. Touch devices get a joystick, drag-to-look and an action button.

## Tech

Three.js r128 from a CDN; everything else is hand-written: a 960 m procedural heightfield with a baked south-pole sun-visibility map sampled in every material's shader, lunar-Lambert photometry for regolith, procedural hardware and astronaut models, a hand-built first-person controller, LTV vehicle model, Web Audio for breathing, fan, footfalls, radio and alarms, and the browser's speech engine for radio voices.

```
index.html  style.css
js/util.js      helpers, noise, event bus
js/audio.js     suit and radio audio, speech
js/world.js     terrain, sun-visibility bake, sky, dust, bootprints, cable
js/models.js    lander, habitat, VSAT, LTV, ice plant, reactor, astronauts…
js/interior.js  airlock and habitat interiors
js/outpost.js   consumables, power bus and dose model; FRR poll
js/base.js      placing hardware on the site
js/player.js    EV1 movement, suit consumables, interaction, photography
js/rover.js     LTV driving, towing, cable payout
js/npc.js       EV2
js/ui.js        HUD, radio, flow screens
js/panels.js    DCM, habitat PCS, map, manifest board, debrief
js/story.js     the seven chapters and evaluation
js/intro.js     training tour: camera keyframes, staging, transitions, captions
js/nasa.js      NASA DONKI flares: live fetch, notifications fallback, archive
js/kids.js      the kids' mission: rules, events, planning UI, report
js/main.js      boot, input, loop
```
