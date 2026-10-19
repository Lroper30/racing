import * as THREE from "three";

// ============================================================
// APEX RACING 3D — RACING ENGINE
// ============================================================

const $ = id => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

const renderer = new THREE.WebGLRenderer({
  canvas: $("world"),
  antialias: true,
  powerPreference: "high-performance"
});

renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x91b7c7);
scene.fog = new THREE.Fog(0x91b7c7, 100, 290);

const camera = new THREE.PerspectiveCamera(
  68, innerWidth / innerHeight, 0.1, 1000
);

scene.add(new THREE.HemisphereLight(0xe5f6ff, 0x465343, 2.0));

const sun = new THREE.DirectionalLight(0xfff1d6, 3.0);
sun.position.set(-55, 100, -35);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -110;
sun.shadow.camera.right = 110;
sun.shadow.camera.top = 110;
sun.shadow.camera.bottom = -110;
sun.shadow.bias = -0.0005;
scene.add(sun);

const mat = (color, roughness = 0.75, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

const M = {
  grass: mat(0x47734a),
  road: mat(0x303538, 0.95),
  white: mat(0xf1f0e7),
  red: mat(0xe4483c),
  black: mat(0x111718, 0.35, 0.2),
  glass: mat(0x83c4d7, 0.22, 0.25),
  lime: mat(0xd8ff3e, 0.3, 0.12),
  trunk: mat(0x604630),
  curbRed: mat(0xe6483d),
  curbWhite: mat(0xf1eee2),
  barrier: mat(0x9ba9a7, 0.45, 0.12),
  tire: mat(0x17191a, 0.95),
  metal: mat(0x8e9c9b, 0.3, 0.8)
};

// ============================================================
// TRACK CONFIGURATION
// ============================================================

const MAPS = {
  coast: {
    name: "Coastal GP",
    rx: 58, rz: 35, width: 14,
    grass: 0x47734a, sky: 0x91b7c7,
    scenery: "coast", difficulty: 1
  },
  desert: {
    name: "Desert Canyon",
    rx: 63, rz: 31, width: 13,
    grass: 0xb99a65, sky: 0xe8bd86,
    scenery: "desert", difficulty: 1.1
  },
  forest: {
    name: "Forest Run",
    rx: 49, rz: 42, width: 12,
    grass: 0x294e37, sky: 0x8ba9b0,
    scenery: "forest", difficulty: 1.08
  },
  city: {
    name: "City Circuit",
    rx: 54, rz: 34, width: 15,
    grass: 0x596465, sky: 0x9aabb6,
    scenery: "city", difficulty: 1.05
  }
};

const CAR_TYPES = {
  formula: {
    name: "Formula Racer", color: 0xd8ff3e,
    acceleration: 29, topSpeed: 69,
    handling: 1.18, grip: 1.15, braking: 36,
    width: 1.9, length: 4.1, price: 0
  },
  gt: {
    name: "GT Sport", color: 0xe4483c,
    acceleration: 25, topSpeed: 63,
    handling: 0.98, grip: 1.05, braking: 34,
    width: 2.0, length: 4.5, price: 0
  },
  rally: {
    name: "Rally Racer", color: 0x36a6ed,
    acceleration: 27, topSpeed: 59,
    handling: 1.3, grip: 1.24, braking: 32,
    width: 2.0, length: 4.0, price: 0
  },
  hyper: {
    name: "Hypercar", color: 0xf1f0e7,
    acceleration: 34, topSpeed: 78,
    handling: 0.94, grip: 0.97, braking: 39,
    width: 2.05, length: 4.7, price: 0
  }
};

const AI_LEVELS = {
  easy:   { speed: 19, skill: 0.78, wobble: 0.55 },
  medium: { speed: 25, skill: 0.94, wobble: 0.25 },
  hard:   { speed: 30, skill: 1.04, wobble: 0.10 },
  expert: { speed: 35, skill: 1.12, wobble: 0.025 }
};

let mapId = "coast";
let mapConfig = MAPS[mapId];
let selectedCarId = "formula";
let selectedCar = CAR_TYPES[selectedCarId];
let selectedTrackId = mapId;
let selectedDifficulty = "medium";

let credits = 1500;
let bestTime = null;
let upgrades = {};
let unlockedCars = ["formula", "gt", "rally", "hyper"];

try {
  credits = Number(localStorage.getItem("apexCredits")) || 1500;
  bestTime = Number(localStorage.getItem("apexBestTime")) || null;
  const saved = JSON.parse(localStorage.getItem("apexGarage") || "{}");
  selectedCarId = CAR_TYPES[saved.car] ? saved.car : "formula";
  selectedCar = CAR_TYPES[selectedCarId];
  mapId = MAPS[saved.track] ? saved.track : "coast";
  mapConfig = MAPS[mapId];
  selectedDifficulty = AI_LEVELS[saved.difficulty] ? saved.difficulty : "medium";
  upgrades = saved.upgrades || {};
  unlockedCars = Array.isArray(saved.unlockedCars)
    ? [...new Set(["formula", ...saved.unlockedCars.filter(id => CAR_TYPES[id])])]
    : ["formula", "gt", "rally", "hyper"];
} catch (error) {
  console.warn("Garage save could not be loaded.", error);
}

const upgradeDefinitions = {
  engine: { name: "ENGINE POWER", description: "Faster acceleration", base: 450 },
  brakes: { name: "RACING BRAKES", description: "Shorter braking distance", base: 400 },
  grip: { name: "TIRE & GRIP", description: "Improved cornering traction", base: 500 },
  aero: { name: "AERODYNAMICS", description: "Higher potential top speed", base: 600 }
};

function getUpgradeLevel(id) {
  return clamp(Number(upgrades[selectedCarId]?.[id]) || 0, 0, 5);
}

function getStats() {
  const level = id => getUpgradeLevel(id);
  return {
    acceleration: selectedCar.acceleration * (1 + level("engine") * 0.09),
    topSpeed: selectedCar.topSpeed * (1 + level("aero") * 0.045),
    handling: selectedCar.handling * (1 + level("grip") * 0.07),
    grip: selectedCar.grip * (1 + level("grip") * 0.09),
    braking: selectedCar.braking * (1 + level("brakes") * 0.1)
  };
}

function saveGarage() {
  try {
    localStorage.setItem("apexCredits", String(credits));
    localStorage.setItem("apexBestTime", String(bestTime || ""));
    localStorage.setItem("apexGarage", JSON.stringify({
      car: selectedCarId,
      track: mapId,
      difficulty: selectedDifficulty,
      upgrades,
      unlockedCars
    }));
  } catch (error) {
    console.warn("Garage saving unavailable.", error);
  }
}

function updateCredits() {
  $("credits").textContent = Math.floor(credits).toLocaleString();
  saveGarage();
}

// ============================================================
// WORLD GENERATION
// ============================================================

const world = new THREE.Group();
scene.add(world);

let trackCurve;
let barriers = [];
let checkpointObjects = [];
let roadMesh = null;

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children[0];
    group.remove(child);
    child.traverse?.(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material && obj.material !== M.road &&
          obj.material !== M.white && obj.material !== M.red &&
          obj.material !== M.black && obj.material !== M.lime &&
          obj.material !== M.tire && obj.material !== M.metal &&
          obj.material !== M.barrier && obj.material !== M.grass &&
          obj.material !== M.trunk && obj.material !== M.curbRed &&
          obj.material !== M.curbWhite) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}

