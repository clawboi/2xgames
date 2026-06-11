// waves.js — wave progression + boss schedule + variant enemy probabilities

const Waves = (() => {
  // Boss waves: 5 = Giant Crab, 10 = 2Slimey, 15 = Mirror 2X
  // After 15 it loops with scaling difficulty

  function getWaveConfig(waveNum) {
    if (waveNum === 5)  return { type: 'boss', boss: 'giantCrab', minions: 4,  spawnInterval: 900 };
    if (waveNum === 10) return { type: 'boss', boss: 'slimey',    minions: 8,  spawnInterval: 800 };
    if (waveNum === 15) return { type: 'boss', boss: 'mirror',    minions: 6,  spawnInterval: 1000 };

    // Normal wave: scale difficulty + introduce new enemy types over time
    const mod = 1 + (waveNum - 1) * 0.12; // 12% harder per wave
    const total = Math.min(8 + waveNum * 2, 45);

    // Spawn probabilities (sum should be <= ~0.6, rest are basic crabs)
    let paparazzi = 0, fast = 0, tank = 0, exploder = 0;
    if (waveNum >= 2)  paparazzi = 0.15;
    if (waveNum >= 3)  fast = 0.12;
    if (waveNum >= 4)  paparazzi = 0.20;
    if (waveNum >= 6)  { tank = 0.10; fast = 0.18; }
    if (waveNum >= 7)  exploder = 0.10;
    if (waveNum >= 8)  paparazzi = 0.22;
    if (waveNum >= 11) { tank = 0.15; exploder = 0.15; fast = 0.20; }
    if (waveNum >= 13) { tank = 0.18; exploder = 0.18; }

    return {
      type: 'normal',
      enemyCount: total,
      hpMod: mod,
      paparazziChance: paparazzi, // legacy field kept for safety
      spawnProbs: { paparazzi, fastCrab: fast, tankCrab: tank, exploder },
      spawnInterval: Math.max(280, 900 - waveNum * 35),
    };
  }

  function isBossWave(waveNum) { return waveNum === 5 || waveNum === 10 || waveNum === 15; }

  return { getWaveConfig, isBossWave };
})();
