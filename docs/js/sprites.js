// sprites.js — procedural pixel art
// v4: 2x rapper redesign with shirtless option, tattoos, visible chain, jeans
// New sprites: ArmedCrab gun, Fan, SuitDude, BloodSplat decal, Sonic wave

const Sprites = (() => {

  function drawGrid(ctx, x, y, grid, palette, pixelSize = 2) {
    for (let row = 0; row < grid.length; row++) {
      const line = grid[row];
      for (let col = 0; col < line.length; col++) {
        const c = line[col];
        if (c === ' ' || c === '.') continue;
        const color = palette[c];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(
          Math.floor(x + col * pixelSize - (line.length * pixelSize) / 2),
          Math.floor(y + row * pixelSize - (grid.length * pixelSize) / 2),
          pixelSize, pixelSize
        );
      }
    }
  }

  function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return { r: 200, g: 0, b: 0 };
    const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return { r: 200, g: 0, b: 0 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }
  function darkenHex(hex, factor) {
    const c = hexToRgb(hex);
    return `rgb(${Math.floor(c.r * factor)}, ${Math.floor(c.g * factor)}, ${Math.floor(c.b * factor)})`;
  }
  function lightenHex(hex, factor) {
    const c = hexToRgb(hex);
    return `rgb(${Math.min(255, Math.floor(c.r + (255 - c.r) * factor))}, ${Math.min(255, Math.floor(c.g + (255 - c.g) * factor))}, ${Math.min(255, Math.floor(c.b + (255 - c.b) * factor))})`;
  }

  // ============ PLAYER 2X — RAPPER DRIP REDESIGN ============
  // Options:
  //   fit, accent — colors (fit = main outfit color)
  //   hat — durag/cap/hood/beanie/bandana/headphones/mohawk/none
  //   chain — gold/ice/platinum/cuban/none
  //   shades — bool
  //   pattern — solid/stripe/flame/glow
  //   shirtless — bool (NEW: no shirt, exposed chest with tattoos and chain)
  //   tattoos — bool (visible tats on arms/chest)
  //   jeansColor — '#222' default, supports custom
  function drawPlayer(ctx, x, y, opts = {}, dir = 0, frame = 0) {
    const fit      = opts.fit || '#00ff66';
    const accent   = opts.accent || '#cc0022';
    const hat      = opts.hat || 'durag';
    const chain    = opts.chain || 'gold';
    const shades   = !!opts.shades;
    const pattern  = opts.pattern || 'solid';
    const shirtless = opts.shirtless === true;
    const tattoos  = opts.tattoos !== false; // default on
    const jeansColor = opts.jeansColor || '#2a2a55';
    const skin     = '#7a5236';
    const skinD    = '#5a3a20';
    const skinL    = '#9a7050';
    const eye      = '#fff';
    const tatColor = '#1a1a1a';

    // Pattern: glow outer ring
    if (pattern === 'glow') {
      ctx.fillStyle = `rgba(${hexToRgb(fit).r}, ${hexToRgb(fit).g}, ${hexToRgb(fit).b}, 0.22)`;
      ctx.beginPath(); ctx.arc(x, y + 2, 24, 0, Math.PI * 2); ctx.fill();
    }

    // Hat color
    let hatColor;
    switch (hat) {
      case 'cap': hatColor = fit; break;
      case 'hood': hatColor = '#222'; break;
      case 'beanie': hatColor = accent; break;
      case 'bandana': hatColor = accent; break;
      case 'headphones': hatColor = '#222'; break;
      case 'mohawk': hatColor = accent; break;
      case 'none': hatColor = null; break;
      case 'durag':
      default: hatColor = accent; break;
    }

    const chainColor = chain === 'gold' ? '#ffcc00'
                     : chain === 'ice' ? '#aaeeff'
                     : chain === 'platinum' ? '#cccccc'
                     : chain === 'cuban' ? '#ffaa00'
                     : null;

    // Eye row depending on shades
    const eyeRow = shades ? '  HSGGGGGGSH  ' : '  HSEESSEESH  ';

    // Hat rows
    let hatRows;
    switch (hat) {
      case 'cap':       hatRows = ['   HHHHHHHH   ', '  HHHHHHHHHH  ', '  HHHHHHHHH   ']; break;
      case 'hood':      hatRows = ['  HHHHHHHHHH  ', ' HHHHHHHHHHHH ', ' HHHHHHHHHHHH ']; break;
      case 'beanie':    hatRows = ['    HHHHHH    ', '   HHHHHHHH   ', '  HHHHHHHHHH  ']; break;
      case 'bandana':   hatRows = ['              ', '              ', '  HHHHHHHHHH  ']; break;
      case 'headphones':hatRows = ['   HHHHHHHH   ', '  H        H  ', '  H        H  ']; break;
      case 'mohawk':    hatRows = ['      HH      ', '     HHHH     ', '    HHHHHH    ']; break;
      case 'none':      hatRows = ['              ', '              ', '              ']; break;
      case 'durag':
      default:          hatRows = ['   HHHHHHHH   ', '  HHHHHHHHHH  ', '  HHHHHHHHHH  ']; break;
    }

    // Face rows (3 total)
    const faceRows = [
      '  HSSSSSSSSH  ',
      eyeRow,
      '  HSSSSSSSSH  ',
    ];
    const lowerFaceRows = [
      '  HSSSSMSSSH  ',
      '  HSSSSSSSSH  ',
    ];

    // === TORSO ===
    // Shirtless variant: bare chest with abs/pec lines + tattoos + chain prominent
    // Shirted: T-shirt with pattern + chain over shirt
    let torsoRows;
    if (shirtless) {
      // Bare chest — skin tone with subtle muscle highlight/shadow + chain
      torsoRows = [
        '   SSSSSSSS   ',
        '  SLSSSSLSSL  ', // pec highlights
        '  SSSCCCCSSS  ', // chain
        '  SSSSSSSSSS  ',
        '  SLDSSSSDSL  ', // ab line
        '  SSSSSSSSSS  ',
      ];
      // Add tattoo "T" markers on arms via palette
      if (tattoos) {
        torsoRows[1] = '  STSSSSSSST  '; // arm tats
        torsoRows[3] = '  STSSCSSSST  '; // arm tats below shoulder
      }
    } else {
      torsoRows = [
        '   FFFFFFFF   ',
        '  FFAFFFFAFF  ',
        '  FFFCCCCFFF  ', // chain over shirt
        '  FFFFFFFFFF  ',
        '  FFFFFFFFFF  ',
        '  FFAAFFAAFF  ',
      ];
      if (pattern === 'stripe') {
        torsoRows[3] = '  FFAAAAAAFF  ';
        torsoRows[4] = '  FFFFFFFFFF  ';
      } else if (pattern === 'flame') {
        torsoRows[3] = '  FFXXXXXXFF  ';
        torsoRows[4] = '  FFFYYYYFFF  ';
      }
    }

    // === LEGS === jeans always
    const legsRows = [
      '   JJ    JJ   ',
      '   JJ    JJ   ',
      '   JJ    JJ   ',
      '   JJ    JJ   ',
      '   PP    PP   ', // shoes
      '  SSSS  SSSS  ', // sneaker accent (using skin? no, recolor below)
    ];

    const grid = [...hatRows, ...faceRows, ...lowerFaceRows, ...torsoRows, ...legsRows];

    const palette = {
      H: hatColor || skin,  // if no hat, H falls back to skin so hat-area is just hairline
      S: skin,
      L: skinL,
      D: skinD,
      E: eye,
      G: shades ? '#111' : skin,
      M: skinD,
      F: fit,
      A: accent,
      X: '#ff6600',
      Y: '#ffcc00',
      C: chainColor || (shirtless ? '#ffcc00' : fit),
      T: tatColor, // tattoos
      J: jeansColor,
      P: '#1a1a1a',  // shoe sole
    };
    // If no hat, repaint H rows as transparent (hair) — already handled by mapping H→skin (no-op)
    if (hat === 'none') palette.H = '#000000';  // little bit of hair on top

    const bob = frame % 2 === 0 ? 0 : -1;
    const mirror = dir === 1;

    if (mirror) {
      ctx.save();
      ctx.translate(Math.floor(x), 0);
      ctx.scale(-1, 1);
      drawGrid(ctx, 0, y + bob, grid, palette, 2);
      ctx.restore();
    } else {
      drawGrid(ctx, x, y + bob, grid, palette, 2);
    }

    // Shades glint
    if (shades && !mirror) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(Math.floor(x - 7), Math.floor(y + bob - 8), 2, 1);
    }

    // Headphone earcups
    if (hat === 'headphones') {
      ctx.fillStyle = '#cc0022';
      ctx.fillRect(Math.floor(x - 11), Math.floor(y + bob - 6), 3, 4);
      ctx.fillRect(Math.floor(x + 8), Math.floor(y + bob - 6), 3, 4);
    }
    // Bandana flap
    if (hat === 'bandana') {
      ctx.fillStyle = hatColor;
      ctx.fillRect(Math.floor(x + 7), Math.floor(y + bob - 4), 4, 6);
    }

    // Sneaker stripe
    ctx.fillStyle = '#fff';
    ctx.fillRect(Math.floor(x - 7), Math.floor(y + 16), 5, 1);
    ctx.fillRect(Math.floor(x + 2), Math.floor(y + 16), 5, 1);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(x, y + 19, 13, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ============ CRAB ============
  function drawCrab(ctx, x, y, frame = 0, hpPct = 1, hurtFlash = false, scale = 1, tintShell = null) {
    const wobble = Math.sin(frame * 0.3) * 1;
    const shellR = tintShell || '#cc0022';
    const shellD = darkenHex(shellR, 0.5);
    const palette = {
      R: shellR, D: shellD, E: '#fff', B: '#000',
      C: lightenHex(shellR, 0.25),
    };
    const grid = [
      '  B      B  ',
      ' BEB    BEB ',
      'BBBB    BBBB',
      ' RRRRRRRRRR ',
      'RRDRRRRRRDRR',
      'RRDDDDDDDRRR',
      'CRRRRRRRRRRC',
      ' B B B B B B',
    ];
    drawGrid(ctx, x, y + wobble, grid, palette, Math.max(1, Math.round(2 * scale)));

    if (hurtFlash) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x - 14 * scale, y + wobble - 10 * scale, 28 * scale, 20 * scale);
    }
  }

  // ============ ARMED CRAB GUN ============
  function drawCrabGun(ctx, x, y, frame = 0) {
    // Small dark gun on top of crab's shell
    ctx.fillStyle = '#222';
    ctx.fillRect(x - 6, y, 12, 3);
    ctx.fillStyle = '#444';
    ctx.fillRect(x - 8, y + 1, 3, 2);
    ctx.fillStyle = '#666';
    ctx.fillRect(x + 5, y, 4, 2);
    // muzzle glow if recent shot
    if (frame % 60 < 4) {
      ctx.fillStyle = '#ffaa00';
      ctx.fillRect(x + 9, y, 3, 2);
    }
  }

  // ============ PAPARAZZI ============
  function drawPaparazzi(ctx, x, y, frame = 0, hurtFlash = false) {
    const flash = (frame % 30) < 3;
    const palette = {
      S: '#d4a574', H: '#222', C: '#000',
      L: flash ? '#ffffff' : '#444', V: '#666', P: '#1a1a1a',
    };
    const grid = [
      '   HHHHH   ',
      '  HHSSHHH  ',
      '  HSSSSH   ',
      '   SSSS    ',
      '   CCCC    ',
      '  CLLLLC   ',
      '  CLLLLC   ',
      '  VVVVVV   ',
      ' VVVVVVVV  ',
      ' VVVVVVVV  ',
      '  PPPPPP   ',
      '  PP  PP   ',
      '  PP  PP   ',
    ];
    drawGrid(ctx, x, y, grid, palette, 2);

    if (flash) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(x, y - 4, 16, 0, Math.PI * 2);
      ctx.fill();
    }
    if (hurtFlash) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x - 14, y - 14, 28, 28);
    }
  }

  // ============ FAN (club outfit + camera) ============
  function drawFan(ctx, x, y, frame = 0, hurtFlash = false) {
    const flash = (frame % 30) < 3;
    const palette = {
      S: '#e0b58b', // skin
      H: '#5a2222', // hair (long)
      D: '#cc4499', // dress / top accent
      P: '#e94078', // hot pink dress
      M: '#ff66aa', // dress highlight
      C: '#000',
      L: flash ? '#ffffff' : '#888', // camera lens
      V: '#444', // camera body
      B: '#000',
      G: '#ffcc00', // gold details
      F: '#1a1a1a', // shoes
    };
    const grid = [
      ' HHHHHHHH  ',
      'HHSSSSSSHH ',
      'HSSSSSSSSH ',
      ' HSSSSSSH  ',
      '  SSSSSS   ',
      '   CCCC    ',  // camera (heart-eye lens region)
      '  CLLLLC   ',
      '  CLLLLC   ',
      '  PPPPPP   ',  // dress top
      ' PPMMMMPP  ',
      'PPPMMMMPPP ',
      ' SSPPPPSS  ',  // skin: arms beside dress
      '  SS  SS   ',  // bare legs
      '  SS  SS   ',
      '  FF  FF   ',
    ];
    drawGrid(ctx, x, y, grid, palette, 2);

    // Camera flash effect when ready
    if (flash) {
      ctx.fillStyle = 'rgba(255,200,220,0.6)';
      ctx.beginPath();
      ctx.arc(x, y - 4, 16, 0, Math.PI * 2);
      ctx.fill();
    }
    // Don't shoot indicator — small heart above
    ctx.fillStyle = '#ff66aa';
    ctx.fillRect(x - 3, y - 18, 2, 2);
    ctx.fillRect(x + 1, y - 18, 2, 2);
    ctx.fillRect(x - 3, y - 16, 6, 2);
    ctx.fillRect(x - 2, y - 14, 4, 2);
    ctx.fillRect(x - 1, y - 12, 2, 2);

    if (hurtFlash) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x - 12, y - 14, 24, 28);
    }
  }

  // ============ ESCALADE TRUCK ============
  function drawTruck(ctx, x, y, hpPct = 1) {
    const w = 60, h = 30;
    const damaged = hpPct < 0.5;
    const burning = hpPct < 0.25;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(x - w/2, y - h/2, w, h);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x - w/2 + 4, y - h/2 - 8, w - 8, 10);
    ctx.fillStyle = damaged ? '#330000' : '#1a3a4a';
    ctx.fillRect(x - w/2 + 6, y - h/2 - 6, 14, 8);
    ctx.fillRect(x - w/2 + 24, y - h/2 - 6, 14, 8);
    ctx.fillRect(x - w/2 + 42, y - h/2 - 6, 12, 8);
    ctx.fillStyle = '#000';
    ctx.fillRect(x - w/2 + 20, y - h/2 - 8, 2, 10);
    ctx.fillRect(x - w/2 + 38, y - h/2 - 8, 2, 10);
    ctx.fillStyle = '#444';
    ctx.fillRect(x + w/2 - 4, y - 4, 4, 8);
    ctx.fillStyle = '#ffee88';
    ctx.fillRect(x + w/2 - 2, y - 8, 3, 3);
    ctx.fillRect(x + w/2 - 2, y + 5, 3, 3);
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(x - w/2 + 10, y + h/2, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w/2 - 10, y + h/2, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#555';
    ctx.beginPath(); ctx.arc(x - w/2 + 10, y + h/2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w/2 - 10, y + h/2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = damaged ? '#664400' : '#888';
    ctx.fillRect(x - w/2, y + h/2 - 4, w, 2);

    if (damaged) {
      for (let i = 0; i < 3; i++) {
        const sx = x - w/2 + Math.random() * w;
        const sy = y - h/2 - Math.random() * 12;
        ctx.fillStyle = `rgba(80,80,80,${0.3 + Math.random() * 0.3})`;
        ctx.beginPath(); ctx.arc(sx, sy, 3 + Math.random() * 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (burning) {
      for (let i = 0; i < 4; i++) {
        const fx = x - w/2 + Math.random() * w;
        const fy = y - h/2 - 4 + Math.random() * 8;
        ctx.fillStyle = `rgba(255,${100 + Math.random()*100},0,${0.6 + Math.random()*0.4})`;
        ctx.beginPath(); ctx.arc(fx, fy, 2 + Math.random() * 4, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // ============ SUIT DUDE — pops out of Escalade firing ============
  function drawSuitDude(ctx, x, y, angle = 0) {
    const palette = {
      H: '#000', S: '#d4a574', G: '#000', // shades
      B: '#0a0a0a', // suit (darker)
      W: '#fff', // shirt
      T: '#cc0022', // tie
    };
    // Bigger sprite — 3x scale instead of 2x
    const grid = [
      ' HHHHH ',
      'HSSSSSH',
      'HSGGSSH',
      'HSGGSSH',
      ' SSSSS ',
      'BBWWWBB',
      'BWWTWWB',
      'BWWTWWB',
      'BWWTWWB',
    ];
    drawGrid(ctx, x, y, grid, palette, 3);

    // Gun arm
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = '#222';
    ctx.fillRect(0, -3, 14, 5);
    ctx.fillStyle = '#666';
    ctx.fillRect(12, -2, 4, 3);
    // Muzzle flash if firing
    ctx.fillStyle = '#ffee00';
    ctx.fillRect(16, -2, 3, 3);
    ctx.restore();
  }

  // ============ BOSSES ============
  function drawGiantCrab(ctx, x, y, frame = 0, hpPct = 1, hurtFlash = false) {
    const wobble = Math.sin(frame * 0.15) * 3;
    const scale = 5;
    const palette = {
      R: '#aa0011', D: '#660008', E: '#ffff00', B: '#000', C: '#ff2244', S: '#fff',
    };
    const grid = [
      '   B          B   ',
      '  BEB        BEB  ',
      ' BBBSB      BSBBB ',
      ' BBBBBBBBBBBBBBBB ',
      'BRRRRRRRRRRRRRRRRB',
      'RDDRRRRRRRRRRRRDDR',
      'RDDDDDDDDDDDDDDDDR',
      'CRRRRRRRRRRRRRRRRC',
      'CRRRDDDDDDDDDDRRRC',
      ' BBBBBBBBBBBBBBBB ',
      'B B  B B  B B  B B',
    ];
    drawGrid(ctx, x, y + wobble, grid, palette, scale);

    if (hpPct < 0.5) {
      ctx.strokeStyle = '#330000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 30, y - 10); ctx.lineTo(x + 10, y + 20);
      ctx.moveTo(x + 5, y - 15); ctx.lineTo(x - 15, y + 15);
      ctx.stroke();
    }
    if (hurtFlash) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(x - 48, y + wobble - 28, 96, 60);
    }
  }

  function drawSlimey(ctx, x, y, frame = 0, hpPct = 1, hurtFlash = false) {
    const bob = Math.sin(frame * 0.2) * 2;
    const palette = {
      S: '#6b4423', H: '#222', G: '#00aa44', D: '#006622',
      C: '#ffcc00', E: '#fff', M: '#cc0000', P: '#000', T: '#ff66cc',
    };
    // Slightly slimmer slimey (10 wide instead of 14)
    const grid = [
      '   HHHHHH   ',
      '  HHHHHHHH  ',
      ' HHSSSSSSHH ',
      ' HSEESSEESS ',
      ' HSSSSSSSSS ',
      ' HSSTTTTSSS ',
      ' HSSSMSSSSS ',
      '  GGGGGGGG  ',
      ' GGGCCCCGGG ',
      'GGGGCCCCGGG ',
      'GGDGGGGGDGG ',
      'GGGGGGGGGGG ',
      ' GG      GG ',
      ' GG      GG ',
      ' PP      PP ',
      ' PP      PP ',
    ];
    drawGrid(ctx, x, y + bob, grid, palette, 4);

    if (hpPct < 0.5) {
      ctx.strokeStyle = `rgba(0,255,68,${0.5 + Math.sin(frame * 0.4) * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 56, 0, Math.PI * 2); ctx.stroke();
    }
    if (hurtFlash) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(x - 32, y + bob - 36, 64, 80);
    }
  }

  function drawMirror2X(ctx, x, y, opts, frame = 0, hpPct = 1, hurtFlash = false) {
    const dark = {
      fit: opts?.fit || '#00ff66',
      accent: opts?.accent || '#cc0022',
      hat: opts?.hat,
      chain: opts?.chain,
    };
    const glitch = Math.random() < 0.1;
    if (glitch) {
      ctx.save();
      ctx.translate(Math.random() * 4 - 2, Math.random() * 4 - 2);
    }
    const fit    = dark.fit;
    const accent = dark.accent;
    const skin   = '#2a1a10';
    const eye    = '#ff0000';
    const hatColor = dark.hat === 'durag' ? accent : (dark.hat === 'cap' ? fit : '#000');

    const grid = [
      '   HHHHHHHH   ',
      '  HHHHHHHHHH  ',
      '  HSSSSSSSSH  ',
      '  HSEESSEESH  ',
      '  HSSSSMSSSH  ',
      '  HSSSSSSSSH  ',
      '   SSSSSSSS   ',  // bare chest mirror
      '  STSSSSSSST  ',
      '  SSSCCCCSSS  ',
      '  SSSSSSSSSS  ',
      '  STSSSSSSST  ',
      '  SSSSSSSSSS  ',
      '   JJ    JJ   ',
      '   JJ    JJ   ',
      '   JJ    JJ   ',
      '   PP    PP   ',
      '   PP    PP   ',
      '  SSSS  SSSS  ',
    ];
    const palette = {
      H: hatColor, S: skin, E: eye, M: '#000', F: fit, A: accent,
      C: dark.chain === 'gold' ? '#aa8800' : '#5588aa',
      T: '#440000', J: '#000', P: '#000',
    };
    drawGrid(ctx, x, y, grid, palette, 4);

    if (glitch) ctx.restore();

    ctx.strokeStyle = `rgba(255,0,0,${0.3 + Math.sin(frame * 0.3) * 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 50, 0, Math.PI * 2); ctx.stroke();

    if (hurtFlash) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(x - 32, y - 40, 64, 80);
    }
  }

  // ============ BULLETS ============
  function drawBullet(ctx, b) {
    const x = b.x, y = b.y, type = b.type;
    const px = b.prevX || x, py = b.prevY || y;

    switch (type) {
      case 'draco':
        ctx.strokeStyle = 'rgba(255,170,0,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = '#ffaa00';
        ctx.fillRect(x - 2, y - 1, 6, 2);
        break;
      case 'glock':
        ctx.strokeStyle = 'rgba(255,238,136,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = '#ffee88';
        ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
        break;
      case 'shotgun':
        ctx.strokeStyle = 'rgba(255,180,80,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = '#ffaa44';
        ctx.fillRect(x - 1, y - 1, 3, 3);
        break;
      case 'rpg': {
        ctx.strokeStyle = 'rgba(160,160,160,0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
        const ang = Math.atan2(b.vy, b.vx);
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        ctx.fillStyle = '#888'; ctx.fillRect(-4, -2, 8, 4);
        ctx.fillStyle = '#ff4400'; ctx.fillRect(-6, -1, 3, 2);
        ctx.fillStyle = '#ffaa00'; ctx.fillRect(-9, -1, 3, 2);
        ctx.restore();
        break;
      }
      case 'laser':
        ctx.strokeStyle = 'rgba(255,0,255,0.5)';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(x - 6, y - 2, 12, 4);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 5, y - 1, 10, 2);
        break;
      case 'enemy':
        ctx.fillStyle = 'rgba(255,68,68,0.4)';
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff4444';
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        break;
      default:
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }

  // ============ POWER-UPS ============
  function drawPowerUp(ctx, x, y, type, frame = 0) {
    const bob = Math.sin(frame * 0.15) * 3;
    const ny = y + bob;
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.arc(x, ny, 12, 0, Math.PI * 2); ctx.fill();

    switch (type) {
      case 'health':
        ctx.fillStyle = '#cc0022';
        ctx.fillRect(x - 6, ny - 2, 12, 4);
        ctx.fillRect(x - 2, ny - 6, 4, 12);
        break;
      case 'speed':
        ctx.fillStyle = '#ffee00';
        ctx.beginPath();
        ctx.moveTo(x + 6, ny - 6);
        ctx.lineTo(x - 4, ny + 1);
        ctx.lineTo(x + 1, ny + 1);
        ctx.lineTo(x - 4, ny + 6);
        ctx.lineTo(x + 6, ny - 1);
        ctx.lineTo(x + 1, ny - 1);
        ctx.closePath();
        ctx.fill();
        break;
      case 'damage':
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x, ny - 2, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.fillRect(x - 3, ny - 3, 2, 2);
        ctx.fillRect(x + 1, ny - 3, 2, 2);
        ctx.fillRect(x - 2, ny + 1, 4, 1);
        break;
      case 'shield':
        ctx.fillStyle = '#0088ff';
        ctx.beginPath();
        ctx.moveTo(x, ny - 7);
        ctx.lineTo(x + 6, ny - 3);
        ctx.lineTo(x + 6, ny + 3);
        ctx.lineTo(x, ny + 7);
        ctx.lineTo(x - 6, ny + 3);
        ctx.lineTo(x - 6, ny - 3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 1, ny - 3, 2, 6);
        ctx.fillRect(x - 3, ny - 1, 6, 2);
        break;
      case 'ammo':
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(x - 6, ny - 4, 12, 8);
        ctx.fillStyle = '#000';
        ctx.fillRect(x - 5, ny - 3, 10, 1);
        ctx.fillRect(x - 5, ny + 2, 10, 1);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 6px monospace';
        ctx.fillText('AMMO', x - 8, ny + 1);
        break;
      case 'crab-gun':
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(x - 8, ny - 3, 16, 6);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + 6, ny - 4, 4, 8);
        ctx.fillStyle = '#cc0022';
        ctx.fillRect(x - 10, ny - 2, 4, 4);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 3, ny - 6 - Math.sin(frame * 0.3) * 2, 2, 2);
        break;
      case 'lightning':
        // Yellow lightning bolt
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(x - 2, ny - 8);
        ctx.lineTo(x + 4, ny - 2);
        ctx.lineTo(x + 1, ny - 2);
        ctx.lineTo(x + 3, ny + 6);
        ctx.lineTo(x - 4, ny);
        ctx.lineTo(x - 1, ny);
        ctx.lineTo(x - 3, ny - 8);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ffee00';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;
      case 'slowmo':
        // Hourglass
        ctx.fillStyle = '#88ddff';
        ctx.beginPath();
        ctx.moveTo(x - 6, ny - 6);
        ctx.lineTo(x + 6, ny - 6);
        ctx.lineTo(x - 6, ny + 6);
        ctx.lineTo(x + 6, ny + 6);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;
    }
  }

  // ============ CASH ============
  function drawCash(ctx, x, y, frame = 0, lifePct = 1) {
    const flip = Math.abs(Math.sin(frame * 0.12));
    const w = Math.max(3, Math.round(8 * flip));
    const alpha = lifePct < 0.2 ? lifePct / 0.2 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#aa7700';
    ctx.fillRect(x - w/2 - 1, y - 4, w + 2, 8);
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(x - w/2, y - 3, w, 6);
    ctx.fillStyle = '#ffee88';
    ctx.fillRect(x - w/2, y - 2, w, 2);
    if (flip > 0.7) {
      ctx.fillStyle = '#664400';
      ctx.fillRect(x - 1, y - 2, 2, 4);
    }
    ctx.restore();
  }

  // ============ BLOOD SPLAT (ground decal) ============
  function drawBloodSplat(ctx, splat) {
    ctx.save();
    const alpha = Math.min(1, splat.life / 8000);
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = '#660000';
    for (const dot of splat.dots) {
      ctx.fillRect(splat.x + dot.dx - dot.r, splat.y + dot.dy - dot.r, dot.r * 2, dot.r * 2);
    }
    ctx.restore();
  }

  // ============ SONIC WAVE ============
  function drawSonicWave(ctx, w) {
    const a = w.life / w.maxLife;
    const range = w.range * (1 - a) + 30;
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.rotate(w.angle);
    ctx.strokeStyle = `rgba(170,200,255,${a * 0.8})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, range, -w.arc, w.arc);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${a * 0.5})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, range - 8, -w.arc, w.arc);
    ctx.stroke();
    ctx.restore();
  }

  // ============ PARTICLES ============
  function drawParticle(ctx, p) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
    ctx.globalAlpha = 1;
  }

  // ============ MUZZLE FLASH ============
  function drawMuzzleFlash(ctx, x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = '#ffee00';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(14, -4);
    ctx.lineTo(18, 0);
    ctx.lineTo(14, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, -2, 8, 4);
    ctx.restore();
  }

  // ============ FOLLOWER (small NPC trailing player) ============
  function drawFollower(ctx, x, y, frame = 0, dir = 0) {
    const palette = {
      H: '#5a2222', // hair
      S: '#e0b58b', // skin
      D: '#ff66aa', // dress
      F: '#1a1a1a', // shoes
    };
    const grid = [
      ' HHHHH ',
      'HHSSSHH',
      ' HSSSH ',
      '  SSS  ',
      '  DDD  ',
      ' DDDDD ',
      ' DDDDD ',
      '  S S  ',
      '  S S  ',
      '  F F  ',
    ];
    const bob = frame % 8 < 4 ? 0 : -1;
    if (dir === 1) {
      ctx.save(); ctx.translate(Math.floor(x), 0); ctx.scale(-1, 1);
      drawGrid(ctx, 0, y + bob, grid, palette, 2);
      ctx.restore();
    } else {
      drawGrid(ctx, x, y + bob, grid, palette, 2);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(x, y + 12, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
  }

  // ============ DANCER (party NPC) ============
  function drawDancer(ctx, x, y, color, kind, frame = 0) {
    const armUp = Math.sin(frame / 8) > 0;
    const palette = {
      H: kind === 'girl' ? '#5a2222' : '#222',
      S: kind === 'girl' ? '#e0b58b' : '#7a5236',
      D: color,
      F: '#1a1a1a',
    };
    const arms = armUp ?
      ['DSDDDDSD', 'D  DD  D'] :  // arms up
      [' SDDDDS ', '  DDDD  '];   // arms down
    const grid = [
      '  HHHH  ',
      ' HSSSSH ',
      ' HSSSSH ',
      '  SSSS  ',
      arms[0],
      ' DDDDDD ',
      arms[1],
      '  S  S  ',
      '  S  S  ',
      '  F  F  ',
    ];
    drawGrid(ctx, x, y, grid, palette, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(x, y + 13, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
  }

  // ============ PARTY PICKUPS (CD / Drink / Smoke / Exit) ============
  function drawPartyPickup(ctx, x, y, type, frame = 0) {
    const bob = Math.sin(frame * 0.1) * 3;
    const ny = y + bob;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(x, ny, 18, 0, Math.PI * 2); ctx.fill();

    if (type === 'cd') {
      // Spinning CD with rainbow shimmer
      const rot = frame * 0.12;
      ctx.save();
      ctx.translate(x, ny);
      ctx.rotate(rot);
      // Outer ring
      ctx.fillStyle = '#ccc';
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
      // Rainbow gradient
      const rainbow = ['#ff0033','#ff8800','#ffcc00','#00cc66','#0088ff','#9933ff'];
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = rainbow[i];
        const a1 = (i / 6) * Math.PI * 2;
        const a2 = ((i + 1) / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 12, a1, a2);
        ctx.closePath();
        ctx.fill();
      }
      // Center hole
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // "PICK UP" tip
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('2X CD', x, ny - 22);
      ctx.textAlign = 'left';
    } else if (type === 'drink') {
      // Bottle of liquor
      ctx.fillStyle = '#aa5500';
      ctx.fillRect(x - 3, ny - 8, 6, 5);  // neck
      ctx.fillStyle = '#cc7700';
      ctx.fillRect(x - 6, ny - 3, 12, 12);  // body
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(x - 5, ny - 1, 10, 4);  // label
      ctx.fillStyle = '#000';
      ctx.font = 'bold 6px monospace';
      ctx.fillText('XX', x - 5, ny + 3);
    } else if (type === 'smoke') {
      // Purple smoke wisp / blunt
      ctx.fillStyle = '#552255';
      ctx.fillRect(x - 7, ny - 1, 14, 3);  // joint
      ctx.fillStyle = '#ff8800';
      ctx.fillRect(x + 6, ny - 1, 2, 3);  // cherry
      for (let i = 0; i < 4; i++) {
        const sx = x - 5 + i * 3 + Math.sin(frame / 20 + i) * 2;
        const sy = ny - 6 - i * 3;
        ctx.fillStyle = `rgba(204,136,255,${0.6 - i * 0.12})`;
        ctx.beginPath(); ctx.arc(sx, sy, 3 + i, 0, Math.PI * 2); ctx.fill();
      }
    } else if (type === 'exit') {
      // Glowing exit doorway
      const glow = 0.5 + Math.sin(frame / 20) * 0.3;
      ctx.fillStyle = `rgba(0,255,102,${glow})`;
      ctx.fillRect(x - 14, ny - 20, 28, 40);
      ctx.fillStyle = '#00ff66';
      ctx.fillRect(x - 12, ny - 18, 24, 36);
      ctx.fillStyle = '#000';
      ctx.fillRect(x - 8, ny - 14, 16, 28);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('EXIT', x, ny + 30);
      ctx.textAlign = 'left';
    }
  }

  return {
    drawPlayer, drawCrab, drawCrabGun, drawPaparazzi, drawFan, drawTruck, drawSuitDude,
    drawGiantCrab, drawSlimey, drawMirror2X,
    drawBullet, drawPowerUp, drawCash, drawBloodSplat, drawSonicWave, drawParticle, drawMuzzleFlash,
    drawFollower, drawDancer, drawPartyPickup,
  };
})();
