# CRABCAGE VIDEO GAME 2X

> Protect the black Escalade from endless swarms of crab-fans and paparazzi as **2X**, the rapper. Survive boss battles against **Giant Crab**, **2Slimey**, and finally — **yourself**.

A pure-HTML/JS/CSS browser game built to deploy on **GitHub Pages** and install to your **iPhone home screen** as a fullscreen PWA. No build step, no dependencies, no frameworks.

---

## ✨ FEATURES

- **Character customization** — fit color, accent color, headwear (durag / cap / hood / none), chains (gold / ice / none)
- **5 weapons** — Draco, Glock, Boxing Gloves (melee), RPG (splash), and the unlockable **Crab Laser** (piercing)
- **5 power-ups** — Health, Speed boost, Damage boost, Shield, Ammo refill
- **Endless wave system** with difficulty scaling
- **3 boss battles** with unique movesets:
  - Wave 5 — **Giant Crab** (spread-shot spitter)
  - Wave 10 — **2Slimey** (rapid dash, triple-shot)
  - Wave 15 — **Mirror 2X** (cycles through your weapons — fight yourself)
- **Web Audio API** procedural sound effects (no SFX files needed)
- **3 music slots** for your own tracks (drop MP3s in `/music/`)
- **iPhone-first design** — virtual joystick, fire button, dash button, auto-aim
- **PWA** — installs to home screen, runs offline after first load, fullscreen with no Safari chrome
- **iOS notch / safe-area aware** — works on iPhone X and later
- **Pause / resume / restart** with mute toggles for music & SFX

---

## 🎮 CONTROLS

### Desktop
| Action | Key |
|---|---|
| Move | `WASD` or arrow keys |
| Aim | Mouse |
| Shoot | Left-click |
| Switch weapon | `1` `2` `3` `4` `5` |
| Reload | `Space` or `R` |
| Dash (1.2s cooldown, invincible) | `Shift` |
| Pause | tap the `II` button top-right |

### iPhone / Touch
- **Left joystick** → move 2X
- **Right red button (FIRE)** → shoot — aim auto-locks to nearest enemy
- **DASH button** → roll dodge (briefly invincible)
- **Weapon icons (right edge)** → tap to swap weapon
- **II button (top-left on mobile)** → pause

---

## 🚀 DEPLOY TO GITHUB PAGES

1. Create a new GitHub repo (e.g. `crabcage-2x`).
2. Copy every file from this folder into the repo root (preserve folder structure — `js/`, `css/`, `icons/`, `music/`).
3. Push to GitHub.
4. On the repo page → **Settings** → **Pages** → set source to `Deploy from a branch`, branch `main`, folder `/ (root)`. Save.
5. Wait ~30 seconds. Your game is live at `https://YOUR-USERNAME.github.io/crabcage-2x/`.

That's it. No build step.

---

## 📱 INSTALL TO IPHONE HOME SCREEN

1. Open the GitHub Pages URL in **Safari** on your iPhone.
2. Tap the **Share** button (square with up-arrow).
3. Scroll down → **Add to Home Screen** → name it → Add.
4. Launch from your home screen. It opens fullscreen, no browser bar, looks like a real app.

> ⚠️ iPhone PWAs only install from Safari, not Chrome or Firefox. This is an Apple limitation.

After install it works offline (service worker caches everything except music — music will only play when online unless you also cache the MP3s; see the service-worker.js file).

---

## 🎵 MUSIC SETUP (THE 3 SONGS YOU ASKED ABOUT)

Drop three MP3 files into the `music/` folder with these exact names:

```
music/
├── menu.mp3       ← plays on the start screen (chill / hype intro)
├── gameplay.mp3   ← plays during normal waves (high-energy)
└── boss.mp3       ← plays during boss fights (heavy / aggressive)
```

The game references them in `index.html`:

```html
<audio id="music-menu"     src="music/menu.mp3"     loop preload="auto"></audio>
<audio id="music-gameplay" src="music/gameplay.mp3" loop preload="auto"></audio>
<audio id="music-boss"     src="music/boss.mp3"     loop preload="auto"></audio>
```

**Tips:**
- Keep files under ~5MB each for fast loading on phones.
- Loop-friendly tracks (no hard endings) sound best.
- iPhone won't autoplay until the user taps **START** — this is unavoidable (Apple policy).
- The game works fine without music files; you'll just have SFX.

If you want different filenames or formats (`.m4a`, `.ogg`), edit the `src` attributes in `index.html`.

---

## 📁 FILE STRUCTURE

```
crabcage-2x/
├── index.html              ← entry point (open this)
├── manifest.json           ← PWA manifest (iPhone install)
├── service-worker.js       ← offline caching
├── README.md               ← this file
├── css/
│   └── style.css           ← all styling + responsive layout
├── js/
│   ├── audio.js            ← music + procedural SFX
│   ├── sprites.js          ← pixel-art rendering (no image files!)
│   ├── input.js            ← keyboard + mouse + touch joystick
│   ├── entities.js         ← player, truck, enemies, bullets, power-ups, bosses
│   ├── weapons.js          ← weapon stats
│   ├── waves.js            ← wave config + boss schedule
│   └── game.js             ← main loop + state + UI
├── icons/
│   ├── icon-192.png        ← home screen icon (small)
│   └── icon-512.png        ← home screen icon (large)
└── music/                  ← drop YOUR 3 MP3s here
    └── README.txt
```

---

## 🛠 CUSTOMIZATION

Everything's plain JS — easy to tweak.

| Want to... | Edit |
|---|---|
| Add more weapons | `js/weapons.js` — add to the `defs` array |
| Tune enemy HP / damage / speed | `js/entities.js` — `Crab`, `Paparazzi`, boss classes |
| Change wave difficulty curve | `js/waves.js` — `getWaveConfig()` |
| Add new boss waves | `js/waves.js` + new class in `js/entities.js` |
| Redesign characters | `js/sprites.js` — every sprite is a string grid |
| Change colors / UI | `css/style.css` |
| Add a new power-up | `js/sprites.js` (drawPowerUp), `js/entities.js` (applyPowerUp), `js/entities.js` (random drop list) |

The sprite system in `sprites.js` is a tiny pixel-art DSL — each character is a 2D string array where letters map to a color palette. Easy to remix.

---

## 🐛 TROUBLESHOOTING

**Music doesn't play on iPhone**
→ Tap somewhere first (START button). iOS blocks autoplay until a user gesture. This is normal.

**Game runs slow on old iPhone**
→ Open `js/game.js` and lower `WORLD_W = 800; WORLD_H = 600;` to e.g. 600/450.

**Touch controls don't show on my laptop**
→ Intentional. They only appear on actual touch devices. Use mouse + keyboard.

**Joystick feels stuck**
→ Reload. Some browsers occasionally lose touch events; service worker reloads fix it.

**404 on GitHub Pages**
→ Make sure case matches: GitHub is case-sensitive. `JS/` ≠ `js/`.

**Mirror 2X looks weird**
→ He copies your customization on purpose. He IS you.

---

## 📜 LICENSE

Do whatever you want with it. Make it yours.

Built for **clawboi** • CRABCAGE 2X
