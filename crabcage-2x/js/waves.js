// waves.js — wave progression + boss schedule

const Waves = (() => {
  // Boss waves: 5 = Giant Crab, 10 = 2Slimey, 15 = Mirror 2X
  // After 15 it loops with scaling difficulty

  function getWaveConfig(waveNum) {
    if (waveNum === 5)  return { type: 'boss', boss: 'giantCrab', minions: 4 };
    if (waveNum === 10) return { type: 'boss', boss: 'slimey',    minions: 8 };
    if (waveNum === 15) return { type: 'boss', boss: 'mirror',    minions: 6 };

    // Normal wave: difficulty scales with wave number
    const mod = 1 + (waveNum - 1) * 0.12; // 12% harder per wave
    const total = Math.min(8 + waveNum * 2, 40);
    const paparazziChance = Math.min(0.15 + waveNum * 0.04, 0.5);
    return {
      type: 'normal',
      enemyCount: total,
      hpMod: mod,
      paparazziChance,
      spawnInterval: Math.max(300, 900 - waveNum * 40),
    };
  }

  function isBossWave(waveNum) { return waveNum === 5 || waveNum === 10 || waveNum === 15; }

  return { getWaveConfig, isBossWave };
})();
