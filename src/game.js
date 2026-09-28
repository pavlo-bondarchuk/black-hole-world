import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const canvas = document.querySelector('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7cc5df);
scene.fog = new THREE.Fog(0x9bcbd8, 120, 260);

const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 420);
camera.position.set(0, 54, 58);

scene.add(new THREE.HemisphereLight(0xd9f3ff, 0x36502c, 2.5));

const sun = new THREE.DirectionalLight(0xfff3d3, 4.5);
sun.position.set(-65, 90, 35);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -120;
sun.shadow.camera.right = 120;
sun.shadow.camera.top = 120;
sun.shadow.camera.bottom = -120;
scene.add(sun);

const world = new THREE.Group();
scene.add(world);

const WORLD = 240;
const HALF = WORLD / 2;
const entities = [];
const swallowers = [];
const moving = [];
const keys = new Set();

const state = {
  started: true,
  ended: false,
  time: 180,
  score: 0,
  swallowed: 0,
  radius: 1.6,
  combo: 1,
  comboTimer: 0,
};

const ocean = new THREE.Mesh(
  new THREE.PlaneGeometry(WORLD, WORLD),
  new THREE.MeshStandardMaterial({
    color: 0x2e91bb,
    roughness: 0.3,
    metalness: 0.05,
    transparent: true,
    opacity: 0.9
  })
);
ocean.rotation.x = -Math.PI / 2;
ocean.position.y = -0.45;
ocean.receiveShadow = true;
world.add(ocean);

const sandMaterial = new THREE.MeshStandardMaterial({ color: 0xd8c37c, roughness: 1 });
const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x68a451, roughness: 1 });
const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x5b6164, roughness: 1 });
const pierMaterial = new THREE.MeshStandardMaterial({ color: 0x8a6849, roughness: 1 });

function addLandRect(x, z, w, d, material = grassMaterial, y = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, d), material);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  world.add(mesh);
  return mesh;
}

function addLandCircle(x, z, rx, rz) {
  const sand = new THREE.Mesh(new THREE.CircleGeometry(1, 48), sandMaterial);
  sand.rotation.x = -Math.PI / 2;
  sand.scale.set(rx + 2.5, rz + 2.5, 1);
  sand.position.set(x, -0.02, z);
  world.add(sand);

  const land = new THREE.Mesh(new THREE.CircleGeometry(1, 48), grassMaterial);
  land.rotation.x = -Math.PI / 2;
  land.scale.set(rx, rz, 1);
  land.position.set(x, 0.03, z);
  land.receiveShadow = true;
  world.add(land);
}

addLandRect(-46, 0, 140, 210);
addLandRect(9, -38, 36, 80, sandMaterial, -0.08);
addLandCircle(70, -68, 21, 15);
addLandCircle(82, 5, 13, 11);
addLandCircle(64, 66, 19, 16);
addLandCircle(103, 72, 8, 7);

function addRoad(x, z, w, d) {
  const road = addLandRect(x, z, w, d, roadMaterial, 0.42);
  road.geometry = road.geometry;
}

for (const z of [-72, -36, 0, 36, 72]) addRoad(-48, z, 132, 5);
for (const x of [-86, -48, -10]) addRoad(x, 0, 5, 205);

function addPier(x, z, w, d) {
  const pier = addLandRect(x, z, w, d, pierMaterial, 0.3);
  pier.castShadow = true;
}

addPier(25, -62, 34, 5);
addPier(27, -42, 38, 5);
addPier(28, -20, 40, 5);
addPier(31, 4, 46, 6);

const mapSurface = new THREE.Mesh(
  new THREE.PlaneGeometry(WORLD, WORLD),
  new THREE.MeshBasicMaterial({ visible: false })
);
mapSurface.rotation.x = -Math.PI / 2;
mapSurface.position.y = 0.7;
scene.add(mapSurface);

function material(color, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.08, emissive });
}

function box(w, h, d, color) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildPerson() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.72, 7), material(0x3f69a8));
  body.position.y = 0.46;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), material(0xd7aa83));
  head.position.y = 0.96;
  g.add(body, head);
  return g;
}

function buildFish(color = 0xf2a34b) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.48, 10, 7), material(color));
  body.scale.set(1.45, 0.55, 0.7);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.55, 3), material(color));
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -0.82;
  g.add(body, tail);
  return g;
}

