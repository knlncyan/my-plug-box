import { CANVAS_WIDTH, CANVAS_HEIGHT, COLORS, PLAYER_WIDTH, PLAYER_HEIGHT } from './constants.js';
import { Renderer } from './renderer.js';

/**
 * UI renderer for HUD, menus, and overlays.
 */
export class UI {
  constructor(ctx) {
    this.ctx = ctx;
  }

  /**
   * Draw the in-game HUD (score, lives, wave).
   */
  drawHUD(score, lives, wave, fireRateLevel = 0, burstMode = false, burstTimer = 0) {
    const { ctx } = this;

    ctx.save();

    // Score (top-left)
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.HUD_SCORE;
    ctx.fillText(`SCORE: ${score}`, 10, 10);

    // Wave (top-center)
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.HUD_TEXT;
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`WAVE ${wave}`, CANVAS_WIDTH / 2, 10);

    // Lives (top-right) - draw small hearts/ships
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.HUD_LIVES;
    const lifeSize = 10;
    for (let i = 0; i < lives; i++) {
      const lx = CANVAS_WIDTH - 15 - i * (lifeSize + 8);
      const ly = 16;
      // Small triangle for each life
      ctx.beginPath();
      ctx.moveTo(lx, ly - lifeSize);
      ctx.lineTo(lx - lifeSize / 2, ly);
      ctx.lineTo(lx + lifeSize / 2, ly);
      ctx.closePath();
      ctx.fill();
    }

    // Fire rate level indicator
    ctx.textAlign = 'left';
    ctx.font = '12px monospace';
    if (burstMode) {
      ctx.fillStyle = COLORS.POWERUP_BURST;
      ctx.fillText(`BURST ${burstTimer.toFixed(1)}s`, 10, 34);
    } else if (fireRateLevel > 0) {
      ctx.fillStyle = COLORS.POWERUP;
      ctx.fillText(`FIRE ${'I'.repeat(fireRateLevel)}`, 10, 34);
    }

