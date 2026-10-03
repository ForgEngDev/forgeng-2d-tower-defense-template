import { sprite2d } from "forgeng/2d";
import { FALLBACK_TEXTURE, MATERIAL, WORLD } from "./ids";

const MAX_ENEMIES = 40;
const MAX_PROJECTILES = 36;
const OFFSCREEN: readonly [number, number] = [-900, -900];

const PATH_CONTROL_POINTS: readonly (readonly [number, number])[] = [
  [-190, 66], [-142, 66], [-112, 25], [-58, 25], [-22, -42],
  [42, -42], [72, 18], [122, 18], [150, -24], [190, -24],
];

export const PATH: readonly (readonly [number, number])[] = sampleCatmullRom(PATH_CONTROL_POINTS, 10);

export const PADS: readonly (readonly [number, number])[] = [
  [-164, 22], [-108, 76], [-72, -18], [-18, 32],
  [30, -82], [72, 72], [116, -34], [164, 24],
];

interface Enemy { readonly index: number; x: number; y: number; pathIndex: number; hp: number; speed: number; bounty: number; active: boolean; }
interface Tower { readonly index: number; level: number; cooldown: number; active: boolean; }
interface Projectile { readonly index: number; x: number; y: number; vx: number; vy: number; damage: number; ttl: number; active: boolean; }

export interface BattlefieldStep { readonly destroyed: number; readonly earned: number; readonly escaped: number; readonly waveStarted: number | null; }
export interface BuildResult { readonly ok: boolean; readonly cost: number; readonly message: string; }

/** Owns the tower-defense simulation; ForgeNG sprites only mirror this state. */
export class Battlefield {
  private readonly enemies: Enemy[] = [];
  private readonly towers: Tower[] = [];
  private readonly projectiles: Projectile[] = [];
  private randomState = 0x7defe11d;
  private wave = 1;
  private waveRemaining = 0;
  private waveDelay = 90;
  private spawnTimer = 0;

  public constructor() {
    for (let index = 0; index < MAX_ENEMIES; index += 1) this.enemies.push({ index, x: OFFSCREEN[0], y: OFFSCREEN[1], pathIndex: 1, hp: 1, speed: 0.4, bounty: 8, active: false });
    for (let index = 0; index < PADS.length; index += 1) this.towers.push({ index, level: 0, cooldown: 0, active: false });
    for (let index = 0; index < MAX_PROJECTILES; index += 1) this.projectiles.push({ index, x: OFFSCREEN[0], y: OFFSCREEN[1], vx: 0, vy: 0, damage: 1, ttl: 0, active: false });
  }

  public createSprites() {
    return [
      ...createMapSprites(),
      ...this.towers.map((tower) => sprite2d({ id: `template.2d:tower-${tower.index}`, entity: towerEntityId(tower.index), layer: WORLD, texture: FALLBACK_TEXTURE, material: MATERIAL, size: [14, 14], tint: [0.3, 0.95, 0.78, 1], transform: { position: PADS[tower.index], rotation: Math.PI / 4, scale: [0, 0] } })),
      ...this.projectiles.map((projectile) => sprite2d({ id: `template.2d:projectile-${projectile.index}`, entity: projectileEntityId(projectile.index), layer: WORLD, texture: FALLBACK_TEXTURE, material: MATERIAL, size: [5, 5], tint: [1, 0.82, 0.28, 1], transform: { position: OFFSCREEN, rotation: Math.PI / 4, scale: [0, 0] } })),
      ...this.enemies.map((enemy) => sprite2d({ id: `template.2d:enemy-${enemy.index}`, entity: enemyEntityId(enemy.index), layer: WORLD, texture: FALLBACK_TEXTURE, material: MATERIAL, size: [12, 12], tint: enemy.index % 5 === 0 ? [1, 0.34, 0.4, 1] : [0.72, 0.36, 0.96, 1], transform: { position: OFFSCREEN, rotation: Math.PI / 4, scale: [0, 0] } })),
    ];
  }