function buildBench() {
  const g = new THREE.Group();
  const seat = box(1.35, 0.14, 0.48, 0x8a5d39);
  seat.position.y = 0.48;
  const back = box(1.35, 0.5, 0.12, 0x8a5d39);
  back.position.set(0, 0.72, -0.2);
  g.add(seat, back);
  return g;
}

function buildBin() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.72, 10), material(0x4e6166));
  b.position.y = 0.38;
  g.add(b);
  return g;
}

function buildTree(scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.5, 8), material(0x6c4c2f));
  trunk.position.y = 0.75;
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.7, 8), material(0x3d7f44));
  crown.position.y = 2.55;
  g.add(trunk, crown);
  g.scale.setScalar(scale);
  return g;
}

function buildCar(color = 0xd94c45) {
  const g = new THREE.Group();
  const body = box(1.8, 0.48, 0.95, color);
  body.position.y = 0.45;
  const cabin = box(0.92, 0.42, 0.78, 0xb7d2dc);
  cabin.position.set(-0.1, 0.84, 0);
  g.add(body, cabin);
  return g;
}

function buildBus() {
  const g = new THREE.Group();
  const body = box(3.6, 1.4, 1.15, 0xe3c14f);
  body.position.y = 0.82;
  g.add(body);
  return g;
}

function buildHouse(color = 0xd8c1a3) {
  const g = new THREE.Group();
  const base = box(3.2, 2.5, 3, color);
  base.position.y = 1.25;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.45, 1.4, 4), material(0xa14d3b));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 3.15;
  g.add(base, roof);
  return g;
}

function buildWarehouse() {
  const g = new THREE.Group();
  const b = box(6.2, 3, 4.8, 0x9da6a8);
  b.position.y = 1.5;
  g.add(b);
  return g;
}

function buildBoat(scale = 1, color = 0xf0eee5) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 2.8, 5), material(color));
  hull.rotation.z = Math.PI / 2;
  hull.scale.z = 0.55;
  hull.position.y = 0.4;
  const cabin = box(0.85, 0.65, 0.8, 0xd9edf2);
  cabin.position.set(0.25, 0.9, 0);
  g.add(hull, cabin);
  g.scale.setScalar(scale);
  return g;
}

function buildShip() {
  const g = new THREE.Group();
  const hull = box(8.5, 1.2, 2.8, 0x384a54);
  hull.position.y = 0.65;
  const deck = box(4.6, 1.9, 2.2, 0xe7e9e6);
  deck.position.set(-0.8, 2, 0);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.5, 2, 10), material(0xcf6247));
  stack.position.set(-1.2, 3.6, 0);
  g.add(hull, deck, stack);
  return g;
}

function buildSubmarine() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1, 4.5, 8, 16), material(0x4b5b59));
  body.rotation.z = Math.PI / 2;
  const tower = box(0.9, 0.75, 0.7, 0x3c4947);
  tower.position.set(0, 1, 0);
  g.add(body, tower);
  return g;
}

function buildCrane() {
  const g = new THREE.Group();
  const mast = box(0.8, 7, 0.8, 0xe3ad37);
  mast.position.y = 3.5;
  const arm = box(6.2, 0.5, 0.5, 0xe3ad37);
  arm.position.set(2.5, 6.5, 0);
  g.add(mast, arm);
  return g;
}

function buildPlane() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 4.8, 6, 12), material(0xf2f5f6));
  body.rotation.z = Math.PI / 2;
  const wing = box(1.2, 0.12, 5.5, 0xcfdce0);
  g.add(body, wing);
  return g;
}

