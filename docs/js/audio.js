// audio.js — music + procedural sound effects
// FIX: unlock() no longer pauses tracks (which was racing with playMusic).
// Instead, we just call .play() once on each track in the same gesture to
// satisfy iOS, then pause the ones we don't want. The track that's CURRENTLY
// requested stays playing.

const Audio = (() => {
  let unlocked = false;
  let musicEnabled = true;
  let sfxEnabled = true;
  let currentTrack = null;
  let currentTrackName = null;
  let pendingTrack = null;
  let ctx = null;
  const masterMusicVol = 0.45;

  const tracks = {
    menu:     document.getElementById('music-menu'),
    gameplay: document.getElementById('music-gameplay'),
    boss:     document.getElementById('music-boss'),
  };
  Object.values(tracks).forEach(t => { if (t) { t.volume = 0; t.loop = true; } });

  function getCtx() {
    try {
      if (!ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        ctx = new Ctx();
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    } catch (e) { return null; }
  }

  // Called on the FIRST user gesture.
  // Strategy: gesture-priming play+pause every track THAT WE DON'T CURRENTLY WANT,
  // then play the one we DO want. iOS counts a paused-then-played track as "unlocked."
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    getCtx();
    // For each track other than the pending one, do a silent play+immediate pause to register them
    const wanted = pendingTrack;
    Object.entries(tracks).forEach(([name, t]) => {
      if (!t) return;
      try {
        t.muted = true;       // prime silently
        const p = t.play();
        if (p && p.then) {
          p.then(() => {
            try { t.pause(); t.currentTime = 0; t.muted = false; } catch (e) {}
          }).catch(() => { t.muted = false; });
        } else {
          try { t.pause(); t.currentTime = 0; t.muted = false; } catch (e) {}
        }
      } catch (e) {}
    });
    // Now actually play the pending track (or none)
    if (wanted) {
      pendingTrack = null;
      // Slight delay to let the muted-prime resolve first on iOS
      setTimeout(() => playMusic(wanted), 80);
    }
  }

  function playMusic(name) {
    if (!musicEnabled) return;
    if (!unlocked) { pendingTrack = name; return; }
    const t = tracks[name];
    if (!t) return;
    if (currentTrack === t && !t.paused) return;
    // Stop the previous track fast
    if (currentTrack && currentTrack !== t) {
      try { currentTrack.pause(); currentTrack.currentTime = 0; } catch (e) {}
    }
    currentTrack = t;
    currentTrackName = name;
    try {
      t.muted = false;
      t.volume = 0;
      const p = t.play();
      if (p && p.catch) p.catch(() => {});
      fadeIn(t, masterMusicVol, 400);
    } catch (e) {}
  }

  function fadeIn(audio, target, ms) {
    const steps = 14;
    const step = target / steps;
    let i = 0;
    const id = setInterval(() => {
      i++;
      try { audio.volume = Math.min(target, step * i); } catch (e) {}
      if (i >= steps) clearInterval(id);
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
    } else if (on && currentTrackName) {
      const t = tracks[currentTrackName];
      if (t && t.paused) {
        try { t.volume = masterMusicVol; t.play().catch(() => {}); } catch (e) {}
      }
    }
  }
  function setSfxEnabled(on) { sfxEnabled = on; }
  function isMusicEnabled() { return musicEnabled; }
  function isSfxEnabled() { return sfxEnabled; }

  // === Procedural SFX ===
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
      const bufferSize = Math.floor(c.sampleRate * dur);
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

  const sfx = {
    shoot:    () => beep({ freq: 800, type: 'square', dur: 0.05, vol: 0.07, slide: -400 }),
    shootBig: () => { beep({ freq: 200, type: 'sawtooth', dur: 0.12, vol: 0.13, slide: -100 }); noise({ dur: 0.1, vol: 0.08, filterFreq: 500 }); },
    punch:    () => { beep({ freq: 120, type: 'sine', dur: 0.08, vol: 0.18 }); noise({ dur: 0.06, vol: 0.1, filterFreq: 800 }); },
    laser:    () => { beep({ freq: 1200, type: 'sawtooth', dur: 0.15, vol: 0.08, slide: -800 }); beep({ freq: 800, type: 'square', dur: 0.15, vol: 0.04, slide: -400 }); },
    explode:  () => { noise({ dur: 0.4, vol: 0.22, filterFreq: 300 }); beep({ freq: 80, type: 'sawtooth', dur: 0.15, vol: 0.12, slide: -40 }); },
    hit:      () => beep({ freq: 300, type: 'square', dur: 0.06, vol: 0.1, slide: -200 }),
    hurt:     () => { beep({ freq: 180, type: 'sawtooth', dur: 0.2, vol: 0.18, slide: -80 }); noise({ dur: 0.08, vol: 0.06, filterFreq: 400 }); },
    pickup:   () => { beep({ freq: 600, type: 'sine', dur: 0.06, vol: 0.12 }); setTimeout(() => beep({ freq: 900, type: 'sine', dur: 0.08, vol: 0.12 }), 50); setTimeout(() => beep({ freq: 1200, type: 'sine', dur: 0.08, vol: 0.12 }), 100); },
    cash:     () => { beep({ freq: 1400, type: 'square', dur: 0.04, vol: 0.1 }); setTimeout(() => beep({ freq: 1800, type: 'square', dur: 0.04, vol: 0.08 }), 30); },
    reload:   () => { beep({ freq: 200, type: 'square', dur: 0.05, vol: 0.08 }); setTimeout(() => beep({ freq: 400, type: 'square', dur: 0.05, vol: 0.08 }), 100); },
    boss:     () => { beep({ freq: 80, type: 'sawtooth', dur: 0.6, vol: 0.25, slide: 40 }); noise({ dur: 0.5, vol: 0.18, filterFreq: 200 }); },
    bossDown: () => { beep({ freq: 600, type: 'sawtooth', dur: 0.4, vol: 0.2, slide: -500 }); setTimeout(() => noise({ dur: 0.6, vol: 0.25, filterFreq: 250 }), 100); },
    combo:    () => { beep({ freq: 1500, type: 'square', dur: 0.05, vol: 0.1 }); setTimeout(() => beep({ freq: 2000, type: 'square', dur: 0.06, vol: 0.1 }), 40); },
    crit:     () => { beep({ freq: 2500, type: 'square', dur: 0.04, vol: 0.08 }); beep({ freq: 1800, type: 'sine', dur: 0.06, vol: 0.06 }); },
    levelUp:  () => { [400, 600, 800, 1000].forEach((f, i) => setTimeout(() => beep({ freq: f, type: 'sine', dur: 0.1, vol: 0.12 }), i * 80)); },
    multiKill:() => { [600, 900, 1200, 1500].forEach((f, i) => setTimeout(() => beep({ freq: f, type: 'square', dur: 0.07, vol: 0.12 }), i * 50)); },
    gameOver: () => { beep({ freq: 400, type: 'sawtooth', dur: 0.3, vol: 0.2, slide: -300 }); setTimeout(() => beep({ freq: 200, type: 'sawtooth', dur: 0.5, vol: 0.2, slide: -150 }), 200); },
    victory:  () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep({ freq: f, type: 'square', dur: 0.18, vol: 0.15 }), i * 120)); },
    highScore:() => { [523, 659, 784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => beep({ freq: f, type: 'square', dur: 0.12, vol: 0.13 }), i * 90)); },
  };

  return { unlock, playMusic, stopMusic, setMusicEnabled, setSfxEnabled, isMusicEnabled, isSfxEnabled, sfx, get isUnlocked() { return unlocked; } };
})();
