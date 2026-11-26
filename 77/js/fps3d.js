/* =========================================================
   3D Vertical Slice — Lugouqiao 1937
   True 3D coordinates, capsule collision, pointer-lock look,
   raycast shooting and grid A* enemy navigation.
   ========================================================= */
(function () {
  'use strict';
  const T = window.THREE;
  if (!T) return;
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const BOUNDS = { minX: -4.45, maxX: 4.45, minZ: -62, maxZ: 52 };
  const START = { x: 0, z: 42 };
  const START_YAW = Math.PI; // 面西守桥，日军从桥西压上
  const EYE = 1.62, CROUCH_EYE = 1.12;
  const PLAYER_R = .35;

  let canvas, renderer, scene, camera, root;
  let weapon, muzzleFlash, muzzleLight;
  let stars, rain;
  let colliders = [], enemies = [], tracers = [], pickups = [];
  let nav = null;
  let initialized = false, open = false, playing = false, finished = false;
  let pointerLocked = false, fallback = false;
  let keys = Object.create(null);
  let mouse = { yaw: 0, pitch: 0 };
  let dragLook = { x: 0, y: 0, on: false };
  let last = 0, raf = 0, elapsed = 0;
  let messageTimer = 0;
  let player = null;

  const state = {
    hp: 100, ammo: 8, reserve: 32, reloading: false, reloadT: 0,
    kills: 0, recoil: 0, bob: 0, muzzleT: 0,
    wave: 1, waveDelay: 0, sinceHit: 99
  };

  function mat(color, opts) {
    opts = opts || {};
    return new T.MeshStandardMaterial({
      color: color,
      roughness: opts.rough === undefined ? .9 : opts.rough,
      metalness: opts.metal || 0,
      emissive: opts.emissive || 0x000000,
      emissiveIntensity: opts.emissive ? .8 : 0,
      flatShading: true
    });
  }
  const G = {
    box: new T.BoxGeometry(1, 1, 1),
    sphere: new T.SphereGeometry(1, 10, 8),
    cyl: new T.CylinderGeometry(1, 1, 1, 8),
    cone: new T.ConeGeometry(1, 1, 8),
    plane: new T.PlaneGeometry(1, 1)
  };
  function box(w, h, d, color, x, y, z, parent, opts) {
    const m = new T.Mesh(G.box, mat(color, opts));
    m.scale.set(w, h, d); m.position.set(x, y, z);
    (parent || root).add(m); return m;
  }
  function cyl(r, h, color, x, y, z, parent) {
    const m = new T.Mesh(G.cyl, mat(color));
    m.scale.set(r, h, r); m.position.set(x, y, z);
    (parent || root).add(m); return m;
  }
  function sphere(r, color, x, y, z, parent, opts) {
    const m = new T.Mesh(G.sphere, mat(color, opts));
    m.scale.set(r, r, r); m.position.set(x, y, z);
    (parent || root).add(m); return m;
  }
  function plane(w, d, color, x, y, z, parent) {
    const m = new T.Mesh(G.plane, mat(color));
    m.scale.set(w, d, 1); m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z); (parent || root).add(m); return m;
  }

  function collider(minX, maxX, minY, maxY, minZ, maxZ) {
    const b = new T.Box3(new T.Vector3(minX, minY, minZ), new T.Vector3(maxX, maxY, maxZ));
    colliders.push(b);
    return b;
  }

  function buildWorld() {
    root = new T.Group();
    scene.add(root);
    scene.background = new T.Color(0x020509);
    // 渲染范围扩大：雾 45→240，可视远 380→600
    scene.fog = new T.Fog(0x060b12, 30, 200);
    camera.far = 600; camera.updateProjectionMatrix?.();

    /* ===== 卢沟桥：1:2 历史比例（实桥 266.5 米长、11 孔联拱） ===== */
    // 桥面石板
    plane(10.4, 118, 0x161410, 0, 0, -4);
    plane(10.0, 117, 0x1b1915, 0, .02, -4);
    for (let z = -60; z <= 52; z += 6) box(10, .015, .07, 0x12110c, 0, .032, z);
    // 11 孔石拱与桥墩（分水尖）
    for (let i = 0; i < 11; i++) {
      const z = -56 + i * 10.4;
      const arch = new T.Mesh(new T.TorusGeometry(4.2, .55, 6, 16, Math.PI), mat(0x14120e));
      arch.position.set(0, -1.55, z); arch.rotation.z = Math.PI; root.add(arch);
    }
    for (let i = 0; i < 10; i++) {
      const pz = -50.8 + i * 10.4;
      box(11.2, 2.4, 1.4, 0x100f0a, 0, -1.9, pz);
      const cut = new T.Mesh(G.cone, mat(0x0e0d08));
      cut.scale.set(1.0, 2.2, 1.0); cut.position.set(0, -2.2, pz); root.add(cut);
    }

    /* ===== 永定河与两岸 ===== */
    plane(260, 300, 0x050d11, 0, -3.4, -6);
    box(70, 2.2, 300, 0x0c0d09, -40, -1.2, -6);   // 东岸（宛平城一侧）
    box(70, 2.2, 300, 0x0d0b08, 40, -1.2, -6);    // 西岸（日军集结地）

    /* ===== 望柱与石狮（实桥 281 望柱、501 石狮的象征性还原） ===== */
    for (const sx of [-1, 1]) {
      const x = sx * 4.95;
      box(.14, .8, 118, 0x171510, x, .5, -4);
      for (let z = -62; z <= 54; z += 2.9) {
        box(.26, 1.1, .26, 0x191712, x, .6, z);
        box(.34, .16, .34, 0x191712, x, 1.2, z);
        sphere(.24, 0x201c14, x, 1.44, z);          // 主狮
        sphere(.14, 0x241f15, x, 1.62, z + .05);    // 狮头
        if (Math.round((z + 62) / 2.9) % 2 === 0) sphere(.1, 0x1c1811, x, 1.36, z - .22); // 幼狮
      }
      collider(x - .4, x + .4, 0, 1.5, -64, 56);
    }

    /* ===== 宛平城（东端，1640 年建的拱卫卫城） ===== */
    box(25, 6.5, 2.2, 0x0f100c, -15.5, 3.25, 60);
    box(25, 6.5, 2.2, 0x0f100c, 15.5, 3.25, 60);
    collider(-28, -3, 0, 7, 58.9, 61.1);
    collider(3, 28, 0, 7, 58.9, 61.1);
    // 城门楼（双层）
    box(8.4, 2.2, 4.4, 0x12130e, 0, 7.0, 60);
    box(9.2, .5, 5.2, 0x0a0b07, 0, 8.3, 60);
    box(6.4, 1.6, 3.4, 0x15160f, 0, 9.2, 60);
    box(7.6, .45, 4.4, 0x080903, 0, 10.2, 60);
    box(5.4, 4.6, .6, 0x04060a, 0, 2.3, 58.8);   // 门洞暗影
    // 城内民房灯火
    for (let i = 0; i < 9; i++) {
      const hx = -14 + (i % 5) * 6.5, hz = 66 + Math.floor(i / 5) * 7;
      const hh = 2.6 + (i % 3) * 1.2;
      box(4.6, hh, 4.0, i % 2 ? 0x0e0d0a : 0x111009, hx, hh / 2, hz);
      box(5.2, .4, 4.6, 0x111009, hx, hh + .2, hz);
      if (i % 2 === 0) box(.35, .5, .18, 0xd39a55, hx - 2.3, hh * .55, hz, root, { emissive: 0x9a4418 });
    }
    const cityGlow = new T.PointLight(0xffb066, .7, 30, 2);
    cityGlow.position.set(0, 6, 64); root.add(cityGlow);

    /* ===== 西岸日军营地（第 20 联队集结地） ===== */
    for (const [tx, tz] of [[-9, -72], [0, -76], [9, -72]]) {
      const tent = new T.Mesh(new T.CylinderGeometry(1.9, 1.9, 3.6, 3), mat(0x211e15));
      tent.rotation.z = Math.PI / 2; tent.position.set(tx, 1.1, tz); root.add(tent);
    }
    for (const [fx, fz] of [[-6, -66], [6, -66], [0, -62]]) {
      const g = new T.Group(); g.position.set(fx, 0, fz); root.add(g);
      const c1 = new T.Mesh(G.cone, mat(0xd65b22, { emissive: 0x8d2608 })); c1.scale.set(.4, 1.0, .4); c1.position.y = .5; g.add(c1);
      const c2 = new T.Mesh(G.cone, mat(0xffc066, { emissive: 0xff7a22 })); c2.scale.set(.18, .6, .18); c2.position.y = .6; g.add(c2);
      const l = new T.PointLight(0xff8a3d, 1.1, 12, 2); l.position.set(fx, 1.4, fz); root.add(l);
    }
    // 探照灯光柱扫向桥面
    const beam = new T.Mesh(G.cyl, new T.MeshBasicMaterial({ color: 0xfff3c8, transparent: true, opacity: .05, depthWrite: false }));
    beam.scale.set(1.6, 46, 1.6); beam.position.set(14, 20, -62); beam.rotation.x = .5; root.add(beam);

    /* ===== 桥西端篝火：照亮日军进攻路线，剪影可读 ===== */
    for (const [fx, fz] of [[-2.6, -44], [2.8, -34]]) {
      const g = new T.Group(); g.position.set(fx, 0, fz); root.add(g);
      const c1 = new T.Mesh(G.cone, mat(0xd65b22, { emissive: 0x8d2608 })); c1.scale.set(.35, .9, .35); c1.position.y = .45; g.add(c1);
      const c2 = new T.Mesh(G.cone, mat(0xffc066, { emissive: 0xff7a22 })); c2.scale.set(.16, .55, .16); c2.position.y = .55; g.add(c2);
      const l = new T.PointLight(0xff8a3d, 1.2, 13, 2); l.position.set(fx, 1.3, fz); root.add(l);
    }
    // 西岸硝烟柱
    for (const [sx2, sz2] of [[-16, -70], [3, -78], [18, -68]]) {
      const sm = new T.Mesh(G.cyl, new T.MeshBasicMaterial({ color: 0x14161a, transparent: true, opacity: .28, depthWrite: false }));
      sm.scale.set(3, 26, 3); sm.position.set(sx2, 12, sz2); root.add(sm);
    }

    /* ===== 两岸树木 ===== */
    for (const side of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        const tx = side * (8.5 + (i % 3) * 3.2);
        const tz = -56 + i * 14;
        cyl(.14, 3.0, 0x0d0c08, tx, 1.5, tz);
        const crown = new T.Mesh(G.cone, mat(0x0d110a));
        crown.scale.set(1.3, 2.9, 1.3); crown.position.set(tx, 3.7, tz); root.add(crown);
      }
    }
    /* ===== 远山轮廓（西）与城郭天际（东） ===== */
    for (let i = 0; i < 10; i++) {
      const m = new T.Mesh(G.cone, mat(0x080a06));
      m.scale.set(14 + i % 3 * 6, 16 + i % 4 * 6, 14);
      m.position.set(-60 + i * 13, 4, -95 - (i % 2) * 15);
      root.add(m);
    }
    for (let i = 0; i < 6; i++) {
      const m = new T.Mesh(G.cone, mat(0x070906));
      m.scale.set(16 + i % 2 * 6, 12 + i % 3 * 5, 16);
      m.position.set(-40 + i * 16, 3, 95 + (i % 2) * 12);
      root.add(m);
    }

    /* ===== 二十九军军旗与守桥哨兵 ===== */
    const pole = new T.Group(); pole.position.set(-3.9, 0, 48); root.add(pole);
    cyl(.04, 3.4, 0x352f22, 0, 1.7, 0, pole);
    box(1.35, .75, .02, 0x8c2d24, .7, 2.95, 0, pole);
    box(.5, .28, .03, 0xd8c58a, .55, 2.95, .01, pole);
    for (const [ax, az] of [[-2.6, 44], [2.8, 45]]) {
      const ally = makeSoldier(CN_UNIFORM);
      ally.position.set(ax, 0, az); ally.rotation.y = Math.PI; root.add(ally);
    }

    /* ===== 沙袋与弹药箱（守桥掩体，兼导航障碍） ===== */
    const bags = [
      [-2.2, 38, 2.4, .85], [2.2, 36, 2.2, .8], [-1.9, 28, 2.6, .9],
      [2.0, 20, 2.2, .85], [-2.3, 12, 2.2, .8], [1.7, 4, 2.0, .85],
      [-2.0, -8, 2.4, .9], [2.2, -18, 2.2, .85], [-1.8, -28, 2.4, .85]
    ];
    for (const [x, z, w, h] of bags) {
      const rows = h > .85 ? 3 : 2;
      for (let r = 0; r < rows; r++) {
        for (let c = -1; c <= 1; c++) sphere(.26, 0x3a372a, x + c * .46, .2 + r * .26, z + (r % 2 ? .22 : -.22));
      }
      collider(x - w / 2, x + w / 2, 0, h + .2, z - .65, z + .65);
    }
    const crates = [[2.8, 42, .8], [-2.7, 26, .9], [2.4, 8, .8], [-2.8, -14, .85]];
    for (const [x, z, s] of crates) {
      box(s, s, s, 0x231b10, x, s / 2, z);
      box(s + .04, .05, s + .04, 0x2b2318, x, s * .55, z);
      collider(x - s / 2, x + s / 2, 0, s, z - s / 2, z + s / 2);
    }

    /* ===== 夜空：月亮、星辰、雨 ===== */
    const moon = new T.Mesh(G.sphere, new T.MeshBasicMaterial({ color: 0xf0e7d0 }));
    moon.scale.set(2.4, 2.4, 2.4); moon.position.set(18, 30, 70); root.add(moon);
    const halo = new T.Mesh(G.sphere, new T.MeshBasicMaterial({ color: 0x9eb6c8, transparent: true, opacity: .07 }));
    halo.scale.set(9, 9, 9); halo.position.copy(moon.position); root.add(halo);
    const pts = new Float32Array(320 * 3);
    for (let i = 0; i < 320; i++) {
      pts[i * 3] = (Math.random() - .5) * 240;
      pts[i * 3 + 1] = 10 + Math.random() * 60;
      pts[i * 3 + 2] = (Math.random() - .5) * 240;
    }
    const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(pts, 3));
    stars = new T.Points(sg, new T.PointsMaterial({ color: 0xc6d5df, size: .12, transparent: true, opacity: .65, depthWrite: false }));
    root.add(stars);

    const rc = 220, rp = new Float32Array(rc * 3);
    for (let i = 0; i < rc; i++) {
      rp[i * 3] = (Math.random() - .5) * 26;
      rp[i * 3 + 1] = Math.random() * 22;
      rp[i * 3 + 2] = (Math.random() - .5) * 90;
    }
    const rg = new T.BufferGeometry(); rg.setAttribute('position', new T.BufferAttribute(rp, 3));
    rain = new T.Points(rg, new T.PointsMaterial({ color: 0x9fb8c8, size: .04, transparent: true, opacity: .42, depthWrite: false }));
    rain.frustumCulled = false; root.add(rain);

    // 月光自东南（玩家背后）照亮桥面与敌军正面；压低强度保住夜战氛围
    const hemi = new T.HemisphereLight(0x8ca6bb, 0x100d0a, .35); scene.add(hemi);
    const dir = new T.DirectionalLight(0xcdd9e6, .45); dir.position.set(14, 28, 60); scene.add(dir);

    buildNav();
  }

  function pointBlocked(x, z, r) {
    if (x < BOUNDS.minX + r || x > BOUNDS.maxX - r) return true;
    if (z < BOUNDS.minZ + r || z > BOUNDS.maxZ - r) return true;
    for (const b of colliders) {
      if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z) return true;
    }
    return false;
  }

  function buildNav() {
    const cell = .5;
    const minX = -4.3, maxX = 4.3, minZ = -61, maxZ = 53;
    const nx = Math.floor((maxX - minX) / cell) + 1;
    const nz = Math.floor((maxZ - minZ) / cell) + 1;
    const blocked = new Uint8Array(nx * nz);
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const x = minX + ix * cell, z = minZ + iz * cell;
        if (pointBlocked(x, z, .36)) blocked[iz * nx + ix] = 1;
      }
    }
    nav = { cell, minX, minZ, nx, nz, blocked };
  }

  function cellOf(x, z) {
    return {
      x: clamp(Math.round((x - nav.minX) / nav.cell), 0, nav.nx - 1),
      z: clamp(Math.round((z - nav.minZ) / nav.cell), 0, nav.nz - 1)
    };
  }
  function cellPos(ix, iz) {
    return { x: nav.minX + ix * nav.cell, z: nav.minZ + iz * nav.cell };
  }
  function isBlocked(ix, iz) {
    return ix < 0 || iz < 0 || ix >= nav.nx || iz >= nav.nz || nav.blocked[iz * nav.nx + ix] === 1;
  }
  function nearestOpen(cx, cz) {
    if (!isBlocked(cx, cz)) return { x: cx, z: cz };
    for (let r = 1; r < 8; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          if (!isBlocked(cx + dx, cz + dz)) return { x: cx + dx, z: cz + dz };
        }
      }
    }
    return null;
  }

  function findPath(sx, sz, gx, gz) {
    if (!nav) return null;
    const s0 = cellOf(sx, sz), g0 = cellOf(gx, gz);
    const s = nearestOpen(s0.x, s0.z), g = nearestOpen(g0.x, g0.z);
    if (!s || !g) return null;
    const n = nav.nx * nav.nz;
    const open = [{ x: s.x, z: s.z, f: 0 }];
    const gScore = new Float32Array(n); gScore.fill(Infinity);
    const came = new Int32Array(n); came.fill(-1);
    const closed = new Uint8Array(n);
    const si = s.z * nav.nx + s.x, gi = g.z * nav.nx + g.x;
    gScore[si] = 0;
    const h = (x, z) => Math.hypot(x - g.x, z - g.z);
    let guard = 0;
    while (open.length && guard++ < 12000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      const ci = cur.z * nav.nx + cur.x;
      if (ci === gi) {
        const path = [];
        let k = ci;
        while (k !== -1) {
          const ix = k % nav.nx, iz = Math.floor(k / nav.nx);
          const p = cellPos(ix, iz); path.push(p);
          k = came[k];
        }
        path.reverse(); path.shift();
        return path;
      }
      if (closed[ci]) continue;
      closed[ci] = 1;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cur.x + dx, nz = cur.z + dz;
          if (isBlocked(nx, nz)) continue;
          if (dx && dz && (isBlocked(cur.x + dx, cur.z) || isBlocked(cur.x, cur.z + dz))) continue;
          const ni = nz * nav.nx + nx;
          const ng = gScore[ci] + (dx && dz ? 1.414 : 1);
          if (ng < gScore[ni]) {
            gScore[ni] = ng;
            came[ni] = ci;
            open.push({ x: nx, z: nz, f: ng + h(nx, nz) * 1.08 });
          }
        }
      }
    }
    return null;
  }

  /* ===== 制服配置（历史原型：日军 90 式钢盔 + 土黄色军服；我军德式钢盔 + 灰布军服） ===== */
  const JP_UNIFORM = {
    cloth: 0x8a7a4f, clothDark: 0x6e6040, helmet: 0x5d5b40, helmetStyle: 'japanese',
    skin: 0xc09a72, pack: 0x7d6f49, puttee: 0x8a7a4f,
    emissive: 0x241c08 // 夜间微光，保证百米外剪影可读
  };
  const CN_UNIFORM = {
    cloth: 0x5f665a, clothDark: 0x4a5147, helmet: 0x4b4f45, helmetStyle: 'german',
    skin: 0xb98e6d, pack: 0x565c4e, puttee: 0x6e7566,
    emissive: 0x0c0e09
  };

  /* 精细士兵模型：钢盔、军服、腰带弹药盒、背包、绑腿军靴、步枪 */
  function makeSoldier(u) {
    const g = new T.Group();
    const body = new T.Group(); g.add(body);
    // 躯干：收腰军服上衣 + 下摆
    box(.46, .56, .32, u.cloth, 0, 1.08, 0, body, { emissive: u.emissive });
    box(.48, .12, .34, u.clothDark, 0, .8, 0, body, { emissive: u.emissive });
    // 领口风纪扣与衣扣
    box(.2, .07, .05, u.clothDark, 0, 1.35, .16, body);
    box(.05, .05, .02, 0x2b2418, 0, 1.22, .17, body);
    box(.05, .05, .02, 0x2b2418, 0, 1.12, .17, body);
    // 腰带与双联弹药盒
    box(.48, .07, .35, 0x4a3b27, 0, .88, 0, body);
    box(.11, .13, .07, 0x8a6f3f, .15, .88, .18, body);
    box(.11, .13, .07, 0x8a6f3f, -.15, .88, .18, body);
    // 背包 + 捆扎带
    box(.34, .36, .17, u.pack, 0, 1.12, -.26, body);
    box(.36, .09, .19, u.clothDark, 0, 1.26, -.27, body);
    // 头部
    sphere(.2, u.skin, 0, 1.52, 0, body);
    // 钢盔
    if (u.helmetStyle === 'japanese') {
      // 90 式钢盔：半球盔体 + 宽盔檐 + 后垂护颈帘
      const dome = new T.Mesh(G.sphere, mat(u.helmet, { emissive: u.emissive }));
      dome.scale.set(.26, .2, .28); dome.position.set(0, 1.66, 0); body.add(dome);
      const brim = new T.Mesh(G.cyl, mat(u.helmet, { emissive: u.emissive }));
      brim.scale.set(.3, .03, .32); brim.position.set(0, 1.6, 0); body.add(brim);
      box(.4, .15, .05, u.helmet, 0, 1.53, -.22, body, { emissive: u.emissive });
      // 五角星徽
      box(.07, .07, .02, 0xb8a44a, 0, 1.7, .27, body, { emissive: 0x6a5a18 });
    } else {
      // 德式 M35：半球盔体 + 外翻盔檐
      const dome = new T.Mesh(G.sphere, mat(u.helmet, { emissive: u.emissive }));
      dome.scale.set(.25, .21, .27); dome.position.set(0, 1.65, 0); body.add(dome);
      const brim = new T.Mesh(G.cyl, mat(u.helmet, { emissive: u.emissive }));
      brim.scale.set(.28, .04, .3); brim.position.set(0, 1.59, 0); body.add(brim);
    }
    // 腿：绑腿 + 军靴
    const legL = new T.Group(); legL.position.set(0, .74, .14); body.add(legL);
    box(.18, .5, .2, u.puttee, 0, -.25, 0, legL, { emissive: u.emissive });
    box(.17, .18, .24, 0x241f18, 0, -.58, .02, legL);
    const legR = new T.Group(); legR.position.set(0, .74, -.14); body.add(legR);
    box(.18, .5, .2, u.puttee, 0, -.25, 0, legR, { emissive: u.emissive });
    box(.17, .18, .24, 0x241f18, 0, -.58, .02, legR);
    // 持枪：步枪沿模型正前方(+Z)平持，枪口指向敌人面向的方向
    const aim = new T.Group(); aim.position.set(.12, 1.26, 0); body.add(aim);
    box(.07, .06, .8, 0x2a261e, .18, 0, .32, aim);      // 护木
    box(.03, .03, .55, 0x1b1814, .18, .01, .55, aim);   // 枪管
    box(.1, .13, .24, 0x4a3b27, .18, -.03, -.08, aim);  // 枪托
    box(.05, .09, .06, 0x1b1814, .18, .05, .1, aim);    // 枪机
    box(.12, .06, .1, u.clothDark, .1, -.02, .18, aim); // 前握把护袖
    sphere(.07, u.skin, .18, -.04, .3, aim);            // 持枪手
    const muzzle = sphere(.08, 0xffd98a, .18, .01, .82, aim, { emissive: 0xffa33d });
    muzzle.visible = false;
    const hit = new T.Mesh(G.box, new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.scale.set(.62, 1.75, .62); hit.position.y = .88; g.add(hit);
    g.userData = { body, legL, legR, aim, muzzle, hitbox: hit };
    return g;
  }

  function reset() {
    if (!initialized) return;
    for (const e of enemies) if (e.group) root.remove(e.group);
    enemies = [];
    for (const p of pickups) if (p.mesh) root.remove(p.mesh);
    pickups = [];
    tracers.forEach(t => root.remove(t.line));
    tracers = [];
    state.hp = 100; state.ammo = 8; state.reserve = 48; state.reloading = false; state.reloadT = 0;
    state.kills = 0; state.recoil = 0; state.muzzleT = 0;
    state.wave = 1; state.waveDelay = 0; state.sinceHit = 99;
    player = { pos: new T.Vector3(START.x, 0, START.z), vel: new T.Vector3(), yaw: START_YAW, pitch: 0, onGround: true, crouch: false, moving: false, bob: 0, dead: false };
    mouse.yaw = START_YAW; mouse.pitch = 0;
    spawnWave(1);
    finished = false;
    updateHUD();
  }

  function spawnWave(n) {
    state.wave = n;
    if (n === 1) {
      // 第一波：日军从桥西端压上，沿桥面逼近
      spawnEnemy(-2.2, -48, 2.4); spawnEnemy(1.8, -42, 2.4);
      spawnEnemy(0, -30, 2.4); spawnEnemy(-1.5, -20, 2.4);
      showMessage('日军从桥西压上来了 —— 守住卢沟桥！');
    } else {
      // 第二波：大队增援自西岸营地涌出，速度更快、前后拉开（避免六人同时集火）
      spawnEnemy(-2.4, -58, 2.5); spawnEnemy(2.4, -54, 2.5);
      spawnEnemy(0, -50, 2.6); spawnEnemy(-1.2, -45, 2.5);
      spawnEnemy(1.5, -41, 2.6); spawnEnemy(-.4, -38, 2.5);
      showMessage('第二波 — 日军大队增援压上来了');
    }
    updateHUD();
  }

  function spawnEnemy(x, z, speed) {
    const g = makeSoldier(JP_UNIFORM);
    g.position.set(x, 0, z); root.add(g);
    // 红色识别带（历史上以识别布条区分夜战敌我），保证远距可读
    const marker = new T.Mesh(G.cone, new T.MeshBasicMaterial({ color: 0xc84b34 }));
    marker.scale.set(.11, .24, .11); marker.rotation.z = Math.PI; marker.position.set(0, 2.02, 0); g.add(marker);
    box(.5, .09, .38, 0x9e3026, 0, 1.25, 0, g, { emissive: 0x6d170f });
    const e = {
      group: g, pos: new T.Vector3(x, 0, z), hp: 100, alive: true,
      path: null, pathT: 0, fireCd: 1.2, meleeCd: 0, speed: speed || 1.55,
      walk: Math.random() * 6, box: new T.Box3(), muzzle: 0, marker
    };
    g.userData.enemy = e;
    enemies.push(e);
    return e;
  }

  function dropAmmo(x, z) {
    const g = new T.Group();
    box(.3, .2, .22, 0x9b8149, 0, .1, 0, g);
    box(.32, .05, .24, 0x2b2318, 0, .22, 0, g);
    g.position.set(clamp(x, BOUNDS.minX + .6, BOUNDS.maxX - .6), 0, clamp(z, BOUNDS.minZ + .6, BOUNDS.maxZ - .6));
    root.add(g);
    pickups.push({ mesh: g, x: g.position.x, z: g.position.z });
  }

  function flashDamage() {
    const el = $('fpsDamage');
    if (!el) return;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  function flashHit(kill) {
    const el = $('fpsCross');
    if (!el) return;
    el.classList.remove('hit', 'kill');
    void el.offsetWidth;
    el.classList.add('hit');
    if (kill) el.classList.add('kill');
  }

  function init() {
    if (initialized) return true;
    try {
      canvas = $('fpsCanvas');
      renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.outputEncoding = T.sRGBEncoding;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.02;
      scene = new T.Scene();
      camera = new T.PerspectiveCamera(76, 1, .05, 380);
      camera.rotation.order = 'YXZ';
      scene.add(camera);
      buildWeapon();
      buildWorld();
      reset();
      initialized = true;
      resize();
      return true;
    } catch (e) {
      window.__fpsInitError = (e && (e.stack || e.message)) || String(e);
      console.error('FPS3D init failed', e);
      showMessage('WebGL 初始化失败：' + (e && e.message ? e.message : '未知错误'));
      return false;
    }
  }

  function buildWeapon() {
    weapon = new T.Group();
    box(.09, .11, .5, 0x27231b, 0, 0, -.35, weapon);
    box(.12, .14, .35, 0x51371f, 0, -.03, .02, weapon);
    box(.045, .05, .42, 0x1b1814, 0, .02, -.78, weapon);
    sphere(.07, 0xb98e6d, .12, -.12, -.2, weapon);
    sphere(.065, 0xb98e6d, -.09, -.12, -.45, weapon);
    muzzleFlash = sphere(.09, 0xffd88a, 0, .02, -1.05, weapon, { emissive: 0xffa33d });
    muzzleFlash.visible = false;
    weapon.position.set(.3, -.33, -.42);
    weapon.rotation.y = -.06;
    camera.add(weapon);
    muzzleLight = new T.PointLight(0xffbb66, 0, 7, 2);
    scene.add(muzzleLight);
  }

  function resize() {
    if (!renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  function showMessage(text) {
    const el = $('fpsMessage');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function updateHUD() {
    $('fpsHp').textContent = Math.max(0, Math.round(state.hp));
    $('fpsAmmo').textContent = state.reloading ? '装填…' : state.ammo + ' / ' + state.reserve;
    $('fpsEnemies').textContent = enemies.filter(e => e.alive).length;
    const obj = document.querySelector('.fps-objective');
    if (obj) obj.textContent = '任务：守住卢沟桥 · 第 ' + state.wave + ' / 2 波';
  }

  function active() { return open && playing && !finished; }

  function openDemo() {
    window.__fpsOpenCalls = (window.__fpsOpenCalls || 0) + 1;
    if (open) return;
    if (!init()) return;
    open = true; playing = false; finished = false;
    $('fpsDemo').classList.remove('hidden');
    $('fpsStart').classList.remove('hidden');
    $('fpsStart').querySelector('h2').textContent = '卢沟桥 · 夜';
    $('fpsStart').querySelector('p').textContent = '1:2 还原卢沟桥 · 宛平城 · 永定河 · 360° 自由视角';
    $('fpsEnter').textContent = '点击进入';
    $('fpsBack').classList.remove('hidden');
    reset();
    last = 0;
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function closeDemo() {
    open = false; playing = false; finished = false;
    $('fpsDemo').classList.add('hidden');
    $('fpsDemo').classList.remove('playing');
    muzzleFlash.visible = false; muzzleLight.intensity = 0;
    releaseLock();
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  function requestLock() {
    if (!canvas.requestPointerLock) { fallback = true; return; }
    try {
      const req = canvas.requestPointerLock();
      if (req && req.catch) req.catch(() => { fallback = true; });
    } catch (e) { fallback = true; }
    setTimeout(() => { if (playing && !pointerLocked) fallback = true; }, 700);
  }
  function releaseLock() {
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    pointerLocked = false; fallback = false;
  }

  function startGame() {
    if (finished) reset();
    finished = false; playing = true;
    $('fpsStart').classList.add('hidden');
    $('fpsDemo').classList.add('playing');
    requestLock();
    showMessage('宁为战死鬼，不做亡国奴 —— 守住卢沟桥');
    last = 0;
  }
  function pauseGame() {
    if (!playing) return;
    playing = false;
    muzzleFlash.visible = false; muzzleLight.intensity = 0;
    releaseLock();
    $('fpsDemo').classList.remove('playing');
    $('fpsStart').classList.remove('hidden');
    $('fpsEnter').textContent = '继续战斗';
    $('fpsBack').classList.remove('hidden');
  }
  function finish(win) {
    if (finished) return;
    finished = true; playing = false;
    releaseLock();
    $('fpsDemo').classList.remove('playing');
    if (win) {
      showMessage('桥头守住了');
      $('fpsStart').querySelector('h2').textContent = '桥头守住了';
      $('fpsStart').querySelector('p').textContent = '3D 竖切完成 · 所有敌人已被击退';
    } else {
      showMessage('你倒下了');
      $('fpsStart').querySelector('h2').textContent = '战斗失败';
      $('fpsStart').querySelector('p').textContent = '按“再打一次”重新开始';
    }
    $('fpsStart').classList.remove('hidden');
    $('fpsEnter').textContent = '再打一次';
  }

  function collidesCapsule(x, z, y, height) {
    if (x < BOUNDS.minX + PLAYER_R || x > BOUNDS.maxX - PLAYER_R) return true;
    if (z < BOUNDS.minZ + PLAYER_R || z > BOUNDS.maxZ - PLAYER_R) return true;
    for (const b of colliders) {
      if (x + PLAYER_R > b.min.x && x - PLAYER_R < b.max.x && z + PLAYER_R > b.min.z && z - PLAYER_R < b.max.z && y + height > b.min.y && y + .12 < b.max.y) return true;
    }
    return false;
  }

  function updatePlayer(dt) {
    const p = player;
    if (!p || p.dead) return;
    const fwd = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
    const strafe = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
    if (keys['KeyQ']) { p.yaw += 2.2 * dt; mouse.yaw = p.yaw; }
    if (keys['KeyE']) { p.yaw -= 2.2 * dt; mouse.yaw = p.yaw; }
    if (p.yaw > Math.PI) { p.yaw -= Math.PI * 2; mouse.yaw = p.yaw; }
    else if (p.yaw < -Math.PI) { p.yaw += Math.PI * 2; mouse.yaw = p.yaw; }
    const sprint = !!keys['ShiftLeft'];
    p.crouch = !!keys['KeyC'];
    const height = p.crouch ? 1.15 : 1.75;
    const speed = p.crouch ? 1.45 : sprint ? 5.0 : 3.25;
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    let dx = (sy * fwd - cy * strafe) * speed * dt;
    let dz = (cy * fwd + sy * strafe) * speed * dt;
    p.moving = Math.abs(dx) + Math.abs(dz) > .0001;
    if (p.moving) p.bob += dt * (sprint ? 12 : 8);
    // axis-separated capsule collision
    if (!collidesCapsule(p.pos.x + dx, p.pos.z, p.pos.y, height)) p.pos.x += dx;
    if (!collidesCapsule(p.pos.x, p.pos.z + dz, p.pos.y, height)) p.pos.z += dz;
    if (keys['Space'] && p.onGround) { p.vel.y = 5.2; p.onGround = false; }
    p.vel.y -= 14 * dt;
    p.pos.y += p.vel.y * dt;
    if (p.pos.y <= 0) { p.pos.y = 0; p.vel.y = 0; p.onGround = true; }
    p.pos.x = clamp(p.pos.x, BOUNDS.minX, BOUNDS.maxX);
    p.pos.z = clamp(p.pos.z, BOUNDS.minZ, BOUNDS.maxZ);

    const eye = p.crouch ? CROUCH_EYE : EYE;
    camera.position.set(p.pos.x, p.pos.y + eye + (p.moving ? Math.sin(p.bob) * .025 : 0), p.pos.z);
    const cp = Math.cos(p.pitch);
    camera.lookAt(
      camera.position.x + Math.sin(p.yaw) * cp,
      camera.position.y + Math.sin(p.pitch),
      camera.position.z + Math.cos(p.yaw) * cp
    );
    state.recoil = Math.max(0, state.recoil - dt * 3);
    camera.rotation.x += state.recoil * .05;
    weapon.position.y = -.33 + (p.moving ? Math.sin(p.bob * 2) * .012 : 0);
    weapon.rotation.x = state.recoil * .25;
    if (state.reloading) {
      state.reloadT -= dt;
      weapon.rotation.z = .35;
      if (state.reloadT <= 0) {
        const take = Math.min(8 - state.ammo, state.reserve);
        state.ammo += take; state.reserve -= take; state.reloading = false; weapon.rotation.z = 0; updateHUD();
      }
    }
  }

  function rayBox(ray, b, out) {
    const hit = ray.intersectBox(b, out);
    if (!hit) return null;
    return hit.distanceTo(ray.origin);
  }

  function fire() {
    if (!playing || finished || state.reloading) return;
    if (state.ammo <= 0) { showMessage('弹仓空了，按 R 装填'); return; }
    state.ammo--; state.recoil = Math.min(1, state.recoil + .55); state.muzzleT = .07;
    updateHUD();
    const dir = new T.Vector3();
    camera.getWorldDirection(dir);
    const ray = new T.Ray(camera.position.clone(), dir);
    let best = 90, hitEnemy = null, hitPoint = null;
    const v = new T.Vector3();
    for (const e of enemies) {
      if (!e.alive) continue;
      e.box.setFromCenterAndSize(new T.Vector3(e.pos.x, .9, e.pos.z), new T.Vector3(.62, 1.75, .62));
      const d = rayBox(ray, e.box, v);
      if (d !== null && d < best) { best = d; hitEnemy = e; hitPoint = v.clone(); }
    }
    for (const b of colliders) {
      const d = rayBox(ray, b, v);
      if (d !== null && d < best) { best = d; hitEnemy = null; hitPoint = v.clone(); }
    }
    if (!hitPoint) hitPoint = camera.position.clone().add(dir.clone().multiplyScalar(90));
    addTracer(camera.position.clone(), hitPoint, 0xffdf9d);
    muzzleFlash.visible = true; muzzleLight.position.copy(camera.position); muzzleLight.intensity = 1.8;
    if (hitEnemy) {
      // 命中头部（y > 1.42）一枪击毙
      const head = hitPoint.y > 1.42;
      hitEnemy.hp -= head ? 100 : 55;
      if (hitEnemy.hp <= 0) {
        hitEnemy.alive = false; state.kills++;
        hitEnemy.group.rotation.z = -Math.PI / 2;
        hitEnemy.group.position.y = .1;
        hitEnemy.box.makeEmpty();
        flashHit(true);
        showMessage(head ? '爆头击毙' : '击毙一名敌人');
        // 60% 概率掉落弹药袋
        if (Math.random() < .6) dropAmmo(hitEnemy.pos.x, hitEnemy.pos.z);
        updateHUD();
        checkWaveEnd();
      } else {
        flashHit(false);
        if (head) showMessage('爆头！');
      }
    }
  }

  function checkWaveEnd() {
    if (!enemies.every(e => !e.alive)) return;
    if (state.wave === 1) {
      state.waveDelay = 2.4;
      showMessage('第一波已击退 — 稳住，日军增援正在逼近');
    } else {
      setTimeout(() => finish(true), 700);
    }
  }

  function reload() {
    if (state.reloading || state.ammo >= 8 || state.reserve <= 0) return;
    state.reloading = true; state.reloadT = 1.15;
    showMessage('装填中…'); updateHUD();
  }

  function addTracer(a, b, color) {
    const geo = new T.BufferGeometry().setFromPoints([a, b]);
    const m = new T.LineBasicMaterial({ color, transparent: true, opacity: .9 });
    const line = new T.Line(geo, m); root.add(line);
    tracers.push({ line, life: .06 });
  }

  function updateEnemies(dt) {
    const p = player;
    for (const e of enemies) {
      if (!e.alive) continue;
      e.muzzle = Math.max(0, e.muzzle - dt);
      const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      e.group.rotation.y = Math.atan2(dx, dz);
      e.pathT -= dt;
      if (e.pathT <= 0) { e.path = findPath(e.pos.x, e.pos.z, p.pos.x, p.pos.z); e.pathT = .65; }
      const los = lineOfSight(e.pos.x, e.pos.z, p.pos.x, p.pos.z);
      if (los && dist < 1.7) {
        // 近身白刃：敌人扑上来挥刀，不再原地发呆
        e.meleeCd -= dt;
        if (e.meleeCd <= 0) {
          e.meleeCd = 1.2;
          e.lunge = .18;
          playerHit(9 + Math.random() * 5);
        }
        e.walk += dt * 3;
      } else if (los && dist < 26) {
        // 交火中边射击边缓步压上，避免在 26 米外静止对峙
        e.pos.x += dx / dist * .6 * dt;
        e.pos.z += dz / dist * .6 * dt;
        e.fireCd -= dt;
        if (e.fireCd <= 0) {
          e.fireCd = 1.4 + Math.random() * .7;
          e.muzzle = .07;
          // 75% 命中率，留反应余地
          if (Math.random() < .75) playerHit(3 + Math.random() * 4);
          addTracer(new T.Vector3(e.pos.x, 1.25, e.pos.z), new T.Vector3(p.pos.x, 1.2, p.pos.z), 0xff7050);
        }
        e.walk += dt * 1.2;
      } else if (e.path && e.path.length) {
        const wp = e.path[0];
        const dx2 = wp.x - e.pos.x, dz2 = wp.z - e.pos.z;
        const d2 = Math.hypot(dx2, dz2);
        if (d2 < .22) e.path.shift();
        else {
          const sp = e.speed * dt;
          e.pos.x += dx2 / d2 * sp;
          e.pos.z += dz2 / d2 * sp;
          e.walk += dt * 7;
        }
      } else if (dist > 1.4) {
        const sp = e.speed * .65 * dt;
        e.pos.x += dx / dist * sp; e.pos.z += dz / dist * sp;
        e.walk += dt * 5;
      }
      // local separation
      for (const o of enemies) {
        if (o === e || !o.alive) continue;
        const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z;
        const d = Math.hypot(ox, oz);
        if (d > .01 && d < .65) { e.pos.x += ox / d * (.65 - d) * .5; e.pos.z += oz / d * (.65 - d) * .5; }
      }
      e.pos.x = clamp(e.pos.x, BOUNDS.minX + .4, BOUNDS.maxX - .4);
      e.pos.z = clamp(e.pos.z, BOUNDS.minZ + .4, BOUNDS.maxZ - .4);
      e.lunge = Math.max(0, (e.lunge || 0) - dt);
      e.group.position.set(e.pos.x, e.lunge > 0 ? .12 : 0, e.pos.z);
      const body = e.group.userData.body;
      const swing = Math.sin(e.walk) * .35;
      e.group.userData.legL.rotation.z = swing;
      e.group.userData.legR.rotation.z = -swing;
      e.group.userData.muzzle.visible = e.muzzle > 0;
      e.group.userData.aim.rotation.x = 0;
      if (e.hp <= 0) e.group.rotation.z = -Math.PI / 2;
    }
  }

  function lineOfSight(x1, z1, x2, z2) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < .01) return true;
    const ray = new T.Ray(new T.Vector3(x1, 1.2, z1), new T.Vector3((x2 - x1) / len, 0, (z2 - z1) / len));
    const v = new T.Vector3();
    for (const b of colliders) {
      const hit = ray.intersectBox(b, v);
      if (hit && hit.distanceTo(ray.origin) < len - .3) return false;
    }
    return true;
  }

  function playerHit(dmg) {
    if (!player || player.dead) return;
    state.hp -= dmg;
    state.recoil = .5;
    state.sinceHit = 0;
    flashDamage();
    updateHUD();
    if (state.hp <= 0) { state.hp = 0; player.dead = true; finish(false); }
  }

  function update(dt) {
    if (!player) return;
    updatePlayer(dt);
    updateEnemies(dt);
    // 枪口闪光：改为帧计时，暂停时不会卡亮
    if (state.muzzleT > 0) {
      state.muzzleT -= dt;
      if (state.muzzleT <= 0) { muzzleFlash.visible = false; muzzleLight.intensity = 0; }
    }
    // 脱战 4 秒后回血（9→11/秒）
    state.sinceHit += dt;
    if (state.sinceHit > 4 && !player.dead && state.hp > 0 && state.hp < 100) {
      const nh = Math.min(100, state.hp + 11 * dt);
      if (Math.floor(nh) !== Math.floor(state.hp)) updateHUD();
      state.hp = nh;
    }
    // 第二波延迟登场
    if (state.waveDelay > 0) {
      state.waveDelay -= dt;
      if (state.waveDelay <= 0) { state.waveDelay = 0; spawnWave(2); }
    }
    // 弹药袋拾取
    for (let i = pickups.length - 1; i >= 0; i--) {
      const pk = pickups[i];
      pk.mesh.rotation.y += dt * 2.2;
      const d = Math.hypot(pk.x - player.pos.x, pk.z - player.pos.z);
      if (d < .85) {
        state.reserve += 8;
        showMessage('拾取弹药 +8');
        root.remove(pk.mesh);
        pickups.splice(i, 1);
        updateHUD();
      }
    }
    for (let i = tracers.length - 1; i >= 0; i--) {
      tracers[i].life -= dt;
      if (tracers[i].life <= 0) {
        root.remove(tracers[i].line);
        tracers[i].line.geometry.dispose(); tracers[i].line.material.dispose();
        tracers.splice(i, 1);
      } else tracers[i].line.material.opacity = .9 * (tracers[i].life / .06);
    }
    if (rain) {
      const a = rain.geometry.attributes.position.array;
      for (let i = 0; i < a.length; i += 3) { a[i + 1] -= dt * 11; if (a[i + 1] < 0) a[i + 1] = 16; }
      rain.geometry.attributes.position.needsUpdate = true;
      rain.position.x = player.pos.x; rain.position.z = player.pos.z;
    }
    muzzleLight.position.copy(camera.position);
  }

  function loop(t) {
    raf = 0;
    if (!open) return;
    const now = t || performance.now();
    const dt = last ? Math.min((now - last) / 1000, .05) : .016;
    last = now;
    if (playing && !finished) update(dt);
    if (renderer) renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }

  function bind() {
    canvas = $('fpsCanvas');
    $('wmFpsDemo').addEventListener('click', openDemo);
    document.addEventListener('click', e => {
      const b = e.target && e.target.closest ? e.target.closest('#wmFpsDemo') : null;
      if (b) openDemo();
    });
    $('fpsEnter').addEventListener('click', startGame);
    $('fpsBack').addEventListener('click', closeDemo);
    $('fpsExit').addEventListener('click', closeDemo);
    window.addEventListener('resize', resize);

    document.addEventListener('pointerlockchange', () => {
      pointerLocked = document.pointerLockElement === canvas;
      if (pointerLocked) fallback = false;
      if (open && playing && !pointerLocked && !fallback) {
        // Browser released the lock; let the player click back in.
      }
    });
    document.addEventListener('pointerlockerror', () => { fallback = true; });
    document.addEventListener('mousemove', e => {
      if (!open || !playing || finished) return;
      if (pointerLocked) {
        // 指针锁定：自由 360° 水平旋转 + 近 ±90° 俯仰
        mouse.yaw -= (e.movementX || 0) * .0022;
        mouse.pitch = clamp(mouse.pitch - (e.movementY || 0) * .0022, -1.55, 1.55);
      } else if (fallback) {
        // 回退模式（锁定失败）：按住鼠标拖拽转视角
        if (!dragLook.on) return;
        mouse.yaw -= (e.clientX - dragLook.x) * .005;
        mouse.pitch = clamp(mouse.pitch - (e.clientY - dragLook.y) * .005, -1.55, 1.55);
        dragLook.x = e.clientX; dragLook.y = e.clientY;
      } else return;
      // 归一化 yaw 到 [-PI, PI]，防止长时间旋转浮点漂移
      if (mouse.yaw > Math.PI) mouse.yaw -= Math.PI * 2;
      else if (mouse.yaw < -Math.PI) mouse.yaw += Math.PI * 2;
      if (player) { player.yaw = mouse.yaw; player.pitch = mouse.pitch; }
    });
    canvas.addEventListener('mousedown', e => { dragLook.x = e.clientX; dragLook.y = e.clientY; dragLook.on = true; });
    window.addEventListener('mouseup', () => { dragLook.on = false; });
    window.addEventListener('keydown', e => {
      if (!open) return;
      if (e.code === 'Escape') { if (playing) { pauseGame(); e.preventDefault(); } else if (finished) closeDemo(); return; }
      if (!playing) return;
      keys[e.code] = true;
      if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyR', 'KeyQ', 'KeyE', 'ShiftLeft'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyR') reload();
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });
    window.addEventListener('blur', () => { keys = Object.create(null); });
    canvas.addEventListener('click', () => {
      if (!open || !playing || finished) return;
      if (!pointerLocked) requestLock();
      fire();
    });
    $('fpsDemo').addEventListener('click', e => {
      if (e.target === $('fpsDemo') && open && playing && !pointerLocked) requestLock();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  window.FPS3D = {
    open: openDemo,
    close: closeDemo,
    get playing() { return playing; },
    debug: () => ({
      open, playing, finished, pointerLocked, fallback,
      state: {
        hp: Math.round(state.hp), ammo: state.ammo, reserve: state.reserve,
        reloading: state.reloading, recoil: +state.recoil.toFixed(3),
        wave: state.wave, waveDelay: +state.waveDelay.toFixed(2), kills: state.kills,
        muzzleT: +state.muzzleT.toFixed(3)
      },
      player: player ? { x: +player.pos.x.toFixed(2), y: +player.pos.y.toFixed(2), z: +player.pos.z.toFixed(2), yaw: +player.yaw.toFixed(2), pitch: +player.pitch.toFixed(3) } : null,
      cam: (() => {
        if (!camera) return null;
        const d = new T.Vector3();
        camera.getWorldDirection(d);
        return { x: +camera.position.x.toFixed(3), y: +camera.position.y.toFixed(3), z: +camera.position.z.toFixed(3), dx: +d.x.toFixed(4), dy: +d.y.toFixed(4), dz: +d.z.toFixed(4) };
      })(),
      enemies: enemies.map(e => ({ x: +e.pos.x.toFixed(2), z: +e.pos.z.toFixed(2), hp: e.hp, alive: e.alive, path: e.path ? e.path.length : 0 })),
      // 测试钩子：验证第一个活敌的枪口是否指向玩家（纯数据返回，可序列化）
      rifleCheck: (() => {
        const e = enemies.find(x => x.alive);
        if (!e || !player) return null;
        const wp = new T.Vector3();
        e.group.userData.muzzle.getWorldPosition(wp);
        const toPlayer = new T.Vector3(player.pos.x - e.pos.x, 0, player.pos.z - e.pos.z).normalize();
        const toMuzzle = new T.Vector3(wp.x - e.pos.x, 0, wp.z - e.pos.z);
        const reach = toMuzzle.length();
        toMuzzle.normalize();
        return { dot: +toMuzzle.dot(toPlayer).toFixed(3), reach: +reach.toFixed(2), dist: +Math.hypot(player.pos.x - e.pos.x, player.pos.z - e.pos.z).toFixed(1) };
      })()
    })
  };
})();
