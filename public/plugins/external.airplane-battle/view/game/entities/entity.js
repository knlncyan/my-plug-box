/**
 * Base Entity class for all game objects.
 * Provides position, size, velocity, and alive state.
 */
export class Entity {
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.vx = 0;
    this.vy = 0;
    this.alive = true;
  }

  /** Update position based on velocity and delta time */
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  /** Get axis-aligned bounding box */
  getBounds() {
    return {
      x: this.x - this.width / 2,
      y: this.y - this.height / 2,
      width: this.width,
      height: this.height,
    };
  }

  /** Mark entity as dead */
  destroy() {
    this.alive = false;
  }
}
