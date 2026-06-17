// FAMEUP.io shell — homepage, profile, navigation between games
// Sits ABOVE the individual game modules (crabcage, standoff)

(function () {
  'use strict';

  // ============ PROFILE STATE ============
  const PROFILE_KEY = 'fameup_profile_v1';
  function loadProfile() {
    try {
      const s = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
      if (!s) return makeDefaultProfile();
      if (!s.stats) s.stats = makeDefaultProfile().stats;
      if (!s.inventory) s.inventory = makeDefaultProfile().inventory;
      return s;
    } catch (e) { return makeDefaultProfile(); }
  }
  function makeDefaultProfile() {
    return {
      signedIn: false,
      username: null,
      email: null,
      authMethod: null, // 'guest' | 'email' | 'magic' | 'supabase'
      stats: {
        standoffMatches: 0,
        standoffWins: 0,
        standoffKills: 0,
        standoffDeaths: 0,
        crabcageWavesCleared: 0,
        crabcageBossesBeaten: 0,
      },
      inventory: {
        emotes: ['default_wave'], // starting emote
        collectibles: [], // earned per-match
        weaponSkins: {}, // weaponKey -> skinId
      },
    };
  }
  function saveProfile(p) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) {}
    // Future: also push to Supabase
    if (window.SUPABASE_CLIENT && p.signedIn && p.email) {
      try { window.SUPABASE_CLIENT.from('profiles').upsert({ email: p.email, data: p }); } catch (e) {}
    }
  }
  let profile = loadProfile();

  // ============ SUPABASE STUB ============
  // To enable real auth: include @supabase/supabase-js CDN script in HTML,
  // then call window.FAMEUP_INIT_SUPABASE(url, anonKey) before this script loads.
  // For now, all auth is localStorage-based but follows Supabase's shape.
  async function signInWithEmail(email, password) {
    // Future: const { data, error } = await SUPABASE_CLIENT.auth.signInWithPassword({ email, password });
    if (!email || email.length < 4) return { ok: false, msg: 'email required' };
    if (!password || password.length < 6) return { ok: false, msg: 'password min 6 chars' };
    profile = { ...profile, signedIn: true, email, username: email.split('@')[0].slice(0, 14), authMethod: 'email' };
    saveProfile(profile);
    return { ok: true };
  }
  async function signInWithMagicLink(email) {
    // Future: SUPABASE_CLIENT.auth.signInWithOtp({ email })
    if (!email || email.length < 4) return { ok: false, msg: 'email required' };
    profile = { ...profile, signedIn: true, email, username: email.split('@')[0].slice(0, 14), authMethod: 'magic' };
    saveProfile(profile);
    return { ok: true, msg: 'magic link sent (stub — signed in locally for now)' };
  }
  async function signOut() {
    // Future: SUPABASE_CLIENT.auth.signOut();
    profile = makeDefaultProfile();
    saveProfile(profile);
  }

  function recordStat(statKey, delta) {
    if (!profile.stats) profile.stats = {};
    profile.stats[statKey] = (profile.stats[statKey] || 0) + (delta || 1);
    saveProfile(profile);
    refreshProfileBtn();
    refreshStatsDisplay();
    refreshDaily();
  }

  // ============ DAILY MISSION ============
  const DAILY_KEY = 'fameup_daily_v1';
  const MISSIONS = [
    { id: 'kills10',   task: 'Get 10 Standoff kills',     target: 10, stat: 'standoffKills',     reward: 50 },
    { id: 'matches3',  task: 'Play 3 Standoff matches',   target: 3,  stat: 'standoffMatches',   reward: 30 },
    { id: 'win1',      task: 'Win a Standoff match',     target: 1,  stat: 'standoffWins',      reward: 75 },
    { id: 'kills25',   task: 'Get 25 kills today',       target: 25, stat: 'standoffKills',     reward: 100 },
    { id: 'crabwave',  task: 'Clear 3 Crabcage waves',   target: 3,  stat: '_crabWaves',        reward: 60 },
  ];
  function loadDaily() {
    try {
      const d = JSON.parse(localStorage.getItem(DAILY_KEY) || 'null');
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      if (!d || d.date !== today) {
        // New day — pick a fresh mission based on date hash for stability across reloads
        const idx = (today.split('-').reduce((a, b) => a + parseInt(b), 0)) % MISSIONS.length;
        return { date: today, missionIdx: idx, startVal: profile.stats?.[MISSIONS[idx].stat] || 0, claimed: false };
      }
      return d;
    } catch (e) {
      return { date: new Date().toISOString().slice(0, 10), missionIdx: 0, startVal: 0, claimed: false };
    }
  }
  function saveDaily(d) { try { localStorage.setItem(DAILY_KEY, JSON.stringify(d)); } catch (e) {} }
  let daily = loadDaily();
  saveDaily(daily);

  function refreshDaily() {
    daily = loadDaily(); // re-check date in case it changed across midnight
    const m = MISSIONS[daily.missionIdx];
    const cur = (profile.stats?.[m.stat] || 0) - daily.startVal;
    const pct = Math.min(1, cur / m.target);
    const done = cur >= m.target;
    const tile = document.getElementById('fu-daily');
    const task = document.getElementById('fu-daily-task');
    const fill = document.getElementById('fu-daily-bar-fill');
    const text = document.getElementById('fu-daily-bar-text');
    if (task) task.textContent = m.task + ' (+' + m.reward + ' XP)';
    if (fill) fill.style.width = (pct * 100) + '%';
    if (text) text.textContent = done ? '✓ COMPLETE!' : `${Math.min(cur, m.target)} / ${m.target}`;
    if (tile) tile.classList.toggle('complete', done);
    // Auto-claim reward once (XP just adds to next level)
    if (done && !daily.claimed) {
      daily.claimed = true;
      saveDaily(daily);
      // Bonus XP via fake stat that calcXP reads (use existing crabwave-style stat)
      profile.stats._dailyXP = (profile.stats._dailyXP || 0) + m.reward;
      saveProfile(profile);
      refreshStatsDisplay();
    }
  }

  // ============ XP / LEVEL SYSTEM ============
  // XP earned from existing stats — no separate persistence needed
  function calcXP() {
    const s = profile.stats || {};
    let cs = {};
    try { cs = JSON.parse(localStorage.getItem('crabcage_save_v3') || '{}'); } catch (e) {}
    return (
      (s.standoffKills || 0) * 5 +
      (s.standoffWins || 0) * 50 +
      (s.standoffMatches || 0) * 10 +
      (cs.totalKills || 0) * 1 +
      ((cs.bossesBeaten || []).length || 0) * 100 +
      Math.floor((cs.highScore || 0) / 10) +
      (s._dailyXP || 0)
    );
  }
  function xpForLevel(lvl) {
    // L1=0, L2=100, L3=250, L4=450, L5=700, then +300 per level
    if (lvl <= 1) return 0;
    if (lvl === 2) return 100;
    if (lvl === 3) return 250;
    if (lvl === 4) return 450;
    if (lvl === 5) return 700;
    return 700 + (lvl - 5) * 300;
  }
  function getLevelInfo() {
    const xp = calcXP();
    let lvl = 1;
    while (xpForLevel(lvl + 1) <= xp) lvl++;
    const curStart = xpForLevel(lvl);
    const nextStart = xpForLevel(lvl + 1);
    const progress = (xp - curStart) / Math.max(1, nextStart - curStart);
    return { xp, lvl, curStart, nextStart, progress: Math.min(1, Math.max(0, progress)) };
  }

  // ============ NAVIGATION ============
  // Hide all screens, show the named one
  const SCREEN_TO_HASH = {
    'fameup-home': '',
    'start-screen': 'crabcage',
    'standoff-lobby': 'standoff',
    'hq-lobby': 'hq',
    'vault-screen': 'vault',
    'customize-screen': 'customize',
  };

  const SCREEN_MUSIC = {
    'fameup-home': 'fameup',
    'standoff-lobby': 'fameup',
    'standoff-game': 'fameup',
    'hq-lobby': 'fameup',
    'hq-room': 'fameup',
    'vault-screen': 'fameup',
    'customize-screen': 'fameup',
    // Crabcage screens manage their own music (start-screen → menu, game-screen → gameplay/boss)
  };

  function showOnly(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
    if (id in SCREEN_TO_HASH) {
      const newHash = SCREEN_TO_HASH[id];
      const target = newHash ? '#' + newHash : window.location.pathname;
      try { history.replaceState(null, '', target); } catch (e) {}
    }
    // Music per screen — switch when entering, leave Crabcage screens to handle own music
    try {
      if (id in SCREEN_MUSIC) {
        const track = SCREEN_MUSIC[id];
        if (window.Audio && Audio.playMusic && Audio.isUnlocked) Audio.playMusic(track);
      }
    } catch (e) {}
  }

  // Update profile button text based on state
  function refreshProfileBtn() {
    const btn = document.getElementById('fu-profile-btn');
    const label = document.getElementById('fu-profile-label');
    const cv = document.getElementById('fu-profile-mini');
    if (label) {
      label.textContent = profile.signedIn && profile.username
        ? profile.username.toUpperCase().slice(0, 12)
        : 'GUEST';
    }
    if (cv && window.Sprites) {
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, cv.width, cv.height);
      try {
        const save = JSON.parse(localStorage.getItem('crabcage_save_v3') || '{}');
        const cust = save.customization || { fit: '#cc0022', accent: '#00ff66', hat: 'durag', chain: 'gold', shades: true, pattern: 'solid', shirtless: false, tattoos: false, skinTone: 'brown', body: 'male' };
        ctx.save();
        ctx.translate(cv.width / 2, cv.height / 2 + 6);
        ctx.scale(0.4, 0.4);
        Sprites.drawPlayer(ctx, 0, 0, cust, 'down', 0);
        ctx.restore();
      } catch (e) {}
    }
  }

  // Update EP links in featured banner
  function updateFeaturedLinks() {
    const sp = document.getElementById('fu-spotify-link');
    const ap = document.getElementById('fu-apple-link');
    if (sp) sp.href = 'https://open.spotify.com/artist/6trq6Q1kWCCe5kFu4i2pvX';
    if (ap) ap.href = 'https://music.apple.com/us/artist/2x/1804114831';
  }

  // ============ HOMEPAGE WIRING ============
  function initHomepage() {
    updateFeaturedLinks();
    refreshProfileBtn();

    // PLAY CRABCAGE — goes to existing start-screen
    const playCrab = document.getElementById('fu-play-crabcage');
    if (playCrab) {
      playCrab.addEventListener('click', () => {
        try { Audio.unlock(); } catch (e) {}
        showOnly('start-screen');
        if (typeof window._refreshHighScoreUI === 'function') {
          try { window._refreshHighScoreUI(); } catch (e) {}
        }
      });
    }

    // Also: any tap on the featured banner goes to crabcage
    const banner = document.getElementById('fu-featured-banner');
    if (banner) {
      banner.addEventListener('click', (e) => {
        // Ignore clicks on links inside the banner
        if (e.target.tagName === 'A') return;
        try { Audio.unlock(); } catch (er) {}
        showOnly('start-screen');
        if (typeof window._refreshHighScoreUI === 'function') {
          try { window._refreshHighScoreUI(); } catch (er) {}
        }
      });
    }

    // Tap anywhere on home unlocks audio (so fameup theme plays)
    const home = document.getElementById('fameup-home');
    if (home) {
      home.addEventListener('click', () => {
        try {
          Audio.unlock();
          if (Audio.isUnlocked) Audio.playMusic('fameup');
        } catch (e) {}
      }, { once: true });
    }

    // STANDOFF tile / MY VAULT / HQ / CUSTOMIZE tiles
    document.querySelectorAll('.fu-tile').forEach(tile => {
      tile.addEventListener('click', () => {
        if (tile.classList.contains('fu-tile-locked')) return;
        const game = tile.getAttribute('data-game');
        try { Audio.unlock(); } catch (e) {}
        if (game === 'standoff') {
          showOnly('standoff-lobby');
          if (window.Standoff && Standoff.openLobby) Standoff.openLobby();
        } else if (game === 'inventory') {
          showOnly('vault-screen');
          renderInventory();
        } else if (game === 'hq') {
          if (window.HQ && HQ.openLobbyBrowser) HQ.openLobbyBrowser();
        } else if (game === 'customize') {
          showOnly('customize-screen');
          if (window.FAMEUP_CUSTOMIZE) FAMEUP_CUSTOMIZE.open();
        }
      });
    });

    // Inventory back button
    const invBack = document.getElementById('inv-back-btn');
    if (invBack) invBack.addEventListener('click', () => showOnly('fameup-home'));

    // Customize back
    const custBack = document.getElementById('cust-back');
    if (custBack) custBack.addEventListener('click', () => showOnly('fameup-home'));

    // Inventory edit char button — opens customize page
    const invEdit = document.getElementById('inv-edit-char-btn');
    if (invEdit) invEdit.addEventListener('click', () => {
      showOnly('customize-screen');
      if (window.FAMEUP_CUSTOMIZE) FAMEUP_CUSTOMIZE.open();
    });

    // Customize deep edit → goes to crabcage menu (full customizer)
    const custDeep = document.getElementById('cust-deep-edit');
    if (custDeep) custDeep.addEventListener('click', () => {
      try { Audio.unlock(); } catch (e) {}
      showOnly('start-screen');
    });

    // SHARE buttons: copy deep link to clipboard
    document.querySelectorAll('.fu-share-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const game = btn.getAttribute('data-share');
        const base = window.location.origin + window.location.pathname;
        const url = base + '#' + game;
        try {
          await navigator.clipboard.writeText(url);
          btn.classList.add('copied');
          const orig = btn.textContent;
          btn.textContent = '✓ LINK COPIED';
          setTimeout(() => {
            btn.classList.remove('copied');
            btn.textContent = orig;
          }, 1800);
        } catch (e) {
          // Fallback: show prompt
          prompt('Copy this link:', url);
        }
      });
    });

    // Inventory tabs
    document.querySelectorAll('.inv-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.inv-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const t = tab.getAttribute('data-inv-tab');
        document.querySelectorAll('.inv-pane').forEach(p => p.classList.add('hidden'));
        const pane = document.getElementById('inv-pane-' + t);
        if (pane) pane.classList.remove('hidden');
      });
    });

    // PROFILE button → signin modal
    const profileBtn = document.getElementById('fu-profile-btn');
    if (profileBtn) profileBtn.addEventListener('click', () => openSignin());

    // CRABCAGE → home back button
    const crabHome = document.getElementById('crabcage-home-btn');
    if (crabHome) crabHome.addEventListener('click', () => {
      // Force-stop crabcage music before going home
      try { if (window.Audio && Audio.stopMusic) Audio.stopMusic(); } catch (e) {}
      showOnly('fameup-home');
    });

    // STANDOFF → home back button
    const stdBack = document.getElementById('std-back-btn');
    if (stdBack) stdBack.addEventListener('click', () => showOnly('fameup-home'));
  }

  // ============ SIGN-IN MODAL ============
  function openSignin() {
    const overlay = document.getElementById('signin-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    const status = document.getElementById('signin-status');
    const clearBtn = document.getElementById('signin-clear-btn');
    if (profile.signedIn && profile.email) {
      if (status) {
        status.classList.remove('hidden');
        status.textContent = 'SIGNED IN AS ' + profile.email.toUpperCase();
        status.style.color = '#00ff66';
      }
      if (clearBtn) clearBtn.classList.remove('hidden');
    } else {
      if (status) status.classList.add('hidden');
      if (clearBtn) clearBtn.classList.add('hidden');
    }
  }
  function closeSignin() {
    const overlay = document.getElementById('signin-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  function initSignin() {
    const go = document.getElementById('signin-go');
    const magic = document.getElementById('signin-magic');
    const guest = document.getElementById('signin-guest');
    const email = document.getElementById('signin-email');
    const password = document.getElementById('signin-password');
    const status = document.getElementById('signin-status');
    const clearBtn = document.getElementById('signin-clear-btn');

    if (go) go.addEventListener('click', async () => {
      const result = await signInWithEmail(email.value, password.value);
      if (status) {
        status.classList.remove('hidden');
        status.textContent = result.ok ? 'SIGNED IN ✓' : result.msg.toUpperCase();
        status.style.color = result.ok ? '#00ff66' : '#ff6677';
      }
      if (result.ok) {
        refreshProfileBtn();
        refreshStatsDisplay();
        setTimeout(closeSignin, 700);
      }
    });
    if (magic) magic.addEventListener('click', async () => {
      const result = await signInWithMagicLink(email.value);
      if (status) {
        status.classList.remove('hidden');
        status.textContent = result.ok ? '✨ ' + (result.msg || '').toUpperCase() : result.msg.toUpperCase();
        status.style.color = result.ok ? '#ffcc00' : '#ff6677';
      }
      if (result.ok) {
        refreshProfileBtn();
        refreshStatsDisplay();
        setTimeout(closeSignin, 1200);
      }
    });
    if (guest) guest.addEventListener('click', () => {
      profile = { ...profile, signedIn: false, authMethod: 'guest' };
      saveProfile(profile);
      refreshProfileBtn();
      closeSignin();
    });
    if (clearBtn) clearBtn.addEventListener('click', async () => {
      await signOut();
      refreshProfileBtn();
      refreshStatsDisplay();
      closeSignin();
    });
    const overlay = document.getElementById('signin-overlay');
    if (overlay) overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSignin();
    });
  }

  // ============ PUBLIC API ============
  window.FAMEUP = {
    showOnly,
    getProfile: () => ({ ...profile }),
    goHome: () => showOnly('fameup-home'),
    recordStat,
    refreshStatsDisplay,
  };

  function renderInventory() {
    // Profile header
    const nameEl = document.getElementById('inv-profile-name');
    const statsEl = document.getElementById('inv-profile-stats');
    if (nameEl) nameEl.textContent = profile.signedIn ? (profile.email || profile.username || 'PLAYER').toUpperCase() : 'GUEST';
    const s = profile.stats || {};
    if (statsEl) {
      const parts = [];
      if (s.standoffMatches) parts.push(`${s.standoffMatches} match${s.standoffMatches === 1 ? '' : 'es'}`);
      if (s.standoffKills) parts.push(`${s.standoffKills} kills`);
      if (s.standoffWins) parts.push(`${s.standoffWins} wins`);
      statsEl.textContent = parts.length ? parts.join(' · ') : 'no matches played yet';
    }
    // Character preview using crabcage's customization
    const cv = document.getElementById('inv-char-preview');
    if (cv && window.Sprites) {
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
      try {
        const save = JSON.parse(localStorage.getItem('crabcage_save_v3') || '{}');
        const cust = save.customization || { fit: '#cc0022', accent: '#00ff66', hat: 'durag', chain: 'gold', shades: true, pattern: 'solid', shirtless: false, tattoos: false, skinTone: 'brown', body: 'male' };
        Sprites.drawPlayer(ctx, cv.width / 2, cv.height / 2 + 18, cust, 'down', 0);
      } catch (e) {}
    }
    // Weapons pane — pull from crabcage unlocks
    const wp = document.getElementById('inv-pane-weapons');
    if (wp) {
      let save = {};
      try { save = JSON.parse(localStorage.getItem('crabcage_save_v3') || '{}'); } catch (e) {}
      const unlocks = save.unlocks || {};
      const allWeapons = [
        { id: 'draco', name: 'DRACO', tier: 'grey', icon: '🔫', owned: true },
        { id: 'glock', name: 'GLOCK', tier: 'grey', icon: '🔫', owned: true },
        { id: 'fists', name: 'FISTS', tier: 'grey', icon: '👊', owned: true },
        { id: 'rpg', name: 'RPG', tier: 'grey', icon: '🚀', owned: true },
        { id: 'shotgun', name: 'SAWED-OFF', tier: 'green', icon: '🔫', owned: !!unlocks.shotgun },
        { id: 'stungun', name: 'STUN GUN', tier: 'green', icon: '⚡', owned: !!unlocks.stungun },
        { id: 'goldDraco', name: 'GOLD DRACO', tier: 'gold', icon: '✨', owned: !!unlocks.goldDraco },
        { id: 'goldRpg', name: 'GOLD RPG', tier: 'gold', icon: '🌟', owned: !!unlocks.goldRpg },
        { id: 'plasma', name: 'PLASMA', tier: 'gold', icon: '💜', owned: !!unlocks.plasma },
        { id: 'honeyUzi', name: 'HONEY UZI', tier: 'gold', icon: '🍯', owned: !!unlocks.honeyUzi },
        { id: 'tesla', name: 'TESLA', tier: 'red', icon: '⚡', owned: !!unlocks.tesla },
        { id: 'flamer', name: 'FLAMER', tier: 'red', icon: '🔥', owned: !!unlocks.flamer },
        { id: 'freeze', name: 'FREEZE', tier: 'red', icon: '❄', owned: !!unlocks.freeze },
      ];
      const ownedCount = allWeapons.filter(w => w.owned).length;
      wp.innerHTML = `<div style="font-family:'Press Start 2P',monospace;font-size:9px;color:#aaa;letter-spacing:1px;margin-bottom:10px;">UNLOCKED ${ownedCount}/${allWeapons.length}</div>` +
        '<div class="inv-grid">' +
        allWeapons.map(w => `<div class="inv-item ${w.owned ? 'owned' : 'locked'} tier-${w.tier}">
          <div class="inv-item-icon">${w.owned ? w.icon : '🔒'}</div>
          <div class="inv-item-name">${w.name}</div>
          <div class="inv-item-sub">${w.tier.toUpperCase()}</div>
        </div>`).join('') + '</div>';
    }
    // Collectibles pane — empty for now
    const cp = document.getElementById('inv-pane-collectibles');
    if (cp) {
      const items = (profile.inventory && profile.inventory.collectibles) || [];
      if (items.length === 0) {
        cp.innerHTML = '<div class="inv-empty">NO COLLECTIBLES YET<br><br>WIN MATCHES + BEAT BOSSES TO EARN<br>RARE PIXEL DROPS</div>';
      } else {
        cp.innerHTML = '<div class="inv-grid">' + items.map(c =>
          `<div class="inv-item owned"><div class="inv-item-icon">🏆</div><div class="inv-item-name">${c.name}</div><div class="inv-item-sub">${c.rarity || 'COMMON'}</div></div>`
        ).join('') + '</div>';
      }
    }
    // Emotes pane
    const ep = document.getElementById('inv-pane-emotes');
    if (ep) {
      const emotes = [
        { id: 'default_wave', name: 'WAVE', icon: '👋', owned: true },
        { id: 'dance', name: 'DANCE', icon: '🕺', owned: false },
        { id: 'flex', name: 'FLEX', icon: '💪', owned: false },
        { id: 'point', name: 'POINT', icon: '👉', owned: false },
        { id: 'crown', name: 'CROWN', icon: '👑', owned: false },
        { id: 'rage', name: 'RAGE', icon: '😡', owned: false },
      ];
      ep.innerHTML = '<div class="inv-grid">' + emotes.map(e =>
        `<div class="inv-item ${e.owned ? 'owned' : 'locked'}"><div class="inv-item-icon">${e.owned ? e.icon : '🔒'}</div><div class="inv-item-name">${e.name}</div><div class="inv-item-sub">${e.owned ? 'OWNED' : 'EARN'}</div></div>`
      ).join('') + '</div>';
    }
    // Stats pane
    const sp = document.getElementById('inv-pane-stats');
    if (sp) {
      let cs = {};
      try { cs = JSON.parse(localStorage.getItem('crabcage_save_v3') || '{}'); } catch (e) {}
      const rows = [
        ['STANDOFF MATCHES', s.standoffMatches || 0],
        ['STANDOFF WINS', s.standoffWins || 0],
        ['STANDOFF KILLS', s.standoffKills || 0],
        ['CRABCAGE HIGH SCORE', cs.highScore || 0],
        ['CRABCAGE BANK', '$' + (cs.cashBank || 0)],
        ['CRABCAGE TOTAL KILLS', cs.totalKills || 0],
        ['BOSSES DEFEATED', (cs.bossesBeaten || []).length],
      ];
      sp.innerHTML = rows.map(r =>
        `<div class="inv-stat-row"><span class="inv-stat-label">${r[0]}</span><span class="inv-stat-value">${r[1]}</span></div>`
      ).join('');
    }
  }

  function refreshStatsDisplay() {
    const el = document.getElementById('fu-stats-line');
    if (el) {
      const s = profile.stats || {};
      const matches = s.standoffMatches || 0;
      const wins = s.standoffWins || 0;
      const kills = s.standoffKills || 0;
      const winRate = matches > 0 ? Math.round((wins / matches) * 100) : 0;
      el.innerHTML = matches > 0
        ? `<span class="stat-pill">⚔ ${matches} MATCHES</span><span class="stat-pill">🏆 ${wins} WINS (${winRate}%)</span><span class="stat-pill">💀 ${kills} KILLS</span>`
        : '<span class="stat-pill stat-empty">PLAY A MATCH TO START TRACKING</span>';
    }
    // Refresh level bar
    const lvlNum = document.getElementById('fu-level-num');
    const lvlFill = document.getElementById('fu-level-fill');
    const lvlText = document.getElementById('fu-level-text');
    if (lvlNum && lvlFill && lvlText) {
      const info = getLevelInfo();
      lvlNum.textContent = info.lvl;
      lvlFill.style.width = (info.progress * 100) + '%';
      lvlText.textContent = `${info.xp - info.curStart} / ${info.nextStart - info.curStart} XP`;
    }
  }

  function initSettings() {
    const SET_KEY = 'fameup_settings_v1';
    function loadS() {
      try { return JSON.parse(localStorage.getItem(SET_KEY) || 'null') || { music: 65, sfx: 100, haptics: true, clicks: true }; }
      catch (e) { return { music: 65, sfx: 100, haptics: true, clicks: true }; }
    }
    function saveS(s) { try { localStorage.setItem(SET_KEY, JSON.stringify(s)); } catch (e) {} }
    let s = loadS();
    const mv = document.getElementById('set-music-vol');
    const sv = document.getElementById('set-sfx-vol');
    const ht = document.getElementById('set-haptics');
    const cl = document.getElementById('set-clicks');
    const close = document.getElementById('settings-close');
    const overlay = document.getElementById('settings-overlay');
    const open = document.getElementById('fu-settings-btn');
    if (mv) {
      mv.value = s.music;
      mv.addEventListener('input', e => { s.music = parseInt(e.target.value); saveS(s); applySettings(s); });
    }
    if (sv) {
      sv.value = s.sfx;
      sv.addEventListener('input', e => { s.sfx = parseInt(e.target.value); saveS(s); applySettings(s); });
    }
    if (ht) {
      ht.classList.toggle('on', s.haptics);
      ht.textContent = s.haptics ? 'ON' : 'OFF';
      ht.addEventListener('click', () => {
        s.haptics = !s.haptics;
        ht.classList.toggle('on', s.haptics);
        ht.textContent = s.haptics ? 'ON' : 'OFF';
        saveS(s); applySettings(s);
      });
    }
    if (cl) {
      cl.classList.toggle('on', s.clicks);
      cl.textContent = s.clicks ? 'ON' : 'OFF';
      cl.addEventListener('click', () => {
        s.clicks = !s.clicks;
        cl.classList.toggle('on', s.clicks);
        cl.textContent = s.clicks ? 'ON' : 'OFF';
        saveS(s); applySettings(s);
        if (s.clicks) playClickSound();
      });
    }
    if (open) open.addEventListener('click', () => {
      overlay.classList.remove('hidden');
      playClickSound();
    });
    if (close) close.addEventListener('click', () => {
      overlay.classList.add('hidden');
      playClickSound();
    });
    if (overlay) overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
    applySettings(s);
    window.FAMEUP_SETTINGS = s;
  }
  function applySettings(s) {
    // Apply to Audio module
    try {
      if (window.Audio) {
        if (Audio.setMusicVol) Audio.setMusicVol(s.music / 100);
        if (Audio.setSfxVol) Audio.setSfxVol(s.sfx / 100);
      }
    } catch (e) {}
  }
  function playClickSound() {
    try {
      if (window.FAMEUP_SETTINGS && !window.FAMEUP_SETTINGS.clicks) return;
      if (window.Audio && Audio.sfx && Audio.sfx.uiClick) Audio.sfx.uiClick();
    } catch (e) {}
  }

  // ============ INIT ON LOAD ============
  document.addEventListener('DOMContentLoaded', () => {
    initHomepage();
    initSignin();
    initSettings();
    refreshStatsDisplay();
    refreshDaily();
    initBgCanvas();
    initSplash();

    // CRABCAGE-ONLY mode: skip FAMEUP UI, go straight to Crabcage menu
    if (window.CRABCAGE_ONLY) {
      // Hide FAMEUP home and the back-to-FAMEUP button on Crabcage menu
      try {
        const home = document.getElementById('fameup-home');
        if (home) home.remove();
        const back = document.getElementById('crabcage-home-btn');
        if (back) back.style.display = 'none';
        // Hide splash (Crabcage has its own start screen)
        const sp = document.getElementById('fu-splash');
        if (sp) sp.style.display = 'none';
      } catch (e) {}
      showOnly('start-screen');
    } else {
      handleDeepLink();
      window.addEventListener('hashchange', handleDeepLink);
    }
    // Global UI click sounds
    document.addEventListener('click', e => {
      const t = e.target.closest('.big-btn, .small-btn, .fu-tile, .fu-share-btn, .fu-back-btn, .fameup-home-btn, .inv-tab, .cust-preset-btn');
      if (t) playClickSound();
    });
  });

  function handleDeepLink() {
    const hash = (window.location.hash || '').replace('#', '').toLowerCase();
    const map = {
      'crabcage': 'start-screen',
      'standoff': 'standoff-lobby',
      'hq': 'hq-lobby',
      'vault': 'vault-screen',
      'customize': 'customize-screen',
      'home': 'fameup-home',
      '': 'fameup-home',
    };
    const target = map[hash] || 'fameup-home';
    showOnly(target);
    // Trigger sub-init for sections that need rendering
    if (target === 'vault-screen') renderInventory();
    else if (target === 'standoff-lobby' && window.Standoff && Standoff.openLobby) Standoff.openLobby();
    else if (target === 'hq-lobby' && window.HQ && HQ.openLobbyBrowser) HQ.openLobbyBrowser();
    else if (target === 'customize-screen' && window.FAMEUP_CUSTOMIZE) FAMEUP_CUSTOMIZE.open();
  }
  function initSplash() {
    const sp = document.getElementById('fu-splash');
    if (!sp) return;
    // Tap to skip
    sp.style.pointerEvents = 'auto';
    sp.addEventListener('click', () => sp.classList.add('skip'), { once: true });
    sp.addEventListener('touchstart', () => sp.classList.add('skip'), { once: true });
    // Auto-remove from DOM after animation
    setTimeout(() => { try { sp.remove(); } catch (e) {} }, 2700);
  }

  function initBgCanvas() {
    const cv = document.getElementById('fu-bg-canvas');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    let particles = [];
    function resize() {
      cv.width = cv.offsetWidth;
      cv.height = cv.offsetHeight;
    }
    function spawnInitial() {
      particles = [];
      const count = Math.min(80, Math.floor((cv.width * cv.height) / 12000));
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * cv.width,
          y: Math.random() * cv.height,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -0.2 - Math.random() * 0.7,
          size: 1 + Math.random() * 2,
          life: 1,
          color: Math.random() < 0.3 ? '#ffcc00' : '#ff0033',
          alpha: 0.3 + Math.random() * 0.5,
        });
      }
    }
    resize();
    spawnInitial();
    window.addEventListener('resize', () => { resize(); spawnInitial(); });
    let raf = 0;
    function tick() {
      // Only animate if home is visible
      const home = document.getElementById('fameup-home');
      if (!home || home.classList.contains('hidden')) {
        raf = requestAnimationFrame(tick);
        return;
      }
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        // Wrap
        if (p.y < -5) { p.y = cv.height + 5; p.x = Math.random() * cv.width; }
        if (p.x < -5) p.x = cv.width + 5;
        if (p.x > cv.width + 5) p.x = -5;
        // Twinkle
        const tw = 0.7 + Math.sin(performance.now() / 400 + p.x) * 0.3;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha * tw;
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
  }
})();
