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
  new THREE.PlaneGeometry(520, 520, 48, 48),
  new THREE.MeshStandardMaterial({
    color: 0x3197bd,
    roughness: 0.28,
    metalness: 0.04,
    transparent: true,
    opacity: 0.92
  })
);
ocean.rotation.x = -Math.PI / 2;
ocean.position.y = -0.42;
ocean.receiveShadow = true;
world.add(ocean);

const sandMaterial = new THREE.MeshStandardMaterial({
  color: 0xd8c27c,
  roughness: 1
});
const roadMaterial = new THREE.MeshStandardMaterial({
  color: 0x596165,
  roughness: 0.96
});
const pierMaterial = new THREE.MeshStandardMaterial({
  color: 0x9a724c,
  roughness: 0.92
});

function coastX(z) {
  return (
    25 +
    Math.sin(z * 0.018) * 12 +
    Math.sin(z * 0.041 + 1.2) * 6 +
    Math.cos(z * 0.009 - 0.5) * 8
  );
}

function mainlandHeight(x, z) {
  const coast = coastX(z);
  const inland = coast - x;

  if (inland < 0) return 0;

  const coastalRise = THREE.MathUtils.clamp(inland / 26, 0, 1);
  const plain =
    Math.sin(x * 0.026) * 0.22 +
    Math.cos(z * 0.021) * 0.18 +
    Math.sin((x + z) * 0.014) * 0.16;

  const hillFactor = THREE.MathUtils.smoothstep(-x, 62, 118);
  const hills =
    hillFactor *
    (
      1.2 +
      Math.sin(x * 0.044 + z * 0.014) * 0.8 +
      Math.cos(z * 0.037) * 0.55
    );

  const mountainFactor = THREE.MathUtils.smoothstep(-x, 118, 178);
  const mountains =
    mountainFactor *
    (
      5.5 +
      Math.sin(z * 0.025 + x * 0.014) * 2.3 +
      Math.cos(z * 0.052) * 1.4
    );

  return Math.max(
    0.05,
    coastalRise * (0.35 + plain + hills + mountains)
  );
}

const islandZones = [
  [92, -112, 24, 18, 2.4],
  [116, -30, 17, 13, 1.8],
  [96, 72, 23, 18, 2.8],
  [144, 104, 12, 9, 1.5],
  [134, 26, 10, 8, 1.25],
  [154, -68, 14, 11, 1.7]
];

function islandHeightAt(x, z) {
  let best = null;

  for (const [cx, cz, rx, rz, h] of islandZones) {
    const nx = (x - cx) / rx;
    const nz = (z - cz) / rz;
    const d = Math.sqrt(nx * nx + nz * nz);

    if (d <= 1) {
      const y = 0.06 + Math.pow(1 - d, 1.35) * h;
      if (!best || y > best.height) best = { height: y, island: [cx, cz, rx, rz, h] };
    }
  }

  return best;
}

function surfaceHeight(x, z) {
  if (x <= coastX(z)) return mainlandHeight(x, z);
  const island = islandHeightAt(x, z);
  return island ? island.height : 0;
}

function surfaceNormalAt(x, z) {
  const e = 0.9;
  const left = surfaceHeight(x - e, z);
  const right = surfaceHeight(x + e, z);
  const back = surfaceHeight(x, z - e);
  const front = surfaceHeight(x, z + e);

  return new THREE.Vector3(
    left - right,
    e * 2,
    back - front
  ).normalize();
}

function surfaceType(x, z) {
  const coast = coastX(z);
  const island = islandHeightAt(x, z);

  if (island) return 'island';
  if (x > coast + 1.8) return 'water';
  if (x > coast - 8) return 'beach';

  const h = mainlandHeight(x, z);
  if (h > 5.2) return 'mountain';
  if (h > 2.1) return 'hill';
  return 'plain';
}

