import { Entity } from './entity.js';
import { CANVAS_HEIGHT, POWERUP_WIDTH, POWERUP_HEIGHT, POWERUP_FALL_SPEED } from '../constants.js';

export class PowerUp extends Entity {
  constructor(x, y) {
    super(x, y, POWERUP_WIDTH, POWERUP_HEIGHT);
    this.vy = POWERUP_FALL_SPEED;
    this.elapsed = 0;
  }

  update(dt) {
    super.update(dt);
    this.elapsed += dt;
    if (this.y > CANVAS_HEIGHT + this.height) {
      this.destroy();
    }
  }
}
