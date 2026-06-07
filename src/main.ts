import "./style.css";
import * as THREE from "three";

declare global {
  interface Window {
    __planetExplorerQa?: {
      focusCollectible: (index: number) => boolean;
      getState: () => {
        collected: number;
        remaining: number;
        exploredCells: number;
        altitude: number;
      };
    };
  }
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("App root not found");
}

app.innerHTML = `
  <div class="hud" aria-live="polite">
    <div class="top-left">
      <div class="panel stats">
        <div class="stat"><span class="label">Collected</span><span class="value" id="collected">0</span></div>
        <div class="stat"><span class="label">Remaining</span><span class="value" id="remaining">0</span></div>
        <div class="stat"><span class="label">Explored</span><span class="value" id="explored">0%</span></div>
      </div>
      <div class="panel guide" id="guide">
        WASD move · Mouse look · Space jump · Shift dash · E/click collect · R respawn · M guide
      </div>
    </div>
    <div class="panel fps" id="fps">0 FPS</div>
    <div class="crosshair"></div>
    <div class="message" id="message">All relics recovered</div>
    <div class="status">
      <div class="bar"><div class="bar-fill" id="barFill"></div></div>
      <div class="status-text"><span id="statusLeft">Click to lock pointer</span><span id="statusRight">Day 0%</span></div>
    </div>
  </div>
`;

const collectedEl = document.querySelector<HTMLSpanElement>("#collected")!;
const remainingEl = document.querySelector<HTMLSpanElement>("#remaining")!;
const exploredEl = document.querySelector<HTMLSpanElement>("#explored")!;
const fpsEl = document.querySelector<HTMLDivElement>("#fps")!;
const guideEl = document.querySelector<HTMLDivElement>("#guide")!;
const messageEl = document.querySelector<HTMLDivElement>("#message")!;
const barFillEl = document.querySelector<HTMLDivElement>("#barFill")!;
const statusLeftEl = document.querySelector<HTMLSpanElement>("#statusLeft")!;
const statusRightEl = document.querySelector<HTMLSpanElement>("#statusRight")!;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(67, window.innerWidth / window.innerHeight, 0.05, 260);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const PLANET_RADIUS = 10;
const PLAYER_HEIGHT = 0.72;
const GRAVITY = 10.8;
const TOTAL_ITEMS = 16;
const spawnDir = new THREE.Vector3(0.18, 0.98, 0.1).normalize();

const temp = new THREE.Vector3();
const temp2 = new THREE.Vector3();
const temp3 = new THREE.Vector3();

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function hash3(x: number, y: number, z: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123);
}

function terrainOffset(dir: THREE.Vector3): number {
  const hills =
    Math.sin(dir.x * 6.1 + dir.y * 2.7) * 0.32 +
    Math.sin(dir.z * 7.4 - dir.x * 3.2) * 0.24 +
    Math.sin((dir.x + dir.y - dir.z) * 11.0) * 0.12;
  const craterCenters = [
    new THREE.Vector3(0.54, 0.48, 0.69).normalize(),
    new THREE.Vector3(-0.79, 0.35, -0.51).normalize(),
    new THREE.Vector3(0.09, -0.35, 0.93).normalize(),
    new THREE.Vector3(-0.25, 0.91, 0.34).normalize()
  ];
  let craters = 0;
  for (const center of craterCenters) {
    const d = dir.angleTo(center);
    const bowl = Math.max(0, 1 - d / 0.27);
    const rim = Math.max(0, 1 - Math.abs(d - 0.28) / 0.08);
    craters += rim * 0.26 - bowl * 0.62;
  }
  return hills + craters;
}

function surfaceRadius(dir: THREE.Vector3): number {
  return PLANET_RADIUS + terrainOffset(dir);
}

function basisFromNormal(normal: THREE.Vector3, yaw: number) {
  const upRef = Math.abs(normal.dot(new THREE.Vector3(0, 1, 0))) > 0.92
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 1, 0);
  const east = new THREE.Vector3().crossVectors(upRef, normal).normalize();
  const north = new THREE.Vector3().crossVectors(normal, east).normalize();
  const forward = new THREE.Vector3()
    .copy(north)
    .multiplyScalar(Math.cos(yaw))
    .addScaledVector(east, Math.sin(yaw))
    .normalize();
  const right = new THREE.Vector3().crossVectors(forward, normal).normalize();
  return { forward, right, east, north };
}

function sphericalDir(seed: number): THREE.Vector3 {
  const y = 1 - 2 * fract(seed * 0.61803398875);
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = seed * 2.39996322973;
  return new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).normalize();
}

