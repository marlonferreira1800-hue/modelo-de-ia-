/**
 * ULTRA 64 CLOUD DECK — N64 Emulator (Mupen64Plus-Next) & 3D Cartridge Engine
 */

(() => {
  const canvas = document.getElementById('n64-canvas');
  const ctx = canvas.getContext('2d');
  const ejsContainer = document.getElementById('emulatorjs-container');
  const tvContainer = document.getElementById('tv-container');
  const stageHud = document.getElementById('stage-hud');

  const hudGameTitle = document.getElementById('hud-game-title');
  const hudSubStat = document.getElementById('hud-sub-stat');
  const hudScore = document.getElementById('hud-score');
  const fpsCounter = document.getElementById('fps-counter');
  const statusText = document.getElementById('status-text');
  const gamepadStatus = document.getElementById('gamepad-status');

  // Input State (Unified Keyboard + On-Screen N64 Pad + Physical Gamepad)
  const input = {
    x: 0,
    y: 0,
    a: false,
    b: false,
    z: false,
    start: false,
    cl: false,
    cr: false,
    cu: false,
    cd: false,
    aJustPressed: false,
    bJustPressed: false,
    zJustPressed: false
  };

  const keys = {};
  let stickDrag = { active: false, x: 0, y: 0 };
  let touchButtons = {};

  // WebAudio N64 Sound Engine
  let audioCtx = null;
  let audioEnabled = true;

  function ensureAudio() {
    if (!audioEnabled) return null;
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSfx(type) {
    const actx = ensureAudio();
    if (!actx) return;
    const now = actx.currentTime;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.connect(gain);
    gain.connect(actx.destination);

    if (type === 'coin') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(987.77, now); // B5
      osc.frequency.setValueAtTime(1318.51, now + 0.07); // E6
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'star') {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      notes.forEach((freq, idx) => {
        const o = actx.createOscillator();
        const g = actx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(freq, now + idx * 0.08);
        g.gain.setValueAtTime(0.16, now + idx * 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);
        o.connect(g);
        g.connect(actx.destination);
        o.start(now + idx * 0.08);
        o.stop(now + idx * 0.08 + 0.25);
      });
    } else if (type === 'jump') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(580, now + 0.16);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (type === 'laser') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.12);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      osc.start(now);
      osc.stop(now + 0.13);
    } else if (type === 'boost') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(620, now + 0.32);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'explosion') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.28);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  }

  // Active Mode: 'kart64' | 'mario64' | 'starfox64' | 'realrom'
  let activeCart = 'kart64';
  let paused = false;

  // =========================================================================
  // GAME 1: ULTRA KART 64 (3D Perspective Track + Drifting + Rivals + Laps)
  // =========================================================================
  const kartState = {
    trackLength: 3600,
    segLength: 40,
    playerX: 0,
    playerZ: 0,
    speed: 0,
    maxSpeed: 290,
    steer: 0,
    driftDir: 0,
    driftCharge: 0,
    boostTimer: 0,
    lap: 1,
    totalLaps: 3,
    lapTime: 0,
    bestLap: null,
    rivals: [],
    segments: []
  };

  function initKart64() {
    kartState.playerX = 0;
    kartState.playerZ = 0;
    kartState.speed = 0;
    kartState.driftDir = 0;
    kartState.driftCharge = 0;
    kartState.boostTimer = 0;
    kartState.lap = 1;
    kartState.lapTime = 0;
    kartState.segments = [];

    const numSegs = kartState.trackLength / kartState.segLength;
    for (let i = 0; i < numSegs; i++) {
      let curve = 0;
      if (i > 10 && i < 28) curve = 2.2;
      else if (i >= 34 && i < 52) curve = -2.6;
      else if (i >= 60 && i < 78) curve = 1.8;

      const hill = Math.sin(i * 0.22) * 35;
      const isBoost = (i === 20 || i === 55 || i === 80);
      kartState.segments.push({
        index: i,
        curve,
        y: hill,
        isBoost,
        treeLeft: (i % 4 === 0),
        treeRight: (i % 4 === 2)
      });
    }

    kartState.rivals = [
      { name: 'Luigi', color: '#22c55e', z: 180, x: -0.45, speed: 225 },
      { name: 'Peach', color: '#f472b6', z: 340, x: 0.4, speed: 232 },
      { name: 'Yoshi', color: '#84cc16', z: 520, x: -0.25, speed: 240 },
      { name: 'Bowser', color: '#f97316', z: 720, x: 0.35, speed: 246 },
      { name: 'Wario', color: '#eab308', z: 920, x: -0.3, speed: 252 }
    ];
  }

  function updateKart64(dt) {
    kartState.lapTime += dt;

    const accel = input.a || input.y < -0.35;
    const brake = input.b || input.y > 0.45;

    if (kartState.boostTimer > 0) {
      kartState.boostTimer -= dt;
      kartState.speed = Math.min(365, kartState.speed + 420 * dt);
    } else if (accel) {
      kartState.speed = Math.min(kartState.maxSpeed, kartState.speed + 165 * dt);
    } else if (brake) {
      kartState.speed = Math.max(0, kartState.speed - 240 * dt);
    } else {
      kartState.speed = Math.max(0, kartState.speed - 85 * dt);
    }

    // Off-road slowdown
    if (Math.abs(kartState.playerX) > 1.05 && kartState.boostTimer <= 0) {
      kartState.speed = Math.min(kartState.speed, 135);
    }

    // Drifting with Z
    if (input.z && kartState.speed > 140 && Math.abs(input.x) > 0.15) {
      if (kartState.driftDir === 0) {
        kartState.driftDir = Math.sign(input.x);
        playSfx('jump');
      }
      kartState.driftCharge += dt;
    } else {
      if (kartState.driftCharge > 0.65) {
        kartState.boostTimer = 1.15;
        playSfx('boost');
      }
      kartState.driftDir = 0;
      kartState.driftCharge = 0;
    }

    const segIdx = Math.floor(kartState.playerZ / kartState.segLength) % kartState.segments.length;
    const currentSeg = kartState.segments[segIdx];

    // Steering + centrifugal force
    const steerStrength = kartState.driftDir !== 0 ? 2.1 : 1.55;
    kartState.playerX += input.x * steerStrength * (kartState.speed / kartState.maxSpeed) * dt;
    kartState.playerX -= (currentSeg.curve * 0.34) * (kartState.speed / kartState.maxSpeed) * dt;
    kartState.playerX = Math.max(-1.85, Math.min(1.85, kartState.playerX));

    if (currentSeg.isBoost && Math.abs(kartState.playerX) < 0.55 && kartState.boostTimer <= 0.2) {
      kartState.boostTimer = 1.0;
      playSfx('boost');
    }

    // Advance along track
    const prevZ = kartState.playerZ;
    kartState.playerZ += kartState.speed * dt;
    if (kartState.playerZ >= kartState.trackLength) {
      kartState.playerZ -= kartState.trackLength;
      if (kartState.lap < kartState.totalLaps) {
        kartState.lap++;
        playSfx('coin');
      } else {
        kartState.lap = 1;
        playSfx('star');
      }
    }

    // Update AI Rivals
    kartState.rivals.forEach((r, idx) => {
      r.z = (r.z + r.speed * dt) % kartState.trackLength;
      r.x = Math.sin((r.z * 0.01) + idx) * 0.55;
    });

    // Compute Player Race Position
    let aheadCount = 0;
    kartState.rivals.forEach((r) => {
      const diff = (r.z - kartState.playerZ + kartState.trackLength) % kartState.trackLength;
      if (diff > 0 && diff < kartState.trackLength * 0.5) aheadCount++;
    });
    const pos = 1 + aheadCount;

    hudGameTitle.textContent = 'ULTRA KART 64 — ROYAL RACEWAY';
    hudSubStat.innerHTML = `VOLTA: <strong>${kartState.lap} / ${kartState.totalLaps}</strong> • POSIÇÃO: <strong>${pos}º / 6</strong>`;
    hudScore.innerHTML = `VELOCIDADE: <strong>${Math.round(kartState.speed)} km/h</strong>`;
  }

  function renderKart64() {
    const W = canvas.width;
    const H = canvas.height;
    const horizon = H * 0.44;

    // Sky gradient (N64 Royal Blue to Horizon Cyan)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon);
    skyGrad.addColorStop(0, '#1d4ed8');
    skyGrad.addColorStop(1, '#93c5fd');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, horizon);

    // Distant N64 Low-Poly Mountains & Peach's Castle Silhouette
    const baseSegIdx = Math.floor(kartState.playerZ / kartState.segLength) % kartState.segments.length;
    const skyOffset = (kartState.playerZ * 0.15) % W;
    ctx.fillStyle = '#1e3a8a';
    for (let i = -1; i <= 2; i++) {
      const mx = i * 240 - (skyOffset * 0.3);
      ctx.beginPath();
      ctx.moveTo(mx, horizon);
      ctx.lineTo(mx + 120, horizon - 68);
      ctx.lineTo(mx + 240, horizon);
      ctx.fill();
    }

    // Castle on Horizon
    const castleX = W * 0.5 - kartState.segments[baseSegIdx].curve * 28;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(castleX - 28, horizon - 46, 56, 46);
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(castleX - 34, horizon - 46);
    ctx.lineTo(castleX, horizon - 78);
    ctx.lineTo(castleX + 34, horizon - 46);
    ctx.fill();

    // Grass Base
    ctx.fillStyle = '#15803d';
    ctx.fillRect(0, horizon, W, H - horizon);

    // Draw 3D Road Scanlines from Horizon to Bottom
    const drawDist = 38;
    let dx = 0;
    let camX = 0;

    const projSegments = [];
    for (let n = 0; n < drawDist; n++) {
      const seg = kartState.segments[(baseSegIdx + n) % kartState.segments.length];
      const zDist = (n + 1) * kartState.segLength - (kartState.playerZ % kartState.segLength);
      const scale = 140 / Math.max(10, zDist);

      dx += seg.curve * 0.055;
      camX += dx;

      const screenY = horizon + (H - horizon) * Math.pow(1 - n / drawDist, 1.75);
      const roadW = W * 0.72 * Math.pow(1 - n / drawDist, 1.45) + 28;
      const centerX = W * 0.5 - kartState.playerX * roadW * 0.65 + camX * 16;

      projSegments.push({
        n,
        seg,
        zDist,
        screenY,
        roadW,
        centerX,
        scale
      });
    }

    for (let i = projSegments.length - 1; i > 0; i--) {
      const curr = projSegments[i - 1];
      const prev = projSegments[i];
      const alt = curr.seg.index % 2 === 0;

      // Grass Strip
      ctx.fillStyle = alt ? '#16a34a' : '#15803d';
      ctx.fillRect(0, prev.screenY, W, curr.screenY - prev.screenY + 1);

      // Red/White N64 Kerbs
      ctx.fillStyle = alt ? '#ef4444' : '#f8fafc';
      ctx.beginPath();
      ctx.moveTo(prev.centerX - prev.roadW * 0.58, prev.screenY);
      ctx.lineTo(prev.centerX + prev.roadW * 0.58, prev.screenY);
      ctx.lineTo(curr.centerX + curr.roadW * 0.58, curr.screenY);
      ctx.lineTo(curr.centerX - curr.roadW * 0.58, curr.screenY);
      ctx.fill();

      // Asphalt Road
      ctx.fillStyle = curr.seg.isBoost ? '#facc15' : (alt ? '#475569' : '#334155');
      ctx.beginPath();
      ctx.moveTo(prev.centerX - prev.roadW * 0.5, prev.screenY);
      ctx.lineTo(prev.centerX + prev.roadW * 0.5, prev.screenY);
      ctx.lineTo(curr.centerX + curr.roadW * 0.5, curr.screenY);
      ctx.lineTo(curr.centerX - curr.roadW * 0.5, curr.screenY);
      ctx.fill();

      // Start/Finish Checkered Line
      if (curr.seg.index === 0) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(curr.centerX - curr.roadW * 0.48, prev.screenY, curr.roadW * 0.96, (curr.screenY - prev.screenY) * 0.8);
      }

      // Roadside Low-Poly N64 Trees
      if (curr.seg.treeLeft) {
        const tx = curr.centerX - curr.roadW * 0.78;
        const th = curr.roadW * 0.35;
        ctx.fillStyle = '#78350f';
        ctx.fillRect(tx - th * 0.08, curr.screenY - th * 0.35, th * 0.16, th * 0.35);
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(tx, curr.screenY - th * 0.55, th * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
      if (curr.seg.treeRight) {
        const tx = curr.centerX + curr.roadW * 0.78;
        const th = curr.roadW * 0.35;
        ctx.fillStyle = '#78350f';
        ctx.fillRect(tx - th * 0.08, curr.screenY - th * 0.35, th * 0.16, th * 0.35);
        ctx.fillStyle = '#16a34a';
        ctx.beginPath();
        ctx.arc(tx, curr.screenY - th * 0.55, th * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw Rival Karts on this segment
      kartState.rivals.forEach((r) => {
        const rSeg = Math.floor(r.z / kartState.segLength) % kartState.segments.length;
        if (rSeg === curr.seg.index) {
          const rx = curr.centerX + r.x * curr.roadW * 0.5;
          const rw = Math.max(12, curr.roadW * 0.16);
          const rh = rw * 0.75;
          // Tires
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(rx - rw * 0.55, curr.screenY - rh * 0.45, rw * 1.1, rh * 0.45);
          // Body
          ctx.fillStyle = r.color;
          ctx.fillRect(rx - rw * 0.4, curr.screenY - rh * 0.85, rw * 0.8, rh * 0.6);
          // Driver helmet
          ctx.fillStyle = '#fef08a';
          ctx.beginPath();
          ctx.arc(rx, curr.screenY - rh * 0.95, rw * 0.22, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // Draw Player N64 Kart in Foreground
    const px = W * 0.5 + input.x * 24 + kartState.driftDir * 14;
    const py = H - 48;

    // Drift Mini-Turbo Sparks
    if (kartState.driftDir !== 0) {
      const sparkColor = kartState.driftCharge > 0.65 ? '#f97316' : '#38bdf8';
      ctx.fillStyle = sparkColor;
      for (let s = 0; s < 6; s++) {
        const sx = px + (Math.random() - 0.5) * 86;
        const sy = py + 12 + Math.random() * 14;
        ctx.beginPath();
        ctx.arc(sx, sy, 4 + Math.random() * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Boost Flame
    if (kartState.boostTimer > 0) {
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(px - 18, py + 14);
      ctx.lineTo(px, py + 42 + Math.random() * 12);
      ctx.lineTo(px + 18, py + 14);
      ctx.fill();
    }

    // Kart Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(px, py + 18, 48, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Kart Rear Wheels
    ctx.fillStyle = '#111827';
    ctx.fillRect(px - 46, py - 8, 18, 24);
    ctx.fillRect(px + 28, py - 8, 18, 24);

    // Kart Chassis (Mario Red & White)
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(px - 30, py - 14, 60, 26);
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(px - 18, py - 24, 36, 14);

    // Driver Head & Cap
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(px, py - 32, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(px, py - 36, 13, Math.PI, Math.PI * 2);
    ctx.fill();
  }

  // =========================================================================
  // GAME 2: SUPER POLY 64 — STAR COURTYARD (3D Low-Poly Platformer)
  // =========================================================================
  const marioState = {
    x: 0,
    y: 0,
    z: -160,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    camYaw: 0,
    grounded: true,
    jumpCombo: 0,
    stars: 0,
    coins: 0,
    platforms: [],
    collectibles: [],
    enemies: []
  };

  function initMario64() {
    marioState.x = 0;
    marioState.y = 0;
    marioState.z = -180;
    marioState.vx = 0;
    marioState.vy = 0;
    marioState.vz = 0;
    marioState.camYaw = 0;
    marioState.stars = 0;
    marioState.coins = 0;

    marioState.platforms = [
      { x: -160, y: 45, z: -40, r: 52, color: '#d97706' },
      { x: 160, y: 75, z: -20, r: 52, color: '#0284c7' },
      { x: 0, y: 110, z: 95, r: 64, color: '#7c3aed' },
      { x: -140, y: 145, z: 180, r: 48, color: '#059669' },
      { x: 150, y: 165, z: 190, r: 48, color: '#dc2626' }
    ];

    marioState.collectibles = [
      // 5 Power Stars
      { type: 'star', x: -160, y: 85, z: -40, taken: false },
      { type: 'star', x: 160, y: 115, z: -20, taken: false },
      { type: 'star', x: 0, y: 150, z: 95, taken: false },
      { type: 'star', x: -140, y: 185, z: 180, taken: false },
      { type: 'star', x: 150, y: 205, z: 190, taken: false }
    ];

    // Ring of Gold Coins
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      marioState.collectibles.push({
        type: 'coin',
        x: Math.cos(ang) * 125,
        y: 22,
        z: Math.sin(ang) * 125,
        taken: false
      });
    }
  }

  function updateMario64(dt) {
    if (input.cl) marioState.camYaw -= 2.2 * dt;
    if (input.cr) marioState.camYaw += 2.2 * dt;

    const moveSpeed = input.z ? 245 : 175;
    const forwardX = Math.sin(marioState.camYaw);
    const forwardZ = Math.cos(marioState.camYaw);
    const rightX = Math.cos(marioState.camYaw);
    const rightZ = -Math.sin(marioState.camYaw);

    marioState.vx = (rightX * input.x - forwardX * input.y) * moveSpeed;
    marioState.vz = (rightZ * input.x - forwardZ * input.y) * moveSpeed;

    // Jump (A) or Long Jump (Z + A)
    if (input.aJustPressed && marioState.grounded) {
      marioState.jumpCombo = (marioState.jumpCombo % 3) + 1;
      const jumpPower = input.z ? 310 : (240 + marioState.jumpCombo * 38);
      marioState.vy = jumpPower;
      marioState.grounded = false;
      playSfx('jump');
    }

    // Dive / Dash (B)
    if (input.bJustPressed && !marioState.grounded) {
      marioState.vy = Math.max(marioState.vy, 120);
      marioState.vx *= 1.45;
      marioState.vz *= 1.45;
      playSfx('boost');
    }

    // Gravity
    marioState.vy -= 540 * dt;

    marioState.x += marioState.vx * dt;
    marioState.y += marioState.vy * dt;
    marioState.z += marioState.vz * dt;

    // Courtyard Bounds
    marioState.x = Math.max(-320, Math.min(320, marioState.x));
    marioState.z = Math.max(-320, Math.min(320, marioState.z));

    // Ground & Platform Collisions
    let floorY = 0;
    marioState.platforms.forEach((p) => {
      const dist = Math.hypot(marioState.x - p.x, marioState.z - p.z);
      if (dist < p.r && marioState.y >= p.y - 14) {
        floorY = Math.max(floorY, p.y);
      }
    });

    if (marioState.y <= floorY) {
      marioState.y = floorY;
      marioState.vy = 0;
      marioState.grounded = true;
    }

    // Collect Coins & Power Stars
    marioState.collectibles.forEach((c) => {
      if (c.taken) return;
      const dist = Math.hypot(marioState.x - c.x, marioState.y - (c.y - 16), marioState.z - c.z);
      if (dist < 38) {
        c.taken = true;
        if (c.type === 'star') {
          marioState.stars++;
          playSfx('star');
        } else {
          marioState.coins++;
          playSfx('coin');
        }
      }
    });

    // Respawn all if 5/5 stars collected
    if (marioState.stars >= 5) {
      setTimeout(() => {
        if (marioState.stars >= 5) initMario64();
      }, 1500);
    }

    hudGameTitle.textContent = 'SUPER POLY 64 — PEACH COURTYARD';
    hudSubStat.innerHTML = `ESTRELAS: <strong>★ ${marioState.stars} / 5</strong> • MOEDAS: <strong>● ${marioState.coins}</strong>`;
    hudScore.innerHTML = `ALTURA: <strong>${Math.round(marioState.y)}m</strong>`;
  }

  function project3D(wx, wy, wz, camX, camY, camZ, camYaw) {
    const dx = wx - camX;
    const dy = wy - camY;
    const dz = wz - camZ;

    const cosY = Math.cos(-camYaw);
    const sinY = Math.sin(-camYaw);

    const rx = dx * cosY - dz * sinY;
    const rz = dx * sinY + dz * cosY;

    if (rz <= 15) return null;
    const fov = 360;
    const sx = canvas.width * 0.5 + (rx / rz) * fov;
    const sy = canvas.height * 0.54 - (dy / rz) * fov;
    const scale = fov / rz;
    return { sx, sy, rz, scale };
  }

  function renderMario64(time) {
    const W = canvas.width;
    const H = canvas.height;

    // Sky & Courtyard Grass
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(0, 0, W, H * 0.5);
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(0, H * 0.5, W, H * 0.5);

    const camDist = 210;
    const camX = marioState.x - Math.sin(marioState.camYaw) * camDist;
    const camY = marioState.y + 85;
    const camZ = marioState.z - Math.cos(marioState.camYaw) * camDist;

    // Checkerboard Courtyard Tiles
    for (let gx = -300; gx <= 300; gx += 75) {
      for (let gz = -300; gz <= 300; gz += 75) {
        const p = project3D(gx, 0, gz, camX, camY, camZ, marioState.camYaw);
        if (p) {
          ctx.fillStyle = ((gx + gz) / 75) % 2 === 0 ? '#22c55e' : '#15803d';
          const sz = Math.max(4, 34 * p.scale);
          ctx.fillRect(p.sx - sz * 0.5, p.sy - sz * 0.2, sz, sz * 0.4);
        }
      }
    }

    // Collectibles, Platforms & Player sorted by Depth (Painter's Algorithm)
    const renderables = [];

    marioState.platforms.forEach((plat) => {
      const p = project3D(plat.x, plat.y, plat.z, camX, camY, camZ, marioState.camYaw);
      if (p) renderables.push({ kind: 'plat', p, data: plat });
    });

    marioState.collectibles.forEach((c) => {
      if (c.taken) return;
      const p = project3D(c.x, c.y + Math.sin(time * 4) * 5, c.z, camX, camY, camZ, marioState.camYaw);
      if (p) renderables.push({ kind: c.type, p, data: c });
    });

    const playerProj = project3D(marioState.x, marioState.y, marioState.z, camX, camY, camZ, marioState.camYaw);
    if (playerProj) {
      renderables.push({ kind: 'player', p: playerProj });
    }

    renderables.sort((a, b) => b.p.rz - a.p.rz);

    renderables.forEach((item) => {
      const { sx, sy, scale } = item.p;
      if (item.kind === 'plat') {
        const rw = item.data.r * 1.8 * scale;
        const rh = 24 * scale;
        ctx.fillStyle = item.data.color;
        ctx.fillRect(sx - rw * 0.5, sy, rw, rh);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(sx - rw * 0.5, sy - 4 * scale, rw, 5 * scale);
      } else if (item.kind === 'coin') {
        const r = Math.max(4, 12 * scale);
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.ellipse(sx, sy, r * Math.abs(Math.cos(time * 4)), r, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (item.kind === 'star') {
        const r = Math.max(7, 20 * scale);
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ca8a04';
        ctx.font = `bold ${Math.round(r * 1.3)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', sx, sy);
      } else if (item.kind === 'player') {
        // Ground Shadow
        const floorProj = project3D(marioState.x, 0, marioState.z, camX, camY, camZ, marioState.camYaw);
        if (floorProj) {
          ctx.fillStyle = 'rgba(0,0,0,0.4)';
          ctx.beginPath();
          ctx.ellipse(floorProj.sx, floorProj.sy, 18 * floorProj.scale, 7 * floorProj.scale, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        const sz = Math.max(10, 26 * scale);
        // Overalls
        ctx.fillStyle = '#2563eb';
        ctx.fillRect(sx - sz * 0.45, sy - sz * 1.1, sz * 0.9, sz * 0.8);
        // Shirt & Cap
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(sx, sy - sz * 1.45, sz * 0.48, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  // =========================================================================
  // GAME 3: LYLAT WING 64 — CORNERIA SECTOR (3D Arwing Space Shooter)
  // =========================================================================
  const foxState = {
    x: 0,
    y: 0,
    roll: 0,
    barrelTimer: 0,
    score: 0,
    shield: 100,
    bossHp: 100,
    lasers: [],
    enemies: [],
    rings: [],
    shootCooldown: 0
  };

  function initStarFox64() {
    foxState.x = 0;
    foxState.y = 0;
    foxState.roll = 0;
    foxState.barrelTimer = 0;
    foxState.score = 0;
    foxState.shield = 100;
    foxState.bossHp = 100;
    foxState.lasers = [];
    foxState.enemies = [];
    foxState.rings = [];

    for (let i = 0; i < 6; i++) {
      foxState.enemies.push({
        x: (Math.random() - 0.5) * 340,
        y: (Math.random() - 0.5) * 180,
        z: 220 + i * 95,
        hp: 2
      });
    }
    for (let i = 0; i < 3; i++) {
      foxState.rings.push({
        x: (Math.random() - 0.5) * 220,
        y: (Math.random() - 0.5) * 120,
        z: 300 + i * 220
      });
    }
  }

  function updateStarFox64(dt) {
    foxState.x += input.x * 260 * dt;
    foxState.y += input.y * 210 * dt;
    foxState.x = Math.max(-220, Math.min(220, foxState.x));
    foxState.y = Math.max(-135, Math.min(135, foxState.y));

    // Barrel Roll (Z)
    if (input.zJustPressed && foxState.barrelTimer <= 0) {
      foxState.barrelTimer = 0.55;
      playSfx('boost');
    }
    if (foxState.barrelTimer > 0) {
      foxState.barrelTimer -= dt;
      foxState.roll += 14 * dt;
    } else {
      foxState.roll = -input.x * 0.55;
    }

    // Shoot Twin Lasers (A or B)
    foxState.shootCooldown -= dt;
    if ((input.a || input.b) && foxState.shootCooldown <= 0) {
      foxState.shootCooldown = 0.14;
      foxState.lasers.push({ x: foxState.x - 18, y: foxState.y, z: 40 });
      foxState.lasers.push({ x: foxState.x + 18, y: foxState.y, z: 40 });
      playSfx('laser');
    }

    // Move Lasers
    for (let i = foxState.lasers.length - 1; i >= 0; i--) {
      const l = foxState.lasers[i];
      l.z += 760 * dt;
      if (l.z > 650) {
        foxState.lasers.splice(i, 1);
        continue;
      }
      // Hit Enemies
      foxState.enemies.forEach((e) => {
        if (Math.abs(l.z - e.z) < 35 && Math.hypot(l.x - e.x, l.y - e.y) < 42) {
          e.hp--;
          l.z = 9999;
          if (e.hp <= 0) {
            foxState.score += 100;
            playSfx('explosion');
            e.z = 620;
            e.x = (Math.random() - 0.5) * 340;
            e.y = (Math.random() - 0.5) * 180;
            e.hp = 2;
          }
        }
      });
    }

    // Move Enemies & Rings
    foxState.enemies.forEach((e) => {
      e.z -= 185 * dt;
      if (e.z < 30) {
        if (Math.hypot(foxState.x - e.x, foxState.y - e.y) < 48 && foxState.barrelTimer <= 0) {
          foxState.shield = Math.max(10, foxState.shield - 12);
          playSfx('explosion');
        }
        e.z = 620;
        e.x = (Math.random() - 0.5) * 340;
        e.y = (Math.random() - 0.5) * 180;
      }
    });

    foxState.rings.forEach((r) => {
      r.z -= 160 * dt;
      if (r.z < 35) {
        if (Math.hypot(foxState.x - r.x, foxState.y - r.y) < 52) {
          foxState.shield = Math.min(100, foxState.shield + 20);
          foxState.score += 50;
          playSfx('coin');
        }
        r.z = 640;
        r.x = (Math.random() - 0.5) * 220;
        r.y = (Math.random() - 0.5) * 120;
      }
    });

    hudGameTitle.textContent = 'LYLAT WING 64 — CORNERIA SECTOR';
    hudSubStat.innerHTML = `ESCUDO ARWING: <strong>${foxState.shield}%</strong> • <kbd>Z</kbd> BARREL ROLL`;
    hudScore.innerHTML = `HITS: <strong>${foxState.score} PTS</strong>`;
  }

  function renderStarFox64(time) {
    const W = canvas.width;
    const H = canvas.height;
    const cx = W * 0.5;
    const cy = H * 0.5;

    // Deep Lylat Starfield Background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, W, H);

    // Scrolling 3D Ground Grid
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.35)';
    ctx.lineWidth = 1.5;
    const gridHorizon = H * 0.58;
    for (let i = -6; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 22, gridHorizon);
      ctx.lineTo(cx + i * 140, H);
      ctx.stroke();
    }
    const scrollOffset = (time * 120) % 24;
    for (let y = gridHorizon; y < H; y += 24) {
      const sy = y + scrollOffset;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(W, sy);
      ctx.stroke();
    }

    // Gold Shield Rings
    foxState.rings.forEach((r) => {
      const scale = 240 / Math.max(20, r.z);
      const sx = cx + r.x * scale;
      const sy = cy + r.y * scale;
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = Math.max(2, 6 * scale);
      ctx.beginPath();
      ctx.arc(sx, sy, 36 * scale, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Enemy Venom Fighters
    foxState.enemies.forEach((e) => {
      const scale = 240 / Math.max(20, e.z);
      const sx = cx + e.x * scale;
      const sy = cy + e.y * scale;
      const sz = 28 * scale;
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(sx, sy - sz);
      ctx.lineTo(sx - sz * 1.2, sy + sz * 0.7);
      ctx.lineTo(sx + sz * 1.2, sy + sz * 0.7);
      ctx.closePath();
      ctx.fill();
    });

    // Twin Green Hyper Lasers
    ctx.fillStyle = '#4ade80';
    foxState.lasers.forEach((l) => {
      const scale = 240 / Math.max(20, l.z);
      const sx = cx + l.x * scale;
      const sy = cy + l.y * scale;
      ctx.fillRect(sx - 3, sy - 3, 6, 14 * scale);
    });

    // Player 3D Low-Poly Arwing Fighter
    const ax = cx + foxState.x;
    const ay = cy + foxState.y;

    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(foxState.roll);

    // Barrel Roll Energy Shield Ring
    if (foxState.barrelTimer > 0) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 54, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Blue G-Diffuser Wings
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.moveTo(-52, 16);
    ctx.lineTo(-14, -6);
    ctx.lineTo(-14, 18);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(52, 16);
    ctx.lineTo(14, -6);
    ctx.lineTo(14, 18);
    ctx.fill();

    // White Arwing Fuselage
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.lineTo(-22, 18);
    ctx.lineTo(22, 18);
    ctx.closePath();
    ctx.fill();

    // Plasma Thruster Glow
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(0, 16, 8 + Math.sin(time * 30) * 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // =========================================================================
  // REAL N64 ROM LOADER (EmulatorJS Mupen64Plus-Next WebAssembly Core)
  // =========================================================================
  function bootRealN64RomUrl(romUrl, romLabel) {
    activeCart = 'realrom';
    canvas.style.display = 'none';
    stageHud.style.display = 'none';
    ejsContainer.style.display = 'block';
    ejsContainer.innerHTML = '<div id="ejs-game" style="width:100%;height:100%;"></div>';

    statusText.textContent = `ROM: ${romLabel.toUpperCase()}`;

    window.EJS_player = '#ejs-game';
    window.EJS_core = 'n64';
    window.EJS_gameUrl = romUrl;
    window.EJS_pathtodata = 'https://cdn.emulatorjs.org/stable/data/';
    window.EJS_startOnLoaded = true;

    const existingScript = document.getElementById('ejs-loader-script');
    if (existingScript) existingScript.remove();

    const script = document.createElement('script');
    script.id = 'ejs-loader-script';
    script.src = 'https://cdn.emulatorjs.org/stable/data/loader.js';
    document.body.appendChild(script);
  }

  function bootRealN64Rom(file) {
    if (!file) return;
    const romUrl = URL.createObjectURL(file);
    bootRealN64RomUrl(romUrl, file.name);
  }

  function switchBuiltInCart(cartName) {
    activeCart = cartName;
    ejsContainer.style.display = 'none';
    ejsContainer.innerHTML = '';
    canvas.style.display = 'block';
    stageHud.style.display = 'flex';
    statusText.textContent = 'CARTUCHO ATIVO';

    document.querySelectorAll('.cartridge-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.cart === cartName);
    });

    if (cartName === 'kart64') initKart64();
    else if (cartName === 'mario64') initMario64();
    else if (cartName === 'starfox64') initStarFox64();
    playSfx('coin');
  }

  // =========================================================================
  // INPUT POLLING & CONTROLLER UI
  // =========================================================================
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      if (activeCart !== 'realrom') e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  // Draggable Analog Stick on UI
  const analogWell = document.getElementById('analog-well');
  const analogStick = document.getElementById('analog-stick');

  function handleStickPointer(e) {
    if (!stickDrag.active) return;
    const rect = analogWell.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const maxR = 24;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    stickDrag.x = dx / maxR;
    stickDrag.y = dy / maxR;
  }

  analogWell.addEventListener('pointerdown', (e) => {
    stickDrag.active = true;
    handleStickPointer(e);
  });
  window.addEventListener('pointermove', handleStickPointer);
  window.addEventListener('pointerup', () => {
    stickDrag.active = false;
    stickDrag.x = 0;
    stickDrag.y = 0;
  });

  // On-Screen N64 Face Buttons
  document.querySelectorAll('[data-btn]').forEach((btn) => {
    const code = btn.dataset.btn;
    btn.addEventListener('pointerdown', () => {
      touchButtons[code] = true;
      btn.classList.add('pressed');
    });
    const release = () => {
      touchButtons[code] = false;
      btn.classList.remove('pressed');
    };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);
  });

  function pollInputs() {
    const prevA = input.a;
    const prevB = input.b;
    const prevZ = input.z;

    let kx = 0;
    let ky = 0;
    if (keys['KeyA'] || keys['ArrowLeft']) kx -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) kx += 1;
    if (keys['KeyW'] || keys['ArrowUp']) ky -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) ky += 1;

    let a = Boolean(keys['Space'] || keys['KeyJ'] || touchButtons['a']);
    let b = Boolean(keys['ShiftLeft'] || keys['ShiftRight'] || keys['KeyK'] || touchButtons['b']);
    let z = Boolean(keys['KeyZ'] || keys['KeyL'] || touchButtons['z']);
    let cl = Boolean(keys['KeyQ'] || touchButtons['cl']);
    let cr = Boolean(keys['KeyE'] || touchButtons['cr']);

    // Physical USB / Bluetooth Gamepad Support
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads[0];
    if (gp) {
      gamepadStatus.textContent = gp.id.slice(0, 22);
      if (Math.abs(gp.axes[0]) > 0.15) kx = gp.axes[0];
      if (Math.abs(gp.axes[1]) > 0.15) ky = gp.axes[1];
      if (gp.buttons[0]?.pressed) a = true;
      if (gp.buttons[1]?.pressed || gp.buttons[2]?.pressed) b = true;
      if (gp.buttons[6]?.pressed || gp.buttons[4]?.pressed) z = true;
    }

    if (stickDrag.active) {
      kx = stickDrag.x;
      ky = stickDrag.y;
    }

    input.x = Math.max(-1, Math.min(1, kx));
    input.y = Math.max(-1, Math.min(1, ky));
    input.a = a;
    input.b = b;
    input.z = z;
    input.cl = cl;
    input.cr = cr;

    input.aJustPressed = a && !prevA;
    input.bJustPressed = b && !prevB;
    input.zJustPressed = z && !prevZ;

    // Update Visual Stick Position
    analogStick.style.transform = `translate(${input.x * 20}px, ${input.y * 20}px)`;
  }

  // =========================================================================
  // UI TOOLBAR & ROM FILE LISTENERS
  // =========================================================================
  document.querySelectorAll('.cartridge-item').forEach((btn) => {
    btn.addEventListener('click', () => switchBuiltInCart(btn.dataset.cart));
  });

  document.getElementById('btn-reset-cart').addEventListener('click', () => {
    if (activeCart !== 'realrom') switchBuiltInCart(activeCart);
  });

  document.getElementById('btn-toggle-audio').addEventListener('click', () => {
    audioEnabled = !audioEnabled;
    document.getElementById('audio-btn-label').textContent = audioEnabled ? '🔊 Som N64: ON' : '🔇 Som N64: OFF';
  });

  document.getElementById('btn-toggle-crt').addEventListener('click', () => {
    const isCrt = tvContainer.classList.toggle('crt-active');
    document.getElementById('crt-btn-label').textContent = isCrt ? '📺 Filtro CRT: ON' : '📺 Filtro CRT: OFF';
  });

  document.getElementById('btn-fullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) {
      tvContainer.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  });

  // Save & Load State
  document.getElementById('btn-save-state').addEventListener('click', () => {
    const snapshot = {
      activeCart,
      kartState: JSON.parse(JSON.stringify(kartState)),
      marioState: JSON.parse(JSON.stringify(marioState)),
      foxState: JSON.parse(JSON.stringify(foxState))
    };
    localStorage.setItem('ultra64_savestate', JSON.stringify(snapshot));
    statusText.textContent = 'ESTADO SALVO!';
    playSfx('star');
  });

  document.getElementById('btn-load-state').addEventListener('click', () => {
    const raw = localStorage.getItem('ultra64_savestate');
    if (!raw) {
      statusText.textContent = 'NENHUM SAVE ENCONTRADO';
      return;
    }
    const snapshot = JSON.parse(raw);
    switchBuiltInCart(snapshot.activeCart);
    Object.assign(kartState, snapshot.kartState);
    Object.assign(marioState, snapshot.marioState);
    Object.assign(foxState, snapshot.foxState);
    statusText.textContent = 'ESTADO CARREGADO!';
    playSfx('coin');
  });

  // ROM File Input & Drag-and-Drop
  const romInput = document.getElementById('rom-file-input');
  const romDropzone = document.getElementById('rom-dropzone');

  romInput.addEventListener('change', (e) => {
    if (e.target.files?.[0]) bootRealN64Rom(e.target.files[0]);
  });

  romDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    romDropzone.classList.add('dragover');
  });
  romDropzone.addEventListener('dragleave', () => {
    romDropzone.classList.remove('dragover');
  });
  romDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    romDropzone.classList.remove('dragover');
    if (e.dataTransfer.files?.[0]) bootRealN64Rom(e.dataTransfer.files[0]);
  });

  // =========================================================================
  // MAIN 60 FPS REALITY COPROCESSOR LOOP
  // =========================================================================
  initKart64();
  initMario64();
  initStarFox64();

  const urlParams = new URLSearchParams(window.location.search);
  const autoRom = urlParams.get('rom');
  if (autoRom) {
    bootRealN64RomUrl(autoRom, decodeURIComponent(autoRom));
  }

  let lastTime = performance.now();
  let frameCount = 0;
  let fpsTimer = 0;

  function mainLoop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    frameCount++;
    fpsTimer += dt;
    if (fpsTimer >= 0.5) {
      fpsCounter.textContent = `${Math.min(60, Math.round(frameCount / fpsTimer))} FPS`;
      frameCount = 0;
      fpsTimer = 0;
    }

    pollInputs();

    if (activeCart === 'kart64') {
      updateKart64(dt);
      renderKart64();
    } else if (activeCart === 'mario64') {
      updateMario64(dt);
      renderMario64(now / 1000);
    } else if (activeCart === 'starfox64') {
      updateStarFox64(dt);
      renderStarFox64(now / 1000);
    }

    requestAnimationFrame(mainLoop);
  }

  requestAnimationFrame(mainLoop);
})();
