import type { Forge2dGame, Forge2dSceneDefinition, Forge2dSceneFacade } from "forgeng/presets/2d";
import type { UiShellLike } from "@forgeng/ui-dom";
import { Battlefield } from "./battlefield";
import { Controller } from "./controller";
import { Hud } from "./hud";
import { SCENE_ID } from "./ids";
import { createRenderDefinition } from "./render";

export type RunState = "playing" | "game-over";

/** Tower-defense loop: build, upgrade, defend the base, and survive escalating waves. */
export class MainScene {
  private readonly battlefield = new Battlefield();
  private readonly controller = new Controller();
  private readonly hud = new Hud();
  private scene: Forge2dSceneFacade | null = null;
  private state: RunState = "playing";
  private coins = 100;
  private lives = 10;
  private destroyed = 0;
  private lastFrame = performance.now();
  private raf = 0;

  public definition(): Forge2dSceneDefinition {
    return { id: SCENE_ID, render: createRenderDefinition(this.battlefield), colliders: [], setup: (scene) => this.setup(scene), fixedUpdate: (scene) => this.fixedUpdate(scene) };
  }

  public bindGame(game: Forge2dGame): void {
    const ui = game.ui as UiShellLike | null;
    if (ui) this.hud.setup(ui, {
      getCanvasSize: () => ({ width: game.canvas.width, height: game.canvas.height }),
      getRunState: () => this.state,
      getWave: () => this.battlefield.getWave(),
      getLives: () => this.lives,
      getCoins: () => this.coins,
      getEnemies: () => this.battlefield.getActiveEnemyCount(),
      getTowers: () => this.battlefield.getTowerCount(),
      getDestroyed: () => this.destroyed,
    });
    this.controller.setup(game.canvas, { onBuild: (point) => this.build(point), onRestart: () => { if (this.state === "game-over") this.reset(); } });
    this.hud.notify("Click a glowing pad to build a tower for 40 coins.", 4800);
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      this.hud.update(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  public destroy(): void { cancelAnimationFrame(this.raf); this.controller.destroy(); this.hud.destroy(); this.scene = null; }

  private setup(scene: Forge2dSceneFacade): void { this.scene = scene; this.battlefield.reset(); this.sync(scene); }

  private fixedUpdate(scene: Forge2dSceneFacade): void {
    if (this.state !== "playing") { this.sync(scene); return; }
    const step = this.battlefield.step();
    this.coins += step.earned;
    this.destroyed += step.destroyed;
    this.lives = Math.max(0, this.lives - step.escaped);
    if (step.waveStarted !== null) this.hud.notify(`Wave ${step.waveStarted} incoming`, 1600);
    if (step.escaped > 0) this.hud.notify(`${step.escaped} ${step.escaped === 1 ? "enemy" : "enemies"} reached the base`, 1400);
    if (this.lives === 0) { this.state = "game-over"; this.hud.notify(`Defense failed after ${this.destroyed} eliminations.`, 4200); }
    this.sync(scene);
  }

  private build(point: readonly [number, number]): void {
    if (this.state !== "playing") return;
    const result = this.battlefield.buildAt(point, this.coins);
    if (result.ok) this.coins -= result.cost;
    this.hud.notify(result.message, 1500);
    if (this.scene) this.sync(this.scene);
  }

  private reset(): void {
    this.state = "playing"; this.coins = 100; this.lives = 10; this.destroyed = 0; this.battlefield.reset();
    if (this.scene) this.sync(this.scene);
    this.hud.notify("New defense started", 1800);
  }

  private sync(scene: Forge2dSceneFacade): void {
    this.battlefield.sync((entityId, transform) => scene.setTransform(entityId, transform));
    scene.hud.set("hud/status", Object.freeze({ state: this.state, wave: this.battlefield.getWave(), lives: this.lives, coins: this.coins, destroyed: this.destroyed }));
    this.hud.setGameStatus({ state: this.state, wave: this.battlefield.getWave(), lives: this.lives, coins: this.coins, enemies: this.battlefield.getEnemiesRemaining(), destroyed: this.destroyed });
  }
}
