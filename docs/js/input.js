// input.js — keyboard + mouse + touch joystick, unified into one API.
// CRITICAL: init() is guarded against double-attachment — calling init() multiple
// times is safe and won't duplicate listeners (fixes restart-glitch bug).

const Input = (() => {
  const keys = {};
  const mouse = { x: 0, y: 0, down: false };
  const joystick = { x: 0, y: 0, active: false }; // -1 to 1 on each axis
  let fireButtonHeld = false;
  let dashRequested = false;
  let canvas = null;
  let initialized = false;

  // Keyboard listeners attach once at module load (window-scoped, no canvas needed)
  window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  // === MOUSE ===
  function attachMouse(c) {
    c.addEventListener('mousemove', e => {
      const rect = c.getBoundingClientRect();
      mouse.x = (e.clientX - rect.left) * (c.width / rect.width);
      mouse.y = (e.clientY - rect.top) * (c.height / rect.height);
    });
    c.addEventListener('mousedown', () => { mouse.down = true; });
    c.addEventListener('mouseup',   () => { mouse.down = false; });
    // If pointer leaves canvas while held, release fire
    c.addEventListener('mouseleave', () => { mouse.down = false; });
    c.addEventListener('contextmenu', e => e.preventDefault());
  }

  // === TOUCH: JOYSTICK ===
  // Joystick is a dynamic/floating stick: wherever you first touch the LEFT half of the screen,
  // the joystick anchors there. Dragging from that point moves the player. Much smoother than a
  // fixed-position stick on phones.
  function attachJoystick() {
    const stickContainer = document.getElementById('joystick');
    const stick = document.getElementById('joystick-stick');
    if (!stickContainer || !stick) return;

    const maxDist = 32;
    let touchId = null;
    let originX = 0, originY = 0;

    function isLeftHalf(t) {
      return t.clientX < window.innerWidth / 2;
    }

    function isInActionZone(t) {
      // ignore touches on weapon bar / pause btn / fire btn / etc.
      const el = document.elementFromPoint(t.clientX, t.clientY);
      if (!el) return true;
      if (el.closest('#weapon-bar')) return false;
      if (el.closest('#touch-actions')) return false;
      if (el.closest('.corner-btn')) return false;
      if (el.closest('.overlay')) return false;
      return true;
    }

    function start(e) {
      for (const t of e.changedTouches) {
        if (touchId !== null) continue;
        if (!isLeftHalf(t)) continue;
        if (!isInActionZone(t)) continue;
        touchId = t.identifier;
        // KEEP joystick visual locked at its CSS position — only track touch origin
        originX = t.clientX;
        originY = t.clientY;
        stickContainer.classList.add('active');
        joystick.active = true;
        joystick.x = 0; joystick.y = 0;
        stick.style.transform = 'translate(-50%, -50%)';
        e.preventDefault();
        return;
      }
    }
    function move(e) {
      for (const t of e.changedTouches) {
        if (t.identifier !== touchId) continue;
        let dx = t.clientX - originX;
        let dy = t.clientY - originY;
        const dist = Math.hypot(dx, dy);
        if (dist > maxDist) { dx = dx / dist * maxDist; dy = dy / dist * maxDist; }
        stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        // Smooth toward target instead of snapping for jitter-free movement
        const targetX = dx / maxDist;
        const targetY = dy / maxDist;
        joystick.x += (targetX - joystick.x) * 0.35;
        joystick.y += (targetY - joystick.y) * 0.35;
        e.preventDefault();
        return;
      }
    }
    function end(e) {
      for (const t of e.changedTouches) {
        if (t.identifier !== touchId) continue;
        touchId = null;
        joystick.active = false;
        joystick.x = 0; joystick.y = 0;
        stick.style.transform = 'translate(-50%, -50%)';
        stickContainer.classList.remove('active');
        e.preventDefault();
        return;
      }
    }
    // Attach to document so user can grab anywhere on the left half (not just inside the small circle)
    document.addEventListener('touchstart', start, { passive: false });
    document.addEventListener('touchmove',  move,  { passive: false });
    document.addEventListener('touchend',   end,   { passive: false });
    document.addEventListener('touchcancel', end,  { passive: false });
  }

  // === TOUCH: FIRE / DASH BUTTONS ===
  function attachButtons() {
    const fire = document.getElementById('fire-btn');
    const dash = document.getElementById('dash-btn');
    if (fire) {
      fire.addEventListener('touchstart', e => { fireButtonHeld = true; e.preventDefault(); e.stopPropagation(); }, { passive: false });
      fire.addEventListener('touchend',   e => { fireButtonHeld = false; e.preventDefault(); e.stopPropagation(); }, { passive: false });
      fire.addEventListener('touchcancel', e => { fireButtonHeld = false; e.preventDefault(); e.stopPropagation(); }, { passive: false });
      fire.addEventListener('mousedown', () => { fireButtonHeld = true; });
      fire.addEventListener('mouseup',   () => { fireButtonHeld = false; });
      fire.addEventListener('mouseleave', () => { fireButtonHeld = false; });
    }
    if (dash) {
      dash.addEventListener('touchstart', e => { dashRequested = true; e.preventDefault(); e.stopPropagation(); }, { passive: false });
      dash.addEventListener('click', () => { dashRequested = true; });
    }
  }

  // === QUERIES ===
  function getMoveVector() {
    if (joystick.active && (joystick.x !== 0 || joystick.y !== 0)) {
      return { x: joystick.x, y: joystick.y };
    }
    let mx = 0, my = 0;
    if (keys['arrowleft'] || keys['a']) mx -= 1;
    if (keys['arrowright'] || keys['d']) mx += 1;
    if (keys['arrowup'] || keys['w']) my -= 1;
    if (keys['arrowdown'] || keys['s']) my += 1;
    const len = Math.hypot(mx, my);
    if (len > 0) { mx /= len; my /= len; }
    return { x: mx, y: my };
  }

  function isFiring() { return mouse.down || fireButtonHeld || keys[' '] === true; }

  function consumeDash() {
    const r = dashRequested || keys['shift'];
    dashRequested = false;
    return r;
  }

  function getMouseTarget() { return { x: mouse.x, y: mouse.y }; }
  function isKey(k) { return !!keys[k.toLowerCase()]; }
  function isTouchDevice() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  }

  function init(c) {
    if (initialized) {
      // Already wired up — just update the canvas reference for coord math
      canvas = c;
      return;
    }
    initialized = true;
    canvas = c;
    attachMouse(c);
    attachJoystick();
    attachButtons();
  }

  // Manual reset of transient state (called on quit / game-over to prevent stuck inputs)
  function resetTransient() {
    fireButtonHeld = false;
    dashRequested = false;
    mouse.down = false;
    joystick.active = false;
    joystick.x = 0; joystick.y = 0;
  }

  // Helpers for coop input forwarding
  function getMoveX() { const v = getMoveVector(); return v.x; }
  function getMoveY() { const v = getMoveVector(); return v.y; }
  function getAimAngle() {
    // Best-guess aim — use mouse target if available, else neutral
    const m = getMouseTarget();
    return Math.atan2(m.y - 240, m.x - 320);
  }
  function consumePower() {
    if (typeof keys['q'] !== 'undefined' && keys['q']) { keys['q'] = false; return true; }
    return false;
  }

  return { init, getMoveVector, isFiring, consumeDash, getMouseTarget, isKey, isTouchDevice, resetTransient,
           getMoveX, getMoveY, getAimAngle, consumePower };
})();
