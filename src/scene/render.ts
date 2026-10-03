import { builtinSpriteMaterial2d, defineLayer2d, defineRender2d } from "forgeng/2d";
import { Battlefield } from "./battlefield";
import { createCamera } from "./camera";
import { MATERIAL, WORLD } from "./ids";

export function createRenderDefinition(battlefield: Battlefield) {
  return defineRender2d({ contractVersion: 1, id: "template.2d:tower-defense-render", layers: [defineLayer2d({ id: WORLD })], cameras: [createCamera()], materials: [builtinSpriteMaterial2d({ id: MATERIAL })], sprites: battlefield.createSprites(), animations: [] });
}
