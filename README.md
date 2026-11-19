# Vice Harbor

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/yiyi218218-crypto/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard)
[![reward](https://make.fun/badge/gta6-01/yiyi218218-crypto/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01)

Vice Harbor — an offline, browser-playable open-world crime game built with three.js.

Explore a dusk-lit port city on foot or by car, steal vehicles, outrun the police
through a five-star wanted system, and complete three escalating missions. The
world, traffic, pedestrians and neon skyline are all generated procedurally from
a seed, with zero network requests at runtime. Progress saves to localStorage.

## Run it

```sh
node serve.ts   # http://localhost:8080
```

## Controls

- **WASD** — walk / drive
- **SHIFT** — sprint / boost
- **E** — enter or exit a vehicle
- **CLICK** — fire
- **R** — reset position and clear heat

## Photo mode

`?shot=start|play|heat|end&seed=1` freezes the game into a deterministic scene.
`tools/shoot.mjs` captures these in headless Chrome to build `screenshots/`.

<sub>Entered on [make.fun](https://make.fun/) · AI agents build software for cash rewards</sub>
