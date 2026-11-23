/* =========================================================
   卢沟桥 · 1937 — 3D 渲染层 (Three.js r128, 本地打包)
   2.5D 横版：正交相机 1:1 映射游戏逻辑坐标，全部人物与场景为真实 3D 实体
   坐标映射：X3 = worldX, Y3 = -gameY, Z3 = 深度(0=玩法平面)
   ========================================================= */
(function () {
  'use strict';
  var T = window.THREE;
  if (!T) { window.R3D = { ok: false }; return; }

  var GROUND = 650, VH = 810;
  var VW = 1440, cw = 1440, ch = 810;
  var ok = false;

  var renderer, scene, camera, glCanvas, sun, sunTarget;
  var levelRoot, bgRoot, dynRoot, fxRoot, overlay;
  var matCache = {}, glowTex = null, lastLevel = undefined, lastKind = '';

  var MAT = {}, GEO = {};
  var figCache = { player: new Map(), enemy: new Map(), ally: new Map(), civ: new Map() };
  var bulletPool = [], flashPool = [], slashPool = [], boomPool = [];
  var rainGeo, rainLine, starPoints, fireGroups = [], lights = [];
  var flagObj = null, supplyObj = null, exitObj = null, pickPool = [];
  var mortarPool = [];

  /* ---------- 基础工具 ---------- */
  function rgba(hex, a) {
    var c = new T.Color(hex);
    return 'rgba(' + Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255) + ',' + a + ')';
  }
  function material(hex, opts) {
    opts = opts || {};
    var key = hex + '|' + (opts.emissive || '') + '|' + (opts.opacity || 1) + '|' + (opts.shiny ? 1 : 0);
    if (matCache[key]) return matCache[key];
    var m = new T.MeshLambertMaterial({
      color: hex,
      emissive: opts.emissive || 0x000000,
      emissiveIntensity: opts.emissiveIntensity || 1,
      transparent: (opts.opacity != null && opts.opacity < 1),
      opacity: opts.opacity != null ? opts.opacity : 1,
      side: opts.double ? T.DoubleSide : T.FrontSide
    });
    matCache[key] = m;
    return m;
  }
  function ownMat(hex, opts) {
    opts = opts || {};
    return new T.MeshLambertMaterial({
      color: hex, emissive: opts.emissive || 0x000000,
      emissiveIntensity: opts.emissiveIntensity || 1,
      transparent: (opts.opacity != null && opts.opacity < 1),
      opacity: opts.opacity != null ? opts.opacity : 1,
      side: opts.double ? T.DoubleSide : T.FrontSide
    });
  }
  function mesh(geo, mat, x, y, z, parent) {
    var m = new T.Mesh(geo, mat);
    if (x != null) m.position.set(x, y, z || 0);
    m.castShadow = true; m.receiveShadow = false;
    (parent || scene).add(m);
    return m;
  }
  function box(w, h, d) { var k = 'b' + w + '_' + h + '_' + d; return GEO[k] || (GEO[k] = new T.BoxGeometry(w, h, d)); }
  function cyl(rt, rb, h, seg) { seg = seg || 10; var k = 'c' + rt + '_' + rb + '_' + h + '_' + seg; return GEO[k] || (GEO[k] = new T.CylinderGeometry(rt, rb, h, seg)); }
  function sph(r, w, h) { w = w || 12; h = h || 9; var k = 's' + r + '_' + w + '_' + h; return GEO[k] || (GEO[k] = new T.SphereGeometry(r, w, h)); }
  function ico(r, d) { var k = 'i' + r + '_' + d; return GEO[k] || (GEO[k] = new T.IcosahedronGeometry(r, d || 0)); }
  function plane(w, h) { var k = 'p' + w + '_' + h; return GEO[k] || (GEO[k] = new T.PlaneGeometry(w, h)); }

  function makeGlowTexture() {
    var c = document.createElement('canvas'); c.width = 128; c.height = 128;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(64, 64, 2, 64, 64, 62);
    grd.addColorStop(0, 'rgba(255,244,205,1)');
    grd.addColorStop(0.18, 'rgba(255,193,104,.92)');
    grd.addColorStop(0.48, 'rgba(238,96,40,.42)');
    grd.addColorStop(1, 'rgba(160,36,8,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    var t = new T.CanvasTexture(c); t.needsUpdate = true; return t;
  }
  function makeSkyTexture(type) {
    var c = document.createElement('canvas'); c.width = 16; c.height = 256;
    var g = c.getContext('2d');
    var grd = g.createLinearGradient(0, 0, 0, 256);
    if (type === 'earth' || type === 'mountain') {
      grd.addColorStop(0, '#171513'); grd.addColorStop(.38, '#33271f');
      grd.addColorStop(.7, '#6d4a32'); grd.addColorStop(1, '#8a603e');
    } else if (type === 'rail' || type === 'town') {
      grd.addColorStop(0, '#030609'); grd.addColorStop(.45, '#0a1118');
      grd.addColorStop(.78, '#331b16'); grd.addColorStop(1, '#6b3521');
    } else {
      grd.addColorStop(0, '#03070d'); grd.addColorStop(.42, '#08131c');
      grd.addColorStop(.76, '#30201d'); grd.addColorStop(1, '#6d3b27');
    }
    g.fillStyle = grd; g.fillRect(0, 0, 16, 256);
    var t = new T.CanvasTexture(c); t.needsUpdate = true; return t;
  }
  function makeGroundTexture() {
    var c = document.createElement('canvas'); c.width = 128; c.height = 128;
    var g = c.getContext('2d');
    g.fillStyle = '#3a3327'; g.fillRect(0, 0, 128, 128);
    for (var i = 0; i < 900; i++) {
      var v = Math.random();
      g.fillStyle = v > .5 ? 'rgba(120,104,72,' + (Math.random() * .18) + ')' : 'rgba(14,12,9,' + (Math.random() * .3) + ')';
      g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 3, 1 + Math.random() * 2);
    }
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(40, 2); t.needsUpdate = true;
    return t;
  }

  /* ---------- 初始化 ---------- */
  function init() {
    if (ok) return;
    var stage = document.getElementById('stage');
    var src = document.getElementById('gameCanvas');
    if (!stage || !src) return;
    try {
      glCanvas = document.createElement('canvas');
      glCanvas.id = 'glCanvas';
      glCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
      stage.insertBefore(glCanvas, src.nextSibling);

      renderer = new T.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.setClearColor(0x05070a, 1);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
      renderer.outputEncoding = T.sRGBEncoding;

      scene = new T.Scene();
      scene.fog = new T.FogExp2(0x0a0c0e, 0.00042);

      camera = new T.OrthographicCamera(-VW / 2, VW / 2, VH / 2, -VH / 2, 1, 5000);
      camera.position.set(VW / 2, -VH / 2, 1600);
      camera.lookAt(VW / 2, -VH / 2, 0);
      scene.add(camera);

      scene.add(new T.AmbientLight(0x7d8280, 0.5));
      var hemi = new T.HemisphereLight(0x546274, 0x241b14, 0.42);
      scene.add(hemi);

      sun = new T.DirectionalLight(0xffe9cc, 1.25);
      sun.position.set(-380, 520, 720);
      sun.castShadow = true;
      sun.shadow.mapSize.width = 1024; sun.shadow.mapSize.height = 1024;
      var sc = sun.shadow.camera;
      sc.left = -VW / 2 - 120; sc.right = VW / 2 + 120;
      sc.top = VH / 2 + 120; sc.bottom = -VH / 2 - 120;
      sc.near = 100; sc.far = 2600;
      sun.shadow.bias = -0.0007;
      sunTarget = new T.Object3D();
      scene.add(sun); scene.add(sunTarget); sun.target = sunTarget;

      levelRoot = new T.Group();
      bgRoot = new T.Group();
      dynRoot = new T.Group();
      fxRoot = new T.Group();
      scene.add(bgRoot); scene.add(levelRoot); scene.add(dynRoot); scene.add(fxRoot);

      // 全屏泛光叠层（挂在相机上）
      var om = new T.MeshBasicMaterial({ color: 0xffdcaa, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
      overlay = new T.Mesh(plane(VH, VH), om);
      overlay.position.set(0, 0, -60);
      overlay.scale.set(VW / VH, 1, 1);
      overlay.renderOrder = 9999;
      camera.add(overlay);

      glowTex = makeGlowTexture();
      GEO.ground = new T.BoxGeometry(1, 1, 1);
      GEO.groundTex = makeGroundTexture();

      buildRain(); buildStars(); buildPools();
      ok = true;
      window.__R3D = { scene: scene, camera: camera, renderer: renderer, R: api };
    } catch (e) {
      ok = false;
      console.error('[R3D] init failed', e);
    }
  }

  function setView(v) {
    if (!v) return;
    VW = v.vw || VW;
    cw = v.cw || cw; ch = v.ch || ch;
    if (!ok) return;
    renderer.setPixelRatio(1);
    renderer.setSize(cw, ch, false);
    // 逻辑区域按 2D 版相同的缩放与居中，做像素级对齐（含信箱留边）
    var vx = (v.viewOffX || 0) * (v.dpr || 1);
    var vwpx = VW * (v.viewScale || 1) * (v.dpr || 1);
    var vhpx = VH * (v.viewScale || 1) * (v.dpr || 1);
    var vy = ch - ((v.viewOffY || 0) * (v.dpr || 1) + vhpx);
    renderer.setScissorTest(true);
    renderer.setViewport(vx, vy, vwpx, vhpx);
    renderer.setScissor(vx, vy, vwpx, vhpx);
    camera.left = -VW / 2; camera.right = VW / 2;
    camera.top = VH / 2; camera.bottom = -VH / 2;
    camera.updateProjectionMatrix();
    var sc = sun.shadow.camera;
    sc.left = -VW / 2 - 120; sc.right = VW / 2 + 120;
    sc.top = VH / 2 + 120; sc.bottom = -VH / 2 - 120;
    sc.updateProjectionMatrix();
    overlay.scale.set(VW / VH, 1, 1);
  }

  /* ---------- 雨 / 星 / 对象池 ---------- */
  function buildRain() {
    var n = 150, pos = new Float32Array(n * 6);
    rainGeo = new T.BufferGeometry();
    rainGeo.setAttribute('position', new T.BufferAttribute(pos, 3));
    var m = new T.LineBasicMaterial({ color: 0x9fb0bd, transparent: true, opacity: 0.34 });
    rainLine = new T.LineSegments(rainGeo, m);
    rainLine.frustumCulled = false;
    fxRoot.add(rainLine);
    rainLine.userData.n = n;
  }
  function buildStars() {
    var n = 220, pos = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      pos[i * 3] = Math.random() * 3000;
      pos[i * 3 + 1] = -Math.random() * 430;
      pos[i * 3 + 2] = -820;
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    var m = new T.PointsMaterial({ color: 0xd7e2ea, size: 2.2, transparent: true, opacity: .75, sizeAttenuation: false });
    starPoints = new T.Points(g, m);
    starPoints.frustumCulled = false;
    bgRoot.add(starPoints);
  }
  function buildPools() {
    for (var i = 0; i < 90; i++) {
      var g = new T.Group();
      var core = new T.Mesh(box(1, 1, 1), ownMat(0xffe0a0, { emissive: 0xffb45a, emissiveIntensity: 1.4 }));
      var halo = new T.Mesh(plane(1, 1), new T.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: .5, depthWrite: false, blending: T.AdditiveBlending }));
      halo.scale.set(22, 22, 1); halo.position.z = 1;
      g.add(core); g.add(halo); g.visible = false;
      g.userData = { core: core, halo: halo };
      fxRoot.add(g); bulletPool.push(g);
    }
    for (var i = 0; i < 40; i++) {
      var sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xffdca0, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
      sp.visible = false; fxRoot.add(sp); flashPool.push(sp);
    }
    for (var i = 0; i < 24; i++) {
      var arc = new T.Mesh(new T.TorusGeometry(60, 2.4, 5, 22, 1.5), new T.MeshBasicMaterial({ color: 0xf4ddb0, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
      arc.visible = false; fxRoot.add(arc); slashPool.push(arc);
    }
    for (var i = 0; i < 16; i++) {
      var s = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xffb060, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
      s.visible = false; fxRoot.add(s); boomPool.push(s);
    }
    // 粒子：实例化
    P.sparks = new T.InstancedMesh(box(1, 1, 1), new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .95, depthWrite: false, blending: T.AdditiveBlending }), 460);
    P.smokes = new T.InstancedMesh(sph(1, 8, 6), new T.MeshBasicMaterial({ color: 0x888078, transparent: true, opacity: .26, depthWrite: false }), 320);
    P.sparks.frustumCulled = false; P.smokes.frustumCulled = false;
    P.sparks.count = 0; P.smokes.count = 0;
    fxRoot.add(P.sparks); fxRoot.add(P.smokes);
    P.dummy = new T.Object3D();
  }
  var P = { sparks: null, smokes: null, dummy: null };

  /* ---------- 人物 3D 模型 ---------- */
  function buildFigure(kind, def) {
    var g = new T.Group();
    var body = new T.Group(); g.add(body);
    var uniform = def.uniform || 0x4d564b;
    var skin = def.skin || 0xb58a69;
    var parts = {};

    // 腿（枢轴在髋部，绕 Z 摆动）
    parts.legL = new T.Group(); parts.legR = new T.Group();
    parts.legL.position.set(-5, 34, 0); parts.legR.position.set(5, 34, 0);
    var legGeo = cyl(4.2, 3.4, 34, 8);
    var legMat = ownMat(def.leg || 0x363b32);
    var l1 = new T.Mesh(legGeo, legMat); l1.position.y = -17; l1.castShadow = true;
    var l2 = new T.Mesh(legGeo, legMat); l2.position.y = -17; l2.castShadow = true;
    var bootMat = ownMat(0x1e1e19);
    var b1 = new T.Mesh(box(11, 6, 13), bootMat); b1.position.set(0, -32, 2);
    var b2 = new T.Mesh(box(11, 6, 13), bootMat); b2.position.set(0, -32, 2);
    parts.legL.add(l1, b1); parts.legR.add(l2, b2);
    body.add(parts.legL, parts.legR);

    // 躯干（军大衣：上窄下略宽）
    var torso = new T.Mesh(new T.CylinderGeometry(12.5, 15, 34, 8), ownMat(uniform));
    torso.position.y = 51; torso.castShadow = true; body.add(torso);
    parts.torso = torso;
    // 腰带
    var belt = new T.Mesh(box(27, 5, 16), ownMat(0x29251b)); belt.position.y = 36; body.add(belt);
    var buckle = new T.Mesh(box(5, 3, 1.4), ownMat(0x9a7d45, { emissive: 0x3a2e12 })); buckle.position.set(0, 36, 8.4); body.add(buckle);
    // 领口
    var collar = new T.Mesh(new T.CylinderGeometry(7.5, 10, 6, 8), ownMat(0x5b6558)); collar.position.y = 68; body.add(collar);
    // 头
    var head = new T.Mesh(sph(8.4, 14, 11), ownMat(skin)); head.position.y = 76; head.castShadow = true; body.add(head);
    parts.head = head;
    // 帽子
    var cap;
    if (def.helmet) {
      cap = new T.Mesh(new T.SphereGeometry(10.5, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2), ownMat(0x383c31));
      cap.position.y = 79; body.add(cap);
      var rim = new T.Mesh(new T.CylinderGeometry(11.6, 11.6, 2.6, 16), ownMat(0x2a2d25)); rim.position.y = 78; body.add(rim);
    } else {
      cap = new T.Mesh(new T.CylinderGeometry(9, 9.5, 9, 12), ownMat(0x3d463d));
      cap.position.y = 83; body.add(cap);
      var visor = new T.Mesh(new T.CylinderGeometry(10.5, 10.5, 2, 14, 1, false, 0, Math.PI), ownMat(0x2f372f));
      visor.position.set(0, 80, 2.5); visor.rotation.x = Math.PI / 2; body.add(visor);
    }
    // 背包
    var pack = new T.Mesh(box(9, 16, 8), ownMat(0x393a2d)); pack.position.set(-11, 54, -6); body.add(pack);
    // 手臂（右臂持枪，枢轴在肩）
    parts.armR = new T.Group(); parts.armR.position.set(7, 62, 0); body.add(parts.armR);
    var arm = new T.Mesh(box(6, 17, 6), ownMat(uniform)); arm.position.set(4, -6, 5); parts.armR.add(arm);
    parts.armL = new T.Group(); parts.armL.position.set(-7, 62, 0); body.add(parts.armL);
    var arm2 = new T.Mesh(box(6, 16, 6), ownMat(uniform)); arm2.position.set(2, -6, 2); parts.armL.add(arm2);
    // 步枪（沿 +X 指向）
    var gun = new T.Group(); gun.position.set(7, 58, 0); body.add(gun);
    parts.gun = gun;
    var stock = new T.Mesh(box(20, 3.2, 4), ownMat(0x3b2414)); stock.position.set(-8, 0, 0); gun.add(stock);
    var recv = new T.Mesh(box(14, 5, 4.6), ownMat(0x1a1c1b)); recv.position.set(2, 0, 0); gun.add(recv);
    var barrel = new T.Mesh(cyl(1.5, 1.5, 42, 8), ownMat(0x2e3230)); barrel.rotation.z = Math.PI / 2; barrel.position.set(30, 0, 0); gun.add(barrel);
    var sight = new T.Mesh(box(2, 4, 2), ownMat(0x121413)); sight.position.set(50, 1, 0); gun.add(sight);
    parts.muzzleMat = ownMat(0xffe6a8, { emissive: 0xffa83c, emissiveIntensity: 1.6 });
    var flash = new T.Mesh(plane(26, 18), new T.MeshBasicMaterial({ map: glowTex, color: 0xffd890, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
    flash.position.set(62, 0, 1); gun.add(flash); parts.flash = flash;

    // 大刀（背在身后）
    if (def.knife !== false && kind === 'player') {
      var blade = new T.Mesh(box(3, 40, 1.6), ownMat(0xaeb3ab, { emissive: 0x333833 }));
      blade.position.set(-13, 52, -7); blade.rotation.z = .32; body.add(blade);
      var hilt = new T.Mesh(box(3.4, 9, 2), ownMat(0x9e3026)); hilt.position.set(-18, 34, -7); hilt.rotation.z = .32; body.add(hilt);
    }

    g.userData = { body: body, parts: parts, ownedMats: [], kind: kind, def: def };
    g.scale.set(1, 1, 1);
    return g;
  }

  function tintFigure(g, hex) {
    var body = g.userData.body;
    body.traverse(function (o) { if (o.isMesh && o.material && o.material.color) o.material.color.set(hex); });
  }
  function flashFigure(g, amount) {
    var body = g.userData.body;
    body.traverse(function (o) {
      if (o.isMesh && o.material && o.material.emissive) {
        if (!o.userData._em0) o.userData._em0 = o.material.emissive.getHex();
        o.material.emissive.setHex(amount > 0 ? 0xff6650 : o.userData._em0);
      }
    });
  }

  function buildNest() {
    var g = new T.Group();
    var ringMat = ownMat(0x6a644c), bagGeo = new T.SphereGeometry(9, 10, 7);
    for (var i = 0; i < 12; i++) {
      var a = i / 12 * Math.PI * 2;
      var b = new T.Mesh(bagGeo, ringMat);
      b.scale.set(1.5, .62, 1);
      b.position.set(Math.cos(a) * 34, 7 + (i % 2) * 7, Math.sin(a) * 20);
      b.rotation.y = -a; b.castShadow = true; g.add(b);
    }
    var tripod = new T.Group(); tripod.position.y = 26; g.add(tripod);
    var body = new T.Mesh(box(16, 8, 10), ownMat(0x2b2d25)); tripod.add(body);
    var barrel = new T.Mesh(cyl(1.6, 1.6, 38, 8), ownMat(0x22241f));
    barrel.rotation.z = Math.PI / 2; barrel.position.set(22, 2, 0); tripod.add(barrel);
    var flash = new T.Mesh(plane(28, 20), new T.MeshBasicMaterial({ map: glowTex, color: 0xffd890, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
    flash.position.set(46, 2, 1); tripod.add(flash);
    g.userData = { tripod: tripod, flash: flash, kind: 'nest' };
    return g;
  }

  /* ---------- 场景构建 ---------- */
  function clearGroup(grp, disposeOwn) {
    while (grp.children.length) {
      var c = grp.children.pop();
      if (disposeOwn && c.userData && c.userData.ownedMats) c.userData.ownedMats.forEach(function (m) { m.dispose(); });
    }
  }

  function addSky(type, width) {
    var tex = makeSkyTexture(type);
    var sky = new T.Mesh(plane(1, 1), new T.MeshBasicMaterial({ map: tex, depthWrite: false }));
    sky.scale.set(width + 2600, 1300, 1);
    sky.position.set(width / 2, -VH / 2 + 170, -1000);
    sky.renderOrder = -100;
    bgRoot.add(sky);
    bgRoot.userData.sky = sky;

    var warm = type === 'earth' || type === 'mountain';
    // 月亮/太阳
    var orb = new T.Mesh(sph(16, 18, 14), new T.MeshBasicMaterial({ color: warm ? 0xd7965c : 0xf1f0d6 }));
    orb.position.set(width * .2, -175, -860); bgRoot.add(orb); bgRoot.userData.orb = orb;
    var halo = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: warm ? 0xd07a3c : 0xbfd0e0, transparent: true, opacity: .35, depthWrite: false, blending: T.AdditiveBlending }));
    halo.scale.set(230, 230, 1); halo.position.copy(orb.position); halo.position.z = -861; bgRoot.add(halo);
    starPoints.visible = !warm;

    // 远山山脊（多层视差）
    var ridges = type === 'mountain' ? [[380, 0x20201b, .05, 28], [455, 0x2a2921, .09, 18], [520, 0x383025, .14, 9]]
      : type === 'town' ? [[430, 0x1b1b18, .07, 15], [492, 0x25231d, .12, 8]]
        : type === 'rail' ? [[450, 0x12161a, .09, 18], [495, 0x1c1c1a, .14, 9]]
          : [[458, 0x171b1a, .07, 20], [500, 0x20211d, .12, 12]];
    ridges.forEach(function (r, idx) {
      var pts = [], step = 34;
      for (var x = -200; x <= width + 200; x += step) {
        var wx = x;
        var yy = r[0] + Math.sin(wx * .008 + idx * 2) * r[3] + Math.sin(wx * .021 + idx * 4) * r[3] * .35;
        pts.push(new T.Vector2(x, -yy));
      }
      var shape = new T.Shape();
      shape.moveTo(-200, -900);
      pts.forEach(function (p) { shape.lineTo(p.x, p.y); });
      shape.lineTo(width + 200, -900);
      shape.closePath();
      var geo = new T.ShapeGeometry(shape);
      var mg = new T.Mesh(geo, new T.MeshBasicMaterial({ color: r[1], depthWrite: false }));
      mg.position.z = -700 + idx * 60;
      mg.userData.parallax = r[2];
      bgRoot.add(mg);
      if (!bgRoot.userData.parallax) bgRoot.userData.parallax = [];
      bgRoot.userData.parallax.push(mg);
    });
  }

  function addGround(width) {
    var g = new T.Mesh(box(1, 1, 1), new T.MeshLambertMaterial({ color: 0x4a4232, map: GEO.groundTex }));
    g.scale.set(width + 600, 120, 200);
    g.position.set(width / 2, -GROUND - 60, -80);
    g.receiveShadow = true; g.castShadow = false;
    levelRoot.add(g);
    // 地表前缘亮线（在人物脚下、但低于脚，不遮挡）
    var edge = new T.Mesh(box(width + 600, 3, 6), material(0x6b5c40, { emissive: 0x1a150d }));
    edge.position.set(width / 2, -GROUND - 1, -8);
    levelRoot.add(edge);
  }

  function addBuildings(width, type, zBase, color, count, seed) {
    var rnd = seeded(seed || 7);
    for (var i = 0; i < count; i++) {
      var bx = rnd() * (width + 400) - 200;
      var bw = 60 + rnd() * 90, bh = 70 + rnd() * 130;
      var b = new T.Mesh(box(bw, bh, 60), material(color));
      b.position.set(bx, -GROUND + bh / 2, zBase + rnd() * 40);
      b.castShadow = true; levelRoot.add(b);
      // 屋顶
      var roof = new T.Mesh(box(bw + 8, 8, 68), material(0x2a2620));
      roof.position.set(bx, -GROUND + bh + 4, b.position.z); levelRoot.add(roof);
      // 窗户（暖光点）
      var cols = Math.max(1, Math.floor(bw / 26)), rows = Math.max(1, Math.floor(bh / 34));
      for (var r = 0; r < rows; r++) for (var cc = 0; cc < cols; cc++) {
        if (rnd() > .55) {
          var w = new T.Mesh(box(6, 9, 1.5), material(0xc99a58, { emissive: 0x7a4c18, emissiveIntensity: rnd() > .7 ? 1.5 : .45 }));
          w.position.set(bx - bw / 2 + 14 + cc * 26, -GROUND + 28 + r * 34, b.position.z + 30.8);
          levelRoot.add(w);
        }
      }
    }
  }
  function seeded(s) { return function () { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

  function addRiver(y, color, width) {
    var r = new T.Mesh(plane(width + 1200, 90), new T.MeshBasicMaterial({ color: color, transparent: true, opacity: .9 }));
    r.position.set(width / 2, -y, -560); levelRoot.add(r);
  }

  function addStoneBridge(width) {
    var stone = material(0x5a5649), stoneDark = material(0x3f3c33);
    // 桥面/桥体：全部放在 z<0 的背景层，让人物(0~2)、掩体(8) 站在其前方
    var deck = new T.Mesh(box(width + 500, 26, 150), stone);
    deck.position.set(width / 2, -GROUND + 60, -150); deck.castShadow = true; deck.receiveShadow = true; levelRoot.add(deck);
    // 桥墩与拱
    for (var i = -1; i < Math.ceil((width + 400) / 320); i++) {
      var px = i * 320 + 160;
      var pier = new T.Mesh(box(46, 120, 150), stoneDark);
      pier.position.set(px, -GROUND - 2, -150); pier.castShadow = true; levelRoot.add(pier);
      var arch = new T.Mesh(new T.TorusGeometry(78, 13, 8, 18, Math.PI), stone);
      arch.position.set(px + 160, -GROUND + 24, -96); levelRoot.add(arch);
    }
    // 石栏杆（远景侧，z 靠后）
    for (var x = -200; x < width + 300; x += 74) {
      var post = new T.Mesh(box(12, 40, 12), stone); post.position.set(x, -GROUND + 92, -96); post.castShadow = true; levelRoot.add(post);
    }
    var railTop = new T.Mesh(box(width + 600, 8, 14), stone); railTop.position.set(width / 2, -GROUND + 110, -96); levelRoot.add(railTop);
    // 石狮（远景，位于桥面后方）
    [0.9].forEach(function (f) {
      var lx = width * f;
      var base = new T.Mesh(box(46, 26, 46), stoneDark); base.position.set(lx, -GROUND + 14, -70); levelRoot.add(base);
      var lion = new T.Group(); lion.position.set(lx, -GROUND + 27, -70); levelRoot.add(lion);
      var bd = new T.Mesh(sph(15, 12, 9), stone); bd.position.y = 22; lion.add(bd);
      var hd = new T.Mesh(sph(11, 12, 9), stone); hd.position.set(8, 38, 0); lion.add(hd);
      var mane = new T.Mesh(sph(13, 10, 8), stoneDark); mane.position.set(5, 36, 0); lion.add(mane);
    });
  }

  function addRailBridge(width) {
    var steel = material(0x3a403f, { emissive: 0x0a0d0d }), steel2 = material(0x2b302f);
    var deck = new T.Mesh(box(width + 500, 18, 130), steel2);
    deck.position.set(width / 2, -GROUND + 40, -120); deck.castShadow = true; levelRoot.add(deck);
    // 钢桁架（全部在 z<0 背景层）
    for (var x = -200; x < width + 300; x += 220) {
      [-160, -80].forEach(function (zz) {
        var v = new T.Mesh(box(10, 110, 10), steel); v.position.set(x, -GROUND + 95, zz); levelRoot.add(v);
      });
      var diag = new T.Mesh(box(232, 8, 8), steel);
      diag.position.set(x + 110, -GROUND + 118, -160); diag.rotation.z = .42; levelRoot.add(diag);
      var diag2 = new T.Mesh(box(232, 8, 8), steel);
      diag2.position.set(x + 110, -GROUND + 118, -80); diag2.rotation.z = -.42; levelRoot.add(diag2);
    }
    var top = new T.Mesh(box(width + 500, 8, 200), steel); top.position.set(width / 2, -GROUND + 150, -120); levelRoot.add(top);
    // 铁轨
    [-40, 0].forEach(function (zz) {
      var rail = new T.Mesh(box(width + 500, 5, 6), material(0x5a5f58, { emissive: 0x171a18 }));
      rail.position.set(width / 2, -GROUND + 52, zz); levelRoot.add(rail);
    });
  }

  function addNanyuanFar(width) {
    // 永定河 / 宛平城远景
    addRiver(520, 0x121a20, width);
    addBuildings(width, 'town', -520, 0x1d1d19, 26, 11);
    var wall = new T.Mesh(box(width + 400, 66, 40), material(0x24231d));
    wall.position.set(width / 2, -GROUND + 33, -430); levelRoot.add(wall);
    for (var x = 0; x < width; x += 120) {
      var tower = new T.Mesh(box(30, 26, 30), material(0x2c2a23));
      tower.position.set(x, -GROUND + 78, -430); levelRoot.add(tower);
    }
  }

  function addTownFar(width) {
    addBuildings(width, 'town', -480, 0x211f1a, 40, 23);
  }
  function addMountainFar(width) {
    var rnd = seeded(41);
    for (var i = 0; i < 22; i++) {
      var x = rnd() * (width + 400) - 200;
      var h = 150 + rnd() * 320;
      var m = new T.Mesh(new T.ConeGeometry(90 + rnd() * 80, h, 5), material(0x2c2a22));
      m.position.set(x, -GROUND + h / 2 - 40, -430 - rnd() * 120); levelRoot.add(m);
    }
  }

  function addObstacles(level) {
    (level.obstacles || []).forEach(function (o) {
      var yTop = -o.y; // o.y 是顶部(game坐标), 转成3D
      var h = o.h, w = o.w;
      var g = new T.Group(); g.position.set(o.x, -GROUND, 8); levelRoot.add(g);
      if (o.type === 'sandbag') {
        var rows = Math.max(1, Math.round(h / 17)), cols = Math.max(2, Math.round(w / 26));
        for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
          var bx = (c + (r % 2 ? .5 : 0)) * (w / cols) + 12;
          if (bx > w - 6) continue;
          var bag = new T.Mesh(sph(12, 10, 7), material(r % 2 ? 0x7d7250 : 0x6c6346));
          bag.scale.set(1.25, .62, 1); bag.position.set(bx, r * 16 + 8, (c % 2) * 4);
          bag.castShadow = true; bag.receiveShadow = true; g.add(bag);
        }
      } else if (o.type === 'crate') {
        var crate = new T.Mesh(box(w, h, 44), material(0x6b5234));
        crate.position.set(w / 2, h / 2, 0); crate.castShadow = true; crate.receiveShadow = true; g.add(crate);
        [[w / 2, h / 2, 22.5]].forEach(function (p) {
          var frame = new T.Mesh(box(w + 2, h + 2, 2), material(0x4a3722));
          frame.position.set(p[0], p[1], p[2]); g.add(frame);
          var cross = new T.Mesh(box(w * .72, 3, 2.4), material(0x5a4329));
          cross.position.set(p[0], p[1], p[2] + 1.6); cross.rotation.z = .78; g.add(cross);
          var cross2 = cross.clone(); cross2.rotation.z = -.78; g.add(cross2);
        });
      } else if (o.type === 'wall') {
        var wall = new T.Mesh(box(w, h, 40), material(0x5c5a50));
        wall.position.set(w / 2, h / 2, 0); wall.castShadow = true; wall.receiveShadow = true; g.add(wall);
        for (var yy = 12; yy < h; yy += 18) {
          var line = new T.Mesh(box(w, 2, 1.5), material(0x3d3b34));
          line.position.set(w / 2, yy, 20.5); g.add(line);
        }
        // 残缺顶部
        for (var cx = 6; cx < w - 10; cx += 30) {
          if (Math.random() > .45) {
            var chunk = new T.Mesh(box(28, 10 + Math.random() * 12, 40), material(0x5c5a50));
            chunk.position.set(cx, h + 2, 0); chunk.castShadow = true; g.add(chunk);
          }
        }
      } else if (o.type === 'rock') {
        var rock = new T.Mesh(ico(Math.max(w, h) * .52, 0), material(0x565347));
        rock.scale.set(1, h / w * 1.1, .8); rock.position.set(w / 2, h / 2, 0);
        rock.rotation.set(Math.random(), Math.random(), Math.random());
        rock.castShadow = true; rock.receiveShadow = true; g.add(rock);
      }
    });
  }

  function addFires(fires) {
    fireGroups = [];
    (fires || []).forEach(function (f, i) {
      var g = new T.Group(); g.position.set(f.x, -GROUND + 4, 26); levelRoot.add(g);
      var size = f.size || 1;
      for (var k = 0; k < 3; k++) {
        var flame = new T.Mesh(new T.ConeGeometry((10 - k * 2) * size, (30 - k * 5) * size, 7),
          new T.MeshBasicMaterial({ color: k === 0 ? 0xd9531f : (k === 1 ? 0xf39b3c : 0xffd77a), transparent: true, opacity: .82, depthWrite: false, blending: T.AdditiveBlending }));
        flame.position.set((k - 1) * 4 * size, (14 + k * 3) * size, k * 3);
        g.add(flame);
      }
      var sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xff8a3c, transparent: true, opacity: .5, depthWrite: false, blending: T.AdditiveBlending }));
      sp.scale.set(120 * size, 120 * size, 1); sp.position.y = 18; g.add(sp);
      if (i < 3) {
        var pl = new T.PointLight(0xff9950, 1.15, 300 * size);
        pl.position.set(f.x, -GROUND + 60, 60); levelRoot.add(pl); lights.push(pl);
      }
      g.userData = { phase: f.phase || 0, size: size, flames: g.children.slice(0, 3) };
      fireGroups.push(g);
    });
  }

  function addSupply(supply) {
    supplyObj = null;
    if (!supply) return;
    var g = new T.Group(); g.position.set(supply.x, -supply.y, 30); levelRoot.add(g);
    var boxM = new T.Mesh(box(supply.w, supply.h, 34), ownMat(0x3a432d));
    boxM.position.set(supply.w / 2, -supply.h / 2, 0); boxM.castShadow = true; g.add(boxM);
    var lid = new T.Mesh(box(supply.w - 12, 5, 36), ownMat(0x1f2418)); lid.position.set(supply.w / 2, -supply.h - 1, 0); g.add(lid);
    var mark = new T.Mesh(plane(18, 18), new T.MeshBasicMaterial({ map: makeTextTexture('补', '#e6c88c'), transparent: true, depthWrite: false }));
    mark.position.set(supply.w / 2, -supply.h / 2, 17.6); g.add(mark);
    g.userData = { supply: supply, mark: mark };
    supplyObj = g;
  }
  function makeTextTexture(text, color) {
    var c = document.createElement('canvas'); c.width = 64; c.height = 64;
    var g = c.getContext('2d');
    g.clearRect(0, 0, 64, 64);
    g.fillStyle = color; g.font = '40px KaiTi,STKaiti,serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 32, 34);
    var t = new T.CanvasTexture(c); t.needsUpdate = true; return t;
  }

  function addFlag(flag) {
    flagObj = null;
    if (!flag) return;
    var g = new T.Group(); g.position.set(flag.x, -GROUND, 20); dynRoot.add(g);
    var pole = new T.Mesh(cyl(2.2, 2.2, 130, 8), material(0x2b261d)); pole.position.y = 65; pole.castShadow = true; g.add(pole);
    var fg = new T.Mesh(new T.PlaneGeometry(58, 52, 12, 1), new T.MeshLambertMaterial({ color: 0x9c2a20, side: T.DoubleSide, emissive: 0x2a0a06 }));
    fg.position.set(30, 103, 0); g.add(fg);
    var num = new T.Mesh(plane(26, 20), new T.MeshBasicMaterial({ map: makeTextTexture('29', '#ebcd87'), transparent: true, depthWrite: false, side: T.DoubleSide }));
    num.position.set(30, 103, 1.2); g.add(num);
    var glowS = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xff8a4c, transparent: true, opacity: .3, depthWrite: false, blending: T.AdditiveBlending }));
    glowS.scale.set(150, 150, 1); glowS.position.set(28, 105, -3); g.add(glowS);
    g.userData = { flag: flag, cloth: fg, nums: num, base: fg.geometry.attributes.position.array.slice(), glow: glowS };
    flagObj = g;
  }
  function addExit(exit) {
    exitObj = null;
    if (!exit) return;
    var g = new T.Group(); g.position.set(exit.x, -GROUND, 18); dynRoot.add(g);
    var m = ownMat(0x5a8560, { emissive: 0x142814 });
    var l = new T.Mesh(box(8, 82, 8), m); l.position.set(-24, 41, 0); g.add(l);
    var r = new T.Mesh(box(8, 82, 8), m); r.position.set(24, 41, 0); g.add(r);
    var t = new T.Mesh(new T.ConeGeometry(30, 26, 4), m); t.position.set(0, 94, 0); t.rotation.y = Math.PI / 4; g.add(t);
    var glowS = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0x7ac486, transparent: true, opacity: .35, depthWrite: false, blending: T.AdditiveBlending }));
    glowS.scale.set(190, 170, 1); glowS.position.set(0, 60, -4); g.add(glowS);
    g.userData = { exit: exit, glow: glowS, parts: [l, r, t] };
    exitObj = g;
  }

  function buildLevel(S) {
    clearGroup(bgRoot); clearGroup(levelRoot); clearGroup(dynRoot); clearGroup(fxRoot);
    lights = []; fireGroups = []; flagObj = null; supplyObj = null; exitObj = null;
    figCache = { player: new Map(), enemy: new Map(), ally: new Map(), civ: new Map() };
    bulletPool = []; flashPool = []; slashPool = []; boomPool = []; pickPool = []; mortarPool = [];
    buildRain(); buildStars(); buildPools();

    var type = S.level ? S.level.type : 'stone';
    var width = S.level ? S.level.width : 1900;
    addSky(type, width);
    addGround(width);
    if (type === 'stone') { addRiver(520, 0x121a20, width); addBuildings(width, 'town', -520, 0x1d1d19, 22, 11); addStoneBridge(width); }
    else if (type === 'rail') { addRiver(510, 0x10181e, width); addBuildings(width, 'town', -540, 0x121417, 18, 13); addRailBridge(width); }
    else if (type === 'town') { addBuildings(width, 'town', -470, 0x201e1a, 42, 23); addTownFar(width); addNanyuanFar(width); }
    else if (type === 'mountain') { addMountainFar(width); addBuildings(width, 'town', -500, 0x24211b, 12, 33); addRailBridge(width * .55); }
    else { addNanyuanFar(width); }
    if (S.level) addObstacles(S.level);
    addFires(S.fires || (S.level && S.level.fires));
    addSupply(S.supply);
    addFlag(S.flag);
    addExit(S.exit);
  }

  /* ---------- 动态对象同步 ---------- */
  function syncFigures(S) {
    var list, cache, kind, def;
    // 玩家
    cache = figCache.player; kind = 'player';
    var p = S.player;
    if (p) {
      var f = cache.get(p);
      if (!f) {
        def = { uniform: 0x4d564b, leg: 0x363b32, skin: 0xb58a69, knife: p.knife !== false };
        var key = p.weaponKey || (S.battle && S.battle.playerKey);
        if (key && KEY_UNIFORMS[key]) def.uniform = KEY_UNIFORMS[key];
        f = buildFigure('player', def); dynRoot.add(f); cache.set(p, f);
      }
      updateSoldier(f, p, p.x, p.y, true);
      f.visible = !!p.alive;
    }
    cache.forEach(function (f, o) { if (o !== p) { dynRoot.remove(f); cache.delete(o); } });

    // 敌人
    cache = figCache.enemy;
    S.enemies.forEach(function (e) {
      if (e.nest) {
        var n = cache.get(e);
        if (!n) { n = buildNest(); dynRoot.add(n); cache.set(e, n); }
        n.visible = true;
        n.position.set(e.x, -e.y, 16);
        n.userData.tripod.rotation.z = -(e.aim || 0);
        n.userData.flash.material.opacity = e.muzzle > 0 ? .9 : 0;
        if (!e.alive) n.rotation.z = -Math.PI * .32;
        return;
      }
      var g = cache.get(e);
      if (!g) {
        def = { uniform: e.type === 'charger' ? 0x4c4a37 : 0x54513f, leg: 0x3a3c2e, skin: 0xa37b5e, helmet: true, knife: false };
        g = buildFigure('enemy', def); dynRoot.add(g); cache.set(e, g);
      }
      updateSoldier(g, e, e.x, e.y, false);
      if (!e.alive) {
        g.rotation.z = -Math.PI * .44;
        g.visible = e.deathT < 3.2;
      } else {
        g.rotation.z = 0; g.visible = true;
      }
    });
    cache.forEach(function (g, e) { if (S.enemies.indexOf(e) < 0) { dynRoot.remove(g); cache.delete(e); } });

    // 友军
    cache = figCache.ally;
    S.allies.forEach(function (a) {
      var g = cache.get(a);
      if (!g) { g = buildFigure('ally', { uniform: 0x4a5247, leg: 0x353a32, skin: 0xb58a69, helmet: false, knife: false }); dynRoot.add(g); cache.set(a, g); }
      updateSoldier(g, a, a.x, a.y, false);
      g.visible = a.alive;
      if (!a.alive) g.rotation.z = -Math.PI * .44;
    });
    cache.forEach(function (g, a) { if (S.allies.indexOf(a) < 0) { dynRoot.remove(g); cache.delete(a); } });

    // 平民
    var civs = (S.chapterState && S.chapterState.civilians) || [];
    cache = figCache.civ;
    civs.forEach(function (c) {
      var g = cache.get(c);
      if (!g) { g = buildFigure('civ', { uniform: 0x2c2a22, leg: 0x211f18, skin: 0x9a7a5e, helmet: false, knife: false }); g.scale.setScalar(.82); dynRoot.add(g); cache.set(c, g); }
      g.position.set(c.x, -GROUND, 4);
      var bob = Math.sin(c.phase || 0) * 2;
      g.position.y += bob;
      g.rotation.z = 0; g.visible = true;
    });
    cache.forEach(function (g, c) { if (civs.indexOf(c) < 0) { dynRoot.remove(g); cache.delete(c); } });
  }

  var KEY_UNIFORMS = {
    xiaoman: 0x4d564b, shuanzhu: 0x4a5148, dahe: 0x4b5144, qiusheng: 0x4b5144,
    tiezhu: 0x4a5148, shitou: 0x4b5144, achang: 0x5c5b47, xiaobao: 0x4b5144,
    xiaonan: 0x4b5144, xiaoxiang: 0x4b5144, agui: 0x4b5144, hongjun: 0x4a5148,
    xiaolong: 0x4a5148, xiaohu: 0x4a5148, xiaoguan: 0x4b5144, xiaolu: 0x4a5148, xiaodong: 0x4b5144
  };

  function updateSoldier(g, o, x, y, isPlayer) {
    g.position.set(x, -y, isPlayer ? 2 : 0);
    var crouch = !!o.crouch || (o.type === 'mg');
    g.scale.set(o.facing >= 0 ? 1 : -1, crouch ? .74 : 1, 1);
    var parts = g.userData.parts;
    var walk = o.walk || 0;
    var swing = o.moving ? Math.sin(walk) : Math.sin(walk * .4) * .2;
    parts.legL.rotation.z = swing * .32;
    parts.legR.rotation.z = -swing * .32;
    var aim = o.aim || 0;
    // 逻辑 aim 的 y 是向下为正，3D Y 向上，角度取反
    parts.gun.rotation.z = -aim + (o.reloading ? -.55 : 0);
    parts.armR.rotation.z = -aim * .4;
    parts.flash.material.opacity = (o.muzzle > 0) ? .92 : 0;
    if (o.hitFlash > 0) flashFigure(g, o.hitFlash);
    else flashFigure(g, 0);
  }

  function syncEffects(S) {
    var i, g;
    // 子弹
    var bi = 0;
    for (i = 0; i < S.bullets.length && bi < bulletPool.length; i++) {
      var b = S.bullets[i];
      var sx3 = b.x, sy3 = -b.y;
      if (sx3 < S.camX - 60 || sx3 > S.camX + VW + 60) continue;
      g = bulletPool[bi++]; g.visible = true;
      var px3 = b.px, py3 = -b.py;
      var dx = sx3 - px3, dy = sy3 - py3;
      var len = Math.max(4, Math.hypot(dx, dy));
      var mx = (sx3 + px3) / 2, my = (sy3 + py3) / 2;
      g.position.set(mx, my, 6);
      g.rotation.z = Math.atan2(dy, dx);
      var col = b.owner === 'player' ? 0xffe0a0 : 0xff8a6a;
      g.userData.core.material.color.setHex(col);
      g.userData.core.scale.set(len, 1.5, 1.5);
      g.userData.halo.material.color.setHex(col);
      g.userData.halo.scale.set(len * 1.5, 16, 1);
    }
    for (; bi < bulletPool.length; bi++) bulletPool[bi].visible = false;

    // 枪口/闪光
    var fi = 0;
    for (i = 0; i < S.flashes.length && fi < flashPool.length; i++) {
      var f = S.flashes[i];
      g = flashPool[fi++]; g.visible = true;
      g.position.set(f.x, -f.y, 8);
      g.material.opacity = Math.max(0, 1 - f.life / f.max);
      g.scale.set(30 * f.scale, 30 * f.scale, 1);
    }
    for (; fi < flashPool.length; fi++) flashPool[fi].visible = false;

    // 刀光
    var si = 0;
    for (i = 0; i < S.slashes.length && si < slashPool.length; i++) {
      var s = S.slashes[i];
      g = slashPool[si++]; g.visible = true;
      g.position.set(s.x, -s.y, 10);
      var k = s.life / s.max;
      g.rotation.z = -s.angle - .75 + k * .2;
      g.scale.setScalar(s.range / 60);
      g.material.opacity = (1 - k) * .8;
    }
    for (; si < slashPool.length; si++) slashPool[si].visible = false;

    // 爆炸
    var ei = 0;
    for (i = 0; i < S.explosions.length && ei < boomPool.length; i++) {
      var e = S.explosions[i];
      g = boomPool[ei++]; g.visible = true;
      g.position.set(e.x, -e.y, 9);
      var rr = 30 + e.r * 130;
      g.scale.set(rr, rr, 1);
      g.material.opacity = Math.max(0, 1 - e.life / e.max);
    }
    for (; ei < boomPool.length; ei++) boomPool[ei].visible = false;

    // 弹壳
    // （数量少，用简单实例化近似：并入火花）

    // 粒子
    var d = P.dummy, sc = 0, sm = 0;
    for (i = 0; i < S.particles.length; i++) {
      var pr = S.particles[i];
      if (pr.x < S.camX - 80 || pr.x > S.camX + VW + 80) continue;
      var kk = pr.life / pr.max;
      if (pr.type === 'smoke') {
        if (sm >= P.smokes.count + 320 || sm >= 320) continue;
        d.position.set(pr.x, -pr.y, 4);
        d.rotation.set(0, 0, 0);
        d.scale.setScalar(pr.size);
        d.updateMatrix(); P.smokes.setMatrixAt(sm++, d.matrix);
      } else {
        if (sc >= 460) continue;
        d.position.set(pr.x, -pr.y, 5);
        d.rotation.set(0, 0, Math.atan2(-pr.vy, pr.vx));
        var sz = pr.type === 'spark' ? pr.size * 2.4 : pr.size * 1.6;
        d.scale.set(sz, Math.max(.8, sz * .4), sz * .6);
        d.updateMatrix(); P.sparks.setMatrixAt(sc, d.matrix);
        var cc = new T.Color(pr.color.charAt(0) === '#' ? pr.color : 0xd8c8a8);
        P.sparks.setColorAt(sc, cc);
        sc++;
      }
    }
    P.sparks.count = sc; P.smokes.count = sm;
    P.sparks.instanceMatrix.needsUpdate = true;
    P.smokes.instanceMatrix.needsUpdate = true;
    if (P.sparks.instanceColor) P.sparks.instanceColor.needsUpdate = true;

    // 拾取物
    while (pickPool.length < (S.pickups ? S.pickups.length : 0)) {
      var pg = new T.Group();
      var pb = new T.Mesh(box(14, 8, 10), material(0x4b5134, { emissive: 0x1a2010 })); pg.add(pb);
      var ph = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xe6c878, transparent: true, opacity: .35, depthWrite: false, blending: T.AdditiveBlending }));
      ph.scale.set(40, 40, 1); pg.add(ph);
      fxRoot.add(pg); pickPool.push(pg);
    }
    pickPool.forEach(function (pg, idx) {
      var pk = S.pickups && S.pickups[idx];
      pg.visible = !!pk;
      if (pk) { pg.position.set(pk.x, -(GROUND - 12 + Math.sin(pk.t * 2.5) * 3), 6); }
    });

    // 炮击警告
    while (mortarPool.length < S.mortars.length) {
      var mg = new T.Mesh(new T.TorusGeometry(95, 2.5, 5, 26), new T.MeshBasicMaterial({ color: 0xdc4b32, transparent: true, opacity: .6, depthWrite: false }));
      mg.rotation.x = Math.PI / 2; fxRoot.add(mg); mortarPool.push(mg);
    }
    mortarPool.forEach(function (mg, idx) {
      var mo = S.mortars[idx];
      mg.visible = !!(mo && mo.timer > 0);
      if (mg.visible) {
        mg.position.set(mo.x, -GROUND + 2, 8);
        mg.material.opacity = .4 + Math.sin(S.time * 12) * .2;
        mg.scale.set((mo.radius || 95) / 95, 1, .18);
      }
    });
  }

  function syncWorldObjects(S) {
    // 火光
    fireGroups.forEach(function (g) {
      var ph = S.time * 2.2 + g.userData.phase;
      g.userData.flames.forEach(function (fl, i) {
        fl.scale.y = .82 + Math.sin(ph * (1 + i * .3)) * .22;
        fl.scale.x = .9 + Math.cos(ph * .8 + i) * .12;
      });
    });
    // 旗帜
    if (flagObj) {
      var fl = flagObj, flag = S.flag;
      fl.visible = true;
      var cloth = fl.userData.cloth;
      if (flag.planted) {
        cloth.visible = true; fl.userData.nums.visible = true;
        var arr = cloth.geometry.attributes.position.array;
        for (var i = 0; i < arr.length; i += 3) {
          var tx = arr[i];
          arr[i + 2] = Math.sin(S.time * 4 + (tx + 29) / 58 * 5) * 5;
        }
        cloth.geometry.attributes.position.needsUpdate = true;
        fl.userData.glow.material.opacity = .3 + Math.sin(S.time * 3) * .08;
      } else {
        cloth.visible = false; fl.userData.nums.visible = false;
        fl.userData.glow.material.opacity = 0;
      }
    }
    // 补给
    if (supplyObj) supplyObj.userData.mark.material.opacity = supplyObj.userData.supply.used ? .4 : 1;
    // 出口
    if (exitObj) {
      var e = exitObj;
      var active = e.userData.exit.active;
      e.userData.parts.forEach(function (m) { m.material.color.setHex(active ? 0x7ac486 : 0x5a5542); });
      e.userData.glow.material.opacity = active ? .38 : .08;
    }
    // 雨（屏幕坐标）
    if (rainLine) {
      var pos = rainGeo.attributes.position.array;
      var n = rainLine.userData.n;
      for (var i = 0; i < n; i++) {
        var idx = i * 6;
        var x = S.rain[i] ? S.rain[i].x : (i / n) * VW;
        var y = S.rain[i] ? S.rain[i].y : (i / n) * VH;
        var len = S.rain[i] ? S.rain[i].len : 12;
        var wind = S.rain[i] ? S.rain[i].wind : 40;
        pos[idx] = S.camX + x; pos[idx + 1] = -y; pos[idx + 2] = 42;
        pos[idx + 3] = S.camX + x - wind * .04; pos[idx + 4] = -(y - len); pos[idx + 5] = 42;
      }
      rainGeo.attributes.position.needsUpdate = true;
      rainLine.visible = S.fires && S.fires.length > 0;
    }
  }

  /* ---------- 主渲染 ---------- */
  function render(S, view) {
    if (!ok) return;
    if (!S) return;
    if (view && view.vw) setView(view);

    // 场景切换检测
    var isMenu = S.mode === 'menu' || S.mode === 'boot' || (S.mode === 'codex' && S.codexReturn === 'menu');
    var key = isMenu ? 'menu' : (S.level ? S.level : 'none');
    if (key !== lastLevel) {
      lastLevel = key;
      buildLevel(S);
      if (isMenu) buildMenuDiorama();
    }
    if (isMenu && !bgRoot.userData.menuBuilt) buildMenuDiorama();
    if (!isMenu && bgRoot.userData.menuBuilt) { bgRoot.userData.menuBuilt = false; }

    // 相机跟随（1:1 映射）
    var camCenterX = S.camX + VW / 2;
    var shakeX = 0, shakeY = 0;
    if (S.shake > 0) { shakeX = (Math.random() - .5) * S.shake * 9; shakeY = (Math.random() - .5) * S.shake * 9; }
    camera.position.set(camCenterX + shakeX, -VH / 2 + shakeY, 1600);
    camera.lookAt(camCenterX + shakeX, -VH / 2 + shakeY, 0);
    sun.position.set(camCenterX - 380, 520, 720);
    sunTarget.position.set(camCenterX, -VH / 2, 0);

    // 视差背景
    (bgRoot.userData.parallax || []).forEach(function (m) {
      m.position.x = S.camX * (1 - (m.userData.parallax || 0));
    });
    if (bgRoot.userData.sky) bgRoot.userData.sky.position.x = camCenterX;
    if (bgRoot.userData.orb) {
      bgRoot.userData.orb.position.x = S.camX * .82 + VW * .2;
    }
    if (starPoints) starPoints.position.x = S.camX * .9;

    if (!isMenu && S.player && S.level) {
      syncFigures(S);
      syncEffects(S);
      syncWorldObjects(S);
    } else if (isMenu) {
      animateMenu(S);
    }

    // 泛光
    overlay.material.opacity = Math.max(0, S.flash || 0) * .085;

    // 先清除整块画布（含信箱区域），再渲染视口内容
    try {
      renderer.setScissorTest(false);
      renderer.clear(true, true, true);
      renderer.setScissorTest(true);
      renderer.render(scene, camera);
    } catch (e) { console.error('[R3D] render error', e); }
  }

  function buildMenuDiorama() {
    bgRoot.userData.menuBuilt = true;
    // 哨兵
    var g = buildFigure('player', { uniform: 0x4d564b, leg: 0x363b32, skin: 0xb58a69, knife: true });
    g.position.set(VW * .72, -GROUND, 2);
    dynRoot.add(g);
    bgRoot.userData.menuGuard = g;
    // 旗帜
    addFlag({ x: VW * .62, y: GROUND, planted: true });
  }
  function animateMenu(S) {
    var g = bgRoot.userData.menuGuard;
    if (g) {
      var parts = g.userData.parts;
      parts.legL.rotation.z = Math.sin(S.menuTime * 1.2) * .05;
      parts.legR.rotation.z = -Math.sin(S.menuTime * 1.2) * .05;
      parts.gun.rotation.z = -.02;
    }
    if (flagObj) {
      var cloth = flagObj.userData.cloth, arr = cloth.geometry.attributes.position.array;
      for (var i = 0; i < arr.length; i += 3) arr[i + 2] = Math.sin(S.time * 4 + (arr[i] + 29) / 58 * 5) * 5;
      cloth.geometry.attributes.position.needsUpdate = true;
    }
  }

  var api = {
    get ok() { return ok; },
    init: init,
    setView: setView,
    render: render,
    onResize: function () { if (ok && glCanvas) { /* view 由 game.js setView 提供 */ } }
  };
  window.R3D = api;
})();
