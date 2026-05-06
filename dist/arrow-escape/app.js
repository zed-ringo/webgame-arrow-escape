const CONFIGS = {
  easy: { rows: 8, cols: 8, targetPieces: 7, minLength: 3, maxLength: 5 },
  normal: { rows: 9, cols: 9, targetPieces: 12, minLength: 3, maxLength: 7 },
  hard: { rows: 10, cols: 10, targetPieces: 17, minLength: 4, maxLength: 8 },
};

const LEVELS = {
  easy: [
    { cells: [[1, 1], [2, 1], [3, 1]], direction: "down" },
    { cells: [[2, 4], [2, 3], [2, 2]], direction: "left" },
    { cells: [[5, 3], [4, 3], [3, 3]], direction: "up" },
    { cells: [[4, 6], [4, 5], [5, 5], [5, 4]], direction: "left" },
    { cells: [[1, 6], [2, 6], [3, 6]], direction: "down" },
    { cells: [[6, 2], [6, 3], [6, 4]], direction: "right" },
  ],
  normal: [
    { cells: [[1, 1], [2, 1], [3, 1], [4, 1]], direction: "down" },
    { cells: [[2, 5], [2, 4], [2, 3], [2, 2]], direction: "left" },
    { cells: [[6, 3], [5, 3], [4, 3], [3, 3]], direction: "up" },
    { cells: [[4, 7], [4, 6], [5, 6], [5, 5], [5, 4]], direction: "left" },
    { cells: [[1, 7], [2, 7], [3, 7]], direction: "down" },
    { cells: [[7, 1], [7, 2], [7, 3], [7, 4]], direction: "right" },
    { cells: [[6, 7], [6, 6], [6, 5]], direction: "left" },
    { cells: [[0, 4], [1, 4], [1, 5]], direction: "right" },
  ],
  hard: [
    { cells: [[1, 1], [2, 1], [3, 1], [4, 1]], direction: "down" },
    { cells: [[2, 6], [2, 5], [2, 4], [2, 3], [2, 2]], direction: "left" },
    { cells: [[7, 3], [6, 3], [5, 3], [4, 3], [3, 3]], direction: "up" },
    { cells: [[4, 8], [4, 7], [5, 7], [5, 6], [5, 5], [5, 4]], direction: "left" },
    { cells: [[1, 8], [2, 8], [3, 8]], direction: "down" },
    { cells: [[8, 1], [8, 2], [8, 3], [8, 4], [8, 5]], direction: "right" },
    { cells: [[7, 8], [7, 7], [7, 6], [6, 6]], direction: "left" },
    { cells: [[0, 4], [1, 4], [1, 5], [1, 6]], direction: "right" },
    { cells: [[6, 2], [6, 1], [6, 0]], direction: "left" },
    { cells: [[3, 5], [3, 6], [3, 7]], direction: "right" },
  ],
};

const DIRECTIONS = {
  up: { row: -1, col: 0, glyph: "↑", x: 0, y: -980, angle: -90 },
  right: { row: 0, col: 1, glyph: "→", x: 980, y: 0, angle: 0 },
  down: { row: 1, col: 0, glyph: "↓", x: 0, y: 980, angle: 90 },
  left: { row: 0, col: -1, glyph: "←", x: -980, y: 0, angle: 180 },
};

const COLORS = ["#111936", "#273d9a", "#111936", "#5160bf"];
const STORAGE_KEY = "arrow-escape-records";
const CELL = 84;
const PAD = 54;

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

function key(row, col) {
  return `${row},${col}`;
}

function inBounds(row, col) {
  return row >= 0 && row < state.rows && col >= 0 && col < state.cols;
}

function shuffled(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
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

function occupiedBy(pieces, excludeId = null) {
  const occupied = new Map();
  pieces.forEach((piece) => {
    if (piece.escaped || piece.id === excludeId) return;
    piece.cells.forEach((cell) => occupied.set(key(cell.row, cell.col), piece.id));
  });
  return occupied;
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

function createRopeCandidate(occupied, length, directionName) {
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
      if (!options.length) break;
      const next = options[0];
      cells.push(next);
      used.add(key(next.row, next.col));
    }

    if (cells.length === length) return cells.reverse();
  }
  return null;
}

