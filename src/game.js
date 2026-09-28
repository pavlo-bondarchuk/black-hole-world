import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const canvas = document.querySelector('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7cc5df);
scene.fog = new THREE.Fog(0x9bcbd8, 150, 380);

const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 560);
camera.position.set(0, 54, 58);

scene.add(new THREE.HemisphereLight(0xd9f3ff, 0x36502c, 2.5));

const sun = new THREE.DirectionalLight(0xfff3d3, 4.5);
sun.position.set(-65, 90, 35);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -190;
sun.shadow.camera.right = 190;
sun.shadow.camera.top = 190;
sun.shadow.camera.bottom = -190;
scene.add(sun);

const world = new THREE.Group();
scene.add(world);

const WORLD = 360;
const HALF = WORLD / 2;
const entities = [];
const swallowers = [];
const moving = [];
const keys = new Set();

const state = {
  started: true,
  ended: false,
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

const shallowShelf = new THREE.Mesh(
  new THREE.PlaneGeometry(76, 324),
  new THREE.MeshStandardMaterial({
    color: 0x4aa9c5,
    roughness: 0.38,
    metalness: 0.02,
    transparent: true,
    opacity: 0.5
  })
);
shallowShelf.rotation.x = -Math.PI / 2;
shallowShelf.position.set(18, -0.33, 0);
world.add(shallowShelf);

const sandMaterial = new THREE.MeshStandardMaterial({ color: 0xd8c37c, roughness: 1 });
const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x68a451, roughness: 1 });
const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x5b6164, roughness: 1 });
const pierMaterial = new THREE.MeshStandardMaterial({ color: 0x8a6849, roughness: 1 });

function terrainHeight(x, z) {
  const westRise = THREE.MathUtils.clamp((-x - 82) / 88, 0, 1);
  const edgeRise = THREE.MathUtils.clamp((Math.abs(z) - 92) / 70, 0, 1);

  return (
    Math.sin(x * 0.035) * 0.55 +
    Math.cos(z * 0.03) * 0.42 +
    Math.sin((x + z) * 0.018) * 0.65 +
    westRise * 3.6 +
    edgeRise * 2.2
  );
}

const terrainGeometry = new THREE.PlaneGeometry(228, 324, 62, 82);
terrainGeometry.rotateX(-Math.PI / 2);
const terrainPosition = terrainGeometry.attributes.position;

for (let i = 0; i < terrainPosition.count; i += 1) {
  const lx = terrainPosition.getX(i);
  const lz = terrainPosition.getZ(i);
  const wx = lx - 58;
  const wz = lz;

  terrainPosition.setY(
    i,
    terrainHeight(wx, wz) - 0.22
  );
}

terrainPosition.needsUpdate = true;
terrainGeometry.computeVertexNormals();

const terrain = new THREE.Mesh(
  terrainGeometry,
  new THREE.MeshStandardMaterial({
    color: 0x5f994d,
    roughness: 0.98,
    metalness: 0.01
  })
);

terrain.position.x = -58;
terrain.receiveShadow = true;
world.add(terrain);

const cliffGeometry = new THREE.BoxGeometry(228, 5.8, 324);
const cliff = new THREE.Mesh(
  cliffGeometry,
  new THREE.MeshStandardMaterial({
    color: 0x79684e,
    roughness: 1
  })
);

cliff.position.set(-58, -3.1, 0);
world.add(cliff);

function addLandRect(x, z, w, d, material = grassMaterial, y = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, d), material);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  world.add(mesh);
  return mesh;
}

