// The story: four jobs from Wren, the fixer who works out of the pier. Each job is a list of steps —
// drive here, take that, put three of the Crew down, shake the police — with a glowing marker at the
// current one, a line of dialogue when it starts and cash when it ends. The Crew fight back.
import * as THREE from '../vendor/three.min.js';
import { CITY } from './config.js';
import { buildPerson } from './traffic.js';

/** Where every job happens, on road intersections and pier decks so nothing lands inside a wall. */
const AT = {
  pier: { x: 0, z: 466 },
  garage: { x: -76, z: 76 },
  yard: { x: 152, z: -76 },
  docks: { x: -228, z: 228 },
  light: { x: 150, z: 512 },
  wheel: { x: -58, z: 452 },
};

const JOBS = [
  {
    id: 'clockin',
    title: 'Clock In',
    brief: 'Wren, Starfish Pier',
    steps: [
      { kind: 'goto', at: AT.wheel, radius: 9, text: 'Meet Wren under the wheel' },
    ],
    lines: ['Wren: You look like someone who needs work.', 'Wren: I have four jobs. Do them in order and the harbor pays you.'],
    reward: 0,
    onDone: (ctx) => {
      ctx.combat.select('smg');
      ctx.toast('Squall SMG added');
    },
  },
  {
    id: 'pickup',
    title: 'The Pickup',
    brief: 'A crate at the docks',
    steps: [
      { kind: 'goto', at: AT.docks, radius: 8, text: 'Collect the crate at the fish docks' },
      { kind: 'goto', at: AT.garage, radius: 8, text: 'Deliver it to the garage on 5th' },
    ],
    lines: ['Wren: A crate came off the night boat. Bring it to the garage.', 'Wren: Do not open it. Do not stop for anyone.'],
    reward: 600,
  },
  {
    id: 'badblood',
    title: 'Bad Blood',
    brief: 'The Crew wants the crate',
    steps: [
      { kind: 'goto', at: AT.yard, radius: 9, text: 'Meet the Crew at the container yard' },
      { kind: 'kill', count: 3, text: 'Put the Crew down' },
      { kind: 'evade', text: 'Lose the police' },
    ],
    lines: ['Wren: The Crew heard about the crate. They are waiting at the yard.', 'Wren: Settle it. Then lose whatever heat comes with it.'],
    reward: 1400,
    onStart: (ctx) => {
      ctx.spawnGang(AT.yard, 3);
      ctx.police.crime(3);
    },
  },
  {
    id: 'harborrun',
    title: 'Harbor Run',
    brief: 'One last delivery',
    steps: [
      { kind: 'goto', at: AT.garage, radius: 8, text: 'Pick up the package at the garage' },
      { kind: 'goto', at: AT.light, radius: 9, text: 'Run it to the lighthouse, fast' },
    ],
    lines: ['Wren: Last one. The lighthouse keeper owes me.', 'Wren: The harbor police are already looking for the car. Drive.'],
    reward: 2600,
    onStart: (ctx) => {
      ctx.police.crime(3.2);
      ctx.notify('Police are on you');
    },
  },
];

/** A marking on the ground: a ring, a pulsing pillar of light and a chevron above it. */
function buildMarker() {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.2, 40),
    new THREE.MeshBasicMaterial({ color: 0xffc35c, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 2.0, 26, 22, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffb347, transparent: true, opacity: 0.16, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  pillar.position.y = 13;
  const chevron = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 1.8, 4),
    new THREE.MeshBasicMaterial({ color: 0xffd88a }),
  );
  chevron.rotation.x = Math.PI;
  chevron.position.y = 5;
  group.add(ring, pillar, chevron);
  group.visible = false;
  return { group, ring, pillar, chevron };
}