function addWorld(mesh) {
  world.add(mesh);
  return mesh;
}

function createTrackCurve(config) {
  const points = [];

  for (let i = 0; i < 320; i++) {
    const a = i / 320 * Math.PI * 2;
    let x = config.rx * Math.cos(a);
    let z = config.rz * Math.sin(a);

    if (config.scenery === "city") {
      x += 5.5 * Math.sin(a * 3) + 2 * Math.sin(a * 7);
      z += 3.0 * Math.sin(a * 4);
    } else if (config.scenery === "forest") {
      x += 6.0 * Math.sin(a * 2) + 2.5 * Math.cos(a * 5);
      z += 4.2 * Math.cos(a * 3);
    } else if (config.scenery === "desert") {
      x += 4.5 * Math.cos(a * 3) + 2 * Math.sin(a * 6);
      z += 3.2 * Math.sin(a * 5);
    } else {
      x += 2.2 * Math.sin(a * 3);
      z += 1.6 * Math.sin(a * 5);
    }

    points.push(new THREE.Vector3(x, 0, z));
  }

  return new THREE.CatmullRomCurve3(points, true, "centripetal");
}

function poseAt(progress, lane = 0) {
  const t = ((progress % 1) + 1) % 1;
  const position = trackCurve.getPointAt(t);
  const tangent = trackCurve.getTangentAt(t);
  const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

  position.addScaledVector(normal, lane);

  return {
    position, tangent, normal,
    yaw: Math.atan2(tangent.x, tangent.z)
  };
}

function nearestTrackPoint(position) {
  let bestT = 0;
  let bestD = Infinity;

  // Coarse search followed by a fine local search.
  for (let i = 0; i < 240; i++) {
    const t = i / 240;
    const p = trackCurve.getPointAt(t);
    const d = (p.x - position.x) ** 2 + (p.z - position.z) ** 2;
    if (d < bestD) { bestD = d; bestT = t; }
  }

  const start = bestT;
  for (let i = -12; i <= 12; i++) {
    const t = ((start + i / 2400) % 1 + 1) % 1;
    const p = trackCurve.getPointAt(t);
    const d = (p.x - position.x) ** 2 + (p.z - position.z) ** 2;
    if (d < bestD) { bestD = d; bestT = t; }
  }

  const pose = poseAt(bestT);
  const delta = position.clone().sub(pose.position);
  return {
    progress: bestT,
    distance: Math.sqrt(bestD),
    lateral: delta.dot(pose.normal),
    pose
  };
}

function buildRoad() {
  const vertices = [];
  const indices = [];
  const steps = 1400;
  const half = mapConfig.width / 2;

  for (let i = 0; i <= steps; i++) {
    const p = trackCurve.getPointAt(i / steps);
    const tangent = trackCurve.getTangentAt(i / steps);
    const n = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    vertices.push(
      p.x + n.x * half, 0.04, p.z + n.z * half,
      p.x - n.x * half, 0.04, p.z - n.z * half
    );

    if (i < steps) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = M.road.clone();
  material.side = THREE.DoubleSide;
  roadMesh = addWorld(new THREE.Mesh(geometry, material));
  roadMesh.receiveShadow = true;
}

function buildCurbsAndBarriers() {
  barriers = [];

  const count = 430;

  for (let i = 0; i < count; i++) {
    const p = poseAt(i / count);

    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.09, 0.65),
        i % 2 ? M.curbRed : M.curbWhite
      );
      curb.position.copy(p.position);
      curb.position.addScaledVector(p.normal, side * (mapConfig.width / 2 - 0.4));
      curb.position.y = 0.09;
      curb.rotation.y = p.yaw;
      addWorld(curb);

      // Each barrier segment is also a physics collider.
      const lane = side * (mapConfig.width / 2 + 2.0);
      const bp = poseAt(i / count, lane);

      const barrier = new THREE.Mesh(
        new THREE.BoxGeometry(1.55, 0.85, 0.65),
        i % 6 < 3 ? M.white : M.red
      );
      barrier.position.copy(bp.position);
      barrier.position.y = 0.48;
      barrier.rotation.y = bp.yaw;
      barrier.castShadow = true;
      addWorld(barrier);

      barriers.push({
        position: bp.position.clone(),
        tangent: bp.tangent.clone(),
        normal: bp.normal.clone(),
        yaw: bp.yaw,
        halfLength: 0.85,
        halfWidth: 0.58,
        side
      });
    }
  }
}

function buildStartFinish() {
  const p = poseAt(0);
  const group = new THREE.Group();

  for (let i = 0; i < 20; i++) {
    const tile = new THREE.Mesh(
      new THREE.BoxGeometry(mapConfig.width / 20, 0.06, 1.15),
      i % 2 ? M.black : M.white
    );
    tile.position.x = (i - 9.5) * mapConfig.width / 20;
    group.add(tile);
  }

  group.position.copy(p.position);
  group.position.y = 0.1;
  group.rotation.y = p.yaw;
  addWorld(group);

  // Grand prix start gantry.
  const gantry = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(mapConfig.width + 4, 0.35, 0.5),
    M.black
  );
  beam.position.y = 5;
  gantry.add(beam);

  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 5, 0.4), M.black
    );
    post.position.set(side * (mapConfig.width / 2 + 1.5), 2.5, 0);
    gantry.add(post);
  }

  for (let i = 0; i < 12; i++) {
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 10, 8),
      new THREE.MeshStandardMaterial({
        color: 0xff2525,
        emissive: 0xff1515,
        emissiveIntensity: 2
      })
    );
    light.position.set((i - 5.5) * 0.6, 5.3, 0);
    gantry.add(light);
  }

  gantry.position.copy(p.position);
  gantry.rotation.y = p.yaw;
  addWorld(gantry);
}

