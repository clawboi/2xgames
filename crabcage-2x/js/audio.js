// audio.js — music + procedural sound effects
// iOS requires audio to start from a user gesture; we unlock everything on first touch/click.

const Audio = (() => {
  let unlocked = false;
  let musicEnabled = true;
  let sfxEnabled = true;
  let currentTrack = null;
  let ctx = null;

  const tracks = {
    menu:     document.getElementById('music-menu'),
    gameplay: document.getElementById('music-gameplay'),
    boss:     document.getElementById('music-boss'),
  };

  // Set reasonable volumes
  Object.values(tracks).forEach(t => { if (t) t.volume = 0.4; });

  // Web Audio context for procedural SFX
  function getCtx() {
    if (!ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      ctx = new Ctx();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Called on the FIRST user gesture (start button, screen tap)
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    // Try to play+pause every audio element to satisfy iOS autoplay policy
    Object.values(tracks).forEach(t => {
      if (!t) return;
      const p = t.play();
      if (p && p.catch) p.catch(() => {});
      t.pause();
      t.currentTime = 0;
    });
    getCtx();
  }

  function playMusic(name) {
    if (!musicEnabled || !unlocked) return;
    const t = tracks[name];
    if (!t) return;
    if (currentTrack && currentTrack !== t) {
      currentTrack.pause();
      currentTrack.currentTime = 0;
    }
    currentTrack = t;
    const p = t.play();
    if (p && p.catch) p.catch(() => {});
  }

  function stopMusic() {
    if (currentTrack) {
      currentTrack.pause();
      currentTrack.currentTime = 0;
      currentTrack = null;
    }
  }

  function setMusicEnabled(on) {
    musicEnabled = on;
    if (!on && currentTrack) currentTrack.pause();
    else if (on && currentTrack) currentTrack.play().catch(()=>{});
  }
  function setSfxEnabled(on) { sfxEnabled = on; }

  // === Procedural SFX (no audio files needed) ===
  function beep({ freq = 440, type = 'square', dur = 0.08, vol = 0.15, slide = 0 }) {
    if (!sfxEnabled || !unlocked) return;
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), c.currentTime + dur);
      gain.gain.setValueAtTime(vol, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      osc.connect(gain).connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + dur);
    } catch (e) {}
  }

  function noise({ dur = 0.15, vol = 0.2, filterFreq = 1000 }) {
    if (!sfxEnabled || !unlocked) return;
    try {
      const c = getCtx();
      const bufferSize = c.sampleRate * dur;
      const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      src.buffer = buffer;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const gain = c.createGain();
      gain.gain.setValueAtTime(vol, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      src.connect(filter).connect(gain).connect(c.destination);
      src.start();
      src.stop(c.currentTime + dur);
    } catch (e) {}
  }

  // Pre-baked SFX functions
  const sfx = {
    shoot:    () => beep({ freq: 800, type: 'square', dur: 0.05, vol: 0.08, slide: -400 }),
    shootBig: () => { beep({ freq: 200, type: 'sawtooth', dur: 0.12, vol: 0.15, slide: -100 }); noise({ dur: 0.1, vol: 0.1, filterFreq: 500 }); },
    punch:    () => beep({ freq: 120, type: 'sine', dur: 0.08, vol: 0.2 }),
    laser:    () => { beep({ freq: 1200, type: 'sawtooth', dur: 0.15, vol: 0.1, slide: -800 }); beep({ freq: 800, type: 'square', dur: 0.15, vol: 0.05, slide: -400 }); },
    explode:  () => noise({ dur: 0.4, vol: 0.25, filterFreq: 300 }),
    hit:      () => beep({ freq: 300, type: 'square', dur: 0.06, vol: 0.12, slide: -200 }),
    hurt:     () => beep({ freq: 180, type: 'sawtooth', dur: 0.2, vol: 0.2, slide: -80 }),
    pickup:   () => { beep({ freq: 600, type: 'sine', dur: 0.08, vol: 0.15 }); setTimeout(() => beep({ freq: 900, type: 'sine', dur: 0.1, vol: 0.15 }), 60); },
    reload:   () => { beep({ freq: 200, type: 'square', dur: 0.05, vol: 0.1 }); setTimeout(() => beep({ freq: 400, type: 'square', dur: 0.05, vol: 0.1 }), 100); },
    boss:     () => { beep({ freq: 80, type: 'sawtooth', dur: 0.6, vol: 0.3, slide: 40 }); noise({ dur: 0.5, vol: 0.2, filterFreq: 200 }); },
    gameOver: () => { beep({ freq: 400, type: 'sawtooth', dur: 0.3, vol: 0.2, slide: -300 }); setTimeout(() => beep({ freq: 200, type: 'sawtooth', dur: 0.5, vol: 0.2, slide: -150 }), 200); },
  };

  return { unlock, playMusic, stopMusic, setMusicEnabled, setSfxEnabled, sfx };
})();
