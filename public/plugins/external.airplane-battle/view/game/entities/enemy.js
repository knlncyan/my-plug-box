import { Entity } from './entity.js';
import { Bullet } from './bullet.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT, ENEMY_TYPES } from '../constants.js';

/**
 * Base enemy class
 */
class EnemyBase extends Entity {
  constructor(x, y, config) {
    super(x, y, config.width, config.height);
    this.hp = config.hp;
    this.maxHp = config.hp;
    this.speed = config.speed;
    this.score = config.score;
    this.color = config.color;
    this.typeName = config.name;
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.destroy();
      return true; // destroyed
    }
    return false;
  }

  isOffScreen() {
    return this.y > CANVAS_HEIGHT + this.height;
  }
}

/**
 * BasicEnemy: Moves straight down, 1 HP, shoots periodically
 */
export class BasicEnemy extends EnemyBase {
  constructor(x, y) {
    super(x, y ?? -20, ENEMY_TYPES.BASIC);
    this.vy = this.speed;
    this.shootTimer = ENEMY_TYPES.BASIC.shootCooldown;
    this.shootCooldown = ENEMY_TYPES.BASIC.shootCooldown;
  }

  update(dt) {
    super.update(dt);
    if (this.isOffScreen()) {
      this.destroy();
      return null;
    }

    // Shooting
    this.shootTimer -= dt;
    if (this.shootTimer <= 0 && this.y > 0) {
      this.shootTimer = this.shootCooldown;
      return new Bullet(this.x, this.y + this.height / 2, 'enemy');
    }
    return null;
  }
}

/**
 * ShooterEnemy: Drifts horizontally, shoots periodically
 */
export class ShooterEnemy extends EnemyBase {
  constructor(x, y) {
    super(x, y ?? -20, ENEMY_TYPES.SHOOTER);
    this.vy = this.speed;
    this.vx = (Math.random() > 0.5 ? 1 : -1) * 40;
    this.shootTimer = ENEMY_TYPES.SHOOTER.shootCooldown;
    this.shootCooldown = ENEMY_TYPES.SHOOTER.shootCooldown;
  }

  update(dt) {
    super.update(dt);

    // Bounce off horizontal walls
    if (this.x <= this.width / 2 || this.x >= CANVAS_WIDTH - this.width / 2) {
      this.vx *= -1;
    }

    // Clamp x position
    this.x = Math.max(this.width / 2, Math.min(CANVAS_WIDTH - this.width / 2, this.x));

    if (this.isOffScreen()) {
      this.destroy();
      return null;
    }

    // Shooting
    this.shootTimer -= dt;
    if (this.shootTimer <= 0 && this.y > 0) {
      this.shootTimer = this.shootCooldown;
      return new Bullet(this.x, this.y + this.height / 2, 'enemy');
    }
    return null;
  }
}

/**
 * FastEnemy: Zigzag pattern, small and quick, shoots occasionally
 */
export class FastEnemy extends EnemyBase {
  constructor(x, y) {
    super(x, y ?? -20, ENEMY_TYPES.FAST);
    this.vy = this.speed;
    this.baseX = x;
    this.elapsed = Math.random() * Math.PI * 2; // random phase
    this.amplitude = ENEMY_TYPES.FAST.zigzagAmplitude;
    this.frequency = ENEMY_TYPES.FAST.zigzagFrequency;
    this.shootTimer = ENEMY_TYPES.FAST.shootCooldown;
    this.shootCooldown = ENEMY_TYPES.FAST.shootCooldown;
  }

  update(dt) {
    this.elapsed += dt;
    this.x = this.baseX + Math.sin(this.elapsed * this.frequency * Math.PI * 2) * this.amplitude;
    this.y += this.vy * dt;

    if (this.isOffScreen()) {
      this.destroy();
      return null;
    }

    // Shooting
    this.shootTimer -= dt;
    if (this.shootTimer <= 0 && this.y > 0) {
      this.shootTimer = this.shootCooldown;
      return new Bullet(this.x, this.y + this.height / 2, 'enemy');
    }
    return null;
  }
}

/**
 * BossEnemy: Large, shoots spread patterns, moves to target Y then strafes
 */
export class BossEnemy extends EnemyBase {
  constructor() {
    const config = ENEMY_TYPES.BOSS;
    super(CANVAS_WIDTH / 2, -config.height, config);
    this.vy = this.speed;
    this.targetY = config.targetY;
    this.reached = false;
    this.shootTimer = config.shootCooldown;
    this.shootCooldown = config.shootCooldown;
    this.strafeDir = 1;
    this.strafeSpeed = 50;
  }

  update(dt) {
    if (!this.reached) {
      this.y += this.vy * dt;
      if (this.y >= this.targetY) {
        this.y = this.targetY;
        this.reached = true;
        this.vy = 0;
      }
      return null;
    }

    // Strafe left and right
    this.x += this.strafeDir * this.strafeSpeed * dt;
    if (this.x <= this.width / 2 + 20) {
      this.strafeDir = 1;
    } else if (this.x >= CANVAS_WIDTH - this.width / 2 - 20) {
      this.strafeDir = -1;
    }

    // Shoot spread pattern
    this.shootTimer -= dt;
    if (this.shootTimer <= 0) {
      this.shootTimer = this.shootCooldown;
      const bullets = [];
      // 5-way spread
      for (let i = -2; i <= 2; i++) {
        const angle = (i * 20 * Math.PI) / 180;
        const dirX = Math.sin(angle);
        const dirY = Math.cos(angle);
        bullets.push(
          new Bullet(this.x, this.y + this.height / 2, 'enemy', dirX, dirY)
        );
      }
      return bullets;
    }
    return null;
  }
}
