export const ACTIVE_CONTROLS = [
  { id: "build", label: "Mouse · Left click", help: "Build or upgrade a tower" },
  { id: "restart", label: "Keyboard · R / Space", help: "Restart after game over" },
] as const;

export interface ControllerHandlers { onBuild?: (world: readonly [number, number]) => void; onRestart?: () => void; }

export class Controller {
  private canvas: HTMLCanvasElement | null = null;
  private onPointerDown: ((event: PointerEvent) => void) | null = null;
  private onKeyDown: ((event: KeyboardEvent) => void) | null = null;
  private handlers: ControllerHandlers = {};

  public setup(canvas: HTMLCanvasElement, handlers: ControllerHandlers): void {
    this.destroy(); this.canvas = canvas; this.handlers = handlers;
    this.onPointerDown = (event) => {
      if (event.button !== 0 || !this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - 0.5) * 400;
      const y = ((event.clientY - rect.top) / rect.height - 0.5) * 225;
      this.handlers.onBuild?.([x, y]);
    };
    this.onKeyDown = (event) => {
      if (event.repeat || (event.code !== "KeyR" && event.code !== "Space")) return;
      event.preventDefault(); this.handlers.onRestart?.();
    };
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("keydown", this.onKeyDown);
  }

  public destroy(): void {
    if (this.canvas && this.onPointerDown) this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    if (this.onKeyDown) window.removeEventListener("keydown", this.onKeyDown);
    this.canvas = null; this.onPointerDown = null; this.onKeyDown = null; this.handlers = {};
  }
}
