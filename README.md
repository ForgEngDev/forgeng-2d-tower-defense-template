# ForgeNG 2D Tower Defense Template

A compact, beginner-friendly tower-defense starter built with **ForgeNG 3.4.2**, TypeScript, Vite, and WebGPU.

Build towers on fixed pads, defend the base from escalating enemy waves, earn coins from eliminations, and upgrade each tower to level three.

## Quick start

```bash
git clone https://github.com/ForgEngDev/forgeng-2d-tower-defense-template.git
cd forgeng-2d-tower-defense-template
npm install
npm run dev
```

Open the local URL printed by Vite in a WebGPU-capable browser.

The map is designed for a landscape viewport. Rotate phones and tablets horizontally for the clearest playfield.

## Controls

- **Left click:** build a tower on a glowing pad
- **Left click on a tower:** upgrade it
- **R / Space:** restart after game over

## Included systems

- Fixed multi-segment enemy path
- Escalating enemy waves
- Pooled enemies and projectiles
- Automatic target selection and tower attacks
- Build costs, elimination rewards, and tower upgrades
- Base health, game-over state, and restart flow
- Responsive DOM HUD and optional advanced metrics
- English UI, source comments, and documentation

## Project structure

```text
src/
  main.ts                  ForgeNG boot and lifecycle
  scene/
    battlefield.ts         Simulation, waves, towers, enemies, and projectiles
    controller.ts          Pointer and keyboard input
    hud.ts                 DOM HUD, notifications, and settings panels
    render.ts              ForgeNG 2D render definition
    camera.ts              Orthographic camera
    ids.ts                 Stable scene and resource IDs
  vendor/forgeng/          Vendored ForgeNG 3.4.2 runtime and declarations
css/style.css              Full-viewport layout and HUD styling
```

## Build

```bash
npm run build
npm run preview
```

## License

See [LICENSE](LICENSE).
