// The heads-up display: the wanted stars, the cash, the objective card, the health and armour bars,
// the weapon and its rounds, the speedometer, the subtitles and the toast — and the round minimap,
// drawn each frame from the same city and traffic the world is built from, turned so the player is
// always facing up.
import { CITY } from './config.js';

const MAP_VIEW = 135; // metres from the player to the edge of the minimap

export function createHud() {
  const el = {
    hud: document.getElementById('hud'),
    wanted: [...document.querySelectorAll('#wanted i')],
    wantedBox: document.getElementById('wanted'),
    money: document.getElementById('money'),
    objTitle: document.getElementById('objTitle'),
    objText: document.getElementById('objText'),
    objDist: document.getElementById('objDist'),
    hp: document.getElementById('hpBar'),
    ap: document.getElementById('apBar'),
    weapon: document.getElementById('weapon'),
    ammo: document.getElementById('ammo'),
    speedo: document.getElementById('speedo'),
    subtitle: document.getElementById('subtitle'),
    toast: document.getElementById('toast'),
    banner: document.getElementById('banner'),
    bannerTitle: document.getElementById('bannerTitle'),
    bannerSub: document.getElementById('bannerSub'),
    crosshair: document.getElementById('crosshair'),
    hitmark: document.getElementById('hitmark'),
    damage: document.getElementById('damage'),
    district: document.getElementById('district'),
    map: document.getElementById('map'),
    title: document.getElementById('title'),
    pause: document.getElementById('pause'),
    fade: document.getElementById('fade'),
    best: document.getElementById('best'),
  };
  const mapCtx = el.map.getContext('2d');
  const size = el.map.width;

  let subtitleTimer = 0;
  let toastTimer = 0;
  let bannerTimer = 0;
  let hitTimer = 0;
  let damageTimer = 0;
  let moneyShown = 0;
  let pulse = 0;

  function setVisible(show) {
    el.hud.classList.toggle('hide', !show);
  }

  function say(text, seconds = 4.5) {
    if (!text) return;
    el.subtitle.innerHTML = text;
    el.subtitle.classList.add('on');
    subtitleTimer = seconds;
  }

  function toast(text, seconds = 2.6) {
    if (!text) return;
    el.toast.textContent = text;
    el.toast.classList.add('on');
    toastTimer = seconds;
  }

  function banner(title, sub, seconds = 4) {
    el.bannerTitle.textContent = title;
    el.bannerSub.textContent = sub ?? '';
    el.banner.classList.add('on');
    bannerTimer = seconds;
  }

  function hitmark() {
    el.hitmark.classList.add('on');
    hitTimer = 0.13;
  }

  function hurt() {
    el.damage.style.opacity = '0.55';
    damageTimer = 0.4;
  }

  /** Clear the red wash at once, for a staged frame. */
  function calm() {
    damageTimer = 0;
    el.damage.style.opacity = '0';
  }

  /** Draw the minimap around the player, roads first, then the dots that matter. */
  function drawMap(game) {
    const p = game.player.state;
    const s = (size / 2) / MAP_VIEW;
    const cx = size / 2;
    const cy = size / 2;
    const g = mapCtx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, size, size);
    g.save();
    g.beginPath();
    g.arc(cx, cy, size / 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#0a0d15';
    g.fillRect(0, 0, size, size);

    g.translate(cx, cy);
    g.rotate(p.heading + Math.PI);
    g.scale(s, s);
    g.translate(-p.x, -p.z);

    // The harbour, so the map has a shore.
    g.fillStyle = '#12243a';
    g.fillRect(-900, CITY.half + 30, 1800, 700);

    // Blocks, then the roads over them.
    g.fillStyle = '#191d29';
    for (const b of game.city.blocks) g.fillRect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d);
    g.strokeStyle = '#3b4052';
    g.lineWidth = CITY.road;
    g.lineCap = 'butt';
    g.beginPath();
    for (const r of game.city.minimapRoads) {
      g.moveTo(r.x0, r.z0);
      g.lineTo(r.x1, r.z1);
    }
    g.stroke();
    g.strokeStyle = '#4e5468';
    g.lineWidth = 0.8;
    g.beginPath();
    for (const r of game.city.minimapRoads) {
      g.moveTo(r.x0, r.z0);
      g.lineTo(r.x1, r.z1);
    }
    g.stroke();

    // Traffic as grey ticks, police as red, the job as gold.
    g.fillStyle = '#6f7a90';
    for (const car of game.traffic.cars) {
      if (!car.alive) continue;
      g.fillRect(car.x - 1.2, car.z - 1.2, 2.4, 2.4);
    }
    g.fillStyle = '#8b6a4a';
    for (const ped of game.traffic.peds) {
      if (!ped.alive) continue;
      g.fillRect(ped.x - 0.7, ped.z - 0.7, 1.4, 1.4);
    }
    for (const unit of game.police.units) {
      if (!unit.alive) continue;
      g.fillStyle = unit.kind === 'heli' ? '#ff5f7e' : '#ff3b4e';
      g.beginPath();
      g.arc(unit.x, unit.z, unit.kind === 'car' ? 2.4 : 1.6, 0, 7);
      g.fill();
    }
    if (game.missions.marker.group.visible) {
      const m = game.missions.marker.group.position;
      g.fillStyle = '#ffc35c';
      g.beginPath();
      g.arc(m.x, m.z, 3.4, 0, 7);
      g.fill();
      g.strokeStyle = 'rgba(255,195,92,0.55)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(m.x, m.z, 6 + Math.sin(pulse * 3) * 1.4, 0, 7);
      g.stroke();
    }
    g.restore();

    // The player: a white arrow at the centre, always pointing up.
    g.save();
    g.translate(cx, cy);
    g.fillStyle = '#f4f1e6';
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(6.5, 7);
    g.lineTo(0, 3.4);
    g.lineTo(-6.5, 7);
    g.closePath();
    g.fill();
    g.restore();

    // A ring of ticks, for a bit of instrument feel.
    g.strokeStyle = 'rgba(255,220,170,0.16)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cy, size / 2 - 7, 0, Math.PI * 2);
    g.stroke();
  }

  /** One frame of HUD: numbers, bars, stars, timers. */
  function update(dt, game) {
    pulse += dt;
    const state = game.player.state;
    moneyShown += (game.money - moneyShown) * Math.min(1, dt * 8);
    if (Math.abs(moneyShown - game.money) < 1) moneyShown = game.money;
    el.money.innerHTML = `$${Math.round(moneyShown).toLocaleString('en-US')}`;

    const stars = game.police.stars;
    el.wanted.forEach((star, i) => star.classList.toggle('on', i < stars));
    el.wantedBox.classList.toggle('pulse', stars > 0 && Math.sin(pulse * 6) > 0.92);

    const obj = game.missions.objective;
    el.objTitle.textContent = obj.title ?? 'Vice Harbor';
    el.objText.textContent = obj.text ?? '';
    el.objDist.textContent = obj.dist > 6 ? `${Math.round(obj.dist)} m` : obj.dist > 0 ? 'Here' : '';
    el.district.textContent = game.city.districtAt(state.x, state.z);

    el.hp.style.width = `${Math.max(0, state.hp)}%`;
    el.ap.style.width = `${Math.max(0, state.armor)}%`;
    const w = game.combat.state;
    el.weapon.textContent = game.combat.weapon.name;
    if (w.weapon === 'fists') el.ammo.innerHTML = '&mdash;';
    else if (w.reloading > 0) el.ammo.innerHTML = 'RELOADING';
    else el.ammo.innerHTML = `${w.magazine[w.weapon]} <small>/ ${w.ammo[w.weapon]}</small>`;

    if (state.onFoot) el.speedo.classList.remove('on');
    else {
      el.speedo.classList.add('on');
      el.speedo.innerHTML = `${Math.round(Math.abs(state.speed) * 3.6)}<small>KM/H</small>`;
    }

    el.crosshair.classList.toggle('on', state.onFoot && game.combat.name !== 'fists');

    if (subtitleTimer > 0) {
      subtitleTimer -= dt;
      if (subtitleTimer <= 0) el.subtitle.classList.remove('on');
    }
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) el.toast.classList.remove('on');
    }
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) el.banner.classList.remove('on');
    }
    if (hitTimer > 0) {
      hitTimer -= dt;
      if (hitTimer <= 0) el.hitmark.classList.remove('on');
    }
    if (damageTimer > 0) {
      damageTimer -= dt;
      if (damageTimer <= 0) el.damage.style.opacity = '0';
    }

    drawMap(game);
  }

  return {
    el,
    update,
    say,
    toast,
    banner,
    hitmark,
    hurt,
    calm,
    setVisible,
    showTitle(show) {
      el.title.classList.toggle('hide', !show);
    },
    showPause(show) {
      el.pause.classList.toggle('hide', !show);
    },
    fade(on) {
      el.fade.style.opacity = on ? '1' : '0';
    },
    setBest(text) {
      el.best.textContent = text;
    },
  };
}
