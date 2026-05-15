import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GAME_STATE,
  PARTICLE_COUNT_SMALL,
  PARTICLE_COUNT_LARGE,
  COLORS,
  POWERUP_SPAWN_INTERVAL_MIN,
  POWERUP_SPAWN_INTERVAL_MAX,
  POWERUP_HEIGHT,
  POWERUP_SCORE,
  PLAYER_SKINS,
} from './constants.js';
import { Player } from './entities/player.js';
import { PowerUp } from './entities/powerup.js';
import { entitiesCollide, findCollisions } from './collision.js';
import { ParticleSystem, StarField } from './effects.js';
import { Spawner } from './spawner.js';
import { Renderer } from './renderer.js';
import { UI } from './ui.js';
import { ScoreManager } from './score.js';
import { AudioManager } from './audio.js';
import { SkinManager } from './skin.js';

/**
 * Main Game class - state machine with update/render loop.
 */
export class Game {
  constructor(ctx, input) {
    this.ctx = ctx;
    this.input = input;
    this.renderer = new Renderer(ctx);
    this.ui = new UI(ctx);
    this.audio = new AudioManager();
    this.scoreManager = new ScoreManager();

    this.skinManager = new SkinManager();
    this.selectedSkinIndex = this.skinManager.getActiveIndex();

    this.state = GAME_STATE.MENU;
    this.player = new Player();
    this.playerBullets = [];
    this.enemyBullets = [];
    this.enemies = [];
    this.particles = new ParticleSystem();
    this.starField = new StarField();
    this.spawner = new Spawner();

    this.waveAnnouncementTimer = 0;
    this.powerUps = [];
    this.powerUpSpawnTimer = 0;

    // Set up action handler for menu/restart
    this.input.onAction = (fromKeyboard) => this._handleAction(fromKeyboard);
    this.input.onPause = () => this._handlePause();
    this.input.onMenu = () => this._handleMenu();

    // Skin select input handlers
    this.input.onSkinSelect = () => this._handleSkinSelect();
    this.input.onSkinNav = null;     // only active during SKIN_SELECT state
    this.input.onSkinConfirm = null; // only active during SKIN_SELECT state
  }

  _handleAction(fromKeyboard = false) {
    if (this.state === GAME_STATE.MENU || this.state === GAME_STATE.GAME_OVER) {
      this.audio.init();
      this._startGame();
    } else if (this.state === GAME_STATE.PAUSED && fromKeyboard) {
      this.state = GAME_STATE.PLAYING;
    }
  }

  _handlePause() {
    if (this.state === GAME_STATE.SKIN_SELECT) {
      this._handleSkinBack();
    } else if (this.state === GAME_STATE.PLAYING) {
      this.state = GAME_STATE.PAUSED;
    } else if (this.state === GAME_STATE.PAUSED) {
      this.state = GAME_STATE.PLAYING;
    }
  }

  _handleMenu() {
    if (this.state === GAME_STATE.PAUSED || this.state === GAME_STATE.GAME_OVER) {
      this.scoreManager.save();
      this.state = GAME_STATE.MENU;
      this.player.reset();
      this.playerBullets = [];
      this.enemyBullets = [];
      this.enemies = [];
      this.particles = new ParticleSystem();
      this.spawner.reset();
      this.waveAnnouncementTimer = 0;
      this.powerUps = [];
      this.powerUpSpawnTimer = 0;
    }
  }

  _handleSkinSelect() {
    if (this.state === GAME_STATE.MENU) {
      this.selectedSkinIndex = this.skinManager.getActiveIndex();
      this.state = GAME_STATE.SKIN_SELECT;
      // Enable skin confirm/nav while in skin select
      this.input.onSkinNav = (dir) => this._handleSkinNav(dir);
      this.input.onSkinConfirm = () => this._handleSkinConfirm();
    }
  }

  _handleSkinNav(dir) {
    if (this.state !== GAME_STATE.SKIN_SELECT) return;
    if (dir === 'left') {
      this.selectedSkinIndex = (this.selectedSkinIndex - 1 + PLAYER_SKINS.length) % PLAYER_SKINS.length;
    } else if (dir === 'right') {
      this.selectedSkinIndex = (this.selectedSkinIndex + 1) % PLAYER_SKINS.length;
    }
  }

  _handleSkinConfirm() {
    if (this.state !== GAME_STATE.SKIN_SELECT) return;
    this.skinManager.setActiveSkin(this.selectedSkinIndex);
    this.input.onSkinNav = null;
    this.input.onSkinConfirm = null;
    this.state = GAME_STATE.MENU;
  }