function addTree(x, z, scale = 1) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16 * scale, 0.32 * scale, 2.1 * scale, 7),
    M.trunk
  );
  trunk.position.set(x, 1.05 * scale, z);
  trunk.castShadow = true;
  addWorld(trunk);

  const colors = mapConfig.scenery === "desert"
    ? [0x7b8952, 0xa1a06a, 0x667746]
    : [0x28543a, 0x38734a, 0x1e4933];

  for (let i = 0; i < 2; i++) {
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry((1.6 - i * 0.3) * scale, 3.5 * scale, 8),
      mat(colors[(Math.random() * colors.length) | 0])
    );
    crown.position.set(x, (2.6 + i * 1.1) * scale, z);
    crown.castShadow = true;
    addWorld(crown);
  }
}

function addBuilding(x, z, scale = 1) {
  const height = (6 + Math.random() * 17) * scale;
  const colors = [0x56616a, 0x777c80, 0x464e58, 0x8b8b83];

  const building = new THREE.Mesh(
    new THREE.BoxGeometry(5 * scale, height, 5 * scale),
    mat(colors[(Math.random() * colors.length) | 0])
  );
  building.position.set(x, height / 2, z);
  building.castShadow = true;
  addWorld(building);

  const windowMaterial = mat(0xb6e5ef, 0.25, 0.1);

  for (let floor = 1; floor < height / 2; floor++) {
    for (let col = -1; col <= 1; col++) {
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(0.65 * scale, 0.5 * scale, 0.05),
        windowMaterial
      );
      win.position.set(
        x + col * 1.25 * scale,
        floor * 2 * scale,
        z + 2.53 * scale
      );
      addWorld(win);
    }
  }
}

function buildEnvironment() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200),
    mat(mapConfig.grass)
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  ground.receiveShadow = true;
  addWorld(ground);

  // Map-specific scenery.
  for (let i = 0; i < 150; i++) {
    const a = i * 2.39996;
    const radius = 28 + Math.random() * 75;
    const x = Math.cos(a) * (mapConfig.rx + radius);
    const z = Math.sin(a) * (mapConfig.rz + radius);

    if (mapConfig.scenery === "city") {
      addBuilding(x, z, 0.7 + Math.random() * 0.65);
    } else if (mapConfig.scenery === "coast") {
      if (Math.abs(z) > mapConfig.rz + 35) {
        addTree(x, z, 0.65 + Math.random() * 0.8);
      }
    } else {
      addTree(x, z, 0.65 + Math.random() * 0.9);
    }
  }

  if (mapConfig.scenery === "coast") {
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(1000, 1000),
      mat(0x247c99, 0.25, 0.15)
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.27, 360);
    addWorld(water);

    // Sandy beach strips.
    const beach = new THREE.Mesh(
      new THREE.PlaneGeometry(280, 55),
      mat(0xd3c39b)
    );
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(0, -0.16, 125);
    addWorld(beach);
  }

  if (mapConfig.scenery === "desert") {
    for (let i = 0; i < 55; i++) {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1.2 + Math.random() * 3.5, 0),
        mat(i % 2 ? 0x9d7951 : 0xc3a16f)
      );
      rock.position.set(
        (Math.random() - 0.5) * 310,
        1 + Math.random() * 2,
        (Math.random() - 0.5) * 230
      );
      rock.scale.y = 0.75;
      addWorld(rock);
    }
  }

  if (mapConfig.scenery === "forest") {
    // Forest boulders and low roadside shrubs.
    for (let i = 0; i < 40; i++) {
      const shrub = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.0 + Math.random() * 1.2, 1),
        mat(0x1e432d)
      );
      shrub.position.set(
        (Math.random() - 0.5) * 250,
        0.7,
        (Math.random() - 0.5) * 200
      );
      shrub.scale.y = 0.65;
      addWorld(shrub);
    }
  }

  if (mapConfig.scenery === "city") {
    // Simple city street lamps.
    for (let i = 0; i < 40; i++) {
      const p = poseAt(i / 40, mapConfig.width / 2 + 5);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.1, 5, 7),
        M.black
      );
      pole.position.copy(p.position);
      pole.position.y = 2.5;
      addWorld(pole);

      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.09, 0.09),
        M.black
      );
      arm.position.copy(p.position);
      arm.position.y = 4.8;
      arm.rotation.y = p.yaw;
      addWorld(arm);
    }
  }
}

function buildCheckpoints() {
  checkpointObjects = [];

  [0.25, 0.5, 0.75].forEach(progress => {
    const p = poseAt(progress);
    const gate = new THREE.Group();

    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 2.8, 0.16), M.lime
      );
      post.position.set(side * (mapConfig.width / 2 + 0.65), 1.4, 0);
      gate.add(post);
    }

    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(mapConfig.width + 1.3, 0.16, 0.16), M.lime
    );
    beam.position.y = 2.8;
    gate.add(beam);
    gate.position.copy(p.position);
    gate.rotation.y = p.yaw;
    addWorld(gate);

    checkpointObjects.push({ progress, position: p.position.clone() });
  });
}

function buildMap() {
  clearGroup(world);
  mapConfig = MAPS[mapId];
  trackCurve = createTrackCurve(mapConfig);

  scene.background = new THREE.Color(mapConfig.sky);
  scene.fog = new THREE.Fog(mapConfig.sky, 115, 300);

  buildEnvironment();
  buildRoad();
  buildCurbsAndBarriers();
  buildStartFinish();
  buildCheckpoints();

  placeCarsOnTrack();
  drawMinimap();
}

// ============================================================
// CAR CONSTRUCTION
// ============================================================