export function createMissions(scene, city, audio) {
  const marker = buildMarker();
  scene.add(marker.group);
  const enemies = [];
  let index = 0;
  let step = 0;
  let active = false;
  let stepClock = 0;
  let finished = false;
  let clock = 0;
  const crew = new THREE.Group();
  scene.add(crew);

  const objective = { title: 'Free roam', text: 'Find work under the wheel', dist: 0, brief: '' };

  function spawnGang(at, count) {
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + 0.6;
      const x = at.x + Math.cos(a) * (9 + Math.random() * 4);
      const z = at.z + Math.sin(a) * (9 + Math.random() * 4);
      const person = buildPerson(i % 2 ? 0x4a2b3a : 0x2d2a3c, 0x1a1a22, 0xa87a56, 1.0);
      person.group.position.set(x, 0, z);
      crew.add(person.group);
      enemies.push({
        ...person, x, z, hp: 55, alive: true, heading: 0, walk: Math.random() * 6,
        wait: 0.5 + Math.random(), kind: 'thug',
      });
    }
  }

  function clearGang() {
    for (const e of enemies) crew.remove(e.group);
    enemies.length = 0;
  }

  function job() {
    return JOBS[index] ?? null;
  }

  function currentStep() {
    const j = job();
    return j ? j.steps[step] : null;
  }

  function startJob(ctx) {
    const j = job();
    if (!j) return;
    active = true;
    step = 0;
    stepClock = 0;
    audio?.play('mission');
    j.onStart?.(ctx);
    ctx.say(j.lines?.[0] ?? j.title);
    placeMarker();
  }

  function placeMarker() {
    const s = currentStep();
    if (!s || !s.at) {
      const j = job();
      if (j && j.steps[0]?.at) {
        marker.group.position.set(j.steps[0].at.x, 0, j.steps[0].at.z);
        marker.group.visible = true;
      } else marker.group.visible = false;
      return;
    }
    marker.group.position.set(s.at.x, 0, s.at.z);
    marker.group.visible = true;
  }

  function finishJob(ctx) {
    const j = job();
    if (!j) return;
    active = false;
    step = 0;
    marker.group.visible = false;
    ctx.reward(j.reward, j.title);
    j.onDone?.(ctx);
    index = Math.min(JOBS.length, index + 1);
    finished = index >= JOBS.length;
    if (finished) ctx.say('Wren: That is all four. The harbor is yours.');
  }

  function update(dt, ctx) {
    clock += dt;
    marker.ring.scale.setScalar(1 + Math.sin(clock * 3) * 0.06);
    marker.chevron.position.y = 4.5 + Math.sin(clock * 2) * 0.3;
    marker.chevron.rotation.y += dt * 1.6;
    marker.pillar.material.opacity = 0.1 + Math.sin(clock * 2.2) * 0.05;

    const player = ctx.player.state;
    const j = job();

    // Idle: the marker sits on the next job's first step, and walking into it starts it.
    if (!active && j) {
      const first = j.steps[0];
      if (first.at) {
        marker.group.position.set(first.at.x, 0, first.at.z);
        marker.group.visible = true;
        const d = Math.hypot(first.at.x - player.x, first.at.z - player.z);
        objective.title = j.title;
        objective.text = first.text;
        objective.brief = j.brief;
        objective.dist = d;
        if (d < (first.radius ?? 8)) startJob(ctx);
      }
    }

    if (active) {
      const s = currentStep();
      if (s) {
        stepClock += dt;
        if (s.kind === 'goto') {
          const d = Math.hypot(s.at.x - player.x, s.at.z - player.z);
          objective.title = job().title;
          objective.text = s.text;
          objective.dist = d;
          objective.brief = job().brief;
          if (d < (s.radius ?? 8)) {
            step += 1;
            stepClock = 0;
            audio?.play('pickup');
            if (step >= job().steps.length) finishJob(ctx);
            else {
              placeMarker();
              const line = job().lines?.[Math.min(step, job().lines.length - 1)];
              if (line) ctx.say(line);
            }
          }
        } else if (s.kind === 'kill') {
          const alive = enemies.filter((e) => e.alive).length;
          objective.title = job().title;
          objective.text = `${s.text} (${s.count - alive}/${s.count})`;
          objective.dist = 0;
          if (alive === 0) {
            step += 1;
            if (step >= job().steps.length) finishJob(ctx);
            else {
              placeMarker();
              ctx.say(job().lines?.[Math.min(step, job().lines.length - 1)] ?? 'Wren: Now run.');
            }
          }
        } else if (s.kind === 'evade') {
          const heat = ctx.police.state.wanted;
          objective.title = job().title;
          objective.text = s.text;
          objective.dist = 0;
          if (heat < 0.35) {
            step += 1;
            if (step >= job().steps.length) finishJob(ctx);
            else placeMarker();
          }
        }
      }
    }

    // The Crew: hold their ground, close in, shoot.
    for (const e of enemies) {
      if (!e.alive) {
        e.group.rotation.z = Math.min(1.5, (e.dead = (e.dead ?? 0) + dt) * 4);
        e.group.position.y = Math.max(-0.1, 0.25 - (e.dead ?? 0) * 0.4);
        continue;
      }
      const dx = player.x - e.x;
      const dz = player.z - e.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.2 && dist < 26) {
        const want = Math.atan2(dx, dz);
        let diff = ((want - e.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        e.heading += Math.max(-3 * dt, Math.min(3 * dt, diff));
        if (dist > 11) {
          const nx = e.x + Math.sin(e.heading) * 3.2 * dt;
          const nz = e.z + Math.cos(e.heading) * 3.2 * dt;
          if (!city.solidAt(nx, nz, 0.5)) {
            e.x = nx;
            e.z = nz;
          }
        }
        e.walk += dt * 5;
      } else e.heading = Math.atan2(dx, dz);
      e.group.position.set(e.x, Math.abs(Math.sin(e.walk)) * 0.03, e.z);
      e.group.rotation.y = e.heading;
      e.legs[0].rotation.x = Math.sin(e.walk) * 0.55;
      e.legs[1].rotation.x = -Math.sin(e.walk) * 0.55;
      e.wait -= dt;
      if (e.wait <= 0 && dist < 30) {
        e.wait = 0.9 + Math.random() * 1.1;
        const from = new THREE.Vector3(e.x + Math.sin(e.heading) * 0.5, 1.3, e.z + Math.cos(e.heading) * 0.5);
        const to = new THREE.Vector3(player.x, 1.2, player.z);
        ctx.shootAt?.(from, to);
        if (Math.random() < Math.max(0.06, 0.5 - dist * 0.014)) ctx.player.hurt(7 + Math.random() * 6);
      }
    }
  }

  return {
    enemies,
    objective,
    update,
    spawnGang,
    clearGang,
    get active() {
      return active;
    },
    get index() {
      return index;
    },
    get finished() {
      return finished;
    },
    get title() {
      return job()?.title ?? 'Vice Harbor';
    },
    reset() {
      index = 0;
      step = 0;
      active = false;
      finished = false;
      marker.group.visible = false;
      clearGang();
    },
    /** Jump straight into a job, for the screenshot scenes. */
    enter(n, ctx) {
      index = Math.max(0, Math.min(JOBS.length - 1, n));
      active = false;
      step = 0;
      if (job()) startJob(ctx);
    },
    skipToStep(n) {
      step = n;
      placeMarker();
    },
    placeMarker,
    marker,
    get jobs() {
      return JOBS;
    },
  };
}