function createIslandGeometry(rx, rz, height, seed = 0) {
  const segments = 48;
  const rings = 4;
  const positions = [];
  const indices = [];

  for (let ring = 0; ring <= rings; ring += 1) {
    const t = ring / rings;
    const radiusFactor = t;

    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      const noise =
        1 +
        Math.sin(a * 3 + seed) * 0.08 +
        Math.sin(a * 7 + seed * 1.7) * 0.045 +
        Math.cos(a * 11 - seed * 0.8) * 0.025;

      const x = Math.cos(a) * rx * radiusFactor * noise;
      const z = Math.sin(a) * rz * radiusFactor * noise;
      const y = ring === 0
        ? height
        : height * Math.pow(1 - t, 1.35);

      positions.push(x, y, z);
    }
  }

  for (let ring = 0; ring < rings; ring += 1) {
    for (let i = 0; i < segments; i += 1) {
      const next = (i + 1) % segments;
      const a = ring * segments + i;
      const b = ring * segments + next;
      const c = (ring + 1) * segments + i;
      const d = (ring + 1) * segments + next;

      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function addLandCircle(x, z, rx, rz) {
  const seed = x * 0.021 + z * 0.017;

  const sand = new THREE.Mesh(
    createIslandGeometry(rx + 2.8, rz + 2.8, 0.55, seed),
    sandMaterial
  );
  sand.position.set(x, -0.38, z);
  sand.receiveShadow = true;
  world.add(sand);

  const land = new THREE.Mesh(
    createIslandGeometry(rx, rz, 1.15, seed + 1.9),
    grassMaterial
  );
  land.position.set(x, -0.12, z);
  land.receiveShadow = true;
  world.add(land);
}

const islandZones = [
  [82, -96, 25, 18],
  [102, -24, 16, 13],
  [88, 62, 24, 19],
  [132, 92, 11, 9],
  [122, 20, 9, 7],
  [146, -58, 13, 10]
];

for (const island of islandZones) {
  addLandCircle(...island);
}

function surfaceHeight(x, z) {
  if (x < 20) {
    return terrainHeight(x, z);
  }

  for (const [cx, cz, rx, rz] of islandZones) {
    const nx = (x - cx) / rx;
    const nz = (z - cz) / rz;
    const distance = Math.sqrt(nx * nx + nz * nz);

    if (distance <= 1) {
      return 0.04 + (1 - distance) * 0.98;
    }
  }

  return 0;
}

function addRoad(x, z, w, d) {
  const road = addLandRect(x, z, w, d, roadMaterial, 0);
  road.position.y = terrainHeight(x, z) + 0.18;
}

for (const z of [-96, -64, -32, 0, 32, 64, 96]) addRoad(-52, z, 146, 5);
for (const x of [-108, -72, -36, 0]) addRoad(x, 0, 5, 238);

function addPier(x, z, w, d) {
  const pier = addLandRect(x, z, w, d, pierMaterial, 0.08);
  pier.castShadow = true;
}

addPier(28, -88, 38, 5);
addPier(31, -62, 44, 5);
addPier(34, -34, 48, 5);
addPier(37, -4, 54, 6);
addPier(34, 28, 46, 5);

const materialCache = new Map();
const boxGeometryCache = new Map();

function material(color, emissive = 0x000000) {
  const colorHex = color?.isColor ? color.getHex() : color;
  const emissiveHex = emissive?.isColor ? emissive.getHex() : emissive;
  const key = `${colorHex}-${emissiveHex}`;

  if (!materialCache.has(key)) {
    materialCache.set(
      key,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.72,
        metalness: 0.08,
        emissive
      })
    );
  }

  return materialCache.get(key);
}

function box(w, h, d, color) {
  const key = `${w}-${h}-${d}`;

  if (!boxGeometryCache.has(key)) {
    boxGeometryCache.set(
      key,
      new THREE.BoxGeometry(w, h, d)
    );
  }

  const mesh = new THREE.Mesh(
    boxGeometryCache.get(key),
    material(color)
  );

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
  const seaType = ['fish', 'boat', 'ship', 'submarine', 'plane'].includes(type);
  const baseY = seaType
    ? (options.y ?? 0.72)
    : surfaceHeight(x, z) + (options.y ?? 0.72);

  group.position.set(x, baseY, z);
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
    respawnTimer: 0,
    airPulled: false,
    fallVelocity: 0,
    fallSpin: new THREE.Vector3(
      rand(-2.8, 2.8),
      rand(-3.4, 3.4),
      rand(-2.8, 2.8)
    )
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
  return { x: rand(-150, 18), z: rand(-142, 142) };
}

function seaPoint() {
  return { x: rand(34, 168), z: rand(-165, 165) };
}

for (let i = 0; i < 70; i += 1) {
  const p = landPoint();
  createEntity('person', p.x, p.z, 0.5, 5, buildPerson);
}

for (let i = 0; i < 48; i += 1) {
  const p = landPoint();
  createEntity(i % 2 ? 'bench' : 'bin', p.x, p.z, 0.7, 7, i % 2 ? buildBench : buildBin);
}

