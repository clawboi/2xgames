// audio.js — music + procedural sound effects
// iOS requires audio to start from a user gesture; we unlock everything on first touch/click.
// If playMusic() is called before unlock, the request is queued and fires the instant we unlock.

const Audio = (() => {
  let unlocked = false;
  let musicEnabled = true;
  let sfxEnabled = true;
  let currentTrack = null;
  let currentTrackName = null;
  let pendingTrack = null;   // queued until unlock
  let ctx = null;
  let masterMusicVol = 0.45;

  const tracks = {
    menu:     document.getElementById('music-menu'),
    gameplay: document.getElementById('music-gameplay'),
    boss:     document.getElementById('music-boss'),
  };

  // Set reasonable volumes
  Object.values(tracks).forEach(t => { if (t) { t.volume = masterMusicVol; t.loop = true; } });

  // Web Audio context for procedural SFX
  function getCtx() {
    if (!ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      try { ctx = new Ctx(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Called on the FIRST user gesture (start button, screen tap, swatch click)
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    // Try to play+pause every audio element to satisfy iOS autoplay policy
    Object.values(tracks).forEach(t => {
      if (!t) return;
      try {
        const p = t.play();
        if (p && p.then) p.then(() => { t.pause(); t.currentTime = 0; }).catch(() => {});
        else { t.pause(); t.currentTime = 0; }
      } catch (e) {}
    });
    getCtx();
    // If a track was requested before unlock, fire it now
    if (pendingTrack) {
      const name = pendingTrack;
      pendingTrack = null;
      setTimeout(() => playMusic(name), 50);
    }
  }

  function playMusic(name) {
    if (!musicEnabled) return;
    if (!unlocked) { pendingTrack = name; return; }
    const t = tracks[name];
    if (!t) return;
    // Already playing this track? Don't restart.
    if (currentTrack === t && !t.paused) return;
    if (currentTrack && currentTrack !== t) {
      // Quick fade-out then swap
      fadeOut(currentTrack, 250);
    }
    currentTrack = t;
    currentTrackName = name;
    t.volume = 0;
    try {
      const p = t.play();
      if (p && p.catch) p.catch(() => {});
      fadeIn(t, masterMusicVol, 350);
    } catch (e) {}
  }

  function fadeIn(audio, target, ms) {
    const steps = 12;
    const step = target / steps;
    let i = 0;
    const id = setInterval(() => {
      i++;
      audio.volume = Math.min(target, step * i);
      if (i >= steps) clearInterval(id);
    }, ms / steps);
  }

  function fadeOut(audio, ms) {
    const startVol = audio.volume;
    const steps = 8;
    const step = startVol / steps;
    let i = 0;
    const id = setInterval(() => {
      i++;
      audio.volume = Math.max(0, startVol - step * i);
      if (i >= steps) {
        clearInterval(id);
        try { audio.pause(); audio.currentTime = 0; } catch (e) {}
      }
    }, ms / steps);
  }

  function stopMusic() {
    if (currentTrack) {
      try { currentTrack.pause(); currentTrack.currentTime = 0; } catch (e) {}
      currentTrack = null;
      currentTrackName = null;
    }
    pendingTrack = null;
  }

  function setMusicEnabled(on) {
    musicEnabled = on;
    if (!on && currentTrack) {
      try { currentTrack.pause(); } catch (e) {}
    } else if (on && currentTrack) {
      try { currentTrack.play().catch(()=>{}); } catch (e) {}
    } else if (on && currentTrackName && !currentTrack) {
      playMusic(currentTrackName);
    }
  }
  function setSfxEnabled(on) { sfxEnabled = on; }
  function isMusicEnabled() { return musicEnabled; }
  function isSfxEnabled() { return sfxEnabled; }

  // === Procedural SFX (no audio files needed) ===
  function beep({ freq = 440, type = 'square', dur = 0.08, vol = 0.15, slide = 0 }) {
    if (!sfxEnabled || !unlocked) return;
    try {
      const c = getCtx(); if (!c) return;
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
      const c = getCtx(); if (!c) return;
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
    shoot:    () => beep({ freq: 800, type: 'square', dur: 0.05, vol: 0.07, slide: -400 }),
    shootBig: () => { beep({ freq: 200, type: 'sawtooth', dur: 0.12, vol: 0.13, slide: -100 }); noise({ dur: 0.1, vol: 0.08, filterFreq: 500 }); },
    punch:    () => { beep({ freq: 120, type: 'sine', dur: 0.08, vol: 0.18 }); noise({ dur: 0.06, vol: 0.1, filterFreq: 800 }); },
    laser:    () => { beep({ freq: 1200, type: 'sawtooth', dur: 0.15, vol: 0.08, slide: -800 }); beep({ freq: 800, type: 'square', dur: 0.15, vol: 0.04, slide: -400 }); },
    explode:  () => { noise({ dur: 0.4, vol: 0.22, filterFreq: 300 }); beep({ freq: 80, type: 'sawtooth', dur: 0.15, vol: 0.12, slide: -40 }); },
    hit:      () => beep({ freq: 300, type: 'square', dur: 0.06, vol: 0.1, slide: -200 }),
    hurt:     () => { beep({ freq: 180, type: 'sawtooth', dur: 0.2, vol: 0.18, slide: -80 }); noise({ dur: 0.08, vol: 0.06, filterFreq: 400 }); },
    pickup:   () => { beep({ freq: 600, type: 'sine', dur: 0.06, vol: 0.12 }); setTimeout(() => beep({ freq: 900, type: 'sine', dur: 0.08, vol: 0.12 }), 50); setTimeout(() => beep({ freq: 1200, type: 'sine', dur: 0.08, vol: 0.12 }), 100); },
    reload:   () => { beep({ freq: 200, type: 'square', dur: 0.05, vol: 0.08 }); setTimeout(() => beep({ freq: 400, type: 'square', dur: 0.05, vol: 0.08 }), 100); },
    boss:     () => { beep({ freq: 80, type: 'sawtooth', dur: 0.6, vol: 0.25, slide: 40 }); noise({ dur: 0.5, vol: 0.18, filterFreq: 200 }); },
    bossDown: () => { beep({ freq: 600, type: 'sawtooth', dur: 0.4, vol: 0.2, slide: -500 }); setTimeout(() => noise({ dur: 0.6, vol: 0.25, filterFreq: 250 }), 100); },
    combo:    () => { beep({ freq: 1500, type: 'square', dur: 0.05, vol: 0.1 }); setTimeout(() => beep({ freq: 2000, type: 'square', dur: 0.06, vol: 0.1 }), 40); },
    crit:     () => { beep({ freq: 2500, type: 'square', dur: 0.04, vol: 0.08 }); beep({ freq: 1800, type: 'sine', dur: 0.06, vol: 0.06 }); },
    levelUp:  () => { [400, 600, 800, 1000].forEach((f, i) => setTimeout(() => beep({ freq: f, type: 'sine', dur: 0.1, vol: 0.12 }), i * 80)); },
    gameOver: () => { beep({ freq: 400, type: 'sawtooth', dur: 0.3, vol: 0.2, slide: -300 }); setTimeout(() => beep({ freq: 200, type: 'sawtooth', dur: 0.5, vol: 0.2, slide: -150 }), 200); },
    victory:  () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep({ freq: f, type: 'square', dur: 0.18, vol: 0.15 }), i * 120)); },
  };

  return { unlock, playMusic, stopMusic, setMusicEnabled, setSfxEnabled, isMusicEnabled, isSfxEnabled, sfx, get isUnlocked() { return unlocked; } };
})();