function createEntity(type, x, z, size, score, builder, options = {}) {
  const group = builder();
  group.position.set(x, options.y ?? 0.72, z);
  group.rotation.y = options.rotation ?? Math.random() * Math.PI * 2;
  group.userData = {
    type,
    size,
    score,
    baseScale: group.scale.clone(),
    swallowing: false,
    progress: 0,
    moving: !!options.velocity,
    velocity: options.velocity || null,
    bounds: options.bounds || null,
    spawnPosition: group.position.clone(),
    spawnRotation: group.rotation.clone(),
    respawnTimer: 0
  };
  entities.push(group);
  if (options.velocity) moving.push(group);
  world.add(group);
  return group;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function landPoint() {
  return { x: rand(-108, 15), z: rand(-102, 102) };
}

function seaPoint() {
  return { x: rand(30, 112), z: rand(-108, 108) };
}

for (let i = 0; i < 45; i += 1) {
  const p = landPoint();
  createEntity('person', p.x, p.z, 0.5, 5, buildPerson);
}

for (let i = 0; i < 34; i += 1) {
  const p = landPoint();
  createEntity(i % 2 ? 'bench' : 'bin', p.x, p.z, 0.7, 7, i % 2 ? buildBench : buildBin);
}

for (let i = 0; i < 50; i += 1) {
  const p = landPoint();
  createEntity('tree', p.x, p.z, 1.05, 10, () => buildTree(rand(0.8, 1.2)));
}

for (let i = 0; i < 34; i += 1) {
  const roadZ = [-72, -36, 0, 36, 72][i % 5];
  createEntity('car', rand(-105, 12), roadZ + (i % 2 ? 1.25 : -1.25), 1.5, 18, () => buildCar(new THREE.Color().setHSL(Math.random(), 0.58, 0.5)), {
    velocity: new THREE.Vector3(i % 2 ? 5 : -5, 0, 0),
    bounds: { minX: -108, maxX: 12, minZ: roadZ - 2, maxZ: roadZ + 2 }
  });
}

for (let i = 0; i < 10; i += 1) {
  const roadZ = [-72, -36, 0, 36, 72][i % 5];
  createEntity('bus', rand(-100, 5), roadZ, 2.8, 38, buildBus, {
    velocity: new THREE.Vector3(i % 2 ? 2.7 : -2.7, 0, 0),
    bounds: { minX: -108, maxX: 12, minZ: roadZ - 2, maxZ: roadZ + 2 }
  });
}

for (let i = 0; i < 26; i += 1) {
  createEntity('house', rand(-98, -18), rand(-96, 96), 3.5, 55, () => buildHouse(new THREE.Color().setHSL(rand(0.06, 0.11), 0.26, rand(0.58, 0.73))));
}

for (let i = 0; i < 8; i += 1) {
  createEntity('warehouse', rand(-5, 18), rand(-88, 18), 5.4, 95, buildWarehouse);
}

for (let i = 0; i < 7; i += 1) {
  createEntity('crane', rand(15, 35), -72 + i * 18, 6.2, 120, buildCrane);
}

for (let i = 0; i < 72; i += 1) {
  const p = seaPoint();
  createEntity('fish', p.x, p.z, 0.45, 4, () => buildFish(new THREE.Color().setHSL(rand(0.02, 0.16), 0.75, 0.58)), {
    y: -0.05,
    velocity: new THREE.Vector3(rand(-1.8, 1.8), 0, rand(-1.2, 1.2)),
    bounds: { minX: 25, maxX: 115, minZ: -112, maxZ: 112 }
  });
}

for (let i = 0; i < 18; i += 1) {
  const p = seaPoint();
  createEntity('boat', p.x, p.z, 1.7, 24, () => buildBoat(rand(0.8, 1.15)), {
    y: 0.05,
    velocity: new THREE.Vector3(rand(-1.4, 1.4), 0, rand(-1.2, 1.2)),
    bounds: { minX: 24, maxX: 115, minZ: -112, maxZ: 112 }
  });
}

for (let i = 0; i < 8; i += 1) {
  const p = seaPoint();
  createEntity('ship', p.x, p.z, 6.8, 160, buildShip, {
    y: 0.05,
    velocity: new THREE.Vector3(rand(-0.7, 0.7), 0, rand(-0.45, 0.45)),
    bounds: { minX: 28, maxX: 112, minZ: -108, maxZ: 108 }
  });
}

for (let i = 0; i < 6; i += 1) {
  const p = seaPoint();
  createEntity('submarine', p.x, p.z, 5.6, 130, buildSubmarine, {
    y: -0.15,
    velocity: new THREE.Vector3(rand(-0.45, 0.45), 0, rand(-0.4, 0.4)),
    bounds: { minX: 30, maxX: 112, minZ: -108, maxZ: 108 }
  });
}

for (let i = 0; i < 7; i += 1) {
  createEntity('plane', rand(-100, 90), rand(-100, 100), 7.8, 220, buildPlane, {
    y: rand(12, 19),
    velocity: new THREE.Vector3(rand(8, 12), 0, rand(-1, 1)),
    bounds: { minX: -125, maxX: 125, minZ: -120, maxZ: 120 }
  });
}

for (const island of [
  [70, -68, 17, 11],
  [82, 5, 10, 8],
  [64, 66, 15, 12],
  [103, 72, 6, 5]
]) {
  const [cx, cz, rx, rz] = island;
  for (let i = 0; i < 13; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());
    createEntity('tree', cx + Math.cos(a) * rx * r, cz + Math.sin(a) * rz * r, 1, 10, () => buildTree(rand(0.7, 1.1)));
  }
}