for (let i = 0; i < 78; i += 1) {
  const p = landPoint();
  createEntity('tree', p.x, p.z, 1.05, 10, () => buildTree(rand(0.8, 1.2)));
}

for (let i = 0; i < 52; i += 1) {
  const roadZ = [-96, -64, -32, 0, 32, 64, 96][i % 7];
  createEntity('car', rand(-145, 12), roadZ + (i % 2 ? 1.25 : -1.25), 1.5, 18, () => buildCar(new THREE.Color().setHSL(Math.random(), 0.58, 0.5)), {
    velocity: new THREE.Vector3(i % 2 ? 5 : -5, 0, 0),
    bounds: { minX: -148, maxX: 16, minZ: roadZ - 2, maxZ: roadZ + 2 }
  });
}

for (let i = 0; i < 16; i += 1) {
  const roadZ = [-96, -64, -32, 0, 32, 64, 96][i % 7];
  createEntity('bus', rand(-145, 12), roadZ, 2.8, 38, buildBus, {
    velocity: new THREE.Vector3(i % 2 ? 2.7 : -2.7, 0, 0),
    bounds: { minX: -148, maxX: 16, minZ: roadZ - 2, maxZ: roadZ + 2 }
  });
}

for (let i = 0; i < 38; i += 1) {
  createEntity('house', rand(-142, -18), rand(-132, 132), 3.5, 55, () => buildHouse(new THREE.Color().setHSL(rand(0.06, 0.11), 0.26, rand(0.58, 0.73))));
}

for (let i = 0; i < 12; i += 1) {
  createEntity('warehouse', rand(-5, 18), rand(-88, 18), 5.4, 95, buildWarehouse);
}

for (let i = 0; i < 7; i += 1) {
  createEntity('crane', rand(15, 35), -72 + i * 18, 6.2, 120, buildCrane);
}

for (let i = 0; i < 110; i += 1) {
  const p = seaPoint();
  createEntity('fish', p.x, p.z, 0.45, 4, () => buildFish(new THREE.Color().setHSL(rand(0.02, 0.16), 0.75, 0.58)), {
    y: -0.05,
    velocity: new THREE.Vector3(rand(-1.8, 1.8), 0, rand(-1.2, 1.2)),
    bounds: { minX: 28, maxX: 170, minZ: -168, maxZ: 168 }
  });
}

for (let i = 0; i < 28; i += 1) {
  const p = seaPoint();
  createEntity('boat', p.x, p.z, 1.7, 24, () => buildBoat(rand(0.8, 1.15)), {
    y: 0.05,
    velocity: new THREE.Vector3(rand(-1.4, 1.4), 0, rand(-1.2, 1.2)),
    bounds: { minX: 26, maxX: 170, minZ: -168, maxZ: 168 }
  });
}

for (let i = 0; i < 12; i += 1) {
  const p = seaPoint();
  createEntity('ship', p.x, p.z, 6.8, 160, buildShip, {
    y: 0.05,
    velocity: new THREE.Vector3(rand(-0.7, 0.7), 0, rand(-0.45, 0.45)),
    bounds: { minX: 30, maxX: 170, minZ: -165, maxZ: 165 }
  });
}

for (let i = 0; i < 9; i += 1) {
  const p = seaPoint();
  createEntity('submarine', p.x, p.z, 5.6, 130, buildSubmarine, {
    y: -0.15,
    velocity: new THREE.Vector3(rand(-0.45, 0.45), 0, rand(-0.4, 0.4)),
    bounds: { minX: 32, maxX: 170, minZ: -165, maxZ: 165 }
  });
}

for (let i = 0; i < 10; i += 1) {
  createEntity('plane', rand(-165, 160), rand(-160, 160), 7.8, 220, buildPlane, {
    y: rand(12, 19),
    velocity: new THREE.Vector3(rand(8, 12), 0, rand(-1, 1)),
    bounds: { minX: -178, maxX: 178, minZ: -172, maxZ: 172 }
  });
}