function createRope(occupied, length, pieces) {
  const targets = blockingTargets(pieces, occupied);
  let best = null;
  for (let attempt = 0; attempt < 34; attempt += 1) {
    const direction = shuffled(Object.keys(DIRECTIONS))[0];
    const cells = createRopeCandidate(occupied, length, direction);
    if (!cells) continue;
    const blocks = cells.filter((cell) => targets.has(key(cell.row, cell.col))).length;
    const edgeDistance = Math.min(...cells.map((cell) => (
      Math.min(cell.row, state.rows - 1 - cell.row, cell.col, state.cols - 1 - cell.col)
    )));
    const score = blocks * 14 + edgeDistance + Math.random();
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
    const length = state.minLength + Math.floor(Math.random() * (state.maxLength - state.minLength + 1));
    const candidate = createRope(occupied, length, pieces);
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

  return pieces.reverse().map((piece, index) => ({ ...piece, id: index + 1, color: COLORS[index % COLORS.length] }));
}

function levelPieces(difficulty) {
  return LEVELS[difficulty].map((piece, index) => ({
    id: index + 1,
    cells: piece.cells.map(([row, col]) => ({ row, col })),
    direction: piece.direction,
    color: COLORS[index % COLORS.length],
    escaped: false,
  }));
}

function point(cell) {
  return {
    x: PAD + cell.col * CELL,
    y: PAD + cell.row * CELL,
  };
}

function ropePath(cells) {
  return cells
    .map((cell, index) => {
      const p = point(cell);
      return `${index === 0 ? "M" : "L"} ${p.x} ${p.y}`;
    })
    .join(" ");
}

function arrowHeadPoints(piece) {
  const head = piece.points ? piece.points[piece.points.length - 1] : point(piece.cells[piece.cells.length - 1]);
  const angle = DIRECTIONS[piece.direction].angle * Math.PI / 180;
  const tip = { x: head.x + Math.cos(angle) * 35, y: head.y + Math.sin(angle) * 35 };
  const left = { x: head.x + Math.cos(angle + 2.48) * 28, y: head.y + Math.sin(angle + 2.48) * 28 };
  const right = { x: head.x + Math.cos(angle - 2.48) * 28, y: head.y + Math.sin(angle - 2.48) * 28 };
  return `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`;
}

function pointsPath(points) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function renderBoard() {
  boardEl.innerHTML = "";
  boardEl.style.setProperty("--rows", state.rows);
  boardEl.style.setProperty("--cols", state.cols);
  boardEl.style.setProperty("--view-width", PAD * 2 + (state.cols - 1) * CELL);
  boardEl.style.setProperty("--view-height", PAD * 2 + (state.rows - 1) * CELL);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("rope-field");
  svg.setAttribute("viewBox", `0 0 ${PAD * 2 + (state.cols - 1) * CELL} ${PAD * 2 + (state.rows - 1) * CELL}`);
  svg.setAttribute("role", "presentation");

  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.cols; col += 1) {
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      const p = point({ row, col });
      dot.classList.add("grid-dot");
      dot.setAttribute("cx", p.x);
      dot.setAttribute("cy", p.y);
      dot.setAttribute("r", "4.2");
      svg.append(dot);
    }
  }

  state.pieces.filter((piece) => !piece.escaped).forEach((piece) => {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("rope-piece");
    group.dataset.id = piece.id;
    group.style.setProperty("--piece-color", piece.color);
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");
    group.setAttribute("aria-label", `${DIRECTIONS[piece.direction].glyph} 方向の矢印`);

    const shadow = document.createElementNS("http://www.w3.org/2000/svg", "path");
    shadow.classList.add("rope-shadow");
    shadow.setAttribute("d", ropePath(piece.cells));
    shadow.setAttribute("pathLength", "100");

    const body = document.createElementNS("http://www.w3.org/2000/svg", "path");
    body.classList.add("rope-body");
    body.setAttribute("d", ropePath(piece.cells));
    body.setAttribute("pathLength", "100");

    const head = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    head.classList.add("rope-head");
    head.setAttribute("points", arrowHeadPoints(piece));

    group.append(shadow, body, head);
    svg.append(group);
  });

  boardEl.append(svg);
  updateBoardScale();
}

