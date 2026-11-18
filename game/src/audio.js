// Solmar Heat — synthesised audio. WebAudio only, no external files.
// Everything is created lazily on the first user gesture so the
// AudioContext is allowed to start; every call guards for a missing context.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenHigh = false;
  let sirenTimer = 0;
  let noiseBuf = null;
  let muted = false;
  let musicTimer = 0;
  let musicStep = 0;
  let musicOn = false;

  // A light bass line + pad, ~100 BPM, only while roaming.
  const bassLine = [55, 0, 55, 65.41, 0, 49, 0, 58.27, 55, 0, 55, 65.41, 73.42, 0, 65.41, 58.27];

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 400;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter).connect(engineGain).connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain).connect(master);
      sirenOsc.start();
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, type = 'lowpass', when = 0) {
    if (!ctx || !master || !noiseBuf) return;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setMuted(m) {
      muted = m;
      if (master && ctx) master.gain.setValueAtTime(m ? 0 : 0.5, ctx.currentTime);
    },
    get muted() { return muted; },
    engine(speed01) {
      if (!ctx || !engineOsc || !engineGain || !engineFilter) return;
      const target = speed01 > 0.02 ? 0.05 + speed01 * 0.05 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 160, ctx.currentTime, 0.08);
      engineFilter.frequency.setTargetAtTime(300 + speed01 * 1200, ctx.currentTime, 0.1);
    },
    siren(on) {
      if (!ctx || !sirenGain || !sirenOsc) return;
      sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, ctx.currentTime, 0.1);
      if (on) {
        sirenTimer += 1 / 60;
        if (sirenTimer > 0.45) {
          sirenTimer = 0; sirenHigh = !sirenHigh;
          sirenOsc.frequency.setValueAtTime(sirenHigh ? 950 : 700, ctx.currentTime);
        }
      }
    },
    shoot() { noise(0.09, 0.5, 1800, 'highpass'); tone(160, 0.12, 'sine', 0.5, 0, 50); },
    reload() { tone(900, 0.05, 'square', 0.12); tone(700, 0.05, 'square', 0.12, 0.09); },
    screech() { noise(0.35, 0.25, 2600, 'bandpass'); },
    crash() { tone(90, 0.3, 'sine', 0.7, 0, 35); noise(0.25, 0.4, 300); },
    pickup() { tone(660, 0.09, 'sine', 0.25); tone(990, 0.14, 'sine', 0.25, 0.09); },
    jingle() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.3, i * 0.11)); },
    phone() { tone(1250, 0.12, 'sine', 0.2); tone(950, 0.12, 'sine', 0.2, 0.16); tone(1250, 0.12, 'sine', 0.2, 0.32); },
    busted() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.2, i * 0.16)); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.3, i * 0.12)); },
    step(dt, driving) {
      if (!ctx) return;
      musicOn = driving;
      if (!musicOn) return;
      musicTimer += dt;
      if (musicTimer >= 0.3) {
        musicTimer -= 0.3;
        const f = bassLine[musicStep % bassLine.length];
        musicStep += 1;
        if (f) tone(f, 0.28, 'triangle', 0.12);
        if (musicStep % 8 === 0) {
          tone(220, 1.1, 'sine', 0.04);
          tone(277, 1.1, 'sine', 0.035);
        }
      }
    },
  };
}