const hole = new THREE.Group();
world.add(hole);

const holeShadow = new THREE.Mesh(
  new THREE.CircleGeometry(1, 72),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.82, depthWrite: false })
);
holeShadow.rotation.x = -Math.PI / 2;
holeShadow.position.y = 0.61;

const holeCore = new THREE.Mesh(
  new THREE.CircleGeometry(0.82, 72),
  new THREE.MeshBasicMaterial({ color: 0x000000, depthWrite: false })
);
holeCore.rotation.x = -Math.PI / 2;
holeCore.position.y = 0.64;

const holeGlow = new THREE.Mesh(
  new THREE.RingGeometry(0.88, 1.2, 72),
  new THREE.MeshBasicMaterial({
    color: 0x774dff,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
);
holeGlow.rotation.x = -Math.PI / 2;
holeGlow.position.y = 0.66;

hole.add(holeShadow, holeCore, holeGlow);
hole.position.set(-82, 0, -78);

const holePosition = new THREE.Vector3(-82, 0, -78);

function capacity() {
  return state.radius * 0.82;
}

function grow(amount) {
  state.radius = Math.min(24, state.radius + amount);
}

function swallow(entity) {
  entity.userData.swallowing = true;
  entity.userData.progress = 0;
  entity.userData.startScale = entity.scale.clone();
  entity.userData.startY = entity.position.y;
  swallowers.push(entity);
}

function checkSwallow() {
  for (const entity of entities) {
    if (!entity.visible || entity.userData.swallowing) continue;

    const distance = Math.hypot(
      entity.position.x - holePosition.x,
      entity.position.z - holePosition.z
    );

    if (distance < state.radius * 0.9 + entity.userData.size * 0.55) {
      swallow(entity);
    }
  }
}

function updateSwallow(delta) {
  for (let i = swallowers.length - 1; i >= 0; i -= 1) {
    const entity = swallowers[i];
    entity.userData.progress = Math.min(1, entity.userData.progress + delta * (1.65 + state.radius * 0.035));

    const p = entity.userData.progress;
    const target = new THREE.Vector3(holePosition.x, -3.8, holePosition.z);

    entity.position.lerp(target, 0.09 + p * 0.11);
    entity.rotation.x += delta * 4.2;
    entity.rotation.y += delta * 6.4;
    entity.rotation.z += delta * 3.2;

    const scale = Math.max(0.025, 1 - p * 0.96);
    entity.scale.copy(entity.userData.startScale).multiplyScalar(scale);

    if (p >= 1) {
      entity.visible = false;
      entity.userData.respawnTimer = rand(9, 22);
      state.score += Math.round(entity.userData.score * state.combo);
      state.swallowed += 1;
      state.combo = state.comboTimer > 0 ? Math.min(8, state.combo + 1) : 1;
      state.comboTimer = 3.2;
      grow(0.035 + entity.userData.size * 0.018);
      swallowers.splice(i, 1);
    }
  }
}

function respawnEntity(entity) {
  const data = entity.userData;
  const b = data.bounds;

  if (data.moving && b) {
    entity.position.set(
      rand(b.minX, b.maxX),
      data.spawnPosition.y,
      rand(b.minZ, b.maxZ)
    );
  } else {
    entity.position.copy(data.spawnPosition);
  }

  const distance = Math.hypot(
    entity.position.x - holePosition.x,
    entity.position.z - holePosition.z
  );

  if (distance < state.radius * 2.4 + data.size) {
    data.respawnTimer = rand(3, 6);
    return;
  }

  entity.rotation.copy(data.spawnRotation);
  entity.scale.copy(data.baseScale);
  data.progress = 0;
  data.swallowing = false;
  data.respawnTimer = 0;
  entity.visible = true;
}

function updateRespawns(delta) {
  for (const entity of entities) {
    if (entity.visible || entity.userData.swallowing) continue;
    if (entity.userData.respawnTimer <= 0) continue;

    entity.userData.respawnTimer -= delta;

    if (entity.userData.respawnTimer <= 0) {
      respawnEntity(entity);
    }
  }
}

function updateMoving(delta) {
  for (const entity of moving) {
    if (!entity.visible || entity.userData.swallowing) continue;

    const velocity = entity.userData.velocity;
    entity.position.addScaledVector(velocity, delta);

    const b = entity.userData.bounds;
    if (!b) continue;

    if (entity.position.x < b.minX || entity.position.x > b.maxX) velocity.x *= -1;
    if (entity.position.z < b.minZ || entity.position.z > b.maxZ) velocity.z *= -1;

    entity.rotation.y = Math.atan2(velocity.x, velocity.z);
  }
}

function moveHole(delta) {
  const dir = new THREE.Vector3();

  if (keys.has('KeyW') || keys.has('ArrowUp')) dir.z -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) dir.z += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) dir.x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) dir.x += 1;

  if (dir.lengthSq()) {
    dir.normalize().multiplyScalar(delta * (13 + state.radius * 0.28));
    holePosition.add(dir);
  }

  holePosition.x = THREE.MathUtils.clamp(holePosition.x, -HALF + state.radius, HALF - state.radius);
  holePosition.z = THREE.MathUtils.clamp(holePosition.z, -HALF + state.radius, HALF - state.radius);

  hole.position.x = THREE.MathUtils.lerp(hole.position.x, holePosition.x, 0.24);
  hole.position.z = THREE.MathUtils.lerp(hole.position.z, holePosition.z, 0.24);
  hole.scale.setScalar(state.radius);
  holeGlow.rotation.z += delta * 0.75;
}

