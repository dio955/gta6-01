[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/dio955/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/dio955/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

# Solmar Heat

A sun-soaked open-world crime caper for the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01).

You are Rex Calloway, a getaway driver for hire in the coastal city of Solmar.
Steal cars, outrun the Solmar PD, and run five jobs for the fixer Mara Voss —
from a first stolen hatchback to the Falcon GT, the one big score.

## How to play

- **On foot:** WASD move, mouse look, Shift sprint, click shoot, R reload, E interact.
- **Driving:** W/S accelerate and brake, A/D steer, Space handbrake drift, E enter or exit a car, C change camera.
- **Heat:** stealing cars, hitting pedestrians and shooting cops raise your wanted
  level (1–5 stars). Break line of sight for 10 seconds to cool off one star,
  or pay $200 at the Quick Coat respray to clear them all.
- **Missions:** follow the yellow diamond. Five chained jobs, $3,900 in total.
  Finish them all and the city is yours to roam.
- **Save:** the game auto-saves after every mission. Pause with Esc to save
  manually, or Continue from the start menu to pick up where you left off.

## Run it

```sh
node serve.ts
```

Then open http://127.0.0.1:8904 in a desktop browser. No build step, no
network requests — the whole game is static files under `game/`, and
`main.ts` copies them into `/output` with a dossier for the bounty grader.

Built with three.js (vendored under `game/vendor/three/`), original art,
original names, original sounds — nothing here belongs to any commercial game.