  public step(): BattlefieldStep {
    let destroyed = 0;
    let earned = 0;
    let escaped = 0;
    let waveStarted: number | null = null;
    if (this.waveRemaining === 0 && this.activeEnemyCount() === 0) {
      this.waveDelay -= 1;
      if (this.waveDelay <= 0) { this.waveRemaining = 5 + this.wave * 2; this.spawnTimer = 0; waveStarted = this.wave; }
    }
    if (this.waveRemaining > 0) {
      this.spawnTimer -= 1;
      if (this.spawnTimer <= 0) { this.spawnEnemy(); this.waveRemaining -= 1; this.spawnTimer = Math.max(16, 43 - this.wave * 2); }
    }
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      const target = PATH[enemy.pathIndex];
      const dx = target[0] - enemy.x;
      const dy = target[1] - enemy.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= enemy.speed) {
        enemy.x = target[0]; enemy.y = target[1]; enemy.pathIndex += 1;
        if (enemy.pathIndex >= PATH.length) { this.hideEnemy(enemy); escaped += 1; }
      } else { enemy.x += dx / distance * enemy.speed; enemy.y += dy / distance * enemy.speed; }
    }
    for (const tower of this.towers) {
      if (!tower.active) continue;
      tower.cooldown = Math.max(0, tower.cooldown - 1);
      if (tower.cooldown > 0) continue;
      const target = this.nearestEnemy(PADS[tower.index], 61 + tower.level * 8);
      if (!target) continue;
      this.fire(PADS[tower.index], target, 1 + tower.level);
      tower.cooldown = Math.max(16, 48 - tower.level * 7);
    }
    for (const projectile of this.projectiles) {
      if (!projectile.active) continue;
      projectile.x += projectile.vx; projectile.y += projectile.vy; projectile.ttl -= 1;
      if (projectile.ttl <= 0) { this.hideProjectile(projectile); continue; }
      for (const enemy of this.enemies) {
        if (!enemy.active || squaredDistance([projectile.x, projectile.y], [enemy.x, enemy.y]) > 9 * 9) continue;
        enemy.hp -= projectile.damage;
        this.hideProjectile(projectile);
        if (enemy.hp <= 0) { earned += enemy.bounty; destroyed += 1; this.hideEnemy(enemy); }
        break;
      }
    }
    if (this.waveRemaining === 0 && this.activeEnemyCount() === 0 && this.waveDelay <= 0) { this.wave += 1; this.waveDelay = 150; }
    return Object.freeze({ destroyed, earned, escaped, waveStarted });
  }

  public buildAt(world: readonly [number, number], coins: number): BuildResult {
    const pad = this.closestPad(world);
    if (!pad || squaredDistance(world, PADS[pad.index]) > 18 * 18) return { ok: false, cost: 0, message: "Select a glowing build pad" };
    if (!pad.active) {
      const cost = this.getTowerCost();
      if (coins < cost) return { ok: false, cost: 0, message: `Need ${cost} coins to build` };
      pad.active = true; pad.level = 1; pad.cooldown = 10;
      return { ok: true, cost, message: "Tower built" };
    }
    const cost = this.getUpgradeCost(pad.index);
    if (pad.level >= 3) return { ok: false, cost: 0, message: "Tower is already max level" };
    if (coins < cost) return { ok: false, cost: 0, message: `Need ${cost} coins to upgrade` };
    pad.level += 1;
    return { ok: true, cost, message: `Tower upgraded to level ${pad.level}` };
  }

  public sync(setTransform: (entityId: string, transform: { position: readonly [number, number]; rotation: number; scale: readonly [number, number] }) => void): void {
    for (const tower of this.towers) { const scale = tower.active ? 0.82 + tower.level * 0.14 : 0; setTransform(towerEntityId(tower.index), { position: PADS[tower.index], rotation: Math.PI / 4, scale: [scale, scale] }); }
    for (const enemy of this.enemies) setTransform(enemyEntityId(enemy.index), { position: [enemy.x, enemy.y], rotation: Math.PI / 4, scale: enemy.active ? [1, 1] : [0, 0] });
    for (const projectile of this.projectiles) setTransform(projectileEntityId(projectile.index), { position: [projectile.x, projectile.y], rotation: Math.PI / 4, scale: projectile.active ? [1, 1] : [0, 0] });
  }

  public reset(): void {
    this.randomState = 0x7defe11d; this.wave = 1; this.waveRemaining = 0; this.waveDelay = 60; this.spawnTimer = 0;
    for (const enemy of this.enemies) this.hideEnemy(enemy);
    for (const projectile of this.projectiles) this.hideProjectile(projectile);
    for (const tower of this.towers) { tower.active = false; tower.level = 0; tower.cooldown = 0; }
  }

  public getWave(): number { return this.wave; }
  public getEnemiesRemaining(): number { return this.waveRemaining + this.activeEnemyCount(); }
  public getActiveEnemyCount(): number { return this.activeEnemyCount(); }
  public getTowerCount(): number { return this.towers.reduce((count, tower) => count + (tower.active ? 1 : 0), 0); }
  public getTowerCost(): number { return 40; }
  public getUpgradeCost(index: number): number { return 45 + this.towers[index].level * 25; }

  private spawnEnemy(): void {
    const enemy = this.enemies.find((candidate) => !candidate.active);
    if (!enemy) return;
    enemy.x = PATH[0][0]; enemy.y = PATH[0][1]; enemy.pathIndex = 1;
    enemy.hp = 2 + Math.floor(this.wave * 1.45);
    enemy.speed = 0.34 + Math.min(0.35, this.wave * 0.026) + this.nextRandom() * 0.05;
    enemy.bounty = 7 + this.wave; enemy.active = true;
  }

  private fire(origin: readonly [number, number], target: Enemy, damage: number): void {
    const projectile = this.projectiles.find((candidate) => !candidate.active);
    if (!projectile) return;
    const dx = target.x - origin[0]; const dy = target.y - origin[1]; const distance = Math.hypot(dx, dy) || 1;
    projectile.x = origin[0]; projectile.y = origin[1]; projectile.vx = dx / distance * 3.5; projectile.vy = dy / distance * 3.5; projectile.damage = damage; projectile.ttl = 32; projectile.active = true;
  }

  private nearestEnemy(origin: readonly [number, number], range: number): Enemy | null {
    let result: Enemy | null = null; let best = range * range;
    for (const enemy of this.enemies) { if (!enemy.active) continue; const distance = squaredDistance(origin, [enemy.x, enemy.y]); if (distance < best) { best = distance; result = enemy; } }
    return result;
  }

  private closestPad(point: readonly [number, number]): Tower | null {
    let result: Tower | null = null; let best = Number.POSITIVE_INFINITY;
    for (const tower of this.towers) { const distance = squaredDistance(point, PADS[tower.index]); if (distance < best) { best = distance; result = tower; } }
    return result;
  }

  private activeEnemyCount(): number { return this.enemies.reduce((count, enemy) => count + (enemy.active ? 1 : 0), 0); }
  private hideEnemy(enemy: Enemy): void { enemy.active = false; enemy.x = OFFSCREEN[0]; enemy.y = OFFSCREEN[1]; }
  private hideProjectile(projectile: Projectile): void { projectile.active = false; projectile.x = OFFSCREEN[0]; projectile.y = OFFSCREEN[1]; }
  private nextRandom(): number { this.randomState = (1664525 * this.randomState + 1013904223) >>> 0; return this.randomState / 0xffffffff; }
}

