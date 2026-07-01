import * as THREE from "three";

interface BurstParticle {
  sprite: THREE.Sprite;
  velocity: THREE.Vector3;
  life: number;
}

const activeBursts: BurstParticle[] = [];

export function spawnParticleBurst(
  scene: THREE.Scene,
  position: THREE.Vector3 | [number, number, number],
  color = "#9be7ff",
  count = 10,
): void {
  const origin = Array.isArray(position)
    ? new THREE.Vector3(position[0], position[1], position[2])
    : position.clone();
  const baseColor = new THREE.Color(color);

  for (let index = 0; index < count; index += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = `#${baseColor.getHexString()}`;
      ctx.beginPath();
      ctx.arc(4, 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(origin);
    sprite.scale.set(0.18, 0.18, 0.18);
    sprite.renderOrder = 20;
    scene.add(sprite);

    const angle = (index / count) * Math.PI * 2;
    const speed = 0.04 + Math.random() * 0.05;
    activeBursts.push({
      sprite,
      velocity: new THREE.Vector3(Math.cos(angle) * speed, 0.03 + Math.random() * 0.04, Math.sin(angle) * speed),
      life: 1,
    });
  }
}

export function tickParticleBursts(delta: number): void {
  for (let index = activeBursts.length - 1; index >= 0; index -= 1) {
    const particle = activeBursts[index];
    particle.life -= delta * 2.2;
    particle.sprite.position.addScaledVector(particle.velocity, delta * 60);
    const material = particle.sprite.material as THREE.SpriteMaterial;
    material.opacity = Math.max(0, particle.life);

    if (particle.life <= 0) {
      particle.sprite.parent?.remove(particle.sprite);
      material.map?.dispose();
      material.dispose();
      activeBursts.splice(index, 1);
    }
  }
}

export function clearParticleBursts(): void {
  for (const particle of activeBursts) {
    particle.sprite.parent?.remove(particle.sprite);
    const material = particle.sprite.material as THREE.SpriteMaterial;
    material.map?.dispose();
    material.dispose();
  }
  activeBursts.length = 0;
}