function createMainlandGeometry() {
  const xSegments = 92;
  const zSegments = 112;
  const west = -235;
  const zMin = -220;
  const zMax = 220;
  const positions = [];
  const colors = [];
  const indices = [];

  for (let iz = 0; iz <= zSegments; iz += 1) {
    const vz = iz / zSegments;
    const z = THREE.MathUtils.lerp(zMin, zMax, vz);
    const east = coastX(z);

    for (let ix = 0; ix <= xSegments; ix += 1) {
      const ux = ix / xSegments;
      const x = THREE.MathUtils.lerp(west, east, ux);
      const y = mainlandHeight(x, z);
      positions.push(x, y, z);

      const h = y;
      let color;

      if (east - x < 8) {
        color = new THREE.Color(0xd5c07a);
      } else if (h > 5.2) {
        color = new THREE.Color(0x77766a);
      } else if (h > 2.1) {
        color = new THREE.Color(0x6f8d4b);
      } else {
        color = new THREE.Color(0x68a852);
      }

      colors.push(color.r, color.g, color.b);
    }
  }

  const row = xSegments + 1;
  for (let iz = 0; iz < zSegments; iz += 1) {
    for (let ix = 0; ix < xSegments; ix += 1) {
      const a = iz * row + ix;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const terrain = new THREE.Mesh(
  createMainlandGeometry(),
  new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0.01
  })
);
terrain.receiveShadow = true;
world.add(terrain);

function createCoastRibbon(width, material, offset = 0) {
  const points = [];
  const segments = 120;

  for (let i = 0; i <= segments; i += 1) {
    const z = THREE.MathUtils.lerp(-190, 190, i / segments);
    const x = coastX(z) + offset;
    points.push(new THREE.Vector3(x, 0, z));
  }

  const positions = [];
  const indices = [];

  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tangent = next.clone().sub(prev).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    for (const sign of [-1, 1]) {
      const x = p.x + side.x * width * 0.5 * sign;
      const z = p.z + side.z * width * 0.5 * sign;
      const base = surfaceHeight(x, z);
      const y = Math.max(-0.28, base + 0.035);
      positions.push(x, y, z);
    }

    if (i < points.length - 1) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  world.add(mesh);
  return mesh;
}

createCoastRibbon(11, sandMaterial, -1.5);
const promenadeMaterial = new THREE.MeshStandardMaterial({
  color: 0xb8aa8b,
  roughness: 0.92
});
createCoastRibbon(3.4, promenadeMaterial, -8.8);

function createIslandGeometry(rx, rz, height, seed = 0) {
  const segments = 56;
  const rings = 6;
  const positions = [];
  const indices = [];

  for (let ring = 0; ring <= rings; ring += 1) {
    const t = ring / rings;

    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      const noise =
        1 +
        Math.sin(a * 3 + seed) * 0.09 +
        Math.sin(a * 7 + seed * 1.7) * 0.05 +
        Math.cos(a * 11 - seed * 0.8) * 0.03;
      const rf = t * noise;
      const x = Math.cos(a) * rx * rf;
      const z = Math.sin(a) * rz * rf;
      const y = height * Math.pow(1 - t, 1.3);
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
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

for (const [x, z, rx, rz, h] of islandZones) {
  const seed = x * 0.021 + z * 0.017;

  const beach = new THREE.Mesh(
    createIslandGeometry(rx + 3, rz + 3, 0.35, seed),
    sandMaterial
  );
  beach.position.set(x, -0.25, z);
  beach.receiveShadow = true;
  world.add(beach);

  const island = new THREE.Mesh(
    createIslandGeometry(rx, rz, h, seed + 1.4),
    new THREE.MeshStandardMaterial({
      color: 0x669d4e,
      roughness: 0.96
    })
  );
  island.position.set(x, 0, z);
  island.receiveShadow = true;
  world.add(island);
}

const roadRoutes = [];

function createRoadRibbon(points, width = 4.8, material = roadMaterial, closed = false) {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    closed,
    'catmullrom',
    0.16
  );

  const samples = Math.max(80, points.length * 34);
  const positions = [];
  const indices = [];

  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const p = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).setY(0).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
    const type = surfaceType(p.x, p.z);
    const y = type === 'water'
      ? 0.12
      : surfaceHeight(p.x, p.z) + 0.16;

    for (const sign of [-1, 1]) {
      positions.push(
        p.x + side.x * width * 0.5 * sign,
        y,
        p.z + side.z * width * 0.5 * sign
      );
    }

    if (i < samples) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  world.add(mesh);

  const route = { curve, width, closed, mesh };
  roadRoutes.push(route);
  return route;
}

const ringRoad = createRoadRibbon([
  [-142, -108],
  [-105, -132],
  [-58, -128],
  [-18, -96],
  [2, -48],
  [4, 6],
  [-12, 58],
  [-52, 104],
  [-102, 122],
  [-145, 88],
  [-160, 28],
  [-158, -46]
], 5.2, roadMaterial, true);

const coastalRoadPoints = [];
for (let z = -145; z <= 145; z += 22) {
  coastalRoadPoints.push([coastX(z) - 17, z]);
}
const coastalRoad = createRoadRibbon(coastalRoadPoints, 5, roadMaterial);

const inlandRoad = createRoadRibbon([
  [-168, -74],
  [-138, -68],
  [-108, -54],
  [-78, -30],
  [-46, -4],
  [-20, 22],
  [coastX(48) - 17, 48]
], 4.6);

const mountainRoad = createRoadRibbon([
  [-145, 88],
  [-160, 100],
  [-168, 118],
  [-154, 132],
  [-130, 134],
  [-102, 122]
], 4.2);

const portZ = -58;
const portCoastX = coastX(portZ);
const portRoad = createRoadRibbon([
  [portCoastX - 44, portZ - 20],
  [portCoastX - 26, portZ - 10],
  [portCoastX - 12, portZ],
  [portCoastX - 2, portZ]
], 5.4);

function addPier(z, length = 34, width = 5) {
  const startX = coastX(z) - 1;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.45, width),
    pierMaterial
  );
  mesh.position.set(startX + length * 0.5, 0.05, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  world.add(mesh);
}