const planetGeometry = new THREE.IcosahedronGeometry(PLANET_RADIUS, 5);
const colors: number[] = [];
const color = new THREE.Color();
const position = planetGeometry.attributes.position as THREE.BufferAttribute;
for (let i = 0; i < position.count; i++) {
  temp.fromBufferAttribute(position, i).normalize();
  const offset = terrainOffset(temp);
  const radius = PLANET_RADIUS + offset;
  position.setXYZ(i, temp.x * radius, temp.y * radius, temp.z * radius);
  const band = temp.y * 0.5 + 0.5;
  if (offset < -0.28) {
    color.setRGB(0.18, 0.42, 0.42);
  } else if (offset > 0.35) {
    color.setRGB(0.55, 0.58, 0.48);
  } else if (band > 0.68) {
    color.setRGB(0.24, 0.52, 0.32);
  } else if (band < 0.26) {
    color.setRGB(0.37, 0.31, 0.23);
  } else {
    color.setRGB(0.31, 0.48, 0.25);
  }
  colors.push(color.r, color.g, color.b);
}
planetGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
planetGeometry.computeVertexNormals();

const planet = new THREE.Mesh(
  planetGeometry,
  new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02
  })
);
planet.receiveShadow = true;
scene.add(planet);

const ambient = new THREE.HemisphereLight(0x9ddcff, 0x20251d, 1.0);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff0c4, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 80;
sun.shadow.camera.left = -22;
sun.shadow.camera.right = 22;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -22;
scene.add(sun);

const starGroup = new THREE.Group();
const starGeometry = new THREE.BufferGeometry();
const starPositions: number[] = [];
for (let i = 0; i < 280; i++) {
  const dir = sphericalDir(i + 7);
  starPositions.push(dir.x * 90, dir.y * 90, dir.z * 90);
}
starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ size: 0.12, color: 0xd9ecff, transparent: true, opacity: 0.0 }));
starGroup.add(stars);
scene.add(starGroup);

const decoGroup = new THREE.Group();
scene.add(decoGroup);

function orientOnSurface(object: THREE.Object3D, dir: THREE.Vector3, lift = 0): void {
  const radius = surfaceRadius(dir) + lift;
  object.position.copy(dir).multiplyScalar(radius);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
}

function addTree(dir: THREE.Vector3, scale: number): void {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08 * scale, 0.12 * scale, 0.85 * scale, 7),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 })
  );
  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(0.42 * scale, 1.05 * scale, 8),
    new THREE.MeshStandardMaterial({ color: 0x2f7a4a, roughness: 0.82 })
  );
  const tree = new THREE.Group();
  trunk.position.y = 0.42 * scale;
  leaves.position.y = 1.12 * scale;
  tree.add(trunk, leaves);
  tree.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  orientOnSurface(tree, dir, 0.05);
  decoGroup.add(tree);
}

function addRock(dir: THREE.Vector3, scale: number): void {
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.32 * scale, 0),
    new THREE.MeshStandardMaterial({ color: 0x7b817a, roughness: 0.96 })
  );
  rock.scale.set(1.2, 0.75, 0.9);
  rock.castShadow = true;
  rock.receiveShadow = true;
  orientOnSurface(rock, dir, 0.25 * scale);
  decoGroup.add(rock);
}

function addGrass(dir: THREE.Vector3, scale: number): void {
  const grass = new THREE.Mesh(
    new THREE.ConeGeometry(0.08 * scale, 0.52 * scale, 5),
    new THREE.MeshStandardMaterial({ color: 0x6ebf58, roughness: 0.7 })
  );
  grass.castShadow = true;
  orientOnSurface(grass, dir, 0.25 * scale);
  decoGroup.add(grass);
}

function addCrystal(dir: THREE.Vector3, scale: number): void {
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.28 * scale, 0),
    new THREE.MeshStandardMaterial({ color: 0x62d8ff, emissive: 0x145f86, emissiveIntensity: 0.7, roughness: 0.28 })
  );
  crystal.scale.y = 1.8;
  crystal.castShadow = true;
  orientOnSurface(crystal, dir, 0.42 * scale);
  decoGroup.add(crystal);
}

for (let i = 0; i < 34; i++) addTree(sphericalDir(i + 1.23), 0.75 + hash3(i, 1, 2) * 0.55);
for (let i = 0; i < 42; i++) addRock(sphericalDir(i + 72.4), 0.55 + hash3(i, 3, 4) * 0.85);
for (let i = 0; i < 120; i++) addGrass(sphericalDir(i + 144.8), 0.55 + hash3(i, 5, 6) * 0.7);
for (let i = 0; i < 18; i++) addCrystal(sphericalDir(i + 230.5), 0.65 + hash3(i, 7, 8) * 0.65);