function updateCamera() {
  const zoom = THREE.MathUtils.clamp(
    1 + (state.radius - 1.6) * 0.055,
    1,
    2.05
  );

  const offset = new THREE.Vector3(
    0,
    48 * zoom,
    34 * zoom
  );

  const desired = hole.position
    .clone()
    .add(offset);

  camera.position.lerp(
    desired,
    0.12
  );

  camera.lookAt(
    hole.position.x,
    0,
    hole.position.z
  );
}

function updateHud() {
  document.querySelector('#score').textContent = state.score.toLocaleString('en-US');
  document.querySelector('#size').textContent = `${state.radius.toFixed(1)} m`;
  document.querySelector('#combo').textContent = `x${state.combo}`;

  const minutes = Math.floor(Math.max(0, state.time) / 60);
  const seconds = Math.floor(Math.max(0, state.time) % 60).toString().padStart(2, '0');
  document.querySelector('#time').textContent = `${minutes}:${seconds}`;

}

let messageTimer = 0;

function showMessage(text) {
  const el = document.querySelector('#message');
  el.textContent = text;
  el.hidden = false;
  messageTimer = 1.45;
}

function updateMessage(delta) {
  if (messageTimer <= 0) return;
  messageTimer -= delta;
  if (messageTimer <= 0) document.querySelector('#message').hidden = true;
}

function endGame() {
  if (state.ended) return;
  state.ended = true;
  document.querySelector('#finalScore').textContent = state.score.toLocaleString('en-US');
  document.querySelector('#finalSize').textContent = `${state.radius.toFixed(1)} m`;
  document.querySelector('#finalObjects').textContent = state.swallowed.toLocaleString('en-US');
  document.querySelector('#finalTitle').textContent = state.radius >= 16 ? 'World consumed' : 'Time is up';
  document.querySelector('#gameOver').hidden = false;
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', (event) => keys.add(event.code));
window.addEventListener('keyup', (event) => keys.delete(event.code));

document.querySelector('#restartBtn').addEventListener('click', () => location.reload());

resize();
updateHud();

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);

  if (state.started && !state.ended) {
    state.time -= delta;
    state.comboTimer = Math.max(0, state.comboTimer - delta);
    if (state.comboTimer === 0) state.combo = 1;

    moveHole(delta);
    updateMoving(delta);
    checkSwallow();
    updateSwallow(delta);
    updateRespawns(delta);
    updateCamera();
    updateMessage(delta);

    if (state.time <= 0) endGame();
  } else {
    updateCamera();
  }

  updateHud();
  renderer.render(scene, camera);
}

animate();