[-88, -70, -58, -46, -34].forEach((z, i) => addPier(z, 30 + i * 4, 4.8));

function addTunnelPortal(route, t) {
  const p = route.curve.getPointAt(t);
  const tangent = route.curve.getTangentAt(t).setY(0).normalize();
  const y = surfaceHeight(p.x, p.z);

  const portal = new THREE.Group();
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, 0.8, 0.8),
    new THREE.MeshStandardMaterial({
      color: 0x474541,
      roughness: 1
    })
  );
  top.position.y = 2.6;

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 4.6, 0.8),
      top.material
    );
    leg.position.set(side * 2.2, 0.7, 0);
    portal.add(leg);
  }

  portal.add(top);
  portal.position.set(p.x, y, p.z);
  portal.rotation.y = Math.atan2(tangent.x, tangent.z);
  world.add(portal);
}

addTunnelPortal(mountainRoad, 0.28);
addTunnelPortal(mountainRoad, 0.62);

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
    moving: !!options.velocity || !!options.route,
    velocity: options.velocity || null,
    bounds: options.bounds || null,
    route: options.route || null,
    routeT: options.routeT ?? 0,
    routeSpeed: options.routeSpeed ?? 0,
    routeDirection: options.routeDirection ?? 1,
    laneOffset: options.laneOffset ?? 0,
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
  group.traverse((child) => {
    if (child.isMesh) child.renderOrder = 20;
  });

  entities.push(group);
  if (options.velocity || options.route) moving.push(group);
  world.add(group);
  return group;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function slopeAt(x, z) {
  const e = 1.4;
  const dx = surfaceHeight(x + e, z) - surfaceHeight(x - e, z);
  const dz = surfaceHeight(x, z + e) - surfaceHeight(x, z - e);
  return Math.hypot(dx, dz) / (e * 2);
}

function samplePoint(test, attempts = 120) {
  for (let i = 0; i < attempts; i += 1) {
    const x = rand(-172, 172);
    const z = rand(-168, 168);

    if (test(x, z)) return { x, z };
  }

  return { x: -70, z: 0 };
}

function plainPoint() {
  return samplePoint((x, z) => {
    const type = surfaceType(x, z);
    return (
      (type === 'plain' || type === 'hill') &&
      x < coastX(z) - 14 &&
      slopeAt(x, z) < 0.16
    );
  });
}

function treePoint() {
  return samplePoint((x, z) => {
    const type = surfaceType(x, z);
    return (
      (type === 'plain' || type === 'hill' || type === 'mountain') &&
      x < coastX(z) - 12 &&
      slopeAt(x, z) < 0.34
    );
  });
}

function waterPoint(clearance = 7) {
  return samplePoint((x, z) => {
    if (surfaceType(x, z) !== 'water') return false;
    if (x < coastX(z) + clearance) return false;
    return !islandHeightAt(x, z);
  });
}

