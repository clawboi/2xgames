// weapons.js — weapon stats and shooting logic

const Weapons = (() => {
  // Each weapon defines: name, damage, fireRate (ms between shots), bulletSpeed,
  // bulletType (sprite key), spread (radians), shotsPerFire, reload, ammo, melee, splash
  const defs = [
    { // 0: DRACO — fast SMG, decent damage
      key: 'draco', name: 'DRACO',
      damage: 14, fireRate: 90, bulletSpeed: 9,
      bulletType: 'draco', spread: 0.12, shotsPerFire: 1,
      magazine: 30, reloadTime: 1400,
      sound: 'shoot', shake: 1,
    },
    { // 1: GLOCK — semi-auto, fast reload, accurate
      key: 'glock', name: 'GLOCK',
      damage: 22, fireRate: 180, bulletSpeed: 11,
      bulletType: 'glock', spread: 0.03, shotsPerFire: 1,
      magazine: 15, reloadTime: 800,
      sound: 'shoot', shake: 1.5,
    },
    { // 2: BOXING GLOVES — melee, infinite "ammo"
      key: 'fists', name: 'FISTS',
      damage: 35, fireRate: 250, bulletSpeed: 0,
      bulletType: 'punch', spread: 0, shotsPerFire: 1,
      magazine: Infinity, reloadTime: 0,
      melee: true, meleeRange: 50,
      sound: 'punch', shake: 2,
    },
    { // 3: RPG — explosive, slow, AOE
      key: 'rpg', name: 'RPG',
      damage: 80, fireRate: 1400, bulletSpeed: 6,
      bulletType: 'rpg', spread: 0, shotsPerFire: 1,
      magazine: 4, reloadTime: 2500,
      splash: 80,
      sound: 'shootBig', shake: 5,
    },
    { // 4: CRAB LASER — special, unlocked via pickup, pierces enemies
      key: 'laser', name: 'CRAB LASER',
      damage: 50, fireRate: 110, bulletSpeed: 14,
      bulletType: 'laser', spread: 0.02, shotsPerFire: 1,
      magazine: 50, reloadTime: 0,
      pierce: true,
      special: true,
      sound: 'laser', shake: 2,
    },
  ];

  function get(idx) { return defs[idx] || defs[0]; }
  function count() { return defs.length; }

  return { defs, get, count };
})();