  _handleSkinBack() {
    if (this.state !== GAME_STATE.SKIN_SELECT) return;
    this.input.onSkinNav = null;
    this.input.onSkinConfirm = null;
    this.state = GAME_STATE.MENU;
  }

  _startGame() {
    this.state = GAME_STATE.PLAYING;
    this.player.reset();
    this.playerBullets = [];
    this.enemyBullets = [];
    this.enemies = [];
    this.particles = new ParticleSystem();
    this.spawner.reset();
    this.scoreManager.reset();
    this.waveAnnouncementTimer = 0;
    this.powerUps = [];
    this.powerUpSpawnTimer = POWERUP_SPAWN_INTERVAL_MIN + Math.random() * (POWERUP_SPAWN_INTERVAL_MAX - POWERUP_SPAWN_INTERVAL_MIN);

    // Start first wave
    this.spawner.startNextWave();
    this.waveAnnouncementTimer = 1.5;
  }

  /**
   * Main update function called each frame.
   * @param {number} dt - delta time in seconds
   */
  update(dt) {
    // Always update background
    this.starField.update(dt);

    if (this.state !== GAME_STATE.PLAYING) return;

    // Update input state
    this.input.update(this.player);

    // Update player
    this.player.update(dt, this.input.state);

    // Auto-fire
    const shootResult = this.player.shoot();
    if (shootResult) {
      if (Array.isArray(shootResult)) {
        this.playerBullets.push(...shootResult);
      } else {
        this.playerBullets.push(shootResult);
      }
      this.audio.playShoot();
    }

    // Update player bullets
    for (const b of this.playerBullets) {
      b.update(dt);
    }
    this.playerBullets = this.playerBullets.filter((b) => b.alive);

    // Update enemies
    for (const enemy of this.enemies) {
      const result = enemy.update(dt);
      if (result) {
        if (Array.isArray(result)) {
          this.enemyBullets.push(...result);
        } else {
          this.enemyBullets.push(result);
        }
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive);

    // Update enemy bullets
    for (const b of this.enemyBullets) {
      b.update(dt);
    }
    this.enemyBullets = this.enemyBullets.filter((b) => b.alive);

    // Update power-ups
    for (const p of this.powerUps) {
      p.update(dt);
    }
    this.powerUps = this.powerUps.filter((p) => p.alive);

    // Update particles
    this.particles.update(dt);

    // --- Collision Detection ---

    // Player bullets vs enemies
    const bulletEnemyHits = findCollisions(this.playerBullets, this.enemies);
    for (const [bi, ei] of bulletEnemyHits) {
      const bullet = this.playerBullets[bi];
      const enemy = this.enemies[ei];
      if (!bullet.alive || !enemy.alive) continue;

      bullet.destroy();
      const destroyed = enemy.takeDamage(bullet.damage);
      if (destroyed) {
        this.scoreManager.add(enemy.score);
        const count =
          enemy.typeName === 'boss' ? PARTICLE_COUNT_LARGE : PARTICLE_COUNT_SMALL;
        this.particles.explode(enemy.x, enemy.y, count);
        this.audio.playExplosion(enemy.typeName === 'boss');
        if (enemy.typeName === 'boss') {
          this.spawner.onBossKilled();
        }
      }
    }

    // Enemy bullets vs player
    if (!this.player.isInvincible) {
      for (const bullet of this.enemyBullets) {
        if (!bullet.alive) continue;
        if (entitiesCollide(bullet, this.player)) {
          bullet.destroy();
          this.player.hit();
          this.audio.playHit();
          this.particles.explode(
            this.player.x,
            this.player.y,
            PARTICLE_COUNT_SMALL
          );
          if (!this.player.alive) {
            this._gameOver();
            return;
          }
          break;
        }
      }
    }

    // Enemies vs player (collision damage)
    if (!this.player.isInvincible) {
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        if (entitiesCollide(enemy, this.player)) {
          enemy.takeDamage(999);
          this.scoreManager.add(enemy.score);
          this.particles.explode(enemy.x, enemy.y, PARTICLE_COUNT_SMALL);
          this.audio.playExplosion(enemy.typeName === 'boss');
          if (enemy.typeName === 'boss') {
            this.spawner.onBossKilled();
          }
          this.player.hit();
          this.audio.playHit();
          if (!this.player.alive) {
            this._gameOver();
            return;
          }
          break;
        }
      }
    }

    // Power-ups vs player
    for (const powerUp of this.powerUps) {
      if (!powerUp.alive) continue;
      if (entitiesCollide(powerUp, this.player)) {
        powerUp.destroy();
        const result = this.player.collectPowerUp();
        this.scoreManager.add(POWERUP_SCORE);
        if (result === 'burst') {
          this.audio.playBurstActivate();
        } else {
          this.audio.playPowerUp();
        }
        this.particles.explode(powerUp.x, powerUp.y, PARTICLE_COUNT_SMALL);
        break;
      }
    }

    // --- Spawner ---
    const newEnemies = this.spawner.update(dt);
    this.enemies.push(...newEnemies);

    // Power-up spawning
    this.powerUpSpawnTimer -= dt;
    if (this.powerUpSpawnTimer <= 0) {
      this.powerUpSpawnTimer = POWERUP_SPAWN_INTERVAL_MIN + Math.random() * (POWERUP_SPAWN_INTERVAL_MAX - POWERUP_SPAWN_INTERVAL_MIN);
      const x = 30 + Math.random() * (CANVAS_WIDTH - 60);
      this.powerUps.push(new PowerUp(x, -POWERUP_HEIGHT));
    }

    // Check if wave is complete
    if (
      this.spawner.enemiesRemaining <= 0 &&
      !this.spawner.inWaveDelay &&
      this.enemies.length === 0
    ) {
      this.audio.playWaveComplete();
      this.spawner.startNextWave();
      this.waveAnnouncementTimer = 1.5;
    }

    // Wave announcement timer
    if (this.waveAnnouncementTimer > 0) {
      this.waveAnnouncementTimer -= dt;
    }
  }