function createCar(type, isAI = false) {
  const car = new THREE.Group();
  const paint = mat(type.color, 0.25, 0.4);

  function piece(geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    car.add(mesh);
    return mesh;
  }

  // Chassis and sculpted bodywork.
  piece(new THREE.BoxGeometry(type.width, 0.42, type.length),
    paint, 0, 0.58, 0);

  piece(new THREE.BoxGeometry(type.width * 0.84, 0.2, type.length * 0.35),
    paint, 0, 0.78, type.length * 0.3);

  piece(new THREE.BoxGeometry(type.width * 0.63, 0.43, type.length * 0.35),
    M.black, 0, 0.98, -0.05);

  piece(new THREE.BoxGeometry(type.width * 0.48, 0.3, type.length * 0.2),
    M.glass, 0, 1.13, 0.02);

  // Front and rear aerodynamic elements.
  piece(new THREE.BoxGeometry(type.width + 0.45, 0.1, 0.32),
    M.black, 0, 0.42, type.length * 0.49);

  piece(new THREE.BoxGeometry(type.width + 0.3, 0.13, 0.38),
    M.black, 0, 0.93, -type.length * 0.43);

  const wheels = [];

  for (const x of [-1, 1]) {
    for (const z of [-type.length * 0.32, type.length * 0.32]) {
      const wheel = piece(
        new THREE.CylinderGeometry(0.37, 0.37, 0.28, 18),
        M.tire, x * type.width * 0.48, 0.39, z
      );
      wheel.rotation.z = Math.PI / 2;
      wheels.push(wheel);

      const rim = piece(
        new THREE.CylinderGeometry(0.19, 0.19, 0.3, 12),
        M.metal, x * type.width * 0.48, 0.39, z
      );
      rim.rotation.z = Math.PI / 2;
    }
  }

  const headlight = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xc9f4ff, emissiveIntensity: 1.1
  });

  for (const x of [-0.55, 0.55]) {
    piece(new THREE.BoxGeometry(0.34, 0.1, 0.06),
      headlight, x, 0.69, type.length / 2);

    piece(new THREE.BoxGeometry(0.32, 0.1, 0.06),
      new THREE.MeshStandardMaterial({
        color: 0xff2828, emissive: 0x800000, emissiveIntensity: 0.7
      }),
      x, 0.69, -type.length / 2);
  }

  // Rally roof lights and extra bodywork.
  if (type.name === "Rally Racer") {
    piece(new THREE.BoxGeometry(1.25, 0.1, 0.24), M.black, 0, 1.3, -0.4);
    for (let i = -2; i <= 2; i++) {
      piece(new THREE.SphereGeometry(0.08, 8, 8), headlight, i * 0.22, 1.35, -0.4);
    }
  }

  if (type.name === "Hypercar") {
    piece(new THREE.BoxGeometry(1.25, 0.08, 1.15), paint, 0, 0.83, 0.15);
  }

  if (isAI) {
    // A small visible roof stripe distinguishes computer-controlled racers.
    piece(new THREE.BoxGeometry(0.12, 0.03, type.length * 0.65),
      M.white, 0, 0.84, 0);
  }

  car.userData.wheels = wheels;
  car.userData.type = type;
  car.userData.velocity = new THREE.Vector3();
  car.userData.damage = 0;

  return car;
}

let player = createCar(selectedCar);
scene.add(player);

let speed = 0;
let yaw = 0;
let steering = 0;
let lateralVelocity = 0;
let verticalVelocity = 0;

const opponents = [];

function createOpponents() {
  opponents.forEach(r => scene.remove(r.car));
  opponents.length = 0;

  const colors = [0xe4483c, 0x329bd7, 0xf1f0e7];

  for (let i = 0; i < 3; i++) {
    const type = { ...CAR_TYPES.gt, color: colors[i] };
    const car = createCar(type, true);

    const racer = {
      car,
      progress: 0.978 - i * 0.022,
      lane: i % 2 ? 2.1 : -2.1,
      speed: 24 - i * 1.5,
      skill: 0.94,
      wobble: 0.25,
      lateralVelocity: 0,
      previousPosition: new THREE.Vector3()
    };

    opponents.push(racer);
    scene.add(car);
  }

  setAIDifficulty(selectedDifficulty);
}

function setAIDifficulty(level) {
  selectedDifficulty = AI_LEVELS[level] ? level : "medium";
  const cfg = AI_LEVELS[selectedDifficulty];

  opponents.forEach((racer, i) => {
    racer.speed = cfg.speed - i * 1.25;
    racer.skill = cfg.skill;
    racer.wobble = cfg.wobble;
  });

  saveGarage();
}

function placeCarsOnTrack() {
  if (!trackCurve) return;

  const start = poseAt(0.002, -1.6);
  player.position.copy(start.position);
  player.position.y = 0.03;
  yaw = start.yaw;
  player.rotation.y = yaw;

  opponents.forEach((racer, i) => {
    racer.progress = 0.978 - i * 0.022;
    const p = poseAt(racer.progress, racer.lane);
    racer.car.position.copy(p.position);
    racer.car.position.y = 0.03;
    racer.car.rotation.y = p.yaw;
  });
}

// ============================================================
// SCREENS AND GARAGE
// ============================================================

const screenIds = [
  "home-screen", "garage-screen", "tracks-screen",
  "upgrades-screen", "controls-screen",
  "pause-screen", "finish-screen"
];

let currentScreen = "home";
let raceStarted = false;
let countdownActive = false;
let countdown = 3;
let countdownClock = 0;
let paused = false;
let finished = false;
let tutorialMode = false;
let raceTime = 0;
let lap = 1;
let checkpointStage = 0;
let previousProgress = 0;
let cameraMode = 0;
let toastClock = 0;
let lastTimestamp = 0;
let collisionFlash = 0;
let raceReward = 0;
let audioEnabled = true;

function showScreen(name) {
  currentScreen = name;

  screenIds.forEach(id => $(id).classList.add("hidden"));
  if (name !== "race") $(name + "-screen").classList.remove("hidden");

  const inRace = name === "race";

  $("race-hud").classList.toggle("hidden", !inRace);
  $("speed-panel").classList.toggle("hidden", !inRace);
  $("minimap-wrap").classList.toggle("hidden", !inRace);
  $("bottom-hud").classList.toggle("hidden", !inRace);

  $("session-label").textContent = {
    home: "APEX MOTORSPORT",
    garage: "GARAGE",
    tracks: "CIRCUIT SELECT",
    upgrades: "ENGINEERING",
    controls: "DRIVER TRAINING",
    race: tutorialMode ? "DRIVING TUTORIAL" : "RACE SESSION",
    pause: "SESSION PAUSED",
    finish: "SESSION COMPLETE"
  }[name] || "APEX RACING";

  if (name === "home") updateHome();
}

function showToast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  toastClock = 2.2;
}