type Collectible = {
  dir: THREE.Vector3;
  mesh: THREE.Group;
  collected: boolean;
};

const collectibles: Collectible[] = [];
const collectibleMaterial = new THREE.MeshStandardMaterial({
  color: 0xffdf5a,
  emissive: 0xff8f2f,
  emissiveIntensity: 1.4,
  roughness: 0.34,
  metalness: 0.12
});

for (let i = 0; i < TOTAL_ITEMS; i++) {
  const dir = i === 0 ? spawnDir.clone() : sphericalDir(i * 3.7 + 11.5);
  const item = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), collectibleMaterial);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.025, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0x8ef4ff, emissive: 0x2da6ff, emissiveIntensity: 0.9 })
  );
  ring.rotation.x = Math.PI / 2;
  item.add(core, ring);
  orientOnSurface(item, dir, 0.95);
  item.userData.base = item.position.clone();
  collectibles.push({ dir, mesh: item, collected: false });
  scene.add(item);
}

const playerMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.18, 12, 8),
  new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x1aa8ff, emissiveIntensity: 0.4 })
);
playerMarker.castShadow = true;
scene.add(playerMarker);

const keys = new Set<string>();
const visited = new Set<string>();
let playerDir = spawnDir.clone();
let altitude = PLAYER_HEIGHT;
let verticalVelocity = 0;
let yaw = 0.4;
let pitch = 0.1;
let guideVisible = true;
let lastTime = performance.now();
let elapsed = 0;
let fpsAccum = 0;
let fpsFrames = 0;
let fpsLast = performance.now();

function respawn(): void {
  playerDir = spawnDir.clone();
  altitude = PLAYER_HEIGHT;
  verticalVelocity = 0;
  yaw = 0.4;
  pitch = 0.08;
}

function collectNearby(force = false): void {
  const playerPosition = temp.copy(playerDir).multiplyScalar(surfaceRadius(playerDir) + altitude);
  let nearest: Collectible | undefined;
  let nearestDistance = Infinity;
  for (const item of collectibles) {
    if (item.collected) continue;
    const distance = item.mesh.position.distanceTo(playerPosition);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = item;
    }
  }
  if (nearest && (nearestDistance < 1.75 || force && nearestDistance < 2.35)) {
    nearest.collected = true;
    nearest.mesh.visible = false;
    const count = collectibles.filter((item) => item.collected).length;
    if (count === TOTAL_ITEMS) {
      messageEl.classList.add("visible");
    }
  }
}

function updateHud(): void {
  const collected = collectibles.filter((item) => item.collected).length;
  const remaining = TOTAL_ITEMS - collected;
  const explored = clamp(Math.round((visited.size / 140) * 100), 0, 100);
  collectedEl.textContent = String(collected);
  remainingEl.textContent = String(remaining);
  exploredEl.textContent = `${explored}%`;
  barFillEl.style.width = `${(collected / TOTAL_ITEMS) * 100}%`;
  const locked = document.pointerLockElement === renderer.domElement;
  const mode = keys.has("ShiftLeft") || keys.has("ShiftRight") ? "Dash" : altitude > PLAYER_HEIGHT + 0.08 ? "Jump" : "Explore";
  statusLeftEl.textContent = locked ? `${mode} · ${remaining} relics nearby across the planet` : "Click canvas to lock pointer";
  const dayPhase = (elapsed * 0.025) % 1;
  statusRightEl.textContent = `${dayPhase < 0.5 ? "Day" : "Night"} ${Math.round(dayPhase * 100)}%`;
}

function updateLighting(): void {
  const phase = (elapsed * 0.025) % 1;
  const angle = phase * Math.PI * 2;
  const daylight = clamp(Math.sin(angle) * 0.5 + 0.5, 0.08, 1);
  sun.position.set(Math.cos(angle) * 28, Math.sin(angle) * 28, Math.sin(angle * 0.7) * 12);
  sun.intensity = 0.38 + daylight * 2.2;
  sun.color.set(daylight > 0.35 ? 0xfff0c4 : 0x91b7ff);
  ambient.intensity = 0.24 + daylight * 0.86;
  ambient.color.set(daylight > 0.35 ? 0xb7e7ff : 0x394c81);
  ambient.groundColor.set(daylight > 0.35 ? 0x24351d : 0x101628);
  const skyDay = new THREE.Color(0x82d4ff);
  const skyNight = new THREE.Color(0x060914);
  scene.background = skyNight.lerp(skyDay, daylight);
  (stars.material as THREE.PointsMaterial).opacity = 1 - daylight;
}

