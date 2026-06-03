// input.js — keyboard + mouse + touch joystick, unified into one API.

const Input = (() => {
  const keys = {};
  const mouse = { x: 0, y: 0, down: false };
  const joystick = { x: 0, y: 0, active: false }; // -1 to 1 on each axis
  let fireButtonHeld = false;
  let dashRequested = false;
  let canvas = null;

  // === KEYBOARD ===
  window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  // === MOUSE ===
  function attachMouse(c) {
    canvas = c;
    c.addEventListener('mousemove', e => {
      const rect = c.getBoundingClientRect();
      mouse.x = (e.clientX - rect.left) * (c.width / rect.width);
      mouse.y = (e.clientY - rect.top) * (c.height / rect.height);
    });
    c.addEventListener('mousedown', e => { mouse.down = true; });
    c.addEventListener('mouseup',   e => { mouse.down = false; });
    c.addEventListener('contextmenu', e => e.preventDefault());
  }

  // === TOUCH: JOYSTICK ===
  function attachJoystick() {
    const stickContainer = document.getElementById('joystick');
    const stick = document.getElementById('joystick-stick');
    if (!stickContainer || !stick) return;

    const maxDist = 40;
    let touchId = null;
    let centerX = 0, centerY = 0;

    function start(e) {
      const t = e.changedTouches[0];
      touchId = t.identifier;
      const rect = stickContainer.getBoundingClientRect();
      centerX = rect.left + rect.width / 2;
      centerY = rect.top + rect.height / 2;
      joystick.active = true;
      e.preventDefault();
    }
    function move(e) {
      for (const t of e.changedTouches) {
        if (t.identifier !== touchId) continue;
        let dx = t.clientX - centerX;
        let dy = t.clientY - centerY;
        const dist = Math.hypot(dx, dy);
        if (dist > maxDist) { dx = dx / dist * maxDist; dy = dy / dist * maxDist; }
        stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        joystick.x = dx / maxDist;
        joystick.y = dy / maxDist;
        e.preventDefault();
      }
    }
    function end(e) {
      for (const t of e.changedTouches) {
        if (t.identifier !== touchId) continue;
        touchId = null;
        joystick.active = false;
        joystick.x = 0; joystick.y = 0;
        stick.style.transform = 'translate(-50%, -50%)';
        e.preventDefault();
      }
    }
    stickContainer.addEventListener('touchstart', start, { passive: false });
    stickContainer.addEventListener('touchmove',  move,  { passive: false });
    stickContainer.addEventListener('touchend',   end,   { passive: false });
    stickContainer.addEventListener('touchcancel', end,  { passive: false });
  }

  // === TOUCH: FIRE / DASH BUTTONS ===
  function attachButtons() {
    const fire = document.getElementById('fire-btn');
    const dash = document.getElementById('dash-btn');
    if (fire) {
      fire.addEventListener('touchstart', e => { fireButtonHeld = true; e.preventDefault(); }, { passive: false });
      fire.addEventListener('touchend',   e => { fireButtonHeld = false; e.preventDefault(); }, { passive: false });
      fire.addEventListener('touchcancel', e => { fireButtonHeld = false; e.preventDefault(); }, { passive: false });
      // Also support mouse for testing
      fire.addEventListener('mousedown', () => { fireButtonHeld = true; });
      fire.addEventListener('mouseup',   () => { fireButtonHeld = false; });
    }
    if (dash) {
      dash.addEventListener('touchstart', e => { dashRequested = true; e.preventDefault(); }, { passive: false });
      dash.addEventListener('click', () => { dashRequested = true; });
    }
  }

  // === QUERIES ===
  function getMoveVector() {
    // Prefer joystick if active; else keyboard
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

  function isFiring() { return mouse.down || fireButtonHeld; }

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
    attachMouse(c);
    attachJoystick();
    attachButtons();
  }

  return { init, getMoveVector, isFiring, consumeDash, getMouseTarget, isKey, isTouchDevice };
})();