export function enemyEntityId(index: number): string { return `template.2d:enemy-${index}-entity`; }
export function towerEntityId(index: number): string { return `template.2d:tower-${index}-entity`; }
export function projectileEntityId(index: number): string { return `template.2d:projectile-${index}-entity`; }

function squaredDistance(a: readonly [number, number], b: readonly [number, number]): number { const dx = a[0] - b[0]; const dy = a[1] - b[1]; return dx * dx + dy * dy; }

function createMapSprites() {
  const sprites = [sprite2d({ id: "template.2d:background", entity: "template.2d:background-entity", layer: WORLD, texture: FALLBACK_TEXTURE, material: MATERIAL, size: [640, 360], tint: [0.035, 0.075, 0.09, 1], transform: { position: [0, 0], rotation: 0, scale: [1, 1] } })];
  const segments: Array<{ readonly length: number; readonly position: readonly [number, number]; readonly rotation: number }> = [];
  for (let index = 0; index < PATH.length - 1; index += 1) {
    const a = PATH[index]; const b = PATH[index + 1]; const dx = b[0] - a[0]; const dy = b[1] - a[1]; const length = Math.hypot(dx, dy) + 6;
    const position: readonly [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; const rotation = Math.atan2(dy, dx);
    segments.push({ length, position, rotation });
  }
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    sprites.push(sprite2d({ id: `template.2d:path-border-${index}`, entity: `template.2d:path-border-${index}-entity`, layer: WORLD, texture: FALLBACK_TEXTURE, material: MATERIAL, size: [segment.length, 27], tint: [0.11, 0.31, 0.29, 1], transform: { position: segment.position, rotation: segment.rotation, scale: [1, 1] } }));
  }
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    sprites.push(sprite2d({ id: `template.2d:path-${index}`, entity: `template.2d:path-${index}-entity`, layer: WORLD, texture: FALLBACK_TEXTURE, material: MATERIAL, size: [segment.length, 20], tint: [0.13, 0.17, 0.22, 1], transform: { position: segment.position, rotation: segment.rotation, scale: [1, 1] } }));
  }
  for (let index = 0; index < PADS.length; index += 1) {
    sprites.push(sprite2d({ id: `template.2d:pad-${index}`, entity: `template.2d:pad-${index}-entity`, layer: WORLD, texture: FALLBACK_TEXTURE, material: MATERIAL, size: [21, 21], tint: [0.12, 0.36, 0.34, 1], transform: { position: PADS[index], rotation: Math.PI / 4, scale: [1, 1] } }));
    sprites.push(sprite2d({ id: `template.2d:pad-core-${index}`, entity: `template.2d:pad-core-${index}-entity`, layer: WORLD, texture: FALLBACK_TEXTURE, material: MATERIAL, size: [13, 13], tint: [0.16, 0.55, 0.48, 0.72], transform: { position: PADS[index], rotation: Math.PI / 4, scale: [1, 1] } }));
  }
  sprites.push(sprite2d({ id: "template.2d:portal", entity: "template.2d:portal-entity", layer: WORLD, texture: FALLBACK_TEXTURE, material: MATERIAL, size: [18, 30], tint: [0.72, 0.36, 0.96, 1], transform: { position: PATH[0], rotation: 0, scale: [1, 1] } }));
  sprites.push(sprite2d({ id: "template.2d:base", entity: "template.2d:base-entity", layer: WORLD, texture: FALLBACK_TEXTURE, material: MATERIAL, size: [24, 30], tint: [1, 0.76, 0.25, 1], transform: { position: PATH[PATH.length - 1], rotation: Math.PI / 4, scale: [1, 1] } }));
  return sprites;
}

function sampleCatmullRom(points: readonly (readonly [number, number])[], stepsPerSection: number): readonly (readonly [number, number])[] {
  const sampled: Array<readonly [number, number]> = [];
  for (let section = 0; section < points.length - 1; section += 1) {
    const p0 = points[Math.max(0, section - 1)];
    const p1 = points[section];
    const p2 = points[section + 1];
    const p3 = points[Math.min(points.length - 1, section + 2)];
    for (let step = 0; step < stepsPerSection; step += 1) {
      const t = step / stepsPerSection;
      const t2 = t * t;
      const t3 = t2 * t;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      sampled.push([x, y]);
    }
  }
  sampled.push(points[points.length - 1]);
  return sampled;
}
