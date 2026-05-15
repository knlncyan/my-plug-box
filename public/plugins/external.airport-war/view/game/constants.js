// Canvas dimensions (logical resolution)
export const CANVAS_WIDTH = 400;
export const CANVAS_HEIGHT = 600;

// Player constants
export const PLAYER_SPEED = 250; // pixels per second
export const PLAYER_WIDTH = 30;
export const PLAYER_HEIGHT = 36;
export const PLAYER_LIVES = 3;
export const FIRE_RATE_INITIAL_COOLDOWN = 0.35;
export const FIRE_RATE_COOLDOWN_REDUCTION = 0.05;
export const FIRE_RATE_MIN_COOLDOWN = 0.10;
export const FIRE_RATE_MAX_LEVEL = 5;

export const BURST_MODE_DURATION = 5.0;
export const BURST_MODE_COOLDOWN = 0.06;

export const POWERUP_SPAWN_INTERVAL_MIN = 8.0;
export const POWERUP_SPAWN_INTERVAL_MAX = 15.0;
export const POWERUP_FALL_SPEED = 80;
export const POWERUP_WIDTH = 20;
export const POWERUP_HEIGHT = 20;
export const POWERUP_SCORE = 50;
export const PLAYER_INVINCIBILITY_DURATION = 2.0; // seconds
export const PLAYER_INVINCIBILITY_FLASH_RATE = 0.1; // seconds per flash toggle

// Bullet constants
export const BULLET_SPEED = 450; // pixels per second
export const BULLET_WIDTH = 4;
export const BULLET_HEIGHT = 10;
export const ENEMY_BULLET_SPEED = 200;
export const ENEMY_BULLET_WIDTH = 5;
export const ENEMY_BULLET_HEIGHT = 8;

// Enemy types configuration
export const ENEMY_TYPES = {
  BASIC: {
    name: 'basic',
    width: 24,
    height: 24,
    hp: 1,
    speed: 100,
    score: 100,
    color: '#ff3333',
    shootCooldown: 3.5,
  },
  SHOOTER: {
    name: 'shooter',
    width: 28,
    height: 28,
    hp: 2,
    speed: 60,
    score: 200,
    color: '#ff5500',
    shootCooldown: 2.0,
  },
  FAST: {
    name: 'fast',
    width: 18,
    height: 18,
    hp: 1,
    speed: 180,
    score: 150,
    color: '#ffaa00',
    zigzagAmplitude: 60,
    zigzagFrequency: 2.5,
    shootCooldown: 4.5,
  },
  BOSS: {
    name: 'boss',
    width: 60,
    height: 50,
    hp: 25,
    speed: 30,
    score: 1000,
    color: '#cc0000',
    shootCooldown: 1.5,
    targetY: 80,
  },
};

// Spawner constants
export const WAVE_BASE_ENEMIES = 5;
export const WAVE_ENEMY_INCREMENT = 2;
export const WAVE_DELAY = 2.0; // seconds between waves
export const BOSS_WAVE_INTERVAL = 5; // boss every N waves
export const SPAWN_INTERVAL_BASE = 1.2; // seconds between spawns
export const SPAWN_INTERVAL_MIN = 0.4;
export const DIFFICULTY_SCALE = 0.05; // spawn interval decrease per wave

// Particle constants
export const PARTICLE_COUNT_SMALL = 8;
export const PARTICLE_COUNT_LARGE = 20;
export const PARTICLE_LIFETIME = 0.6; // seconds
export const PARTICLE_SPEED_MIN = 50;
export const PARTICLE_SPEED_MAX = 200;

// Star background
export const STAR_COUNT = 80;
export const STAR_SPEED_MIN = 20;
export const STAR_SPEED_MAX = 100;
export const STAR_SIZE_MIN = 1;
export const STAR_SIZE_MAX = 3;

// Colors
export const COLORS = {
  BACKGROUND: '#0a0a2e',
  PLAYER: '#00ddff',
  PLAYER_ENGINE: '#00aaff',
  PLAYER_COCKPIT: '#004466',
  PLAYER_BULLET: '#00ffff',
  ENEMY_BULLET: '#ff6600',
  HUD_TEXT: '#ffffff',
  HUD_SCORE: '#ffdd00',
  HUD_LIVES: '#ff4444',
  MENU_TITLE: '#00ddff',
  MENU_SUBTITLE: '#aaaacc',
  GAME_OVER_TEXT: '#ff4444',
  STAR: '#ffffff',
  PARTICLE_COLORS: ['#ff6600', '#ffaa00', '#ffdd00', '#ffffff', '#ff3300'],
  POWERUP: '#00ff88',
  POWERUP_BURST: '#ff00ff',
};

// Game states
export const GAME_STATE = {
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  GAME_OVER: 'GAME_OVER',
  SKIN_SELECT: 'SKIN_SELECT',
};

// Player skin / color scheme definitions
export const PLAYER_SKINS = [
  {
    id: 'cyan',
    name: '冰蓝',
    label: 'Cyan',
    body: '#00ddff',
    engine: '#00aaff',
    bullet: '#00ffff',
    cockpit: '#004466',
  },
  {
    id: 'crimson',
    name: '赤焰',
    label: 'Crimson',
    body: '#ff3355',
    engine: '#ff0022',
    bullet: '#ff6688',
    cockpit: '#440011',
  },
  {
    id: 'gold',
    name: '烈金',
    label: 'Gold',
    body: '#ffcc00',
    engine: '#ff8800',
    bullet: '#ffee44',
    cockpit: '#443300',
  },
  {
    id: 'emerald',
    name: '翠绿',
    label: 'Emerald',
    body: '#00ff88',
    engine: '#00cc44',
    bullet: '#44ffaa',
    cockpit: '#004422',
  },
  {
    id: 'violet',
    name: '星紫',
    label: 'Violet',
    body: '#cc44ff',
    engine: '#8800ff',
    bullet: '#dd88ff',
    cockpit: '#330044',
  },
];

// localStorage key for skin persistence
export const STORAGE_KEY_SKIN = 'airplane_battle_skin';

// Delta time cap (prevent spiral of death)
export const MAX_DELTA_TIME = 0.05; // 50ms = 20fps minimum
