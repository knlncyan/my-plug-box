import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  STAR_COUNT,
  STAR_SPEED_MIN,
  STAR_SPEED_MAX,
  STAR_SIZE_MIN,
  STAR_SIZE_MAX,
  PARTICLE_LIFETIME,
  PARTICLE_SPEED_MIN,
  PARTICLE_SPEED_MAX,
  COLORS,
} from './constants.js';

/**
 * A single particle in an explosion effect.
 */
class Particle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed =
      PARTICLE_SPEED_MIN + Math.random() * (PARTICLE_SPEED_MAX - PARTICLE_SPEED_MIN);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.lifetime = PARTICLE_LIFETIME;
    this.maxLifetime = PARTICLE_LIFETIME;
    this.radius = 2 + Math.random() * 4;
    this.color =
      COLORS.PARTICLE_COLORS[
        Math.floor(Math.random() * COLORS.PARTICLE_COLORS.length)
      ];
    this.alive = true;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.lifetime -= dt;
    if (this.lifetime <= 0) {
      this.alive = false;
    }
  }

  get alpha() {
    return Math.max(0, this.lifetime / this.maxLifetime);
  }
}

/**
 * Manages particle explosions.
 */
export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  /**
   * Spawn an explosion at position.
   * @param {number} x
   * @param {number} y
   * @param {number} count - number of particles
   */
  explode(x, y, count) {
    for (let i = 0; i < count; i++) {
      this.particles.push(new Particle(x, y));
    }
  }

  update(dt) {
    for (const p of this.particles) {
      p.update(dt);
    }
    this.particles = this.particles.filter((p) => p.alive);
  }

  render(ctx) {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * p.alpha, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

/**
 * Scrolling star-field background with parallax layers.
 */
export class StarField {
  constructor() {
    this.stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      this.stars.push(this._createStar(true));
    }
  }

  _createStar(randomY) {
    return {
      x: Math.random() * CANVAS_WIDTH,
      y: randomY ? Math.random() * CANVAS_HEIGHT : -5,
      speed: STAR_SPEED_MIN + Math.random() * (STAR_SPEED_MAX - STAR_SPEED_MIN),
      size: STAR_SIZE_MIN + Math.random() * (STAR_SIZE_MAX - STAR_SIZE_MIN),
      brightness: 0.3 + Math.random() * 0.7,
    };
  }

  update(dt) {
    for (const star of this.stars) {
      star.y += star.speed * dt;
      if (star.y > CANVAS_HEIGHT + 5) {
        const newStar = this._createStar(false);
        star.x = newStar.x;
        star.y = newStar.y;
        star.speed = newStar.speed;
        star.size = newStar.size;
        star.brightness = newStar.brightness;
      }
    }
  }

  render(ctx) {
    for (const star of this.stars) {
      ctx.save();
      ctx.globalAlpha = star.brightness;
      ctx.fillStyle = COLORS.STAR;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
