import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampToWorld,
  resolveCircleRect,
  resolveCircleCircle,
  resolveAllCollisions,
  findActiveBuilding,
  evaluateDogState,
  type BuildingZone,
  type Collider,
} from './campusLogic';

test('clampToWorld restricts coordinates within world margins', () => {
  const res1 = clampToWorld(-50, 2500, 16, 2400, 1800, 48);
  assert.equal(res1.x, 64);
  assert.equal(res1.y, 1800 - 64);

  const res2 = clampToWorld(1200, 900, 16, 2400, 1800, 48);
  assert.equal(res2.x, 1200);
  assert.equal(res2.y, 900);
});

test('resolveCircleRect pushes circle out of AABB obstacle smoothly', () => {
  // Circle overlapping left edge of building at x=500, y=400, w=300, h=200
  const hit = resolveCircleRect(490, 500, 20, 500, 400, 300, 200);
  assert.equal(hit.collided, true);
  assert.equal(Math.round(hit.x), 480);
  assert.equal(hit.y, 500);

  // Circle far away
  const miss = resolveCircleRect(400, 500, 20, 500, 400, 300, 200);
  assert.equal(miss.collided, false);
  assert.equal(miss.x, 400);
});

test('resolveCircleCircle separates overlapping circles', () => {
  const res = resolveCircleCircle(100, 100, 15, 110, 100, 15);
  assert.equal(res.collided, true);
  assert.equal(Math.round(res.x), 80);
  assert.equal(res.y, 100);
});

test('resolveAllCollisions resolves multi-collider corners and world bounds', () => {
  const colliders: Collider[] = [
    { type: 'rect', x: 400, y: 300, w: 360, h: 220 },
    { type: 'circle', x: 900, y: 600, r: 30 },
  ];
  const r = resolveAllCollisions(395, 410, 16, colliders, 2400, 1800);
  assert.equal(r.hitAny, true);
  assert.equal(Math.round(r.x), 384);
});

test('findActiveBuilding detects Elephantology and Elephantorina entrance proximity', () => {
  const buildings: BuildingZone[] = [
    {
      id: 'elephantology',
      title: 'ELEPHANTOLOGY',
      doorX: 640,
      doorY: 640,
      interactRadius: 85,
      bounds: { x: 450, y: 360, w: 380, h: 250 },
    },
    {
      id: 'elephantorina',
      title: 'ELEPHANTORINA',
      doorX: 1760,
      doorY: 640,
      interactRadius: 85,
      bounds: { x: 1570, y: 360, w: 380, h: 250 },
    },
  ];

  assert.equal(findActiveBuilding(1200, 1000, buildings), null);
  const b1 = findActiveBuilding(640, 690, buildings);
  assert.equal(b1?.id, 'elephantology');

  const b2 = findActiveBuilding(1750, 680, buildings);
  assert.equal(b2?.id, 'elephantorina');
});

test('evaluateDogState transitions companion between follow, idle, and sit naturally', () => {
  // Player far away -> dog follows
  const s1 = evaluateDogState(100, 100, 300, 100, 180, 'sit', 5.0);
  assert.equal(s1.nextState, 'follow');
  assert.equal(s1.shouldMove, true);

  // Player stops nearby -> dog transitions from follow to idle
  const s2 = evaluateDogState(100, 100, 130, 100, 0, 'follow', 0.5);
  assert.equal(s2.nextState, 'idle');
  assert.equal(s2.shouldMove, false);

  // Player remains stopped -> dog sits after idle timer
  const s3 = evaluateDogState(100, 100, 130, 100, 0, 'idle', 2.5);
  assert.equal(s3.nextState, 'sit');
  assert.equal(s3.shouldMove, false);
});
