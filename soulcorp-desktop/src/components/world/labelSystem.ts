import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { Building } from "../../types/world";

export class LabelSystem {
  private readonly renderer: CSS2DRenderer;
  private readonly labels = new Map<string, CSS2DObject>();

  constructor(container: HTMLElement) {
    this.renderer = new CSS2DRenderer();
    this.renderer.domElement.style.position = "absolute";
    this.renderer.domElement.style.top = "0";
    this.renderer.domElement.style.pointerEvents = "none";
    container.appendChild(this.renderer.domElement);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height);
  }

  sync(buildings: Building[], hoveredId: string | null): void {
    const seen = new Set<string>();
    for (const building of buildings) {
      seen.add(building.id);
      let label = this.labels.get(building.id);
      if (!label) {
        const el = document.createElement("div");
        el.className = "world-door-label";
        el.textContent = building.name;
        label = new CSS2DObject(el);
        label.position.set(building.position[0], building.size[1] + 1.2, building.position[2]);
        this.labels.set(building.id, label);
      }
      const el = label.element as HTMLDivElement;
      el.textContent = building.department;
      el.className = `world-door-label${hoveredId === building.id ? " hovered" : ""}`;
      label.position.set(
        building.position[0],
        building.size[1] + 1.15,
        building.position[2] + building.size[2] / 2 + 0.3,
      );
    }

    for (const [id, label] of this.labels) {
      if (!seen.has(id)) {
        label.removeFromParent();
        this.labels.delete(id);
      }
    }
  }

  attachToScene(scene: THREE.Scene, buildings: Building[]): void {
    for (const building of buildings) {
      const label = this.labels.get(building.id);
      if (label && !label.parent) {
        scene.add(label);
      }
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number): void {
    this.renderer.setSize(width, height);
    this.renderer.render(scene, camera);
  }

  dispose(): void {
    for (const label of this.labels.values()) {
      label.removeFromParent();
    }
    this.labels.clear();
    this.renderer.domElement.remove();
  }
}