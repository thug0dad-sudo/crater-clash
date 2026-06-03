const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const angleSlider = document.getElementById('angle');
const powerSlider = document.getElementById('power');
const angleValue = document.getElementById('angleValue');
const powerValue = document.getElementById('powerValue');
const fireBtn = document.getElementById('fireBtn');
const newGameBtn = document.getElementById('newGameBtn');
const p1Health = document.getElementById('p1Health');
const p2Health = document.getElementById('p2Health');
const p1Card = document.getElementById('p1Card');
const p2Card = document.getElementById('p2Card');
const windReadout = document.getElementById('windReadout');
const weaponSelect = document.getElementById('weaponSelect');
const weaponInfo = document.getElementById('weaponInfo');
const aiToggle = document.getElementById('aiToggle');
const windToggle = document.getElementById('windToggle');
const windStrength = document.getElementById('windStrength');
const terrainMode = document.getElementById('terrainMode');

const W = canvas.width;
const H = canvas.height;
const GROUND_BASE = 390;
const GRAVITY = 0.165;
const TERRAIN_STEP = 4;

const weapons = [
  { id: 'pea', name: 'Pea Shooter', radius: 28, maxDamage: 34, damageRadius: 62, count: 1, spread: 0, desc: 'Small' },
  { id: 'missile', name: 'Missile', radius: 42, maxDamage: 58, damageRadius: 95, count: 1, spread: 0, desc: 'Standard' },
  { id: 'heavy', name: 'Heavy Bomb', radius: 62, maxDamage: 78, damageRadius: 132, count: 1, spread: 0, desc: 'Big crater' },
  { id: 'triple', name: 'Triple Shot', radius: 32, maxDamage: 36, damageRadius: 72, count: 3, spread: 0.16, desc: '3 shells' },
  { id: 'digger', name: 'Dirt Digger', radius: 76, maxDamage: 25, damageRadius: 82, count: 1, spread: 0, desc: 'Terrain' },
  { id: 'nuke', name: 'Mini Nuke', radius: 92, maxDamage: 115, damageRadius: 185, count: 1, spread: 0, desc: 'Huge' },
];

let terrain = [];
let tanks = [];
let currentPlayer = 0;
let projectiles = [];
let wind = 0;
let gameOver = false;
let message = '';
let explosions = [];
let aiTimer = 0;
let lastShotWeapon = weapons[1];

function rand(min, max) { return Math.random() * (max - min) + min; }

function selectedWeapon() { return weapons.find(w => w.id === weaponSelect.value) || weapons[1]; }

function populateWeapons() {
  weaponSelect.innerHTML = '';
  for (const weapon of weapons) {
    const option = document.createElement('option');
    option.value = weapon.id;
    option.textContent = weapon.name;
    weaponSelect.appendChild(option);
  }
  weaponSelect.value = 'missile';
}

function generateTerrain() {
  terrain = [];
  let h = GROUND_BASE;
  const mode = terrainMode.value;
  for (let x = 0; x <= W; x += TERRAIN_STEP) {
    const roughness = mode === 'jagged' ? 9 : 5;
    h += rand(-roughness, roughness);
    let wave = Math.sin(x / 75) * 25 + Math.sin(x / 31) * 9;
    if (mode === 'valley') wave += 74 * Math.cos((x - W / 2) / 160);
    if (mode === 'jagged') wave += Math.sin(x / 17) * 18;
    h = Math.max(285, Math.min(500, h));
    terrain.push({ x, y: Math.max(260, Math.min(520, h + wave)) });
  }
}

function getTerrainY(x) {
  x = Math.max(0, Math.min(W, x));
  const index = Math.floor(x / TERRAIN_STEP);
  const a = terrain[index] || terrain[terrain.length - 1];
  const b = terrain[index + 1] || a;
  const t = (x - a.x) / TERRAIN_STEP;
  return a.y * (1 - t) + b.y * t;
}

