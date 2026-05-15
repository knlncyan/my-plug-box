import { CANVAS_WIDTH, CANVAS_HEIGHT, MAX_DELTA_TIME } from './game/constants.js';
import { Game } from './game/game.js';
import { InputHandler } from './game/input.js';

export function mountAirportWar(rootElement) {
  if (!rootElement) {
    throw new Error('airport-war root element not found');
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'airport-war-canvas';
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  rootElement.replaceChildren(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2D rendering context');
  }

  ctx.imageSmoothingEnabled = false;

  const input = new InputHandler(canvas);
  const game = new Game(ctx, input);

  let disposed = false;
  let frameId = 0;
  let lastTime = performance.now();

  function gameLoop(timestamp) {
    if (disposed) return;

    let dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if (dt > MAX_DELTA_TIME) {
      dt = MAX_DELTA_TIME;
    }

    game.update(dt);
    game.render();

    frameId = requestAnimationFrame(gameLoop);
  }

  frameId = requestAnimationFrame(gameLoop);

  return () => {
    disposed = true;
    cancelAnimationFrame(frameId);
    try {
      game.scoreManager?.save?.();
    } catch {
      // ignore score persistence cleanup failures
    }
    try {
      input.destroy?.();
    } catch {
      // ignore input cleanup failures
    }
    try {
      game.audio?.destroy?.();
    } catch {
      // ignore audio cleanup failures
    }
    rootElement.replaceChildren();
  };
}
