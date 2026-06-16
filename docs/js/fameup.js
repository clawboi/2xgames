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
      // Migrate old shape
      if (!s.stats) s.stats = makeDefaultProfile().stats;
      return s;
    } catch (e) { return makeDefaultProfile(); }
  }
  function makeDefaultProfile() {
    return {
      signedIn: false,
      username: null,
      stats: {
        // Standoff stats
        standoffMatches: 0,
        standoffWins: 0,
        standoffKills: 0,
        standoffDeaths: 0,
        // Crabcage uses its own save, but we mirror highlights
      },
    };
  }
  function saveProfile(p) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) {}
  }
  let profile = loadProfile();

  // Update profile stats — called from games via FAMEUP.recordStat
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
        showOnly('start-screen');
        // Refresh high score display
        if (typeof window._refreshHighScoreUI === 'function') {
          try { window._refreshHighScoreUI(); } catch (e) {}
        }
      });
    }

    // STANDOFF tile → standoff lobby
    document.querySelectorAll('.fu-tile').forEach(tile => {
      tile.addEventListener('click', () => {
        if (tile.classList.contains('fu-tile-locked')) return;
        const game = tile.getAttribute('data-game');
        if (game === 'standoff') {
          showOnly('standoff-lobby');
          if (window.Standoff && Standoff.openLobby) Standoff.openLobby();
        }
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
    const existing = document.getElementById('signin-existing');
    const existingBtn = document.getElementById('signin-existing-btn');
    if (profile.signedIn && profile.username) {
      existing.classList.remove('hidden');
      existingBtn.textContent = 'CONTINUE AS ' + profile.username.toUpperCase();
    } else {
      existing.classList.add('hidden');
    }
  }
  function closeSignin() {
    const overlay = document.getElementById('signin-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  function initSignin() {
    const go = document.getElementById('signin-go');
    const guest = document.getElementById('signin-guest');
    const input = document.getElementById('signin-username');
    const existingBtn = document.getElementById('signin-existing-btn');
    const clearBtn = document.getElementById('signin-clear-btn');

    if (go) go.addEventListener('click', () => {
      const name = (input.value || '').trim();
      if (name.length < 2) { input.placeholder = 'MIN 2 CHARS'; return; }
      profile = { signedIn: true, username: name };
      saveProfile(profile);
      refreshProfileBtn();
      closeSignin();
    });
    if (guest) guest.addEventListener('click', () => {
      profile = { signedIn: false, username: null };
      saveProfile(profile);
      refreshProfileBtn();
      closeSignin();
    });
    if (existingBtn) existingBtn.addEventListener('click', closeSignin);
    if (clearBtn) clearBtn.addEventListener('click', () => {
      profile = { signedIn: false, username: null };
      saveProfile(profile);
      refreshProfileBtn();
      closeSignin();
    });
    // Close on backdrop click
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
