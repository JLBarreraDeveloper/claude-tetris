'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const GRID_COLORS = { dark: '#22222e', light: '#d8d8e5' };
const THEME_KEY = 'tetris-theme';

// ---- records: claves de almacenamiento y limites ----
const HS_KEY = 'tetris-highscores';
const NAME_KEY = 'tetris-last-name';
const MAX_SCORES = 5;
const NAME_MAX_LEN = 10;

// ---- power-ups: toda la configuracion en un unico objeto ----
const PU = {
  linesPerPowerup: 10,    // N lineas entre apariciones
  bombRadius: 1,          // 1 => area 3x3
  freezeMs: 5000,         // duracion de Congelar
  cascadeMultiplier: 1.5, // acumulativo por cascada
  gravityMode: 'column',  // 'column' (no sticky) | 'sticky'
  maxCascades: 20,        // cinturon de seguridad anti-bucle
  fxMs: 400,              // duracion maxima de la animacion
  sound: true,
};

const PU_BOMBA = 1, PU_RAYO = 2, PU_TINTE = 3, PU_GRAVEDAD = 4, PU_CONGELAR = 5;

const POWERUPS = [
  null,
  { id: PU_BOMBA,    icon: '💣', name: 'Bomba',    tone: [180, 60,   'sawtooth'] },
  { id: PU_RAYO,     icon: '⚡', name: 'Rayo',     tone: [900, 200,  'square'] },
  { id: PU_TINTE,    icon: '🎨', name: 'Tinte',    tone: [520, 780,  'triangle'] },
  { id: PU_GRAVEDAD, icon: '⬇',  name: 'Gravedad', tone: [700, 120,  'sine'] },
  { id: PU_CONGELAR, icon: '❄',  name: 'Congelar', tone: [400, 1200, 'sine'] },
];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const powerupEl = document.getElementById('powerup-badge');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');

const startScreen = document.getElementById('start-screen');
const startScoresBody = document.getElementById('start-scores-body');
const startScoresEmpty = document.getElementById('start-scores-empty');
const startPlayBtn = document.getElementById('start-play-btn');
const startResetBtn = document.getElementById('start-reset-btn');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const nameSaveBtn = document.getElementById('name-save-btn');
const overlayScoresBody = document.getElementById('overlay-scores-body');
const overlayScoresEmpty = document.getElementById('overlay-scores-empty');
const overlayResetBtn = document.getElementById('overlay-reset-btn');

let board, marks, wilds, current, next, score, lines, level, paused, gameOver;
let lastTime, dropAccum, dropInterval, animId;
let linesSincePU, lastPUType, puPending, freezeLeft, fx;
let combo, maxCombo, maxLinesAtOnce, scoreSaved, pendingEntry;
let audioCtx = null;

function createGrid(fill) {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(fill));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  const piece = {
    type,
    shape,
    marks: shape.map(row => row.map(() => 0)),
    x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
    y: 0,
  };
  maybeMarkPiece(piece);
  return piece;
}

// marca uno de los bloques de la pieza si toca aparicion de power-up
function maybeMarkPiece(piece) {
  if (puPending || linesSincePU < PU.linesPerPowerup) return;

  const types = POWERUPS.length - 1;
  let type = lastPUType;
  while (type === lastPUType) type = Math.floor(Math.random() * types) + 1;

  const cells = [];
  for (let r = 0; r < piece.shape.length; r++)
    for (let c = 0; c < piece.shape[r].length; c++)
      if (piece.shape[r][c]) cells.push([r, c]);
  const [mr, mc] = cells[Math.floor(Math.random() * cells.length)];

  piece.marks[mr][mc] = type;
  linesSincePU -= PU.linesPerPowerup;
  lastPUType = type;
  puPending = type;
  updatePowerupHUD();
}

function hasMark(grid) {
  return grid.some(row => row.some(v => v !== 0));
}

