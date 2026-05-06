const CONFIGS = {
  easy: { rows: 6, cols: 8, targetPieces: 8, minLength: 3, maxLength: 5 },
  normal: { rows: 7, cols: 10, targetPieces: 13, minLength: 3, maxLength: 6 },
  hard: { rows: 8, cols: 10, targetPieces: 15, minLength: 4, maxLength: 6 },
};

const DIRECTIONS = {
  up: { row: -1, col: 0, label: "上", x: 0, y: -900, angle: -90 },
  right: { row: 0, col: 1, label: "右", x: 1100, y: 0, angle: 0 },
  down: { row: 1, col: 0, label: "下", x: 0, y: 900, angle: 90 },
  left: { row: 0, col: -1, label: "左", x: -1100, y: 0, angle: 180 },
};

const COLORS = ["#58e7a5", "#58a9ff", "#ffd15c", "#ff7aa8", "#a990ff", "#ff8d55"];
const STORAGE_KEY = "arrow-escape-records";
const CELL = 100;
const boardEl = document.querySelector("#board");
const sceneEl = document.querySelector("#scene");
const movesEl = document.querySelector("#moves");
const leftEl = document.querySelector("#left");
const missesEl = document.querySelector("#misses");
const messageEl = document.querySelector("#message");
const canvas = document.querySelector("#spark-canvas");
const ctx = canvas.getContext("2d");
const dialog = document.querySelector("#result-dialog");
const resultCopy = document.querySelector("#result-copy");

let state;
let particles = [];

function createState(difficulty = "normal") {
  const config = CONFIGS[difficulty];
  return {
    difficulty,
    ...config,
    pieces: [],
    moves: 0,
    mistakes: 0,
    maxMistakes: 3,
    left: config.targetPieces,
    ended: false,
    history: [],
  };
}

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveRecord(difficulty, moves) {
  const records = loadRecords();
  if (!records[difficulty] || moves < records[difficulty]) {
    records[difficulty] = moves;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }
}

function updateHud() {
  movesEl.textContent = String(Math.min(state.moves, 999)).padStart(3, "0");
  leftEl.textContent = String(Math.min(state.left, 999)).padStart(3, "0");
  missesEl.textContent = `${state.mistakes}/${state.maxMistakes}`;
}

function key(row, col) {
  return `${row},${col}`;
}