function beachPoint(offsetMin = -4.5, offsetMax = 1.5) {
  const z = rand(-160, 160);
  return {
    x: coastX(z) + rand(offsetMin, offsetMax),
    z
  };
}

function islandPoint(zone) {
  const [cx, cz, rx, rz] = zone;

  for (let i = 0; i < 60; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.78;
    const x = cx + Math.cos(a) * rx * r;
    const z = cz + Math.sin(a) * rz * r;

    if (surfaceType(x, z) === 'island') return { x, z };
  }

  return { x: cx, z: cz };
}

function distanceToRoad(x, z) {
  let best = Infinity;

  for (const route of roadRoutes) {
    for (let i = 0; i <= 70; i += 1) {
      const p = route.curve.getPointAt(i / 70);
      best = Math.min(best, Math.hypot(x - p.x, z - p.z));
    }
  }

  return best;
}

function buildUmbrella() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.06, 1.7, 8),
    material(0xd8d0bd)
  );
  pole.position.y = 0.85;

  const top = new THREE.Mesh(
    new THREE.ConeGeometry(0.75, 0.35, 12),
    material(Math.random() > 0.5 ? 0xf06b62 : 0x5fb9e8)
  );
  top.position.y = 1.7;
  top.rotation.y = Math.random() * Math.PI;

  g.add(pole, top);
  return g;
}

function buildLounger() {
  const g = new THREE.Group();
  const bed = box(1.25, 0.12, 0.5, 0xf3e5bd);
  bed.position.y = 0.18;
  bed.rotation.z = -0.08;
  g.add(bed);
  return g;
}

function buildIceCreamStall() {
  const g = new THREE.Group();
  const base = box(1.5, 1.15, 1.1, 0xf3e5cc);
  base.position.y = 0.58;
  const roof = box(1.75, 0.14, 1.3, 0xf08b64);
  roof.position.y = 1.25;
  g.add(base, roof);
  return g;
}

function buildLifeguardTower() {
  const g = new THREE.Group();
  const platform = box(1.6, 0.18, 1.35, 0xe6d5a7);
  platform.position.y = 1.35;
  const cabin = box(1.2, 0.9, 1.05, 0xf2eee0);
  cabin.position.y = 1.88;
  const roof = box(1.45, 0.15, 1.25, 0xf26c5e);
  roof.position.y = 2.42;

  for (const x of [-0.58, 0.58]) {
    for (const z of [-0.45, 0.45]) {
      const leg = box(0.12, 1.35, 0.12, 0x886b4a);
      leg.position.set(x, 0.68, z);
      g.add(leg);
    }
  }

  g.add(platform, cabin, roof);
  return g;
}

function buildBoardRider(kind = 'skate') {
  const g = buildPerson();
  const board = box(
    kind === 'roller' ? 0.72 : 0.95,
    0.06,
    0.24,
    kind === 'roller' ? 0x5b87d8 : 0x33383a
  );
  board.position.y = 0.04;
  g.add(board);
  return g;
}

function buildBike(color = 0x3d77c4) {
  const g = new THREE.Group();
  const wheelMaterial = new THREE.MeshStandardMaterial({
    color: 0x25292b,
    roughness: 0.9
  });

  for (const x of [-0.5, 0.5]) {
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.045, 8, 16),
      wheelMaterial
    );
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(x, 0.32, 0);
    g.add(wheel);
  }

  const frame = box(0.9, 0.07, 0.07, color);
  frame.position.y = 0.48;
  g.add(frame);
  return g;
}

function createRoadVehicle(type, builder, size, score, route, index, speed) {
  const direction = index % 2 === 0 ? 1 : -1;
  const laneOffset = direction * (type === 'bus' ? 0.95 : 0.82);
  const t = (index * 0.137) % 1;
  const p = route.curve.getPointAt(t);
  const tangent = route.curve.getTangentAt(t).setY(0).normalize();
  const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
  const x = p.x + side.x * laneOffset;
  const z = p.z + side.z * laneOffset;

  return createEntity(type, x, z, size, score, builder, {
    route,
    routeT: t,
    routeSpeed: speed,
    routeDirection: direction,
    laneOffset,
    y: 0.02,
    rotation: Math.atan2(tangent.x * direction, tangent.z * direction)
  });
}