function placeTanks() {
  tanks = [
    { name: 'Player 1', x: 115, y: 0, hp: 100, color: '#ff3d71', facing: 1 },
    { name: 'Player 2', x: W - 115, y: 0, hp: 100, color: '#30d5c8', facing: -1 },
  ];
  tanks.forEach(t => t.y = getTerrainY(t.x) - 14);
}

function resetWind() {
  const strength = Number(windStrength.value || 1);
  wind = windToggle.checked ? Number(rand(-0.055 * strength, 0.055 * strength).toFixed(3)) : 0;
}

function newGame() {
  generateTerrain();
  placeTanks();
  currentPlayer = 0;
  projectiles = [];
  gameOver = false;
  message = 'Player 1 turn';
  explosions = [];
  aiTimer = 0;
  resetWind();
  angleSlider.value = 45;
  powerSlider.value = 55;
  weaponSelect.value = 'missile';
  updateUI();
  draw();
}

function updateUI() {
  angleValue.textContent = `${angleSlider.value}°`;
  powerValue.textContent = powerSlider.value;
  weaponInfo.textContent = selectedWeapon().desc;
  p1Health.textContent = `${Math.max(0, Math.round(tanks[0]?.hp || 0))} HP`;
  p2Health.textContent = `${Math.max(0, Math.round(tanks[1]?.hp || 0))} HP`;
  p1Card.classList.toggle('active', currentPlayer === 0 && !gameOver);
  p2Card.classList.toggle('active', currentPlayer === 1 && !gameOver);
  const arrow = wind > 0 ? '→' : wind < 0 ? '←' : '•';
  windReadout.textContent = `${arrow} ${Math.abs(wind * 1000).toFixed(0)}`;
  fireBtn.disabled = projectiles.length > 0 || gameOver || (currentPlayer === 1 && aiToggle.checked);
}

