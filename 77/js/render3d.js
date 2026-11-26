/* Low-poly 3D renderer for the existing 2D simulation.
   The 2D layer remains the input surface and the source of truth. */
(function () {
  'use strict';
  if (!window.THREE) return;
  const T = window.THREE;
  const PX = 0.024;
  const PLAYER_Z = 1.1;
  const ENEMY_Z = 0;
  const OBJECT_Z = 0;
  const EYE_STAND = 1.72;
  const EYE_CROUCH = 1.18;

  const GEO = {
    box: new T.BoxGeometry(1, 1, 1),
    sphere: new T.SphereGeometry(1, 10, 8),
    cylinder: new T.CylinderGeometry(1, 1, 1, 8),
    cone: new T.ConeGeometry(1, 1, 8),
    plane: new T.PlaneGeometry(1, 1),
    rock: new T.DodecahedronGeometry(1, 0)
  };

  let renderer = null, scene = null, camera = null, stage = null, canvas = null;
  let staticGroup = null, dynamicGroup = null, skyGroup = null;
  let hemi = null, sunLight = null, muzzleLight = null;
  let playerGroup = null, playerParts = null;
  let viewWeapon = null, viewMuzzle = null, viewKnife = null;
  let rainPoints = null, rainData = null, rainMat = null;
  let sceneKey = '', currentType = '', failed = false, lastTime = 0, active = false;
  let fireObjects = [], flagObject = null, supplyObject = null, exitObject = null;
  const tracers = [];
  const tmpVec = new T.Vector3();
  const enemyGroups = new Map();
  const allyGroups = new Map();
  const bulletGroups = new Map();
  const flashSprites = new Map();
  const explosionMeshes = new Map();
  const pickupGroups = new Map();
  const civilianGroups = new Map();
  const matCache = new Map();

  function colorMat(color, opts) {
    opts = opts || {};
    const key = color + '|' + (opts.rough || .88) + '|' + (opts.emissive || 0) + '|' + (opts.opacity === undefined ? 1 : opts.opacity);
    if (matCache.has(key)) return matCache.get(key);
    const m = new T.MeshStandardMaterial({
      color: color,
      roughness: opts.rough === undefined ? .88 : opts.rough,
      metalness: opts.metal || 0,
      emissive: opts.emissive || 0x000000,
      emissiveIntensity: opts.emissive ? .7 : 0,
      transparent: opts.opacity !== undefined && opts.opacity < 1,
      opacity: opts.opacity === undefined ? 1 : opts.opacity,
      flatShading: true
    });
    matCache.set(key, m);
    return m;
  }
  function basicMat(color, opacity) {
    const key = 'b' + color + '|' + (opacity === undefined ? 1 : opacity);
    if (matCache.has(key)) return matCache.get(key);
    const m = new T.MeshBasicMaterial({ color: color, transparent: opacity !== undefined && opacity < 1, opacity: opacity === undefined ? 1 : opacity });
    matCache.set(key, m);
    return m;
  }
  function addBox(parent, w, h, d, color, x, y, z, ry, rz, opts) {
    const m = new T.Mesh(GEO.box, colorMat(color, opts));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    if (rz) m.rotation.z = rz;
    parent.add(m);
    return m;
  }
  function addCyl(parent, r, h, color, x, y, z, rz, opts) {
    const m = new T.Mesh(GEO.cylinder, colorMat(color, opts));
    m.scale.set(r, h, r);
    m.position.set(x, y, z);
    if (rz) m.rotation.z = rz;
    parent.add(m);
    return m;
  }
  function addCone(parent, r, h, color, x, y, z, opts) {
    const m = new T.Mesh(GEO.cone, colorMat(color, opts));
    m.scale.set(r, h, r);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  function addSphere(parent, r, color, x, y, z, opts) {
    const m = new T.Mesh(GEO.sphere, colorMat(color, opts));
    m.scale.set(r, r, r);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  function addPlane(parent, w, d, color, x, y, z, opts) {
    const m = new T.Mesh(GEO.plane, colorMat(color, opts));
    m.scale.set(w, d, 1);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  function addBeam(parent, x1, y1, z1, x2, y2, z2, thick, color) {
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const m = new T.Mesh(GEO.box, colorMat(color));
    m.scale.set(len, thick, thick);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    m.rotation.y = -Math.atan2(dz, dx);
    m.rotation.z = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
    parent.add(m);
    return m;
  }
  function clearGroup(g) {
    if (!g) return;
    while (g.children.length) g.remove(g.children[0]);
  }

  function palette(type) {
    if (type === 'rail') return { sky: 0x04080d, fog: 0x09121a, ground: 0x1e1d18, water: 0x081013, night: true };
    if (type === 'town') return { sky: 0x070b11, fog: 0x131a16, ground: 0x221d16, water: 0x081013, night: true };
    if (type === 'earth') return { sky: 0x241b13, fog: 0x68432d, ground: 0x5a432e, water: 0x1b2424, night: false };
    if (type === 'mountain') return { sky: 0x2a1d15, fog: 0x6b4a33, ground: 0x55402d, water: 0x1b2424, night: false };
    return { sky: 0x04080e, fog: 0x0b1218, ground: 0x1e1c16, water: 0x081013, night: true };
  }

  function init() {
    if (renderer || failed) return !!renderer;
    try {
      canvas = document.getElementById('gameCanvas3d');
      stage = document.getElementById('stage');
      if (!canvas || !stage) throw new Error('no canvas');
      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.4));
      renderer.outputEncoding = T.sRGBEncoding;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = .96;
      scene = new T.Scene();
      camera = new T.PerspectiveCamera(64, 1, .05, 160);
      scene.add(camera);
      hemi = new T.HemisphereLight(0x9fb2c4, 0x2b241b, .55);
      scene.add(hemi);
      sunLight = new T.DirectionalLight(0xe6d3ae, .85);
      sunLight.position.set(-8, 22, 12);
      scene.add(sunLight);
      muzzleLight = new T.PointLight(0xffc06a, 0, 9, 2);
      scene.add(muzzleLight);

      staticGroup = new T.Group();
      dynamicGroup = new T.Group();
      skyGroup = new T.Group();
      scene.add(skyGroup, staticGroup, dynamicGroup);

      playerGroup = new T.Group();
      playerParts = makeSoldier('#4d5849', false);
      playerGroup.add(playerParts.root);
      playerGroup.visible = false;
      dynamicGroup.add(playerGroup);
      makeViewWeapon();
      makeRain();
      document.getElementById('app').classList.add('three-d');
      resize();
      return true;
    } catch (e) {
      failed = true;
      renderer = null;
      const app = document.getElementById('app');
      if (app) app.classList.remove('three-d');
      return false;
    }
  }

  let lastSizeKey = '';
  function resize() {
    if (!renderer || !stage) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    const key = w + 'x' + h;
    if (key === lastSizeKey) return;
    lastSizeKey = key;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function makeViewWeapon() {
    const g = new T.Group();
    // wooden stock and receiver
    addBox(g, .13, .15, .42, 0x51371f, 0, -.025, .02);
    addBox(g, .10, .12, .52, 0x27231b, 0, 0, -.42);
    addBox(g, .055, .06, .52, 0x1b1814, 0, .025, -.90);
    addBox(g, .028, .095, .028, 0x2c2b25, 0, .085, -1.14);
    addBox(g, .065, .045, .05, 0x36352d, 0, .075, -.04);
    // hands and sleeves
    addBox(g, .15, .17, .30, 0x4a5547, .20, -.17, -.03);
    addBox(g, .13, .15, .30, 0x4a5547, -.16, -.16, -.39);
    addSphere(g, .08, 0xb98e6d, .12, -.13, -.22);
    addSphere(g, .075, 0xb98e6d, -.10, -.13, -.55);
    addBox(g, .08, .045, .12, 0x5d4a31, .12, -.10, -.43);
    viewMuzzle = addSphere(g, .075, 0xffd98a, 0, .025, -1.36, { emissive: 0xffa33d });
    viewMuzzle.visible = false;
    viewKnife = addBox(g, .05, .10, .48, 0xd6c9a5, .26, -.03, -.88);
    viewKnife.rotation.x = .35;
    viewKnife.visible = false;
    g.position.set(.30, -.30, -.48);
    g.rotation.y = -.10;
    g.scale.setScalar(.65);
    camera.add(g);
    viewWeapon = g;
  }

  function makeRain() {
    const count = 180;
    rainData = { x: new Float32Array(count), y: new Float32Array(count), z: new Float32Array(count), s: new Float32Array(count) };
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      rainData.x[i] = (Math.random() - .5) * 38;
      rainData.y[i] = Math.random() * 26;
      rainData.z[i] = (Math.random() - .5) * 28 + 2;
      rainData.s[i] = 10 + Math.random() * 13;
      pos[i * 3] = rainData.x[i]; pos[i * 3 + 1] = rainData.y[i]; pos[i * 3 + 2] = rainData.z[i];
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    rainMat = new T.PointsMaterial({ color: 0xa9c0ce, size: .055, transparent: true, opacity: .55, depthWrite: false });
    rainPoints = new T.Points(g, rainMat);
    rainPoints.frustumCulled = false;
    scene.add(rainPoints);
  }

  function updateRain(dt, S) {
    if (!rainPoints) return;
    const pos = rainPoints.geometry.attributes.position.array;
    const dust = S.level.type === 'earth' || S.level.type === 'mountain';
    rainMat.color.setHex(dust ? 0xb9a98b : 0xa9c0ce);
    rainMat.opacity = dust ? .28 : .5;
    const speed = dust ? .5 : 1;
    for (let i = 0; i < 180; i++) {
      rainData.y[i] -= rainData.s[i] * dt * speed;
      rainData.x[i] -= dt * 1.5;
      if (rainData.y[i] < 0) {
        rainData.y[i] = 22 + Math.random() * 10;
        rainData.x[i] = (Math.random() - .5) * 38;
        rainData.z[i] = (Math.random() - .5) * 28 + 2;
      }
      pos[i * 3] = rainData.x[i]; pos[i * 3 + 1] = rainData.y[i]; pos[i * 3 + 2] = rainData.z[i];
    }
    rainPoints.geometry.attributes.position.needsUpdate = true;
    rainPoints.position.x = S.player ? S.player.x * PX : 0;
  }

  function beamColor(type) {
    if (type === 'rail') return 0x4d554e;
    if (type === 'stone') return 0x666152;
    if (type === 'town') return 0x4e4639;
    return 0x4b4537;
  }

  function buildSky(type, env) {
    clearGroup(skyGroup);
    env = env || {};
    let p = palette(type);
    if (env.sky || env.fog) p = { sky: env.sky || p.sky, fog: env.fog || p.fog, ground: p.ground, water: p.water, night: p.night };
    scene.background = new T.Color(p.sky);
    scene.fog = new T.Fog(p.fog, 36, env.far || 120);
    hemi.color.setHex(p.night ? 0x8ca4bc : 0xd1aa82);
    hemi.groundColor.setHex(p.night ? 0x171c1a : 0x5a3c26);
    hemi.intensity = p.night ? .3 : .6;
    sunLight.color.setHex(p.night ? 0xbfd3e6 : 0xffc27a);
    sunLight.intensity = p.night ? .45 : .9;
    sunLight.position.set(-10, 24, 12);

    if (p.night) {
      const starCount = 180, pts = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        pts[i * 3] = (Math.random() - .5) * 80;
        pts[i * 3 + 1] = 10 + Math.random() * 32;
        pts[i * 3 + 2] = -50 - Math.random() * 20;
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pts, 3));
      const stars = new T.Points(g, new T.PointsMaterial({ color: 0xd5e1e8, size: .08, transparent: true, opacity: .62, depthWrite: false }));
      stars.frustumCulled = false;
      skyGroup.add(stars);
      const moon = new T.Mesh(GEO.sphere, basicMat(0xf0e7cc));
      moon.scale.set(1.5, 1.5, 1.5);
      moon.position.set(5, 24, -48);
      skyGroup.add(moon);
      const halo = new T.Mesh(GEO.sphere, basicMat(0xbfd5e0, .08));
      halo.scale.set(5, 5, 5);
      halo.position.copy(moon.position);
      skyGroup.add(halo);
    } else {
      const sun = new T.Mesh(GEO.sphere, basicMat(type === 'mountain' ? 0xffb26a : 0xd4a06d));
      sun.scale.set(3.2, 3.2, 3.2);
      sun.position.set(13, 22, -50);
      skyGroup.add(sun);
      const halo = new T.Mesh(GEO.sphere, basicMat(0xffa15b, .07));
      halo.scale.set(9, 9, 9);
      halo.position.copy(sun.position);
      skyGroup.add(halo);
    }
  }

  function makeTree(parent, x, z, scale, color) {
    const g = new T.Group();
    addCyl(g, .13 * scale, 2.5 * scale, 0x27251c, 0, 1.25 * scale, 0);
    addCone(g, 1.2 * scale, 2.8 * scale, color || 0x2c341f, 0, 3.1 * scale, 0);
    addCone(g, .85 * scale, 2.0 * scale, color || 0x2c341f, 0, 4.1 * scale, 0);
    g.position.set(x, 0, z);
    parent.add(g);
  }

  function addBridgeStone(W) {
    addPlane(staticGroup, W + 44, 64, 0x0c171c, W / 2, -1.3, 0);
    addBox(staticGroup, W + 40, 1.8, 8, 0x2b2b24, W / 2, -.9, -11);
    addBox(staticGroup, W + 40, 1.8, 8, 0x2b2b24, W / 2, -.9, 12);
    addBox(staticGroup, W, .36, 9.2, 0x2a2820, W / 2, .05, 0);
    addBox(staticGroup, W, .12, 8.6, 0x322f26, W / 2, .27, 0);
    for (let x = 0; x < W; x += 3.2) {
      for (const z of [-4.65, 4.65]) {
        addBox(staticGroup, .2, 1.05, .2, 0x2b2922, x, .78, z);
        addBox(staticGroup, .55, .16, .55, 0x2b2922, x, 1.32, z);
        addSphere(staticGroup, .25, 0x37332a, x, 1.52, z);
        addSphere(staticGroup, .15, 0x3c372d, x + .18, 1.62, z + .04);
      }
    }
    for (let x = 3; x < W; x += 6) {
      const arch = new T.Mesh(new T.TorusGeometry(2.1, .23, 6, 12, Math.PI), colorMat(0x221f19));
      arch.position.set(x, -.75, 0);
      arch.rotation.z = Math.PI;
      staticGroup.add(arch);
    }
    // Wanping-like wall in the distance
    addBox(staticGroup, Math.min(W, 70), 5.2, 1.4, 0x24251e, Math.min(W, 70) / 2 - 8, 2.6, -15);
    for (let x = -4; x < Math.min(W, 70); x += 3.1) addBox(staticGroup, 1.3, 1.1, 1.5, 0x2a2b22, x, 5.0, -15);
  }

  function addBridgeRail(W) {
    addPlane(staticGroup, W + 44, 64, 0x0a1419, W / 2, -1.3, 0);
    addBox(staticGroup, W + 40, 1.8, 8, 0x25251f, W / 2, -.9, -11);
    addBox(staticGroup, W + 40, 1.8, 8, 0x25251f, W / 2, -.9, 12);
    addBox(staticGroup, W, .42, 9.4, 0x4a483b, W / 2, .05, 0);
    for (const z of [-1.55, 1.55]) {
      addBox(staticGroup, W, .08, .1, 0x77705d, W / 2, .34, z);
      addBox(staticGroup, W, .08, .1, 0x77705d, W / 2, .34, z + (z < 0 ? -.32 : .32));
    }
    for (let x = 0; x < W; x += 1.7) {
      addBox(staticGroup, .16, .12, 4.1, 0x2d2a22, x, .26, 0);
    }
    for (let x = 0; x < W; x += 3.8) {
      // Far-side truss stays behind the action; the near side is a low railing
      // so the camera can see the player and enemies.
      const z = -4.55;
      addBeam(staticGroup, x, 0, z, x, 3.2, z, .16, 0x4e564e);
      addBeam(staticGroup, x, 3.2, z, x + 3.8, 0, z, .11, 0x4e564e);
      addBeam(staticGroup, x, 0, z, x + 3.8, 3.2, z, .11, 0x4e564e);
      addBeam(staticGroup, x, 3.25, -4.55, x, 3.25, 4.55, .16, 0x4e564e);
      addBox(staticGroup, .14, 1.0, .14, 0x4e564e, x, .5, 4.55);
      addBox(staticGroup, .12, .08, .12, 0x4e564e, x, 1.02, 4.55);
    }
    addBeam(staticGroup, 0, 3.2, -4.55, W, 3.2, -4.55, .17, 0x4e564e);
    addBox(staticGroup, W, .07, .08, 0x4e564e, W / 2, 1.02, 4.55);
  }

  function addFieldBase(W, type, env) {
    env = env || {};
    const p = palette(type);
    const treeCol = env.tree || 0x2b3320;
    addPlane(staticGroup, W + 50, 70, p.ground, W / 2, 0, 0);
    addPlane(staticGroup, W + 50, 16, p.night ? 0x241c12 : 0x4b3b29, W / 2, .01, 0);
    for (let x = -5; x < W + 5; x += 4.5) {
      if (type === 'mountain') {
        const rock = new T.Mesh(GEO.rock, colorMat(0x3c3a30));
        const s = .6 + Math.abs(Math.sin(x * 1.3)) * 1.1;
        rock.scale.set(s, s * .8, s);
        rock.position.set(x, s * .35, -7 - (x % 5));
        staticGroup.add(rock);
        const rock2 = new T.Mesh(GEO.rock, colorMat(0x343229));
        const s2 = .5 + Math.abs(Math.cos(x * 1.1)) * .9;
        rock2.scale.set(s2, s2 * .8, s2);
        rock2.position.set(x + 2, s2 * .35, 7 + (x % 4));
        staticGroup.add(rock2);
      } else {
        const ts = type === 'town' ? .55 + Math.abs(Math.sin(x)) * .35 : 1 + Math.abs(Math.sin(x)) * .6;
        makeTree(staticGroup, x, -9 - (x % 4), ts, treeCol);
        if (type === 'earth' || type === 'town') {
          makeTree(staticGroup, x + 2, 9 + (x % 4), ts * .8, treeCol);
        }
      }
    }
    if (type === 'town') {
      for (let i = 0; i < 6; i++) {
        const x = 5 + i * 7.5;
        const h = 3.2 + (i % 3) * 1.1;
        addBox(staticGroup, 4.6, h, 4.2, i % 2 ? 0x1e1b16 : 0x191813, x, h / 2, -10.5);
        addBox(staticGroup, 5.2, .45, 4.9, 0x12110e, x, h + .2, -10.5);
        addBox(staticGroup, 3.6, .25, .2, 0x0f0e0c, x, h - .7, -8.35);
        addBox(staticGroup, .4, .5, .15, 0xd39a55, x - 1.1, h * .55, -8.35, 0, 0, { emissive: 0x8a3d16 });
        addBox(staticGroup, .4, .5, .15, 0xd39a55, x + 1.2, h * .55, -8.35, 0, 0, { emissive: 0x8a3d16 });
        // opposite side of the street
        const x2 = x + 2.8;
        const h2 = 2.8 + ((i + 1) % 3) * 1.2;
        addBox(staticGroup, 4.4, h2, 4.2, i % 2 ? 0x171612 : 0x1e1c17, x2, h2 / 2, 10.8);
        addBox(staticGroup, 5.0, .45, 4.9, 0x100f0d, x2, h2 + .2, 10.8);
        addBox(staticGroup, 3.4, .25, .2, 0x0e0d0b, x2, h2 - .7, 8.65);
        addBox(staticGroup, .4, .5, .15, 0xd39a55, x2 - 1.0, h2 * .55, 8.65, 0, 0, { emissive: 0x8a3d16 });
        addBox(staticGroup, .4, .5, .15, 0xd39a55, x2 + 1.1, h2 * .55, 8.65, 0, 0, { emissive: 0x8a3d16 });
      }
    }
    if (type === 'mountain') {
      for (let i = 0; i < 5; i++) {
        const x = -2 + i * 10;
        const m = new T.Mesh(GEO.cone, colorMat(0x2b2921));
        m.scale.set(9, 13 + i * 2, 9);
        m.position.set(x, 5, -29);
        m.rotation.y = i;
        staticGroup.add(m);
      }
    }
    // low ruins on both sides of the street
    for (let i = 0; i < 5; i++) {
      const x = 6 + i * 9;
      addBox(staticGroup, 3.4, 1.2 + (i % 2), .5, 0x2a2720, x, .7, -5.6);
      addBox(staticGroup, 2.8, .9 + ((i + 1) % 2), .5, 0x242119, x + 3.5, .55, 5.8);
    }
  }

  function addObstacles(S) {
    if (!S.level || !S.level.obstacles) return;
    for (const o of S.level.obstacles) {
      if (o.type === 'supply') continue;
      const x = (o.x + o.w / 2) * PX;
      const z = OBJECT_Z;
      const hbW = Math.max(.3, o.w * PX), hbH = Math.max(.3, o.h * PX);
      const hitbox = new T.Mesh(GEO.box, new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hitbox.scale.set(hbW, hbH, 1.15);
      hitbox.position.set(x, hbH / 2, z);
      hitbox.userData.collision = { w: hbW, h: hbH, d: 1.15, radius: Math.max(hbW, 1.15) / 2 };
      staticGroup.add(hitbox);
      if (o.type === 'sandbag') {
        const rows = Math.max(2, Math.ceil(o.h / 26));
        const cols = Math.max(2, Math.round(o.w / 30));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            addSphere(staticGroup, .24, 0x4a4636, x + (c - (cols - 1) / 2) * .5, .22 + r * .30, z + (r % 2 ? .25 : -.25));
          }
        }
      } else if (o.type === 'crate') {
        const w = o.w * PX, h = o.h * PX;
        addBox(staticGroup, w, h, .8, 0x352a1c, x, h / 2, z);
        addBox(staticGroup, w + .04, .06, .84, 0x1c1710, x, h * .55, z);
        addBox(staticGroup, .06, h + .04, .84, 0x1c1710, x, h / 2, z);
      } else if (o.type === 'wall') {
        const w = o.w * PX, h = o.h * PX;
        addBox(staticGroup, w, h, .7, 0x2c2921, x, h / 2, z);
        for (let i = -1; i <= 1; i += 2) addBox(staticGroup, .5, h * .7, .74, 0x353128, x + i * w * .3, h * .35, z);
      } else if (o.type === 'rock') {
        const s = Math.max(.45, o.w * PX * .7);
        const r = new T.Mesh(GEO.rock, colorMat(0x3f3c31));
        r.scale.set(s, s * 1.1, s);
        r.position.set(x, s * .45, z);
        staticGroup.add(r);
      }
    }
  }

  function addFires(S) {
    fireObjects = [];
    if (!S.fires) return;
    S.fires.forEach((f, idx) => {
      const x = f.x * PX;
      const g = new T.Group();
      g.position.set(x, 0, OBJECT_Z);
      addCone(g, .42 * f.size, 1.1 * f.size, 0xd96022, 0, .55, 0, { emissive: 0x9c2d08 });
      addCone(g, .26 * f.size, .85 * f.size, 0xf2a748, 0, .65, .06, { emissive: 0xff7a22 });
      addCone(g, .13 * f.size, .55 * f.size, 0xffe2a0, 0, .78, -.03, { emissive: 0xffa34b });
      staticGroup.add(g);
      fireObjects.push({ group: g, phase: f.phase || idx });
      if (idx < 2) {
        const l = new T.PointLight(0xff8d45, .9, 8, 2);
        l.position.set(x, 1.4, OBJECT_Z);
        staticGroup.add(l);
      }
    });
  }

  function addEndCap(type, W) {
    const x = W + 2.5;
    if (type === 'stone') {
      addBox(staticGroup, 2.6, 4.6, 26, 0x20221b, x, 2.3, 0);
      for (let z = -11; z <= 11; z += 2.4) addBox(staticGroup, 3.0, 1.0, 1.2, 0x2b2c23, x, 5.0, z);
      addBox(staticGroup, 1.0, 3.0, 3.8, 0x0c0e0b, x - 1.5, 1.5, 0);
    } else if (type === 'rail') {
      addBox(staticGroup, 2.4, 4.2, 18, 0x272a26, x, 2.1, 0);
      addBox(staticGroup, 1.2, 3.4, 5.2, 0x090b0b, x - 1.4, 1.7, 0);
      addBeam(staticGroup, x, 4.0, -9, x, 4.0, 9, .3, 0x4e564e);
    } else if (type === 'town') {
      addBox(staticGroup, 3.4, 5.2, 24, 0x24231f, x, 2.6, 0);
      addBox(staticGroup, 4.0, .5, 25, 0x161613, x, 5.2, 0);
      addBox(staticGroup, .5, .7, .3, 0xd39a55, x - 1.8, 2.4, -3, 0, 0, { emissive: 0x8a3d16 });
      addBox(staticGroup, .5, .7, .3, 0xd39a55, x - 1.8, 2.4, 4, 0, 0, { emissive: 0x8a3d16 });
    } else {
      const m = new T.Mesh(GEO.cone, colorMat(type === 'earth' ? 0x2a261c : 0x23221c));
      m.scale.set(16, 18, 16);
      m.position.set(x + 6, 7, 0);
      staticGroup.add(m);
      addBox(staticGroup, 2.2, 3.2, 20, 0x27251d, x, 1.6, 0);
    }
  }

  /* ===== 分战场环境主题：17 场战役各有独立地貌与布景 ===== */
  const BATTLE_ENV = {
    lugouqiao:   {},
    pingxingguan:{ sky: 0x2b1d0e, fog: 0x54401f, far: 100, tree: 0x6b4a22 },
    taierzhuang: { sky: 0x201408, fog: 0x342a1a, far: 100, tree: 0x4a3c1a },
    wanjialing:  { sky: 0x121408, fog: 0x242a1c, far: 85,  tree: 0x1c2a16 },
    baituan:     { sky: 0x0a0a08, fog: 0x161512, far: 90 },
    changde:     { sky: 0x0c161c, fog: 0x1a2830, far: 105, tree: 0x2c4428 },
    songshan:    { sky: 0x0e1a0c, fog: 0x20301e, far: 80,  tree: 0x26421e },
    sihang:      { sky: 0x101828, fog: 0x182234, far: 140 },
    changsha:    { sky: 0x2c1608, fog: 0x603c22, far: 95 },
    hengyang:    { sky: 0x221408, fog: 0x382a1e, far: 85 },
    nanchang:    { sky: 0x140e1a, fog: 0x201a26, far: 110 },
    huangyangjie:{ sky: 0x141c12, fog: 0x2a362c, far: 75,  tree: 0x2c4020 },
    longgang:    { sky: 0x1a2008, fog: 0x303a1c, far: 90,  tree: 0x303c16 },
    luding:      { sky: 0x0c1218, fog: 0x1c242c, far: 135 },
    xian:        { sky: 0x241a0c, fog: 0x403422, far: 105, tree: 0x2c3a1e },
    menglianggu: { sky: 0x201c0c, fog: 0x3c3826, far: 95,  tree: 0x2e3818 },
    tashan:      { sky: 0x241809, fog: 0x42341e, far: 105, tree: 0x3c3016 },
  };

  function hRidge(W, z, color, hBase, spread, step, zJitter) {
    for (let x = -8; x < W + 8; x += step) {
      const m = new T.Mesh(GEO.cone, colorMat(color));
      const h = hBase + Math.abs(Math.sin(x * .7)) * spread;
      m.scale.set(h * .8, h, h * .8);
      m.position.set(x, h * .38, z + (zJitter ? Math.sin(x * 1.7) * zJitter : 0));
      m.rotation.y = x;
      staticGroup.add(m);
    }
  }
  function hSnowPeak(x, z, s) {
    const m = new T.Mesh(GEO.cone, colorMat(0x3c424a));
    m.scale.set(s, s * 1.5, s); m.position.set(x, s * .55, z); m.rotation.y = x * .3; staticGroup.add(m);
    const cap = new T.Mesh(GEO.cone, colorMat(0xd6dce4));
    cap.scale.set(s * .48, s * .62, s * .48); cap.position.set(x, s * 1.02, z); staticGroup.add(cap);
  }
  function hWater(W, z, width, color) {
    addPlane(staticGroup, W + 60, width, color || 0x0e1c22, W / 2, -.35, z, { rough: .3 });
    addPlane(staticGroup, W + 60, width, color || 0x0e1c22, W / 2, -.34, -z, { rough: .3 });
  }
  function hSmoke(x, z, h) {
    for (let i = 0; i < 4; i++) {
      addCone(staticGroup, 1.1 + i * .9, 2.8 + i, 0x181512, x + Math.sin(i * 2.1) * .8, 1.5 + i * (h / 3.2), z, { opacity: .78 - i * .13 });
    }
  }
  function hHouse(x, z, w, h, d, color, lit) {
    addBox(staticGroup, w, h, d, color, x, h / 2, z);
    addBox(staticGroup, w + .5, .4, d + .5, 0x1a1814, x, h + .2, z);
    if (lit) {
      addBox(staticGroup, .4, .5, .16, 0xd39a55, x - w * .28, h * .55, z + d / 2 + .02, 0, 0, { emissive: 0x9a4418 });
      addBox(staticGroup, .4, .5, .16, 0xd39a55, x + w * .28, h * .55, z + d / 2 + .02, 0, 0, { emissive: 0x9a4418 });
    }
  }
  function hGateTower(x, z) {
    // 双层城门楼
    addBox(staticGroup, 7.5, 3.2, 3.4, 0x33302a, x, 4.4, z);
    addBox(staticGroup, 8.4, .5, 4.2, 0x1a1812, x, 6.2, z);
    addBox(staticGroup, 5.6, 2.2, 2.6, 0x3c382e, x, 7.4, z);
    addBox(staticGroup, 6.8, .45, 3.4, 0x161410, x, 8.75, z);
    addBox(staticGroup, 2.6, 3.4, .5, 0x0a0a08, x, 1.7, z + 1.6);
  }
  function hFlag(x, z, color) {
    addCyl(staticGroup, .05, 4.4, 0x4a4436, x, 2.2, z);
    addBox(staticGroup, 1.3, .75, .04, color || 0x8c2d24, x + .68, 4.0, z);
  }

  function addBattleTheme(S, W, type, env) {
    const id = S.battle && S.battle.id;
    if (!id || id === 'lugouqiao') return; // 卢沟桥章节自带石桥/铁路布景
    if (id === 'pingxingguan') {
      // 乔沟峡谷：两侧陡壁夹峙，秋色林木，日军辎重板车残骸
      hRidge(W, -12, 0x2e2415, 16, 10, 14, 2);
      hRidge(W, 12, 0x332818, 18, 9, 15, 2);
      for (let x = 6; x < W; x += 17) { makeTree(staticGroup, x, -7.5, 1.1, 0x6b4a22); makeTree(staticGroup, x + 8, 7.5, .95, 0x7a5424); }
      for (const [cx, cz] of [[W * .38, -3.4], [W * .62, 3.6]]) {
        addBox(staticGroup, 2.2, .5, 1.3, 0x4a3a24, cx, .55, cz);
        addSphere(staticGroup, .38, 0x2c2418, cx - .8, .38, cz + .7);
        addSphere(staticGroup, .38, 0x2c2418, cx + .8, .38, cz + .7);
        addBeam(staticGroup, cx + 1.1, .6, cz, cx + 2.0, .35, cz, .09, 0x3c3020);
      }
    } else if (id === 'taierzhuang') {
      // 运河古城：一侧水道石栏，茶楼灯笼
      hWater(W, -15, 10, 0x14262c);
      addBox(staticGroup, W, .8, .5, 0x5a5344, W / 2, .4, -9.6);
      for (let x = 0; x < W; x += 5) addBox(staticGroup, .4, 1.0, .4, 0x665e4c, x, .5, -9.6);
      for (let x = 8; x < W; x += 26) {
        addCyl(staticGroup, .07, 3.4, 0x3c2e1c, x, 1.7, -8.6);
        addBox(staticGroup, .34, .42, .34, 0xc4482e, x, 3.1, -8.6, 0, 0, { emissive: 0x7a1e0c });
      }
      hRidge(W, -34, 0x1c1a12, 10, 6, 18, 0);
    } else if (id === 'wanjialing') {
      // 万家岭：密林深山，雾重
      hRidge(W, -16, 0x1a2012, 20, 12, 13, 3);
      hRidge(W, 16, 0x1e2414, 22, 10, 14, 3);
      for (let x = 2; x < W; x += 7) { makeTree(staticGroup, x, -8 - (x % 5), 1.25, 0x1c2a16); makeTree(staticGroup, x + 3.5, 8 + (x % 4), 1.05, 0x182614); }
    } else if (id === 'baituan') {
      // 百团大战·正太铁路：煤堆、水塔、信号机
      for (const [px, pz, s] of [[W * .25, -7, 1.6], [W * .55, 7, 2.0], [W * .8, -6.5, 1.4]]) {
        addSphere(staticGroup, s, 0x121110, px, s * .5, pz);
        addSphere(staticGroup, s * .7, 0x1a1816, px + s * .8, s * .35, pz + .8);
      }
      addCyl(staticGroup, 1.1, 2.2, 0x3c3a34, W * .42, 4.2, 8.4);
      for (const [lx, lz] of [[-.9, -.9], [.9, -.9], [-.9, .9], [.9, .9]]) addBox(staticGroup, .18, 3.2, .18, 0x33322c, W * .42 + lx, 1.6, 8.4 + lz);
      for (let x = 10; x < W; x += 30) {
        addBox(staticGroup, .14, 2.6, .14, 0x3a3c36, x, 1.3, -5.4);
        addBox(staticGroup, .5, .5, .12, 0xb03826, x, 2.7, -5.4, 0, 0, { emissive: 0x5c150a });
      }
    } else if (id === 'changde') {
      // 常德水城：沅江水面 + 城墙 + 吊脚楼
      hWater(W, -18, 14, 0x12262e);
      for (let x = 4; x < W; x += 9) makeTree(staticGroup, x, -9.5, .9, 0x2c4428);
      hGateTower(W * .5, -13);
      for (let x = 10; x < W; x += 22) hHouse(x, 9.8, 4.4, 3.4 + (x % 3), 3.8, x % 2 ? 0x2e2c24 : 0x38342a, true);
    } else if (id === 'songshan') {
      // 滇西松山：原始雨林，竹木参天
      hRidge(W, -18, 0x1a2814, 22, 10, 14, 3);
      for (let x = 0; x < W; x += 6) {
        const s = 1.5 + Math.abs(Math.sin(x * .9)) * .9;
        makeTree(staticGroup, x, -8.5 - (x % 4), s, 0x26421e);
        if (x % 12 < 6) makeTree(staticGroup, x + 3, 8.5 + (x % 3), s * .85, 0x22401c);
      }
      for (let x = 5; x < W; x += 15) { addCyl(staticGroup, .09, 4.5, 0x3a4a20, x, 2.25, -6); addCyl(staticGroup, .08, 3.8, 0x42522a, x + .5, 1.9, 6.2); }
    } else if (id === 'sihang') {
      // 四行仓库·上海：租界天际线 + 苏州河 + 仓库立面
      addPlane(staticGroup, W + 60, 16, 0x142430, W / 2, -.3, -20, { rough: .25 });
      for (let i = 0; i < 14; i++) {
        const x = -4 + i * (W + 8) / 14;
        const h = 8 + (i % 5) * 2.4;
        addBox(staticGroup, 4.6, h, 4.0, i % 2 ? 0x2c3038 : 0x343840, x, h / 2, -30 - (i % 3) * 3);
        for (let r = 1.2; r < h - .8; r += 1.6)
          for (let c = -1.4; c <= 1.4; c += 1.4)
            if ((i + Math.round(r * 2) + Math.round(c)) % 3) addBox(staticGroup, .5, .7, .1, 0xd9b271, x + c, r, -27.9 - (i % 3) * 3, 0, 0, { emissive: 0x8a5c1a });
      }
      // 近处仓库楼（四行仓库体量）
      for (const wx of [W * .3, W * .75]) {
        addBox(staticGroup, 10, 9.5, 5.5, 0x3a3c40, wx, 4.75, -11.5);
        for (let r = 1.4; r < 9; r += 1.7) addBox(staticGroup, 9, .3, .2, 0x24262a, wx, r, -8.65);
      }
    } else if (id === 'changsha') {
      // 长沙焦土：浓烟柱 + 残垣断壁
      hSmoke(W * .3, -7, 10); hSmoke(W * .62, 6, 12); hSmoke(W * .85, -5, 8);
      for (let x = 4; x < W; x += 11) {
        addBox(staticGroup, 3.6, 1.2 + (x % 3) * .5, .6, 0x1c1a16, x, .8, -6.2);
        addBox(staticGroup, 3.0, .9 + (x % 2) * .6, .6, 0x181614, x + 4, .65, 6.4);
      }
    } else if (id === 'hengyang') {
      // 衡阳孤城：崩塌工事、弹坑
      hSmoke(W * .45, -6, 9);
      for (let x = 3; x < W; x += 9) {
        addBox(staticGroup, 2.6, .8 + Math.abs(Math.sin(x)) * 1.4, .7, 0x22201a, x, .7, -5.8);
        addPlane(staticGroup, 2.2, 1.6, 0x0e0c0a, x + 3, .02, 4.2);
      }
    } else if (id === 'nanchang') {
      // 南昌城：城墙敌楼 + 旗帜
      addBox(staticGroup, W + 10, 6, 1.6, 0x3a362c, W / 2, 3, -12.5);
      for (let x = -2; x < W + 4; x += 4) addBox(staticGroup, 1.6, 1.2, 1.7, 0x443f32, x, 6.6, -12.5);
      hGateTower(W * .5, -12.5);
      hFlag(W * .5 - 5.5, -11, 0x8c2d24); hFlag(W * .5 + 5.5, -11, 0x2c3a6b);
    } else if (id === 'huangyangjie') {
      // 黄洋界：云雾竹海 + 哨口红旗
      hRidge(W, -14, 0x24301e, 18, 12, 12, 4);
      hRidge(W, -30, 0x2c3830, 26, 12, 16, 4);
      for (let x = 2; x < W; x += 4.5) { addCyl(staticGroup, .07, 3.6 + (x % 3), 0x3c5024, x, 1.8, -7 - (x % 3)); }
      hFlag(W * .5, -8.2, 0x8c2d24);
      addBox(staticGroup, 2.4, 1.6, 1.8, 0x2e2c24, W * .5, .8, -9.4);
    } else if (id === 'longgang') {
      // 龙岗：丘陵村落
      hRidge(W, -16, 0x2a3016, 12, 8, 16, 3);
      for (let x = 8; x < W; x += 20) hHouse(x, 8.8, 4.0, 2.8, 3.4, x % 2 ? 0x33291c : 0x3d3224, x % 3 === 0);
    } else if (id === 'luding') {
      // 大渡河峡谷：激流 + 雪山 + 桥塔铁索
      hWater(W, -13, 18, 0x1a3038);
      for (let i = 0; i < 8; i++) hSnowPeak(-6 + i * (W + 12) / 8, -44 - (i % 3) * 8, 12 + (i % 3) * 4);
      hRidge(W, 14, 0x2c2a20, 20, 10, 13, 3);
      for (const bx of [1.5, W - 1.5]) {
        addBox(staticGroup, 1.2, 5.2, 1.2, 0x3c3020, bx, 2.6, -4.4);
        addBox(staticGroup, 1.2, 5.2, 1.2, 0x3c3020, bx, 2.6, 4.4);
        addBox(staticGroup, 1.6, .6, 10.2, 0x342a1c, bx, 5.4, 0);
      }
    } else if (id === 'xian') {
      // 临潼华清池：宫墙 + 骊山 + 亭台
      hRidge(W, -18, 0x32301e, 14, 8, 15, 2);
      addBox(staticGroup, W, 4.2, 1.2, 0x4c4234, W / 2, 2.1, -9.5);
      for (let x = 0; x < W; x += 4) addBox(staticGroup, 1.4, .9, 1.3, 0x564a3a, x, 4.6, -9.5);
      // 重檐亭台
      addBox(staticGroup, 4.6, 2.6, 3.6, 0x50483c, W * .5, 1.3, 7.8);
      addBox(staticGroup, 5.6, .5, 4.6, 0x6b3a22, W * .5, 2.9, 7.8);
      addBox(staticGroup, 3.4, 1.6, 2.6, 0x584f40, W * .5, 3.9, 7.8);
      addBox(staticGroup, 4.4, .45, 3.6, 0x6b3a22, W * .5, 4.9, 7.8);
      for (let x = 6; x < W; x += 13) makeTree(staticGroup, x, 9.6, .8, 0x2c3a1e);
    } else if (id === 'menglianggu') {
      // 孟良崮：沂蒙崮形山石 + 石屋村落
      for (let x = -4; x < W + 6; x += 18) {
        const h = 12 + Math.abs(Math.sin(x)) * 8;
        addBox(staticGroup, 7, h, 7, 0x4c4636, x, h * .4, -18);
        addBox(staticGroup, 5, 2.2, 5, 0x5a5340, x, h * .8 + 1, -18);
      }
      for (let x = 8; x < W; x += 18) { hHouse(x, 8.6, 3.6, 2.6, 3.2, 0x4a4438, false); makeTree(staticGroup, x + 6, 8, 1.1, 0x2e3818); }
    } else if (id === 'tashan') {
      // 塔山：铁路穿村 + 白杨防风林
      addBox(staticGroup, W, .12, 3.4, 0x3a382e, W / 2, .06, 8.2);
      for (const z of [7.2, 8.2, 9.2]) addBox(staticGroup, W, .1, .12, 0x6a6455, W / 2, .16, z);
      for (let x = 0; x < W; x += 2.2) addBox(staticGroup, .2, .1, 3.4, 0x2c2a22, x, .13, 8.2);
      for (let x = 4; x < W; x += 6) makeTree(staticGroup, x, -8, 1.3, 0x3c3016);
      for (let x = 12; x < W; x += 24) hHouse(x, 11.4, 3.8, 2.7, 3.4, 0x363022, true);
    }
  }

  function buildStatic(S) {
    clearGroup(staticGroup);
    clearGroup(skyGroup);
    fireObjects = [];
    currentType = S.level.type;
    const type = S.level.type;
    const env = BATTLE_ENV[(S.battle && S.battle.id) || 'lugouqiao'] || {};
    const W = S.level.width * PX;
    buildSky(type, env);
    if (type === 'stone') addBridgeStone(W);
    else if (type === 'rail') addBridgeRail(W);
    else addFieldBase(W, type, env);
    addEndCap(type, W);
    addObstacles(S);
    addFires(S);
    addBattleTheme(S, W, type, env);
    // distant horizon ridge
    for (let i = -1; i < 5; i++) {
      const m = new T.Mesh(GEO.cone, colorMat(type === 'earth' || type === 'mountain' ? 0x1d1912 : 0x111615));
      m.scale.set(14, 9 + (i % 2) * 3, 14);
      m.position.set(W * (i / 4), 4, -38);
      m.rotation.y = i;
      staticGroup.add(m);
    }
  }

  function makeSoldier(color, enemy) {
    const root = new T.Group();
    const body = new T.Group();
    root.add(body);
    const pants = color === '#4d5849' ? 0x3b4438 : 0x424132;
    const skin = 0xb88e6d;
    const legL = new T.Group();
    legL.position.set(0, .7, .16);
    addBox(legL, .2, .68, .23, pants, 0, -.34, 0);
    const legR = new T.Group();
    legR.position.set(0, .7, -.16);
    addBox(legR, .2, .68, .23, pants, 0, -.34, 0);
    body.add(legL, legR);
    addBox(body, .42, .62, .34, color, 0, 1.03, 0);
    addBox(body, .46, .08, .38, 0x2a2b22, 0, .9, 0);
    addSphere(body, .22, skin, 0, 1.53, 0);
    addBox(body, .46, .15, .44, 0x343a31, 0, 1.67, 0);
    addBox(body, .48, .08, .46, 0x2a3029, 0, 1.58, 0);
    const aim = new T.Group();
    aim.position.set(.1, 1.24, 0);
    body.add(aim);
    addBox(aim, .18, .18, .55, color, .08, 0, .3);
    addBox(aim, .18, .18, .55, color, .08, 0, -.3);
    addBox(aim, .9, .07, .09, 0x2a261e, .34, 0, .18);
    addBox(aim, .22, .12, .12, 0x4a3b27, -.08, -.02, .18);
    const muzzle = addSphere(aim, .11, 0xffdc8c, .82, 0, .18, { emissive: 0xffa33d });
    muzzle.visible = false;
    const marker = new T.Mesh(GEO.cone, basicMat(0xc5432f));
    marker.scale.set(.11, .22, .11);
    marker.rotation.z = Math.PI;
    marker.position.set(0, 2.08, 0);
    marker.visible = !!enemy;
    root.add(marker);
    const knife = addBox(aim, .45, .04, .06, 0xd5c9a8, .55, 0, -.26);
    knife.visible = false;
    const shadow = new T.Mesh(GEO.plane, basicMat(0x000000, .33));
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(.62, .34, 1);
    shadow.position.y = .012;
    root.add(shadow);
    // invisible collision / hit box for the whole soldier
    const hitbox = new T.Mesh(GEO.box, new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hitbox.scale.set(.58, 1.72, .52);
    hitbox.position.y = .86;
    hitbox.userData.hitbox = true;
    root.add(hitbox);
    root.userData.collision = { w: .58, h: 1.72, d: .52, radius: .3 };
    return { root, body, legL, legR, aim, muzzle, marker, knife, shadow, hitbox };
  }

  function makeNest() {
    const root = new T.Group();
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2;
      addSphere(root, .32, 0x777056, Math.cos(a) * .9, .25, Math.sin(a) * .9);
      addSphere(root, .28, 0x81795c, Math.cos(a) * .75, .5, Math.sin(a) * .75);
    }
    addBox(root, 1.0, .5, .5, 0x434238, 0, .45, 0);
    addBox(root, .5, .4, .35, 0x34352e, -.1, .82, 0);
    addBox(root, .8, .07, .07, 0x22231e, .55, .82, 0);
    const marker = new T.Mesh(GEO.cone, basicMat(0xc5432f));
    marker.scale.set(.11, .22, .11);
    marker.rotation.z = Math.PI;
    marker.position.set(0, 1.65, 0);
    root.add(marker);
    const hitbox = new T.Mesh(GEO.box, new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hitbox.scale.set(2.0, 1.7, 2.0);
    hitbox.position.y = .85;
    hitbox.userData.hitbox = true;
    root.add(hitbox);
    root.userData.collision = { w: 2.0, h: 1.7, d: 2.0, radius: .9 };
    return { root, marker, hitbox };
  }

  function ensureScene(S) {
    const key = (S.battle && S.battle.id || ('ch' + S.chapter)) + '|' + S.level.type + '|' + S.level.width + '|' + (S.level.start || 0);
    if (key === sceneKey) return;
    sceneKey = key;
    for (const [e, g] of enemyGroups) dynamicGroup.remove(g.root);
    for (const [a, g] of allyGroups) dynamicGroup.remove(g.root);
    for (const [b, g] of bulletGroups) dynamicGroup.remove(g);
    for (const [f, g] of flashSprites) dynamicGroup.remove(g);
    for (const [e, g] of explosionMeshes) dynamicGroup.remove(g);
    for (const [p, g] of pickupGroups) dynamicGroup.remove(g);
    for (const [c, g] of civilianGroups) dynamicGroup.remove(g);
    enemyGroups.clear(); allyGroups.clear(); bulletGroups.clear(); flashSprites.clear(); explosionMeshes.clear(); pickupGroups.clear(); civilianGroups.clear();
    for (const tr of tracers) dynamicGroup.remove(tr.line);
    tracers.length = 0;
    buildStatic(S);
  }

  function syncSoldier(parts, x, z, facing, walk, moving, crouch, dead, crouchScale) {
    const root = parts.root;
    root.position.set(x, 0, z);
    root.rotation.y = facing;
    if (dead) {
      root.rotation.z = -Math.PI / 2;
      root.position.y = .08;
      return;
    }
    root.rotation.z = 0;
    const sc = crouch ? (crouchScale || .78) : 1;
    parts.body.scale.y = sc;
    parts.body.position.y = crouch ? -.06 : 0;
    const swing = moving ? Math.sin(walk) * .42 : Math.sin(walk * .4) * .04;
    parts.legL.rotation.z = swing;
    parts.legR.rotation.z = -swing;
    parts.body.position.y += moving ? Math.abs(Math.sin(walk)) * .02 : Math.sin(walk) * .008;
    return sc;
  }

  function setAim(parts, p) {
    let a = p.aim;
    if (p.facing < 0) a = Math.PI - a;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    a = Math.max(-1.15, Math.min(1.15, a));
    parts.aim.rotation.z = -a;
  }

  function syncPlayer(S) {
    const p = S.player;
    if (!playerGroup || !p) return;
    playerGroup.visible = false;
    if (!viewWeapon) return;
    viewWeapon.visible = p.alive;
    if (!p.alive) {
      muzzleLight.intensity = 0;
      return;
    }
    let a = p.aim;
    if (p.facing < 0) a = Math.PI - a;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    a = Math.max(-.7, Math.min(.7, a));
    const bob = p.moving ? Math.sin(p.walk * 2) * .012 : Math.sin(p.walk * .6) * .003;
    const sway = p.moving ? Math.cos(p.walk) * .008 : 0;
    viewWeapon.position.set(.30 + sway, -.30 + bob, -.48 - (p.muzzle > 0 ? .035 : 0));
    viewWeapon.rotation.x = -a * .42;
    viewWeapon.rotation.y = -.08 - a * .18;
    viewWeapon.rotation.z = p.reloading ? .42 : p.meleeT > 0 ? -.22 : 0;
    if (viewMuzzle) viewMuzzle.visible = p.muzzle > 0;
    if (viewKnife) viewKnife.visible = p.meleeT > 0;
    if (viewMuzzle) {
      viewMuzzle.getWorldPosition(tmpVec);
      muzzleLight.position.copy(tmpVec);
      muzzleLight.intensity = p.muzzle > 0 ? 1.8 : 0;
    }
  }

  function syncEnemies(S) {
    const p = S.player;
    const seen = new Set();
    for (const e of S.enemies) {
      seen.add(e);
      let g = enemyGroups.get(e);
      if (!g) {
        g = e.nest ? makeNest() : makeSoldier(e.type === 'charger' ? '#55533d' : '#5d5b43', true);
        g.root.userData.enemy = e;
        enemyGroups.set(e, g);
        dynamicGroup.add(g.root);
      }
      const x = e.x * PX;
      const z = ENEMY_Z + (e.lat || 0);
      // 全 3D 朝向：模型前方为 +X，平滑转向玩家——绕到侧面/背面能看到人物各个角度
      const px2 = p ? p.x * PX : x + 1;
      const target = Math.atan2(-(PLAYER_Z - z), px2 - x);
      let ry = g.root.rotation.y || 0;
      let dd = target - ry;
      dd = Math.atan2(Math.sin(dd), Math.cos(dd));
      ry = Math.atan2(Math.sin(ry + dd * .2), Math.cos(ry + dd * .2));
      g.root.position.set(x, 0, z);
      g.root.rotation.y = ry;
      if (e.nest) {
        g.root.visible = e.alive;
        continue;
      }
      const dead = !e.alive;
      if (dead) {
        g.root.rotation.z = -Math.PI / 2;
        g.root.position.y = .06;
      } else {
        g.root.rotation.z = 0;
        const crouch = !!e.crouch || e.type === 'mg';
        syncSoldier(g, x, z, ry, e.walk || 0, !!e.moving, crouch, false, .76);
        if (g.muzzle) g.muzzle.visible = e.muzzle > 0;
        if (g.marker) g.marker.visible = true;
      }
    }
    for (const [e, g] of enemyGroups) {
      if (!seen.has(e)) {
        dynamicGroup.remove(g.root);
        enemyGroups.delete(e);
      }
    }
  }

  function syncAllies(S) {
    if (!S.allies) return;
    const seen = new Set();
    for (const a of S.allies) {
      seen.add(a);
      let g = allyGroups.get(a);
      if (!g) {
        g = makeSoldier('#4e5748', false);
        allyGroups.set(a, g);
        dynamicGroup.add(g.root);
      }
      g.root.visible = a.alive;
      if (!a.alive) continue;
      const ax = a.x * PX, az = ENEMY_Z + .4 + (a.lat || 0);
      // 全 3D 朝向：转向最近的活敌（模型前方 +X），平滑过渡
      let tx = ax + 8, tz = az, bestD = Infinity;
      for (const e of (S.enemies || [])) {
        if (!e.alive || e.nest) continue;
        const ex = e.x * PX, ez = ENEMY_Z + (e.lat || 0);
        const d2 = (ex - ax) * (ex - ax) + (ez - az) * (ez - az);
        if (d2 < bestD) { bestD = d2; tx = ex; tz = ez; }
      }
      const target = Math.atan2(-(tz - az), tx - ax);
      let ry = g.root.rotation.y || 0;
      let dd = target - ry;
      dd = Math.atan2(Math.sin(dd), Math.cos(dd));
      ry = Math.atan2(Math.sin(ry + dd * .2), Math.cos(ry + dd * .2));
      g.root.position.set(ax, 0, az);
      g.root.rotation.y = ry;
      g.root.rotation.z = 0;
      g.body.scale.y = 1;
      g.legL.rotation.z = Math.sin((a.walk || 0) * .8) * .16;
      g.legR.rotation.z = -g.legL.rotation.z;
      if (g.muzzle) g.muzzle.visible = a.muzzle > 0;
    }
    for (const [a, g] of allyGroups) {
      if (!seen.has(a)) { dynamicGroup.remove(g.root); allyGroups.delete(a); }
    }
  }

  function syncBullets(S) {
    const seen = new Set();
    for (const b of S.bullets) {
      seen.add(b);
      let m = bulletGroups.get(b);
      if (!m) {
        m = new T.Mesh(GEO.sphere, basicMat(b.owner === 'player' ? 0xffdc8f : 0xff6a45, .9));
        m.scale.set(.06, .06, .15);
        dynamicGroup.add(m);
        bulletGroups.set(b, m);
      }
      m.position.set(b.x * PX, (650 - b.y) * PX, ENEMY_Z + .8);
    }
    for (const [b, m] of bulletGroups) {
      if (!seen.has(b)) { dynamicGroup.remove(m); bulletGroups.delete(b); }
    }
  }

  function syncFlashes(S) {
    if (!S.flashes) return;
    const seen = new Set();
    for (const f of S.flashes) {
      seen.add(f);
      let s = flashSprites.get(f);
      if (!s) {
        s = new T.Mesh(GEO.sphere, basicMat(0xffd08b, .8));
        s.scale.set(.22, .22, .22);
        dynamicGroup.add(s);
        flashSprites.set(f, s);
      }
      const k = f.life / f.max;
      s.position.set(f.x * PX, (650 - f.y) * PX, ENEMY_Z + .9);
      s.scale.setScalar(.18 + k * .18);
    }
    for (const [f, s] of flashSprites) {
      if (!seen.has(f)) { dynamicGroup.remove(s); flashSprites.delete(f); }
    }
  }

  function syncEffects(S) {
    const seen = new Set();
    if (S.explosions) {
      for (const e of S.explosions) {
        seen.add(e);
        let m = explosionMeshes.get(e);
        if (!m) {
          m = new T.Mesh(GEO.sphere, basicMat(0xffa24a, .55));
          dynamicGroup.add(m);
          explosionMeshes.set(e, m);
        }
        const k = e.life / e.max;
        const r = .35 + k * 2.2;
        m.scale.set(r, r, r);
        m.position.set(e.x * PX, (650 - e.y) * PX + .6, ENEMY_Z + .6);
      }
    }
    for (const [e, m] of explosionMeshes) {
      if (!seen.has(e)) { dynamicGroup.remove(m); explosionMeshes.delete(e); }
    }
  }

  function syncObjects(S) {
    if (!supplyObject) {
      supplyObject = new T.Group();
      // 箱体使用专属材质：补给用完后半透明，避免污染共享材质缓存
      const bodyMat = new T.MeshStandardMaterial({
        color: 0x3d482f, roughness: .88, metalness: 0, flatShading: true,
        transparent: true, opacity: 1
      });
      const body = new T.Mesh(GEO.box, bodyMat);
      body.scale.set(.85, .65, .65); body.position.set(0, .33, 0);
      supplyObject.add(body);
      supplyObject.userData.bodyMat = bodyMat;
      supplyObject.userData.used = false;
      addBox(supplyObject, .9, .08, .7, 0x22281a, 0, .7, 0);
      addBox(supplyObject, .38, .2, .02, 0xcbb47b, 0, .38, .34);
      supplyObject.userData.collision = { w: .9, h: .7, d: .7, radius: .45 };
      dynamicGroup.add(supplyObject);
    }
    if (S.supply) {
      supplyObject.visible = true;
      supplyObject.position.set((S.supply.x + S.supply.w / 2) * PX, 0, OBJECT_Z);
      if (supplyObject.userData.used !== !!S.supply.used) {
        supplyObject.userData.used = !!S.supply.used;
        supplyObject.userData.bodyMat.opacity = S.supply.used ? .35 : 1;
      }
    } else supplyObject.visible = false;

    if (!flagObject) {
      flagObject = new T.Group();
      addCyl(flagObject, .045, 3.4, 0x77705d, 0, 1.7, 0);
      const cloth = new T.Mesh(GEO.plane, colorMat(0x9e3026));
      cloth.scale.set(1.25, .7, 1);
      cloth.position.set(.66, 2.9, 0);
      cloth.rotation.y = -.05;
      flagObject.add(cloth);
      flagObject.userData.cloth = cloth;
      flagObject.userData.collision = { w: .5, h: 3.4, d: .5, radius: .25 };
      dynamicGroup.add(flagObject);
    }
    if (S.flag) {
      flagObject.visible = true;
      flagObject.position.set(S.flag.x * PX, 0, ENEMY_Z + .3);
      flagObject.userData.cloth.visible = !!S.flag.planted;
    } else flagObject.visible = false;

    if (!exitObject) {
      exitObject = new T.Group();
      addBox(exitObject, 1.2, .08, .7, 0x6c8a6a, 0, .04, 0);
      exitObject.userData.collision = { w: 1.2, h: .1, d: .7, radius: .6 };
      dynamicGroup.add(exitObject);
    }
    if (S.exit) {
      exitObject.visible = true;
      exitObject.position.set(S.exit.x * PX, 0, OBJECT_Z);
    } else exitObject.visible = false;

    if (S.pickups) {
      for (const p of S.pickups) {
        let g = pickupGroups.get(p);
        if (!g) {
          g = new T.Group();
          addBox(g, .35, .25, .35, 0x9b8149, 0, .16, 0);
          g.userData.collision = { w: .35, h: .25, d: .35, radius: .2 };
          dynamicGroup.add(g);
          pickupGroups.set(p, g);
        }
        g.position.set(p.x * PX, .12 + Math.sin(p.t * 4) * .06, OBJECT_Z + .4);
      }
    }
    for (const [p, g] of pickupGroups) {
      if (!S.pickups || !S.pickups.includes(p)) { dynamicGroup.remove(g); pickupGroups.delete(p); }
    }

    const civs = (S.chapterState && S.chapterState.civilians) || S.civilians || [];
    for (const c of civs) {
      let g = civilianGroups.get(c);
      if (!g) {
        g = makeSoldier('#595648', false);
        g.root.scale.set(.82, .82, .82);
        dynamicGroup.add(g.root);
        civilianGroups.set(c, g);
      }
      g.root.visible = true;
      g.root.position.set(c.x * PX, 0, ENEMY_Z - .6 + (c.lat || 0));
      g.root.rotation.y = Math.PI;
      g.root.rotation.z = 0;
      const w = c.phase || c.walk || 0;
      g.legL.rotation.z = Math.sin(w) * .22;
      g.legR.rotation.z = -g.legL.rotation.z;
      g.body.position.y = Math.abs(Math.sin(w)) * .025;
    }
    for (const [c, g] of civilianGroups) {
      if (!civs.includes(c)) { dynamicGroup.remove(g.root); civilianGroups.delete(c); }
    }
  }

  function updateCamera(S) {
    const p = S.player;
    if (!p) return;
    const px = p.x * PX;
    const sh = S.shake || 0;
    const sx = sh > 0 ? (Math.random() - .5) * sh * .24 : 0;
    const sy = sh > 0 ? (Math.random() - .5) * sh * .18 : 0;
    const eye = (650 - p.y) * PX + (p.crouch ? EYE_CROUCH : EYE_STAND);
    const bob = p.moving && p.onGround ? Math.sin(p.walk * 2) * .012 : 0;
    const lat = p.lat || 0;
    const yaw = S.look ? S.look.yaw : 0;
    const pitch = S.look ? S.look.pitch : 0;
    camera.position.set(px + sx, eye + bob + sy, lat);
    camera.lookAt(px + Math.cos(yaw) * 10, eye + bob - .08 + Math.sin(pitch) * 10, lat + Math.sin(yaw) * 10);
    skyGroup.position.x = px;
    sunLight.position.x = px - 12;
    if (rainPoints) rainPoints.position.x = px;
  }

  function animateStatic(now, S) {
    for (const f of fireObjects) {
      const k = Math.sin(now * .006 + f.phase * 3) * .12 + 1;
      f.group.scale.y = k;
      f.group.scale.x = 1 + Math.sin(now * .005 + f.phase) * .06;
    }
    if (flagObject && flagObject.userData.cloth) {
      flagObject.userData.cloth.rotation.y = -.05 + Math.sin(now * .0015) * .06;
    }
  }

  function updateTracers(dt) {
    for (let i = tracers.length - 1; i >= 0; i--) {
      const tr = tracers[i];
      tr.life -= dt;
      if (tr.life <= 0) {
        dynamicGroup.remove(tr.line);
        tr.line.geometry.dispose();
        tr.line.material.dispose();
        tracers.splice(i, 1);
      } else {
        tr.line.material.opacity = .85 * (tr.life / tr.max);
      }
    }
  }

  function shoot3D(S) {
    if (!renderer || !camera || !active) return;
    camera.updateMatrixWorld();
    const ray = new T.Raycaster();
    ray.setFromCamera({ x: 0, y: 0 }, camera);
    const roots = [];
    for (const [e, g] of enemyGroups) if (e.alive) roots.push(g.root);
    const hits = ray.intersectObjects(roots.concat(staticGroup.children), true);
    let hit = null, enemy = null;
    for (const h of hits) {
      let o = h.object;
      let found = null;
      while (o) {
        if (o.userData && o.userData.enemy) { found = o.userData.enemy; break; }
        o = o.parent;
      }
      if (found && found.alive) { enemy = found; hit = h; break; }
      hit = h;
      break;
    }
    const dir = new T.Vector3();
    camera.getWorldDirection(dir);
    const start = new T.Vector3();
    if (viewMuzzle) viewMuzzle.getWorldPosition(start); else start.copy(camera.position);
    const end = hit ? hit.point.clone() : camera.position.clone().add(dir.multiplyScalar(45));
    const geo = new T.BufferGeometry().setFromPoints([start, end]);
    const mat = new T.LineBasicMaterial({ color: 0xffdf9d, transparent: true, opacity: .85 });
    const line = new T.Line(geo, mat);
    dynamicGroup.add(line);
    tracers.push({ line: line, life: .07, max: .07 });
    if (enemy && hit) {
      const head = hit.point.y > 1.5;
      if (window.__LQ2D && window.__LQ2D.damageEnemy) {
        window.__LQ2D.damageEnemy(enemy, head ? 100 : 55, head, true, true);
      }
    }
  }

  function render(S) {
    if (failed) { active = false; return false; }
    if (!S || !S.player || !S.level) { active = false; return false; }
    const modes = ['playing', 'paused', 'dialogue', 'chapterCard', 'chapterEnd', 'victory', 'gameOver', 'codex'];
    if (!modes.includes(S.mode)) { active = false; return false; }
    if (S.mode === 'codex' && S.codexReturn && (S.codexReturn.mode === 'menu' || S.codexReturn.mode === 'warMap')) { active = false; return false; }
    if (!init()) { active = false; return false; }
    try {
      active = true;
      resize();
      ensureScene(S);
      const now = performance.now();
      const dt = lastTime ? Math.min((now - lastTime) / 1000, .05) : .016;
      lastTime = now;
      syncPlayer(S);
      syncEnemies(S);
      syncAllies(S);
      syncBullets(S);
      syncFlashes(S);
      syncEffects(S);
      syncObjects(S);
      updateRain(dt, S);
      updateTracers(dt);
      animateStatic(now, S);
      updateCamera(S);
      renderer.render(scene, camera);
      return true;
    } catch (e) {
      failed = true;
      active = false;
      const app = document.getElementById('app');
      if (app) app.classList.remove('three-d');
      return false;
    }
  }

  window.LQ3D = {
    render: render,
    shoot: shoot3D,
    active: function () { return !!active && !failed; },
    get failed() { return failed; }
  };
})();