for (let i = 0; i < 74; i += 1) {
  const p = plainPoint();
  createEntity('person', p.x, p.z, 0.5, 5, buildPerson, { y: 0.02 });
}

for (let i = 0; i < 44; i += 1) {
  const p = plainPoint();

  if (distanceToRoad(p.x, p.z) < 5.8) {
    createEntity(
      i % 2 ? 'bench' : 'bin',
      p.x,
      p.z,
      0.7,
      7,
      i % 2 ? buildBench : buildBin,
      { y: 0.02 }
    );
  }
}

for (let i = 0; i < 118; i += 1) {
  const p = treePoint();
  createEntity(
    'tree',
    p.x,
    p.z,
    1.05,
    10,
    () => buildTree(rand(0.75, 1.3)),
    { y: 0 }
  );
}

for (let i = 0; i < 54; i += 1) {
  const p = plainPoint();
  if (distanceToRoad(p.x, p.z) < 8 || surfaceType(p.x, p.z) === 'mountain') continue;

  createEntity(
    'house',
    p.x,
    p.z,
    3.5,
    55,
    () => buildHouse(
      new THREE.Color().setHSL(
        rand(0.055, 0.105),
        0.24,
        rand(0.58, 0.72)
      )
    ),
    { y: 0 }
  );
}

const trafficRoutes = [ringRoad, coastalRoad, inlandRoad, mountainRoad];

for (let i = 0; i < 58; i += 1) {
  const route = trafficRoutes[i % trafficRoutes.length];
  createRoadVehicle(
    'car',
    () => buildCar(new THREE.Color().setHSL(Math.random(), 0.58, 0.52)),
    1.5,
    18,
    route,
    i,
    rand(4.2, 6.6)
  );
}

for (let i = 0; i < 15; i += 1) {
  const route = trafficRoutes[i % 3];
  createRoadVehicle('bus', buildBus, 2.8, 38, route, i, rand(2.6, 3.7));
}

for (let i = 0; i < 22; i += 1) {
  const p = beachPoint(-5.5, -1);
  createEntity('beach-person', p.x, p.z, 0.5, 5, buildPerson, { y: 0.02 });
}

for (let i = 0; i < 26; i += 1) {
  const p = beachPoint(-3.8, 0.4);
  createEntity('umbrella', p.x, p.z, 0.8, 8, buildUmbrella, { y: 0.01 });

  if (i % 2 === 0) {
    createEntity(
      'lounger',
      p.x - 1.2,
      p.z + rand(-1.2, 1.2),
      0.7,
      7,
      buildLounger,
      { y: 0.01 }
    );
  }
}

for (let i = 0; i < 8; i += 1) {
  const z = THREE.MathUtils.lerp(-145, 145, i / 7);
  const x = coastX(z) - 9.3;
  createEntity('ice-cream', x, z, 1.35, 15, buildIceCreamStall, { y: 0.02 });
}

const lifeguardStations = [];
for (let i = 0; i < 7; i += 1) {
  const z = THREE.MathUtils.lerp(-132, 132, i / 6);
  const x = coastX(z) - 4.6;
  const tower = createEntity(
    'lifeguard-tower',
    x,
    z,
    1.8,
    20,
    buildLifeguardTower,
    { y: 0.02 }
  );
  lifeguardStations.push({ tower, timer: rand(8, 22), active: null });
}

for (let i = 0; i < 16; i += 1) {
  const z = rand(-150, 150);
  const x = coastX(z) - 8.8;
  const rider = createEntity(
    'cyclist',
    x,
    z,
    0.8,
    9,
    () => buildBike(new THREE.Color().setHSL(Math.random(), 0.65, 0.48)),
    {
      velocity: new THREE.Vector3(0, 0, i % 2 ? 2.1 : -2.1),
      bounds: { minX: x - 3, maxX: x + 3, minZ: -158, maxZ: 158 },
      y: 0.02
    }
  );
  rider.userData.promennial = true;
}

