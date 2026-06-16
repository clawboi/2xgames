// waves.js — wave progression. Gradually scales crab HP, introduces new enemies.
// Boss difficulty mult: each new boss is ~30% tougher than the previous one.

const Waves = (() => {

  function getWaveConfig(waveNum) {
    if (waveNum === 5)  return { type: 'boss', boss: 'giantCrab', hpMult: 1.0, minions: 4,  spawnInterval: 900,  arena: 'underwater' };
    if (waveNum === 10) return { type: 'boss', boss: 'slimey',    hpMult: 1.3, minions: 8,  spawnInterval: 800,  arena: 'moshpit' };
    if (waveNum === 15) return { type: 'boss', boss: 'mirror',    hpMult: 1.7, minions: 6,  spawnInterval: 1000, arena: 'cage' };
    // Endless boss loops: every 5 waves after 15 = repeat bosses harder
    if (waveNum === 20) return { type: 'boss', boss: 'giantCrab', hpMult: 2.0, minions: 8,  spawnInterval: 700,  arena: 'underwater' };
    if (waveNum === 25) return { type: 'boss', boss: 'slimey',    hpMult: 2.4, minions: 12, spawnInterval: 600,  arena: 'moshpit' };
    if (waveNum === 30) return { type: 'boss', boss: 'mirror',    hpMult: 3.0, minions: 10, spawnInterval: 700,  arena: 'cage' };

    // Normal wave: scale by wave number, capped to keep playable
    const mod = Math.min(2.4, 1 + (waveNum - 1) * 0.10); // 10% HP per wave, max 240%
    // After party (wave 16+), enemies get progressively meaner but FEWER on screen
    const postParty = waveNum >= 16;
    const total = postParty
      ? Math.min(8 + Math.floor((waveNum - 15) * 0.8), 20)  // cap at 20 — was 38, way calmer feel
      : Math.min(6 + waveNum * 1.6, 38);
    // Post-party HP multiplier bonus — harder per enemy, easier on the eyes
    const postPartyHpBoost = postParty ? 1 + (waveNum - 15) * 0.08 : 1;
    const finalMod = mod * postPartyHpBoost;

    // Spawn probabilities — sum can be up to ~0.7, remainder = regular crabs
    let paparazzi = 0, fast = 0, tank = 0, exploder = 0, armed = 0, fan = 0, leaper = 0, summoner = 0;
    if (waveNum >= 2)  paparazzi = 0.10;
    if (waveNum >= 3)  fast = 0.12;
    if (waveNum >= 4)  paparazzi = 0.12;
    if (waveNum >= 6)  { tank = 0.10; fast = 0.16; }
    if (waveNum >= 7)  exploder = 0.10;
    if (waveNum >= 8)  armed = 0.12;
    if (waveNum >= 9)  leaper = 0.10;
    if (waveNum >= 10) { fan = 0.05; paparazzi = 0.03; }    // fans much rarer now
    if (waveNum >= 11) { tank = 0.12; exploder = 0.12; fast = 0.14; armed = 0.14; }
    if (waveNum >= 12) summoner = 0.08;
    if (waveNum >= 13) { tank = 0.14; exploder = 0.14; armed = 0.16; fan = 0.06; leaper = 0.12; }
    if (waveNum >= 16) {
      fan = 0.05; paparazzi = 0.03;
      summoner = 0.08;
    }

    return {
      type: 'normal',
      enemyCount: Math.floor(total),
      hpMod: finalMod,
      spawnProbs: { paparazzi, fastCrab: fast, tankCrab: tank, exploder, armed, fan, leaper, summoner },
      spawnInterval: postParty
        ? Math.max(700, 1400 - (waveNum - 15) * 30)  // slower drip after party
        : Math.max(420, 1100 - waveNum * 30),
    };
  }

  function isBossWave(waveNum) {
    return waveNum === 5 || waveNum === 10 || waveNum === 15 ||
           waveNum === 20 || waveNum === 25 || waveNum === 30;
  }
  function isFinaleWave(waveNum) { return waveNum === 30; }

  // Boss extra HP from completed runs (scales replay value)
  function bossHpMult(bossKey, completedRuns = 0) {
    const cfg = bossKey === 'giantCrab' ? 1.0 : bossKey === 'slimey' ? 1.3 : 1.7;
    return cfg * (1 + completedRuns * 0.3);
  }

  return { getWaveConfig, isBossWave, isFinaleWave, bossHpMult };
})();