function formatTime(time) {
  const mins = Math.floor(time / 60).toString().padStart(2, "0");
  const secs = Math.floor(time % 60).toString().padStart(2, "0");
  const ms = Math.floor((time % 1) * 1000).toString().padStart(3, "0");
  return `${mins}:${secs}.${ms}`;
}

function updateHome() {
  $("home-car").textContent = selectedCar.name.toUpperCase();
  $("home-track").textContent = mapConfig.name.toUpperCase();
  $("best-result").textContent = bestTime ? formatTime(bestTime) : "NO RECORD";
  $("credits").textContent = Math.floor(credits).toLocaleString();
}

function renderGarage() {
  const list = $("car-list");
  list.innerHTML = "";

  Object.entries(CAR_TYPES).forEach(([id, car]) => {
    const unlocked = unlockedCars.includes(id);
    const button = document.createElement("button");
    button.className = "choice-card" + (selectedCarId === id ? " selected" : "");
    button.innerHTML = `
      <span class="car-swatch" style="background:#${car.color.toString(16).padStart(6, "0")}"></span>
      <span class="choice-info">
        <strong>${car.name}</strong>
        <small>${unlocked ? `${Math.round(car.topSpeed * 3.6)} KM/H MAX · ${car.handling.toFixed(2)} HANDLING` : "LOCKED VEHICLE"}</small>
      </span>
      <span class="choice-value">${unlocked ? (selectedCarId === id ? "✓" : "SELECT") : `${car.price.toLocaleString()} CR`}</span>
    `;

    button.addEventListener("click", () => {
      if (!unlocked) {
        showToast("THIS VEHICLE IS LOCKED");
        return;
      }

      selectedCarId = id;
      selectedCar = CAR_TYPES[id];
      renderGarage();
      renderUpgrades();
      updateCarDetails();
      saveGarage();
    });

    list.appendChild(button);
  });

  updateCarDetails();
}

function updateCarDetails() {
  const stats = getStats();
  const rows = [
    ["TOP SPEED", stats.topSpeed / 80 * 100, `${Math.round(stats.topSpeed * 3.6)} KM/H`],
    ["ACCELERATION", stats.acceleration / 42 * 100, stats.acceleration.toFixed(1)],
    ["CORNERING", stats.handling / 1.6 * 100, stats.handling.toFixed(2)],
    ["BRAKING", stats.braking / 48 * 100, stats.braking.toFixed(1)]
  ];

  $("car-details").innerHTML = rows.map(([name, value, label]) => `
    <div class="detail-row">
      <div class="detail-head"><span>${name}</span><span>${label}</span></div>
      <div class="stat-track"><i style="width:${clamp(value, 0, 100)}%"></i></div>
    </div>
  `).join("");

  $("select-car-btn").textContent = "DRIVE " + selectedCar.name.toUpperCase() + "  ↗";
}

function renderTracks() {
  const list = $("track-list");
  list.innerHTML = "";

  const descriptions = {
    coast: "Ocean views · fast sweeping turns",
    desert: "Rocky canyon · technical bends",
    forest: "Dense woodland · tight corners",
    city: "Urban streets · narrow racing line"
  };

  Object.entries(MAPS).forEach(([id, map]) => {
    const button = document.createElement("button");
    button.className = "choice-card" + (selectedTrackId === id ? " selected" : "");
    button.innerHTML = `
      <span class="car-swatch" style="background:#${map.grass.toString(16).padStart(6, "0")}"></span>
      <span class="choice-info"><strong>${map.name}</strong><small>${descriptions[id]}</small></span>
      <span class="choice-value">${selectedTrackId === id ? "✓" : "SELECT"}</span>
    `;

    button.addEventListener("click", () => {
      selectedTrackId = id;
      renderTracks();
    });

    list.appendChild(button);
  });
}

function renderUpgrades() {
  const list = $("upgrade-list");
  list.innerHTML = "";

  Object.entries(upgradeDefinitions).forEach(([id, upgrade]) => {
    const level = getUpgradeLevel(id);
    const cost = Math.round(upgrade.base * (1 + level * 0.8));
    const row = document.createElement("div");
    row.className = "choice-card";
    row.style.display = "block";

    row.innerHTML = `
      <div class="upgrade-heading">
        <div><strong>${upgrade.name}</strong><br><small>${upgrade.description}</small></div>
        <button class="upgrade-buy" ${level >= 5 || credits < cost ? "disabled" : ""}>
          ${level >= 5 ? "MAX LEVEL" : `${cost.toLocaleString()} CR`}
        </button>
      </div>
      <div class="upgrade-track"><i style="width:${level / 5 * 100}%"></i></div>
      <small style="color:var(--muted);font-size:9px">LEVEL ${level} / 5</small>
    `;

    row.querySelector("button").addEventListener("click", () => {
      if (level >= 5 || credits < cost) {
        showToast(level >= 5 ? "UPGRADE MAXED" : "NOT ENOUGH CREDITS");
        return;
      }

      credits -= cost;
      if (!upgrades[selectedCarId]) upgrades[selectedCarId] = {};
      upgrades[selectedCarId][id] = level + 1;

      updateCredits();
      renderUpgrades();
      updateCarDetails();
      showToast(upgrade.name + " UPGRADED");
    });

    list.appendChild(row);
  });
}

document.querySelectorAll("[data-screen]").forEach(button => {
  button.addEventListener("click", () => {
    const name = button.dataset.screen;

    if (name === "home") {
      paused = false;
      raceStarted = false;
      countdownActive = false;
      finished = false;
      $("center-message").textContent = "";
      showScreen("home");
      return;
    }

    if (name === "garage") renderGarage();
    if (name === "tracks") renderTracks();
    if (name === "upgrades") renderUpgrades();

    showScreen(name);
  });
});

$("select-car-btn").addEventListener("click", () => {
  scene.remove(player);
  player = createCar(selectedCar);
  scene.add(player);
  placeCarsOnTrack();
  resetRaceState();
  showScreen("home");
  showToast(selectedCar.name.toUpperCase() + " SELECTED");
});

$("select-track-btn").addEventListener("click", () => {
  mapId = selectedTrackId;
  buildMap();
  createOpponents();
  resetRaceState();
  showScreen("home");
  saveGarage();
  showToast(mapConfig.name.toUpperCase() + " LOADED");
});

// ============================================================
// RACE STATE
// ============================================================