function animateEscape(piece) {
  const direction = DIRECTIONS[piece.direction];
  const group = boardEl.querySelector(`[data-id="${piece.id}"]`);
  if (!group) return;
  const body = group.querySelector(".rope-body");
  const shadow = group.querySelector(".rope-shadow");
  const head = group.querySelector(".rope-head");
  const start = performance.now();
  const duration = 720;
  const basePoints = piece.cells.map(point);
  const pullDistance = Math.max(state.rows, state.cols) * CELL * 1.25;

  group.classList.add("pulling");

  function frame(now) {
    const elapsed = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - elapsed, 3);
    const distance = eased * pullDistance;
    const shifted = basePoints
      .map((basePoint, index) => {
        const lag = (basePoints.length - 1 - index) * CELL * 0.34;
        const localDistance = Math.max(0, distance - lag);
        return {
          x: basePoint.x + direction.col * localDistance,
          y: basePoint.y + direction.row * localDistance,
        };
      })
      .filter((item) => (
        item.x > -PAD * 2
        && item.x < PAD * 2 + (state.cols - 1) * CELL
        && item.y > -PAD * 2
        && item.y < PAD * 2 + (state.rows - 1) * CELL
      ));

    if (shifted.length >= 2) {
      const d = pointsPath(shifted);
      body.setAttribute("d", d);
      shadow.setAttribute("d", d);
      const transient = { ...piece, points: shifted };
      head.setAttribute("points", arrowHeadPoints(transient));
      group.style.opacity = String(1 - eased * 0.75);
    } else {
      group.style.opacity = "0";
    }

    if (elapsed < 1) window.requestAnimationFrame(frame);
  }

  window.requestAnimationFrame(frame);
}

function markBlocked(id) {
  boardEl.querySelectorAll(`[data-id="${id}"]`).forEach((piece) => {
    piece.classList.remove("blocked");
    window.requestAnimationFrame(() => piece.classList.add("blocked"));
  });
}

function movePiece(id) {
  const piece = state.pieces.find((item) => item.id === id);
  if (!piece || piece.escaped || state.ended) return;

  if (!canEscape(piece)) {
    markBlocked(id);
    state.mistakes += 1;
    updateHud();
    messageEl.textContent = state.mistakes >= state.maxMistakes ? "ミスが3回になりました" : "進路が塞がっています";
    checkLose();
    return;
  }

  state.history.push({ id });
  state.moves += 1;
  state.left -= 1;
  piece.escaped = true;
  animateEscape(piece);
  emitPieceParticles(piece, "#4b5caa", 12);
  window.setTimeout(renderBoard, 760);
  messageEl.textContent = state.left ? "紐の進路を読んで、次の矢印を抜きましょう" : "すべての矢印が脱出しました";
  updateHud();
  checkWin();
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
  const group = boardEl.querySelector(`[data-id="${piece.id}"]`);
  group?.classList.add("hint-pulse");
  window.setTimeout(() => group?.classList.remove("hint-pulse"), 850);
  messageEl.textContent = "光った矢印は抜けられます";
}

function checkWin() {
  if (state.left !== 0) return;
  state.ended = true;
  saveRecord(state.difficulty, state.moves);
  emitSceneParticles("#4b5caa", 80);
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
  resultCopy.textContent = "ミスは3回までです。紐の出口を読み直して再挑戦しましょう。";
  if (typeof dialog.showModal === "function") dialog.showModal();
}

function startGame(difficulty = state?.difficulty || "normal") {
  state = createState(difficulty);
  state.pieces = levelPieces(difficulty);
  state.left = state.pieces.length;
  renderBoard();
  updateHud();
  messageEl.textContent = "先端の向きに紐を引き抜きましょう";
  document.querySelectorAll("[data-difficulty]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.difficulty === difficulty));
  });
}

function pieceFromEvent(event) {
  const piece = event.target.closest(".rope-piece");
  if (!piece || !boardEl.contains(piece)) return null;
  return Number(piece.dataset.id);
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
  const pad = compact ? 10 : 16;
  const maxCell = compact ? 46 : 58;
  const widthCell = (sceneRect.width - 24 - pad * 2) / state.cols;
  const heightCell = (sceneRect.height - 24 - pad * 2) / state.rows;
  const cellSize = Math.max(28, Math.floor(Math.min(widthCell, heightCell, maxCell)));
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
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.8) * 4,
      life: 24 + Math.random() * 18,
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
