const STORAGE_KEY = 'airplane_battle_high_score';

/**
 * Score manager with localStorage persistence for high scores.
 */
export class ScoreManager {
  constructor() {
    this.score = 0;
    this.highScore = this._loadHighScore();
    this.isNewHighScore = false;
  }

  /**
   * Add points to current score.
   * @param {number} points
   */
  add(points) {
    this.score += points;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.isNewHighScore = true;
    }
  }

  /**
   * Get the current score.
   * @returns {number}
   */
  getScore() {
    return this.score;
  }

  /**
   * Get the high score.
   * @returns {number}
   */
  getHighScore() {
    return this.highScore;
  }

  /**
   * Save the high score to localStorage.
   */
  save() {
    try {
      localStorage.setItem(STORAGE_KEY, String(this.highScore));
    } catch {
      // localStorage may not be available
    }
  }

  /**
   * Reset the current score for a new game.
   */
  reset() {
    this.score = 0;
    this.isNewHighScore = false;
  }

  /**
   * Load high score from localStorage.
   * @returns {number}
   */
  _loadHighScore() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        const val = parseInt(stored, 10);
        return isNaN(val) ? 0 : val;
      }
    } catch {
      // localStorage may not be available
    }
    return 0;
  }
}
