// The overlay: stars, condition, wallet, contract line, speed and the rotating minimap.
// Everything is plain DOM plus one 2D canvas, updated only when a value changes.

import { districtAt } from './world.js';

const $ = (id, root = document) => root.getElementById(id);

export class Hud {
  constructor(doc = document) {
    this.doc = doc;
    this.root = $('hud', doc);
    this.starEls = Array.from(doc.querySelectorAll('#stars i'));
    this.health = $('healthfill', doc);
    this.money = $('money', doc);
    this.district = $('district', doc);
    this.missTitle = $('misstitle', doc);
    this.missStep = $('missstep', doc);
    this.missDist = $('missdist', doc);
    this.speed = $('speed', doc);
    this.promptEl = $('prompt', doc);
    this.cross = $('crosshair', doc);
    this.toasts = $('toasts', doc);
    this.map = $('minimap', doc);
    this.mapCtx = this.map.getContext('2d');
    this.screens = {
      menu: $('menu', doc),
      pause: $('pause', doc),
      wasted: $('wasted', doc),
      end: $('end', doc),
    };
    this.fade = $('fade', doc);
    this._stars = -1;
    this._health = -1;
    this._money = -1;
    this._speed = -1;
    this._district = '';
    this._mapLayer = null;
    this._mapScale = 372 / 210;
  }

  setMapLayer(canvas) {
    this._mapLayer = canvas;
  }

  show(on) {
    this.root.classList.toggle('on', on);
  }

  setHealth(v) {
    const val = Math.max(0, Math.min(100, v));
    if (Math.round(val) === this._health) return;
    this._health = Math.round(val);
    this.health.style.width = `${val}%`;
    this.health.classList.toggle('low', val < 35);
  }

  setStars(n) {
    const count = Math.max(0, Math.min(5, Math.round(n)));
    if (count === this._stars) return;
    this._stars = count;
    this.starEls.forEach((el, i) => {
      el.classList.toggle('lit', i < count);
      el.classList.toggle('cop', i < count && count >= 4);
    });
  }

  setMoney(v) {
    const val = Math.round(v);
    if (val === this._money) return;
    this._money = val;
    this.money.textContent = `$${val.toLocaleString('en-US')}`;
  }

  setSpeed(v) {
    const val = Math.round(v);
    if (val === this._speed) return;
    this._speed = val;
    this.speed.textContent = String(val);
  }

  setDistrict(name) {
    if (name === this._district) return;
    this._district = name;
    this.district.textContent = name;
  }

  setMission(title, step, dist) {
    this.missTitle.textContent = title || 'NO CONTRACT';
    this.missStep.textContent = step || 'Find work at the harbor.';
    this.missDist.textContent = dist || '';
  }

  prompt(text) {
    if (!text) {
      this.promptEl.classList.remove('on');
      return;
    }
    this.promptEl.textContent = text;
    this.promptEl.classList.add('on');
  }

  crosshair(on) {
    this.cross.classList.toggle('on', !!on);
  }

  toast(text, ms = 2600) {
    const el = this.doc.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.toasts.appendChild(el);
    window.setTimeout(() => {
      el.style.transition = 'opacity .35s';
      el.style.opacity = '0';
      window.setTimeout(() => el.remove(), 380);
    }, ms);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
  }

  screen(name) {
    for (const [key, el] of Object.entries(this.screens)) {
      el.classList.toggle('hidden', key !== name);
    }
  }

  setFade(on) {
    this.fade.classList.toggle('on', !!on);
  }

  setEndStats(stats) {
    $('st-money', this.doc).textContent = `$${Math.round(stats.money).toLocaleString('en-US')}`;
    $('st-missions', this.doc).textContent = `${stats.missions}/3`;
    const m = Math.floor(stats.time / 60);
    const s = Math.floor(stats.time % 60).toString().padStart(2, '0');
    $('st-time', this.doc).textContent = `${m}:${s}`;
  }

  // Rotating map, player always pointing up.
  drawMinimap(player, blips, world) {
    const ctx = this.mapCtx;
    const size = this.map.width;
    const half = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#0b1119';
    ctx.fillRect(0, 0, size, size);

    const px = player.pos.x;
    const pz = player.pos.z;
    const heading = player.vehicle ? player.vehicle.heading : player.heading;

    if (this._mapLayer) {
      const span = 560;
      const imgScale = 600 / span;                  // px per metre in the layer
      const k = this._mapScale / imgScale;          // how much to blow it up
      ctx.save();
      ctx.translate(half, half);
      ctx.rotate(-heading);
      ctx.scale(k, k);
      ctx.translate(-(px + span / 2) * imgScale, -(pz + span / 2) * imgScale);
      ctx.drawImage(this._mapLayer, 0, 0);
      ctx.restore();
    }

    const toScreen = (x, z) => {
      const dx = x - px;
      const dz = z - pz;
      const cos = Math.cos(-heading);
      const sin = Math.sin(-heading);
      return [half + (dx * cos - dz * sin) * this._mapScale, half + (dx * sin + dz * cos) * this._mapScale];
    };

    for (const b of blips) {
      const [sx, sy] = toScreen(b.x, b.z);
      if (sx < 6 || sy < 6 || sx > size - 6 || sy > size - 6) {
        // clamp to the rim so the objective stays findable
        const ang = Math.atan2(sy - half, sx - half);
        const r = half - 8;
        ctx.beginPath();
        ctx.arc(half + Math.cos(ang) * r, half + Math.sin(ang) * r, 4, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.globalAlpha = 0.5;
        ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }
      if (b.kind === 'mission') {
        ctx.beginPath();
        ctx.arc(sx, sy, 9, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(242,165,65,0.22)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sx, sy, 4.6, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.fill();
      } else if (b.kind === 'police') {
        ctx.fillStyle = b.color;
        ctx.fillRect(sx - 4, sy - 4, 8, 8);
      } else {
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.fill();
      }
    }

    // player arrow
    ctx.save();
    ctx.translate(half, half);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fillStyle = '#f4ede2';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
  }

  updateDistrict(x, z) {
    this.setDistrict(districtAt(x, z));
  }
}