for (const island of islandZones) {
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

const holeWall = new THREE.Mesh(
  new THREE.CylinderGeometry(0.84, 0.52, 1.9, 64, 1, true),
  new THREE.MeshStandardMaterial({
    color: 0x09090d,
    roughness: 0.96,
    metalness: 0,
    side: THREE.BackSide
  })
);

holeWall.position.y = -0.3;

const holeRim = new THREE.Mesh(
  new THREE.TorusGeometry(0.98, 0.08, 10, 72),
  new THREE.MeshStandardMaterial({
    color: 0x17131f,
    roughness: 0.72,
    metalness: 0.08
  })
);

holeRim.rotation.x = Math.PI / 2;
holeRim.position.y = 0.66;

hole.add(holeShadow, holeCore, holeGlow, holeWall, holeRim);
hole.position.set(-82, 0, -78);

const holePosition = new THREE.Vector3(-82, 0, -78);

function capacity() {
  return state.radius * 0.82;
}

function grow(amount) {
  state.radius = Math.min(24, state.radius + amount);
}

function swallow(entity) {
  const data = entity.userData;

  data.swallowing = true;
  data.progress = 0;
  data.startScale = entity.scale.clone();
  data.startY = entity.position.y;
  data.startRotation = entity.rotation.clone();
  data.fallVelocity = 0;

  const dx = entity.position.x - holePosition.x;
  const dz = entity.position.z - holePosition.z;
  const length = Math.max(0.001, Math.hypot(dx, dz));
  const rimDistance = Math.max(
    state.radius * 0.72,
    state.radius - data.size * 0.22
  );

  data.rimTarget = new THREE.Vector3(
    holePosition.x + (dx / length) * rimDistance,
    entity.position.y,
    holePosition.z + (dz / length) * rimDistance
  );

  swallowers.push(entity);
}

function checkSwallow() {
  for (const entity of entities) {
    if (!entity.visible || entity.userData.swallowing) continue;

    const data = entity.userData;
    const distance = Math.hypot(
      entity.position.x - holePosition.x,
      entity.position.z - holePosition.z
    );

    if (data.type === 'plane') {
      const influence = state.radius * 2.6 + data.size;

      if (distance < influence) {
        data.airPulled = true;

        entity.position.y = THREE.MathUtils.lerp(
          entity.position.y,
          hole.position.y + 1.8,
          0.035
        );

        entity.rotation.z = THREE.MathUtils.lerp(
          entity.rotation.z,
          -0.65,
          0.045
        );

        if (
          distance < state.radius * 0.95 + data.size * 0.45 &&
          entity.position.y < hole.position.y + 3
        ) {
          swallow(entity);
        }
      } else {
        data.airPulled = false;
      }

      continue;
    }

    if (distance < state.radius * 0.9 + data.size * 0.55) {
      swallow(entity);
    }
  }
}

function updateSwallow(delta) {
  for (let i = swallowers.length - 1; i >= 0; i -= 1) {
    const entity = swallowers[i];
    const data = entity.userData;
    const sizeFactor = THREE.MathUtils.clamp(data.size / 7, 0.08, 1.4);

    data.progress = Math.min(
      1,
      data.progress + delta * (0.72 + state.radius * 0.016 + 0.28 / (1 + sizeFactor))
    );

    const p = data.progress;

    if (p < 0.42) {
      const edgeProgress = THREE.MathUtils.smoothstep(p / 0.42, 0, 1);

      data.rimTarget.x = THREE.MathUtils.lerp(
        data.rimTarget.x,
        holePosition.x + (data.rimTarget.x - holePosition.x) * 0.985,
        0.08
      );

      data.rimTarget.z = THREE.MathUtils.lerp(
        data.rimTarget.z,
        holePosition.z + (data.rimTarget.z - holePosition.z) * 0.985,
        0.08
      );

      entity.position.x = THREE.MathUtils.lerp(
        entity.position.x,
        data.rimTarget.x,
        0.055 + edgeProgress * 0.08
      );

      entity.position.z = THREE.MathUtils.lerp(
        entity.position.z,
        data.rimTarget.z,
        0.055 + edgeProgress * 0.08
      );

      entity.position.y = THREE.MathUtils.lerp(
        data.startY,
        data.startY - data.size * 0.06,
        edgeProgress
      );

      const lean = edgeProgress * (0.16 + sizeFactor * 0.34);
      entity.rotation.x = data.startRotation.x + data.fallSpin.x * lean * 0.2;
      entity.rotation.z = data.startRotation.z + data.fallSpin.z * lean * 0.2;
    } else if (p < 0.7) {
      const tipProgress = THREE.MathUtils.smoothstep((p - 0.42) / 0.28, 0, 1);
      const centerPull = 0.08 + tipProgress * 0.16;

      entity.position.x = THREE.MathUtils.lerp(
        entity.position.x,
        holePosition.x,
        centerPull
      );

      entity.position.z = THREE.MathUtils.lerp(
        entity.position.z,
        holePosition.z,
        centerPull
      );

      entity.position.y = THREE.MathUtils.lerp(
        data.startY - data.size * 0.06,
        -0.7 - data.size * 0.18,
        tipProgress
      );

      entity.rotation.x += delta * (1.1 + Math.abs(data.fallSpin.x) * 1.2);
      entity.rotation.z += delta * (0.9 + Math.abs(data.fallSpin.z) * 1.1);
      entity.rotation.y += delta * data.fallSpin.y * 0.7;
    } else {
      const fallProgress = (p - 0.7) / 0.3;

      data.fallVelocity += delta * (18 + data.size * 1.8);

      entity.position.x = THREE.MathUtils.lerp(
        entity.position.x,
        holePosition.x,
        0.16
      );

      entity.position.z = THREE.MathUtils.lerp(
        entity.position.z,
        holePosition.z,
        0.16
      );

      entity.position.y -= data.fallVelocity * delta;

      entity.rotation.x += delta * data.fallSpin.x * 2.2;
      entity.rotation.y += delta * data.fallSpin.y * 2.2;
      entity.rotation.z += delta * data.fallSpin.z * 2.2;

      const scale = THREE.MathUtils.lerp(
        1,
        0.18,
        THREE.MathUtils.smoothstep(fallProgress, 0.35, 1)
      );

      entity.scale.copy(data.startScale).multiplyScalar(scale);
    }

    if (p >= 1 || entity.position.y < -16 - data.size) {
      entity.visible = false;
      data.respawnTimer = rand(9, 22);

      state.score += Math.round(data.score * state.combo);
      state.swallowed += 1;
      state.combo = state.comboTimer > 0 ? Math.min(8, state.combo + 1) : 1;
      state.comboTimer = 3.2;

      grow(0.035 + data.size * 0.018);
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
  data.airPulled = false;
  data.fallVelocity = 0;
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

    if (entity.userData.type === 'plane' && entity.userData.airPulled) {
      entity.position.x +=
        (holePosition.x - entity.position.x) * delta * 0.18;
      entity.position.z +=
        (holePosition.z - entity.position.z) * delta * 0.18;
    } else {
      entity.position.addScaledVector(velocity, delta);
    }

    if (
      !['fish', 'boat', 'ship', 'submarine', 'plane'].includes(entity.userData.type)
    ) {
      entity.position.y = surfaceHeight(
        entity.position.x,
        entity.position.z
      ) + entity.userData.spawnPosition.y - surfaceHeight(
        entity.userData.spawnPosition.x,
        entity.userData.spawnPosition.z
      );
    }

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

  const targetY = surfaceHeight(
    holePosition.x,
    holePosition.z
  );

  hole.position.y = THREE.MathUtils.lerp(
    hole.position.y,
    targetY,
    0.18
  );

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
    hole.position.y,
    hole.position.z
  );
}

function updateHud() {
  document.querySelector('#score').textContent = state.score.toLocaleString('en-US');
  document.querySelector('#size').textContent = `${state.radius.toFixed(1)} m`;
  document.querySelector('#combo').textContent = `x${state.combo}`;

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

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', (event) => keys.add(event.code));
window.addEventListener('keyup', (event) => keys.delete(event.code));

resize();
updateHud();

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);

  if (state.started && !state.ended) {
    state.comboTimer = Math.max(0, state.comboTimer - delta);
    if (state.comboTimer === 0) state.combo = 1;

    moveHole(delta);
    updateMoving(delta);
    checkSwallow();
    updateSwallow(delta);
    updateRespawns(delta);
    updateCamera();
    updateMessage(delta);

  } else {
    updateCamera();
  }

  updateHud();
  renderer.render(scene, camera);
}

animate();