for (let i = 0; i < 12; i += 1) {
  const z = rand(-150, 150);
  const x = coastX(z) - 8.8;
  const type = i % 2 ? 'skater' : 'roller';
  const rider = createEntity(
    type,
    x,
    z,
    0.65,
    8,
    () => buildBoardRider(type === 'roller' ? 'roller' : 'skate'),
    {
      velocity: new THREE.Vector3(0, 0, i % 2 ? 1.6 : -1.75),
      bounds: { minX: x - 3, maxX: x + 3, minZ: -158, maxZ: 158 },
      y: 0.02
    }
  );
  rider.userData.promennial = true;
}

for (let i = 0; i < 118; i += 1) {
  const p = waterPoint(9);
  createEntity(
    'fish',
    p.x,
    p.z,
    0.45,
    4,
    () => buildFish(
      new THREE.Color().setHSL(rand(0.02, 0.16), 0.75, 0.58)
    ),
    {
      y: -0.05,
      velocity: new THREE.Vector3(rand(-1.8, 1.8), 0, rand(-1.2, 1.2)),
      bounds: { minX: 20, maxX: 176, minZ: -174, maxZ: 174 }
    }
  );
}

for (let i = 0; i < 30; i += 1) {
  const p = waterPoint(10);
  createEntity('boat', p.x, p.z, 1.7, 24, () => buildBoat(rand(0.8, 1.15)), {
    y: 0.05,
    velocity: new THREE.Vector3(rand(-1.1, 1.1), 0, rand(-0.9, 0.9)),
    bounds: { minX: 20, maxX: 176, minZ: -174, maxZ: 174 }
  });
}

for (let i = 0; i < 12; i += 1) {
  const p = waterPoint(18);
  createEntity('ship', p.x, p.z, 6.8, 160, buildShip, {
    y: 0.05,
    velocity: new THREE.Vector3(rand(-0.55, 0.55), 0, rand(-0.38, 0.38)),
    bounds: { minX: 25, maxX: 176, minZ: -170, maxZ: 170 }
  });
}

for (let i = 0; i < 8; i += 1) {
  const p = waterPoint(18);
  createEntity('submarine', p.x, p.z, 5.6, 130, buildSubmarine, {
    y: -0.18,
    velocity: new THREE.Vector3(rand(-0.4, 0.4), 0, rand(-0.32, 0.32)),
    bounds: { minX: 25, maxX: 176, minZ: -170, maxZ: 170 }
  });
}

for (let i = 0; i < 9; i += 1) {
  createEntity(
    'plane',
    rand(-168, 168),
    rand(-164, 164),
    7.8,
    220,
    buildPlane,
    {
      y: rand(13, 20),
      velocity: new THREE.Vector3(rand(8, 12), 0, rand(-0.8, 0.8)),
      bounds: { minX: -178, maxX: 178, minZ: -174, maxZ: 174 }
    }
  );
}

for (const zone of islandZones) {
  for (let i = 0; i < 14; i += 1) {
    const p = islandPoint(zone);
    createEntity(
      'tree',
      p.x,
      p.z,
      1,
      10,
      () => buildTree(rand(0.72, 1.15)),
      { y: 0 }
    );
  }
}

const portBaseX = coastX(-58);
for (let i = 0; i < 9; i += 1) {
  const z = -92 + i * 8.5;
  createEntity(
    'warehouse',
    portBaseX - 24 - (i % 2) * 10,
    z,
    5.4,
    95,
    buildWarehouse,
    { y: 0 }
  );
}

for (let i = 0; i < 6; i += 1) {
  const z = -88 + i * 11;
  createEntity(
    'crane',
    coastX(z) - 3,
    z,
    6.2,
    120,
    buildCrane,
    { y: 0 }
  );
}

const hole = new THREE.Group();
world.add(hole);

const holeShadow = new THREE.Mesh(
  new THREE.CircleGeometry(1, 72),
  new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.82,
    depthTest: false,
    depthWrite: false
  })
);
holeShadow.rotation.x = -Math.PI / 2;
holeShadow.position.y = 0.015;

const holeCore = new THREE.Mesh(
  new THREE.CircleGeometry(0.82, 72),
  new THREE.MeshBasicMaterial({
    color: 0x000000,
    depthTest: false,
    depthWrite: false
  })
);
holeCore.rotation.x = -Math.PI / 2;
holeCore.position.y = 0.025;

