/* =========================================================
   卢沟桥 · 1937 — 2D 守桥
   纯 Canvas 2D / WebAudio / 无外部素材
   ========================================================= */
(function () {
  'use strict';

  const DATA = window.LQDATA;
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const TAU = Math.PI * 2;
  const GROUND = 650;
  const VH = 810;

  const DIFFS = {
    easy: { key: 'easy', label: '新兵', dmg: .65, acc: .72, hp: 120, ammo: 12, count: -1, speed: .92 },
    normal: { key: 'normal', label: '老兵', dmg: 1, acc: 1, hp: 100, ammo: 0, count: 0, speed: 1 },
    hard: { key: 'hard', label: '血战', dmg: 1.35, acc: 1.2, hp: 90, ammo: -6, count: 1, speed: 1.07 }
  };

  const UI = {
    app: $('app'), stage: $('stage'), canvas: $('gameCanvas'),
    panel: $('missionPanel'), mpLive: $('mpLive'), mpChapterNo: $('mpChapterNo'), mpDate: $('mpDate'),
    mpChapterTitle: $('mpChapterTitle'), mpLocation: $('mpLocation'), mpTime: $('mpTime'),
    mpMission: $('mpMission'), mpMissionDesc: $('mpMissionDesc'), mpObjectiveList: $('mpObjectiveList'),
    mpBarWrap: $('mpBarWrap'), mpBarLabel: $('mpBarLabel'), mpBarValue: $('mpBarValue'), mpBarFill: $('mpBarFill'),
    mpPortrait: $('mpPortrait'), mpFigureName: $('mpFigureName'), mpFigureRole: $('mpFigureRole'), mpFigureQuote: $('mpFigureQuote'),
    mpAvatar: $('mpAvatar'), mpHealthFill: $('mpHealthFill'), mpHealthNum: $('mpHealthNum'),
    mpAmmoPips: $('mpAmmoPips'), mpAmmo: $('mpAmmo'), mpMeleeFill: $('mpMeleeFill'), mpMeleeText: $('mpMeleeText'),
    stChapter: $('stChapter'), stDate: $('stDate'), stWave: $('stWave'), stObjective: $('stObjective'),
    stMute: $('stMute'), stPause: $('stPause'),
    waveBanner: $('waveBanner'), wbKicker: $('wbKicker'), wbTitle: $('wbTitle'), wbSub: $('wbSub'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'), damageVignette: $('damageVignette'), flashVignette: $('flashVignette'),
    radioLine: $('radioLine'), radioName: $('radioName'), radioText: $('radioText'),
    prompt: $('prompt'), promptText: $('promptText'), controlsHint: $('controlsHint'),
    dialogue: $('dialogue'), dlgPortrait: $('dlgPortrait'), dlgName: $('dlgName'), dlgRole: $('dlgRole'), dlgText: $('dlgText'),
    chapterCard: $('chapterCard'), ccKicker: $('ccKicker'), ccTitle: $('ccTitle'), ccDate: $('ccDate'),
    ccQuote: $('ccQuote'), ccSource: $('ccSource'), ccBtn: $('ccBtn'),
    chapterEnd: $('chapterEnd'), ceKicker: $('ceKicker'), ceTitle: $('ceTitle'), ceText: $('ceText'),
    ceStats: $('ceStats'), ceNext: $('ceNext'), ceMenu: $('ceMenu'),
    gameOver: $('gameOver'), goTitle: $('goTitle'), goReason: $('goReason'), goStats: $('goStats'),
    goRetry: $('goRetry'), goMenu: $('goMenu'),
    finalScreen: $('finalScreen'), finalStats: $('finalStats'), finalMenu: $('finalMenu'), finalCodex: $('finalCodex'),
    pause: $('pause'), pauseKills: $('pauseKills'), pauseWave: $('pauseWave'), pauseAccuracy: $('pauseAccuracy'),
    btnResume: $('btnResume'), btnRestart: $('btnRestart'), btnPauseCodex: $('btnPauseCodex'), btnPauseMenu: $('btnPauseMenu'),
    menu: $('menu'), menuDiff: $('menuDiff'), menuStart: $('menuStart'), menuStartText: $('menuStartText'),
    menuRestart: $('menuRestart'), menuChapters: $('menuChapters'),
    menuCodex: $('menuCodex'), menuHowto: $('menuHowto'), menuAbout: $('menuAbout'),
    codex: $('codex'), codexClose: $('codexClose'), codexTabs: $('codexTabs'), codexTitle: $('codexTitle'), codexBody: $('codexBody'),
    boot: $('boot'), bootFill: $('bootFill'), bootSub: $('bootSub'), toast: $('toast'),
    panelCodex: $('panelCodex'), panelPause: $('panelPause'), panelMute: $('panelMute')
  };

  let ctx = UI.canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (ctx) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low'; }

  // 预先烘焙的柔光，替代每帧 createRadialGradient
  const FX = {};
  (function buildFX() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 2, 64, 64, 62);
    grd.addColorStop(0, 'rgba(255,242,196,1)');
    grd.addColorStop(.18, 'rgba(255,190,100,.9)');
    grd.addColorStop(.48, 'rgba(238,95,38,.42)');
    grd.addColorStop(1, 'rgba(160,35,8,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    FX.glow = c;
  })();

  /* ---------------- 画布尺寸 ---------------- */
  let VW = 1440, viewScale = 1, viewOffX = 0, viewOffY = 0, dpr = 1;
  function resize() {
    const w = UI.stage.clientWidth, h = UI.stage.clientHeight;
    if (!w || !h) return;
    // 2D 画面不需要 2x 超采样；同时限制总像素，4K/高 DPI 下也不至于把 GPU 填满
    const maxPixels = 2600000;
    dpr = Math.min(window.devicePixelRatio || 1, 1.25, Math.sqrt(maxPixels / Math.max(1, w * h)));
    dpr = Math.max(.75, dpr);
    const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
    if (UI.canvas.width !== cw || UI.canvas.height !== ch) {
      UI.canvas.width = cw;
      UI.canvas.height = ch;
      if (ctx) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low'; }
    }
    VW = Math.round(VH * w / h);
    VW = clamp(VW, 980, 1900);
    viewScale = Math.min(w / VW, h / VH);
    viewOffX = (w - VW * viewScale) / 2;
    viewOffY = (h - VH * viewScale) / 2;
    S.canvasRect = UI.canvas.getBoundingClientRect();
    if (!S.mouse.initialized) {
      S.mouse.x = VW / 2;
      S.mouse.y = VH / 2;
      S.mouse.initialized = true;
    }
    if (!S.crosshairClient) {
      S.crosshairClient = { x: w / 2, y: h / 2 };
    }
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(UI.stage);

  /* ---------------- 状态 ---------------- */
  const S = {
    mode: 'boot',
    chapter: 0,
    diffKey: 'normal',
    diff: DIFFS.normal,
    time: 0,
    playTime: 0,
    menuTime: 0,
    player: null,
    enemies: [], allies: [], bullets: [], casings: [], particles: [], explosions: [],
    pickups: [], flashes: [], slashes: [], clouds: [], fires: [], rain: [], embers: [], civilians: [], mortars: [], warnings: [],
    level: null,
    camX: 0,
    camTarget: 0,
    mouse: { x: 800, y: 420, inside: false, initialized: false },
    crosshairClient: null,
    canvasRect: null,
    hudTimer: 0,
    promptTimer: 0,
    uiTimer: 0,
    accum: 0,
    objSig: '',
    promptCache: null,
    hudCache: {},
    levelCache: null,
    obstacleCache: null,
    menuCache: null,
    skyCache: null,
    keys: Object.create(null),
    stars: [],
    objectives: [],
    bar: null,
    waves: {},
    chapterState: {},
    kills: 0, shots: 0, hits: 0,
    campaign: { kills: 0, shots: 0, hits: 0, time: 0, chapters: 0 },
    save: 0,
    menuChapter: 0,
    dialogue: null,
    cardOpen: false,
    radioTimer: 0,
    shake: 0,
    flash: 0,
    damageFlash: 0,
    hitmarkerTimer: 0,
    promptVisible: false,
    promptText: '',
    completing: false,
    codexReturn: null,
    pausedReturn: null,
    lastHud: {},
    supply: null,
    flag: null,
    exit: null,
    tutorialTimer: 0,
    startDelay: 0
  };

  /* ---------------- 小工具 ---------------- */
  function hexA(hex, a) {
    const n = parseInt(hex.replace('#', ''), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function segRect(x1, y1, x2, y2, r) {
    let t0 = 0, t1 = 1;
    const dx = x2 - x1, dy = y2 - y1;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
    for (let i = 0; i < 4; i++) {
      if (Math.abs(p[i]) < 1e-6) {
        if (q[i] < 0) return null;
      } else {
        const t = q[i] / p[i];
        if (p[i] < 0) {
          if (t > t1) return null;
          if (t > t0) t0 = t;
        } else {
          if (t < t0) return null;
          if (t < t1) t1 = t;
        }
      }
    }
    return { t: t0, x: x1 + dx * t0, y: y1 + dy * t0 };
  }
  function rrect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function drawText(text, x, y, size, color, align, font) {
    ctx.save();
    ctx.font = `${size}px ${font || '"KaiTi","STKaiti","Songti SC",serif'}`;
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  function textOn(c, text, x, y, size, color, align, font) {
    c.save();
    c.font = `${size}px ${font || '"KaiTi","STKaiti","Songti SC",serif'}`;
    c.fillStyle = color;
    c.textAlign = align || 'left';
    c.textBaseline = 'middle';
    c.fillText(text, x, y);
    c.restore();
  }
  function screenX(worldX) { return worldX - S.camX; }
  function isVisible(x, margin) { return x > -margin && x < VW + margin; }
  function luck() { return Math.random(); }

  /* ---------------- 人物肖像 ---------------- */
  const PORTRAITS = {};

  function paintPortrait(key) {
    const c = document.createElement('canvas');
    c.width = 180; c.height = 210;
    const g = c.getContext('2d');
    const W = 180, H = 210;
    const paper = g.createLinearGradient(0, 0, W, H);
    paper.addColorStop(0, '#26251e');
    paper.addColorStop(.55, '#151712');
    paper.addColorStop(1, '#0b0d0a');
    g.fillStyle = paper; g.fillRect(0, 0, W, H);
    // 背景纹理
    g.strokeStyle = 'rgba(192,161,102,.055)'; g.lineWidth = 1;
    for (let i = -H; i < W; i += 13) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke(); }
    const halo = g.createRadialGradient(90, 78, 8, 90, 82, 95);
    halo.addColorStop(0, 'rgba(192,161,102,.14)');
    halo.addColorStop(1, 'rgba(192,161,102,0)');
    g.fillStyle = halo; g.fillRect(0, 0, W, H);

    if (key === 'narrator') {
      g.strokeStyle = 'rgba(192,161,102,.45)'; g.lineWidth = 3;
      g.beginPath(); g.arc(90, 92, 44, .3, TAU - .4); g.stroke();
      g.fillStyle = 'rgba(192,161,102,.15)';
      g.beginPath(); g.arc(90, 92, 35, 0, TAU); g.fill();
      textOn(g, '战', 90, 92, 43, 'rgba(230,218,190,.72)', 'center', '"KaiTi","STKaiti",serif');
      textOn(g, '地', 90, 132, 25, 'rgba(192,161,102,.55)', 'center', '"KaiTi","STKaiti",serif');
      textOn(g, '一九三七 · 华北', 90, 184, 7, 'rgba(192,161,102,.45)', 'center', '"Songti SC",serif');
      g.fillStyle = 'rgba(158,48,38,.72)'; g.fillRect(142, 24, 18, 18);
      g.strokeStyle = 'rgba(255,255,255,.12)'; g.strokeRect(144, 26, 14, 14);
    } else {
      const conf = {
        xiaoman: { uniform: '#4e564b', cap: 'soft', skin: '#c6a17f', age: 'young', hair: '#211914' },
        wanglengzhai: { robe: true, glasses: true, skin: '#c8a888', age: 'middle', hair: '#2b2119', mustache: false },
        jinzhenzhong: { uniform: '#4b5144', cap: 'soft', skin: '#bd9676', age: 'middle', mustache: true, brow: 'thick' },
        jixingwen: { uniform: '#4b5348', cap: 'soft', skin: '#c19b7b', age: 'young', mustache: false, brow: 'thick' },
        hejifeng: { uniform: '#4b5144', cap: 'soft', skin: '#bf9a7a', age: 'middle', mustache: false, glasses: true },
        tonglinge: { uniform: '#474d42', cap: 'soft', skin: '#b99070', age: 'old', mustache: true, brow: 'thick', worn: true },
        zhaodengyu: { uniform: '#4b5144', cap: 'soft', skin: '#b98e6c', age: 'middle', mustache: true, brow: 'thick', strong: true },
        songzheyuan: { uniform: '#4b5144', cap: 'soft', skin: '#c09a79', age: 'old', mustache: true, glasses: true },
        laozhao: { uniform: '#4a4f43', cap: 'cloth', skin: '#b38b6a', age: 'old', mustache: true, stubble: true, scar: true },
        zhangzizhong: { uniform: '#4b5144', cap: 'soft', skin: '#bd9777', age: 'middle', mustache: false, strong: true }
      }[key] || { uniform: '#4a5045', cap: 'soft', skin: '#c09a7a', age: 'middle' };

      // 肩膀
      g.fillStyle = key === 'wanglengzhai' ? '#23251f' : conf.uniform;
      g.beginPath();
      g.moveTo(22, 210); g.lineTo(28, 158); g.quadraticCurveTo(46, 144, 66, 140);
      g.lineTo(114, 140); g.quadraticCurveTo(134, 144, 152, 158); g.lineTo(158, 210);
      g.closePath(); g.fill();
      if (!conf.robe) {
        g.fillStyle = 'rgba(20,22,18,.55)';
        g.beginPath(); g.moveTo(28, 174); g.lineTo(66, 151); g.lineTo(90, 178); g.lineTo(114, 151); g.lineTo(152, 174); g.lineTo(158, 210); g.lineTo(22, 210); g.closePath(); g.fill();
        g.fillStyle = conf.uniform;
        g.beginPath(); g.moveTo(60, 147); g.lineTo(90, 180); g.lineTo(120, 147); g.lineTo(112, 137); g.lineTo(90, 150); g.lineTo(68, 137); g.closePath(); g.fill();
        // 领章
        g.fillStyle = '#9a7b43'; g.fillRect(74, 161, 7, 3); g.fillRect(99, 161, 7, 3);
        g.fillStyle = 'rgba(158,48,38,.8)'; g.fillRect(75, 162, 5, 2); g.fillRect(100, 162, 5, 2);
        // 纽扣
        g.fillStyle = 'rgba(192,161,102,.55)';
        for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(90, 184 + i * 9, 1.4, 0, TAU); g.fill(); }
      } else {
        // 长衫
        g.fillStyle = '#2b2b24';
        g.beginPath(); g.moveTo(55, 145); g.lineTo(90, 166); g.lineTo(125, 145); g.lineTo(134, 210); g.lineTo(46, 210); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(192,161,102,.2)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(90, 168); g.lineTo(90, 210); g.stroke();
        g.beginPath(); g.moveTo(72, 163); g.lineTo(90, 185); g.lineTo(108, 163); g.stroke();
      }
      // 脖子
      g.fillStyle = conf.skin;
      g.beginPath(); g.moveTo(78, 130); g.lineTo(102, 130); g.lineTo(101, 153); g.lineTo(79, 153); g.closePath(); g.fill();
      g.fillStyle = 'rgba(70,42,28,.28)';
      g.fillRect(79, 145, 22, 5);
      // 脸
      g.save();
      g.fillStyle = conf.skin;
      g.beginPath(); g.ellipse(90, 95, 35, 43, 0, 0, TAU); g.fill();
      // 侧面阴影
      const fg = g.createLinearGradient(58, 0, 122, 0);
      fg.addColorStop(0, 'rgba(60,35,22,.16)');
      fg.addColorStop(.55, 'rgba(255,220,180,.04)');
      fg.addColorStop(1, 'rgba(40,25,16,.24)');
      g.fillStyle = fg;
      g.beginPath(); g.ellipse(90, 95, 35, 43, 0, 0, TAU); g.fill();
      // 耳朵
      g.fillStyle = conf.skin;
      g.beginPath(); g.ellipse(54, 98, 7, 12, -.1, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(126, 98, 7, 12, .1, 0, TAU); g.fill();
      // 头发
      g.fillStyle = conf.hair;
      g.beginPath(); g.ellipse(90, 68, 37, 23, 0, Math.PI, TAU); g.fill();
      // 帽子
      if (conf.cap === 'soft') {
        g.fillStyle = '#343a31';
        g.beginPath();
        g.moveTo(57, 60); g.quadraticCurveTo(62, 28, 90, 24); g.quadraticCurveTo(118, 28, 123, 60);
        g.lineTo(118, 64); g.lineTo(62, 64); g.closePath(); g.fill();
        g.fillStyle = '#2b3029';
        g.beginPath(); g.ellipse(90, 61, 35, 8, 0, 0, TAU); g.fill();
        g.fillStyle = '#20241f'; g.fillRect(64, 58, 52, 4);
        // 帽徽
        g.fillStyle = '#a68a56'; g.beginPath(); g.arc(90, 46, 3.2, 0, TAU); g.fill();
        g.fillStyle = '#7e2c24'; g.beginPath(); g.arc(90, 46, 1.4, 0, TAU); g.fill();
      } else if (conf.cap === 'cloth') {
        g.fillStyle = '#4a4a3e';
        g.beginPath(); g.moveTo(56, 63); g.quadraticCurveTo(64, 36, 90, 33); g.quadraticCurveTo(116, 36, 124, 63); g.lineTo(117, 67); g.lineTo(63, 67); g.closePath(); g.fill();
        g.fillStyle = '#3b3b31'; g.beginPath(); g.ellipse(90, 64, 36, 7, 0, 0, TAU); g.fill();
      }
      // 眉毛
      g.strokeStyle = 'rgba(38,25,17,.8)'; g.lineWidth = conf.brow === 'thick' ? 3.2 : 2;
      g.beginPath(); g.moveTo(69, 83); g.lineTo(84, 80); g.stroke();
      g.beginPath(); g.moveTo(111, 83); g.lineTo(96, 80); g.stroke();
      // 眼睛
      g.fillStyle = 'rgba(28,20,15,.9)';
      g.beginPath(); g.ellipse(77, 91, 4.2, 2.2, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(103, 91, 4.2, 2.2, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,245,225,.5)';
      g.beginPath(); g.arc(78, 90.4, .9, 0, TAU); g.fill();
      g.beginPath(); g.arc(104, 90.4, .9, 0, TAU); g.fill();
      // 眼镜
      if (conf.glasses) {
        g.strokeStyle = 'rgba(30,25,20,.75)'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(77, 91, 9, 0, TAU); g.stroke();
        g.beginPath(); g.arc(103, 91, 9, 0, TAU); g.stroke();
        g.beginPath(); g.moveTo(86, 91); g.lineTo(94, 91); g.stroke();
        g.beginPath(); g.moveTo(68, 89); g.lineTo(58, 87); g.stroke();
        g.beginPath(); g.moveTo(112, 89); g.lineTo(122, 87); g.stroke();
        g.fillStyle = 'rgba(200,220,220,.05)';
        g.beginPath(); g.arc(77, 91, 8, 0, TAU); g.fill();
        g.beginPath(); g.arc(103, 91, 8, 0, TAU); g.fill();
      }
      // 鼻子
      g.strokeStyle = 'rgba(92,54,36,.45)'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(91, 94); g.lineTo(89, 107); g.quadraticCurveTo(92, 110, 96, 107); g.stroke();
      // 嘴
      g.strokeStyle = 'rgba(80,40,30,.65)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(81, 118); g.quadraticCurveTo(90, 122, 100, 118); g.stroke();
      // 胡须
      if (conf.mustache) {
        g.strokeStyle = 'rgba(34,26,20,.75)'; g.lineWidth = 3.2;
        g.beginPath(); g.moveTo(76, 112); g.quadraticCurveTo(90, 117, 104, 112); g.stroke();
        g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(90, 115); g.lineTo(90, 124); g.stroke();
      }
      if (conf.stubble) {
        g.fillStyle = 'rgba(35,28,22,.22)';
        for (let i = 0; i < 48; i++) {
          const x = 68 + Math.random() * 44, y = 112 + Math.random() * 28;
          g.fillRect(x, y, 1.2, 1.2);
        }
      }
      if (conf.scar) {
        g.strokeStyle = 'rgba(110,55,42,.5)'; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(113, 80); g.lineTo(120, 101); g.stroke();
      }
      if (conf.strong) {
        g.strokeStyle = 'rgba(60,35,25,.25)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(63, 105); g.quadraticCurveTo(58, 118, 64, 128); g.stroke();
      }
      if (conf.worn) {
        g.strokeStyle = 'rgba(50,35,28,.3)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(67, 72); g.lineTo(74, 76); g.stroke();
        g.beginPath(); g.moveTo(108, 76); g.lineTo(117, 72); g.stroke();
      }
      g.restore();
      // 红色印章
      g.fillStyle = 'rgba(158,48,38,.78)';
      g.fillRect(144, 20, 19, 19);
      g.strokeStyle = 'rgba(255,240,220,.2)'; g.lineWidth = 1; g.strokeRect(146, 22, 15, 15);
      textOn(g, '廿九', 153.5, 30, 5.5, 'rgba(240,220,190,.8)', 'center', '"KaiTi",serif');
    }

    // 颗粒
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * .11})`;
      g.fillRect(Math.random() * W, Math.random() * H, rand(1, 2), rand(1, 2));
    }
    const vg = g.createRadialGradient(90, 92, 30, 90, 105, 120);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.55)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    return c.toDataURL('image/png');
  }

  function buildPortraits() {
    ['narrator', 'xiaoman', 'wanglengzhai', 'jinzhenzhong', 'jixingwen', 'hejifeng', 'tonglinge', 'zhaodengyu', 'songzheyuan', 'laozhao', 'zhangzizhong'].forEach(k => {
      PORTRAITS[k] = paintPortrait(k);
    });
    // 剧情里使用短肖像键
    PORTRAITS.wang = PORTRAITS.wanglengzhai;
    PORTRAITS.jin = PORTRAITS.jinzhenzhong;
    PORTRAITS.ji = PORTRAITS.jixingwen;
    PORTRAITS.he = PORTRAITS.hejifeng;
    PORTRAITS.tong = PORTRAITS.tonglinge;
    PORTRAITS.zhao = PORTRAITS.zhaodengyu;
    PORTRAITS.song = PORTRAITS.songzheyuan;
  }

  /* ---------------- 音效 ---------------- */
  const Audio = {
    ctx: null, master: null, muted: false, noise: null,
    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain();
      this.master.gain.value = .55;
      this.master.connect(c.destination);
      const len = Math.floor(c.sampleRate * 2.2);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      // 夜风
      const wind = c.createBufferSource(); wind.buffer = buf; wind.loop = true;
      const wf = c.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 320; wf.Q.value = .6;
      const wg = c.createGain(); wg.gain.value = .028;
      wind.connect(wf); wf.connect(wg); wg.connect(this.master); wind.start();
      // 雨
      const rain = c.createBufferSource(); rain.buffer = buf; rain.loop = true;
      const rf = c.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 1500;
      const rg = c.createGain(); rg.gain.value = .008;
      rain.connect(rf); rf.connect(rg); rg.connect(this.master); rain.start();
    },
    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
    t() { return this.ctx ? this.ctx.currentTime : 0; },
    n() { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; return s; },
    shot() {
      if (!this.ctx) return;
      const t = this.t(), n = this.n();
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3800, t); f.frequency.exponentialRampToValueAtTime(420, t + .24);
      n.connect(f);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(.55, t); g.gain.exponentialRampToValueAtTime(.001, t + .28);
      f.connect(g); g.connect(this.master); n.start(t); n.stop(t + .3);
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + .18);
      const og = this.ctx.createGain(); og.gain.setValueAtTime(.35, t); og.gain.exponentialRampToValueAtTime(.001, t + .22);
      o.connect(og); og.connect(this.master); o.start(t); o.stop(t + .24);
    },
    enemyShot(dist) {
      if (!this.ctx) return;
      const t = this.t(), n = this.n(), v = clamp(1 - (dist || 200) / 900, .08, .4);
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1700;
      n.connect(f);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + .18);
      f.connect(g); g.connect(this.master); n.start(t); n.stop(t + .2);
    },
    mg() {
      if (!this.ctx) return;
      const t = this.t(), n = this.n();
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = .8;
      n.connect(f);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(.18, t); g.gain.exponentialRampToValueAtTime(.001, t + .09);
      f.connect(g); g.connect(this.master); n.start(t); n.stop(t + .1);
    },
    melee() {
      if (!this.ctx) return;
      const t = this.t(), n = this.n();
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(2400, t + .18); f.Q.value = 1.2;
      n.connect(f);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(.24, t); g.gain.exponentialRampToValueAtTime(.001, t + .2);
      f.connect(g); g.connect(this.master); n.start(t); n.stop(t + .22);
    },
    hit(kill) {
      if (!this.ctx) return;
      const t = this.t(), o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(kill ? 700 : 1150, t); o.frequency.exponentialRampToValueAtTime(kill ? 280 : 850, t + .08);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(.09, t); g.gain.exponentialRampToValueAtTime(.001, t + .1);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + .11);
    },
    hurt() {
      if (!this.ctx) return;
      const t = this.t(), n = this.n();
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 280; n.connect(f);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(.3, t); g.gain.exponentialRampToValueAtTime(.001, t + .26);
      f.connect(g); g.connect(this.master); n.start(t); n.stop(t + .28);
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + .22);
      const og = this.ctx.createGain(); og.gain.setValueAtTime(.18, t); og.gain.exponentialRampToValueAtTime(.001, t + .24);
      o.connect(og); og.connect(this.master); o.start(t); o.stop(t + .25);
    },
    reload() {
      if (!this.ctx) return;
      [0, .32, .9, 1.45].forEach((d, i) => {
        const t = this.t() + d, n = this.n();
        const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 950 + i * 500; f.Q.value = 3;
        n.connect(f);
        const g = this.ctx.createGain(); g.gain.setValueAtTime(.1, t); g.gain.exponentialRampToValueAtTime(.001, t + .05);
        f.connect(g); g.connect(this.master); n.start(t); n.stop(t + .07);
      });
    },
    click() {
      if (!this.ctx) return;
      const t = this.t(), o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 560;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(.035, t); g.gain.exponentialRampToValueAtTime(.001, t + .06);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + .07);
    },
    explosion(distant) {
      if (!this.ctx) return;
      const t = this.t(), n = this.n();
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = distant ? 170 : 420;
      n.connect(f);
      const g = this.ctx.createGain(); const peak = distant ? .08 : .28;
      g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(.001, t + (distant ? 1.4 : .8));
      f.connect(g); g.connect(this.master); n.start(t); n.stop(t + (distant ? 1.5 : .9));
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(distant ? 48 : 75, t); o.frequency.exponentialRampToValueAtTime(26, t + 1);
      const og = this.ctx.createGain(); og.gain.setValueAtTime(distant ? .1 : .3, t); og.gain.exponentialRampToValueAtTime(.001, t + 1.1);
      o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 1.1);
    },
    radio() {
      if (!this.ctx) return;
      const t = this.t(), n = this.n();
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = .9;
      n.connect(f);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(.04, t); g.gain.exponentialRampToValueAtTime(.001, t + .16);
      f.connect(g); g.connect(this.master); n.start(t); n.stop(t + .18);
    },
    pickup() {
      if (!this.ctx) return;
      [660, 880].forEach((f, i) => {
        const t = this.t() + i * .08, o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = this.ctx.createGain(); g.gain.setValueAtTime(.045, t); g.gain.exponentialRampToValueAtTime(.001, t + .1);
        o.connect(g); g.connect(this.master); o.start(t); o.stop(t + .11);
      });
    },
    stinger(win) {
      if (!this.ctx) return;
      const notes = win ? [220, 277, 330, 440] : [196, 175, 147, 110];
      notes.forEach((f, i) => {
        const t = this.t() + i * (win ? .42 : .5), o = this.ctx.createOscillator(); o.type = win ? 'sine' : 'triangle'; o.frequency.value = f;
        const g = this.ctx.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.1, t + .06); g.gain.exponentialRampToValueAtTime(.001, t + 1.1);
        o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1.2);
      });
    }
  };
  function sfx(name, arg) { if (Audio[name]) Audio[name](arg); }

  /* ---------------- 存档 ---------------- */
  function loadSave() {
    try {
      const v = parseInt(localStorage.getItem('lq1937_2d_save') || '0', 10);
      S.save = isNaN(v) ? 0 : clamp(v, 0, 3);
    } catch (e) { S.save = 0; }
  }
  function writeSave(v) {
    S.save = Math.max(S.save, clamp(v, 0, 3));
    try { localStorage.setItem('lq1937_2d_save', String(S.save)); } catch (e) { }
  }
  function resetSave() {
    S.save = 0;
    try { localStorage.setItem('lq1937_2d_save', '0'); } catch (e) { }
  }

  /* ---------------- UI 基础 ---------------- */
  function accuracyOf(killsShots) {
    const sh = killsShots ? killsShots.shots : S.shots;
    const hi = killsShots ? killsShots.hits : S.hits;
    return sh > 0 ? Math.round(hi / sh * 100) : 0;
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  function setKeyFigure(key) {
    const alias = { jin: 'jinzhenzhong', ji: 'jixingwen', wang: 'wanglengzhai', he: 'hejifeng', tong: 'tonglinge', zhao: 'zhaodengyu', song: 'songzheyuan' };
    key = alias[key] || key;
    const c = DATA.characters[key];
    if (!c) return;
    UI.mpPortrait.src = PORTRAITS[c.portrait] || PORTRAITS.narrator;
    UI.mpFigureName.textContent = c.name;
    UI.mpFigureRole.textContent = c.role;
    UI.mpFigureQuote.textContent = c.quote ? '“' + c.quote + '”' : '';
    UI.mpFigureName.dataset.key = key;
  }
  function setChapterUI(ch) {
    UI.mpChapterNo.textContent = ch.no;
    UI.mpChapterTitle.textContent = ch.title;
    UI.mpDate.textContent = ch.date;
    UI.mpLocation.textContent = ch.location;
    UI.mpTime.textContent = ch.time;
    UI.mpMission.textContent = ch.mission;
    UI.mpMissionDesc.textContent = ch.desc;
    UI.stChapter.textContent = ch.no + ' · ' + ch.short;
    UI.stDate.textContent = ch.date + ' ' + ch.time;
    UI.stObjective.textContent = ch.mission;
    UI.mpLive.textContent = '待命';
    UI.mpLive.style.color = '';
    UI.mpAvatar.src = PORTRAITS.xiaoman;
  }
  function setObjectives(list, bar) {
    S.objectives = list;
    S.bar = bar || null;
    S.objSig = '';
    S.barCache = {};
    renderObjectives();
  }
  function updateBarUI() {
    const h = S.barCache || (S.barCache = {});
    if (S.bar) {
      const pct = clamp((S.bar.value / S.bar.max) * 100, 0, 100);
      if (h.visible !== true) { UI.mpBarWrap.classList.remove('hidden'); h.visible = true; }
      if (h.label !== S.bar.label) { h.label = S.bar.label; UI.mpBarLabel.textContent = S.bar.label; }
      if (h.pct !== Math.round(pct)) {
        h.pct = Math.round(pct);
        UI.mpBarValue.textContent = h.pct + '%';
        UI.mpBarFill.style.width = pct + '%';
        UI.mpBarWrap.classList.toggle('low', pct < 30);
      }
    } else if (h.visible !== false) {
      h.visible = false;
      UI.mpBarWrap.classList.add('hidden');
    }
  }
  function renderObjectives() {
    const ul = UI.mpObjectiveList;
    ul.innerHTML = '';
    S.objectives.forEach(o => {
      const li = document.createElement('li');
      if (o.done) li.className = 'done';
      const mark = document.createElement('i'); mark.className = 'ob-mark';
      const text = document.createElement('span'); text.className = 'ob-text'; text.textContent = o.text;
      const prog = document.createElement('b'); prog.className = 'ob-prog'; prog.textContent = o.prog || '';
      li.appendChild(mark); li.appendChild(text); li.appendChild(prog);
      ul.appendChild(li);
    });
    S.objSig = S.objectives.map(o => (o.id || '') + ':' + (o.prog || '') + ':' + (o.done ? 1 : 0)).join('|');
    updateBarUI();
  }
  function buildPips() {
    UI.mpAmmoPips.innerHTML = '';
    for (let i = 0; i < 5; i++) UI.mpAmmoPips.appendChild(document.createElement('i'));
  }
  function updateHUD() {
    if (!S.player) return;
    const p = S.player;
    const h = S.hudCache || (S.hudCache = {});
    const hp = Math.ceil(p.hp);
    const hpKey = hp + '/' + p.maxHp;
    if (h.hpKey !== hpKey) {
      h.hpKey = hpKey;
      const hpPct = clamp(p.hp / p.maxHp * 100, 0, 100);
      UI.mpHealthFill.style.width = hpPct + '%';
      UI.mpHealthNum.textContent = hp;
    }
    const low = p.hp / p.maxHp < .3;
    if (h.low !== low) {
      h.low = low;
      UI.mpHealthFill.style.background = low
        ? 'linear-gradient(90deg,#7b1f19,#c43628)'
        : 'linear-gradient(90deg,#8e2c24,#cf4d39 60%,#d5a164)';
      UI.crosshair.classList.toggle('low', low);
    }
    if (h.clip !== p.clip || h.reserve !== p.reserve) {
      h.clip = p.clip; h.reserve = p.reserve;
      UI.mpAmmo.textContent = p.clip + ' / ' + p.reserve;
      UI.mpAmmo.style.color = p.clip === 0 ? 'rgba(208,102,80,.9)' : '';
      for (let i = 0; i < 5; i++) {
        const pip = UI.mpAmmoPips.children[i];
        if (pip) pip.className = i < p.clip ? '' : 'empty';
      }
    }
    const meleePct = p.meleeCd > 0 ? clamp(1 - p.meleeCd / p.meleeMax, 0, 1) * 100 : 100;
    if (Math.abs((h.meleePct || -1) - meleePct) > .6) {
      h.meleePct = meleePct;
      UI.mpMeleeFill.style.width = meleePct + '%';
    }
    const meleeText = p.meleeCd > 0 ? p.meleeCd.toFixed(1) + 's' : '就绪';
    if (h.meleeText !== meleeText) {
      h.meleeText = meleeText;
      UI.mpMeleeText.textContent = meleeText;
    }
    const ws = S.chapterState || {};
    let waveText;
    if (S.chapter === 0) waveText = '第 ' + ['一', '二', '三'][clamp((ws.wave || 1) - 1, 0, 2)] + ' 波';
    else if (S.chapter === 1) waveText = '铁路桥';
    else waveText = '南苑';
    if (h.waveText !== waveText) {
      h.waveText = waveText;
      UI.stWave.textContent = waveText;
    }
    const objText = S.objectives[0] ? S.objectives[0].text : '';
    if (h.objText !== objText) {
      h.objText = objText;
      UI.stObjective.textContent = objText;
    }
    const live = S.mode === 'playing' ? '战斗中' : '待命';
    const liveColor = live === '战斗中' ? 'rgba(194,74,56,.9)' : '';
    if (UI.mpLive.textContent !== live) UI.mpLive.textContent = live;
    if (UI.mpLive.style.color !== liveColor) UI.mpLive.style.color = liveColor;
    if (h.reloading !== p.reloading) {
      h.reloading = p.reloading;
      UI.crosshair.classList.toggle('reloading', p.reloading);
    }
  }
  function toggleUI(show, ids) {
    ids.forEach(id => { const el = $(id); if (el) el.classList.toggle('hidden', !show); });
  }
  let bannerTimer = 0;
  function showBanner(title, sub, kicker) {
    UI.wbKicker.textContent = kicker || '卢沟桥 · 守桥记';
    UI.wbTitle.textContent = title;
    UI.wbSub.textContent = sub || '';
    UI.waveBanner.classList.remove('show');
    void UI.waveBanner.offsetWidth;
    UI.waveBanner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => UI.waveBanner.classList.remove('show'), 3300);
  }
  let radioTimer = 0;
  function showRadio(who, text) {
    const c = DATA.characters[who];
    UI.radioName.textContent = c ? c.name : who;
    UI.radioText.textContent = text;
    UI.radioLine.classList.add('show');
    clearTimeout(radioTimer);
    radioTimer = setTimeout(() => UI.radioLine.classList.remove('show'), 3600);
    sfx('radio');
  }
  function showPrompt(text, key) {
    if (!text) {
      if (S.promptCache !== null) {
        S.promptCache = null;
        UI.prompt.classList.add('hidden');
        S.promptVisible = false;
      }
      return;
    }
    const k = key || 'E';
    const sig = k + '|' + text;
    if (S.promptCache === sig) return;
    S.promptCache = sig;
    const kb = UI.prompt.querySelector('kbd');
    if (kb) kb.textContent = k;
    UI.promptText.textContent = text;
    UI.prompt.classList.remove('hidden');
    S.promptVisible = true;
  }
  let toastTimer = 0;
  function showToast(text) {
    UI.toast.textContent = text;
    UI.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => UI.toast.classList.remove('show'), 2300);
  }
  function showHitmarker(kill) {
    if (S.crosshairClient) {
      UI.hitmarker.style.left = S.crosshairClient.x + 'px';
      UI.hitmarker.style.top = S.crosshairClient.y + 'px';
    }
    UI.hitmarker.classList.remove('show', 'kill');
    void UI.hitmarker.offsetWidth;
    UI.hitmarker.classList.add('show');
    if (kill) UI.hitmarker.classList.add('kill');
  }
  function flashScreen() {
    UI.flashVignette.classList.remove('show');
    void UI.flashVignette.offsetWidth;
    UI.flashVignette.classList.add('show');
  }
  function setPlayingUI(on) {
    UI.crosshair.classList.toggle('hidden', !on);
    UI.controlsHint.classList.toggle('hidden', !on);
    if (!on) showPrompt(null);
  }

  /* ---------------- 菜单 ---------------- */
  function setDifficulty(key) {
    S.diffKey = key || 'normal';
    S.diff = DIFFS[S.diffKey] || DIFFS.normal;
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.toggle('active', b.dataset.diff === S.diffKey));
  }
  function updateMenu() {
    const ch = DATA.chapters[S.menuChapter] || DATA.chapters[0];
    const continuing = S.save > 0 && S.save < 3 && S.menuChapter === S.save;
    UI.menuStartText.textContent = continuing ? '继续 · ' + ch.no : '开始 · ' + ch.no;
    UI.menuRestart.classList.toggle('hidden', S.save <= 0);
    document.querySelectorAll('.chapter-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.chapter, 10) === S.menuChapter);
    });
    setDifficulty(S.diffKey);
  }
  function showMenu() {
    S.mode = 'menu';
    S.player = null;
    S.enemies = []; S.allies = []; S.bullets = []; S.particles = []; S.explosions = []; S.casings = []; S.mortars = [];
    S.dialogue = null;
    S.completing = false;
    S.camX = 0;
    S.level = null;
    S.levelCache = null;
    S.obstacleCache = null;
    S.flag = null;
    S.supply = null;
    S.exit = null;
    S.fires = [];
    S.objectives = [];
    S.bar = null;
    S.codexReturn = null;
    UI.radioLine.classList.remove('show');
    UI.waveBanner.classList.remove('show');
    UI.prompt.classList.add('hidden');
    UI.app.classList.remove('in-game', 'paused', 'dialogue-mode', 'card-mode');
    UI.app.classList.add('menu-mode');
    UI.menu.classList.remove('hidden');
    UI.chapterCard.classList.add('hidden');
    UI.chapterEnd.classList.add('hidden');
    UI.gameOver.classList.add('hidden');
    UI.finalScreen.classList.add('hidden');
    UI.pause.classList.add('hidden');
    UI.dialogue.classList.add('hidden');
    UI.codex.classList.add('hidden');
    setPlayingUI(false);
    UI.stage.style.cursor = '';
    S.menuChapter = S.save < 3 ? S.save : 0;
    updateMenu();
    resize();
    setTimeout(resize, 360);
  }
  function openMenuCodex(tab) {
    openCodex(tab || 'timeline');
  }

  /* ---------------- 章节流程 ---------------- */
  function clearWorld() {
    S.enemies = []; S.allies = []; S.bullets = []; S.casings = []; S.particles = [];
    S.explosions = []; S.mortars = []; S.warnings = []; S.civilians = []; S.pickups = [];
    S.flashes = []; S.slashes = [];
    S.fires = []; S.supply = null; S.flag = null; S.exit = null;
    S.objectives = []; S.bar = null; S.completing = false;
  }
  function startChapter(index, opts) {
    opts = opts || {};
    index = clamp(index, 0, DATA.chapters.length - 1);
    if (S.mode === 'menu') {
      S.campaign = { kills: 0, shots: 0, hits: 0, time: 0, chapters: 0 };
    }
    S.chapter = index;
    S.diff = DIFFS[S.diffKey] || DIFFS.normal;
    S.kills = 0; S.shots = 0; S.hits = 0; S.playTime = 0;
    S.accum = 0;
    S.camX = 0; S.camTarget = 0;
    S.chapterState = {};
    S.completing = false;
    S.mortars = [];
    clearWorld();
    S.levelCache = null;
    S.obstacleCache = null;
    S.hudCache = {};
    S.objSig = '';
    S.promptCache = null;
    S.level = makeLevel(index);
    S.player = makePlayer(S.level.start);
    S.level.obstacles = [];
    S.level.fires = [];
    S.level.allies = [];
    setupLevel(index);
    S.fires = S.level.fires || [];
    buildLevelCaches();
    S.camX = clamp(S.player.x - VW * .35, 0, Math.max(0, S.level.width - VW));
    writeSave(index);
    UI.menu.classList.add('hidden');
    UI.app.classList.remove('menu-mode', 'dialogue-mode', 'paused', 'card-mode');
    UI.app.classList.add('in-game');
    UI.chapterEnd.classList.add('hidden');
    UI.gameOver.classList.add('hidden');
    UI.finalScreen.classList.add('hidden');
    UI.pause.classList.add('hidden');
    UI.dialogue.classList.add('hidden');
    UI.codex.classList.add('hidden');
    setPlayingUI(false);
    setChapterUI(DATA.chapters[index]);
    setKeyFigure(DATA.chapters[index].key);
    setObjectivesForChapter(index);
    UI.mpAmmoPips.innerHTML = '';
    buildPips();
    updateHUD();
    resize();
    setTimeout(resize, 360);
    if (opts.skipIntro) {
      UI.chapterCard.classList.add('hidden');
      beginPlay();
    } else {
      showChapterCard();
    }
  }
  function showChapterCard() {
    const ch = DATA.chapters[S.chapter];
    S.mode = 'chapterCard';
    UI.app.classList.add('card-mode');
    UI.app.classList.remove('dialogue-mode', 'paused');
    UI.chapterCard.classList.remove('hidden');
    UI.dialogue.classList.add('hidden');
    UI.ccKicker.textContent = ch.no + ' · ' + ch.date;
    UI.ccTitle.textContent = ch.title;
    UI.ccDate.textContent = ch.location + ' · ' + ch.time;
    UI.ccQuote.textContent = '“' + ch.cardQuote + '”';
    UI.ccSource.textContent = '—— ' + ch.cardSource;
    UI.ccBtn.querySelector('span').textContent = '进入战场';
    setPlayingUI(false);
    UI.stage.style.cursor = 'default';
    S.cardOpen = true;
  }
  function advanceCard() {
    if (S.mode !== 'chapterCard') return;
    S.cardOpen = false;
    UI.chapterCard.classList.add('hidden');
    UI.app.classList.remove('card-mode');
    const intro = DATA.chapters[S.chapter].intro;
    if (intro && intro.length) playDialogue(intro, beginPlay);
    else beginPlay();
  }
  function beginPlay() {
    S.mode = 'playing';
    S.cardOpen = false;
    UI.app.classList.remove('card-mode', 'dialogue-mode', 'paused');
    UI.app.classList.add('in-game');
    UI.chapterCard.classList.add('hidden');
    UI.dialogue.classList.add('hidden');
    setPlayingUI(true);
    showPrompt(null);
    setKeyFigure(DATA.chapters[S.chapter].key);
    UI.mpLive.textContent = '战斗中';
    S.playTime = 0;
    S.startDelay = 1.2;
    S.uiTimer = 0;
    UI.stage.style.cursor = '';
    if (S.chapter === 0) {
      showRadio('jinzhenzhong', '敌人上来了！进入阵地，没有命令不许退！');
      S.chapterState.startTimer = 1.4;
    } else if (S.chapter === 1) {
      showRadio('hejifeng', '向铁路桥推进！先打掉机枪巢，再升旗！');
      S.chapterState.startTimer = .8;
    } else {
      showRadio('tonglinge', '日军开始总攻。守住通道，让学兵团先撤！');
      S.chapterState.startTimer = 1.2;
    }
    updateHUD();
  }
  function playDialogue(lines, onDone) {
    if (!lines || !lines.length) { if (onDone) onDone(); return; }
    S.mode = 'dialogue';
    S.dialogue = { lines, index: 0, onDone, chars: 0, timer: 0, typing: true, full: '' };
    UI.mpLive.textContent = '过场';
    UI.app.classList.remove('card-mode', 'paused');
    UI.app.classList.add('dialogue-mode');
    UI.dialogue.classList.remove('hidden');
    UI.chapterCard.classList.add('hidden');
    setPlayingUI(false);
    UI.stage.style.cursor = 'default';
    showDialogueLine();
  }
  function showDialogueLine() {
    const d = S.dialogue;
    if (!d) return;
    const line = d.lines[d.index];
    const c = DATA.characters[line.who] || DATA.characters.narrator;
    UI.dlgName.textContent = c.name;
    UI.dlgRole.textContent = c.role;
    UI.dlgPortrait.src = PORTRAITS[c.portrait] || PORTRAITS.narrator;
    UI.dlgText.textContent = '';
    d.full = line.text;
    d.chars = 0;
    d.timer = 0;
    d.typing = true;
    if (c.portrait !== 'narrator') setKeyFigure(line.who);
  }
  function updateDialogue(dt) {
    const d = S.dialogue;
    if (!d) return;
    if (d.typing) {
      d.timer += dt;
      const speed = 42;
      const n = Math.floor(d.timer * speed);
      if (n > d.chars) {
        d.chars = Math.min(d.full.length, n);
        UI.dlgText.textContent = d.full.slice(0, d.chars);
      }
      if (d.chars >= d.full.length) d.typing = false;
    }
  }
  function advanceDialogue() {
    const d = S.dialogue;
    if (!d) return;
    if (d.typing) {
      d.typing = false;
      d.chars = d.full.length;
      UI.dlgText.textContent = d.full;
      return;
    }
    d.index++;
    if (d.index >= d.lines.length) {
      const done = d.onDone;
      S.dialogue = null;
      UI.dialogue.classList.add('hidden');
      UI.app.classList.remove('dialogue-mode');
      if (done) done();
      return;
    }
    showDialogueLine();
  }
  function addCampaignStats() {
    S.campaign.kills += S.kills;
    S.campaign.shots += S.shots;
    S.campaign.hits += S.hits;
    S.campaign.time += S.playTime;
    S.campaign.chapters++;
  }
  function completeChapter() {
    if (S.completing || S.mode !== 'playing') return;
    S.completing = true;
    setPlayingUI(false);
    showPrompt(null);
    S.mode = 'dialogue';
    UI.app.classList.add('dialogue-mode');
    const ch = DATA.chapters[S.chapter];
    playDialogue(ch.outro, () => {
      addCampaignStats();
      if (S.chapter >= 2) showFinal();
      else showChapterEnd();
    });
  }
  function showChapterEnd() {
    S.mode = 'chapterEnd';
    UI.mpLive.textContent = '结束';
    UI.app.classList.add('card-mode');
    UI.app.classList.remove('dialogue-mode');
    UI.chapterEnd.classList.remove('hidden');
    UI.ceKicker.textContent = DATA.chapters[S.chapter].no + ' · 任务完成';
    UI.ceTitle.textContent = S.chapter === 0 ? '桥还在我们手里' : '铁路桥，夺回来了';
    UI.ceText.textContent = S.chapter === 0
      ? '拂晓的枪声渐渐稀落。卢沟桥仍在中国守军手中，宛平城没有失守。'
      : '大刀队把军旗插上铁路桥。永定河两岸，枪声仍未停歇。';
    UI.ceStats.innerHTML = `
      <div><strong>${S.kills}</strong><span>击毙</span></div>
      <div><strong>${accuracyOf()}&nbsp;%</strong><span>命中率</span></div>
      <div><strong>${fmtTime(S.playTime)}</strong><span>战斗时间</span></div>`;
    UI.ceNext.querySelector('span').textContent = '进入' + DATA.chapters[S.chapter + 1].no;
    UI.ceNext.onclick = () => startChapter(S.chapter + 1);
    setPlayingUI(false);
    sfx('stinger', true);
  }
  function showFinal() {
    S.mode = 'victory';
    UI.mpLive.textContent = '结束';
    writeSave(3);
    UI.app.classList.add('card-mode');
    UI.app.classList.remove('dialogue-mode');
    UI.finalScreen.classList.remove('hidden');
    UI.finalStats.innerHTML = `
      <div><strong>${S.campaign.kills}</strong><span>击毙</span></div>
      <div><strong>${accuracyOf(S.campaign)}&nbsp;%</strong><span>总命中率</span></div>
      <div><strong>${fmtTime(S.campaign.time)}</strong><span>战斗时间</span></div>
      <div><strong>${S.campaign.chapters}</strong><span>完成章节</span></div>`;
    setPlayingUI(false);
    sfx('stinger', true);
  }
  function failChapter(reason) {
    if (S.mode === 'gameOver' || S.mode === 'victory') return;
    S.mode = 'gameOver';
    UI.mpLive.textContent = '结束';
    S.completing = true;
    UI.app.classList.add('card-mode');
    UI.app.classList.remove('dialogue-mode', 'paused');
    UI.gameOver.classList.remove('hidden');
    UI.goTitle.textContent = S.chapter === 2 ? '南苑失守' : '阵地失守';
    UI.goReason.textContent = reason || '你倒在了阵地上。但桥还在，战斗还没有结束。';
    UI.goStats.innerHTML = `
      <div><strong>${S.kills}</strong><span>击毙</span></div>
      <div><strong>${accuracyOf()}&nbsp;%</strong><span>命中率</span></div>
      <div><strong>${fmtTime(S.playTime)}</strong><span>坚持时间</span></div>`;
    setPlayingUI(false);
    sfx('stinger', false);
  }
  function pauseGame() {
    if (S.mode !== 'playing') return;
    S.mode = 'paused';
    UI.mpLive.textContent = '暂停';
    UI.app.classList.add('paused');
    UI.pause.classList.remove('hidden');
    UI.pauseKills.textContent = S.kills;
    UI.pauseWave.textContent = S.chapter === 0 ? (S.chapterState.wave || 1) : S.chapter + 1;
    UI.pauseAccuracy.textContent = accuracyOf() + '%';
    setPlayingUI(false);
    UI.stage.style.cursor = 'default';
  }
  function resumeGame() {
    if (S.mode !== 'paused') return;
    UI.pause.classList.add('hidden');
    UI.app.classList.remove('paused');
    S.mode = 'playing';
    setPlayingUI(true);
    UI.stage.style.cursor = '';
  }
  function returnToMenuFromGame() {
    UI.pause.classList.add('hidden');
    UI.gameOver.classList.add('hidden');
    UI.chapterEnd.classList.add('hidden');
    UI.finalScreen.classList.add('hidden');
    UI.dialogue.classList.add('hidden');
    showMenu();
  }
  function restartChapter() {
    UI.pause.classList.add('hidden');
    UI.gameOver.classList.add('hidden');
    UI.chapterEnd.classList.add('hidden');
    startChapter(S.chapter, { skipIntro: true });
  }

  /* ---------------- 关卡数据 ---------------- */
  function makeLevel(index) {
    const defs = [
      { type: 'stone', width: 1900, start: 360 },
      { type: 'rail', width: 3020, start: 220 },
      { type: 'earth', width: 1900, start: 560 }
    ];
    const d = defs[index];
    return {
      chapter: index,
      type: d.type,
      width: d.width,
      start: d.start,
      ground: GROUND,
      minX: 70,
      maxX: d.width - 70,
      obstacles: [],
      fires: [],
      allies: []
    };
  }
  function makePlayer(x) {
    return {
      x, y: GROUND, vy: 0, vx: 0,
      facing: 1, aim: 0, crouch: false, sprint: false, moving: false,
      walk: 0, bob: 0, onGround: true,
      hp: S.diff.hp, maxHp: S.diff.hp,
      clip: 5, clipSize: 5, reserve: 40 + S.diff.ammo,
      reloading: false, reloadT: 0, reloadMax: 2.0,
      bolt: 0, autoReload: 0, meleeCd: 0, meleeMax: 1.05, meleeT: 0,
      muzzle: 0, hitFlash: 0, invuln: 0, alive: true,
      supplyUsed: false, lastDamage: -99, footsteps: 0
    };
  }
  function addObstacle(x, w, h, type) {
    const o = { x, y: GROUND - h, w, h, type };
    S.level.obstacles.push(o);
    return o;
  }
  function addFire(x, size, kind) {
    S.level.fires.push({ x, size: size || 1, kind: kind || 'fire', phase: rand(0, 20), y: GROUND - 10 });
  }
  function makeAlly(x, hp) {
    return {
      x, y: GROUND, hp: hp || 110, maxHp: hp || 110, alive: true,
      fireCd: rand(.8, 2), aim: 0, muzzle: 0, hitFlash: 0, deathT: 0,
      facing: 1, walk: 0, name: ''
    };
  }
  const ENEMY_DEFS = {
    rifle: { hp: 62, speed: 48, range: 320, fire: 2.35, damage: 8, burst: 1, color: '#55543f' },
    charger: { hp: 76, speed: 132, range: 44, fire: 99, damage: 12, burst: 0, color: '#4b4b3b' },
    mg: { hp: 112, speed: 30, range: 470, fire: 2.8, damage: 5, burst: 4, color: '#4b4a3c' },
    nest: { hp: 260, speed: 0, range: 760, fire: 2.15, damage: 4, burst: 5, color: '#464638' }
  };
  function spawnEnemy(type, x, opts) {
    opts = opts || {};
    const def = ENEMY_DEFS[type] || ENEMY_DEFS.rifle;
    const e = {
      type, x, y: GROUND, hp: def.hp * (type === 'nest' ? 1 : 1), maxHp: def.hp,
      speed: def.speed * S.diff.speed, range: def.range, fire: def.fire, damage: def.damage,
      burst: def.burst, color: def.color,
      state: 'active', alive: true, deathT: 0, hitFlash: 0,
      fireTimer: rand(2.0, 4.0), burstLeft: 0, burstTimer: 0, meleeCd: rand(.6, 1.4),
      aim: 0, wishAim: 0, muzzle: 0, walk: rand(0, TAU), facing: -1,
      nest: type === 'nest', nestId: opts.nestId || 0,
      spawnSmoke: 0, hitBar: 0
    };
    S.enemies.push(e);
    if (e.nest) {
      if (!S.chapterState.nests) S.chapterState.nests = [];
      S.chapterState.nests.push(e);
    }
    spawnSmoke(e.x, GROUND - 20, 60, .7, 'rgba(120,115,100,.25)');
    return e;
  }

  function setupLevel(index) {
    S.level.obstacles = [];
    S.level.fires = [];
    S.level.allies = [];
    S.supply = null;
    S.flag = null;
    S.exit = null;
    const ch = index;

    if (ch === 0) {
      addObstacle(205, 112, 52, 'sandbag');
      addObstacle(470, 52, 42, 'crate');
      addObstacle(520, 118, 50, 'sandbag');
      addObstacle(760, 96, 50, 'sandbag');
      addObstacle(960, 54, 42, 'crate');
      addObstacle(1040, 110, 50, 'sandbag');
      addObstacle(1250, 48, 40, 'crate');
      S.supply = { x: 155, y: GROUND - 34, w: 44, h: 34, used: false };
      addObstacle(S.supply.x, S.supply.w, S.supply.h, 'supply');
      addFire(1540, 1.25, 'fire');
      addFire(1770, .85, 'fire');
      addFire(1860, 1.4, 'fire');
      S.chapterState = {
        wave: 0, waveName: '', state: 'pre', timer: 1.4, gateHP: 100,
        spawner: null, hitsTaken: 0, deathTimer: 0, startTimer: 1.4
      };
      setObjectivesForChapter(0);
    } else if (ch === 1) {
      addObstacle(410, 58, 42, 'crate');
      addObstacle(630, 96, 48, 'sandbag');
      addObstacle(840, 54, 42, 'crate');
      addObstacle(1030, 108, 48, 'sandbag');
      addObstacle(1700, 62, 40, 'crate');
      addObstacle(1880, 108, 48, 'sandbag');
      addObstacle(2340, 58, 42, 'crate');
      S.supply = { x: 160, y: GROUND - 34, w: 44, h: 34, used: false };
      addObstacle(S.supply.x, S.supply.w, S.supply.h, 'supply');
      S.flag = { x: 2660, y: GROUND, planted: false };
      S.chapterState = {
        zones: [
          { at: 360, types: ['rifle', 'rifle'], done: false },
          { at: 720, types: ['rifle', 'charger'], done: false },
          { at: 1080, types: ['rifle', 'rifle'], done: false },
          { at: 1360, types: ['charger', 'rifle'], done: false },
          { at: 1830, types: ['rifle', 'charger', 'rifle'], done: false },
          { at: 2280, types: ['charger', 'rifle'], done: false },
          { at: 2520, types: ['rifle', 'rifle'], done: false }
        ],
        nestsDown: 0, nestTotal: 2, flagPlanted: false, completeTimer: 0, startTimer: .8
      };
      spawnEnemy('nest', 1500, { nestId: 1 });
      spawnEnemy('nest', 2160, { nestId: 2 });
      addFire(1320, 1.2, 'fire');
      addFire(2440, 1.1, 'fire');
      addFire(2810, 1.5, 'fire');
      setObjectivesForChapter(1);
    } else {
      addObstacle(380, 118, 52, 'sandbag');
      addObstacle(600, 58, 42, 'crate');
      addObstacle(680, 96, 48, 'sandbag');
      addObstacle(910, 120, 52, 'sandbag');
      addObstacle(1050, 54, 40, 'crate');
      addObstacle(1160, 100, 52, 'sandbag');
      addObstacle(1420, 180, 60, 'wall');
      S.supply = { x: 470, y: GROUND - 34, w: 44, h: 34, used: false };
      addObstacle(S.supply.x, S.supply.w, S.supply.h, 'supply');
      S.exit = { x: 120, y: GROUND, active: false };
      addFire(1330, 1.4, 'fire');
      addFire(1520, 1.05, 'fire');
      addFire(1660, 1.8, 'fire');
      addFire(840, .7, 'fire');
      S.chapterState = {
        timer: 95, corridor: 100, phase: 'hold', spawnTimer: 4.5, wave: 0,
        mortarTimer: 7, radio60: false, radio30: false, retreatTimer: 0,
        startTimer: 1.2, civilians: []
      };
      setObjectivesForChapter(2);
    }
    S.level.allies = [];
    if (ch === 0) S.allies.push(makeAlly(300, 120), makeAlly(420, 110));
    if (ch === 1) S.allies.push(makeAlly(520, 120));
  }

  function setObjectivesForChapter(i) {
    if (i === 0) {
      S.objectives = [
        { id: 'waves', text: '击退日军三波进攻', prog: '0 / 3', done: false },
        { id: 'gate', text: '守住桥头阵地', prog: '100%', done: false }
      ];
      S.bar = { label: '桥头阵地', value: 100, max: 100 };
    } else if (i === 1) {
      S.objectives = [
        { id: 'advance', text: '向铁路桥推进', prog: '0%', done: false },
        { id: 'nests', text: '摧毁机枪巢', prog: '0 / 2', done: false },
        { id: 'flag', text: '在桥头竖起军旗', prog: '待命', done: false }
      ];
      S.bar = null;
    } else {
      S.objectives = [
        { id: 'hold', text: '坚守南苑至黄昏', prog: '01:35', done: false },
        { id: 'corridor', text: '掩护学兵团撤退', prog: '100%', done: false },
        { id: 'retreat', text: '撤出南苑', prog: '待命', done: false }
      ];
      S.bar = { label: '撤退通道', value: 100, max: 100 };
    }
    renderObjectives();
  }

  /* ---------------- 输入 ---------------- */
  function updateMouse(e) {
    const r = S.canvasRect || UI.canvas.getBoundingClientRect();
    S.mouse.x = clamp((e.clientX - r.left - viewOffX) / viewScale, 0, VW);
    S.mouse.y = clamp((e.clientY - r.top - viewOffY) / viewScale, 0, VH);
    S.crosshairClient = { x: e.clientX - r.left, y: e.clientY - r.top };
    S.mouse.inside = true;
  }
  function updateCrosshair() {
    if (S.mode !== 'playing' || !S.crosshairClient) return;
    const c = S.crosshairClient;
    if (c.x !== S.lastCrossX || c.y !== S.lastCrossY) {
      UI.crosshair.style.transform = 'translate(' + c.x + 'px,' + c.y + 'px) translate(-50%,-50%)';
      S.lastCrossX = c.x;
      S.lastCrossY = c.y;
    }
  }
  function bindInput() {
    UI.canvas.addEventListener('mousemove', updateMouse);
    UI.canvas.addEventListener('mouseleave', () => { S.mouse.inside = false; });
    UI.canvas.addEventListener('contextmenu', e => e.preventDefault());
    UI.canvas.addEventListener('mousedown', e => {
      if (S.mode !== 'playing') return;
      e.preventDefault();
      Audio.init(); Audio.resume();
      if (e.button === 0) shoot();
      else if (e.button === 2) melee();
    });
    window.addEventListener('keydown', e => {
      Audio.init(); Audio.resume();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ControlLeft', 'ControlRight'].includes(e.code)) {
        if (S.mode === 'playing' || S.mode === 'chapterCard' || S.mode === 'dialogue') e.preventDefault();
      }
      S.keys[e.code] = true;
      if (e.code === 'Escape') {
        if (S.mode === 'codex') { closeCodex(); return; }
        if (S.mode === 'paused') { resumeGame(); return; }
        if (S.mode === 'playing') { pauseGame(); return; }
        if (S.mode === 'chapterCard') return;
        return;
      }
      if (e.code === 'Space' || e.code === 'Enter') {
        if (S.mode === 'dialogue') { advanceDialogue(); return; }
        if (S.mode === 'chapterCard') { advanceCard(); return; }
        if (S.mode === 'chapterEnd') { UI.ceNext.click(); return; }
        if (S.mode === 'gameOver') { UI.goRetry.click(); return; }
      }
      if (S.mode === 'playing') {
        if (e.code === 'KeyR') startReload();
        if (e.code === 'KeyF') melee();
        if (e.code === 'KeyE') interact();
      }
    });
    window.addEventListener('keyup', e => { S.keys[e.code] = false; });
    window.addEventListener('blur', () => { S.keys = Object.create(null); });
    document.addEventListener('pointerdown', () => { Audio.init(); Audio.resume(); }, { once: true });

    UI.ccBtn.addEventListener('click', advanceCard);
    UI.chapterCard.addEventListener('click', e => { if (e.target === UI.chapterCard) advanceCard(); });
    UI.dialogue.addEventListener('click', () => advanceDialogue());
    UI.btnResume.addEventListener('click', resumeGame);
    UI.btnRestart.addEventListener('click', restartChapter);
    UI.btnPauseMenu.addEventListener('click', returnToMenuFromGame);
    UI.btnPauseCodex.addEventListener('click', () => openCodex('timeline'));
    UI.ceMenu.addEventListener('click', returnToMenuFromGame);
    UI.goMenu.addEventListener('click', returnToMenuFromGame);
    UI.goRetry.addEventListener('click', restartChapter);
    UI.finalMenu.addEventListener('click', returnToMenuFromGame);
    UI.finalCodex.addEventListener('click', () => openCodex('about'));
    UI.stPause.addEventListener('click', pauseGame);
    UI.panelPause.addEventListener('click', pauseGame);
    UI.stMute.addEventListener('click', toggleMute);
    UI.panelMute.addEventListener('click', toggleMute);
    UI.panelCodex.addEventListener('click', () => openCodex('timeline'));
    UI.menuStart.addEventListener('click', () => startChapter(S.menuChapter));
    UI.menuRestart.addEventListener('click', () => { resetSave(); S.menuChapter = 0; updateMenu(); startChapter(0); });
    document.querySelectorAll('.diff-btn').forEach(b => {
      b.addEventListener('click', () => { setDifficulty(b.dataset.diff); Audio.click(); });
    });
    document.querySelectorAll('.chapter-btn').forEach(b => {
      b.addEventListener('click', () => {
        S.menuChapter = parseInt(b.dataset.chapter, 10);
        updateMenu();
        Audio.click();
      });
    });
    UI.menuCodex.addEventListener('click', () => openCodex('timeline'));
    UI.menuHowto.addEventListener('click', () => openCodex('controls'));
    UI.menuAbout.addEventListener('click', () => openCodex('about'));
    UI.codexClose.addEventListener('click', closeCodex);
    UI.codex.addEventListener('click', e => { if (e.target === UI.codex) closeCodex(); });
    UI.codexTabs.addEventListener('click', e => {
      const b = e.target.closest('button[data-tab]');
      if (!b) return;
      UI.codexTabs.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      renderCodex(b.dataset.tab);
      Audio.click();
    });
  }
  function toggleMute() {
    Audio.init();
    Audio.muted = !Audio.muted;
    if (Audio.master) Audio.master.gain.value = Audio.muted ? 0 : .55;
    showToast(Audio.muted ? '声音已关闭' : '声音已开启');
    UI.stMute.textContent = Audio.muted ? '静音' : '声音';
    UI.panelMute.textContent = Audio.muted ? '静音' : '声音';
  }

  /* ---------------- 玩家动作 ---------------- */
  function shoulderPoint() {
    const p = S.player;
    return {
      x: p.x + p.facing * 8,
      y: p.y - (p.crouch ? 38 : 60)
    };
  }
  function updateAim() {
    const p = S.player;
    const sh = shoulderPoint();
    const sx = sh.x - S.camX;
    const angle = Math.atan2(S.mouse.y - sh.y, S.mouse.x - sx);
    p.aim = angle;
    p.facing = Math.cos(angle) >= 0 ? 1 : -1;
  }
  function muzzlePoint() {
    const p = S.player;
    const sh = shoulderPoint();
    const len = 54;
    return { x: sh.x + Math.cos(p.aim) * len, y: sh.y + Math.sin(p.aim) * len };
  }
  function startReload() {
    const p = S.player;
    if (!p || p.reloading || p.clip >= p.clipSize || p.reserve <= 0) return;
    p.reloading = true;
    p.reloadT = 0;
    p.autoReload = 0;
    sfx('reload');
    showToast('装填中…');
  }
  function shoot() {
    const p = S.player;
    if (!p || !p.alive || S.mode !== 'playing') return;
    if (p.reloading || p.bolt > 0) return;
    if (p.clip <= 0) {
      sfx('click');
      if (p.reserve > 0) startReload();
      return;
    }
    p.clip--;
    p.bolt = .72;
    p.muzzle = .065;
    p.lastShot = 0;
    S.shots++;
    const m = muzzlePoint();
    const spread = (p.crouch ? .008 : p.moving ? .032 : .014) + (p.sprint ? .02 : 0);
    const a = p.aim + rand(-spread, spread);
    S.bullets.push({
      x: m.x, y: m.y, px: m.x, py: m.y,
      vx: Math.cos(a) * 1550, vy: Math.sin(a) * 1550,
      life: 1.2, owner: 'player', damage: 55, color: '#ffe0a0'
    });
    spawnCasing(m.x, m.y, a);
    spawnMuzzle(m.x, m.y, a, 1);
    S.shake = Math.max(S.shake, .13);
    S.flash = Math.max(S.flash, .08);
    sfx('shot');
    if (p.clip <= 0) {
      p.autoReload = .65;
      showToast('弹仓空了 · 按 R 装填');
    }
  }
  function melee() {
    const p = S.player;
    if (!p || !p.alive || S.mode !== 'playing' || p.meleeCd > 0) return;
    p.meleeT = .24;
    p.meleeCd = p.meleeMax;
    p.meleeHit = false;
    const range = S.chapter === 1 ? 128 : 105;
    const dmg = S.chapter === 1 ? 190 : 145;
    const sh = shoulderPoint();
    let hit = false;
    for (const e of S.enemies) {
      if (!e.alive) continue;
      const dx = e.x - sh.x, dy = (e.y - 35) - sh.y;
      const d = Math.hypot(dx, dy);
      if (d > range + (e.nest ? 30 : 0)) continue;
      const ang = Math.atan2(dy, dx);
      let diff = Math.abs(((ang - p.aim + Math.PI * 3) % TAU) - Math.PI);
      if (diff > 1.25) continue;
      damageEnemy(e, dmg, false, true, false);
      hit = true;
    }
    spawnSlash(sh.x, sh.y, p.aim, range);
    S.shake = Math.max(S.shake, .28);
    sfx('melee');
  }
  function interact() {
    const p = S.player;
    if (!p || !p.alive || S.mode !== 'playing') return;
    if (S.supply && !S.supply.used && Math.abs(p.x - (S.supply.x + S.supply.w / 2)) < 76) {
      S.supply.used = true;
      p.hp = Math.min(p.maxHp, p.hp + 40);
      p.reserve = Math.min(90, p.reserve + 14);
      p.supplyUsed = true;
      sfx('pickup');
      showToast('补给完成 · 体力恢复 · 弹药 +14');
      spawnSmoke(S.supply.x + 22, S.supply.y, 28, .6, 'rgba(200,180,120,.3)');
      return;
    }
    if (S.chapter === 1 && S.flag && !S.flag.planted && Math.abs(p.x - S.flag.x) < 100) {
      if (S.chapterState.nestsDown < 2) {
        showToast('先摧毁两座机枪巢');
        return;
      }
      S.flag.planted = true;
      S.chapterState.flagPlanted = true;
      showRadio('hejifeng', '旗插上了！铁路桥，夺回来了！');
      S.chapterState.completeTimer = 2.2;
      sfx('pickup');
      return;
    }
    if (S.chapter === 2 && S.chapterState.phase === 'retreat' && Math.abs(p.x - 120) < 100) {
      completeChapter();
    }
  }
  function reloadUpdate(dt) {
    const p = S.player;
    if (!p) return;
    if (p.reloading) {
      p.reloadT += dt;
      if (p.reloadT >= p.reloadMax) {
        const need = p.clipSize - p.clip;
        const take = Math.min(need, p.reserve);
        p.clip += take;
        p.reserve -= take;
        p.reloading = false;
        p.reloadT = 0;
        showToast('装填完毕');
      }
    } else if (p.autoReload > 0) {
      p.autoReload -= dt;
      if (p.autoReload <= 0 && p.clip <= 0 && p.reserve > 0) startReload();
    }
  }
  function updatePlayer(dt) {
    const p = S.player;
    if (!p || !p.alive) return;
    p.crouch = !!(S.keys['KeyS'] || S.keys['ControlLeft'] || S.keys['ControlRight']);
    p.sprint = !!(S.keys['ShiftLeft'] || S.keys['ShiftRight']) && !p.crouch;
    const left = S.keys['KeyA'] || S.keys['ArrowLeft'];
    const right = S.keys['KeyD'] || S.keys['ArrowRight'];
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    const speed = p.crouch ? 95 : p.sprint ? 295 : 210;
    p.moving = dir !== 0;
    if (dir !== 0) {
      p.vx = dir * speed;
      p.walk += dt * (p.sprint ? 13 : p.crouch ? 6 : 9);
    } else {
      p.vx = 0;
      p.walk += dt * 1.4;
    }
    if (dir !== 0) {
      const nx = clamp(p.x + p.vx * dt, S.level.minX, S.level.maxX);
      const r = playerRect(nx, p.y);
      let blocked = false;
      for (const o of S.level.obstacles) {
        if (o.type === 'supply' && S.supply && S.supply.used && o.x === S.supply.x) continue;
        if (rectsOverlap(r, o)) { blocked = true; break; }
      }
      if (!blocked) p.x = nx;
      else {
        // 允许贴着障碍停下
        p.x = clamp(p.x, S.level.minX, S.level.maxX);
      }
    }
    if ((S.keys['Space'] || S.keys['KeyW'] || S.keys['ArrowUp']) && p.onGround && !p.crouch) {
      p.vy = -760;
      p.onGround = false;
      p.y -= 2;
    }
    if (!p.onGround) {
      p.vy += 2100 * dt;
      p.y += p.vy * dt;
      if (p.y >= GROUND) { p.y = GROUND; p.vy = 0; p.onGround = true; }
    }
    p.bob = p.moving && p.onGround ? Math.sin(p.walk * 2) * 2.2 : Math.sin(p.walk) * .7;
    p.bolt = Math.max(0, p.bolt - dt);
    p.meleeCd = Math.max(0, p.meleeCd - dt);
    p.meleeT = Math.max(0, p.meleeT - dt);
    p.muzzle = Math.max(0, p.muzzle - dt);
    p.hitFlash = Math.max(0, p.hitFlash - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.lastShot = (p.lastShot || 0) + dt;
    reloadUpdate(dt);
    updateAim();
    if (S.playTime - p.lastDamage > 10 && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + 2.4 * dt);
    }
    // 脚步声
    if (p.moving && p.onGround) {
      p.footsteps -= dt;
      if (p.footsteps <= 0) {
        p.footsteps = p.sprint ? .28 : .42;
        // 极轻的靴底声
        if (Audio.ctx) {
          const t = Audio.t(), n = Audio.n();
          const f = Audio.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
          n.connect(f);
          const g = Audio.ctx.createGain(); g.gain.setValueAtTime(.035, t); g.gain.exponentialRampToValueAtTime(.001, t + .07);
          f.connect(g); g.connect(Audio.master); n.start(t); n.stop(t + .08);
        }
      }
    }
    const target = clamp(p.x - VW * .36, 0, Math.max(0, S.level.width - VW));
    S.camX = lerp(S.camX, target, 1 - Math.exp(-5.5 * dt));
    S.camX = clamp(S.camX, 0, Math.max(0, S.level.width - VW));
  }
  function playerRect(x, y) {
    const p = S.player;
    const h = p.crouch ? 48 : 72;
    return { x: x - 16, y: y - h, w: 32, h };
  }
  function hurtPlayer(dmg) {
    const p = S.player;
    if (!p || !p.alive || p.invuln > 0) return;
    p.hp -= dmg * S.diff.dmg;
    p.lastDamage = S.playTime;
    p.invuln = .15;
    p.hitFlash = .1;
    S.damageFlash = Math.min(1, S.damageFlash + .55);
    S.shake = Math.min(1, S.shake + .5);
    sfx('hurt');
    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      failChapter('你倒在了阵地上。枪声还在继续，但这一仗，你已经拼尽了全力。');
    }
  }
  function damageEnemy(e, dmg, head, byPlayer, countStat) {
    if (!e.alive) return;
    e.hp -= dmg;
    e.hitFlash = .12;
    if (head) e.hp -= dmg * .6;
    if (byPlayer) {
      if (countStat !== false) S.hits++;
      showHitmarker(e.hp <= 0);
      sfx('hit', e.hp <= 0);
    }
    spawnParticles(e.x, e.y - 42, head ? 10 : 6, head ? 'spark' : 'dust');
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e) {
    if (!e.alive) return;
    e.alive = false;
    e.state = 'dying';
    e.deathT = 0;
    S.kills++;
    spawnParticles(e.x, e.y - 30, 12, 'dust');
    spawnSmoke(e.x, GROUND - 25, 30, .6, 'rgba(110,100,85,.3)');
    if (e.nest) {
      S.explosions.push({ x: e.x, y: GROUND - 30, r: 0, life: 0, max: .7, color: 'orange' });
      S.chapterState.nestsDown = (S.chapterState.nestsDown || 0) + 1;
      S.shake = Math.max(S.shake, .65);
      sfx('explosion', false);
    }
    if (Math.random() < .3) {
      S.pickups = S.pickups || [];
      S.pickups.push({ x: e.x, y: GROUND - 12, t: 0, ammo: 4 });
    }
    if (e.type === 'nest' && S.chapterState.nestsDown >= 2) {
      showRadio('hejifeng', '两座机枪巢都哑了。去桥头，把旗插上！');
    }
  }

  /* ---------------- 特效 ---------------- */
  function spawnParticles(x, y, n, type) {
    for (let i = 0; i < n; i++) {
      const spark = type === 'spark';
      S.particles.push({
        x: x + rand(-8, 8), y: y + rand(-8, 8),
        vx: spark ? rand(-190, 190) : rand(-55, 55),
        vy: spark ? rand(-160, 30) : rand(-70, 20),
        life: 0, max: spark ? rand(.18, .4) : rand(.4, 1),
        size: spark ? rand(1, 2.2) : rand(2, 5),
        color: spark ? (Math.random() > .5 ? '#f6d18d' : '#df7b49') : 'rgba(142,130,110,.55)',
        type: spark ? 'spark' : 'dust', g: spark ? 360 : 80
      });
    }
    if (S.particles.length > 360) S.particles.splice(0, S.particles.length - 360);
  }
  function spawnSmoke(x, y, size, life, color) {
    if (S.particles.length > 280) return;
    S.particles.push({
      x, y, vx: rand(-18, 18), vy: rand(-32, -12), life: 0,
      max: life || 1.8, size: size || 20, color: color || 'rgba(120,110,95,.28)',
      type: 'smoke', g: -8, grow: 18
    });
  }
  function spawnCasing(x, y, angle) {
    S.casings.push({
      x, y, vx: Math.cos(angle - 1.7) * rand(60, 120), vy: -rand(80, 160),
      rot: rand(0, TAU), vr: rand(-12, 12), life: 0
    });
  }
  function spawnMuzzle(x, y, angle, scale) {
    S.flashes.push({ x, y, angle, life: 0, max: .075, scale: scale || 1 });
  }
  function spawnSlash(x, y, angle, range) {
    S.slashes.push({ x, y, angle, life: 0, max: .22, range });
  }
  function explodeAt(x, y, radius, damage) {
    S.explosions.push({ x, y, r: 0, life: 0, max: .8, color: 'orange' });
    spawnParticles(x, y, 26, 'spark');
    for (let i = 0; i < 7; i++) spawnSmoke(x + rand(-25, 25), y + rand(-12, 10), rand(16, 38), rand(1.5, 3), 'rgba(70,65,58,.42)');
    S.shake = Math.max(S.shake, 1);
    S.flash = Math.max(S.flash, .55);
    flashScreen();
    sfx('explosion', false);
    if (S.player && S.player.alive) {
      const d = Math.hypot(S.player.x - x, (S.player.y - 35) - y);
      if (d < radius) hurtPlayer(damage * (1 - d / radius * .55));
    }
  }
  function updateEffects(dt) {
    for (let i = S.particles.length - 1; i >= 0; i--) {
      const p = S.particles[i];
      p.life += dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.type === 'smoke') {
        p.size += (p.grow || 10) * dt;
        p.vx *= 1 - dt * .7;
      }
      if (p.life >= p.max) S.particles.splice(i, 1);
    }
    for (let i = S.casings.length - 1; i >= 0; i--) {
      const c = S.casings[i];
      c.life += dt;
      c.vy += 620 * dt;
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.rot += c.vr * dt;
      if (c.y > GROUND - 2) { c.y = GROUND - 2; c.vy *= -.3; c.vx *= .5; }
      if (c.life > 2.2) S.casings.splice(i, 1);
    }
    for (let i = S.flashes.length - 1; i >= 0; i--) {
      S.flashes[i].life += dt;
      if (S.flashes[i].life >= S.flashes[i].max) S.flashes.splice(i, 1);
    }
    for (let i = S.slashes.length - 1; i >= 0; i--) {
      S.slashes[i].life += dt;
      if (S.slashes[i].life >= S.slashes[i].max) S.slashes.splice(i, 1);
    }
    for (let i = S.explosions.length - 1; i >= 0; i--) {
      const e = S.explosions[i];
      e.life += dt;
      e.r = e.max > 0 ? e.life / e.max : 1;
      if (e.life >= e.max) S.explosions.splice(i, 1);
    }
    for (let i = S.mortars.length - 1; i >= 0; i--) {
      const m = S.mortars[i];
      m.timer -= dt;
      if (m.timer <= 0 && !m.exploded) {
        m.exploded = true;
        explodeAt(m.x, GROUND - 4, m.radius || 95, 26);
      }
      if (m.timer <= -1.2) S.mortars.splice(i, 1);
    }
    S.shake = Math.max(0, S.shake - dt * 2.8);
    S.flash = Math.max(0, S.flash - dt * 4.5);
    S.damageFlash = Math.max(0, S.damageFlash - dt * 1.6);
    UI.damageVignette.style.opacity = (S.damageFlash * .78).toFixed(2);
    for (const f of S.fires) f.phase += dt * 2.2;
  }
  function updatePickups(dt) {
    if (!S.pickups) return;
    for (let i = S.pickups.length - 1; i >= 0; i--) {
      const p = S.pickups[i];
      p.t += dt;
      if (S.player && S.player.alive && Math.abs(p.x - S.player.x) < 28) {
        S.player.reserve = Math.min(90, S.player.reserve + (p.ammo || 4));
        showToast('拾取弹药 +4');
        sfx('pickup');
        S.pickups.splice(i, 1);
      } else if (p.t > 22) {
        S.pickups.splice(i, 1);
      }
    }
  }

  /* ---------------- 战斗更新 ---------------- */
  function enemyChest(e) { return e.y - 40; }
  function playerChest() {
    const p = S.player;
    return p.y - (p.crouch ? 30 : 52);
  }
  function enemyRect(e) {
    if (e.nest) return { x: e.x - 35, y: e.y - 55, w: 70, h: 55 };
    return { x: e.x - 17, y: e.y - 70, w: 34, h: 70 };
  }
  function allyRect(a) { return { x: a.x - 15, y: a.y - 64, w: 30, h: 64 }; }
  function hasLOS(e) {
    if (!S.player) return false;
    const fromY = enemyChest(e);
    const toY = playerChest();
    for (const o of S.level.obstacles) {
      if (o.type === 'supply' && S.supply && S.supply.used) continue;
      if (segRect(e.x, fromY, S.player.x, toY, o)) return false;
    }
    return true;
  }
  function enemyShoot(e) {
    if (!e.alive || !S.player) return;
    const p = S.player;
    const fromY = e.y - (e.nest ? 36 : 42);
    const tx = p.x + rand(-10, 10);
    const ty = playerChest() + rand(-6, 6);
    let a = Math.atan2(ty - fromY, tx - e.x);
    const spread = .055 / S.diff.acc;
    a += rand(-spread, spread);
    const dmg = e.damage;
    S.bullets.push({
      x: e.x + Math.cos(a) * 30, y: fromY + Math.sin(a) * 30,
      px: e.x, py: fromY, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620,
      life: 2.2, owner: 'enemy', damage: dmg, color: e.nest || e.type === 'mg' ? '#ffb05e' : '#ff8a58'
    });
    e.muzzle = .06;
    e.wishAim = a;
    if (e.nest || e.type === 'mg') sfx('mg'); else sfx('enemyShot', Math.abs(p.x - e.x));
  }
  function updateEnemies(dt) {
    const p = S.player;
    if (!p) return;
    for (let i = S.enemies.length - 1; i >= 0; i--) {
      const e = S.enemies[i];
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.muzzle = Math.max(0, e.muzzle - dt);
      if (!e.alive) {
        e.deathT += dt;
        if (e.deathT > 3.2) S.enemies.splice(i, 1);
        continue;
      }
      const dx = p.x - e.x;
      const dist = Math.abs(dx);
      e.facing = dx < 0 ? -1 : 1;
      const ty = playerChest();
      e.aim = Math.atan2(ty - (e.y - 40), dx);
      e.wishAim = e.aim;
      const visible = hasLOS(e);
      let moving = false;

      if (!e.nest) {
        if (e.type === 'charger') {
          if (dist > 52) {
            e.x += Math.sign(dx) * e.speed * dt;
            moving = true;
          } else if (e.meleeCd <= 0) {
            e.meleeCd = 1.1;
            hurtPlayer(12);
            spawnParticles(p.x, p.y - 38, 5, 'dust');
          }
        } else {
          const wantMove = dist > e.range || !visible;
          if (wantMove) {
            e.x += Math.sign(dx) * e.speed * dt;
            moving = true;
          } else if (dist < e.range * .58) {
            e.x -= Math.sign(dx) * e.speed * .34 * dt;
            moving = true;
          }
        }
        e.x = clamp(e.x, 40, S.level.width - 30);
        e.walk += dt * (moving ? (e.type === 'charger' ? 13 : 6) : 1.2);
      }
      e.meleeCd = Math.max(0, e.meleeCd - dt);

      if (e.type !== 'charger') {
        if (e.burstLeft > 0) {
          e.burstTimer -= dt;
          if (e.burstTimer <= 0) {
            enemyShoot(e);
            e.burstLeft--;
            e.burstTimer = e.nest || e.type === 'mg' ? .12 : .18;
          }
        } else {
          e.fireTimer -= dt;
          if (e.fireTimer <= 0 && visible && dist < 900) {
            e.burstLeft = e.burst || 1;
            e.burstTimer = 0;
            e.fireTimer = e.fire * rand(.85, 1.15) / clamp(S.diff.acc, .7, 1.4);
          }
        }
      }

      // 突破防线
      if (S.chapter === 0 && e.x < 145) {
        S.chapterState.gateHP = Math.max(0, S.chapterState.gateHP - 18);
        showRadio('jinzhenzhong', '敌人摸到桥头了！堵住缺口！');
        S.shake = Math.max(S.shake, .5);
        e.alive = false; e.state = 'dying'; e.deathT = 0;
        S.enemies.splice(i, 1);
        if (S.chapterState.gateHP <= 0) failChapter('桥头阵地被突破。宛平城的城门，暴露在敌人面前。');
      } else if (S.chapter === 2 && e.x < 230 && S.chapterState.phase !== 'retreat') {
        S.chapterState.corridor = Math.max(0, S.chapterState.corridor - 12);
        showRadio('tonglinge', '敌人逼近撤退通道！拦住他们！');
        S.shake = Math.max(S.shake, .45);
        e.alive = false; e.state = 'dying'; e.deathT = 0;
        S.enemies.splice(i, 1);
        if (S.chapterState.corridor <= 0) failChapter('撤退通道失守。学兵团被截断在南苑。');
      }
    }
  }
  function updateAllies(dt) {
    for (const a of S.allies) {
      if (!a.alive) { a.deathT += dt; continue; }
      a.fireCd -= dt;
      a.muzzle = Math.max(0, a.muzzle - dt);
      a.hitFlash = Math.max(0, a.hitFlash - dt);
      let target = null, best = 720;
      for (const e of S.enemies) {
        if (!e.alive) continue;
        const d = Math.abs(e.x - a.x);
        if (d < best) { best = d; target = e; }
      }
      if (target) {
        a.facing = target.x > a.x ? 1 : -1;
        a.aim = Math.atan2(enemyChest(target) - (a.y - 46), target.x - a.x);
        if (a.fireCd <= 0) {
          a.fireCd = rand(1.5, 2.2);
          const m = { x: a.x + Math.cos(a.aim) * 36, y: a.y - 46 + Math.sin(a.aim) * 36 };
          S.bullets.push({
            x: m.x, y: m.y, px: m.x, py: m.y,
            vx: Math.cos(a.aim) * 1350, vy: Math.sin(a.aim) * 1350,
            life: 1.1, owner: 'ally', damage: 18, color: '#e9d39b'
          });
          a.muzzle = .06;
          sfx('enemyShot', 500);
        }
      }
    }
  }
  function updateBullets(dt) {
    const p = S.player;
    for (let i = S.bullets.length - 1; i >= 0; i--) {
      const b = S.bullets[i];
      b.life -= dt;
      b.px = b.x; b.py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      let hit = null, hitType = null, bestT = 2, head = false;

      if (b.owner === 'player' || b.owner === 'ally') {
        for (const e of S.enemies) {
          if (!e.alive) continue;
          const r = enemyRect(e);
          const h = segRect(b.px, b.py, b.x, b.y, r);
          if (h && h.t < bestT) { bestT = h.t; hit = h; hitType = e; }
        }
        for (const o of S.level.obstacles) {
          if (o.type === 'supply' && S.supply && S.supply.used) continue;
          const h = segRect(b.px, b.py, b.x, b.y, o);
          if (h && h.t < bestT) { bestT = h.t; hit = h; hitType = 'obstacle'; }
        }
        if (hit) {
          if (hitType === 'obstacle') {
            spawnParticles(hit.x, hit.y, 4, 'dust');
          } else {
            head = !hitType.nest && hit.y < hitType.y - 52;
            damageEnemy(hitType, b.damage, head, b.owner === 'player');
            spawnParticles(hit.x, hit.y, head ? 9 : 4, 'spark');
          }
          S.bullets.splice(i, 1);
          continue;
        }
      } else {
        if (p && p.alive) {
          const r = playerRect(p.x, p.y);
          const h = segRect(b.px, b.py, b.x, b.y, r);
          if (h && h.t < bestT) { bestT = h.t; hit = h; hitType = 'player'; }
        }
        for (const a of S.allies) {
          if (!a.alive) continue;
          const h = segRect(b.px, b.py, b.x, b.y, allyRect(a));
          if (h && h.t < bestT) { bestT = h.t; hit = h; hitType = a; }
        }
        for (const o of S.level.obstacles) {
          if (o.type === 'supply' && S.supply && S.supply.used) continue;
          const h = segRect(b.px, b.py, b.x, b.y, o);
          if (h && h.t < bestT) { bestT = h.t; hit = h; hitType = 'obstacle'; }
        }
        if (hit) {
          if (hitType === 'player') {
            hurtPlayer(b.damage);
            spawnParticles(hit.x, hit.y, 4, 'dust');
          } else if (hitType === 'obstacle') {
            spawnParticles(hit.x, hit.y, 4, 'dust');
          } else {
            hitType.hp -= b.damage * S.diff.dmg;
            hitType.hitFlash = .1;
            spawnParticles(hit.x, hit.y, 3, 'dust');
            if (hitType.hp <= 0) hitType.alive = false;
          }
          S.bullets.splice(i, 1);
          continue;
        }
      }
      if (b.y >= GROUND - 2) {
        spawnParticles(b.x, GROUND - 2, 3, 'dust');
        S.bullets.splice(i, 1);
        continue;
      }
      if (b.life <= 0 || b.x < S.camX - 200 || b.x > S.camX + VW + 200) S.bullets.splice(i, 1);
    }
  }

  /* ---------------- 章节推进 ---------------- */
  function aliveEnemies() {
    let n = 0;
    for (const e of S.enemies) if (e.alive) n++;
    return n;
  }
  function startWave(n) {
    const cs = S.chapterState;
    cs.wave = n;
    cs.state = 'active';
    const configs = [
      { name: '试探进攻', sub: '日军小队沿桥面摸上来', count: 5, maxAlive: 3, interval: 2.2, types: ['rifle', 'rifle', 'charger'] },
      { name: '机枪掩护', sub: '敌人用机枪压住桥面，步兵开始冲锋', count: 7, maxAlive: 4, interval: 1.9, types: ['rifle', 'mg', 'charger'] },
      { name: '全线冲锋', sub: '号声响起，敌人发起最后冲锋', count: 9, maxAlive: 5, interval: 1.4, types: ['rifle', 'charger', 'mg'] }
    ];
    const c = configs[n - 1];
    cs.waveName = c.name;
    cs.spawner = {
      queue: Math.max(3, c.count + S.diff.count), maxAlive: c.maxAlive,
      interval: c.interval, timer: 1.2, types: c.types
    };
    showBanner('第 ' + ['一', '二', '三'][n - 1] + ' 波 · ' + c.name, c.sub);
    showRadio(n === 1 ? 'jinzhenzhong' : 'jixingwen',
      n === 1 ? '敌人上来了。放近再打，别浪费子弹！'
        : n === 2 ? '援军被截住了。桥就靠你们了！'
          : '弟兄们，退一步，身后就是宛平城！');
    sfx('radio');
    refreshObjectives();
  }
  function spawnFromSpawner(dt) {
    const cs = S.chapterState;
    const sp = cs.spawner;
    if (!sp) return;
    if (sp.queue > 0 && aliveEnemies() < sp.maxAlive) {
      sp.timer -= dt;
      if (sp.timer <= 0) {
        const x = Math.min(S.level.width - 30, S.camX + VW + rand(40, 110));
        const type = sp.types[randInt(0, sp.types.length - 1)];
        spawnEnemy(type, x);
        sp.queue--;
        sp.timer = sp.interval * rand(.82, 1.2);
      }
    }
  }
  function updateChapter1(dt) {
    const cs = S.chapterState;
    if (cs.startTimer > 0) { cs.startTimer -= dt; if (cs.startTimer <= 0) startWave(1); return; }
    if (cs.state === 'active') {
      spawnFromSpawner(dt);
      if (cs.spawner && cs.spawner.queue <= 0 && aliveEnemies() === 0) {
        if (cs.wave >= 3) {
          cs.state = 'done';
          completeChapter();
        } else {
          cs.state = 'break';
          cs.breakTimer = 4.2;
          showBanner('第 ' + ['一', '二', '三'][cs.wave - 1] + ' 波 · 守住了', '补上弹药，下一波马上就到');
          S.player.reserve = Math.min(90, S.player.reserve + 7);
          S.player.hp = Math.min(S.player.maxHp, S.player.hp + 12);
          sfx('pickup');
        }
      }
    } else if (cs.state === 'break') {
      cs.breakTimer -= dt;
      if (cs.breakTimer <= 0 && S.mode === 'playing') startWave(cs.wave + 1);
    }
  }
  function updateChapter2(dt) {
    const cs = S.chapterState;
    if (cs.startTimer > 0) { cs.startTimer -= dt; return; }
    const p = S.player;
    for (const z of cs.zones) {
      if (!z.done && p.x > z.at) {
        z.done = true;
        const baseX = Math.min(S.level.width - 40, Math.max(p.x + 280, S.camX + VW + 40));
        z.types.forEach((t, i) => spawnEnemy(t, Math.min(S.level.width - 30, baseX + i * 44)));
        showRadio('laozhao', '前面有敌人！别让他们靠近桥头！');
      }
    }
    if (cs.completeTimer > 0) {
      cs.completeTimer -= dt;
      if (cs.completeTimer <= 0) completeChapter();
    }
  }
  function updateChapter3(dt) {
    const cs = S.chapterState;
    if (cs.startTimer > 0) { cs.startTimer -= dt; return; }
    const p = S.player;
    if (cs.phase === 'hold') {
      cs.timer -= dt;
      if (cs.timer <= 60 && !cs.radio60) {
        cs.radio60 = true;
        showRadio('tonglinge', '小满，告诉学兵团，往南突围，不要回头！');
      }
      if (cs.timer <= 30 && !cs.radio30) {
        cs.radio30 = true;
        setKeyFigure('zhaodengyu');
        showRadio('zhaodengyu', '守住缺口！让娃娃们先走！');
      }
      if (cs.timer <= 0) {
        cs.timer = 0;
        cs.phase = 'retreat';
        S.exit.active = true;
        showBanner('撤出南苑', '通道还在，往西撤！');
        showRadio('narrator', '1937年7月28日下午，南苑阵地被日军突破。');
        S.shake = Math.max(S.shake, .4);
      } else {
        cs.spawnTimer -= dt;
        if (cs.spawnTimer <= 0) {
          cs.spawnTimer = rand(10, 14);
          const n = Math.min(4, 2 + Math.floor((95 - cs.timer) / 35));
          for (let i = 0; i < n; i++) spawnEnemy(i === 0 ? 'charger' : 'rifle', Math.min(S.level.width - 30, S.camX + VW + 30 + i * 38));
          showRadio('narrator', '敌人又上来了。顶住！');
        }
        cs.mortarTimer -= dt;
        if (cs.mortarTimer <= 0) {
          cs.mortarTimer = rand(8, 12);
          S.mortars.push({ x: clamp(p.x + rand(-90, 90), 100, S.level.width - 80), timer: 1.35, radius: 96, exploded: false });
          showRadio('narrator', '炮击来袭！离开落点！');
        }
        if (Math.random() < dt * 1.4) {
          cs.civilians.push({ x: rand(S.camX + VW * .5, S.camX + VW - 40), y: GROUND, speed: rand(55, 85), phase: rand(0, TAU), keep: rand(0, 1) });
        }
      }
    } else if (cs.phase === 'retreat') {
      S.exit.active = true;
      cs.retreatTimer += dt;
      if (cs.retreatTimer > .8) {
        cs.retreatTimer = 0;
        if (aliveEnemies() < 5) {
          spawnEnemy(Math.random() > .45 ? 'charger' : 'rifle', Math.min(S.level.width - 30, S.camX + VW + 40));
        }
      }
      if (p.x < 165) completeChapter();
    }
    // 平民/学兵向后跑
    for (let i = cs.civilians.length - 1; i >= 0; i--) {
      const c = cs.civilians[i];
      c.x -= c.speed * dt;
      c.phase += dt * 8;
      if (c.x < S.camX - 80) cs.civilians.splice(i, 1);
    }
  }
  function updateChapters(dt) {
    if (S.mode !== 'playing' || !S.chapterState) return;
    if (S.chapter === 0) updateChapter1(dt);
    else if (S.chapter === 1) updateChapter2(dt);
    else updateChapter3(dt);
    // 目标栏
    S.uiTimer += dt;
    if (S.uiTimer > .3) {
      S.uiTimer = 0;
      refreshObjectives();
    }
  }
  function refreshObjectives() {
    if (!S.chapterState) return;
    if (S.chapter === 0) {
      const cs = S.chapterState;
      const o = S.objectives;
      if (o[0]) {
        o[0].prog = cs.state === 'pre' ? '0 / 3' : cs.state === 'active' ? '第 ' + cs.wave + ' / 3 波' : cs.wave + ' / 3';
        o[0].done = cs.state === 'done';
      }
      if (o[1]) {
        o[1].prog = Math.ceil(cs.gateHP) + '%';
        o[1].done = false;
      }
      if (S.bar) S.bar.value = cs.gateHP;
    } else if (S.chapter === 1) {
      const p = S.player, cs = S.chapterState;
      const pct = clamp((p.x - 200) / (S.flag.x - 200) * 100, 0, 100);
      if (S.objectives[0]) { S.objectives[0].prog = Math.round(pct) + '%'; S.objectives[0].done = p.x >= S.flag.x - 20; }
      if (S.objectives[1]) { S.objectives[1].prog = cs.nestsDown + ' / 2'; S.objectives[1].done = cs.nestsDown >= 2; }
      if (S.objectives[2]) {
        S.objectives[2].prog = cs.flagPlanted ? '完成' : (cs.nestsDown >= 2 ? '可以升旗' : '待命');
        S.objectives[2].done = cs.flagPlanted;
      }
    } else {
      const cs = S.chapterState;
      if (S.objectives[0]) {
        S.objectives[0].prog = cs.phase === 'hold' ? '剩余 ' + fmtTime(cs.timer) : '已到黄昏';
        S.objectives[0].done = cs.phase !== 'hold';
      }
      if (S.objectives[1]) {
        S.objectives[1].prog = Math.round(cs.corridor) + '%';
        S.objectives[1].done = false;
      }
      if (S.objectives[2]) {
        S.objectives[2].prog = cs.phase === 'retreat' ? '向左撤离' : '待命';
        S.objectives[2].done = false;
      }
      if (S.bar) S.bar.value = cs.corridor;
    }
    const sig = S.objectives.map(o => (o.id || '') + ':' + (o.prog || '') + ':' + (o.done ? 1 : 0)).join('|');
    if (sig !== S.objSig) renderObjectives();
    else updateBarUI();
  }

  /* ---------------- 战地日志 ---------------- */
  function openCodex(tab) {
    if (!S.codexReturn) S.codexReturn = { mode: S.mode };
    if (S.mode === 'playing') S.mode = 'codex';
    else if (S.mode === 'paused') S.mode = 'codex';
    else if (S.mode === 'menu' || S.mode === 'victory' || S.mode === 'chapterEnd' || S.mode === 'chapterCard') S.mode = 'codex';
    S.mode = 'codex';
    setPlayingUI(false);
    UI.stage.style.cursor = 'default';
    UI.codex.classList.remove('hidden');
    UI.codexTabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === (tab || 'timeline')));
    renderCodex(tab || 'timeline');
    Audio.click();
  }
  function closeCodex() {
    UI.codex.classList.add('hidden');
    const prev = S.codexReturn ? S.codexReturn.mode : 'menu';
    S.codexReturn = null;
    if (prev === 'paused') {
      S.mode = 'paused';
      UI.pause.classList.remove('hidden');
      UI.app.classList.add('paused');
    } else if (prev === 'playing') {
      S.mode = 'playing';
      setPlayingUI(true);
      UI.stage.style.cursor = '';
    } else if (prev === 'victory') {
      S.mode = 'victory';
      UI.finalScreen.classList.remove('hidden');
    } else if (prev === 'chapterEnd') {
      S.mode = 'chapterEnd';
      UI.chapterEnd.classList.remove('hidden');
    } else {
      S.mode = 'menu';
      UI.menu.classList.remove('hidden');
    }
  }
  function renderCodex(tab) {
    const c = DATA.codex;
    if (tab === 'timeline') {
      UI.codexTitle.textContent = '一九三七 · 卢沟桥时间线';
      UI.codexBody.innerHTML = c.timeline.map(t => `
        <div class="timeline-item">
          <div class="tl-date">${t.date}</div>
          <div class="tl-main"><h3>${t.title}</h3><p>${t.text}</p></div>
        </div>`).join('');
    } else if (tab === 'figures') {
      UI.codexTitle.textContent = '关键人物 · 二十九军';
      UI.codexBody.innerHTML = `<div class="figure-grid">${c.figures.map(f => `
        <div class="fig-card">
          <img src="${PORTRAITS[f.key] || PORTRAITS.narrator}" alt="${f.name}">
          <div><h3>${f.name}</h3><div class="fig-role">${f.role}</div><p>${f.text}</p></div>
        </div>`).join('')}</div>`;
    } else if (tab === 'weapons') {
      UI.codexTitle.textContent = '部队与武器';
      UI.codexBody.innerHTML = `<div class="weapon-grid">${c.weapons.map(w => `
        <div class="weapon-card"><h3>${w.name}</h3><p>${w.text}</p></div>`).join('')}</div>`;
    } else if (tab === 'controls') {
      UI.codexTitle.textContent = '操作说明';
      UI.codexBody.innerHTML = `
        <div class="controls-list">
          <div><span>A / D 或 ← / →</span><b>左右移动</b></div>
          <div><span>鼠标</span><b>瞄准</b></div>
          <div><span>鼠标左键</span><b>射击</b></div>
          <div><span>鼠标右键 / F</span><b>大刀</b></div>
          <div><span>R</span><b>装填</b></div>
          <div><span>Space / W</span><b>跳跃</b></div>
          <div><span>Ctrl / S</span><b>蹲下</b></div>
          <div><span>Shift</span><b>冲刺</b></div>
          <div><span>E</span><b>补给 / 升旗 / 撤离</b></div>
          <div><span>Esc</span><b>暂停</b></div>
          <div><span>M</span><b>静音</b></div>
        </div>
        <div class="about-body" style="margin-top:18px;">
          <p>左侧任务栏会随剧情更新当前任务、子目标、关键人物与生命弹药。战斗时注意沙袋能挡住子弹：蹲在沙袋后更安全，但站起来才能看清桥面。</p>
          <p>汉阳造是栓动步枪，每发之间需要拉栓。近距离按 F 使用大刀，尤其适合第二章的大刀队夜袭。</p>
          <p>击倒敌人有概率掉落弹药袋，走近拾取。每章出生点附近的补给箱可以补充一次弹药和体力。</p>
        </div>`;
    } else {
      UI.codexTitle.textContent = '关于本作';
      UI.codexBody.innerHTML = `
        <div class="about-body">
          <p class="quote">“他们没能守住北平，却守住了中国人的脊梁。”</p>
          <p>${c.about}</p>
          <p><strong>主角</strong>：小满，二十九军三十七师一一〇旅二一九团三营二等兵，虚构人物。</p>
          <p><strong>部队</strong>：国民革命军第二十九军。1937年7月，三十七师一一〇旅二一九团驻守卢沟桥、宛平城一带，团长吉星文，三营营长金振中。</p>
          <p><strong>说明</strong>：游戏中的日期、地点、番号、人物职务与牺牲经过依据公开史料；对白与战斗细节为艺术化处理。游戏没有血腥表现。</p>
          <p class="small" style="font-size:10px;line-height:1.9;color:rgba(230,221,200,.32);">参考资料：新华社、中国军网、国防部网、人民网等公开史料。谨以此作纪念抗战先辈。铭记历史，珍爱和平。</p>
        </div>`;
    }
  }

  /* ================= 场景绘制 ================= */
  function draw() {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, UI.canvas.width, UI.canvas.height);
    ctx.setTransform(dpr * viewScale, 0, 0, dpr * viewScale, dpr * viewOffX, dpr * viewOffY);
    const menuView = S.mode === 'menu' || S.mode === 'boot' || (S.mode === 'codex' && S.codexReturn && S.codexReturn.mode === 'menu');
    if (menuView) drawMenuScene();
    else drawBattleScene();
  }

  function drawStars() {
    for (const s of S.stars) {
      let x = ((s.x - S.camX * .015) % (VW + 120) + VW + 120) % (VW + 120) - 60;
      if (x < -4 || x > VW + 4) continue;
      const tw = .4 + .4 * Math.sin(S.time * s.sp + s.ph);
      ctx.globalAlpha = tw * s.a;
      ctx.fillStyle = '#d7e2ea';
      ctx.fillRect(x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }
  function drawSky(type, menuCam) {
    const key = type + '|' + VW;
    if (!S.skyCache || S.skyCache.key !== key) {
      const c = document.createElement('canvas');
      c.width = VW; c.height = GROUND;
      const g = c.getContext('2d');
      const grd = g.createLinearGradient(0, 0, 0, GROUND);
      if (type === 'earth') {
        grd.addColorStop(0, '#171513');
        grd.addColorStop(.38, '#33271f');
        grd.addColorStop(.7, '#6d4a32');
        grd.addColorStop(1, '#8a603e');
      } else if (type === 'rail') {
        grd.addColorStop(0, '#030609');
        grd.addColorStop(.45, '#0a1118');
        grd.addColorStop(.78, '#331b16');
        grd.addColorStop(1, '#6b3521');
      } else {
        grd.addColorStop(0, '#03070d');
        grd.addColorStop(.42, '#08131c');
        grd.addColorStop(.76, '#30201d');
        grd.addColorStop(1, '#6d3b27');
      }
      g.fillStyle = grd;
      g.fillRect(0, 0, VW, GROUND);
      S.skyCache = { key, canvas: c };
    }
    ctx.drawImage(S.skyCache.canvas, 0, 0);
    if (type !== 'earth') drawStars();
    if (type !== 'earth') {
      const mx = menuCam ? VW * .73 : VW * .2;
      const my = menuCam ? 155 : 185;
      const halo = ctx.createRadialGradient(mx, my, 2, mx, my, menuCam ? 90 : 72);
      halo.addColorStop(0, 'rgba(255,248,214,.22)');
      halo.addColorStop(1, 'rgba(180,200,220,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(mx - 120, my - 120, 240, 240);
      const mg = ctx.createRadialGradient(mx - 4, my - 4, 1, mx, my, 17);
      mg.addColorStop(0, '#fffbe6');
      mg.addColorStop(.7, '#e8e6d2');
      mg.addColorStop(1, '#b9c7ce');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(mx, my, 16, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(140,155,155,.18)';
      ctx.beginPath(); ctx.arc(mx + 5, my - 3, 4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(mx - 6, my + 5, 2.6, 0, TAU); ctx.fill();
    } else {
      const sx = VW * .72, sy = 150;
      const sg = ctx.createRadialGradient(sx, sy, 5, sx, sy, 90);
      sg.addColorStop(0, 'rgba(235,171,102,.3)');
      sg.addColorStop(1, 'rgba(150,70,35,0)');
      ctx.fillStyle = sg; ctx.fillRect(sx - 120, sy - 120, 240, 240);
      ctx.fillStyle = 'rgba(215,150,88,.32)';
      ctx.beginPath(); ctx.arc(sx, sy, 32, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = .09;
    for (let i = 0; i < 4; i++) {
      const y = 55 + i * 40 + Math.sin(S.time * .08 + i) * 4;
      const x = ((i * 340 - S.camX * .04 - S.time * (3 + i)) % (VW + 500) + VW + 500) % (VW + 500) - 250;
      ctx.fillStyle = i % 2 ? 'rgba(190,165,135,.5)' : 'rgba(100,112,120,.45)';
      ctx.beginPath();
      ctx.ellipse(x, y, 170 + i * 24, 7 + i * 1.5, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function drawRidge(y, color, parallax, amp, seed) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, VH);
    for (let x = -100; x <= VW + 100; x += 40) {
      const wx = x + S.camX * parallax;
      const yy = y + Math.sin(wx * .008 + seed) * amp + Math.sin(wx * .021 + seed * 2) * amp * .35;
      ctx.lineTo(x, yy);
    }
    ctx.lineTo(VW + 100, VH);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function drawFar(type) {
    if (type === 'stone') {
      drawRidge(458, '#171b1a', .07, 20, 1.4);
      drawRidge(500, '#20211d', .12, 12, 3.7);
      drawRiver(520, '#121a20');
      drawWanping();
    } else if (type === 'rail') {
      drawRidge(450, '#12161a', .09, 18, 2.3);
      drawRidge(495, '#1c1c1a', .14, 9, 5.1);
      drawRiver(510, '#10181e');
      drawFarBankRail();
    } else {
      drawRidge(440, '#2a211b', .06, 16, 4.2);
      drawRidge(500, '#33251d', .1, 8, 1.9);
      drawNanyuanFar();
    }
  }
  function drawRiver(y, color) {
    const g = ctx.createLinearGradient(0, y, 0, VH);
    g.addColorStop(0, color);
    g.addColorStop(.45, '#0a1116');
    g.addColorStop(1, '#05090b');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, VW, VH - y);
    ctx.globalAlpha = .22;
    for (let i = 0; i < 18; i++) {
      const wx = VW * .2 + Math.sin(i * 6.4 + S.time * .3) * (12 + i * 3);
      const wy = y + 8 + i * 7;
      ctx.fillStyle = i % 2 ? '#c6c9b7' : '#7c8e91';
      ctx.fillRect(wx, wy, 16 + (i % 4) * 8, 1);
    }
    ctx.globalAlpha = 1;
  }
  function drawWanping() {
    const x = -335 - S.camX * .16;
    const base = GROUND - 10;
    const wallTop = base - 190;
    if (x > VW + 100) return;
    ctx.save();
    ctx.fillStyle = '#1b1c17';
    ctx.fillRect(x, wallTop, 590, 190);
    ctx.fillStyle = 'rgba(70,67,55,.22)';
    for (let yy = wallTop + 12; yy < base; yy += 15) ctx.fillRect(x, yy, 590, 1);
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = '#24251e';
      ctx.fillRect(x + 8 + i * 33, wallTop - 17, 20, 20);
    }
    const gx = x + 278, gy = base;
    ctx.fillStyle = '#080a08';
    ctx.beginPath();
    ctx.moveTo(gx - 46, gy); ctx.lineTo(gx - 46, gy - 100);
    ctx.arc(gx, gy - 100, 46, Math.PI, 0, true);
    ctx.lineTo(gx + 46, gy); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(192,161,102,.22)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#242019'; ctx.fillRect(x + 230, wallTop - 62, 100, 48);
    ctx.fillStyle = '#17140f'; ctx.fillRect(x + 220, wallTop - 78, 120, 17);
    ctx.fillStyle = '#17140f';
    ctx.beginPath(); ctx.moveTo(x + 204, wallTop - 78); ctx.lineTo(x + 232, wallTop - 110); ctx.lineTo(x + 328, wallTop - 110); ctx.lineTo(x + 356, wallTop - 78); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(120,88,55,.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 232, wallTop - 110); ctx.lineTo(x + 328, wallTop - 110); ctx.stroke();
    ctx.fillStyle = 'rgba(226,145,72,.8)';
    ctx.fillRect(x + 252, wallTop - 49, 12, 13);
    ctx.fillRect(x + 296, wallTop - 49, 12, 13);
    const lg = ctx.createRadialGradient(gx, gy - 80, 1, gx, gy - 80, 30);
    lg.addColorStop(0, 'rgba(255,154,75,.7)'); lg.addColorStop(1, 'rgba(255,110,40,0)');
    ctx.fillStyle = lg; ctx.fillRect(gx - 35, gy - 115, 70, 70);
    ctx.fillStyle = '#c37640'; ctx.beginPath(); ctx.arc(gx, gy - 80, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(12,10,7,.9)'; ctx.fillRect(gx - 34, gy - 147, 68, 18);
    drawText('宛平', gx, gy - 138, 11, 'rgba(205,169,105,.8)', 'center', '"KaiTi","STKaiti",serif');
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x, base - 4, 590, 4);
    ctx.restore();
  }
  function drawFarBankRail() {
    const x0 = -120 - S.camX * .1;
    ctx.save();
    ctx.strokeStyle = 'rgba(55,61,59,.55)'; ctx.lineWidth = 5;
    for (let i = 0; i < 8; i++) {
      const x = x0 + i * 150;
      ctx.beginPath(); ctx.moveTo(x, GROUND - 10); ctx.lineTo(x, GROUND - 155); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, GROUND - 155); ctx.lineTo(x + 150, GROUND - 10); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(55,61,59,.42)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x0, GROUND - 155); ctx.lineTo(x0 + 1200, GROUND - 155); ctx.stroke();
    ctx.restore();
    for (let i = 0; i < 7; i++) {
      const x = 70 + i * 240 - S.camX * .14;
      if (x < -20 || x > VW + 20) continue;
      ctx.strokeStyle = 'rgba(38,36,28,.8)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, GROUND); ctx.lineTo(x, GROUND - 150); ctx.stroke();
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 18, GROUND - 140); ctx.lineTo(x + 18, GROUND - 140); ctx.stroke();
    }
    const bx = 1240 - S.camX * .18;
    if (bx > -200 && bx < VW + 200) {
      ctx.fillStyle = '#1b1a17'; ctx.fillRect(bx, GROUND - 80, 170, 50);
      ctx.fillStyle = '#0c0d0b'; ctx.fillRect(bx + 23, GROUND - 72, 34, 22);
      ctx.fillRect(bx + 78, GROUND - 72, 34, 22);
      const gg = ctx.createRadialGradient(bx + 100, GROUND - 95, 4, bx + 100, GROUND - 95, 80);
      gg.addColorStop(0, 'rgba(255,128,44,.55)'); gg.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = gg; ctx.fillRect(bx - 20, GROUND - 175, 220, 150);
    }
  }
  function drawNanyuanFar() {
    const base = GROUND;
    ctx.fillStyle = '#241f1a';
    ctx.fillRect(-80 - S.camX * .12, base - 90, 500, 90);
    ctx.fillStyle = '#1b1814';
    for (let i = 0; i < 8; i++) ctx.fillRect(-80 - S.camX * .12 + i * 66, base - 120, 38, 30);
    ctx.fillStyle = 'rgba(8,8,7,.55)';
    ctx.fillRect(-80 - S.camX * .12, base - 75, 500, 75);
    for (let i = 0; i < 9; i++) {
      const x = 40 + i * 160 - S.camX * .18;
      if (x < -80 || x > VW + 80) continue;
      ctx.strokeStyle = '#17130f'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x + Math.sin(i) * 8, base - 110); ctx.stroke();
      ctx.fillStyle = 'rgba(24,25,18,.85)';
      ctx.beginPath(); ctx.ellipse(x, base - 125, 42, 25, Math.sin(i), 0, TAU); ctx.fill();
    }
    for (let i = 0; i < 3; i++) {
      const x = 180 + i * 480 - S.camX * .22;
      const fg = ctx.createRadialGradient(x, base - 45, 4, x, base - 45, 95);
      fg.addColorStop(0, 'rgba(255,122,43,.32)');
      fg.addColorStop(1, 'rgba(200,60,20,0)');
      ctx.fillStyle = fg; ctx.fillRect(x - 100, base - 145, 200, 150);
    }
  }
  function drawLion(x, y, scale, alpha) {
    if (x < -80 || x > VW + 80) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.fillStyle = '#4a4a40';
    ctx.beginPath(); ctx.ellipse(0, 3, 19, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5a5a4d';
    ctx.beginPath(); ctx.ellipse(0, -14, 10, 15, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(1, -31, 8.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#626254';
    ctx.beginPath(); ctx.arc(1, -34, 4.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4c4c40';
    ctx.beginPath(); ctx.moveTo(-6, -38); ctx.lineTo(-9, -44); ctx.lineTo(-2, -40); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(7, -38); ctx.lineTo(10, -44); ctx.lineTo(3, -40); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(220,215,190,.16)';
    ctx.beginPath(); ctx.arc(0, -37, 2.8, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawStoneBridge() {
    const cam = S.camX;
    ctx.fillStyle = '#27261f';
    ctx.fillRect(0, GROUND + 6, VW, VH - GROUND - 6);
    const archW = 210;
    const first = Math.floor((cam - 240) / archW);
    for (let i = first; i < first + Math.ceil(VW / archW) + 3; i++) {
      const cx = i * archW + 105 - cam;
      if (cx < -150 || cx > VW + 150) continue;
      const grd = ctx.createLinearGradient(0, GROUND + 20, 0, VH);
      grd.addColorStop(0, '#0b1419'); grd.addColorStop(1, '#04080a');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(cx - 84, GROUND + 26);
      ctx.lineTo(cx - 84, GROUND + 104);
      ctx.arc(cx, GROUND + 104, 84, Math.PI, 0, true);
      ctx.lineTo(cx + 84, GROUND + 26);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(130,120,100,.22)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.globalAlpha = .1; ctx.fillStyle = '#9aa9a2';
      ctx.fillRect(cx - 40, GROUND + 112, 80, 2);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = 'rgba(108,102,86,.13)'; ctx.lineWidth = 1;
    for (let x = -cam % 160; x < VW; x += 160) {
      ctx.beginPath(); ctx.moveTo(x, GROUND + 20); ctx.lineTo(x, VH); ctx.stroke();
    }
    const postGap = 138;
    const firstP = Math.floor((cam - 140) / postGap);
    for (let i = firstP; i < firstP + Math.ceil(VW / postGap) + 3; i++) {
      const x = i * postGap - cam;
      if (x < -100 || x > VW + 100) continue;
      ctx.fillStyle = '#5f5c50'; ctx.fillRect(x + 13, GROUND - 66, postGap - 26, 42);
      ctx.fillStyle = '#6b675a'; ctx.fillRect(x + 13, GROUND - 70, postGap - 26, 5);
      ctx.fillStyle = '#6a6658'; ctx.fillRect(x - 8, GROUND - 98, 16, 80);
      ctx.fillStyle = '#777264'; ctx.fillRect(x - 10, GROUND - 101, 20, 5);
      if (i % 2 === 0) drawLion(x, GROUND - 103, .86, .9);
    }
    const g = ctx.createLinearGradient(0, GROUND - 14, 0, GROUND + 16);
    g.addColorStop(0, '#777264'); g.addColorStop(.5, '#5b574b'); g.addColorStop(1, '#3b3931');
    ctx.fillStyle = g; ctx.fillRect(0, GROUND - 14, VW, 30);
    ctx.strokeStyle = 'rgba(30,29,24,.55)'; ctx.lineWidth = 2;
    for (let x = -cam % 96; x < VW; x += 96) {
      ctx.beginPath(); ctx.moveTo(x, GROUND - 14); ctx.lineTo(x + 10, GROUND + 16); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(225,218,190,.1)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, GROUND - 13); ctx.lineTo(VW, GROUND - 13); ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const x = ((i * 277 - cam * .7) % (VW + 100) + VW + 100) % (VW + 100) - 50;
      ctx.fillStyle = 'rgba(120,140,145,.08)';
      ctx.beginPath(); ctx.ellipse(x, GROUND + 2, 20, 2.5, 0, 0, TAU); ctx.fill();
    }
  }
  function drawRailBridge() {
    const cam = S.camX;
    ctx.fillStyle = '#161b1b'; ctx.fillRect(0, GROUND + 6, VW, VH - GROUND - 6);
    for (let i = 0; i < 9; i++) {
      const x = i * 260 - cam * .8;
      if (x < -100 || x > VW + 100) continue;
      ctx.strokeStyle = 'rgba(54,62,60,.6)'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(x, GROUND + 13); ctx.lineTo(x, VH); ctx.stroke();
      ctx.strokeStyle = 'rgba(80,88,83,.18)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 3, GROUND + 20); ctx.lineTo(x - 3, VH); ctx.stroke();
    }
    ctx.fillStyle = '#222826'; ctx.fillRect(0, GROUND - 8, VW, 22);
    ctx.fillStyle = '#2f2c23';
    for (let x = -cam % 42; x < VW; x += 42) ctx.fillRect(x, GROUND - 11, 26, 7);
    ctx.strokeStyle = '#777267'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, GROUND - 12); ctx.lineTo(VW, GROUND - 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, GROUND - 5); ctx.lineTo(VW, GROUND - 5); ctx.stroke();
    ctx.save();
    ctx.globalAlpha = .62;
    const first = Math.floor((cam - 300) / 230);
    for (let i = first; i < first + Math.ceil(VW / 230) + 3; i++) {
      const x = i * 230 - cam;
      ctx.strokeStyle = '#343c3a'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(x, GROUND - 10); ctx.lineTo(x, GROUND - 260); ctx.stroke();
      ctx.strokeStyle = 'rgba(85,94,88,.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 3, GROUND - 15); ctx.lineTo(x - 3, GROUND - 255); ctx.stroke();
      ctx.strokeStyle = 'rgba(45,53,51,.7)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x, GROUND - 250); ctx.lineTo(x + 230, GROUND - 15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, GROUND - 15); ctx.lineTo(x + 230, GROUND - 250); ctx.stroke();
    }
    ctx.strokeStyle = '#3a4240'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(0, GROUND - 260); ctx.lineTo(VW, GROUND - 260); ctx.stroke();
    ctx.restore();
    const g = ctx.createLinearGradient(0, GROUND - 18, 0, GROUND + 14);
    g.addColorStop(0, '#403d32'); g.addColorStop(.5, '#2c2c26'); g.addColorStop(1, '#171b19');
    ctx.fillStyle = g; ctx.fillRect(0, GROUND - 17, VW, 32);
    ctx.strokeStyle = 'rgba(220,210,180,.08)'; ctx.lineWidth = 1;
    for (let x = -cam % 90; x < VW; x += 90) { ctx.beginPath(); ctx.moveTo(x, GROUND - 17); ctx.lineTo(x, GROUND + 14); ctx.stroke(); }
    const lx = 1180 - cam * .6;
    if (lx > -20 && lx < VW + 20) {
      ctx.strokeStyle = '#26251e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(lx, GROUND); ctx.lineTo(lx, GROUND - 150); ctx.stroke();
      const lg = ctx.createRadialGradient(lx, GROUND - 155, 2, lx, GROUND - 155, 18);
      lg.addColorStop(0, 'rgba(255,92,55,.8)'); lg.addColorStop(1, 'rgba(255,80,30,0)');
      ctx.fillStyle = lg; ctx.fillRect(lx - 20, GROUND - 175, 40, 40);
    }
  }
  function drawNanyuan() {
    const cam = S.camX;
    const g = ctx.createLinearGradient(0, GROUND - 10, 0, VH);
    g.addColorStop(0, '#6b5238'); g.addColorStop(.35, '#493a28'); g.addColorStop(1, '#1d1913');
    ctx.fillStyle = g; ctx.fillRect(0, GROUND - 10, VW, VH - GROUND + 10);
    ctx.strokeStyle = 'rgba(22,16,10,.35)'; ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      const x = ((i * 127 - cam * .7) % (VW + 80) + VW + 80) % (VW + 80) - 40;
      ctx.beginPath(); ctx.moveTo(x, GROUND + 3); ctx.lineTo(x + Math.sin(i) * 10, GROUND + 24 + (i % 5) * 4); ctx.stroke();
    }
    for (let i = 0; i < 60; i++) {
      const x = ((i * 79 - cam * .8) % (VW + 60) + VW + 60) % (VW + 60) - 30;
      ctx.strokeStyle = 'rgba(78,79,52,.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, GROUND); ctx.lineTo(x + (i % 3 - 1) * 4, GROUND - 9 - (i % 4) * 3); ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const x = ((i * 311 - cam * .9) % (VW + 200) + VW + 200) % (VW + 200) - 100;
      ctx.fillStyle = 'rgba(18,13,9,.45)';
      ctx.beginPath(); ctx.ellipse(x, GROUND + 8, 38, 8, 0, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(25,20,14,.4)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, GROUND - 5); ctx.lineTo(VW, GROUND - 8); ctx.stroke();
  }
  function drawFires() {
    for (const f of S.fires) {
      const x = f.x - S.camX;
      if (x < -220 || x > VW + 220) continue;
      const flick = .75 + Math.sin(f.phase * 7) * .16 + Math.sin(f.phase * 13) * .08;
      const base = GROUND - 30;
      const r = 130 * f.size;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = .44 * flick;
      ctx.drawImage(FX.glow, x - r, base - 20 - r * .85, r * 2, r * 1.7);
      ctx.restore();
      for (let i = 0; i < 4; i++) {
        const fl = .6 + Math.sin(f.phase * 9 + i) * .3;
        ctx.fillStyle = i % 2 ? 'rgba(255,205,105,.7)' : 'rgba(239,104,43,.55)';
        ctx.beginPath();
        ctx.moveTo(x + (i - 1.5) * 9, base);
        ctx.quadraticCurveTo(x + (i - 1.5) * 14 + Math.sin(f.phase * 8 + i) * 10, base - 34 * fl, x + (i - 1.5) * 5, base - 47 * fl);
        ctx.quadraticCurveTo(x + (i - 1.5) * 2, base - 22, x + (i - 1.2) * 8, base);
        ctx.fill();
      }
      ctx.globalAlpha = .16;
      for (let i = 0; i < 3; i++) {
        const sy = base - 45 - i * 22 - (S.time * 9 + f.phase * 20) % 40;
        ctx.fillStyle = '#6c6258';
        ctx.beginPath(); ctx.ellipse(x + Math.sin(f.phase + i) * 14, sy, 30 + i * 12, 14 + i * 5, 0, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  function drawRain() {
    const menuView = S.mode === 'menu' || S.mode === 'boot' || (S.mode === 'codex' && S.codexReturn && S.codexReturn.mode === 'menu');
    if (S.chapter === 2 && !menuView) {
      ctx.fillStyle = 'rgba(190,176,150,.18)';
      for (const d of S.rain) {
        if (d.x < -6 || d.x > VW + 6) continue;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.len * .24, 0, TAU); ctx.fill();
      }
      return;
    }
    ctx.strokeStyle = 'rgba(166,188,200,.2)';
    ctx.lineWidth = 1;
    for (const d of S.rain) {
      if (d.x < -6 || d.x > VW + 6) continue;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - 4, d.y + d.len);
      ctx.stroke();
    }
  }
  function drawObstacles() {
    for (const o of S.level.obstacles) {
      if (o.type === 'supply') continue;
      const x = o.x - S.camX;
      if (x < -160 || x > VW + 160) continue;
      if (o.type === 'sandbag') drawSandbag(x, o.y, o.w, o.h);
      else if (o.type === 'crate') drawCrate(x, o.y, o.w, o.h);
      else if (o.type === 'wall') drawBrokenWall(x, o.y, o.w, o.h);
    }
  }
  function drawSandbag(x, y, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(x + w / 2, GROUND + 3, w / 2 + 4, 6, 0, 0, TAU); ctx.fill();
    const rows = Math.max(2, Math.ceil(h / 17));
    const cols = Math.max(2, Math.round(w / 25));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const bx = x + (c + .5) * (w / cols) + (r % 2 ? 5 : 0);
        const by = y + h - (r + 1) * (h / rows) + (h / rows) * .45;
        const bagW = w / cols * 1.12, bagH = h / rows * 1.15;
        ctx.fillStyle = r % 2 ? '#55503c' : '#625b45';
        ctx.beginPath(); ctx.ellipse(bx, by, bagW / 2, bagH / 2, (c % 2 ? -.06 : .06), 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(28,26,19,.55)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.strokeStyle = 'rgba(208,192,150,.12)';
        ctx.beginPath(); ctx.ellipse(bx - bagW * .12, by - bagH * .17, bagW * .28, bagH * .17, 0, 0, TAU); ctx.stroke();
      }
    }
    ctx.restore();
  }
  function drawCrate(x, y, w, h) {
    ctx.save();
    ctx.fillStyle = '#3d2e1e'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(157,128,80,.4)'; ctx.lineWidth = 2; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    ctx.strokeStyle = 'rgba(100,78,48,.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 3, y + 3); ctx.lineTo(x + w - 3, y + h - 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - 3, y + 3); ctx.lineTo(x + 3, y + h - 3); ctx.stroke();
    ctx.fillStyle = 'rgba(20,15,10,.22)'; ctx.fillRect(x, y, w, 5);
    ctx.restore();
  }
  function drawBrokenWall(x, y, w, h) {
    ctx.save();
    ctx.fillStyle = '#403a2e'; ctx.fillRect(x, y, w, h);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) {
      ctx.fillStyle = (r + c) % 2 ? 'rgba(98,86,65,.25)' : 'rgba(40,35,27,.25)';
      ctx.fillRect(x + c * (w / 7) + 2, y + r * (h / 4) + 2, w / 7 - 4, h / 4 - 4);
    }
    ctx.fillStyle = 'rgba(8,8,6,.6)';
    ctx.beginPath(); ctx.moveTo(x + w * .2, y); ctx.lineTo(x + w * .35, y + h * .3); ctx.lineTo(x + w * .22, y + h * .55); ctx.lineTo(x + w * .18, y + h); ctx.lineTo(x + w * .05, y + h); ctx.lineTo(x + w * .08, y); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawSupply() {
    if (!S.supply) return;
    const x = S.supply.x - S.camX;
    if (x < -100 || x > VW + 100) return;
    const used = S.supply.used;
    ctx.save();
    ctx.globalAlpha = used ? .55 : 1;
    ctx.fillStyle = '#3a432d'; ctx.fillRect(x, S.supply.y, S.supply.w, S.supply.h);
    ctx.strokeStyle = 'rgba(150,130,80,.45)'; ctx.lineWidth = 2; ctx.strokeRect(x + 2, S.supply.y + 2, S.supply.w - 4, S.supply.h - 4);
    ctx.fillStyle = '#1f2418'; ctx.fillRect(x + 7, S.supply.y - 4, S.supply.w - 14, 5);
    drawText('补', x + S.supply.w / 2, S.supply.y + S.supply.h / 2 + 1, 15, used ? 'rgba(180,170,140,.4)' : 'rgba(225,200,140,.85)', 'center', '"KaiTi","STKaiti",serif');
    if (!used) {
      const g = ctx.createRadialGradient(x + S.supply.w / 2, S.supply.y, 2, x + S.supply.w / 2, S.supply.y, 45);
      g.addColorStop(0, 'rgba(220,190,110,.18)'); g.addColorStop(1, 'rgba(220,190,110,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 30, S.supply.y - 40, 100, 90);
    }
    ctx.restore();
  }
  function drawPickups() {
    if (!S.pickups) return;
    for (const p of S.pickups) {
      const x = p.x - S.camX;
      if (x < -30 || x > VW + 30) continue;
      const y = GROUND - 12 + Math.sin(p.t * 2.5) * 3;
      ctx.save();
      ctx.fillStyle = '#4b5134'; ctx.fillRect(x - 7, y - 4, 14, 8);
      ctx.strokeStyle = 'rgba(220,200,130,.3)'; ctx.lineWidth = 1; ctx.strokeRect(x - 7, y - 4, 14, 8);
      ctx.fillStyle = 'rgba(230,200,120,.18)';
      ctx.beginPath(); ctx.arc(x, y, 12, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
  function drawFlag() {
    if (!S.flag) return;
    const x = S.flag.x - S.camX;
    if (x < -100 || x > VW + 100) return;
    ctx.save();
    ctx.strokeStyle = '#2b261d'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x, GROUND); ctx.lineTo(x, GROUND - 130); ctx.stroke();
    if (S.flag.planted) {
      const topY = GROUND - 128;
      const botY = GROUND - 76;
      ctx.fillStyle = '#9c2a20';
      ctx.beginPath();
      ctx.moveTo(x + 2, topY);
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        ctx.lineTo(x + 2 + t * 58, topY + Math.sin(S.time * 4 + t * 5) * 4);
      }
      for (let i = 10; i >= 0; i--) {
        const t = i / 10;
        ctx.lineTo(x + 2 + t * 58, botY + Math.sin(S.time * 4 + t * 5) * 4 + t * 2);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(40,10,8,.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 2, topY + 2);
      ctx.lineTo(x + 60, topY + 2);
      ctx.stroke();
      drawText('29', x + 30, GROUND - 102, 12, 'rgba(235,205,135,.8)', 'center', 'Georgia,serif');
      const g = ctx.createRadialGradient(x + 30, GROUND - 95, 2, x + 30, GROUND - 95, 50);
      g.addColorStop(0, 'rgba(230,120,60,.18)'); g.addColorStop(1, 'rgba(230,120,60,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 20, GROUND - 145, 100, 100);
    } else {
      ctx.fillStyle = 'rgba(120,110,88,.45)'; ctx.fillRect(x + 3, GROUND - 112, 32, 5);
    }
    ctx.restore();
  }
  function drawExit() {
    if (!S.exit) return;
    const x = S.exit.x - S.camX;
    if (x < -60 || x > VW + 60) return;
    const active = S.exit.active;
    if (active) {
      const g = ctx.createRadialGradient(x, GROUND - 50, 4, x, GROUND - 50, 80);
      g.addColorStop(0, 'rgba(122,180,130,.18)'); g.addColorStop(1, 'rgba(100,180,120,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 80, GROUND - 130, 160, 130);
    }
    ctx.fillStyle = active ? 'rgba(120,155,110,.65)' : 'rgba(90,85,65,.35)';
    ctx.beginPath(); ctx.moveTo(x - 24, GROUND); ctx.lineTo(x - 24, GROUND - 82); ctx.lineTo(x, GROUND - 106); ctx.lineTo(x + 24, GROUND - 82); ctx.lineTo(x + 24, GROUND); ctx.closePath(); ctx.fill();
    drawText(active ? '撤' : '西', x, GROUND - 48, 15, active ? 'rgba(225,235,200,.9)' : 'rgba(200,190,160,.4)', 'center', '"KaiTi",serif');
  }
  function drawCivilians() {
    if (S.chapter !== 2 || !S.chapterState || !S.chapterState.civilians) return;
    for (const c of S.chapterState.civilians) {
      const x = c.x - S.camX;
      if (x < -25 || x > VW + 25) continue;
      const bob = Math.sin(c.phase) * 2;
      ctx.save();
      ctx.globalAlpha = .46;
      ctx.fillStyle = '#211f18';
      ctx.beginPath(); ctx.arc(x, GROUND - 38 + bob, 5, 0, TAU); ctx.fill();
      ctx.fillRect(x - 4, GROUND - 33 + bob, 8, 20);
      ctx.strokeStyle = '#211f18'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 3, GROUND - 14 + bob); ctx.lineTo(x - 9, GROUND); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 3, GROUND - 14 + bob); ctx.lineTo(x + 8, GROUND); ctx.stroke();
      ctx.fillStyle = '#39332a'; ctx.fillRect(x + 6, GROUND - 40 + bob, 8, 9);
      ctx.restore();
    }
  }

  /* ---------------- 人物与战斗绘制 ---------------- */
  function drawPlayerFigure(p) {
    const sx = p.x - S.camX;
    const sy = p.y;
    if (!isVisible(sx, 100)) return;
    const crouch = p.crouch;
    const hipY = sy - (crouch ? 25 : 38);
    const torsoTop = sy - (crouch ? 49 : 68);
    const headY = sy - (crouch ? 57 : 77);
    const facing = p.facing || 1;
    const walkSwing = p.moving ? Math.sin(p.walk) * 5 : Math.sin(p.walk * .4) * .8;

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(sx, sy + 3, 23, 5, 0, 0, TAU); ctx.fill();

    // 大刀（背在身后）
    if (p.knife !== false) {
      ctx.save();
      ctx.strokeStyle = 'rgba(170,175,165,.75)'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(sx - facing * 13, torsoTop + 8);
      ctx.quadraticCurveTo(sx - facing * 28, torsoTop + 18, sx - facing * 23, hipY + 3);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(158,48,38,.8)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sx - facing * 13, torsoTop + 8); ctx.lineTo(sx - facing * 7, torsoTop + 14); ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(facing, 1);
    // 腿
    const legY = hipY - sy;
    ctx.strokeStyle = '#363b32'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-5, legY);
    ctx.lineTo(-8 - walkSwing * .5, crouch ? -14 : -3);
    ctx.stroke();
    ctx.strokeStyle = '#43483d';
    ctx.beginPath();
    ctx.moveTo(5, legY);
    ctx.lineTo(8 + walkSwing * .5, crouch ? -14 : -3);
    ctx.stroke();
    // 靴子
    ctx.fillStyle = '#1e1e19';
    ctx.fillRect(-14 - walkSwing * .5, crouch ? -17 : -6, 12, 6);
    ctx.fillRect(6 + walkSwing * .5, crouch ? -17 : -6, 12, 6);
    // 军大衣/躯干
    ctx.fillStyle = '#4d564b';
    ctx.beginPath();
    ctx.moveTo(-13, torsoTop - sy);
    ctx.quadraticCurveTo(0, torsoTop - sy - 3, 13, torsoTop - sy);
    ctx.lineTo(15, legY + 6);
    ctx.lineTo(-15, legY + 6);
    ctx.closePath(); ctx.fill();
    // 侧边阴影
    ctx.fillStyle = 'rgba(20,24,19,.25)';
    ctx.fillRect(6, torsoTop - sy + 2, 9, legY - torsoTop + 4);
    // 腰带
    ctx.fillStyle = '#29251b';
    ctx.fillRect(-14, legY - 5, 28, 5);
    ctx.fillStyle = '#9a7d45'; ctx.fillRect(-2, legY - 5, 5, 3);
    // 弹药袋
    ctx.fillStyle = '#3b3a2d';
    ctx.fillRect(-14, legY - 13, 8, 8);
    ctx.fillRect(7, legY - 13, 8, 8);
    // 领口
    ctx.fillStyle = '#5b6558';
    ctx.beginPath(); ctx.moveTo(-8, torsoTop - sy + 1); ctx.lineTo(0, torsoTop - sy + 10); ctx.lineTo(8, torsoTop - sy + 1); ctx.closePath(); ctx.fill();
    // 头
    ctx.fillStyle = '#b58a69';
    ctx.beginPath(); ctx.ellipse(0, headY - sy, 8, 9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(70,42,28,.25)';
    ctx.beginPath(); ctx.ellipse(3, headY - sy + 2, 5, 6, 0, 0, TAU); ctx.fill();
    // 军帽
    ctx.fillStyle = '#3d463d';
    ctx.beginPath();
    ctx.moveTo(-9, headY - sy - 4);
    ctx.quadraticCurveTo(-7, headY - sy - 13, 0, headY - sy - 13);
    ctx.quadraticCurveTo(8, headY - sy - 12, 9, headY - sy - 4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2f372f';
    ctx.beginPath(); ctx.ellipse(1, headY - sy - 4, 10, 3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#a38654'; ctx.beginPath(); ctx.arc(0, headY - sy - 8, 1.8, 0, TAU); ctx.fill();
    // 眼睛
    ctx.fillStyle = 'rgba(35,25,18,.85)';
    ctx.fillRect(2, headY - sy - 1, 2, 1.3);
    // 挎包/水壶
    ctx.fillStyle = '#4d4b39'; ctx.fillRect(-17, torsoTop - sy + 12, 6, 13);
    ctx.restore();

    // 手臂与步枪
    const shx = sx + facing * 7;
    const shy = sy - (crouch ? 38 : 58);
    const angle = p.aim + (p.reloading ? .55 : 0);
    ctx.strokeStyle = '#394036'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(shx, shy); ctx.lineTo(shx + Math.cos(angle) * 17, shy + Math.sin(angle) * 17); ctx.stroke();
    ctx.save();
    ctx.translate(shx, shy);
    ctx.rotate(angle);
    // 枪托
    ctx.fillStyle = '#3b2414';
    ctx.beginPath(); ctx.moveTo(-24, -3); ctx.lineTo(-5, -4); ctx.lineTo(-3, 4); ctx.lineTo(-22, 6); ctx.closePath(); ctx.fill();
    // 机匣
    ctx.fillStyle = '#1a1c1b'; ctx.fillRect(-4, -3.5, 16, 6);
    // 枪管
    ctx.fillStyle = '#2e3230'; ctx.fillRect(10, -1.8, 43, 3);
    ctx.fillStyle = '#4a4d46'; ctx.fillRect(10, -1.8, 43, 1);
    // 准星
    ctx.fillStyle = '#121413'; ctx.fillRect(47, -4, 2, 4);
    // 枪栓
    ctx.fillStyle = '#2b2d29'; ctx.fillRect(2, 2, 3, 4);
    // 手
    ctx.fillStyle = '#a97e5f';
    ctx.beginPath(); ctx.arc(6, 2, 3.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(25, 0, 2.6, 0, TAU); ctx.fill();
    if (p.muzzle > 0) {
      drawMuzzleFlare(52, 0, 1);
    }
    ctx.restore();    // 拉栓/装填提示
    if (p.reloading) {
      drawText('装填', sx, sy - 94, 9, 'rgba(220,190,120,.7)', 'center', '"Songti SC",serif');
    }
    // 受伤闪光
    if (p.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,220,190,${p.hitFlash * 2})`;
      ctx.beginPath(); ctx.ellipse(sx, sy - 38, 22, 38, 0, 0, TAU); ctx.fill();
    }
    // 大刀挥砍
    if (p.meleeT > 0) {
      const k = 1 - p.meleeT / .24;
      ctx.save();
      ctx.translate(sx, sy - 38);
      ctx.rotate(p.aim);
      ctx.strokeStyle = `rgba(245,225,180,${.8 * (1 - k)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 66, -.9 + k * .5, .9 + k * .5);
      ctx.stroke();
      ctx.strokeStyle = `rgba(235,180,110,${.5 * (1 - k)})`;
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.arc(0, 0, 62, -.8 + k * .5, .8 + k * .5); ctx.stroke();
      ctx.restore();
    }
  }
  function drawEnemyFigure(e) {
    if (e.nest) { drawNest(e); return; }
    const sx = e.x - S.camX;
    if (!isVisible(sx, 90)) return;
    if (!e.alive) {
      const a = clamp(1 - (e.deathT - 2.5) / 1, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.ellipse(sx, GROUND + 2, 24, 5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#4b4d3b';
      ctx.beginPath(); ctx.ellipse(sx, GROUND - 10, 24, 9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3a3d30'; ctx.beginPath(); ctx.arc(sx + 20, GROUND - 14, 7, 0, TAU); ctx.fill();
      ctx.restore();
      return;
    }
    const crouch = e.type === 'mg';
    const bodyH = crouch ? 52 : 68;
    const hipY = GROUND - (crouch ? 22 : 35);
    const hipLocal = -(GROUND - hipY);
    const torsoTop = GROUND - bodyH;
    const headY = torsoTop - 7;
    const walk = e.type === 'charger' ? Math.sin(e.walk) * 7 : Math.sin(e.walk) * 3;
    const facing = e.facing || -1;
    ctx.fillStyle = 'rgba(0,0,0,.32)';
    ctx.beginPath(); ctx.ellipse(sx, GROUND + 3, 21, 5, 0, 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(sx, GROUND);
    ctx.scale(facing, 1);
    if (e.type === 'charger') {
      ctx.strokeStyle = '#3a3b2e'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-5, hipLocal); ctx.lineTo(-12 - walk * .4, -2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(5, hipLocal); ctx.lineTo(11 + walk * .4, -2); ctx.stroke();
    } else {
      ctx.strokeStyle = '#3a3c2e'; ctx.lineWidth = 8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-5, hipLocal); ctx.lineTo(-8 - walk * .5, -3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(5, hipLocal); ctx.lineTo(8 + walk * .5, -3); ctx.stroke();
      ctx.fillStyle = '#1d1d17'; ctx.fillRect(-14 - walk * .5, -7, 11, 7); ctx.fillRect(5 + walk * .5, -7, 11, 7);
    }
    // 军大衣
    ctx.fillStyle = e.type === 'charger' ? '#4c4a37' : '#54513f';
    ctx.beginPath();
    ctx.moveTo(-12, -bodyH);
    ctx.quadraticCurveTo(0, -bodyH - 2, 12, -bodyH);
    ctx.lineTo(14, hipLocal + 4);
    ctx.lineTo(-14, hipLocal + 4);
    ctx.closePath(); ctx.fill();
    // 背包
    ctx.fillStyle = '#393a2d'; ctx.fillRect(-17, -bodyH + 8, 7, 17);
    // 腰带
    ctx.fillStyle = '#29271d'; ctx.fillRect(-13, hipLocal - 2, 26, 4);
    ctx.fillStyle = '#6f6244'; ctx.fillRect(-2, hipLocal - 2, 4, 2);
    // 头
    ctx.fillStyle = '#a37b5e';
    ctx.beginPath(); ctx.arc(0, -bodyH - 2, 7.5, 0, TAU); ctx.fill();
    // 钢盔
    ctx.fillStyle = '#383c31';
    ctx.beginPath(); ctx.ellipse(0, -bodyH - 6, 10.5, 7.5, 0, Math.PI, TAU); ctx.fill();
    ctx.fillStyle = '#2a2d25';
    ctx.beginPath(); ctx.ellipse(1, -bodyH - 5, 11.5, 3.2, 0, 0, TAU); ctx.fill();
    // 脸影
    ctx.fillStyle = 'rgba(30,22,16,.3)'; ctx.fillRect(3, -bodyH - 2, 5, 6);
    ctx.restore();
    // 步枪/刺刀
    const fromX = sx + facing * 6;
    const fromY = GROUND - (crouch ? 36 : 50);
    const angle = e.aim;
    ctx.strokeStyle = '#3c3b2d'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(fromX + Math.cos(angle) * 14, fromY + Math.sin(angle) * 14); ctx.stroke();
    ctx.save();
    ctx.translate(fromX, fromY);
    ctx.rotate(angle);
    if (e.type === 'charger') {
      ctx.strokeStyle = '#c7c9bc'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(30, 0); ctx.stroke();
      ctx.strokeStyle = '#4b3020'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(4, 0); ctx.stroke();
    } else {
      ctx.fillStyle = '#3b2415'; ctx.fillRect(-17, -2, 13, 4);
      ctx.fillStyle = '#1c1e1b'; ctx.fillRect(-4, -2, 12, 4);
      ctx.fillStyle = '#2d302c'; ctx.fillRect(7, -1.4, 30, 2.8);
      if (e.muzzle > 0) drawMuzzleFlare(36, 0, .8);
    }
    ctx.restore();
    if (e.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,225,190,${e.hitFlash * 1.8})`;
      ctx.beginPath(); ctx.ellipse(sx, GROUND - 36, 20, 34, 0, 0, TAU); ctx.fill();
    }
    // 敌军识别标记
    if (e.alive && Math.abs(e.x - (S.player ? S.player.x : 0)) < 700) {
      ctx.fillStyle = 'rgba(196,76,55,.65)';
      ctx.beginPath();
      ctx.moveTo(sx, GROUND - 84);
      ctx.lineTo(sx - 4, GROUND - 92);
      ctx.lineTo(sx + 4, GROUND - 92);
      ctx.closePath(); ctx.fill();
    }
  }
  function drawNest(e) {
    const sx = e.x - S.camX;
    if (!isVisible(sx, 120)) return;
    const dead = !e.alive;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(sx, GROUND + 3, 48, 7, 0, 0, TAU); ctx.fill();
    // 沙袋掩体
    drawSandbag(sx - 48, GROUND - 48, 96, 48);
    // 盾板
    ctx.fillStyle = dead ? '#2c2c27' : '#343a36';
    ctx.beginPath(); ctx.moveTo(sx - 30, GROUND - 55); ctx.lineTo(sx + 30, GROUND - 55); ctx.lineTo(sx + 25, GROUND - 20); ctx.lineTo(sx - 25, GROUND - 20); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(150,145,120,.25)'; ctx.lineWidth = 2; ctx.stroke();
    // 机枪
    ctx.strokeStyle = dead ? '#26251f' : '#383b36'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(sx + 4, GROUND - 40); ctx.lineTo(sx - 58, GROUND - 44); ctx.stroke();
    ctx.strokeStyle = '#242722'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(sx - 58, GROUND - 44); ctx.lineTo(sx - 100, GROUND - 44); ctx.stroke();
    // 枪手
    if (!dead) {
      ctx.fillStyle = '#a37b5e'; ctx.beginPath(); ctx.arc(sx - 3, GROUND - 58, 6.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#353a31'; ctx.beginPath(); ctx.ellipse(sx - 2, GROUND - 62, 9, 6, 0, Math.PI, TAU); ctx.fill();
      if (e.muzzle > 0) drawMuzzleFlareAt(sx - 100, GROUND - 44, e.aim, .9);
    } else {
      ctx.fillStyle = 'rgba(20,20,17,.65)';
      ctx.beginPath(); ctx.arc(sx - 5, GROUND - 34, 8, 0, TAU); ctx.fill();
    }
    // 血条
    if (e.hp < e.maxHp && !dead) {
      const w = 80;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(sx - w / 2, GROUND - 88, w, 5);
      ctx.fillStyle = '#b34a33'; ctx.fillRect(sx - w / 2, GROUND - 88, w * clamp(e.hp / e.maxHp, 0, 1), 5);
      drawText('机枪巢', sx, GROUND - 95, 8, 'rgba(220,175,120,.65)', 'center', '"Songti SC",serif');
    }
    ctx.restore();
  }
  function drawMuzzleFlare(x, y, scale) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 1, x, y, 22 * scale);
    g.addColorStop(0, 'rgba(255,250,210,.95)');
    g.addColorStop(.3, 'rgba(255,200,110,.8)');
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 30, y - 30, 60, 60);
    ctx.strokeStyle = 'rgba(255,235,170,.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x + 18, y); ctx.moveTo(x, y - 15); ctx.lineTo(x, y + 15); ctx.stroke();
    ctx.restore();
  }
  function drawMuzzleFlareAt(x, y, angle, scale) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); drawMuzzleFlare(0, 0, scale); ctx.restore();
  }
  function drawAllyFigure(a) {
    const sx = a.x - S.camX;
    if (!isVisible(sx, 80)) return;
    if (!a.alive) {
      ctx.fillStyle = 'rgba(45,49,41,.7)';
      ctx.beginPath(); ctx.ellipse(sx, GROUND - 8, 22, 7, 0, 0, TAU); ctx.fill();
      return;
    }
    const crouch = true;
    const hip = GROUND - 22, torsoTop = GROUND - 51, headY = GROUND - 58;
    const facing = a.facing || 1;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(sx, GROUND + 2, 20, 4, 0, 0, TAU); ctx.fill();
    ctx.translate(sx, GROUND); ctx.scale(facing, 1);
    ctx.strokeStyle = '#363b34'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-5, -(GROUND - hip)); ctx.lineTo(-12, -2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5, -(GROUND - hip)); ctx.lineTo(11, -2); ctx.stroke();
    ctx.fillStyle = '#4a5348';
    ctx.beginPath(); ctx.moveTo(-12, torsoTop - GROUND); ctx.lineTo(12, torsoTop - GROUND); ctx.lineTo(14, hip - GROUND + 3); ctx.lineTo(-14, hip - GROUND + 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#29261c'; ctx.fillRect(-13, hip - GROUND - 3, 26, 4);
    ctx.fillStyle = '#a67e60'; ctx.beginPath(); ctx.arc(0, headY - GROUND, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#374036'; ctx.beginPath(); ctx.ellipse(0, headY - GROUND - 5, 9, 6, 0, Math.PI, TAU); ctx.fill();
    ctx.restore();
    const shx = sx + facing * 5, shy = GROUND - 44;
    ctx.strokeStyle = '#3a4137'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(shx, shy); ctx.lineTo(shx + Math.cos(a.aim) * 13, shy + Math.sin(a.aim) * 13); ctx.stroke();
    ctx.save(); ctx.translate(shx, shy); ctx.rotate(a.aim);
    ctx.fillStyle = '#3a2415'; ctx.fillRect(-15, -2, 12, 4);
    ctx.fillStyle = '#232620'; ctx.fillRect(-3, -1.5, 34, 3);
    if (a.muzzle > 0) drawMuzzleFlare(33, 0, .7);
    ctx.restore();
  }
  function drawBullets() {
    for (const b of S.bullets) {
      const x = b.x - S.camX, y = b.y;
      const px = b.px - S.camX, py = b.py;
      if (x < -40 || x > VW + 40) continue;
      ctx.save();
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.owner === 'player' ? 2 : 1.6;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
      ctx.globalAlpha = .22;
      ctx.lineWidth = b.owner === 'player' ? 6 : 4;
      ctx.strokeStyle = b.color;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
      ctx.restore();
    }
  }
  function drawEffects() {
    // 弹壳
    for (const c of S.casings) {
      ctx.save(); ctx.translate(c.x - S.camX, c.y); ctx.rotate(c.rot);
      ctx.fillStyle = '#b99652'; ctx.fillRect(-2, -1, 4, 2);
      ctx.restore();
    }
    // 粒子
    for (const p of S.particles) {
      const x = p.x - S.camX, y = p.y;
      if (x < -60 || x > VW + 60) continue;
      const k = p.life / p.max;
      if (p.type === 'smoke') {
        ctx.globalAlpha = (1 - k) * .34;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(x, y, p.size, 0, TAU); ctx.fill();
      } else if (p.type === 'spark') {
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = p.color; ctx.lineWidth = p.size;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - p.vx * .014, y - p.vy * .014); ctx.stroke();
      } else {
        ctx.globalAlpha = (1 - k) * .6;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(x, y, p.size, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // 枪口火光
    for (const f of S.flashes) {
      const k = f.life / f.max;
      const x = f.x - S.camX, y = f.y;
      ctx.save();
      ctx.translate(x, y); ctx.rotate(f.angle);
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#ffe4a0';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(28 * f.scale, -8 * f.scale); ctx.lineTo(12 * f.scale, 0); ctx.lineTo(28 * f.scale, 8 * f.scale); ctx.closePath(); ctx.fill();
      const g = ctx.createRadialGradient(6, 0, 1, 6, 0, 24);
      g.addColorStop(0, 'rgba(255,245,200,.9)'); g.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = g; ctx.fillRect(-10, -25, 60, 50);
      ctx.restore();
    }
    // 爆炸
    for (const e of S.explosions) {
      const x = e.x - S.camX, y = e.y;
      const k = e.life / e.max;
      const rr = 18 + k * 75;
      ctx.globalAlpha = (1 - k);
      ctx.drawImage(FX.glow, x - rr, y - rr, rr * 2, rr * 2);
      ctx.strokeStyle = `rgba(255,190,110,${(1 - k) * .5})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, rr * .65, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // 刀光
    for (const s of S.slashes) {
      const k = s.life / s.max;
      ctx.save();
      ctx.translate(s.x - S.camX, s.y);
      ctx.rotate(s.angle);
      ctx.globalAlpha = (1 - k) * .7;
      ctx.strokeStyle = '#f4ddb0'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, s.range * .78, -.7 + k * .2, .7 + k * .2); ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    // 炮击警告
    for (const m of S.mortars) {
      const x = m.x - S.camX;
      if (m.timer > 0) {
        ctx.save();
        ctx.strokeStyle = `rgba(220,75,50,${.45 + Math.sin(S.time * 12) * .2})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x, GROUND - 3, m.radius, 14, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(220,75,50,.08)'; ctx.fill();
        drawText('炮击', x, GROUND - 40, 10, 'rgba(230,110,80,.8)', 'center', '"Songti SC",serif');
        ctx.restore();
      }
    }
  }
  function drawOffscreenMarkers() {
    if (S.mode !== 'playing' || !S.player) return;
    let right = 0, left = 0;
    for (const e of S.enemies) {
      if (!e.alive) continue;
      if (e.x > S.camX + VW - 20) right++;
      else if (e.x < S.camX + 20) left++;
    }
    if (right) {
      ctx.fillStyle = 'rgba(190,65,45,.8)';
      ctx.beginPath(); ctx.moveTo(VW - 24, GROUND - 80); ctx.lineTo(VW - 8, GROUND - 88); ctx.lineTo(VW - 8, GROUND - 72); ctx.closePath(); ctx.fill();
      drawText(String(right), VW - 38, GROUND - 80, 9, 'rgba(230,170,130,.7)', 'center', '"Songti SC",serif');
    }
    if (left) {
      ctx.fillStyle = 'rgba(190,65,45,.8)';
      ctx.beginPath(); ctx.moveTo(24, GROUND - 80); ctx.lineTo(8, GROUND - 88); ctx.lineTo(8, GROUND - 72); ctx.closePath(); ctx.fill();
    }
  }
  /* ---------------- 静态场景缓存 ---------------- */
  function renderWorldLayer(width, height, painter, translateY) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(width));
    c.height = Math.max(1, Math.ceil(height));
    const g = c.getContext('2d');
    const oldCtx = ctx, oldVW = VW, oldCam = S.camX;
    ctx = g;
    VW = width;
    S.camX = 0;
    if (translateY) g.translate(0, translateY);
    try {
      painter();
    } finally {
      ctx = oldCtx;
      VW = oldVW;
      S.camX = oldCam;
    }
    return c;
  }
  function buildLevelCaches() {
    if (!S.level) return;
    const type = S.level.type;
    const w = S.level.width;
    S.levelCache = renderWorldLayer(w, VH, () => {
      if (type === 'stone') drawStoneBridge();
      else if (type === 'rail') drawRailBridge();
      else drawNanyuan();
    });
    // 沙袋/木箱/矮墙是静态的，单独缓存成一条 150px 高的长图
    const top = GROUND - 100, oh = 150;
    S.obstacleCache = renderWorldLayer(w, oh, () => drawObstacles(), -top);
    S.obstacleCacheTop = top;
    S.obstacleCacheH = oh;
  }
  function buildMenuCache() {
    if (S.menuCache) return;
    S.menuCache = renderWorldLayer(1900, VH, () => drawStoneBridge());
  }
  function drawLevelCached() {
    if (!S.levelCache) {
      const type = S.level.type;
      if (type === 'stone') drawStoneBridge();
      else if (type === 'rail') drawRailBridge();
      else drawNanyuan();
      return;
    }
    const sw = Math.min(VW, S.level.width - S.camX);
    if (sw > 0) {
      ctx.drawImage(S.levelCache, S.camX, 0, sw, VH, 0, 0, sw, VH);
    }
  }
  function drawObstacleCached() {
    if (!S.obstacleCache) { drawObstacles(); return; }
    const sw = Math.min(VW, S.level.width - S.camX);
    if (sw > 0) {
      ctx.drawImage(S.obstacleCache, S.camX, 0, sw, S.obstacleCacheH, 0, S.obstacleCacheTop, sw, S.obstacleCacheH);
    }
  }

  function drawMenuScene() {
    S.camX = 0;
    drawSky('stone', true);
    drawFar('stone');
    if (S.menuCache) {
      const sw = Math.min(VW, S.menuCache.width);
      ctx.drawImage(S.menuCache, 0, 0, sw, VH, 0, 0, sw, VH);
    } else {
      drawStoneBridge();
    }
    // 远处火光
    for (let i = 0; i < 3; i++) {
      const x = VW * (.58 + i * .11);
      const g = ctx.createRadialGradient(x, GROUND - 80, 4, x, GROUND - 80, 120);
      g.addColorStop(0, 'rgba(255,122,46,.15)'); g.addColorStop(1, 'rgba(200,60,20,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 130, GROUND - 190, 260, 190);
    }
    // 菜单里的守桥军旗
    const oldFlag = S.flag;
    S.flag = { x: VW * .62, y: GROUND, planted: true };
    drawFlag();
    S.flag = oldFlag;
    // 哨兵周围的环境光
    const guardX = VW * .72;
    const gl = ctx.createRadialGradient(guardX, GROUND - 40, 4, guardX, GROUND - 40, 150);
    gl.addColorStop(0, 'rgba(220,195,150,.10)');
    gl.addColorStop(1, 'rgba(220,195,150,0)');
    ctx.fillStyle = gl; ctx.fillRect(guardX - 170, GROUND - 190, 340, 220);
    // 哨兵
    const guard = {
      x: VW * .72, y: GROUND, aim: .02, facing: 1, crouch: false,
      walk: S.menuTime * 1.2, moving: false, meleeT: 0, muzzle: 0,
      reloading: false, hitFlash: 0, knife: true
    };
    drawPlayerFigure(guard);
    // 前景石狮
    drawLion(VW * .9, GROUND - 8, 1.7, .72);
    drawRain();
    const vg = ctx.createLinearGradient(0, 0, VW, 0);
    vg.addColorStop(0, 'rgba(5,7,7,.58)');
    vg.addColorStop(.5, 'rgba(5,7,7,.12)');
    vg.addColorStop(1, 'rgba(5,7,7,.18)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
  }
  function drawBattleScene() {
    if (!S.player || !S.level) { drawMenuScene(); return; }
    const type = S.level.type;
    ctx.save();
    if (S.shake > 0) {
      const s = S.shake * 5;
      ctx.translate(rand(-s, s), rand(-s, s));
    }
    drawSky(type, false);
    drawFar(type);
    drawLevelCached();
    drawFires();
    drawCivilians();
    drawObstacleCached();
    // 玩家周围的微弱环境光，避免角色淹没在夜色里
    if (S.player) {
      const px = S.player.x - S.camX;
      const py = GROUND - 34;
      const lg = ctx.createRadialGradient(px, py, 4, px, py, 190);
      lg.addColorStop(0, 'rgba(200,190,160,.055)');
      lg.addColorStop(1, 'rgba(200,190,160,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(px - 200, py - 200, 400, 300);
    }
    drawExit();
    drawSupply();
    drawFlag();
    drawPickups();
    for (const a of S.allies) drawAllyFigure(a);
    for (const e of S.enemies) drawEnemyFigure(e);
    if (S.player.alive) drawPlayerFigure(S.player);
    drawBullets();
    drawEffects();
    drawRain();
    drawOffscreenMarkers();
    ctx.restore();
    // 受伤/火光泛光
    if (S.flash > 0) {
      ctx.fillStyle = `rgba(255,220,170,${S.flash * .08})`;
      ctx.fillRect(0, 0, VW, VH);
    }
  }

  /* ---------------- 环境与主循环 ---------------- */
  function initAtmosphere() {
    S.stars = [];
    for (let i = 0; i < 120; i++) {
      S.stars.push({
        x: rand(0, 1900), y: rand(20, 430), r: rand(.7, 1.8),
        a: rand(.18, .85), sp: rand(.5, 2.2), ph: rand(0, 10)
      });
    }
    S.rain = [];
    for (let i = 0; i < 110; i++) {
      S.rain.push({
        x: rand(-80, 1900), y: rand(0, VH), len: rand(7, 18),
        speed: rand(380, 720), wind: rand(20, 70)
      });
    }
    S.time = 0;
    S.menuTime = 0;
  }
  function updateAmbient(dt) {
    for (const d of S.rain) {
      d.y += d.speed * dt;
      d.x -= d.wind * dt;
      if (d.y > VH) { d.y = rand(-80, -10); d.x = rand(-50, VW + 60); }
      if (d.x < -90) d.x = VW + rand(0, 60);
      if (d.x > VW + 90) d.x = -rand(0, 60);
    }
    for (const f of S.fires) f.phase += dt * 2.2;
    if ((S.mode === 'playing' || S.mode === 'dialogue') && S.fires.length && S.particles.length < 130 && Math.random() < dt * 1.4) {
      const f = S.fires[randInt(0, S.fires.length - 1)];
      spawnSmoke(f.x + rand(-22, 22), GROUND - 80 - rand(0, 30), rand(14, 26), rand(1.2, 2.2), 'rgba(75,68,58,.28)');
    }
  }
  function updatePrompt() {
    if (!S.player || S.mode !== 'playing') { showPrompt(null); return; }
    const p = S.player;
    if (S.supply && !S.supply.used && Math.abs(p.x - (S.supply.x + S.supply.w / 2)) < 78) {
      showPrompt('打开补给箱 · 补充体力与弹药');
      return;
    }
    if (S.chapter === 1 && S.flag && !S.flag.planted && Math.abs(p.x - S.flag.x) < 110) {
      showPrompt(S.chapterState.nestsDown >= 2 ? '竖起军旗 · 29军守桥' : '先摧毁两座机枪巢');
      return;
    }
    if (S.chapter === 2 && S.chapterState.phase === 'retreat' && p.x < 420) {
      showPrompt('向左撤离 · 南苑已经失守', '←');
      return;
    }
    showPrompt(null);
  }
  function updateGame(dt) {
    if (!S.player || !S.level) return;
    S.playTime += dt;
    updatePlayer(dt);
    updateEnemies(dt);
    updateAllies(dt);
    updateBullets(dt);
    updateEffects(dt);
    updateChapters(dt);
    updatePickups(dt);
    if (S.mode === 'playing') {
      S.hudTimer += dt;
      if (S.hudTimer > .1) { S.hudTimer = 0; updateHUD(); }
      S.promptTimer += dt;
      if (S.promptTimer > .12) { S.promptTimer = 0; updatePrompt(); }
      S.nextDistant = (S.nextDistant || rand(3, 7)) - dt;
      if (S.nextDistant <= 0) {
        S.nextDistant = rand(3.5, 8);
        sfx('enemyShot', 900);
      }
    }
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    try {
      buildPortraits();
    } catch (e) {
      console.error('portrait error', e);
    }
    initAtmosphere();
    loadSave();
    setDifficulty('normal');
    bindInput();
    buildMenuCache();
    showMenu();
    UI.bootFill.style.width = '18%';
    UI.bootSub.textContent = '整理二十九军战地档案';
    let p = 18;
    const timer = setInterval(() => {
      p = Math.min(100, p + rand(12, 23));
      UI.bootFill.style.width = p + '%';
      if (p > 40) UI.bootSub.textContent = '标定卢沟桥 · 宛平城 · 铁路桥';
      if (p > 72) UI.bootSub.textContent = '核对二十九军战斗序列';
      if (p >= 100) {
        clearInterval(timer);
        UI.bootSub.textContent = '进入阵地';
        setTimeout(() => {
          UI.boot.classList.add('done');
          setTimeout(() => UI.boot.classList.add('hidden'), 900);
        }, 260);
      }
    }, 120);
    resize();
    setTimeout(resize, 200);
    requestAnimationFrame(loop);
    window.__LQ2D = {
      S, startChapter, beginPlay, shoot, melee, interact, damageEnemy, spawnEnemy,
      completeChapter, failChapter, updateGame, updatePrompt, openCodex, showMenu
    };
  }

  let lastTime = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (!lastTime) lastTime = now;
    const rawDt = clamp((now - lastTime) / 1000, 0, .1);
    lastTime = now;
    S.time += rawDt;
    if (S.mode === 'playing') {
      // 固定 60Hz 逻辑步进：低帧率时不会变成“慢动作”，移动和射击手感更稳
      S.accum = Math.min(S.accum + rawDt, .1);
      let steps = 0;
      while (S.accum >= 1 / 60 && steps < 6 && S.mode === 'playing') {
        updateGame(1 / 60);
        S.accum -= 1 / 60;
        steps++;
      }
      if (steps >= 6) S.accum = 0;
      updateAmbient(rawDt);
    } else {
      S.accum = 0;
      if (S.mode === 'menu' || S.mode === 'boot') {
        S.menuTime += rawDt;
        updateAmbient(rawDt);
      } else if (S.mode === 'dialogue') {
        updateDialogue(rawDt);
        updateAmbient(rawDt);
      } else {
        updateAmbient(rawDt);
      }
    }
    if (S.mode === 'playing') updateCrosshair();
    draw();
    if (S.mode === 'playing' && S.player && !S.player.alive) { /* failure handled */ }
  }

  // 静音键
  window.addEventListener('keydown', e => {
    if (e.code === 'KeyM') { e.preventDefault(); toggleMute(); }
  });

  boot();
})();

