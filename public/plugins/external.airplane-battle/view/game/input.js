import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants.js';

/**
 * Unified input handler for keyboard + touch/mouse.
 * Provides a simple state object: { left, right, up, down, shoot }
 */
export class InputHandler {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = {
      left: false,
      right: false,
      up: false,
      down: false,
      shoot: false,
    };

    // Track pressed keys
    this._keys = new Set();

    // Touch state
    this._touchActive = false;
    this._touchX = 0;
    this._touchY = 0;
    this._touchStartX = 0;
    this._touchStartY = 0;

    // Action callback (for menu/restart actions)
    this.onAction = null;
    this.onPause = null;
    this.onMenu = null;

    // Skin select callbacks
    this.onSkinSelect = null;   // called when C is pressed on menu
    this.onSkinNav = null;      // called with 'left' or 'right' during skin select
    this.onSkinConfirm = null;  // called when Space/Enter confirms skin choice

    this._listeners = [];

    this._bindKeyboard();
    this._bindTouch();
  }

  _listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this._listeners.push(() => target.removeEventListener(type, handler, options));
  }

  _bindKeyboard() {
    const onKeyDown = (e) => {
      this._keys.add(e.code);
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.onSkinConfirm) {
          this.onSkinConfirm();
        } else {
          if (this.onAction) this.onAction(true);
        }
      }
      if (e.code === 'Enter') {
        e.preventDefault();
        if (this.onSkinConfirm) this.onSkinConfirm();
      }
      if (e.code === 'Escape') {
        e.preventDefault();
        if (this.onPause) this.onPause();
      }
      if (e.code === 'KeyM') {
        e.preventDefault();
        if (this.onMenu) this.onMenu();
      }
      if (e.code === 'KeyC') {
        e.preventDefault();
        if (this.onSkinSelect) this.onSkinSelect();
      }
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        if (this.onSkinNav) {
          e.preventDefault();
          this.onSkinNav('left');
        }
      }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        if (this.onSkinNav) {
          e.preventDefault();
          this.onSkinNav('right');
        }
      }
    };

    const onKeyUp = (e) => {
      this._keys.delete(e.code);
    };

    this._listen(document, 'keydown', onKeyDown);
    this._listen(document, 'keyup', onKeyUp);
  }

  _bindTouch() {
    const getLogicalPos = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const scaleY = CANVAS_HEIGHT / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    };

    // Mouse events
    const onMouseDown = (e) => {
      e.preventDefault();
      this._touchActive = true;
      const pos = getLogicalPos(e.clientX, e.clientY);
      this._touchStartX = pos.x;
      this._touchStartY = pos.y;
      this._touchX = pos.x;
      this._touchY = pos.y;
      if (this.onAction) this.onAction();
    };

    const onMouseMove = (e) => {
      if (!this._touchActive) return;
      const pos = getLogicalPos(e.clientX, e.clientY);
      this._touchX = pos.x;
      this._touchY = pos.y;
    };

    const onMouseUp = () => {
      this._touchActive = false;
    };

    // Touch events
    const onTouchStart = (e) => {
      e.preventDefault();
      this._touchActive = true;
      const touch = e.touches[0];
      const pos = getLogicalPos(touch.clientX, touch.clientY);
      this._touchStartX = pos.x;
      this._touchStartY = pos.y;
      this._touchX = pos.x;
      this._touchY = pos.y;
      if (this.onAction) this.onAction();
    };

    const onTouchMove = (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const pos = getLogicalPos(touch.clientX, touch.clientY);
      this._touchX = pos.x;
      this._touchY = pos.y;
    };

    const onTouchEnd = (e) => {
      e.preventDefault();
      this._touchActive = false;
    };

    const onTouchCancel = () => {
      this._touchActive = false;
    };

    this._listen(this.canvas, 'mousedown', onMouseDown);
    this._listen(this.canvas, 'mousemove', onMouseMove);
    this._listen(document, 'mouseup', onMouseUp);
    this._listen(this.canvas, 'touchstart', onTouchStart, { passive: false });
    this._listen(this.canvas, 'touchmove', onTouchMove, { passive: false });
    this._listen(document, 'touchend', onTouchEnd, { passive: false });
    this._listen(document, 'touchcancel', onTouchCancel, { passive: false });
  }

  /**
   * Update the state object based on current inputs.
   * Call once per frame before using state.
   * @param {import('./entities/player.js').Player} [player] - for touch relative movement
   */
  update(player) {
    // Keyboard
    this.state.left =
      this._keys.has('ArrowLeft') || this._keys.has('KeyA');
    this.state.right =
      this._keys.has('ArrowRight') || this._keys.has('KeyD');
    this.state.up =
      this._keys.has('ArrowUp') || this._keys.has('KeyW');
    this.state.down =
      this._keys.has('ArrowDown') || this._keys.has('KeyS');
    this.state.shoot = this._keys.has('Space');

    // Touch/mouse overrides: move player toward touch position
    if (this._touchActive && player) {
      const deadzone = 8;
      const dx = this._touchX - player.x;
      const dy = this._touchY - player.y;

      this.state.left = this.state.left || dx < -deadzone;
      this.state.right = this.state.right || dx > deadzone;
      this.state.up = this.state.up || dy < -deadzone;
      this.state.down = this.state.down || dy > deadzone;
      this.state.shoot = true; // auto-fire while touching
    }
  }

  destroy() {
    for (const cleanup of this._listeners.splice(0)) {
      cleanup();
    }
    this._keys.clear();
    this._touchActive = false;
  }
}