function resetRaceState() {
  speed = 0;
  yaw = poseAt(0.002, -1.6).yaw;
  steering = 0;
  lateralVelocity = 0;
  verticalVelocity = 0;
  raceStarted = false;
  countdownActive = false;
  paused = false;
  finished = false;
  raceTime = 0;
  lap = 1;
  countdown = 3;
  countdownClock = 0;
  checkpointStage = 0;
  previousProgress = 0.002;

  placeCarsOnTrack();

  $("lap").textContent = "1";
  $("speed").textContent = "000";
  $("race-time").textContent = "00:00.000";
  $("lap-progress").style.width = "0%";
  $("position").textContent = "4";
  $("center-message").textContent = "";
  $("center-message").style.display = "none";
}

function startRace(tutorial = false) {
  tutorialMode = tutorial;
  resetRaceState();
  finished = false;
  countdownActive = true;
  countdown = 3;
  countdownClock = 0;

  showScreen("race");
  $("center-message").style.display = "block";
  $("center-message").textContent = "3";
  showToast(tutorial ? "TUTORIAL STARTING" : "GET READY");
}

function pauseRace() {
  if (!raceStarted && !countdownActive) return;
  paused = true;
  showScreen("pause");
}

function resumeRace() {
  paused = false;
  showScreen("race");
}

function finishRace() {
  if (finished) return;

  finished = true;
  raceStarted = false;
  countdownActive = false;
  paused = false;

  $("center-message").style.display = "none";

  const position = Number($("position").textContent || 4);
  raceReward = tutorialMode ? 0 : Math.max(100, 700 - (position - 1) * 150);

  if (position === 1) raceReward += 300;

  credits += raceReward;
  updateCredits();

  if (!bestTime || raceTime < bestTime) {
    bestTime = raceTime;
    saveGarage();
  }

  $("finish-title").innerHTML = position === 1
    ? 'PODIUM <em>FINISH.</em>'
    : 'RACE <em>COMPLETE.</em>';

  $("finish-copy").textContent = tutorialMode
    ? "Training complete. You are ready for the grid."
    : position === 1
      ? "Outstanding driving. You took the win."
      : "Good racing. Tune your car and chase the podium.";

  $("final-time").textContent = formatTime(raceTime);
  $("race-reward").textContent = "+" + raceReward.toLocaleString() + " CR";

  showScreen("finish");
  updateHome();
}

$("start-btn").addEventListener("click", () => startRace(false));
$("tutorial-btn").addEventListener("click", () => startRace(true));
$("resume-btn").addEventListener("click", resumeRace);
$("restart-btn").addEventListener("click", () => startRace(tutorialMode));
$("again-btn").addEventListener("click", () => startRace(false));

// ============================================================
// KEYBOARD INPUT
// ============================================================

const keys = {};

window.addEventListener("keydown", event => {
  keys[event.code] = true;

  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    event.preventDefault();
  }

  if (event.repeat) return;

  if (event.code === "Escape") {
    if (currentScreen === "pause") resumeRace();
    else if (currentScreen === "race") pauseRace();
  }

  if (event.code === "KeyC" && currentScreen === "race") cycleCamera();
  if (event.code === "KeyR" && currentScreen === "race") recoverCar();
});

window.addEventListener("keyup", event => {
  keys[event.code] = false;
});

window.addEventListener("blur", () => {
  Object.keys(keys).forEach(key => keys[key] = false);
  if (currentScreen === "race" && (raceStarted || countdownActive)) pauseRace();
});

const gasPressed = () => keys.KeyW || keys.ArrowUp;
const brakePressed = () => keys.KeyS || keys.ArrowDown;
const leftPressed = () => keys.KeyA || keys.ArrowLeft;
const rightPressed = () => keys.KeyD || keys.ArrowRight;

// ============================================================
// CAR PHYSICS AND COLLISIONS
// ============================================================

function updatePlayer(dt) {
  if (!raceStarted || paused || finished) return;

  const stats = getStats();
  const gas = gasPressed();
  const braking = brakePressed();
  const handbrake = keys.Space;

  // Engine, drag, and brakes.
  if (gas) speed += stats.acceleration * dt;
  else speed -= (2.6 + Math.abs(speed) * 0.075) * dt;

  if (braking) {
    speed -= stats.braking * dt;
  }

  speed = clamp(speed, -7, stats.topSpeed);

  // Steering authority changes with speed.
  const steerInput =
    (leftPressed() ? 1 : 0) - (rightPressed() ? 1 : 0);

  steering = THREE.MathUtils.damp(steering, steerInput, 6, dt);

  const speedFactor = clamp(Math.abs(speed) / 12, 0.12, 1);
  const driftFactor = handbrake ? 1.8 : 1;

  yaw += steering * speedFactor * stats.handling *
    driftFactor * dt * (speed < -0.5 ? -1 : 1);

  // Lateral velocity simulates tire slip.
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const right = new THREE.Vector3(forward.z, 0, -forward.x);

  lateralVelocity += steering * Math.abs(speed) * (handbrake ? 0.65 : 0.19) * dt;
  lateralVelocity *= Math.exp(-(handbrake ? 1.3 : 5.5 * stats.grip) * dt);
  lateralVelocity = clamp(lateralVelocity, -12, 12);

  const oldPosition = player.position.clone();

  player.position.addScaledVector(forward, speed * dt);
  player.position.addScaledVector(right, lateralVelocity * dt);
  player.rotation.y = yaw;

  // Slight body roll under steering.
  player.rotation.z = -steering * Math.min(Math.abs(speed) / 50, 0.18);
  player.rotation.x = lerp(player.rotation.x, braking ? -0.025 : 0, dt * 3);

  player.userData.wheels.forEach(wheel => {
    wheel.rotation.x -= speed * dt * 0.8;
  });

  resolveTrackCollisions(oldPosition);
  resolveBarrierCollisions();
  resolveCarCollisions();

  const track = nearestTrackPoint(player.position);

  // Off-road terrain has much lower traction and speed.
  const offRoad = track.distance > mapConfig.width * 0.47;

  if (offRoad) {
    speed *= Math.exp(-1.6 * dt);
    lateralVelocity *= Math.exp(-2.5 * dt);
  }

  // Reset if the car gets far away from the circuit.
  if (track.distance > 70 || player.position.y < -5) {
    recoverCar();
  }

  updateLapCheckpoints(track.progress, dt);
  updateHUD(dt);
}

