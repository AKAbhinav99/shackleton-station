# Shackleton Station

A first-person Moon base game for kids aged 7–12. You are the commander of a four-person base on the rim of Shackleton crater, near the Moon's south pole, for 6 days. Walk around with **W A S D**, go inside the habitat, drive the rover, collect rocks, and decide where the power goes, while keeping the crew breathing, fed and safe from radiation. Built for the NASA Space Apps Challenge on teaching real deep-space trade-offs through play. Independent educational project, not affiliated with or endorsed by NASA.

**No download, no account, no build step.** Serve the folder with any static server (or GitHub Pages) and open `index.html`.

```
python3 -m http.server 8000
```

## Controls

`W A S D` walk / drive · mouse look · `Shift` bounce-run (one-sixth gravity) · `Space` jump / brake · `E` use, pick up, get in or out of the rover (hold when the ring shows) · `L` headlamp · `F` camera · `V` sun visor · `Esc` pause. Touch devices get a joystick, drag-to-look and an E button.

## How it plays

A base day lasts 2½ minutes of play. Three things have to stay in balance, and every job costs something:

| | How it works | What it costs |
|---|---|---|
| 💨 **Air & food** | Four crew use one day of supplies per day. The greenhouse and the water maker win some back | They need power |
| 🔋 **Power** | Solar panels charge a battery. At the **power console inside the habitat** you switch the greenhouse, water maker and science lab on or off | The lab earns stars but drains the battery |
| ☢️ **Radiation** | Space radiation adds up every day. The **shield wall** (built with the digger outside) cuts it, and the **storm shelter** inside cuts solar storms most | Each shield level uses battery; sheltering costs time |

Things to do in the world: pick up glowing-marked rock samples and carry them home (stars, but suit air runs down while you're outside), drive the rover to the ridge to brush dust off the solar panels, fix the greenhouse pump, build the shield wall, and fetch icy soil from the crater rim for a bonus. Run out of suit air and your crewmate brings you back, but the samples you were carrying are lost.

Pressure you can't control:

- **Real solar flares.** Each mission draws two flares from NASA DONKI. When one is spotted, Mission Control radios a warning (after the real 1.3-second light delay) and you have 40 seconds to get inside. The storm dose depends on where you are: outside, in the habitat (helped by the shield wall) or in the storm shelter. The banner names the real flare and its date.
- **The long shadow.** On day 4 the Sun drops behind the hills (the sky really goes dark) and the panels make almost nothing. If the battery runs out, the base goes on emergency power and air drops faster.
- **Surprises:** a supply lander sprays dust on the panels; roots clog the greenhouse pump.
- **Communication delay.** Calling Mission Control from the habitat radio takes 2.6 seconds round trip, and the game points out that Mars would take up to 44 minutes.

Each mission has different flares, event days and rock positions. Running out of air or reaching the radiation limit sends the crew home early instead of "losing", and the report explains what happened, what you learned, and which real data was used. Plain language throughout; every day ends with a sourced real-science fact.

## Real NASA data and why it is used

| In the game | Dataset or source | Why |
|---|---|---|
| Solar flares: date, X/M class, sunspot group | **NASA DONKI** (Space Weather Database of Notifications, Knowledge, Information), fetched live from `api.nasa.gov` | Players face flares the Sun really produced in the past 60 days; the warning banner says which flare it was |
| "Real space weather, last 7 days" on the title | NASA DONKI | Links the game to what the Sun is doing now |
| Everyday radiation: 1.37 mSv/day | Chang'e-4 LND, Zhang et al., *Science Advances* 6, eaaz1334 (2020) | Measured on the lunar surface |
| Radiation limit 250 mSv | NASA-STD-3001 (30-day limit for blood-forming organs) | The real standard crews are held to |
| Radio delay 1.3 s | Speed of light over the Earth–Moon distance | Turns distance into a felt delay |
| South-pole sunlight and long shadows | LRO illumination mapping (the terrain and sun-visibility map in the game) | Why bases go there, and why solar power still has dark spells |
| Ice in dark craters | LCROSS, Colaprete et al., *Science* 330 (2010) | Why the crater-rim bonus matters |
| Moon gravity 1.62 m/s² | NASA | Drives the walking, bounce-running and jumping |
| Real-science cards | NASA Veggie (Khodadad et al. 2020), Twins Study (Garrett-Bakelman et al. 2019), Human Research Program; links to osdr.nasa.gov | Astronaut health and space biology findings in kid language |

**Live vs. archived.** DONKI is called once per hour per browser (results are cached). If NASA can't be reached, the game uses an archive of 11 famous real flares (2003–2024) and says "archived" wherever it shows them; static data is never presented as live. If DONKI's flare catalogue endpoint is down, the loader reads the same flares from DONKI's notifications feed. NASA's shared `DEMO_KEY` allows only about 10 requests an hour per address, so for judging or classrooms add your own free key from api.nasa.gov: `index.html?nasakey=YOUR_KEY`.

**Simplified for play:** flare radiation is an estimate scaled by flare size (big flares often, but not always, cause radiation storms); power is in game units; a base day is 2½ minutes; the mission is 6 days.

## Tech

Three.js r128 from a CDN; everything else is hand-written: a 960 m procedural heightfield with a baked south-pole sun-visibility map sampled in every material's shader, lunar-Lambert photometry for regolith, procedural hardware and astronaut models, a first-person controller in lunar gravity, a drivable rover, a walk-in habitat interior, Web Audio for breathing, footsteps, radio and alarms, and the browser's speech engine for Mission Control.

```
index.html  style.css
js/util.js      helpers, noise, event bus
js/audio.js     suit and radio audio, speech
js/world.js     terrain, sun-visibility bake, sky, dust, bootprints
js/models.js    lander, habitat, solar arrays, rover, ice plant, greenhouse, astronauts…
js/interior.js  habitat interior
js/outpost.js   shared constants (radiation rates)
js/base.js      placing hardware on the site
js/player.js    first-person movement and interaction
js/rover.js     rover driving
js/npc.js       your crewmate outside
js/ui.js        HUD, radio captions, settings
js/nasa.js      NASA DONKI flares: live fetch, notifications fallback, archive
js/mission.js   the mission: resources, jobs, flares, days, report
js/main.js      boot, input, loop, menus
```
