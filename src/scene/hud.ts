import type { UiDisposable, UiShellLike } from "@forgeng/ui-dom";
import { ACTIVE_CONTROLS } from "./controller";
import type { RunState } from "./mainScene";

export interface MetricsSource {
  getCanvasSize(): { width: number; height: number };
  getRunState(): RunState;
  getWave(): number;
  getLives(): number;
  getCoins(): number;
  getEnemies(): number;
  getTowers(): number;
  getDestroyed(): number;
}

export interface GameStatus { readonly state: RunState; readonly wave: number; readonly lives: number; readonly coins: number; readonly enemies: number; readonly destroyed: number; }

export class Hud {
  private readonly disposers: UiDisposable[] = [];
  private ui: UiShellLike | null = null;
  private source: MetricsSource | null = null;
  private styleEl: HTMLStyleElement | null = null;
  private overlayEl: HTMLElement | null = null;
  private livesEl: HTMLElement | null = null;
  private waveEl: HTMLElement | null = null;
  private coinsEl: HTMLElement | null = null;
  private enemiesEl: HTMLElement | null = null;
  private modalEl: HTMLElement | null = null;
  private toastEl: HTMLElement | null = null;
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private advanced = false;
  private fps = 0;
  private frames = 0;
  private fpsTimer = 0;

  public setup(ui: UiShellLike, source: MetricsSource): void {
    this.destroy(); this.ui = ui; this.source = source;
    this.advanced = new URLSearchParams(window.location.search).has("advanced");
    this.installUiStyle(ui); this.applyAdvanced(); this.ensureOverlay();
    this.disposers.push(ui.settings.register({ id: "template.controls", title: "Controls", fields: [
      { id: "status", label: "Status", kind: "status", read: () => `${this.source?.getRunState() === "game-over" ? "Game over" : "Defending"} · ${this.fps} FPS` },
      ...ACTIVE_CONTROLS.map((control) => ({ id: `ctrl-${control.id}`, label: control.label, kind: "status" as const, read: () => control.help })),
      { id: "advanced", label: "Advanced metrics", kind: "boolean", read: () => this.advanced, write: (value: string | number | boolean | null) => { this.advanced = value === true; this.applyAdvanced(); this.syncUrl(); ui.settings.refresh("template.controls"); } },
      { id: "tip", label: "Goal", kind: "status", read: () => "Stop every enemy before it reaches the base" },
    ] }));
    this.disposers.push(ui.contributions.register({ id: "template.controls.panel", title: "Controls", slot: "side-panel", order: 10, settingsSchemaId: "template.controls" }));
    this.disposers.push(ui.settings.register({ id: "template.metrics", title: "Metrics", fields: [
      { id: "fps", label: "FPS", kind: "status", read: () => String(this.fps) },
      { id: "wave", label: "Wave", kind: "status", read: () => String(this.source?.getWave() ?? 0) },
      { id: "enemies", label: "Active enemies", kind: "status", read: () => String(this.source?.getEnemies() ?? 0) },
      { id: "towers", label: "Built towers", kind: "status", read: () => String(this.source?.getTowers() ?? 0) },
      { id: "destroyed", label: "Destroyed", kind: "status", read: () => String(this.source?.getDestroyed() ?? 0) },
      { id: "resolution", label: "Resolution", kind: "status", read: () => { const s = this.source?.getCanvasSize(); return s ? `${s.width}×${s.height}` : "—"; } },
    ] }));
    this.disposers.push(ui.contributions.register({ id: "template.metrics.panel", title: "Metrics", slot: "side-panel", order: 20, settingsSchemaId: "template.metrics" }));
  }

  public update(dt: number): void {
    this.frames += 1; this.fpsTimer += dt;
    if (this.fpsTimer < 0.5) return;
    this.fps = Math.round(this.frames / this.fpsTimer); this.frames = 0; this.fpsTimer = 0;
    this.ui?.settings.refresh("template.controls"); if (this.advanced) this.ui?.settings.refresh("template.metrics");
  }