function resolveTrackCollisions(oldPosition) {
  const track = nearestTrackPoint(player.position);
  const maxLateral = mapConfig.width / 2 - selectedCar.width * 0.43;

  if (Math.abs(track.lateral) > maxLateral) {
    const side = Math.sign(track.lateral);
    const impact = Math.abs(speed);

    player.position.copy(track.pose.position)
      .addScaledVector(track.pose.normal, side * maxLateral);

    // Contact with the road edge removes momentum.
    speed *= impact > 35 ? 0.55 : 0.78;
    lateralVelocity *= -0.25;
    yaw += side * clamp(impact / 100, 0.05, 0.4);
    collisionFlash = 0.3;
  }
}

function resolveBarrierCollisions() {
  // Local oriented-box collision tests against physical barrier segments.
  const halfLength = selectedCar.length * 0.48;
  const halfWidth = selectedCar.width * 0.48;

  for (const barrier of barriers) {
    const dx = player.position.x - barrier.position.x;
    const dz = player.position.z - barrier.position.z;

    // Cheap broad-phase check.
    if (dx * dx + dz * dz > 10) continue;

    const forward = barrier.tangent;
    const right = barrier.normal;

    const localForward = dx * forward.x + dz * forward.z;
    const localSide = dx * right.x + dz * right.z;

    if (
      Math.abs(localForward) < halfLength + barrier.halfLength &&
      Math.abs(localSide) < halfWidth + barrier.halfWidth
    ) {
      const impact = Math.abs(speed);

      // Push the car away from the barrier surface.
      const overlap = halfWidth + barrier.halfWidth - Math.abs(localSide);
      const direction = Math.sign(localSide) || -barrier.side;

      player.position.addScaledVector(right, direction * (overlap + 0.04));

      // Stronger impacts lose more momentum.
      const impactLoss = clamp(0.35 + impact / 95, 0.35, 0.88);
      speed *= 1 - impactLoss;
      lateralVelocity *= -0.38;
      yaw += direction * clamp(impact / 120, 0.04, 0.32);
      collisionFlash = 0.45;

      if (impact > 16) showToast("BARRIER IMPACT");
      break;
    }
  }
}

function resolveCarCollisions() {
  for (const racer of opponents) {
    const other = racer.car;
    const dx = player.position.x - other.position.x;
    const dz = player.position.z - other.position.z;
    const distance = Math.hypot(dx, dz);
    const minDistance = (selectedCar.width + racer.car.userData.type.width) * 0.48;

    if (distance < minDistance && distance > 0.001) {
      const nx = dx / distance;
      const nz = dz / distance;
      const overlap = minDistance - distance;

      player.position.x += nx * overlap * 0.55;
      player.position.z += nz * overlap * 0.55;
      other.position.x -= nx * overlap * 0.45;
      other.position.z -= nz * overlap * 0.45;

      speed *= 0.76;
      racer.speed *= 0.92;
      lateralVelocity += nx * 2.2;
      collisionFlash = 0.35;
    }
  }
}

function recoverCar() {
  const track = nearestTrackPoint(player.position);
  const pose = poseAt(track.progress, -1.5);

  player.position.copy(pose.position);
  player.position.y = 0.03;
  yaw = pose.yaw;
  player.rotation.set(0, yaw, 0);
  speed = 0;
  lateralVelocity = 0;
  verticalVelocity = 0;

  showToast("VEHICLE RECOVERED");
}

// ============================================================
// LAP VALIDATION
// ============================================================

function updateLapCheckpoints(progress, dt) {
  const delta = (progress - previousProgress + 1) % 1;

  // Must move forward through the gates in order.
  if (delta > 0 && delta < 0.045 && speed > 5) {
    const gates = [0.25, 0.5, 0.75];
    const nextGate = gates[checkpointStage];

    if (
      checkpointStage < 3 &&
      previousProgress < nextGate &&
      progress >= nextGate
    ) {
      checkpointStage++;
      showToast(`CHECKPOINT ${checkpointStage}/3`);
    }

    if (
      checkpointStage === 3 &&
      previousProgress > 0.94 &&
      progress < 0.06
    ) {
      checkpointStage = 0;
      lap++;

      if (tutorialMode) {
        finishRace();
      } else if (lap > 3) {
        finishRace();
      } else {
        showToast(`LAP ${lap}/3`);
      }
    }
  }

  previousProgress = progress;
}

// ============================================================
// AI DRIVERS
// ============================================================

function updateAI(dt) {
  opponents.forEach((racer, index) => {
    if (raceStarted && !paused && !finished) {
      const current = poseAt(racer.progress, racer.lane);

      // Look ahead to anticipate tighter corners.
      const lookAhead = poseAt(racer.progress + 0.008, racer.lane);
      const dot = clamp(current.tangent.dot(lookAhead.tangent), -1, 1);
      const turnSeverity = 1 - dot;
      const cornerSpeedFactor = clamp(1 - turnSeverity * 0.7, 0.58, 1);

      const targetSpeed = racer.speed * racer.skill * cornerSpeedFactor;
      const circumference = 2 * Math.PI * (mapConfig.rx + mapConfig.rz) / 2;

      racer.progress += (targetSpeed / circumference) * dt;
      if (racer.progress >= 1) racer.progress -= 1;

      racer.lane += Math.sin(raceTime * 0.7 + index) *
        racer.wobble * dt;

      racer.lane = clamp(racer.lane, -mapConfig.width * 0.27, mapConfig.width * 0.27);
    }

    const pose = poseAt(racer.progress, racer.lane);
    racer.car.position.copy(pose.position);
    racer.car.position.y = 0.03;
    racer.car.rotation.y = pose.yaw;

    racer.car.userData.wheels.forEach(wheel => {
      wheel.rotation.x -= racer.speed * dt * 0.8;
    });
  });

  const playerProgress = nearestTrackPoint(player.position).progress;

  const place = 1 + opponents.filter(racer => {
    const gap = (racer.progress - playerProgress + 1) % 1;
    return gap > 0.5;
  }).length;

  $("position").textContent = String(clamp(place, 1, 4));
}

// ============================================================
// HUD AND MINIMAP
// ============================================================