// libera el hueco de power-up cuando la marca ya no existe en ninguna parte
function refreshPending() {
  if (!puPending) return;
  if (hasMark(marks)) return;
  if (current && hasMark(current.marks)) return;
  if (next && hasMark(next.marks)) return;
  puPending = 0;
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const rotatedMarks = rotateCW(current.marks);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.marks = rotatedMarks; // la marca viaja con su bloque
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++) {
    for (let c = 0; c < current.shape[r].length; c++) {
      if (!current.shape[r][c]) continue;
      board[current.y + r][current.x + c] = current.shape[r][c];
      marks[current.y + r][current.x + c] = current.marks[r][c];
      current.marks[r][c] = 0; // la marca pasa a ser del tablero
    }
  }
}

// ---- power-ups: resolucion ----

function clearCell(r, c) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
  board[r][c] = 0;
  marks[r][c] = 0;
  wilds[r][c] = false;
}

function fullRows() {
  const rows = [];
  for (let r = 0; r < ROWS; r++) if (board[r].every(v => v !== 0)) rows.push(r);
  return rows;
}

// elimina filas ya vaciadas; en orden ascendente los indices restantes no se mueven
function collapseRows(rows) {
  for (const r of [...rows].sort((a, b) => a - b)) {
    board.splice(r, 1); board.unshift(new Array(COLS).fill(0));
    marks.splice(r, 1); marks.unshift(new Array(COLS).fill(0));
    wilds.splice(r, 1); wilds.unshift(new Array(COLS).fill(false));
  }
}

// gravedad por columna: cada bloque cae hasta apoyarse, sin arrastrar vecinos
function compactColumns() {
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (!board[r][c]) continue;
      if (write !== r) {
        board[write][c] = board[r][c];
        marks[write][c] = marks[r][c];
        wilds[write][c] = wilds[r][c];
        board[r][c] = 0; marks[r][c] = 0; wilds[r][c] = false;
      }
      write--;
    }
  }
}

function applyEffect(t) {
  switch (t.type) {
    case PU_BOMBA: {
      const R = PU.bombRadius;
      for (let dr = -R; dr <= R; dr++)
        for (let dc = -R; dc <= R; dc++)
          clearCell(t.r + dr, t.c + dc);
      break;
    }
    case PU_RAYO:
      for (let c = 0; c < COLS; c++) clearCell(t.r, c);
      for (let r = 0; r < ROWS; r++) clearCell(r, t.c);
      break;
    case PU_TINTE:
      if (!t.color) break;
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (board[r][c] === t.color) wilds[r][c] = true;
      break;
    case PU_GRAVEDAD:
      break; // se aplica despues del colapso, en resolveClears
    case PU_CONGELAR:
      freezeLeft = PU.freezeMs; // reinicia, no acumula
      break;
  }
}

// line clear normal -> efecto -> gravedad/colapso -> puntuacion, con cascadas
function resolveClears() {
  let cascade = 0, totalCleared = 0, gained = 0;

  while (cascade < PU.maxCascades) {
    const full = fullRows();
    if (!full.length) break;
    if (full.length > maxLinesAtOnce) maxLinesAtOnce = full.length;

    // power-ups disparados (defensivo: puede haber mas de uno), izquierda -> derecha
    const trig = [];
    for (const r of full)
      for (let c = 0; c < COLS; c++)
        if (marks[r][c]) trig.push({ r, c, type: marks[r][c], color: board[r][c] });
    trig.sort((a, b) => a.c - b.c);

    // vaciar sin colapsar: las coordenadas de origen siguen siendo validas
    for (const r of full)
      for (let c = 0; c < COLS; c++) clearCell(r, c);

    let gravity = false;
    for (const t of trig) {
      applyEffect(t);
      pushFx(t);
      playPowerupSound(t.type);
      if (t.type === PU_GRAVEDAD) gravity = true;
    }

    collapseRows(full);
    if (gravity) compactColumns();

    const mult = Math.pow(PU.cascadeMultiplier, cascade);
    gained += Math.round((LINE_SCORES[Math.min(full.length, 4)] || 0) * level * mult);
    totalCleared += full.length;
    cascade++;
  }

  if (totalCleared) {
    score += gained;
    lines += totalCleared;
    linesSincePU += totalCleared;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    refreshPending();
    updateHUD();
  } else {
    combo = 0;
  }
}