    ctx.restore();
  }

  /**
   * Draw the menu screen.
   */
  drawMenu(highScore) {
    const { ctx } = this;

    ctx.save();

    // Dim background overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Title
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.MENU_TITLE;
    ctx.font = 'bold 42px monospace';
    ctx.fillText('飞机大战', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.3);

    // Subtitle
    ctx.fillStyle = COLORS.MENU_SUBTITLE;
    ctx.font = '16px monospace';
    ctx.fillText('AIRPLANE BATTLE', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.3 + 40);

    // Instructions
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px monospace';
    const startY = CANVAS_HEIGHT * 0.52;
    ctx.fillText('Press SPACE or Tap to Start', CANVAS_WIDTH / 2, startY);
    ctx.font = '12px monospace';
    ctx.fillStyle = COLORS.MENU_SUBTITLE;
    ctx.fillText('WASD / Arrow Keys to Move', CANVAS_WIDTH / 2, startY + 30);
    ctx.fillText('SPACE to Shoot', CANVAS_WIDTH / 2, startY + 50);
    ctx.fillText('Touch & Drag on Mobile', CANVAS_WIDTH / 2, startY + 70);

    // Skin select hint
    ctx.fillStyle = COLORS.MENU_TITLE;
    ctx.font = '12px monospace';
    ctx.fillText('按 C 选择配色 / Press C for Colors', CANVAS_WIDTH / 2, startY + 96);

    // High score
    if (highScore > 0) {
      ctx.fillStyle = COLORS.HUD_SCORE;
      ctx.font = 'bold 16px monospace';
      ctx.fillText(`HIGH SCORE: ${highScore}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.78);
    }

    // Version/credit
    ctx.fillStyle = '#555577';
    ctx.font = '10px monospace';
    ctx.fillText('HTML5 Canvas Game', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 20);

    ctx.restore();
  }

  /**
   * Draw the game over screen.
   */
  drawGameOver(score, highScore, isNewHigh) {
    const { ctx } = this;

    ctx.save();

    // Dim background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Game Over
    ctx.fillStyle = COLORS.GAME_OVER_TEXT;
    ctx.font = 'bold 36px monospace';
    ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.3);

    // Score
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`SCORE: ${score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.45);

    // High score
    ctx.fillStyle = COLORS.HUD_SCORE;
    ctx.font = '18px monospace';
    ctx.fillText(`HIGH SCORE: ${highScore}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.53);

    if (isNewHigh) {
      ctx.fillStyle = '#ffdd00';
      ctx.font = 'bold 16px monospace';
      ctx.fillText('NEW HIGH SCORE!', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.60);
    }

    // Restart instruction
    ctx.fillStyle = COLORS.MENU_SUBTITLE;
    ctx.font = '14px monospace';
    ctx.fillText('Press SPACE or Tap to Restart', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.72);
    ctx.fillText('按 M 返回主菜单', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.78);

    ctx.restore();
  }

  /**
   * Draw the pause menu overlay.
   */
  drawPauseMenu() {
    const { ctx } = this;
    ctx.save();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = COLORS.MENU_TITLE;
    ctx.font = 'bold 36px monospace';
    ctx.fillText('暂停', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.35);

    ctx.fillStyle = COLORS.HUD_TEXT;
    ctx.font = '14px monospace';
    ctx.fillText('按 ESC 或 SPACE 继续', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.50);

    ctx.fillStyle = COLORS.MENU_SUBTITLE;
    ctx.font = '14px monospace';
    ctx.fillText('按 M 返回主菜单', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.58);

    ctx.restore();
  }

  /**
   * Draw wave announcement.
   */
  drawWaveAnnouncement(wave, timer) {
    if (timer <= 0) return;
    const { ctx } = this;
    const alpha = Math.min(1, timer * 2);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px monospace';
    ctx.fillText(`WAVE ${wave}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.4);
    ctx.restore();
  }

  /**
   * Draw the skin selection screen.
   * @param {number} selectedIndex - currently highlighted skin index
   * @param {Array} skins - array of skin objects from PLAYER_SKINS
   */
  drawSkinSelect(selectedIndex, skins) {
    const { ctx } = this;

    ctx.save();

    // Full-screen dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Title
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.MENU_TITLE;
    ctx.font = 'bold 24px monospace';
    ctx.fillText('选择飞机配色', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.12);
    ctx.fillStyle = COLORS.MENU_SUBTITLE;
    ctx.font = '12px monospace';
    ctx.fillText('SELECT COLOR SCHEME', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.12 + 26);

    // Layout: up to 5 skins, distributed horizontally
    const count = skins.length;
    const previewW = PLAYER_WIDTH * 2.4;
    const previewH = PLAYER_HEIGHT * 2.4;
    const spacing = CANVAS_WIDTH / (count + 1);
    const centerY = CANVAS_HEIGHT * 0.44;

    for (let i = 0; i < count; i++) {
      const skin = skins[i];
      const cx = spacing * (i + 1);
      const isSelected = i === selectedIndex;

      ctx.save();

      // Selection highlight / glow border
      if (isSelected) {
        ctx.shadowColor = skin.body;
        ctx.shadowBlur = 18;
        ctx.strokeStyle = skin.body;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - previewW / 2 - 4, centerY - previewH / 2 - 4, previewW + 8, previewH + 8);
        ctx.shadowBlur = 0;
      } else {
        ctx.strokeStyle = '#333355';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - previewW / 2 - 4, centerY - previewH / 2 - 4, previewW + 8, previewH + 8);
      }

      // Draw mini airplane — scale around cx, centerY
      const scale = 2.0;
      const pw = PLAYER_WIDTH * scale;
      const ph = PLAYER_HEIGHT * scale;
      const alpha = isSelected ? 1.0 : 0.55;

      Renderer.drawPlayerShape(ctx, cx, centerY, pw, ph, skin, alpha);

      ctx.restore();

      // Skin name below preview
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = isSelected ? 'bold 13px monospace' : '11px monospace';
      ctx.fillStyle = isSelected ? skin.body : COLORS.MENU_SUBTITLE;
      ctx.fillText(skin.name, cx, centerY + previewH / 2 + 10);
      ctx.font = '10px monospace';
      ctx.fillStyle = '#555577';
      ctx.fillText(skin.label, cx, centerY + previewH / 2 + 26);
    }

    // Navigation hints
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.MENU_SUBTITLE;
    ctx.font = '13px monospace';
    ctx.fillText('← → 选择   Space 确认   Esc 返回', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.82);

    ctx.restore();
  }
}
