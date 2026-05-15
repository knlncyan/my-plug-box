import { Entity } from './entity.js';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  PLAYER_SPEED,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_LIVES,
  PLAYER_INVINCIBILITY_DURATION,
  PLAYER_INVINCIBILITY_FLASH_RATE,
  FIRE_RATE_INITIAL_COOLDOWN,
  FIRE_RATE_COOLDOWN_REDUCTION,
  FIRE_RATE_MIN_COOLDOWN,
  FIRE_RATE_MAX_LEVEL,
  BURST_MODE_DURATION,
  BURST_MODE_COOLDOWN,
} from '../constants.js';
import { Bullet } from './bullet.js';

export class Player extends Entity {
  constructor() {
    super(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 80, PLAYER_WIDTH, PLAYER_HEIGHT);
    this.speed = PLAYER_SPEED;
    this.lives = PLAYER_LIVES;
    this.shootCooldown = 0;
    this.invincibilityTimer = 0;
    this.flashTimer = 0;
    this.visible = true;
    this.fireRateLevel = 0;
    this.currentFireCooldown = FIRE_RATE_INITIAL_COOLDOWN;
    this.burstMode = false;
    this.burstTimer = 0;
  }

  get isInvincible() {
    return this.invincibilityTimer > 0;
  }

  update(dt, input) {
    // Movement
    let dx = 0;
    let dy = 0;

    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;

    // Normalize diagonal movement
    if (dx !== 0 && dy !== 0) {
      const factor = Math.SQRT1_2; // 1/sqrt(2)
      dx *= factor;
      dy *= factor;
    }

    this.x += dx * this.speed * dt;
    this.y += dy * this.speed * dt;

    // Clamp to canvas bounds
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    this.x = Math.max(halfW, Math.min(CANVAS_WIDTH - halfW, this.x));
    this.y = Math.max(halfH, Math.min(CANVAS_HEIGHT - halfH, this.y));

    // Shoot cooldown
    if (this.shootCooldown > 0) {
      this.shootCooldown -= dt;
    }

    // Burst mode timer
    if (this.burstMode) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        this.burstMode = false;
        this.burstTimer = 0;
      }
    }

    // Invincibility timer
    if (this.invincibilityTimer > 0) {
      this.invincibilityTimer -= dt;
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.visible = !this.visible;
        this.flashTimer = PLAYER_INVINCIBILITY_FLASH_RATE;
      }
    } else {
      this.visible = true;
    }
  }

  shoot() {
    if (this.shootCooldown > 0) return null;
    const cooldown = this.burstMode ? BURST_MODE_COOLDOWN : this.currentFireCooldown;
    this.shootCooldown = cooldown;

    if (this.burstMode) {
      return [
        new Bullet(this.x, this.y - this.height / 2, 'player'),
        new Bullet(this.x, this.y - this.height / 2, 'player', -0.15, -1),
        new Bullet(this.x, this.y - this.height / 2, 'player', 0.15, -1),
      ];
    }
    return new Bullet(this.x, this.y - this.height / 2, 'player');
  }

  collectPowerUp() {
    if (this.fireRateLevel >= FIRE_RATE_MAX_LEVEL) {
      this.burstMode = true;
      this.burstTimer = BURST_MODE_DURATION;
      return 'burst';
    }
    this.fireRateLevel += 1;
    this.currentFireCooldown = FIRE_RATE_INITIAL_COOLDOWN - (this.fireRateLevel * FIRE_RATE_COOLDOWN_REDUCTION);
    this.currentFireCooldown = Math.max(this.currentFireCooldown, FIRE_RATE_MIN_COOLDOWN);
    return 'levelup';
  }

  hit() {
    if (this.isInvincible) return false;
    this.lives -= 1;
    if (this.lives <= 0) {
      this.destroy();
      return true;
    }
    this.invincibilityTimer = PLAYER_INVINCIBILITY_DURATION;
    this.flashTimer = PLAYER_INVINCIBILITY_FLASH_RATE;
    return true;
  }

  reset() {
    this.x = CANVAS_WIDTH / 2;
    this.y = CANVAS_HEIGHT - 80;
    this.lives = PLAYER_LIVES;
    this.alive = true;
    this.shootCooldown = 0;
    this.invincibilityTimer = 0;
    this.flashTimer = 0;
    this.visible = true;
    this.fireRateLevel = 0;
    this.currentFireCooldown = FIRE_RATE_INITIAL_COOLDOWN;
    this.burstMode = false;
    this.burstTimer = 0;
  }
}
