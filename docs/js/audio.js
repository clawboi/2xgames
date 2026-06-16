// audio.js — music + procedural SFX. v4 adds volume slider + MediaSession cleanup.

const Audio = (() => {
  let unlocked = false;
  let musicEnabled = true;
  let sfxEnabled = true;
  let currentTrack = null;
  let currentTrackName = null;
  let pendingTrack = null;
  let ctx = null;
  let masterMusicVol = 0.45;

  const tracks = {
    menu:     document.getElementById('music-menu'),
    gameplay: document.getElementById('music-gameplay'),
    boss:     document.getElementById('music-boss'),
    party:    document.getElementById('music-party'),
    fameup:   document.getElementById('music-fameup'),
  };
  Object.values(tracks).forEach(t => { if (t) { t.volume = 0; t.loop = true; } });

  let sfxBus = null;
  function getSfxBus(c) {
    if (sfxBus) return sfxBus;
    try {
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 8;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.18;
      const masterGain = c.createGain();
      masterGain.gain.value = 0.55; // overall SFX volume reduction prevents clipping
      comp.connect(masterGain).connect(c.destination);
      sfxBus = comp;
    } catch (e) { sfxBus = c.destination; }
    return sfxBus;
  }

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

  function clearMediaSession() {
    try {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
      }
    } catch (e) {}
  }

  // WebAudio gain nodes per track — iOS Safari ignores HTMLMediaElement.volume,
  // so we route each audio element through a MediaElementAudioSourceNode + GainNode.
  const gainNodes = {}; // name -> GainNode
  const audioSources = {}; // name -> MediaElementSource (one per element, can only be created once)

  function setupGainFor(name, audioEl) {
    const c = getCtx();
    if (!c || !audioEl || audioSources[name]) return;
    try {
      const src = c.createMediaElementSource(audioEl);
      const gain = c.createGain();
      gain.gain.value = masterMusicVol;
      src.connect(gain);
      gain.connect(c.destination);
      audioSources[name] = src;
      gainNodes[name] = gain;
    } catch (e) {}
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    getCtx();
    const wanted = pendingTrack;
    Object.entries(tracks).forEach(([name, t]) => {
      if (!t) return;
      try {
        // Belt + suspenders: set volume AND muted to 0/true before play
        t.volume = 0;
        t.muted = true;
        const p = t.play();
        if (p && p.then) {
          p.then(() => {
            try { t.pause(); t.currentTime = 0; } catch (e) {}
            // Keep muted+volume 0 until something actually wants to play this track
            setupGainFor(name, t);
          }).catch(() => { setupGainFor(name, t); });
        } else {
          try { t.pause(); t.currentTime = 0; } catch (e) {}
          setupGainFor(name, t);
        }
      } catch (e) {}
    });
    if (wanted) {
      pendingTrack = null;
      setTimeout(() => playMusic(wanted), 80);
    }
  }

  function playMusic(name) {
    if (fadeInterval) { clearInterval(fadeInterval); fadeInterval = null; }
    if (fadeInInterval) { clearInterval(fadeInInterval); fadeInInterval = null; }
    if (!musicEnabled) return;
    if (!unlocked) { pendingTrack = name; return; }
    const t = tracks[name];
    if (!t) return;
    // If this track previously errored, fall back to menu
    if (t._loadFailed && name !== 'menu') {
      playMusic('menu');
      return;
    }
    if (currentTrack === t && !t.paused) return;
    // Mark error handler once
    if (!t._errorHookSet) {
      t._errorHookSet = true;
      t.addEventListener('error', () => { t._loadFailed = true; }, { once: true });
    }
    // Force-stop ALL other tracks to prevent overlap glitches (e.g. boss → gameplay)
    Object.values(tracks).forEach(other => {
      if (other && other !== t) {
        try { other.pause(); other.currentTime = 0; other.volume = 0; } catch (e) {}
      }
    });
    currentTrack = t;
    currentTrackName = name;
    try {
      t.muted = false;
      t.volume = 0;
      t.playbackRate = 1.0;
      const p = t.play();
      if (p && p.catch) p.catch(() => {});
      fadeIn(t, masterMusicVol, 400);
    } catch (e) {}
    // Clear iOS now-playing metadata so the lock screen doesn't show this as a "song"
    try {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
        // Disable all media keys so iOS can't intercept
        ['play','pause','previoustrack','nexttrack','seekbackward','seekforward'].forEach(k => {
          try { navigator.mediaSession.setActionHandler(k, null); } catch (e) {}
        });
      }
    } catch (e) {}
  }

  let fadeInInterval = null;
  function fadeIn(audio, target, ms) {
    if (fadeInInterval) { clearInterval(fadeInInterval); fadeInInterval = null; }
    const steps = 14;
    const step = target / steps;
    let i = 0;
    fadeInInterval = setInterval(() => {
      i++;
      try { audio.volume = Math.min(target, step * i); } catch (e) {}
      // Update WebAudio gain too (iOS)
      try {
        if (currentTrackName && gainNodes[currentTrackName]) {
          gainNodes[currentTrackName].gain.value = Math.min(target, step * i);
        }
      } catch (e) {}
      if (i >= steps) { clearInterval(fadeInInterval); fadeInInterval = null; }
    }, ms / steps);
  }

  function stopMusic() {
    if (currentTrack) {
      try { currentTrack.pause(); currentTrack.currentTime = 0; } catch (e) {}
      currentTrack = null;
      currentTrackName = null;
    }
    pendingTrack = null;
    clearMediaSession();
  }
  let fadeInterval = null;
  function fadeOutMusic(ms = 1000) {
    const t = currentTrack;
    if (!t) return;
    if (fadeInterval) { clearInterval(fadeInterval); fadeInterval = null; }
    const start = t.volume;
    const step = start / 20;
    let i = 0;
    fadeInterval = setInterval(() => {
      i++;
      try { t.volume = Math.max(0, start - step * i); } catch (e) {}
      // Also fade the WebAudio gain (iOS)
      Object.values(gainNodes).forEach(g => {
        if (currentTrackName && g === gainNodes[currentTrackName]) {
          try { g.gain.value = Math.max(0, start - step * i); } catch (e) {}
        }
      });
      if (i >= 20) { clearInterval(fadeInterval); fadeInterval = null; try { t.pause(); } catch (e) {} }
    }, ms / 20);
  }

  function pauseAll() {
    if (currentTrack) { try { currentTrack.pause(); } catch (e) {} }
    stopPartyBeat();
    clearMediaSession();
  }
  function resume() {
    if (musicEnabled && currentTrack && currentTrack.paused) {
      try { currentTrack.volume = masterMusicVol; currentTrack.play().catch(() => {}); } catch (e) {}
    }
  }

  function setMusicEnabled(on) {
    musicEnabled = on;
    if (!on && currentTrack) {
      try { currentTrack.pause(); } catch (e) {}
      clearMediaSession();
    } else if (on && currentTrackName) {
      const t = tracks[currentTrackName];
      if (t && t.paused) { try { t.volume = masterMusicVol; t.play().catch(() => {}); } catch (e) {} }
    }
  }
  function setSfxEnabled(on) { sfxEnabled = on; }
  function setMusicVolume(v) {
    masterMusicVol = Math.max(0, Math.min(1, v));
    if (currentTrack) { try { currentTrack.volume = masterMusicVol; } catch (e) {} }
    ['music-menu','music-gameplay','music-boss','music-party'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { try { el.volume = masterMusicVol; } catch (e) {} }
    });
    // iOS Safari: apply through WebAudio gain nodes (where HTMLMediaElement.volume is ignored)
    Object.values(gainNodes).forEach(g => {
      try { g.gain.value = masterMusicVol; } catch (e) {}
    });
  }
  function getMusicVolume() { return masterMusicVol; }
  function isMusicEnabled() { return musicEnabled; }
  function isSfxEnabled() { return sfxEnabled; }

  function beep({ freq = 440, type = 'square', dur = 0.08, vol = 0.15, slide = 0 }) {
    if (!sfxEnabled || !unlocked) return;
    try {
      const c = getCtx(); if (!c) return;
      const bus = getSfxBus(c);
      const osc = c.createOscillator();
      const gain = c.createGain();
      // Small pitch variation per call for less repetition (±5%)
      const pitchVar = 1 + (Math.random() - 0.5) * 0.10;
      osc.type = type;
      osc.frequency.setValueAtTime(freq * pitchVar, c.currentTime);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, (freq + slide) * pitchVar), c.currentTime + dur);
      gain.gain.setValueAtTime(vol, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      osc.connect(gain).connect(bus);
      osc.start();
      osc.stop(c.currentTime + dur);
    } catch (e) {}
  }
  function noise({ dur = 0.15, vol = 0.2, filterFreq = 1000 }) {
    if (!sfxEnabled || !unlocked) return;
    try {
      const c = getCtx(); if (!c) return;
      const bus = getSfxBus(c);
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
      src.connect(filter).connect(gain).connect(bus);
      src.start();
      src.stop(c.currentTime + dur);
    } catch (e) {}
  }

  const sfx = {
    shoot:    () => beep({ freq: 800, type: 'square', dur: 0.05, vol: 0.07, slide: -400 }),
    shootBig: () => { beep({ freq: 200, type: 'sawtooth', dur: 0.12, vol: 0.13, slide: -100 }); noise({ dur: 0.1, vol: 0.08, filterFreq: 500 }); },
    uiClick:  () => { beep({ freq: 900, type: 'square', dur: 0.025, vol: 0.05 }); setTimeout(() => beep({ freq: 600, type: 'square', dur: 0.02, vol: 0.04 }), 18); },
    dash:     () => { beep({ freq: 1200, type: 'sine', dur: 0.08, vol: 0.06, slide: 600 }); noise({ dur: 0.06, vol: 0.04, filterFreq: 2000 }); },
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
    thunder:  () => { noise({ dur: 0.6, vol: 0.3, filterFreq: 200 }); beep({ freq: 60, type: 'sawtooth', dur: 0.4, vol: 0.18, slide: -30 }); },
    magnet:   () => { beep({ freq: 1000, type: 'sine', dur: 0.08, vol: 0.1 }); setTimeout(() => beep({ freq: 1400, type: 'sine', dur: 0.1, vol: 0.1 }), 60); setTimeout(() => beep({ freq: 1800, type: 'sine', dur: 0.12, vol: 0.1 }), 120); },
    nuke:     () => { noise({ dur: 1.2, vol: 0.35, filterFreq: 400 }); beep({ freq: 100, type: 'sawtooth', dur: 0.6, vol: 0.22, slide: -60 }); setTimeout(() => noise({ dur: 0.8, vol: 0.3, filterFreq: 200 }), 200); },
    berserk:  () => { [200, 300, 450, 600, 800].forEach((f, i) => setTimeout(() => beep({ freq: f, type: 'sawtooth', dur: 0.1, vol: 0.15 }), i * 70)); },
    heartbeat: () => { beep({ freq: 80, type: 'sine', dur: 0.12, vol: 0.18 }); setTimeout(() => beep({ freq: 70, type: 'sine', dur: 0.14, vol: 0.14 }), 180); },
    hitstop:  () => { beep({ freq: 200, type: 'square', dur: 0.05, vol: 0.15 }); noise({ dur: 0.04, vol: 0.1, filterFreq: 800 }); },
  };

  // ============ PROCEDURAL PARTY MUSIC ============
  // Builds a looping trap-style beat using Web Audio when partysong.mp3 isn't present.
  let partyLoopRunning = false;
  let partyLoopTimer = null;
  function startPartyBeat() {
    if (partyLoopRunning || !unlocked) return;
    const c = getCtx(); if (!c) return;
    partyLoopRunning = true;
    let step = 0;
    const bpm = 140;
    const stepMs = 60000 / bpm / 4; // 16th notes
    function tick() {
      if (!partyLoopRunning) return;
      const beat = step % 16;
      const t = c.currentTime;
      // Kick on 0, 4, 8, 12
      if (beat === 0 || beat === 4 || beat === 8 || beat === 12) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        g.gain.setValueAtTime(0.4, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        o.connect(g).connect(c.destination);
        o.start(t); o.stop(t + 0.2);
      }
      // Hi-hat on offbeats
      if (beat % 2 === 1) {
        const bufSize = Math.floor(c.sampleRate * 0.03);
        const buf = c.createBuffer(1, bufSize, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
        const src = c.createBufferSource(); src.buffer = buf;
        const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
        const g = c.createGain(); g.gain.value = 0.08;
        src.connect(f).connect(g).connect(c.destination);
        src.start(t); src.stop(t + 0.04);
      }
      // Snare on 4, 12
      if (beat === 4 || beat === 12) {
        const bufSize = Math.floor(c.sampleRate * 0.12);
        const buf = c.createBuffer(1, bufSize, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
        const src = c.createBufferSource(); src.buffer = buf;
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800;
        const g = c.createGain(); g.gain.value = 0.16;
        src.connect(f).connect(g).connect(c.destination);
        src.start(t); src.stop(t + 0.14);
      }
      // Trap synth — minor pentatonic melody on certain beats
      if ([0, 3, 6, 8, 11, 14].includes(beat)) {
        const notes = [220, 277, 330, 392, 466]; // A minor pent
        const noteIdx = (Math.floor(step / 16) + beat) % notes.length;
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(notes[noteIdx], t);
        g.gain.setValueAtTime(0.06, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2000;
        o.connect(f).connect(g).connect(c.destination);
        o.start(t); o.stop(t + 0.27);
      }
      // 808 bass on 0, 8
      if (beat === 0 || beat === 8) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(55, t);
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        o.connect(g).connect(c.destination);
        o.start(t); o.stop(t + 0.5);
      }
      step++;
      partyLoopTimer = setTimeout(tick, stepMs);
    }
    tick();
  }
  function stopPartyBeat() {
    partyLoopRunning = false;
    if (partyLoopTimer) { clearTimeout(partyLoopTimer); partyLoopTimer = null; }
  }

  // Haptic feedback — works on Android always, iPhone Safari 18.4+
  let hapticsEnabled = true;
  function setHapticsEnabled(v) { hapticsEnabled = !!v; }
  function isHapticsEnabled() { return hapticsEnabled; }
  const haptic = {
    light:   () => { try { if (hapticsEnabled && navigator.vibrate) navigator.vibrate(8); } catch (e) {} },
    medium:  () => { try { if (hapticsEnabled && navigator.vibrate) navigator.vibrate(14); } catch (e) {} },
    heavy:   () => { try { if (hapticsEnabled && navigator.vibrate) navigator.vibrate(28); } catch (e) {} },
    hit:     () => { try { if (hapticsEnabled && navigator.vibrate) navigator.vibrate([5, 10, 5]); } catch (e) {} },
    explode: () => { try { if (hapticsEnabled && navigator.vibrate) navigator.vibrate([30, 20, 30]); } catch (e) {} },
    death:   () => { try { if (hapticsEnabled && navigator.vibrate) navigator.vibrate([80, 40, 80, 40, 120]); } catch (e) {} },
  };

  return {
    unlock, playMusic, stopMusic, fadeOutMusic, pauseAll, resume,
    setMusicEnabled, setSfxEnabled, setMusicVolume, getMusicVolume,
    setMusicVol: setMusicVolume, // alias for FAMEUP settings
    setSfxVol: (v) => { try { if (sfxBus && sfxBus.gain) sfxBus.gain.value = v; } catch (e) {} },
    isMusicEnabled, isSfxEnabled,
    setHapticsEnabled, isHapticsEnabled,
    sfx, haptic,
    startPartyBeat, stopPartyBeat,
    get isUnlocked() { return unlocked; }
  };
})();