function updateHUD(dt) {
  raceTime += dt;

  $("lap").textContent = Math.min(lap, 3);
  $("race-time").textContent = formatTime(raceTime);

  const kmh = Math.round(Math.abs(speed) * 3.6);
  $("speed").textContent = String(kmh).padStart(3, "0");

  const gear = speed < -1 ? "R" : Math.max(1, Math.min(7, Math.floor(kmh / 30) + 1));
  $("gear").textContent = gear;

  const rpm = Math.round(1200 + (kmh / 280) * 6500);
  $("rpm").textContent = rpm.toLocaleString();
  $("rpm-bar").style.width = `${clamp((rpm - 1000) / 7000 * 100, 5, 100)}%`;

  const progress = nearestTrackPoint(player.position).progress;
  $("lap-progress").style.width = `${progress * 100}%`;
  $("drive-mode").textContent = keys.Space ? "DRIFT" : "SPORT";
  $("abs").style.opacity = brakePressed() ? "1" : ".5";

  $("footer-track").textContent = mapConfig.name.toUpperCase();
}

const mini = $("minimap");
const miniCtx = mini.getContext("2d");

function drawMinimap() {
  const w = mini.width;
  const h = mini.height;

  miniCtx.clearRect(0, 0, w, h);
  miniCtx.fillStyle = "#091011";
  miniCtx.fillRect(0, 0, w, h);

  if (!trackCurve) return;

  const scale = Math.min(
    (w - 24) / (mapConfig.rx * 2 + 22),
    (h - 24) / (mapConfig.rz * 2 + 22)
  );

  miniCtx.save();
  miniCtx.translate(w / 2, h / 2);
  miniCtx.scale(scale, scale);

  miniCtx.beginPath();
  for (let i = 0; i <= 300; i++) {
    const p = trackCurve.getPointAt(i / 300);
    if (i === 0) miniCtx.moveTo(p.x, p.z);
    else miniCtx.lineTo(p.x, p.z);
  }

  miniCtx.closePath();
  miniCtx.strokeStyle = "#68736c";
  miniCtx.lineWidth = 11 / scale;
  miniCtx.stroke();

  miniCtx.strokeStyle = "#d8ff3e";
  miniCtx.lineWidth = 1.5 / scale;
  miniCtx.stroke();

  opponents.forEach(racer => {
    const p = poseAt(racer.progress, racer.lane).position;
    miniCtx.fillStyle = "#f04d43";
    miniCtx.beginPath();
    miniCtx.arc(p.x, p.z, 2.4 / scale, 0, Math.PI * 2);
    miniCtx.fill();
  });

  miniCtx.fillStyle = "#d8ff3e";
  miniCtx.beginPath();
  miniCtx.arc(player.position.x, player.position.z, 3 / scale, 0, Math.PI * 2);
  miniCtx.fill();

  miniCtx.restore();
}

// ============================================================
// CAMERA SYSTEM
// ============================================================

function cycleCamera() {
  cameraMode = (cameraMode + 1) % 4;
  const names = ["CHASE CAM", "COCKPIT CAM", "HOOD CAM", "TV CAM"];
  $("camera-name").textContent = names[cameraMode];
  showToast(names[cameraMode]);
}

function updateCamera(dt) {
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  let target;
  let look;

  if (cameraMode === 0) {
    target = player.position.clone()
      .addScaledVector(forward, -10.5)
      .add(new THREE.Vector3(0, 5, 0));

    look = player.position.clone()
      .addScaledVector(forward, 5)
      .add(new THREE.Vector3(0, 1, 0));
  } else if (cameraMode === 1) {
    target = player.position.clone()
      .addScaledVector(forward, -0.2)
      .add(new THREE.Vector3(0, 1.45, 0));

    look = player.position.clone()
      .addScaledVector(forward, 22)
      .add(new THREE.Vector3(0, 1.2, 0));
  } else if (cameraMode === 2) {
    target = player.position.clone()
      .addScaledVector(forward, 1.1)
      .add(new THREE.Vector3(0, 1.5, 0));

    look = player.position.clone()
      .addScaledVector(forward, 25)
      .add(new THREE.Vector3(0, 1, 0));
  } else {
    const pose = poseAt(nearestTrackPoint(player.position).progress, 25);
    target = pose.position.clone().add(new THREE.Vector3(0, 13, 0));
    look = player.position.clone();
  }

  camera.position.lerp(target, 1 - Math.exp(-4.5 * dt));
  camera.lookAt(look);
}

// ============================================================
// COUNTDOWN AND GAME LOOP
// ============================================================

function updateCountdown(dt) {
  if (!countdownActive || paused) return;

  countdownClock += dt;

  if (countdownClock >= 1) {
    countdownClock -= 1;
    countdown--;

    if (countdown > 0) {
      $("center-message").textContent = String(countdown);
    } else {
      countdownActive = false;
      raceStarted = true;
      $("center-message").textContent = "GO!";
      showToast("GREEN FLAG");
    }
  }
}

function animate(timestamp) {
  requestAnimationFrame(animate);

  const dt = Math.min(
    0.033,
    Math.max(0, (timestamp - (lastTimestamp || timestamp)) / 1000)
  );
  lastTimestamp = timestamp;

  if (toastClock > 0) {
    toastClock -= dt;
    if (toastClock <= 0) $("toast").classList.remove("show");
  }

  if (collisionFlash > 0) collisionFlash -= dt;

  updateCountdown(dt);
  updatePlayer(dt);
  updateAI(dt);

  if (currentScreen === "race") {
    updateCamera(dt);
    drawMinimap();

    if (!countdownActive && raceStarted && !paused && !finished) {
      $("center-message").style.display = "none";
    }
  } else {
    // Show the car and circuit in the garage and main menu.
    const orbit = timestamp * 0.00012;
    const target = player.position.clone();
    camera.position.lerp(
      target.clone().add(new THREE.Vector3(
        Math.sin(orbit) * 18, 8, Math.cos(orbit) * 18
      )),
      1 - Math.exp(-2 * dt)
    );
    camera.lookAt(target.x, target.y + 0.6, target.z);
  }

  renderer.render(scene, camera);
}

// ============================================================
// SOUND SWITCH
// ============================================================

$("sound-btn").addEventListener("click", () => {
  audioEnabled = !audioEnabled;
  $("sound-btn").textContent = audioEnabled ? "♫ SOUND" : "♫ MUTED";
  showToast(audioEnabled ? "SOUND ENABLED" : "SOUND MUTED");
});

// ============================================================
// RESIZE AND BOOT
// ============================================================

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setSize(innerWidth, innerHeight);
});

buildMap();
createOpponents();
placeCarsOnTrack();
renderGarage();
renderTracks();
renderUpgrades();
updateCredits();
updateHome();
showScreen("home");

requestAnimationFrame(animate);