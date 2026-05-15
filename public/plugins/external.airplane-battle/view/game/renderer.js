import { COLORS, ENEMY_TYPES } from './constants.js';

/**
 * Procedural Canvas renderer for all game entities.
 * No image assets - everything is drawn with shapes.
 */
export class Renderer {
  constructor(ctx) {
    this.ctx = ctx;
  }

  /**
   * Draw the player ship (triangle/arrow shape).
   * @param {object} player
   * @param {{ body: string, engine: string, bullet: string, cockpit: string }} [skin] - optional skin colors; falls back to COLORS constants
   */
  drawPlayer(player, skin) {
    if (!player.visible) return;

    const { ctx } = this;
    const { x, y, width, height } = player;

    Renderer.drawPlayerShape(ctx, x, y, width, height, skin, player.isInvincible ? 0.6 : 1.0);
  }

  /**
   * Shared static helper that draws the player ship shape (body, cockpit, engine glow).
   * Used by both drawPlayer and the UI skin-select preview.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x - center x
   * @param {number} y - center y
   * @param {number} width
   * @param {number} height
   * @param {{ body: string, engine: string, cockpit: string }} [skin] - skin colors; falls back to COLORS constants
   * @param {number} [alpha=1.0] - overall alpha for body/cockpit pass
   */
  static drawPlayerShape(ctx, x, y, width, height, skin, alpha = 1.0) {
    const bodyColor = skin ? skin.body : COLORS.PLAYER;
    const engineColor = skin ? skin.engine : COLORS.PLAYER_ENGINE;
    const cockpitColor = skin ? skin.cockpit : COLORS.PLAYER_COCKPIT;

    ctx.save();

    // Engine glow
    ctx.fillStyle = engineColor;
    ctx.globalAlpha = 0.5 + Math.random() * 0.3;
    ctx.beginPath();
    ctx.moveTo(x - width * 0.2, y + height * 0.3);
    ctx.lineTo(x, y + height * 0.5 + Math.random() * 8);
    ctx.lineTo(x + width * 0.2, y + height * 0.3);
    ctx.fill();

    ctx.globalAlpha = alpha;

    // Main body (triangle pointing up)
    ctx.fillStyle = bodyColor;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - height / 2); // nose
    ctx.lineTo(x - width / 2, y + height / 3); // bottom-left
    ctx.lineTo(x - width * 0.15, y + height * 0.15); // inner-left
    ctx.lineTo(x + width * 0.15, y + height * 0.15); // inner-right
    ctx.lineTo(x + width / 2, y + height / 3); // bottom-right
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cockpit
    ctx.fillStyle = cockpitColor;
    ctx.beginPath();
    ctx.ellipse(x, y - height * 0.1, width * 0.12, height * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Draw a bullet.
   * @param {object} bullet
   * @param {string} [playerBulletColor] - optional override color for player bullets
   */
  drawBullet(bullet, playerBulletColor) {
    const { ctx } = this;
    const isPlayer = bullet.owner === 'player';
    const bulletColor = isPlayer
      ? (playerBulletColor || COLORS.PLAYER_BULLET)
      : COLORS.ENEMY_BULLET;

    ctx.save();
    ctx.fillStyle = bulletColor;

    if (isPlayer) {
      // Glowing line
      ctx.shadowColor = bulletColor;
      ctx.shadowBlur = 6;
      ctx.fillRect(
        bullet.x - bullet.width / 2,
        bullet.y - bullet.height / 2,
        bullet.width,
        bullet.height
      );
    } else {
      // Orange circle
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.width, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * Draw an enemy based on type.
   */
  drawEnemy(enemy) {
    const { ctx } = this;
    const { x, y, width, height, typeName, color } = enemy;

    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;

    switch (typeName) {
      case 'basic':
        this._drawDiamond(x, y, width, height);
        break;
      case 'shooter':
        this._drawPentagon(x, y, width / 2);
        break;
      case 'fast':
        this._drawTriangleDown(x, y, width, height);
        break;
      case 'boss':
        this._drawBoss(x, y, width, height, enemy.hp, enemy.maxHp);
        break;
      default:
        this._drawDiamond(x, y, width, height);
    }

    ctx.restore();
  }

  /**
   * Draw a power-up item (pulsing diamond shape).
   */
  drawPowerUp(powerUp) {
    const { ctx } = this;
    const { x, y, width, height, elapsed } = powerUp;

    ctx.save();

    const pulse = 0.6 + Math.sin(elapsed * 4) * 0.4;
    ctx.shadowColor = COLORS.POWERUP;
    ctx.shadowBlur = 10 * pulse;
    ctx.globalAlpha = 0.7 + pulse * 0.3;

    ctx.fillStyle = COLORS.POWERUP;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - height / 2);
    ctx.lineTo(x + width / 2, y);
    ctx.lineTo(x, y + height / 2);
    ctx.lineTo(x - width / 2, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('↑', x, y);
    ctx.restore();
  }

  _drawDiamond(x, y, w, h) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x, y - h / 2);
    ctx.lineTo(x + w / 2, y);
    ctx.lineTo(x, y + h / 2);
    ctx.lineTo(x - w / 2, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  _drawPentagon(x, y, r) {
    const { ctx } = this;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  _drawTriangleDown(x, y, w, h) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x - w / 2, y - h / 2);
    ctx.lineTo(x + w / 2, y - h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  _drawBoss(x, y, w, h, hp, maxHp) {
    const { ctx } = this;

    // Main body - hexagonal shape
    ctx.beginPath();
    const sides = 6;
    for (let i = 0; i < sides; i++) {
      const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
      const rx = w / 2;
      const ry = h / 2;
      const px = x + Math.cos(angle) * rx;
      const py = y + Math.sin(angle) * ry;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner detail
    ctx.fillStyle = '#880000';
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
      const px = x + Math.cos(angle) * (w * 0.25);
      const py = y + Math.sin(angle) * (h * 0.25);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // HP bar
    const barWidth = w + 10;
    const barHeight = 4;
    const barX = x - barWidth / 2;
    const barY = y - h / 2 - 10;

    ctx.fillStyle = '#333333';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(barX, barY, barWidth * (hp / maxHp), barHeight);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(barX, barY, barWidth, barHeight);
  }
}