// ---- feedback ----

function pushFx(t) {
  fx.push({ type: t.type, r: t.r, c: t.c, color: t.color, start: performance.now() });
}

function audio() {
  if (!PU.sound) return null;
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playPowerupSound(type) {
  const pu = POWERUPS[type];
  const ac = audio();
  if (!ac || !pu) return;
  const [f0, f1, wave] = pu.tone;
  const t0 = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(f0, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + 0.18);
  gain.gain.setValueAtTime(0.18, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + 0.22);
}

// ---- juego ----

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  resolveClears();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  drawNext();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
}

function updatePowerupHUD() {
  if (!powerupEl) return;
  if (freezeLeft > 0) {
    powerupEl.textContent = `${POWERUPS[PU_CONGELAR].icon} ${(freezeLeft / 1000).toFixed(1)}s`;
    powerupEl.classList.add('frozen');
    return;
  }
  powerupEl.classList.remove('frozen');
  const pu = POWERUPS[puPending];
  powerupEl.textContent = pu ? `${pu.icon} ${pu.name}` : '—';
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  updatePowerupHUD();
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

// marca de power-up y/o comodin sobre una celda ya pintada
function drawDecor(context, x, y, size, mark, wild, alpha) {
  if (!mark && !wild) return;
  const px = x * size + 1, py = y * size + 1, s = size - 2;
  const a = alpha ?? 1;
  context.save();

  if (wild) {
    // trama diagonal recortada a la celda
    context.save();
    context.beginPath();
    context.rect(px, py, s, s);
    context.clip();
    context.globalAlpha = a * 0.35;
    context.strokeStyle = '#ffffff';
    context.lineWidth = 1;
    context.beginPath();
    for (let o = -s; o < s * 2; o += 6) {
      context.moveTo(px + o, py + s);
      context.lineTo(px + o + s, py);
    }
    context.stroke();
    context.restore();

    context.globalAlpha = a * 0.9;
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.setLineDash([4, 3]);
    context.strokeRect(px + 1, py + 1, s - 2, s - 2);
    context.setLineDash([]);
  }

  if (mark) {
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 180);
    context.globalAlpha = a * pulse;
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.strokeRect(px + 1, py + 1, s - 2, s - 2);
    context.globalAlpha = a;
    context.font = `${Math.floor(size * 0.6)}px system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#ffffff';
    context.fillText(POWERUPS[mark].icon, px + s / 2, py + s / 2 + 1);
  }

  context.restore();
  context.globalAlpha = 1;
}

function isLightTheme() {
  return document.documentElement.classList.contains('light-theme');
}

function updateThemeToggleUI() {
  const light = isLightTheme();
  themeToggleBtn.textContent = light ? '🌙' : '☀️';
  themeToggleBtn.setAttribute('aria-label', light ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
}

function toggleTheme() {
  const light = document.documentElement.classList.toggle('light-theme');
  localStorage.setItem(THEME_KEY, light ? 'light' : 'dark');
  updateThemeToggleUI();
  draw();
  drawNext();
}

function drawGrid() {
  ctx.strokeStyle = isLightTheme() ? GRID_COLORS.light : GRID_COLORS.dark;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

// animaciones de power-up: no bloquean el input, se descartan solas al expirar
function drawFx() {
  if (!fx.length) return;
  const now = performance.now();
  const W = COLS * BLOCK, H = ROWS * BLOCK;
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    const p = (now - f.start) / PU.fxMs;
    if (p >= 1) { fx.splice(i, 1); continue; }
    const a = 1 - p;
    ctx.save();
    ctx.globalAlpha = a;
    switch (f.type) {
      case PU_BOMBA: {
        const grow = (PU.bombRadius + 0.5 + p * 2) * BLOCK;
        ctx.strokeStyle = '#ffb74d';
        ctx.lineWidth = 3;
        ctx.strokeRect((f.c + 0.5) * BLOCK - grow, (f.r + 0.5) * BLOCK - grow, grow * 2, grow * 2);
        break;
      }
      case PU_RAYO:
        ctx.fillStyle = '#fff59d';
        ctx.fillRect(0, f.r * BLOCK, W, BLOCK);
        ctx.fillRect(f.c * BLOCK, 0, BLOCK, H);
        break;
      case PU_TINTE:
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = COLORS[f.color] || '#ffffff';
        ctx.fillRect(0, 0, W, H);
        break;
      case PU_GRAVEDAD: {
        ctx.strokeStyle = '#81c784';
        ctx.lineWidth = 2;
        const y0 = p * H;
        for (let c = 0; c < COLS; c++) {
          ctx.beginPath();
          ctx.moveTo((c + 0.5) * BLOCK, y0);
          ctx.lineTo((c + 0.5) * BLOCK, y0 + BLOCK * 2);
          ctx.stroke();
        }
        break;
      }
      case PU_CONGELAR:
        ctx.globalAlpha = a * 0.35;
        ctx.fillStyle = '#4dd0e1';
        ctx.fillRect(0, 0, W, H);
        break;
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      drawBlock(ctx, c, r, board[r][c], BLOCK);
      drawDecor(ctx, c, r, BLOCK, marks[r][c], wilds[r][c]);
    }
  }

  drawFx();

  // partida terminada: solo el tablero final
  if (gameOver) return;

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++) {
    for (let c = 0; c < current.shape[r].length; c++) {
      if (!current.shape[r][c]) continue;
      drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);
      drawDecor(ctx, current.x + c, gy + r, BLOCK, current.marks[r][c], false, 0.25);
    }
  }

  // current piece
  for (let r = 0; r < current.shape.length; r++) {
    for (let c = 0; c < current.shape[r].length; c++) {
      if (!current.shape[r][c]) continue;
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
      drawDecor(ctx, current.x + c, current.y + r, BLOCK, current.marks[r][c], false);
    }
  }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
      drawDecor(nextCtx, offX + c, offY + r, NB, next.marks[r][c], false);
    }
  }
}

// ---- records ----

function loadScores() {
  try {
    const raw = localStorage.getItem(HS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(e => ({
        name: typeof e?.name === 'string' && e.name.trim() ? e.name.trim().slice(0, NAME_MAX_LEN) : '---',
        score: Number(e?.score) || 0,
        lines: Number(e?.lines) || 0,
        level: Number(e?.level) || 1,
        maxCombo: Number(e?.maxCombo) || 0,
        maxLinesAtOnce: Number(e?.maxLinesAtOnce) || 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SCORES);
  } catch (e) {
    return [];
  }
}

function saveScores(list) {
  try {
    localStorage.setItem(HS_KEY, JSON.stringify(list));
  } catch (e) {
    // localStorage puede fallar en file:// o en modo privado
  }
}

function resetScores() {
  if (!confirm('¿Seguro que quieres borrar todos los récords? Esta acción no se puede deshacer.')) return;
  try {
    localStorage.removeItem(HS_KEY);
  } catch (e) {}
  renderStartScores();
  if (gameOver) refreshOverlayRecords();
}

// hueco libre en el top 5 o puntuacion mayor que la ultima entrada
function qualifies(list, points) {
  if (list.length < MAX_SCORES) return true;
  return points > list[list.length - 1].score;
}

function sanitizeName(raw) {
  const trimmed = (raw || '').trim().slice(0, NAME_MAX_LEN);
  return trimmed || 'JUGADOR';
}

function addScore(entry) {
  const list = loadScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, MAX_SCORES);
  saveScores(trimmed);
  return trimmed;
}

// pinta la tabla top-5 en el tbody dado; resalta highlightEntry por referencia
function renderScores(tbody, emptyEl, list, highlightEntry) {
  tbody.textContent = '';
  if (!list.length) {
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  list.forEach((entry, i) => {
    const tr = document.createElement('tr');
    if (entry === highlightEntry) tr.classList.add('score-new');
    const values = [i + 1, entry.name, entry.score.toLocaleString(), entry.lines, entry.level, entry.maxCombo, entry.maxLinesAtOnce];
    for (const v of values) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
}

function renderStartScores() {
  renderScores(startScoresBody, startScoresEmpty, loadScores(), null);
}

// re-pinta la tabla del game over y decide si el formulario de nombre sigue visible
function refreshOverlayRecords(highlightEntry) {
  const list = loadScores();
  renderScores(overlayScoresBody, overlayScoresEmpty, list, highlightEntry || null);
  if (!scoreSaved && pendingEntry) {
    if (qualifies(list, pendingEntry.score)) nameEntry.classList.remove('hidden');
    else nameEntry.classList.add('hidden');
  }
}

function saveScoreEntry() {
  if (scoreSaved || !pendingEntry) return;
  const name = sanitizeName(nameInput.value);
  try { localStorage.setItem(NAME_KEY, name); } catch (e) {}
  pendingEntry.name = name;
  const updated = addScore(pendingEntry);
  scoreSaved = true;
  nameEntry.classList.add('hidden');
  renderScores(overlayScoresBody, overlayScoresEmpty, updated, pendingEntry);
  renderStartScores();
}

function endGame() {
  gameOver = true;
  stopRepeat();
  freezeLeft = 0; // cancela Congelar si la pieza no puede generarse
  updatePowerupHUD();
  cancelAnimationFrame(animId);
  animId = null;
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;

  scoreSaved = false;
  pendingEntry = { name: '', score, lines, level, maxCombo, maxLinesAtOnce };
  let lastName = '';
  try { lastName = localStorage.getItem(NAME_KEY) || ''; } catch (e) {}
  nameInput.value = lastName;
  refreshOverlayRecords();

  // marca el overlay como game-over para que records/reset no se cuelen en la pausa
  overlay.classList.add('is-gameover');
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    // sin frames no se acumula dt: el timer de Congelar se pausa solo
    stopRepeat();
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  if (freezeLeft > 0) {
    freezeLeft = Math.max(0, freezeLeft - dt);
    dropAccum = 0; // al descongelar no cae de golpe
    updatePowerupHUD();
  } else {
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
      } else {
        lockPiece();
      }
    }
  }
  draw();
  // lockPiece pudo terminar la partida en este mismo frame
  if (gameOver || paused) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createGrid(0);
  marks = createGrid(0);
  wilds = createGrid(false);
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  linesSincePU = 0;
  lastPUType = 0;
  puPending = 0;
  freezeLeft = 0;
  fx = [];
  combo = 0;
  maxCombo = 0;
  maxLinesAtOnce = 0;
  scoreSaved = false;
  pendingEntry = null;
  stopRepeat();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  overlay.classList.remove('is-gameover');
  startScreen.classList.add('hidden');
  nameEntry.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// pantalla de inicio: tablero recien inicializado pero en pausa, con la tabla de records
function showStartScreen() {
  init();
  paused = true;
  cancelAnimationFrame(animId);
  animId = null;
  renderStartScores();
  startScreen.classList.remove('hidden');
}

// ---- input: acciones compartidas por teclado, botones y gestos ----

const ACTIONS = {
  left:   () => { if (!collide(current.shape, current.x - 1, current.y)) current.x--; },
  right:  () => { if (!collide(current.shape, current.x + 1, current.y)) current.x++; },
  down:   () => softDrop(),
  rotate: () => tryRotate(),
  drop:   () => hardDrop(),
};

const KEYMAP = {
  KeyP: 'pause',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'down',
  ArrowUp: 'rotate',
  KeyX: 'rotate',
  Space: 'drop',
};

function doAction(name) {
  audio(); // el AudioContext necesita un gesto del usuario para arrancar
  if (name === 'pause') {
    if (!startScreen.classList.contains('hidden')) return; // no pausar el menu de inicio
    togglePause();
    return;
  }
  if (paused || gameOver) return;
  const fn = ACTIONS[name];
  if (!fn) return;
  fn();
  updateHUD();
}

document.addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return; // no interceptar mientras se escribe el nombre
  const action = KEYMAP[e.code];
  if (!action) { audio(); return; }
  if (e.code === 'Space') e.preventDefault();
  doAction(action);
});

// ---- botones en pantalla ----

const touchControls = document.getElementById('touch-controls');
const REPEATABLE = { left: true, right: true, down: true };
const DAS_DELAY = 180; // ms hasta que arranca la repeticion
const DAS_RATE = 60;   // ms entre repeticiones
let repeatDelayId = null, repeatIntId = null;

function startRepeat(name) {
  stopRepeat();
  if (!REPEATABLE[name]) return;
  repeatDelayId = setTimeout(() => {
    repeatIntId = setInterval(() => doAction(name), DAS_RATE);
  }, DAS_DELAY);
}

function stopRepeat() {
  clearTimeout(repeatDelayId);
  clearInterval(repeatIntId);
  repeatDelayId = null;
  repeatIntId = null;
}

touchControls.addEventListener('pointerdown', e => {
  const btn = e.target.closest('.tbtn');
  if (!btn) return;
  e.preventDefault(); // evita el click fantasma y la seleccion de texto
  btn.setPointerCapture?.(e.pointerId);
  doAction(btn.dataset.action);
  startRepeat(btn.dataset.action);
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
  touchControls.addEventListener(ev, stopRepeat);
}

// ---- gestos sobre el tablero ----

const SWIPE_STEP = 24;  // px por celda arrastrada
const DROP_DIST = 60;   // px hacia abajo para caida dura
const TAP_MS = 250, TAP_SLOP = 10;
let gest = null;

canvas.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return; // en escritorio el raton no juega
  e.preventDefault();
  canvas.setPointerCapture?.(e.pointerId);
  gest = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false };
});

canvas.addEventListener('pointermove', e => {
  if (!gest) return;
  let dx = e.clientX - gest.x;
  // un mismo arrastre puede encadenar varios pasos
  while (Math.abs(dx) >= SWIPE_STEP) {
    const dir = dx > 0 ? 1 : -1;
    doAction(dir > 0 ? 'right' : 'left');
    gest.x += dir * SWIPE_STEP;
    gest.moved = true;
    dx -= dir * SWIPE_STEP;
  }
});

canvas.addEventListener('pointerup', e => {
  if (!gest) return;
  const dx = e.clientX - gest.x0;
  const dy = e.clientY - gest.y0;
  const dt = performance.now() - gest.t0;
  if (dy >= DROP_DIST && Math.abs(dy) > Math.abs(dx)) {
    doAction('drop');
  } else if (!gest.moved && dt < TAP_MS && Math.hypot(dx, dy) < TAP_SLOP) {
    doAction('rotate');
  }
  gest = null;
});

canvas.addEventListener('pointercancel', () => { gest = null; });

restartBtn.addEventListener('click', init);
themeToggleBtn.addEventListener('click', toggleTheme);
startPlayBtn.addEventListener('click', init);
startResetBtn.addEventListener('click', resetScores);
overlayResetBtn.addEventListener('click', resetScores);
nameSaveBtn.addEventListener('click', saveScoreEntry);
nameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); saveScoreEntry(); }
});

updateThemeToggleUI();
showStartScreen();