function inBounds(row, col) {
  return row >= 0 && row < state.rows && col >= 0 && col < state.cols;
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function shuffled(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function occupiedBy(pieces, excludeId = null) {
  const occupied = new Map();
  pieces.forEach((piece) => {
    if (piece.escaped || piece.id === excludeId) return;
    piece.cells.forEach((cell) => occupied.set(key(cell.row, cell.col), piece.id));
  });
  return occupied;
}

function rayClear(cell, directionName, occupied) {
  const direction = DIRECTIONS[directionName];
  let row = cell.row + direction.row;
  let col = cell.col + direction.col;
  while (inBounds(row, col)) {
    if (occupied.has(key(row, col))) return false;
    row += direction.row;
    col += direction.col;
  }
  return true;
}

function exitRayCells(piece, pieces) {
  const occupied = occupiedBy(pieces, piece.id);
  const direction = DIRECTIONS[piece.direction];
  const cells = [];
  piece.cells.forEach((cell) => {
    let row = cell.row + direction.row;
    let col = cell.col + direction.col;
    while (inBounds(row, col)) {
      const cellKey = key(row, col);
      if (occupied.has(cellKey)) break;
      cells.push(cellKey);
      row += direction.row;
      col += direction.col;
    }
  });
  return cells;
}

function blockingTargets(pieces, occupied) {
  const targets = new Set();
  pieces.forEach((piece) => {
    if (piece.escaped) return;
    exitRayCells(piece, pieces).forEach((cellKey) => {
      if (!occupied.has(cellKey)) targets.add(cellKey);
    });
  });
  return targets;
}

function growthOptions(directionName) {
  const direction = DIRECTIONS[directionName];
  const backward = { row: -direction.row, col: -direction.col };
  const sideways = Object.values(DIRECTIONS)
    .filter((item) => item.row !== direction.row || item.col !== direction.col)
    .filter((item) => item.row !== backward.row || item.col !== backward.col);
  return [backward, backward, ...sideways];
}

function createArrowLineCandidate(occupied, length, directionName) {
  const starts = shuffled(Array.from({ length: state.rows * state.cols }, (_, index) => ({
    row: Math.floor(index / state.cols),
    col: index % state.cols,
  })));
  const growBy = growthOptions(directionName);

  for (const head of starts) {
    if (occupied.has(key(head.row, head.col)) || !rayClear(head, directionName, occupied)) continue;
    const cells = [head];
    const used = new Set([key(head.row, head.col)]);

    while (cells.length < length) {
      let next = null;
      const tail = cells[cells.length - 1];
      const options = shuffled(growBy)
        .map((direction) => ({ row: tail.row + direction.row, col: tail.col + direction.col }))
        .filter((cell) => {
          const cellKey = key(cell.row, cell.col);
          return inBounds(cell.row, cell.col)
            && !used.has(cellKey)
            && !occupied.has(cellKey)
            && rayClear(cell, directionName, occupied);
        });
      if (options.length) next = options[0];
      if (!next) break;
      cells.push(next);
      used.add(key(next.row, next.col));
    }

    if (cells.length === length) return cells.reverse();
  }

  return null;
}

function createArrowLine(occupied, length, pieces) {
  const targets = blockingTargets(pieces, occupied);
  let best = null;

  for (let attempt = 0; attempt < 28; attempt += 1) {
    const direction = shuffled(Object.keys(DIRECTIONS))[0];
    const cells = createArrowLineCandidate(occupied, length, direction);
    if (!cells) continue;
    const blocks = cells.filter((cell) => targets.has(key(cell.row, cell.col))).length;
    const edgeDistance = Math.min(...cells.map((cell) => (
      Math.min(cell.row, state.rows - 1 - cell.row, cell.col, state.cols - 1 - cell.col)
    )));
    const score = blocks * 10 + edgeDistance + Math.random();
    if (!best || score > best.score) best = { cells, direction, score };
  }

  return best;
}

function generatePieces() {
  const pieces = [];
  const occupied = new Map();
  let attempts = 0;

  while (pieces.length < state.targetPieces && attempts < state.targetPieces * 70) {
    attempts += 1;
    const length = randInt(state.minLength, state.maxLength);
    const candidate = createArrowLine(occupied, length, pieces);
    if (!candidate) continue;
    const { cells, direction } = candidate;
    cells.forEach((cell) => occupied.set(key(cell.row, cell.col), pieces.length + 1));
    pieces.push({
      id: pieces.length + 1,
      cells,
      direction,
      color: COLORS[pieces.length % COLORS.length],
      escaped: false,
    });
  }

  return pieces.reverse().map((piece, index) => ({ ...piece, id: index + 1 }));
}

function canEscape(piece, pieces = state.pieces) {
  const occupied = occupiedBy(pieces, piece.id);
  const direction = DIRECTIONS[piece.direction];
  let step = 1;

  while (true) {
    const shifted = piece.cells.map((cell) => ({
      row: cell.row + direction.row * step,
      col: cell.col + direction.col * step,
    }));

    const inBoard = shifted.filter((cell) => inBounds(cell.row, cell.col));
    if (!inBoard.length) return true;
    if (inBoard.some((cell) => occupied.has(key(cell.row, cell.col)))) return false;
    step += 1;
  }
}

function cellPoint(cell) {
  return {
    x: cell.col * CELL + CELL / 2,
    y: cell.row * CELL + CELL / 2,
  };
}

function arrowPath(cells) {
  return cells
    .map((cell, index) => {
      const point = cellPoint(cell);
      return `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`;
    })
    .join(" ");
}

function arrowHeadPoints(piece) {
  const head = cellPoint(piece.cells[piece.cells.length - 1]);
  const angle = DIRECTIONS[piece.direction].angle * Math.PI / 180;
  const tip = { x: head.x + Math.cos(angle) * 40, y: head.y + Math.sin(angle) * 40 };
  const left = { x: head.x + Math.cos(angle + 2.45) * 34, y: head.y + Math.sin(angle + 2.45) * 34 };
  const right = { x: head.x + Math.cos(angle - 2.45) * 34, y: head.y + Math.sin(angle - 2.45) * 34 };
  return `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`;
}

function renderBoard() {
  boardEl.innerHTML = "";
  boardEl.style.setProperty("--rows", state.rows);
  boardEl.style.setProperty("--cols", state.cols);
  boardEl.style.setProperty("--view-width", state.cols * CELL);
  boardEl.style.setProperty("--view-height", state.rows * CELL);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${state.cols * CELL} ${state.rows * CELL}`);
  svg.setAttribute("role", "presentation");
  svg.classList.add("arrow-field");

  state.pieces.filter((piece) => !piece.escaped).forEach((piece) => {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("arrow-piece");
    group.dataset.id = piece.id;
    group.style.setProperty("--piece-color", piece.color);
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");
    group.setAttribute("aria-label", `${DIRECTIONS[piece.direction].label}へ抜ける矢印`);

    const shadow = document.createElementNS("http://www.w3.org/2000/svg", "path");
    shadow.classList.add("arrow-shadow");
    shadow.setAttribute("d", arrowPath(piece.cells));

    const body = document.createElementNS("http://www.w3.org/2000/svg", "path");
    body.classList.add("arrow-body");
    body.setAttribute("d", arrowPath(piece.cells));

    const head = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    head.classList.add("arrow-head");
    head.setAttribute("points", arrowHeadPoints(piece));

    group.append(shadow, body, head);
    svg.append(group);
  });

  boardEl.append(svg);
  updateBoardScale();
}

function movePiece(id) {
  const piece = state.pieces.find((item) => item.id === id);
  if (!piece || piece.escaped || state.ended) return;

  if (!canEscape(piece)) {
    const segments = boardEl.querySelectorAll(`[data-id="${id}"]`);
    segments.forEach((segment) => {
      segment.classList.remove("blocked");
      window.requestAnimationFrame(() => segment.classList.add("blocked"));
    });
    state.mistakes += 1;
    updateHud();
    messageEl.textContent = state.mistakes >= state.maxMistakes ? "ミスが3回になりました" : "その矢印はまだ抜けられません";
    checkLose();
    return;
  }

  state.history.push({ id, escaped: false });
  state.moves += 1;
  state.left -= 1;
  piece.escaped = true;
  animateEscape(piece);
  emitPieceParticles(piece, "#5de2a8", 20);
  window.setTimeout(renderBoard, 210);
  messageEl.textContent = state.left ? "次に抜けられる矢印の形を読みましょう" : "すべての矢印が脱出しました";
  updateHud();
  checkWin();
}

function animateEscape(piece) {
  const direction = DIRECTIONS[piece.direction];
  boardEl.querySelectorAll(`[data-id="${piece.id}"]`).forEach((segment) => {
    segment.style.setProperty("--escape-x", `${direction.x}px`);
    segment.style.setProperty("--escape-y", `${direction.y}px`);
    segment.classList.add("escaping");
  });
}

function undoMove() {
  if (!state.history.length || state.ended) return;
  const last = state.history.pop();
  const piece = state.pieces.find((item) => item.id === last.id);
  if (!piece) return;
  piece.escaped = false;
  state.left += 1;
  state.moves = Math.max(0, state.moves - 1);
  renderBoard();
  updateHud();
  messageEl.textContent = "一手戻しました";
}

function showHint() {
  const candidates = state.pieces.filter((piece) => !piece.escaped && canEscape(piece));
  if (!candidates.length || state.ended) return;
  const piece = candidates[Math.floor(Math.random() * candidates.length)];
  boardEl.querySelectorAll(`[data-id="${piece.id}"]`).forEach((segment) => segment.classList.add("hint-pulse"));
  window.setTimeout(() => {
    boardEl.querySelectorAll(`[data-id="${piece.id}"]`).forEach((segment) => segment.classList.remove("hint-pulse"));
  }, 850);
  messageEl.textContent = "光った矢印は抜けられます";
}

function checkWin() {
  if (state.left !== 0) return;
  state.ended = true;
  saveRecord(state.difficulty, state.moves);
  emitSceneParticles("#65b7ff", 90);
  document.querySelector("#result-kicker").textContent = "CLEAR";
  document.querySelector("#result-title").textContent = "脱出完了";
  resultCopy.textContent = `${state.moves}手でクリアしました。ベストはこの端末に保存されます。`;
  if (typeof dialog.showModal === "function") dialog.showModal();
}

function checkLose() {
  if (state.mistakes < state.maxMistakes) return;
  state.ended = true;
  document.querySelector("#result-kicker").textContent = "MISS";
  document.querySelector("#result-title").textContent = "脱出失敗";
  resultCopy.textContent = "ミスは3回までです。矢印の形と進路を読み直して再挑戦しましょう。";
  if (typeof dialog.showModal === "function") dialog.showModal();
}

function startGame(difficulty = state?.difficulty || "normal") {
  state = createState(difficulty);
  state.pieces = generatePieces();
  state.left = state.pieces.length;
  renderBoard();
  updateHud();
  messageEl.textContent = "正しい矢印を選んで、3ミス以内に脱出させましょう";
  document.querySelectorAll("[data-difficulty]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.difficulty === difficulty));
  });
}

function pieceFromEvent(event) {
  const segment = event.target.closest(".arrow-piece");
  if (!segment || !boardEl.contains(segment)) return null;
  return Number(segment.dataset.id);
}

boardEl.addEventListener("click", (event) => {
  const id = pieceFromEvent(event);
  if (id === null) return;
  movePiece(id);
});

document.querySelector("#new-game").addEventListener("click", () => startGame());
document.querySelector("#undo").addEventListener("click", undoMove);
document.querySelector("#hint").addEventListener("click", showHint);

document.querySelectorAll("[data-difficulty]").forEach((button) => {
  button.addEventListener("click", () => startGame(button.dataset.difficulty));
});

dialog.addEventListener("close", () => {
  if (dialog.returnValue === "restart") startGame();
});

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * scale);
  canvas.height = Math.floor(rect.height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  updateBoardScale();
}

function updateBoardScale() {
  if (!state) return;
  const sceneRect = sceneEl.getBoundingClientRect();
  const compact = sceneRect.width < 560;
  const gap = compact ? 4 : 7;
  const pad = compact ? 8 : 14;
  const maxCell = compact ? 48 : 54;
  const widthCell = (sceneRect.width - 24 - pad * 2 - gap * (state.cols - 1)) / state.cols;
  const heightCell = (sceneRect.height - 24 - pad * 2 - gap * (state.rows - 1)) / state.rows;
  const cellSize = Math.max(26, Math.floor(Math.min(widthCell, heightCell, maxCell)));
  boardEl.style.setProperty("--gap", `${gap}px`);
  boardEl.style.setProperty("--board-pad", `${pad}px`);
  boardEl.style.setProperty("--cell-size", `${cellSize}px`);
}

function pieceCenter(piece) {
  const head = piece.cells[piece.cells.length - 1];
  const boardRect = boardEl.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  return {
    x: boardRect.left - canvasRect.left + boardRect.width * ((head.col + 0.5) / state.cols),
    y: boardRect.top - canvasRect.top + boardRect.height * ((head.row + 0.5) / state.rows),
  };
}

function emitPieceParticles(piece, color, count) {
  const center = pieceCenter(piece);
  for (let i = 0; i < count; i += 1) {
    particles.push({
      x: center.x,
      y: center.y,
      vx: (Math.random() - 0.5) * 5,
      vy: (Math.random() - 0.8) * 5,
      life: 28 + Math.random() * 20,
      age: 0,
      size: 2 + Math.random() * 3,
      color,
    });
  }
}

function emitSceneParticles(color, count) {
  const rect = canvas.getBoundingClientRect();
  for (let i = 0; i < count; i += 1) {
    particles.push({
      x: rect.width * Math.random(),
      y: rect.height * Math.random(),
      vx: (Math.random() - 0.5) * 4,
      vy: -1 - Math.random() * 4,
      life: 45 + Math.random() * 35,
      age: 0,
      size: 2 + Math.random() * 4,
      color,
    });
  }
}

function animateParticles() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  particles = particles.filter((particle) => particle.age < particle.life);
  particles.forEach((particle) => {
    particle.age += 1;
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vy += 0.05;
    const alpha = 1 - particle.age / particle.life;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  window.requestAnimationFrame(animateParticles);
}

window.addEventListener("resize", resizeCanvas);
startGame("normal");
resizeCanvas();
animateParticles();
