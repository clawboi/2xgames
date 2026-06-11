// sprites.js — all pixel art drawn procedurally on canvas.
// No image files needed; everything is rectangles on a pixel grid.

const Sprites = (() => {
  // Helper: draw a pixel-art "sprite" from a 2D color grid
  // grid is array of strings, each char maps to a color in palette
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

  // === PLAYER 2X ===
  // Customizable: fit color, accent, hat, chain
  function drawPlayer(ctx, x, y, opts = {}, dir = 0, frame = 0) {
    const fit    = opts.fit    || '#00ff66';
    const accent = opts.accent || '#cc0022';
    const hat    = opts.hat    || 'durag';
    const chain  = opts.chain  || 'gold';
    const skin   = '#5a3a22';
    const skinD  = '#3d2615';
    const eye    = '#fff';
    const shoe   = '#111';

    // Hat color depends on type
    let hatChar = ' ';
    let hatColor = '#000';
    if (hat === 'durag') { hatColor = accent; hatChar = 'H'; }
    else if (hat === 'cap') { hatColor = fit; hatChar = 'H'; }
    else if (hat === 'hood') { hatColor = '#222'; hatChar = 'H'; }

    const chainColor = chain === 'gold' ? '#ffcc00' : (chain === 'ice' ? '#aaeeff' : null);

    // Walking bob
    const bob = frame % 2 === 0 ? 0 : -1;
    // Direction mirror (0=right, 1=left, 2=down, 3=up)
    const mirror = dir === 1;

    // 14 wide x 18 tall sprite
    const grid = [
      '   HHHHHHHH   ',
      '  HHHHHHHHHH  ',
      '  HSSSSSSSSH  ',
      '  HSEESSEESH  ', // eyes
      '  HSSSSMSSSH  ', // mouth dot
      '  HSSSSSSSSH  ',
      '   FFFFFFFF   ',
      '  FFAFFFFAFF  ', // accent stripes
      '  FFFCCCCFFF  ', // chain
      '  FFFFFFFFFF  ',
      '  FFFFFFFFFF  ',
      '  FFAAFFAAFF  ',
      '   FF    FF   ',
      '   FF    FF   ',
      '   FF    FF   ',
      '   PP    PP   ', // pants
      '   PP    PP   ',
      '  SSSS  SSSS  ', // shoes
    ];

    const palette = {
      H: hatColor,
      S: skin,
      E: eye,
      M: skinD,
      F: fit,
      A: accent,
      C: chainColor || fit,
      P: '#222',
    };

    // Bob the whole sprite
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

    // Shadow ellipse under feet
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(x, y + 18, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // === CRAB ENEMY ===
  // scale: visual size multiplier (1=normal); tintShell: override shell color for variants
  function drawCrab(ctx, x, y, frame = 0, hp = 1, hurtFlash = false, scale = 1, tintShell = null) {
    const wobble = Math.sin(frame * 0.3) * 1;
    const shellR = tintShell || '#cc0022';
    // Compute darker shade
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

    // Hurt flash — bright white overlay during hit window
    if (hurtFlash) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x - 14 * scale, y + wobble - 10 * scale, 28 * scale, 20 * scale);
    }
  }

  // Helpers for variant tinting
  function darkenHex(hex, factor) {
    const c = hexToRgb(hex);
    return `rgb(${Math.floor(c.r * factor)}, ${Math.floor(c.g * factor)}, ${Math.floor(c.b * factor)})`;
  }
  function lightenHex(hex, factor) {
    const c = hexToRgb(hex);
    return `rgb(${Math.min(255, Math.floor(c.r + (255 - c.r) * factor))}, ${Math.min(255, Math.floor(c.g + (255 - c.g) * factor))}, ${Math.min(255, Math.floor(c.b + (255 - c.b) * factor))})`;
  }
  function hexToRgb(hex) {
    const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return { r: 200, g: 0, b: 0 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  // === PAPARAZZI ENEMY ===
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

  // === ESCALADE TRUCK (the thing you protect) ===
  function drawTruck(ctx, x, y, hpPct = 1) {
    // 60 wide x 36 tall
    const w = 60, h = 30;
    // Damage overlay
    const damaged = hpPct < 0.5;
    const burning = hpPct < 0.25;

    // Body
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(x - w/2, y - h/2, w, h);
    // Top
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x - w/2 + 4, y - h/2 - 8, w - 8, 10);
    // Windows
    ctx.fillStyle = damaged ? '#330000' : '#1a3a4a';
    ctx.fillRect(x - w/2 + 6, y - h/2 - 6, 14, 8);
    ctx.fillRect(x - w/2 + 24, y - h/2 - 6, 14, 8);
    ctx.fillRect(x - w/2 + 42, y - h/2 - 6, 12, 8);
    // Window frames
    ctx.fillStyle = '#000';
    ctx.fillRect(x - w/2 + 20, y - h/2 - 8, 2, 10);
    ctx.fillRect(x - w/2 + 38, y - h/2 - 8, 2, 10);

    // Grille
    ctx.fillStyle = '#444';
    ctx.fillRect(x + w/2 - 4, y - 4, 4, 8);
    // Headlights
    ctx.fillStyle = '#ffee88';
    ctx.fillRect(x + w/2 - 2, y - 8, 3, 3);
    ctx.fillRect(x + w/2 - 2, y + 5, 3, 3);

    // Wheels
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(x - w/2 + 10, y + h/2, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w/2 - 10, y + h/2, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#555';
    ctx.beginPath(); ctx.arc(x - w/2 + 10, y + h/2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w/2 - 10, y + h/2, 3, 0, Math.PI * 2); ctx.fill();

    // Chrome trim
    ctx.fillStyle = damaged ? '#664400' : '#888';
    ctx.fillRect(x - w/2, y + h/2 - 4, w, 2);

    // Damage smoke
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

  // === BOSSES ===
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

  // 2Slimey boss — rival rapper character
  function drawSlimey(ctx, x, y, frame = 0, hpPct = 1, hurtFlash = false) {
    const bob = Math.sin(frame * 0.2) * 2;
    const palette = {
      S: '#6b4423', // skin
      H: '#222',    // hair
      G: '#00aa44', // green hoodie (slimey themed)
      D: '#006622',
      C: '#ffcc00', // gold chain
      E: '#fff',
      M: '#cc0000', // mouth
      P: '#000',
      T: '#ff66cc', // grills (gold/pink mix)
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

    // Aura when low HP (rage mode)
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

  // Mirror 2X — final boss, looks like the player but dark
  function drawMirror2X(ctx, x, y, opts, frame = 0, hpPct = 1, hurtFlash = false) {
    // Drawn at 4x scale, dark/inverted palette
    const dark = {
      fit: opts.fit || '#00ff66',
      accent: opts.accent || '#cc0022',
      hat: opts.hat,
      chain: opts.chain,
    };
    // Glitch effect
    const glitch = Math.random() < 0.1;
    if (glitch) {
      ctx.save();
      ctx.translate(Math.random() * 4 - 2, Math.random() * 4 - 2);
    }
    // Draw bigger
    const oldGrid = drawPlayer;
    // Use scale 4 instead of 2 — re-implement quickly
    const fit    = dark.fit;
    const accent = dark.accent;
    const skin   = '#2a1a10'; // dark skin (shadow self)
    const eye    = '#ff0000'; // red eyes
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

    // Dark aura
    ctx.strokeStyle = `rgba(255,0,0,${0.3 + Math.sin(frame * 0.3) * 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 50, 0, Math.PI * 2); ctx.stroke();

    if (hurtFlash) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(x - 32, y - 40, 64, 80);
    }
  }

  // === BULLETS (uses bullet object with prevX/prevY for trail effects) ===
  function drawBullet(ctx, b) {
    const x = b.x, y = b.y, type = b.type;
    const px = b.prevX || x, py = b.prevY || y;

    switch (type) {
      case 'draco': {
        // Trail line
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
        // Smoke trail
        ctx.strokeStyle = 'rgba(160,160,160,0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
        // Rocket body
        const ang = Math.atan2(b.vy, b.vx);
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        ctx.fillStyle = '#888'; ctx.fillRect(-4, -2, 8, 4);
        ctx.fillStyle = '#ff4400'; ctx.fillRect(-6, -1, 3, 2);
        ctx.fillStyle = '#ffaa00'; ctx.fillRect(-9, -1, 3, 2);
        ctx.restore();
        break;
      }
      case 'laser': {
        // Magenta glow trail
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

  // === POWER-UPS ===
  function drawPowerUp(ctx, x, y, type, frame = 0) {
    const bob = Math.sin(frame * 0.15) * 3;
    const ny = y + bob;
    // Glow
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
        // The special weapon pickup
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(x - 8, ny - 3, 16, 6);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + 6, ny - 4, 4, 8);
        ctx.fillStyle = '#cc0022';
        ctx.fillRect(x - 10, ny - 2, 4, 4);
        // sparkle
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 3, ny - 6 - Math.sin(frame * 0.3) * 2, 2, 2);
        break;
    }
  }

  // === PARTICLES ===
  function drawParticle(ctx, p) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
    ctx.globalAlpha = 1;
  }

  // === MUZZLE FLASH ===
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
    drawBullet, drawPowerUp, drawParticle, drawMuzzleFlash,
  };
})();