const holeGlow = new THREE.Mesh(
  new THREE.RingGeometry(0.88, 1.2, 72),
  new THREE.MeshBasicMaterial({
    color: 0x774dff,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
);
holeGlow.rotation.x = -Math.PI / 2;
holeGlow.position.y = 0.035;

const holeWall = new THREE.Mesh(
  new THREE.CylinderGeometry(0.84, 0.52, 1.9, 64, 1, true),
  new THREE.MeshStandardMaterial({
    color: 0x09090d,
    roughness: 0.96,
    metalness: 0,
    side: THREE.BackSide
  })
);

holeWall.position.y = -0.92;

const holeRim = new THREE.Mesh(
  new THREE.TorusGeometry(0.98, 0.08, 10, 72),
  new THREE.MeshStandardMaterial({
    color: 0x17131f,
    roughness: 0.72,
    metalness: 0.08,
    depthTest: false,
    depthWrite: false
  })
);

holeRim.rotation.x = Math.PI / 2;
holeRim.position.y = 0.04;

holeShadow.renderOrder = 10;
holeCore.renderOrder = 11;
holeGlow.renderOrder = 12;
holeRim.renderOrder = 13;
holeWall.renderOrder = 9;

hole.add(holeShadow, holeCore, holeGlow, holeWall, holeRim);
hole.position.set(-82, 0, -78);

const holePosition = new THREE.Vector3(-82, 0, -78);

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

function updateRouteVehicle(entity, delta) {
  const data = entity.userData;
  const route = data.route;

  data.routeT +=
    delta *
    data.routeSpeed *
    data.routeDirection /
    310;

  if (route.closed) {
    data.routeT = (data.routeT % 1 + 1) % 1;
  } else {
    if (data.routeT > 1) {
      data.routeT = 1;
      data.routeDirection *= -1;
    }

    if (data.routeT < 0) {
      data.routeT = 0;
      data.routeDirection *= -1;
    }
  }

  const p = route.curve.getPointAt(data.routeT);
  const tangent = route.curve
    .getTangentAt(data.routeT)
    .setY(0)
    .normalize();

  if (data.routeDirection < 0) tangent.multiplyScalar(-1);

  const side = new THREE.Vector3(
    -tangent.z,
    0,
    tangent.x
  );

  entity.position.x = p.x + side.x * data.laneOffset;
  entity.position.z = p.z + side.z * data.laneOffset;
  entity.position.y =
    surfaceHeight(entity.position.x, entity.position.z) +
    0.02;

  entity.rotation.y = Math.atan2(
    tangent.x,
    tangent.z
  );
}

function updatePromenadeRider(entity, delta) {
  const data = entity.userData;
  const direction = Math.sign(data.velocity.z) || 1;

  entity.position.z += data.velocity.z * delta;

  if (entity.position.z > 158) {
    entity.position.z = 158;
    data.velocity.z = -Math.abs(data.velocity.z);
  }

  if (entity.position.z < -158) {
    entity.position.z = -158;
    data.velocity.z = Math.abs(data.velocity.z);
  }

  const z = entity.position.z;
  const nextZ = z + direction * 0.8;
  const x = coastX(z) - 8.8;
  const nextX = coastX(nextZ) - 8.8;

  entity.position.x = x;
  entity.position.y = surfaceHeight(x, z) + 0.07;
  entity.rotation.y = Math.atan2(
    nextX - x,
    nextZ - z
  );
}

function keepWaterEntityInWater(entity) {
  const data = entity.userData;
  const type = surfaceType(
    entity.position.x,
    entity.position.z
  );

  if (type === 'water') return;

  const z = THREE.MathUtils.clamp(
    entity.position.z,
    -168,
    168
  );

  entity.position.x = coastX(z) + rand(12, 34);
  entity.position.z = z + rand(-5, 5);

  if (data.velocity) {
    if (entity.position.x < coastX(entity.position.z) + 12) {
      data.velocity.x = Math.abs(data.velocity.x);
    }
  }
}

function updateMoving(delta) {
  for (const entity of moving) {
    if (!entity.visible || entity.userData.swallowing) continue;

    const data = entity.userData;

    if (data.route) {
      updateRouteVehicle(entity, delta);
      continue;
    }

    if (data.promennial) {
      updatePromenadeRider(entity, delta);
      continue;
    }

    const velocity = data.velocity;
    if (!velocity) continue;

    if (data.type === 'plane' && data.airPulled) {
      entity.position.x +=
        (holePosition.x - entity.position.x) * delta * 0.18;
      entity.position.z +=
        (holePosition.z - entity.position.z) * delta * 0.18;
    } else {
      entity.position.addScaledVector(velocity, delta);
    }

    if (['fish', 'boat', 'ship', 'submarine'].includes(data.type)) {
      keepWaterEntityInWater(entity);
    }

    const b = data.bounds;
    if (!b) continue;

    if (
      entity.position.x < b.minX ||
      entity.position.x > b.maxX
    ) {
      velocity.x *= -1;
    }

    if (
      entity.position.z < b.minZ ||
      entity.position.z > b.maxZ
    ) {
      velocity.z *= -1;
    }

    if (data.type !== 'plane') {
      entity.rotation.y = Math.atan2(
        velocity.x,
        velocity.z
      );
    }
  }
}

const rescueActors = [];

function startRescue(station) {
  const tower = station.tower;
  const z = tower.position.z + rand(-4, 4);
  const waterX = coastX(z) + rand(8, 14);

  const swimmer = createEntity(
    'swimmer',
    waterX,
    z,
    0.45,
    5,
    buildPerson,
    { y: -0.05 }
  );

  const lifeguard = createEntity(
    'lifeguard',
    tower.position.x,
    tower.position.z,
    0.5,
    6,
    buildPerson,
    { y: 0.02 }
  );

  lifeguard.userData.ambient = true;
  swimmer.userData.ambient = true;

  station.active = {
    lifeguard,
    swimmer,
    phase: 'out',
    waterX,
    z
  };

  rescueActors.push(station.active);
}

function updateLifeguards(delta) {
  for (const station of lifeguardStations) {
    if (!station.active) {
      station.timer -= delta;

      if (station.timer <= 0) {
        startRescue(station);
      }

      continue;
    }

    const rescue = station.active;
    const guard = rescue.lifeguard;
    const swimmer = rescue.swimmer;

    if (
      !guard.visible ||
      !swimmer.visible ||
      guard.userData.swallowing ||
      swimmer.userData.swallowing
    ) {
      station.active = null;
      station.timer = rand(12, 28);
      continue;
    }

    if (rescue.phase === 'out') {
      const dx = swimmer.position.x - guard.position.x;
      const dz = swimmer.position.z - guard.position.z;
      const distance = Math.hypot(dx, dz);

      if (distance < 1.2) {
        rescue.phase = 'back';
      } else {
        const speed = delta * 4.2;
        guard.position.x += (dx / distance) * speed;
        guard.position.z += (dz / distance) * speed;
        guard.position.y =
          guard.position.x > coastX(guard.position.z)
            ? -0.03
            : surfaceHeight(guard.position.x, guard.position.z) + 0.02;
        guard.rotation.y = Math.atan2(dx, dz);
      }
    } else {
      const dx = station.tower.position.x - guard.position.x;
      const dz = station.tower.position.z - guard.position.z;
      const distance = Math.hypot(dx, dz);

      swimmer.position.x = guard.position.x + 0.55;
      swimmer.position.z = guard.position.z + 0.25;
      swimmer.position.y = guard.position.y;

      if (distance < 1.2) {
        guard.visible = false;
        swimmer.visible = false;
        guard.userData.respawnTimer = 0;
        swimmer.userData.respawnTimer = 0;
        station.active = null;
        station.timer = rand(14, 32);
      } else {
        const speed = delta * 3.6;
        guard.position.x += (dx / distance) * speed;
        guard.position.z += (dz / distance) * speed;
        guard.position.y =
          guard.position.x > coastX(guard.position.z)
            ? -0.03
            : surfaceHeight(guard.position.x, guard.position.z) + 0.02;
        guard.rotation.y = Math.atan2(dx, dz);
      }
    }
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

  hole.position.y = targetY + 0.055;

  const normal = surfaceNormalAt(
    holePosition.x,
    holePosition.z
  );

  hole.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    normal
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
    updateLifeguards(delta);
    checkSwallow();
    updateSwallow(delta);
    updateRespawns(delta);
    updateCamera();

  } else {
    updateCamera();
  }

  updateHud();
  renderer.render(scene, camera);
}

animate();
