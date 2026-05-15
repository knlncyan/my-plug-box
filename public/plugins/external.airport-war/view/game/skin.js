import { PLAYER_SKINS, STORAGE_KEY_SKIN } from './constants.js';

/**
 * Manages the active player skin / color scheme with localStorage persistence.
 */
export class SkinManager {
  constructor() {
    this.activeIndex = this._load();
  }

  /**
   * Return the active skin object.
   * @returns {{ id: string, name: string, label: string, body: string, engine: string, bullet: string, cockpit: string }}
   */
  getActiveSkin() {
    return PLAYER_SKINS[this.activeIndex];
  }

  /**
   * Return the active skin index.
   * @returns {number}
   */
  getActiveIndex() {
    return this.activeIndex;
  }

  /**
   * Set the active skin by index (clamped to valid range) and persist.
   * @param {number} index
   */
  setActiveSkin(index) {
    const clamped = Math.max(0, Math.min(PLAYER_SKINS.length - 1, index));
    this.activeIndex = clamped;
    this.save();
  }

  /**
   * Save active index to localStorage.
   */
  save() {
    try {
      localStorage.setItem(STORAGE_KEY_SKIN, String(this.activeIndex));
    } catch {
      // localStorage may not be available
    }
  }

  /**
   * Load active index from localStorage.
   * @returns {number}
   */
  _load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_SKIN);
      if (stored !== null) {
        const val = parseInt(stored, 10);
        if (!isNaN(val) && val >= 0 && val < PLAYER_SKINS.length) {
          return val;
        }
      }
    } catch {
      // localStorage may not be available
    }
    return 0;
  }
}
