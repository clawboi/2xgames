// sprites.js — all pixel art drawn procedurally. No image files needed.
// MAJOR UPDATE: many more outfit options (hats, shades, patterns), plus cash sprite,
// plus all the boss/enemy hurt-flash support.

const Sprites = (() => {

  // Helper: draw a pixel-art "sprite" from a 2D color grid
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

  // ============ COLOR UTILITIES ============
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

  // ============ PLAYER 2X ============
  // Customizable: fit color, accent, hat, chain, shades, pattern
  function drawPlayer(ctx, x, y, opts = {}, dir = 0, frame = 0) {
    const fit    = opts.fit    || '#00ff66';
    const accent = opts.accent || '#cc0022';
    const hat    = opts.hat    || 'durag';
    const chain  = opts.chain  || 'gold';
    const shades = !!opts.shades;
    const pattern = opts.pattern || 'solid';
    const skin   = '#5a3a22';
    const skinD  = '#3d2615';
    const eye    = '#fff';

    // Pattern variants tweak the fit accent
    let fitB = fit;
    if (pattern === 'glow') {
      // Add an outer glow ring before sprite renders
      ctx.fillStyle = `rgba(${hexToRgb(fit).r}, ${hexToRgb(fit).g}, ${hexToRgb(fit).b}, 0.18)`;
      ctx.beginPath(); ctx.arc(x, y + 2, 22, 0, Math.PI * 2); ctx.fill();
    } else if (pattern === 'stripe') {
      // accented stripe is just brighter color
      fitB = lightenHex(fit, 0.2);
    } else if (pattern === 'flame') {
      // Flame pattern: yellow→orange→fit-color gradient on the body
    }

    // Hat character/color
    let hatColor = '#000';
    let hatGrid = null;
    if (hat === 'durag') { hatColor = accent; }
    else if (hat === 'cap') { hatColor = fit; }
    else if (hat === 'hood') { hatColor = '#222'; }
    else if (hat === 'beanie') { hatColor = accent; }
    else if (hat === 'bandana') { hatColor = accent; }
    else if (hat === 'headphones') { hatColor = '#222'; }
    else if (hat === 'mohawk') { hatColor = accent; }

    const chainColor = chain === 'gold' ? '#ffcc00'
                     : chain === 'ice' ? '#aaeeff'
                     : chain === 'platinum' ? '#cccccc'
                     : null;

    // Base body grid (head + torso + legs)
    // Head/face rows 0-5, torso rows 6-11, legs/shoes rows 12-17.
    // Hat rows 0-2 (varies by hat type), body uses fit color F & accent A, chain C
    let topRows;
    let shadeRows;

    // Build face rows depending on shades
    if (shades) {
      topRows = [
        '  HSSSSSSSSH  ',
        '  HSGGGGGGSH  ', // shades band
        '  HSGGGGGGSH  ',
      ];
    } else {
      topRows = [
        '  HSSSSSSSSH  ',
        '  HSEESSEESH  ', // eyes
        '  HSSSSSSSSH  ',
      ];
    }
    shadeRows = [
      '  HSSSSMSSSH  ', // mouth dot
      '  HSSSSSSSSH  ',
    ];

    // Hat rows (3 rows above head)
    let hatRows;
    switch (hat) {
      case 'cap':
        hatRows = [
          '   HHHHHHHH   ',
          '  HHHHHHHHHH  ',
          '  HHHHHHHHH   ',
        ];
        break;
      case 'hood':
        hatRows = [
          '  HHHHHHHHHH  ',
          ' HHHHHHHHHHHH ',
          ' HHHHHHHHHHHH ',
        ];
        // Hood extends down sides — add side flaps later
        break;
      case 'beanie':
        hatRows = [
          '    HHHHHH    ',
          '   HHHHHHHH   ',
          '  HHHHHHHHHH  ',
        ];
        break;
      case 'bandana':
        hatRows = [
          '              ',
          '              ',
          '  HHHHHHHHHH  ',
        ];
        break;
      case 'headphones':
        hatRows = [
          '   HHHHHHHH   ',
          '  H        H  ',
          '  H        H  ',
        ];
        break;
      case 'mohawk':
        hatRows = [
          '      HH      ',
          '     HHHH     ',
          '    HHHHHH    ',
        ];
        break;
      case 'none':
        hatRows = [
          '              ',
          '              ',
          '              ',
        ];
        break;
      case 'durag':
      default:
        hatRows = [
          '   HHHHHHHH   ',
          '  HHHHHHHHHH  ',
          '  HHHHHHHHHH  ', // durag trailing flap covers more
        ];
        break;
    }

    // Torso rows — chain on row 8
    const torsoRows = [
      '   FFFFFFFF   ',
      '  FFAFFFFAFF  ',
      '  FFFCCCCFFF  ', // chain
      '  FFFFFFFFFF  ',
      '  FFFFFFFFFF  ',
      '  FFAAFFAAFF  ',
    ];

    // Pattern overrides for stripe/flame
    if (pattern === 'stripe') {
      torsoRows[3] = '  FFAAAAAAFF  ';
      torsoRows[4] = '  FFFFFFFFFF  ';
    } else if (pattern === 'flame') {
      torsoRows[3] = '  FFXXXXXXFF  ';
      torsoRows[4] = '  FFFYYYYFFF  ';
    }

    const legsRows = [
      '   FF    FF   ',
      '   FF    FF   ',
      '   FF    FF   ',
      '   PP    PP   ',
      '   PP    PP   ',
      '  SSSS  SSSS  ',
    ];

    const grid = [...hatRows, ...topRows, ...shadeRows, ...torsoRows, ...legsRows];

    const palette = {
      H: hatColor,
      S: skin,
      E: eye,
      G: shades ? '#111' : skin,  // shades band color
      M: skinD,
      F: fit,
      A: accent,
      X: '#ff6600',  // flame mid
      Y: '#ffcc00',  // flame highlight
      C: chainColor || fit,
      P: '#222',
    };

    // Walking bob
    const bob = frame % 2 === 0 ? 0 : -1;
    const mirror = dir === 1;
    const yOff = bob;

    if (mirror) {
      ctx.save();
      ctx.translate(Math.floor(x), 0);
      ctx.scale(-1, 1);
      drawGrid(ctx, 0, y + yOff, grid, palette, 2);
      ctx.restore();
    } else {
      drawGrid(ctx, x, y + yOff, grid, palette, 2);
    }

    // Shades highlight (reflective glint)
    if (shades && !mirror) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(Math.floor(x - 7), Math.floor(y + yOff - 8), 2, 1);
    }

    // Headphones earcups (drawn on sides since the front grid can't easily express them)
    if (hat === 'headphones') {
      ctx.fillStyle = '#cc0022';
      ctx.fillRect(Math.floor(x - 11), Math.floor(y + yOff - 6), 3, 4);
      ctx.fillRect(Math.floor(x + 8), Math.floor(y + yOff - 6), 3, 4);
    }
    // Bandana side flap
    if (hat === 'bandana') {
      ctx.fillStyle = hatColor;
      ctx.fillRect(Math.floor(x + 7), Math.floor(y + yOff - 4), 4, 6);
    }

    // Shadow ellipse under feet
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(x, y + 18, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ============ CRAB ENEMY ============
  function drawCrab(ctx, x, y, frame = 0, hp = 1, hurtFlash = false, scale = 1, tintShell = null) {
    const wobble = Math.sin(frame * 0.3) * 1;
    const shellR = tintShell || '#cc0022';
    const shellD = darkenHex(shellR, 0.5);
    const palette = {
      R: shellR,
      D: shellD,
      E: '#fff',
      B: '#000',
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

  // ============ PAPARAZZI ENEMY ============
  function drawPaparazzi(ctx, x, y, frame = 0, hurtFlash = false) {
    const flash = (frame % 30) < 3;
    const palette = {
      S: '#d4a574',
      H: '#222',
      C: '#000',
      L: flash ? '#ffffff' : '#444',
      V: '#666',
      P: '#1a1a1a',
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
      S: '#6b4423',
      H: '#222',
      G: '#00aa44',
      D: '#006622',
      C: '#ffcc00',
      E: '#fff',
      M: '#cc0000',
      P: '#000',
      T: '#ff66cc',
    };
    const grid = [
      '   HHHHHHHH   ',
      '  HHHHHHHHHH  ',
      ' HHSSSSSSSHHH ',
      ' HSSEESSEESS  ',
      ' HSSSSSSSSSS  ',
      ' HSSSTTTTTSSS ',
      ' HSSSSMSSSSSS ',
      '  GGGGGGGGGG  ',
      ' GGGCCCCCGGG  ',
      'GGGGCCCCCGGGG ',
      'GGDGGGGGGGDGG ',
      'GGGGGGGGGGGGG ',
      ' GG        GG ',
      ' GG        GG ',
      ' PP        PP ',
      ' PP        PP ',
    ];
    drawGrid(ctx, x, y + bob, grid, palette, 4);

    if (hpPct < 0.5) {
      ctx.strokeStyle = `rgba(0,255,68,${0.5 + Math.sin(frame * 0.4) * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 60, 0, Math.PI * 2); ctx.stroke();
    }
    if (hurtFlash) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(x - 36, y + bob - 36, 72, 80);
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
      '   FFFFFFFF   ',
      '  FFAFFFFAFF  ',
      '  FFFCCCCFFF  ',
      '  FFFFFFFFFF  ',
      '  FFFFFFFFFF  ',
      '  FFAAFFAAFF  ',
      '   FF    FF   ',
      '   FF    FF   ',
      '   FF    FF   ',
      '   PP    PP   ',
      '   PP    PP   ',
      '  SSSS  SSSS  ',
    ];
    const palette = {
      H: hatColor, S: skin, E: eye, M: '#000', F: fit, A: accent,
      C: dark.chain === 'gold' ? '#aa8800' : '#5588aa',
      P: '#000',
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
      case 'draco': {
        ctx.strokeStyle = 'rgba(255,170,0,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = '#ffaa00';
        ctx.fillRect(x - 2, y - 1, 6, 2);
        break;
      }
      case 'glock': {
        ctx.strokeStyle = 'rgba(255,238,136,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = '#ffee88';
        ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
        break;
      }
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
      case 'laser': {
        ctx.strokeStyle = 'rgba(255,0,255,0.5)';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(x - 6, y - 2, 12, 4);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 5, y - 1, 10, 2);
        break;
      }
      case 'enemy': {
        ctx.fillStyle = 'rgba(255,68,68,0.4)';
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff4444';
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        break;
      }
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
    }
  }

  // ============ CASH (coin) ============
  function drawCash(ctx, x, y, frame = 0, lifePct = 1) {
    const flip = Math.abs(Math.sin(frame * 0.12));
    const w = Math.max(3, Math.round(8 * flip));
    const alpha = lifePct < 0.2 ? lifePct / 0.2 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    // Outer ring
    ctx.fillStyle = '#aa7700';
    ctx.fillRect(x - w/2 - 1, y - 4, w + 2, 8);
    // Inner glow
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(x - w/2, y - 3, w, 6);
    // Highlight stripe
    ctx.fillStyle = '#ffee88';
    ctx.fillRect(x - w/2, y - 2, w, 2);
    // Dollar sign (only visible at certain angles)
    if (flip > 0.7) {
      ctx.fillStyle = '#664400';
      ctx.fillRect(x - 1, y - 2, 2, 4);
    }
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

  return {
    drawPlayer, drawCrab, drawPaparazzi, drawTruck,
    drawGiantCrab, drawSlimey, drawMirror2X,
    drawBullet, drawPowerUp, drawCash, drawParticle, drawMuzzleFlash,
  };
})();
