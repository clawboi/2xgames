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
  }

  // ============ NAVIGATION ============
  // Hide all screens, show the named one
  function showOnly(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
    // Auto music: play fameup theme on home, stop when leaving
    try {
      if (id === 'fameup-home') {
        if (window.Audio && Audio.playMusic && Audio.isUnlocked) Audio.playMusic('fameup');
      } else if (id !== 'standoff-game' && id !== 'standoff-lobby') {
        // crabcage handles its own music when entering its game screens
      }
    } catch (e) {}
  }

  // Update profile button text based on state
  function refreshProfileBtn() {
    const btn = document.getElementById('fu-profile-btn');
    if (!btn) return;
    btn.textContent = profile.signedIn && profile.username
      ? '👤 ' + profile.username.toUpperCase()
      : '👤 GUEST';
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
    if (!el) return;
    const s = profile.stats || {};
    const matches = s.standoffMatches || 0;
    const wins = s.standoffWins || 0;
    const kills = s.standoffKills || 0;
    const winRate = matches > 0 ? Math.round((wins / matches) * 100) : 0;
    el.innerHTML = matches > 0
      ? `<span class="stat-pill">⚔ ${matches} MATCHES</span><span class="stat-pill">🏆 ${wins} WINS (${winRate}%)</span><span class="stat-pill">💀 ${kills} KILLS</span>`
      : '<span class="stat-pill stat-empty">PLAY A MATCH TO START TRACKING</span>';
  }

  // ============ INIT ON LOAD ============
  document.addEventListener('DOMContentLoaded', () => {
    initHomepage();
    initSignin();
    refreshStatsDisplay();
    // Start on FAMEUP home (instead of straight into crabcage)
    showOnly('fameup-home');
  });
})();
