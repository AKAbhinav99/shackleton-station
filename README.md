# Shackleton Station

A first-person lunar surface operations trainer set on the Shackleton connecting ridge at the lunar south pole. You play EV1, the surface lead of a four-person crew, through an integrated simulation modelled on how astronauts actually train: checklists, flight rules, a flight control team on the loop, and a sim supervisor who inserts malfunctions.

Built for the NASA Space Apps Challenge on sustaining a lunar outpost: balancing life support, radiation shielding, power and food, and experiencing the decisions that decide whether a mission succeeds. Independent educational project, not affiliated with or endorsed by NASA.

**No build step.** Serve the folder with any static server (or GitHub Pages) and open `index.html`.

```
python3 -m http.server 8000
```

## Opening walkthrough

The site opens with a two-minute captioned fly-through of the whole training flow, staged in the real 3D scene with the actual hardware and two suited crew. It walks through every chapter step by step: the objectives tick off as each shot plays, and a side panel shows the console that chapter is played on (manifest and console poll, suit DCM, array output, ECLSS procedure, drill and fan-failure checklist, battery reset, space-weather call, consumables re-plan, debrief). It ends on the title screen, or goes straight into chapter 0 from **Begin training**.

**Skip intro** (or `Esc`) leaves at any point. `←` / `→` step between chapters, `Space` pauses, and the progress track is clickable. Replay it from **Watch the walkthrough** on the title menu. Add `?intro=0` to the URL to boot straight to the title; `?chapter=N` also skips it. With `prefers-reduced-motion`, camera flights become dissolves and drift is reduced.

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
js/intro.js     opening walkthrough: camera keyframes, staging, transitions, captions
js/main.js      boot, input, loop
```
