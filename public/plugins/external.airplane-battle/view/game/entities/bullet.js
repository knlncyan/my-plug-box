import { Entity } from './entity.js';
import {
  BULLET_SPEED,
  BULLET_WIDTH,
  BULLET_HEIGHT,
  ENEMY_BULLET_SPEED,
  ENEMY_BULLET_WIDTH,
  ENEMY_BULLET_HEIGHT,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from '../constants.js';

export class Bullet extends Entity {
  /**
   * @param {number} x - center x
   * @param {number} y - center y
   * @param {'player'|'enemy'} owner
   * @param {number} [dirX=0] - horizontal direction component
   * @param {number} [dirY] - vertical direction component (default: -1 for player, 1 for enemy)
   */
  constructor(x, y, owner, dirX = 0, dirY = undefined) {
    const isPlayer = owner === 'player';
    const width = isPlayer ? BULLET_WIDTH : ENEMY_BULLET_WIDTH;
    const height = isPlayer ? BULLET_HEIGHT : ENEMY_BULLET_HEIGHT;
    super(x, y, width, height);

    this.owner = owner;
    this.damage = 1;

    const speed = isPlayer ? BULLET_SPEED : ENEMY_BULLET_SPEED;

    if (dirY === undefined) {
      dirY = isPlayer ? -1 : 1;
    }

    // Normalize direction
    const len = Math.sqrt(dirX * dirX + dirY * dirY);
    if (len > 0) {
      this.vx = (dirX / len) * speed;
      this.vy = (dirY / len) * speed;
    } else {
      this.vx = 0;
      this.vy = (isPlayer ? -1 : 1) * speed;
    }
  }

  update(dt) {
    super.update(dt);
    // Remove if off screen
    if (this.y < -this.height || this.y > CANVAS_HEIGHT + this.height) {
      this.destroy();
    }
    if (this.x < -this.width || this.x > CANVAS_WIDTH + this.width) {
      this.destroy();
    }
  }
}