  public setGameStatus(status: GameStatus): void {
    this.ensureOverlay();
    if (this.livesEl) this.livesEl.textContent = `BASE ${"◆".repeat(status.lives)}${"◇".repeat(Math.max(0, 10 - status.lives))}`;
    if (this.waveEl) this.waveEl.textContent = `WAVE ${status.wave}`;
    if (this.coinsEl) this.coinsEl.textContent = `${status.coins} COINS`;
    if (this.enemiesEl) this.enemiesEl.textContent = `${status.enemies} ENEMIES · ${status.destroyed} DESTROYED`;
    if (!this.modalEl) return;
    this.modalEl.hidden = status.state !== "game-over";
    if (status.state === "game-over") this.modalEl.innerHTML = `<strong>BASE LOST</strong><span>${status.destroyed} enemies destroyed</span><em>Press R or Space to restart</em>`;
  }

  public notify(message: string, durationMs = 2500): void {
    if (this.notifyTimer) clearTimeout(this.notifyTimer);
    const toast = this.ensureToast(); toast.innerHTML = `<strong>2D Tower Defense</strong><span>${message}</span>`; toast.hidden = false;
    this.notifyTimer = setTimeout(() => { toast.hidden = true; this.notifyTimer = null; }, durationMs);
  }

  public destroy(): void {
    if (this.notifyTimer) clearTimeout(this.notifyTimer);
    this.toastEl?.remove(); this.overlayEl?.remove(); this.styleEl?.remove();
    this.toastEl = null; this.overlayEl = null; this.livesEl = null; this.waveEl = null; this.coinsEl = null; this.enemiesEl = null; this.modalEl = null; this.styleEl = null;
    for (const disposer of this.disposers.splice(0).reverse()) void disposer.dispose();
    delete document.body.dataset.templateAdvanced; this.ui = null; this.source = null;
  }

  private ensureOverlay(): void {
    if (this.overlayEl) return;
    const overlay = document.createElement("div"); overlay.className = "template-defense-overlay";
    overlay.innerHTML = `<div class="template-lives"></div><div class="template-wave"></div><div class="template-coins"></div><div class="template-enemies"></div><div class="template-defense-modal" hidden></div>`;
    document.body.appendChild(overlay); this.overlayEl = overlay;
    this.livesEl = overlay.querySelector(".template-lives"); this.waveEl = overlay.querySelector(".template-wave"); this.coinsEl = overlay.querySelector(".template-coins"); this.enemiesEl = overlay.querySelector(".template-enemies"); this.modalEl = overlay.querySelector(".template-defense-modal");
  }

  private ensureToast(): HTMLElement { if (this.toastEl) return this.toastEl; const toast = document.createElement("div"); toast.className = "template-toast"; toast.hidden = true; document.body.appendChild(toast); this.toastEl = toast; return toast; }
  private applyAdvanced(): void { document.body.dataset.templateAdvanced = this.advanced ? "1" : "0"; }
  private syncUrl(): void { const url = new URL(location.href); if (this.advanced) url.searchParams.set("advanced", "1"); else url.searchParams.delete("advanced"); history.replaceState({}, "", url); }
  private installUiStyle(ui: UiShellLike): void {
    ui.preferences.update({ layout: { sidePanelWidth: 340, sidePanelCollapsed: false, hiddenSlots: ["top-bar", "bottom-status"] } });
    this.styleEl = document.createElement("style"); this.styleEl.id = "template-ui-focus";
    this.styleEl.textContent = `.forgeng-ui-surface[data-surface-id$=".chrome"],.forgeng-ui-surface[data-surface-id$=".menu"],.forgeng-ui-slot[data-slot="top-bar"]{display:none!important}.forgeng-ui-card[data-contribution-id="forgeng.renderer.webgpu.debug"],.forgeng-ui-card[data-contribution-id="forgeng.audio.webaudio.panel"],.forgeng-ui-card[data-contribution-id="forgeng.assets.health.panel"],body[data-template-advanced="0"] .forgeng-ui-card[data-contribution-id="template.metrics.panel"]{display:none!important}.forgeng-ui-shell{--fg-side-width:340px}.forgeng-ui-slot[data-slot="side-panel"]{top:12px;bottom:12px}@media(max-width:700px){.forgeng-ui-slot[data-slot="side-panel"]{display:none!important}}`;
    document.head.appendChild(this.styleEl);
  }
}
