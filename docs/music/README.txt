CRABCAGE VIDEO GAME 2X — MUSIC SETUP
====================================

The game looks for THREE audio files inside this `music/` folder.
Drop your MP3s in here with these EXACT filenames:

  1. menu.mp3       → plays on the start/customization screen
  2. gameplay.mp3   → plays during normal waves (wave 1-4, 6-9, 11-14)
  3. boss.mp3       → plays during boss fights (wave 5, 10, 15)

Formats: MP3 works everywhere (iPhone, Android, desktop browsers).
You can also use .m4a or .ogg, but you'll need to rename them to .mp3
OR edit `index.html` to point at the right extension:

    <audio id="music-menu"     src="music/menu.mp3"  ...>
    <audio id="music-gameplay" src="music/gameplay.mp3" ...>
    <audio id="music-boss"     src="music/boss.mp3"  ...>

NOTES:
- Keep files under ~5MB each so the game loads fast on phones.
- Loop-friendly tracks sound best (avoid songs with hard endings).
- Music won't play on iPhone until the user taps START (Apple's
  autoplay rule). This is normal and unavoidable.
- If you don't add music files, the game still works — you'll just
  have sound effects and no soundtrack.

SUGGESTED VIBES:
- menu.mp3      → ambient trap beat, slow & moody
- gameplay.mp3  → hyped drill / phonk, fast tempo
- boss.mp3      → heavy, distorted, aggressive

To make your own loops you can chop with Audacity (free).