function updatePlayer(dt: number): void {
  const normal = playerDir.clone();
  const { forward, right } = basisFromNormal(normal, yaw);
  const move = new THREE.Vector3();
  if (keys.has("KeyW")) move.add(forward);
  if (keys.has("KeyS")) move.sub(forward);
  if (keys.has("KeyD")) move.add(right);
  if (keys.has("KeyA")) move.sub(right);
  if (move.lengthSq() > 0) {
    move.normalize();
    const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 6.1 : 3.45;
    playerDir.addScaledVector(move, (speed * dt) / PLANET_RADIUS).normalize();
  }

  const grounded = altitude <= PLAYER_HEIGHT + 0.02 && verticalVelocity <= 0;
  if (grounded) {
    altitude = PLAYER_HEIGHT;
    verticalVelocity = 0;
    if (keys.has("Space")) {
      verticalVelocity = 5.15;
      altitude += 0.03;
    }
  } else {
    verticalVelocity -= GRAVITY * dt;
    altitude += verticalVelocity * dt;
    if (altitude <= PLAYER_HEIGHT) {
      altitude = PLAYER_HEIGHT;
      verticalVelocity = 0;
    }
  }

  if (altitude > 7.2 || !Number.isFinite(altitude)) {
    altitude = PLAYER_HEIGHT + 0.15;
    verticalVelocity = 0;
  }

  const cell = `${Math.round((playerDir.x + 1) * 8)}:${Math.round((playerDir.y + 1) * 8)}:${Math.round((playerDir.z + 1) * 8)}`;
  visited.add(cell);

  const positionOnSurface = temp.copy(playerDir).multiplyScalar(surfaceRadius(playerDir) + altitude);
  playerMarker.position.copy(positionOnSurface);

  const cameraTarget = temp2.copy(positionOnSurface).addScaledVector(playerDir, 0.52);
  const cameraBack = forward.clone().multiplyScalar(-4.4);
  const cameraUp = playerDir.clone().multiplyScalar(1.75 + pitch * 1.8);
  camera.position.copy(cameraTarget).add(cameraBack).add(cameraUp);
  camera.lookAt(temp3.copy(cameraTarget).addScaledVector(forward, 3.8).addScaledVector(playerDir, pitch * 2.5));
}

function updateCollectibles(dt: number): void {
  for (let i = 0; i < collectibles.length; i++) {
    const item = collectibles[i];
    if (item.collected) continue;
    const bob = Math.sin(elapsed * 2.8 + i) * 0.14;
    item.mesh.position.copy(item.dir).multiplyScalar(surfaceRadius(item.dir) + 0.95 + bob);
    item.mesh.rotateY(dt * 1.8);
    item.mesh.rotateZ(dt * 0.7);
    const distance = item.mesh.position.distanceTo(playerMarker.position);
    const scale = distance < 2.2 ? 1.24 : 1.0;
    item.mesh.scale.setScalar(scale);
  }
}

window.__planetExplorerQa = {
  focusCollectible(index: number) {
    const item = collectibles[index];
    if (!item || item.collected) return false;
    playerDir = item.dir.clone();
    altitude = PLAYER_HEIGHT;
    verticalVelocity = 0;
    return true;
  },
  getState() {
    const collected = collectibles.filter((item) => item.collected).length;
    return {
      collected,
      remaining: TOTAL_ITEMS - collected,
      exploredCells: visited.size,
      altitude
    };
  }
};

function animate(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  elapsed += dt;
  updateLighting();
  updatePlayer(dt);
  updateCollectibles(dt);
  updateHud();
  renderer.render(scene, camera);

  fpsAccum += 1 / Math.max(dt, 0.0001);
  fpsFrames += 1;
  if (now - fpsLast > 450) {
    fpsEl.textContent = `${Math.round(fpsAccum / fpsFrames)} FPS`;
    fpsAccum = 0;
    fpsFrames = 0;
    fpsLast = now;
  }
  requestAnimationFrame(animate);
}

renderer.domElement.addEventListener("click", () => {
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock().catch(() => {
      statusLeftEl.textContent = "Click canvas to lock pointer";
    });
  } else {
    collectNearby(true);
  }
});

document.addEventListener("pointerlockchange", updateHud);

document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  yaw -= event.movementX * 0.0022;
  pitch = clamp(pitch - event.movementY * 0.0016, -0.55, 0.72);
});

window.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "KeyE") collectNearby(true);
  if (event.code === "KeyR") respawn();
  if (event.code === "KeyM") {
    guideVisible = !guideVisible;
    guideEl.classList.toggle("hidden", !guideVisible);
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

respawn();
remainingEl.textContent = String(TOTAL_ITEMS);
requestAnimationFrame(animate);
