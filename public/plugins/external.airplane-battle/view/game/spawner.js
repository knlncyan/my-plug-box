import {
  CANVAS_WIDTH,
  WAVE_BASE_ENEMIES,
  WAVE_ENEMY_INCREMENT,
  WAVE_DELAY,
  BOSS_WAVE_INTERVAL,
  SPAWN_INTERVAL_BASE,
  SPAWN_INTERVAL_MIN,
  DIFFICULTY_SCALE,
} from './constants.js';
import { BasicEnemy, ShooterEnemy, FastEnemy, BossEnemy } from './entities/enemy.js';

/**
 * Wave-based enemy spawner with progressive difficulty.
 */
export class Spawner {
  constructor() {
    this.wave = 0;
    this.enemiesRemaining = 0;
    this.spawnTimer = 0;
    this.waveDelayTimer = 0;
    this.inWaveDelay = true;
    this.bossActive = false;
  }

  /** Start the next wave */
  startNextWave() {
    this.wave += 1;
    this.inWaveDelay = true;
    this.waveDelayTimer = WAVE_DELAY;

    if (this.wave % BOSS_WAVE_INTERVAL === 0) {
      this.enemiesRemaining = 1; // just the boss
    } else {
      this.enemiesRemaining =
        WAVE_BASE_ENEMIES + (this.wave - 1) * WAVE_ENEMY_INCREMENT;
    }
  }

  /**
   * Get the spawn interval for current wave difficulty.
   */
  getSpawnInterval() {
    const interval = SPAWN_INTERVAL_BASE - this.wave * DIFFICULTY_SCALE;
    return Math.max(SPAWN_INTERVAL_MIN, interval);
  }

  /**
   * Update spawner and return any new enemies to add.
   * @param {number} dt
   * @returns {import('./entities/enemy.js').EnemyBase[]}
   */
  update(dt) {
    const spawned = [];

    // Wave delay
    if (this.inWaveDelay) {
      this.waveDelayTimer -= dt;
      if (this.waveDelayTimer <= 0) {
        this.inWaveDelay = false;
        this.spawnTimer = 0; // spawn immediately
      }
      return spawned;
    }

    if (this.enemiesRemaining <= 0) return spawned;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.getSpawnInterval();
      const enemy = this._spawnEnemy();
      if (enemy) {
        spawned.push(enemy);
        this.enemiesRemaining -= 1;
      }
    }

    return spawned;
  }

  /**
   * Create a random enemy based on wave difficulty.
   */
  _spawnEnemy() {
    if (this.wave % BOSS_WAVE_INTERVAL === 0 && !this.bossActive) {
      this.bossActive = true;
      return new BossEnemy();
    }

    const x = 30 + Math.random() * (CANVAS_WIDTH - 60);
    const roll = Math.random();

    // Higher waves introduce more enemy variety
    if (this.wave >= 3 && roll < 0.2) {
      return new ShooterEnemy(x);
    }
    if (this.wave >= 2 && roll < 0.45) {
      return new FastEnemy(x);
    }
    return new BasicEnemy(x);
  }

  /** Notify that the boss was killed */
  onBossKilled() {
    this.bossActive = false;
  }

  /** Reset spawner state */
  reset() {
    this.wave = 0;
    this.enemiesRemaining = 0;
    this.spawnTimer = 0;
    this.waveDelayTimer = 0;
    this.inWaveDelay = true;
    this.bossActive = false;
  }
}
