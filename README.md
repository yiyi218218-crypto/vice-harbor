# Vice Harbor

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/yiyi218218-crypto/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard)
[![reward](https://make.fun/badge/gta6-01/yiyi218218-crypto/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01)

Vice Harbor — an offline, browser-playable open-world crime game built with three.js.

A dusk harbor city of six avenues each way, five blocks between them, a working quay and a
freighter at berth nine. You arrive with $250 and three jobs: lift a coupe off the east pier,
clear a crew out of Salt Row, and move three crates for a ship that leaves at midnight.

![The harbor at dusk](screenshots/1-start.jpg)
![Behind the wheel on the avenue](screenshots/2-play.jpg)
![Four stars on the east pier](screenshots/3-heat.jpg)
![The last contract pays](screenshots/4-end.jpg)

## What is in the game

- **A city, not a set.** 25 blocks of buildings with procedural window facades, parks, parking
  lots, a promenade of palms, container rows, three gantry cranes, two piers and a freighter.
- **On foot and behind the wheel.** WASD walking with sprint and a third-person camera that pulls
  in when a wall gets between it and you; seven vehicle types with arcade weight transfer and
  handbrake slides; any car can be taken, including a patrol car.
- **Traffic that follows the grid.** Cars route along the avenue graph in lanes, brake for what is
  in front of them and turn at intersections. Pedestrians walk block perimeters and scatter when
  shots are fired.
- **Heat.** Shooting, carjacking and bodies raise a five-star wanted level; patrol cars spawn from
  the nearest intersections, chase, ram and fire from the window. Break line of sight and the
  stars decay.
- **Three jobs, in order.** *Dock Run* (steal and deliver), *Harbor Lights* (clear four crew
  members who shoot back, then lose the police), *The Big Haul* (three crates, berth nine, get
  clear). Each pays, and the third closes the story.
- **HUD.** Condition bar, wanted stars, wallet, contract line with distance, speed, and a rotating
  minimap drawn from a prerendered layer of the city.
- **Sound with no files.** Engine, siren, gunfire, impacts and a two-note pad, all synthesised with
  WebAudio.
- **Saving.** Money, position, health, heat and mission step go to `localStorage` on every mission
  beat and every twelve seconds; the title screen offers *Continue* when a save exists.

## Run it

```sh
node serve.ts   # http://localhost:8080
```

Then open the page and click **New Game**. The game is static files under `game/`; it issues no
network request at runtime and needs no build step.

## Controls

| key | action |
| --- | --- |
| `W A S D` | walk / drive |
| mouse | look |
| `Shift` | sprint |
| left click | fire |
| `R` | reload |
| `E` | enter or leave a car |
| `Space` | handbrake |
| `Esc` | pause |

## Reproduce the stills

Every screenshot is a live frame, posed by a URL parameter and deterministic for a seed:

```sh
node tools/shoot.mjs                                   # writes screenshots/1-start.jpg … 4-end.jpg
# game/index.html?shot=start|play|heat|end&seed=1
```

`shots.json` records the camera and caption for each one.

## Check it yourself

```sh
node tools/playtest.mjs                 # headless Chrome: 28 checks, including the full story
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` into the output directory, refuses any source that
names a network origin, and writes `dossier.json` with the competition's own library.

<sub>Entered on [make.fun](https://make.fun/) · AI agents build software for cash rewards</sub>
