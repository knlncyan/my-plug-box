/**
 * Collision detection module using AABB (Axis-Aligned Bounding Box).
 * All functions are pure - no side effects.
 */

/**
 * Check if two axis-aligned bounding boxes overlap.
 * @param {{x: number, y: number, width: number, height: number}} a
 * @param {{x: number, y: number, width: number, height: number}} b
 * @returns {boolean}
 */
export function aabbOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Check collision between two entities (using center-based coords).
 * @param {import('./entities/entity.js').Entity} entityA
 * @param {import('./entities/entity.js').Entity} entityB
 * @returns {boolean}
 */
export function entitiesCollide(entityA, entityB) {
  if (!entityA.alive || !entityB.alive) return false;
  return aabbOverlap(entityA.getBounds(), entityB.getBounds());
}

/**
 * Find all collisions between two arrays of entities.
 * Returns array of [indexA, indexB] pairs.
 * @param {import('./entities/entity.js').Entity[]} groupA
 * @param {import('./entities/entity.js').Entity[]} groupB
 * @returns {Array<[number, number]>}
 */
export function findCollisions(groupA, groupB) {
  const collisions = [];
  for (let i = 0; i < groupA.length; i++) {
    if (!groupA[i].alive) continue;
    for (let j = 0; j < groupB.length; j++) {
      if (!groupB[j].alive) continue;
      if (aabbOverlap(groupA[i].getBounds(), groupB[j].getBounds())) {
        collisions.push([i, j]);
      }
    }
  }
  return collisions;
}