function drawSky() {
  ctx.fillStyle = '#fff7b5';
  ctx.beginPath();
  ctx.arc(90, 80, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.72)';
  for (const c of [{x:230,y:80},{x:650,y:105},{x:815,y:65}]) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, 18, 0, Math.PI * 2);
    ctx.arc(c.x + 22, c.y + 4, 24, 0, Math.PI * 2);
    ctx.arc(c.x + 50, c.y, 16, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTerrain() {
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (const p of terrain) ctx.lineTo(p.x, p.y);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fillStyle = '#3f7a35';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (const p of terrain) ctx.lineTo(p.x, p.y + 30);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fillStyle = '#5c3b24';
  ctx.fill();
}

function barrelAngleFor(tank, angleDeg) {
  const a = Number(angleDeg) * Math.PI / 180;
  return tank.facing === 1 ? -a : Math.PI + a;
}

function drawTank(t, active) {
  t.y = getTerrainY(t.x) - 14;
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.beginPath();
  ctx.ellipse(0, 15, 28, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = t.color;
  ctx.fillRect(-20, -6, 40, 16);
  ctx.beginPath();
  ctx.arc(0, -8, 13, Math.PI, 0);
  ctx.fill();
  const barrelAngle = active ? barrelAngleFor(t, angleSlider.value) : barrelAngleFor(t, 35);
  ctx.strokeStyle = active && !gameOver ? '#ffd166' : '#1b2433';
  ctx.lineWidth = active && !gameOver ? 5 : 4;
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(Math.cos(barrelAngle) * 32, Math.sin(barrelAngle) * 32 - 7);
  ctx.stroke();
  ctx.restore();
}

function drawProjectiles() {
  for (const p of projectiles) {
    ctx.fillStyle = p.weapon.id === 'nuke' ? '#ff3d71' : '#111827';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.weapon.id === 'nuke' ? 7 : 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawExplosions() {
  explosions = explosions.filter(e => e.life > 0);
  for (const e of explosions) {
    const alpha = e.life / 24;
    ctx.fillStyle = `rgba(255, 186, 73, ${alpha})`;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * (1.2 - alpha * .2), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 61, 113, ${alpha * .45})`;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * .55, 0, Math.PI * 2);
    ctx.fill();
    e.life--;
  }
}

function drawText() {
  ctx.font = '700 24px system-ui';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,.38)';
  ctx.fillText(message, W / 2 + 2, 34 + 2);
  ctx.fillStyle = 'white';
  ctx.fillText(message, W / 2, 34);
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawSky();
  drawTerrain();
  tanks.forEach((t, i) => drawTank(t, i === currentPlayer));
  drawProjectiles();
  drawExplosions();
  drawText();
}

function fire(customWeapon = null) {
  if (projectiles.length || gameOver) return;
  SFX?.play('launch');
  SFX?.flight();
  const tank = tanks[currentPlayer];
  const weapon = customWeapon || selectedWeapon();
  lastShotWeapon = weapon;
  const power = Number(powerSlider.value) / 4.7;
  const baseAngle = barrelAngleFor(tank, angleSlider.value);
  for (let i = 0; i < weapon.count; i++) {
    const offset = (i - (weapon.count - 1) / 2) * weapon.spread;
    const angleRad = baseAngle + offset;
    projectiles.push({
      x: tank.x + Math.cos(angleRad) * 36,
      y: tank.y - 8 + Math.sin(angleRad) * 36,
      vx: Math.cos(angleRad) * power,
      vy: Math.sin(angleRad) * power,
      weapon,
    });
  }
  message = `${tank.name} fires ${weapon.name}!`;
  updateUI();
}

function carveCrater(cx, cy, radius) {
  for (const p of terrain) {
    const dx = p.x - cx;
    if (Math.abs(dx) < radius) {
      const depth = Math.sqrt(radius * radius - dx * dx) * 0.72;
      p.y = Math.min(H - 20, Math.max(p.y, cy + depth));
    }
  }
}

function explode(x, y, weapon) {
  SFX?.play('boom');
  carveCrater(x, y, weapon.radius);
  explosions.push({ x, y, r: weapon.radius, life: 24 });
  for (const tank of tanks) {
    const dx = tank.x - x;
    const dy = tank.y - y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < weapon.damageRadius) {
      const damage = Math.max(0, Math.round(weapon.maxDamage * (1 - distance / weapon.damageRadius)));
      tank.hp -= damage;
      if (damage > 0) {
        SFX?.play('hit');
        message = `${tank.name} takes ${damage} damage!`;
      }
    }
  }
}

function finishTurnIfReady() {
  if (projectiles.length > 0) return;
  if (tanks[0].hp <= 0 || tanks[1].hp <= 0) {
    gameOver = true;
    const winner = tanks[0].hp > tanks[1].hp ? 'Player 1' : 'Player 2';
    message = `${winner} wins!`;
  } else {
    currentPlayer = 1 - currentPlayer;
    resetWind();
    message = `${tanks[currentPlayer].name} turn`;
    SFX?.play('beep');
    aiTimer = 0;
  }
  updateUI();
}

function updateProjectiles() {
  if (!projectiles.length) return;
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.vx += wind;
    p.vy += GRAVITY;
    p.x += p.vx;
    p.y += p.vy;
    let hit = false;
    if (p.x < -35 || p.x > W + 35 || p.y > H + 35) hit = true;
    else if (p.y >= getTerrainY(p.x)) { p.y = getTerrainY(p.x); hit = true; }
    else {
      for (const tank of tanks) {
        const dx = tank.x - p.x;
        const dy = tank.y - p.y;
        if (Math.sqrt(dx * dx + dy * dy) < 22) { hit = true; break; }
      }
    }
    if (hit) {
      if (p.x > -35 && p.x < W + 35 && p.y < H + 35) explode(p.x, p.y, p.weapon);
      projectiles.splice(i, 1);
    }
  }
  finishTurnIfReady();
}

function maybeAiTurn() {
  if (gameOver || projectiles.length || currentPlayer !== 1 || !aiToggle.checked) return;
  aiTimer++;
  if (aiTimer < 55) return;
  const distance = tanks[1].x - tanks[0].x;
  const guessPower = Math.max(35, Math.min(95, distance / 9 + rand(-10, 10) - wind * 280));
  angleSlider.value = Math.round(rand(34, 57));
  powerSlider.value = Math.round(guessPower);
  weaponSelect.value = Math.random() < 0.65 ? 'missile' : 'triple';
  updateUI();
  fire(selectedWeapon());
}

function loop() {
  maybeAiTurn();
  updateProjectiles();
  draw();
  requestAnimationFrame(loop);
}

angleSlider.addEventListener('input', () => { updateUI(); draw(); });
powerSlider.addEventListener('input', () => { updateUI(); draw(); });
weaponSelect.addEventListener('change', updateUI);
fireBtn.addEventListener('click', () => fire());
newGameBtn.addEventListener('click', newGame);
windToggle.addEventListener('change', () => { resetWind(); updateUI(); });
windStrength.addEventListener('change', () => { resetWind(); updateUI(); });
terrainMode.addEventListener('change', newGame);
aiToggle.addEventListener('change', updateUI);

window.addEventListener('keydown', (e) => {
  if ([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();
  if (e.key === ' ') fire();
  if (e.key === 'ArrowLeft') angleSlider.value = Math.max(0, Number(angleSlider.value) - 1);
  if (e.key === 'ArrowRight') angleSlider.value = Math.min(90, Number(angleSlider.value) + 1);
  if (e.key === 'ArrowUp') powerSlider.value = Math.min(100, Number(powerSlider.value) + 1);
  if (e.key === 'ArrowDown') powerSlider.value = Math.max(10, Number(powerSlider.value) - 1);
  updateUI();
});

populateWeapons();
newGame();
loop();

/* Multiplayer foundation: non-invasive state helpers */
window.exportOnlineState = function () {
  return {
    terrain,
    tanks,
    currentPlayer,
    wind,
    gameOver,
    message
  };
};

window.loadOnlineState = function (state) {
  if (!state) return;
  if (state.terrain) terrain = state.terrain;
  if (state.tanks) tanks = state.tanks;
  if (Number.isInteger(state.currentPlayer)) currentPlayer = state.currentPlayer;
  if (typeof state.wind === "number") wind = state.wind;
  if (typeof state.gameOver === "boolean") gameOver = state.gameOver;
  if (typeof state.message === "string") message = state.message;
  updateUI();
  draw();
};

window.receiveOnlineMove = function (move) {
  console.log("Received online move:", move);
};

window.addEventListener("DOMContentLoaded", () => {
  const createBtn = document.getElementById("createRoomBtn");
  const joinBtn = document.getElementById("joinRoomBtn");
  const input = document.getElementById("roomCodeInput");

  createBtn?.addEventListener("click", () => {
    window.Multiplayer?.createRoom();
  });

  joinBtn?.addEventListener("click", () => {
    window.Multiplayer?.joinRoom(input.value);
  });
});

/* Multiplayer Testing Layer */

function sendAimUpdate() {
  if (!window.Multiplayer?.isOnline) return;

  Multiplayer.sendMove({
    type: "aim",
    player: currentPlayer,
    angle: Number(angleSlider.value),
    power: Number(powerSlider.value),
    weapon: weaponSelect.value,
    ts: Date.now()
  });
}

angleSlider.addEventListener("input", sendAimUpdate);
powerSlider.addEventListener("input", sendAimUpdate);

weaponSelect.addEventListener("change", () => {
  sendAimUpdate();

  Multiplayer.sendMove({
    type: "weapon",
    player: currentPlayer,
    weapon: weaponSelect.value,
    ts: Date.now()
  });
});

const originalFire = fire;

fire = function(...args) {

  if (window.Multiplayer?.isOnline) {

    Multiplayer.sendMove({
      type: "fire",
      player: currentPlayer,
      angle: Number(angleSlider.value),
      power: Number(powerSlider.value),
      weapon: weaponSelect.value,
      ts: Date.now()
    });

  }

  return originalFire.apply(this,args);
};

window.receiveOnlineMove = function(move) {

  console.log("ONLINE MOVE", move);

  const status = document.getElementById("roomStatus");

  if (!status) return;

  switch(move.type) {

    case "aim":
      status.textContent =
        `P${move.player+1} aiming ${move.angle}° P:${move.power}`;
      break;

    case "weapon":
      status.textContent =
        `P${move.player+1} selected ${move.weapon}`;
      break;

    case "fire":
      status.textContent =
        `P${move.player+1} FIRED ${move.weapon}`;
      break;

    default:
      status.textContent =
        JSON.stringify(move);
  }
};


/* Player identity display patch */
window.addEventListener("DOMContentLoaded", () => {
  const tagInput = document.getElementById("gamertagInput");
  if (tagInput && window.Multiplayer) {
    tagInput.value = localStorage.getItem("cc_gamertag") || "";
    tagInput.addEventListener("input", () => {
      tagInput.value = Multiplayer.cleanGamertag(tagInput.value);
      localStorage.setItem("cc_gamertag", tagInput.value);
    });
  }
});

/* Online turn handoff patch */
function isMyOnlineTurn() {
  if (!window.Multiplayer?.isOnline) return true;
  if (window.Multiplayer.role === "spectator") return false;
  return currentPlayer === window.Multiplayer.playerIndex;
}

function updateOnlineTurnControls() {
  const online = window.Multiplayer?.isOnline;
  const mine = isMyOnlineTurn();

  fireBtn.disabled = online && !mine;
  angleSlider.disabled = online && !mine;
  powerSlider.disabled = online && !mine;
  weaponSelect.disabled = online && !mine;

  const status = document.getElementById("roomStatus");
  if (status && online) {
    const playerName = window.Multiplayer.gamertag || `Player ${window.Multiplayer.playerIndex + 1}`;
    const turnName = currentPlayer === 0 ? "Player 1" : "Player 2";
    status.textContent = mine
      ? `Room ${window.Multiplayer.roomId} — ${playerName}, your turn`
      : `Room ${window.Multiplayer.roomId} — waiting for ${turnName}`;
  }
}

const originalUpdateUIForOnlineTurns = updateUI;
updateUI = function(...args) {
  const result = originalUpdateUIForOnlineTurns.apply(this, args);
  updateOnlineTurnControls();
  return result;
};

const originalFireForOnlineTurns = fire;
fire = function(...args) {
  if (window.Multiplayer?.isOnline && !isMyOnlineTurn()) {
    message = "Not your turn.";
    updateUI();
    draw();
    return;
  }

  return originalFireForOnlineTurns.apply(this, args);
};

const originalLoadOnlineStateForTurns = window.loadOnlineState;
window.loadOnlineState = function(state) {
  originalLoadOnlineStateForTurns?.(state);
  updateOnlineTurnControls();
};

window.addEventListener("DOMContentLoaded", () => {
  setTimeout(updateOnlineTurnControls, 250);
});

/* Fix online turn sync after projectile resolves */
function saveOnlineSnapshotAfterTurn() {
  if (!window.Multiplayer?.isOnline) return;
  setTimeout(() => {
    window.Multiplayer?.sendMove({
      type: "state-sync",
      player: window.Multiplayer.playerIndex,
      currentPlayer,
      message,
      ts: Date.now()
    });
  }, 50);
}

const originalFinishTurnIfReadyOnlineSync = finishTurnIfReady;
finishTurnIfReady = function(...args) {
  const before = currentPlayer;
  const result = originalFinishTurnIfReadyOnlineSync.apply(this, args);
  const after = currentPlayer;

  if (window.Multiplayer?.isOnline && before !== after && projectiles.length === 0) {
    saveOnlineSnapshotAfterTurn();
  }

  updateOnlineTurnControls?.();
  return result;
};

const previousReceiveOnlineMoveForTurnSync = window.receiveOnlineMove;
window.receiveOnlineMove = function(move) {
  previousReceiveOnlineMoveForTurnSync?.(move);

  if (move?.type === "state-sync" && Number.isInteger(move.currentPlayer)) {
    currentPlayer = move.currentPlayer;
    message = move.message || message;
    updateUI();
    draw();
    updateOnlineTurnControls?.();
  }
};
