export interface RectCollider {
  type: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CircleCollider {
  type: 'circle';
  x: number;
  y: number;
  r: number;
}

export type Collider = RectCollider | CircleCollider;

export interface BuildingZone {
  id: 'elephantology' | 'elephantorina';
  title: string;
  doorX: number;
  doorY: number;
  interactRadius: number;
  bounds: { x: number; y: number; w: number; h: number };
}

export function clampToWorld(
  x: number,
  y: number,
  radius: number,
  worldW: number,
  worldH: number,
  margin = 48
): { x: number; y: number } {
  const minX = margin + radius;
  const maxX = worldW - margin - radius;
  const minY = margin + radius;
  const maxY = worldH - margin - radius;
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
}

export function resolveCircleRect(
  cx: number,
  cy: number,
  cr: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): { x: number; y: number; collided: boolean } {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq >= cr * cr) {
    return { x: cx, y: cy, collided: false };
  }

  const dist = Math.sqrt(distSq);
  if (dist > 0.0001) {
    const overlap = cr - dist;
    return {
      x: cx + (dx / dist) * overlap,
      y: cy + (dy / dist) * overlap,
      collided: true,
    };
  }

  // Center is inside the rectangle
  const leftPen = cx - rx;
  const rightPen = rx + rw - cx;
  const topPen = cy - ry;
  const bottomPen = ry + rh - cy;
  const minPen = Math.min(leftPen, rightPen, topPen, bottomPen);

  if (minPen === leftPen) return { x: rx - cr, y: cy, collided: true };
  if (minPen === rightPen) return { x: rx + rw + cr, y: cy, collided: true };
  if (minPen === topPen) return { x: cx, y: ry - cr, collided: true };
  return { x: cx, y: ry + rh + cr, collided: true };
}

export function resolveCircleCircle(
  cx: number,
  cy: number,
  cr: number,
  ox: number,
  oy: number,
  or: number
): { x: number; y: number; collided: boolean } {
  const dx = cx - ox;
  const dy = cy - oy;
  const minDist = cr + or;
  const distSq = dx * dx + dy * dy;

  if (distSq >= minDist * minDist) {
    return { x: cx, y: cy, collided: false };
  }

  const dist = Math.sqrt(distSq);
  if (dist > 0.0001) {
    const overlap = minDist - dist;
    return {
      x: cx + (dx / dist) * overlap,
      y: cy + (dy / dist) * overlap,
      collided: true,
    };
  }

  return { x: ox + minDist, y: oy, collided: true };
}

export function resolveAllCollisions(
  x: number,
  y: number,
  radius: number,
  colliders: Collider[],
  worldW: number,
  worldH: number
): { x: number; y: number; hitAny: boolean } {
  let curX = x;
  let curY = y;
  let hitAny = false;

  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      if (c.type === 'rect') {
        const res = resolveCircleRect(curX, curY, radius, c.x, c.y, c.w, c.h);
        curX = res.x;
        curY = res.y;
        if (res.collided) hitAny = true;
      } else {
        const res = resolveCircleCircle(curX, curY, radius, c.x, c.y, c.r);
        curX = res.x;
        curY = res.y;
        if (res.collided) hitAny = true;
      }
    }
  }

  const clamped = clampToWorld(curX, curY, radius, worldW, worldH);
  return { x: clamped.x, y: clamped.y, hitAny };
}

export function findActiveBuilding(
  px: number,
  py: number,
  buildings: BuildingZone[]
): BuildingZone | null {
  let closest: BuildingZone | null = null;
  let bestDist = Infinity;

  for (const b of buildings) {
    const d = Math.hypot(px - b.doorX, py - b.doorY);
    if (d <= b.interactRadius && d < bestDist) {
      bestDist = d;
      closest = b;
    }
  }
  return closest;
}

export type DogState = 'follow' | 'idle' | 'sit' | 'look_around';

export function evaluateDogState(
  dogX: number,
  dogY: number,
  playerX: number,
  playerY: number,
  playerSpeed: number,
  currentState: DogState,
  stateTimer: number
): { nextState: DogState; shouldMove: boolean } {
  const distToPlayer = Math.hypot(playerX - dogX, playerY - dogY);

  // If player moved far enough away, dog always wakes up and follows
  if (distToPlayer > 105) {
    return { nextState: 'follow', shouldMove: true };
  }

  // If close to player and player is stopped
  if (distToPlayer < 64 && playerSpeed < 15) {
    if (currentState === 'follow') {
      return { nextState: 'idle', shouldMove: false };
    }
    if (currentState === 'idle' && stateTimer > 2.2) {
      return { nextState: 'sit', shouldMove: false };
    }
    return { nextState: currentState, shouldMove: false };
  }

  if (currentState === 'follow' && distToPlayer > 56) {
    return { nextState: 'follow', shouldMove: true };
  }

  return { nextState: currentState, shouldMove: currentState === 'follow' };
}
