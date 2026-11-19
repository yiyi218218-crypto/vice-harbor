// Sound is synthesised, never loaded: two oscillators for the engine, a swept siren,
// a noise burst for gunfire and a small pad under the whole city.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.started = false;
    this.muted = false;
    this.engine = null;
    this.siren = null;
    this.ambient = null;
    this.noise = null;
  }

  ensure() {
    if (this.started) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise();
      this.startAmbient();
      this.started = true;
      return true;
    } catch (err) {
      return false;
    }
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  startAmbient() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.ambient = { src, gain };

    // slow two-note pad, the sea at night
    const padGain = ctx.createGain();
    padGain.gain.value = 0.035;
    padGain.connect(this.master);
    for (const [freq, detune] of [[110, -6], [164.8, 5], [220, 9]]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = 0.4;
      osc.connect(g).connect(padGain);
      osc.start();
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(padGain.gain);
    lfo.start();
  }

  setEngine(on, rpm = 0.2) {
    if (!this.started) return;
    const ctx = this.ctx;
    if (on && !this.engine) {
      const out = ctx.createGain();
      out.gain.value = 0.0001;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 620;
      filter.Q.value = 4;
      const a = ctx.createOscillator();
      a.type = 'sawtooth';
      a.frequency.value = 52;
      const b = ctx.createOscillator();
      b.type = 'square';
      b.frequency.value = 26;
      const bg = ctx.createGain();
      bg.gain.value = 0.35;
      a.connect(filter);
      b.connect(bg).connect(filter);
      filter.connect(out).connect(this.master);
      a.start();
      b.start();
      this.engine = { a, b, filter, out, on: true };
      out.gain.setTargetAtTime(0.11, ctx.currentTime, 0.12);
    } else if (!on && this.engine) {
      this.engine.out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
      const e = this.engine;
      window.setTimeout(() => {
        try { e.a.stop(); e.b.stop(); } catch (err) { /* already stopped */ }
      }, 400);
      this.engine = null;
    }
    if (on && this.engine) {
      const f = 46 + rpm * 128;
      this.engine.a.frequency.setTargetAtTime(f, ctx.currentTime, 0.06);
      this.engine.b.frequency.setTargetAtTime(f * 0.5, ctx.currentTime, 0.06);
      this.engine.filter.frequency.setTargetAtTime(420 + rpm * 1400, ctx.currentTime, 0.08);
    }
  }

  setSiren(on) {
    if (!this.started) return;
    const ctx = this.ctx;
    if (on && !this.siren) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 720;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.9;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 260;
      lfo.connect(lfoGain).connect(osc.frequency);
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain).connect(this.master);
      osc.start();
      lfo.start();
      gain.gain.setTargetAtTime(0.035, ctx.currentTime, 0.4);
      this.siren = { osc, lfo, gain };
    } else if (!on && this.siren) {
      this.siren.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
      const s = this.siren;
      window.setTimeout(() => {
        try { s.osc.stop(); s.lfo.stop(); } catch (err) { /* already stopped */ }
      }, 600);
      this.siren = null;
    }
  }

  gunshot(vol = 0.5) {
    if (!this.started) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1.6;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1500;
    filter.Q.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    src.stop(ctx.currentTime + 0.2);

    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(120, ctx.currentTime);
    thump.frequency.exponentialRampToValueAtTime(42, ctx.currentTime + 0.14);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(vol * 0.7, ctx.currentTime);
    tg.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
    thump.connect(tg).connect(this.master);
    thump.start();
    thump.stop(ctx.currentTime + 0.18);
  }

  impact(vol = 0.35) {
    if (!this.started) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(90, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.2);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
  }

  blip(freq = 660) {
    if (!this.started) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }

  sting(kind) {
    if (!this.started) return;
    const ctx = this.ctx;
    const notes = kind === 'fail' ? [220, 174, 130] : kind === 'wanted' ? [330, 415] : [392, 523, 659, 784];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = kind === 'fail' ? 'sawtooth' : 'triangle';
      osc.frequency.value = f;
      const gain = ctx.createGain();
      const t0 = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.09, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      osc.connect(gain).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.55);
    });
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }
}
