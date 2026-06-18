// FAMEUP Customize — preset picker + emote preview on FAMEUP home
(function () {
  'use strict';

  const PRESETS = {
    schizo:    { fit:'#ffffff', accent:'#dddddd', hat:'none',       chain:'none',     shades:false, pattern:'solid',  shirtless:false, tattoos:false, skinTone:'medium' },
    xx7:       { fit:'#cc0022', accent:'#00ff66', hat:'none',       chain:'gold',     shades:true,  pattern:'solid',  shirtless:false, tattoos:false, skinTone:'brown' },
    drip:      { fit:'#ffffff', accent:'#ffcc00', hat:'cap',        chain:'cuban',    shades:true,  pattern:'solid',  shirtless:false, tattoos:false, skinTone:'brown' },
    streetwear:{ fit:'#000000', accent:'#cc0022', hat:'hood',       chain:'gold',     shades:false, pattern:'solid',  shirtless:false, tattoos:true,  skinTone:'tan' },
    rage:      { fit:'#ff6600', accent:'#cc0022', hat:'mohawk',     chain:'none',     shades:false, pattern:'flame',  shirtless:true,  tattoos:true,  skinTone:'brown' },
    clean:     { fit:'#ffffff', accent:'#000000', hat:'none',       chain:'platinum', shades:true,  pattern:'solid',  shirtless:false, tattoos:false, skinTone:'light' },
    ghost:     { fit:'#9933ff', accent:'#00aaff', hat:'headphones', chain:'ice',      shades:true,  pattern:'glow',   shirtless:true,  tattoos:false, skinTone:'dark' },
  };

  let raf = 0;
  let frame = 0;
  let currentEmote = null;
  let emoteUntil = 0;
  let canvas, ctx;

  function loadCust() {
    try {
      const save = JSON.parse(localStorage.getItem('crabcage_save_v3') || '{}');
      return save.customization || { fit: '#cc0022', accent: '#00ff66', hat: 'durag', chain: 'gold', shades: true, pattern: 'solid', shirtless: false, tattoos: false, skinTone: 'brown', body: 'male' };
    } catch (e) {
      return { fit: '#cc0022', accent: '#00ff66', hat: 'durag', chain: 'gold', shades: true, pattern: 'solid', shirtless: false, tattoos: false, skinTone: 'brown', body: 'male' };
    }
  }
  function saveCust(cust) {
    try {
      const save = JSON.parse(localStorage.getItem('crabcage_save_v3') || '{}');
      save.customization = cust;
      localStorage.setItem('crabcage_save_v3', JSON.stringify(save));
    } catch (e) {}
  }

  function applyPreset(presetKey) {
    const p = PRESETS[presetKey];
    if (!p) return;
    const cust = loadCust();
    Object.assign(cust, p);
    saveCust(cust);
    // Mark active button
    document.querySelectorAll('.cust-preset-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-preset') === presetKey);
    });
  }

  function setEmote(emoji) {
    currentEmote = emoji;
    emoteUntil = performance.now() + 3000;
  }

  function render() {
    if (!canvas || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    // Background gradient
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#221122');
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Tile floor
    const tile = 20;
    for (let y = canvas.height - 40; y < canvas.height; y += tile) {
      for (let x = 0; x < canvas.width; x += tile) {
        const isWhite = ((x / tile) + (y / tile)) % 2 === 0;
        ctx.fillStyle = isWhite ? '#1a1a1a' : '#0a0a0a';
        ctx.fillRect(x, y, tile, tile);
      }
    }
    const cust = loadCust();
    frame++;
    try {
      Sprites.drawPlayer(ctx, canvas.width / 2, canvas.height / 2 + 30, cust, 'down', frame);
    } catch (e) {}
    // Emote bubble
    const now = performance.now();
    if (currentEmote && now < emoteUntil) {
      const bx = canvas.width / 2;
      const by = canvas.height / 2 - 35;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath(); ctx.arc(bx, by, 18, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ff0033'; ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = '24px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000';
      ctx.fillText(currentEmote, bx, by);
      ctx.textBaseline = 'alphabetic';
    }
  }

  function loop() {
    if (!isVisible()) return;
    render();
    raf = requestAnimationFrame(loop);
  }
  function isVisible() {
    const el = document.getElementById('customize-screen');
    return el && !el.classList.contains('hidden');
  }

  function open() {
    canvas = document.getElementById('cust-preview');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function init() {
    document.querySelectorAll('.cust-preset-btn').forEach(b => {
      b.addEventListener('click', () => applyPreset(b.getAttribute('data-preset')));
    });
    document.querySelectorAll('.cust-emote-btn').forEach(b => {
      b.addEventListener('click', () => setEmote(b.getAttribute('data-emote')));
    });
  }

  document.addEventListener('DOMContentLoaded', init);
  window.FAMEUP_CUSTOMIZE = { open };
})();