  _gameOver() {
    this.state = GAME_STATE.GAME_OVER;
    this.scoreManager.save();
    this.particles.explode(this.player.x, this.player.y, PARTICLE_COUNT_LARGE);
    this.audio.playExplosion(true);
  }

  /**
   * Main render function called each frame.
   */
  render() {
    const { ctx } = this;

    // Clear with background color
    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Star background
    this.starField.render(ctx);

    const activeSkin = this.skinManager.getActiveSkin();

    if (this.state === GAME_STATE.PLAYING) {
      // Draw player
      this.renderer.drawPlayer(this.player, activeSkin);

      // Draw player bullets
      for (const b of this.playerBullets) {
        this.renderer.drawBullet(b, activeSkin.bullet);
      }

      // Draw enemies
      for (const e of this.enemies) {
        this.renderer.drawEnemy(e);
      }

      // Draw enemy bullets
      for (const b of this.enemyBullets) {
        this.renderer.drawBullet(b);
      }

      // Draw power-ups
      for (const p of this.powerUps) {
        this.renderer.drawPowerUp(p);
      }

      // Draw particles
      this.particles.render(ctx);

      // Draw HUD
      this.ui.drawHUD(
        this.scoreManager.getScore(),
        this.player.lives,
        this.spawner.wave,
        this.player.fireRateLevel,
        this.player.burstMode,
        this.player.burstTimer
      );

      // Draw wave announcement
      this.ui.drawWaveAnnouncement(this.spawner.wave, this.waveAnnouncementTimer);
    } else if (this.state === GAME_STATE.PAUSED) {
      this.renderer.drawPlayer(this.player, activeSkin);
      for (const b of this.playerBullets) {
        this.renderer.drawBullet(b, activeSkin.bullet);
      }
      for (const e of this.enemies) {
        this.renderer.drawEnemy(e);
      }
      for (const b of this.enemyBullets) {
        this.renderer.drawBullet(b);
      }
      // Draw power-ups
      for (const p of this.powerUps) {
        this.renderer.drawPowerUp(p);
      }
      this.particles.render(ctx);
      this.ui.drawHUD(
        this.scoreManager.getScore(),
        this.player.lives,
        this.spawner.wave,
        this.player.fireRateLevel,
        this.player.burstMode,
        this.player.burstTimer
      );
      this.ui.drawPauseMenu();
    } else if (this.state === GAME_STATE.MENU) {
      // Particles still render on menu for visual flair
      this.particles.render(ctx);
      this.ui.drawMenu(this.scoreManager.getHighScore());
    } else if (this.state === GAME_STATE.GAME_OVER) {
      // Show frozen game state behind overlay
      this.renderer.drawPlayer(this.player, activeSkin);
      for (const e of this.enemies) {
        this.renderer.drawEnemy(e);
      }
      this.particles.render(ctx);
      this.ui.drawGameOver(
        this.scoreManager.getScore(),
        this.scoreManager.getHighScore(),
        this.scoreManager.isNewHighScore
      );
    } else if (this.state === GAME_STATE.SKIN_SELECT) {
      this.particles.render(ctx);
      this.ui.drawSkinSelect(this.selectedSkinIndex, PLAYER_SKINS);
    }
  }
}
