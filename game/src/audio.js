// The city's sound, made with oscillators and noise instead of files: an engine whose pitch follows
// the gears, a two-tone siren that fades in with the cruisers, gunshots, tyres, pickups and the
// horn of the harbour. Nothing is fetched; the context opens on the first key or click.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noise = null;
  let muted = false;
  let engine = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    // Two seconds of white noise, reused by every noisy effect.
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  function noiseBurst({ type = 'bandpass', freq = 900, q = 0.8, gain = 0.5, decay = 0.12, at = 0 }) {
    if (!ctx || muted) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    const t = now() + at;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + decay);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + decay + 0.02);
  }

  function tone({ freq = 440, to = null, type = 'sine', gain = 0.2, attack = 0.005, decay = 0.2, at = 0 }) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const t = now() + at;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + decay);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + decay + 0.05);
  }

  /* --- the engine: a saw pair through a lowpass, kept alive while driving ------------- */
  function engineStart() {
    if (!ctx || engine) return;
    const out = ctx.createGain();
    out.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 3;
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = 'sawtooth';
    b.type = 'square';
    a.frequency.value = 60;
    b.frequency.value = 90;
    const blend = ctx.createGain();
    blend.gain.value = 0.45;
    a.connect(filter);
    b.connect(blend).connect(filter);
    filter.connect(out).connect(master);
    a.start();
    b.start();
    engine = { a, b, filter, out };
  }

  function engineStop() {
    if (!engine) return;
    try {
      engine.out.gain.setTargetAtTime(0, now(), 0.08);
      engine.a.stop(now() + 0.4);
      engine.b.stop(now() + 0.4);
    } catch (e) {
      /* already stopped */
    }
    engine = null;
  }

  /** speed in m/s, throttle 0..1. */
  function setEngine(speed, throttle) {
    if (!engine) return;
    const gear = Math.min(4, Math.floor(Math.abs(speed) / 11));
    const rpm = 52 + (Math.abs(speed) - gear * 11) * 6.2 + gear * 9;
    engine.a.frequency.setTargetAtTime(rpm, now(), 0.05);
    engine.b.frequency.setTargetAtTime(rpm * 1.5, now(), 0.05);
    engine.filter.frequency.setTargetAtTime(420 + Math.abs(speed) * 26, now(), 0.08);
    engine.out.gain.setTargetAtTime(0.05 + throttle * 0.055 + Math.min(0.05, Math.abs(speed) * 0.001), now(), 0.09);
  }

  /* --- one-shots -------------------------------------------------------------------- */
  const sounds = {
    pistol() {
      noiseBurst({ freq: 1500, q: 0.6, gain: 0.6, decay: 0.1 });
      tone({ freq: 220, to: 60, type: 'square', gain: 0.2, decay: 0.09 });
    },
    smg() {
      noiseBurst({ freq: 2100, q: 0.5, gain: 0.34, decay: 0.06 });
      tone({ freq: 180, to: 70, type: 'square', gain: 0.12, decay: 0.05 });
    },
    punch() {
      noiseBurst({ freq: 260, q: 1.2, gain: 0.4, decay: 0.09 });
    },
    hit() {
      noiseBurst({ type: 'highpass', freq: 2600, gain: 0.25, decay: 0.05 });
    },
    crash() {
      noiseBurst({ type: 'lowpass', freq: 700, q: 1.4, gain: 0.55, decay: 0.28 });
      tone({ freq: 90, to: 40, type: 'sine', gain: 0.28, decay: 0.3 });
    },
    tyres() {
      noiseBurst({ type: 'highpass', freq: 1800, gain: 0.18, decay: 0.3 });
    },
    pickup() {
      tone({ freq: 660, to: 990, type: 'triangle', gain: 0.18, decay: 0.16 });
      tone({ freq: 990, to: 1320, type: 'triangle', gain: 0.14, decay: 0.2, at: 0.08 });
    },
    cash() {
      tone({ freq: 880, type: 'triangle', gain: 0.16, decay: 0.12 });
      tone({ freq: 1320, type: 'triangle', gain: 0.13, decay: 0.24, at: 0.1 });
    },
    mission() {
      const notes = [392, 493.9, 587.3, 784];
      notes.forEach((f, i) => tone({ freq: f, type: 'triangle', gain: 0.14, decay: 0.9, at: i * 0.07 }));
    },
    fail() {
      [392, 330, 262].forEach((f, i) => tone({ freq: f, type: 'sawtooth', gain: 0.11, decay: 0.5, at: i * 0.14 }));
    },
    star() {
      [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, type: 'square', gain: 0.07, decay: 0.3, at: i * 0.05 }));
    },
    horn() {
      tone({ freq: 320, type: 'sawtooth', gain: 0.12, decay: 0.35 });
      tone({ freq: 404, type: 'sawtooth', gain: 0.1, decay: 0.35 });
    },
    step() {
      noiseBurst({ type: 'bandpass', freq: 320, q: 1.1, gain: 0.05, decay: 0.06 });
    },
    reload() {
      noiseBurst({ type: 'bandpass', freq: 1400, q: 2, gain: 0.16, decay: 0.1 });
      noiseBurst({ type: 'bandpass', freq: 900, q: 2, gain: 0.14, decay: 0.1, at: 0.18 });
    },
  };

  /* --- the siren: a looping two-tone that fades with the nearest cruiser -------------- */
  let siren = null;
  function setSiren(level) {
    if (!ctx || muted) return;
    if (level <= 0) {
      if (siren) {
        siren.gain.gain.setTargetAtTime(0, now(), 0.3);
        const s = siren;
        siren = null;
        setTimeout(() => {
          try {
            s.osc1.stop();
            s.osc2.stop();
          } catch (e) {
            /* already gone */
          }
        }, 1200);
      }
      return;
    }
    if (!siren) {
      const g = ctx.createGain();
      g.gain.value = 0;
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = 'square';
      o2.type = 'sine';
      o1.frequency.value = 720;
      o2.frequency.value = 960;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.62;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 190;
      lfo.connect(lfoGain);
      lfoGain.connect(o1.frequency);
      lfoGain.connect(o2.frequency);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1100;
      filter.Q.value = 1.4;
      o1.connect(filter);
      o2.connect(filter);
      filter.connect(g).connect(master);
      o1.start();
      o2.start();
      lfo.start();
      siren = { osc1: o1, osc2: o2, gain: g, lfo };
    }
    siren.gain.gain.setTargetAtTime(Math.min(0.16, 0.035 + level * 0.03), now(), 0.3);
  }

  return {
    unlock,
    play(name) {
      if (!ctx || muted) return;
      const fn = sounds[name];
      if (fn) fn();
    },
    engineStart,
    engineStop,
    setEngine,
    setSiren,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.55;
      return muted;
    },
    get muted() {
      return muted;
    },
    get ready() {
      return Boolean(ctx) && ctx.state === 'running';
    },
  };
}
