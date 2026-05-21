import { Point, MsgDelta, Direction } from "./types";
import { state } from "./state";
import { COLS, ROWS, INITIAL_LENGTH, MS_TILE, FRUIT_COUNT } from "./config";
import { renderLoop } from "./render";
import { send } from "./network";
import { updateHud, showOverlay } from "./ui";

export function startGame() {
    state.gameRunning = true;
    state.oppWantRestart = false;
    state.wantRestart = false;

    document.getElementById("lobby")?.classList.add("hidden");
    document.getElementById("game")!.style.display = "flex";

    document.getElementById("waiting")?.classList.add("hidden");
    document.getElementById("overlay")?.classList.add("hidden");

    startSnakes();
    for (let i = 0; i < FRUIT_COUNT; i++) spawnFruit(i);
    startLoop();
}

function startSnakes() {
    startSnake(0);
    startSnake(1);
}

function startSnake(pid: number) {
    const headX = pid === 0 ? 3 : COLS - 4;
    const headY = Math.floor(ROWS / 2);
    const dir: Direction = pid === 0 ? [1, 0] : [-1, 0];
    const tailDx = pid === 0 ? -1 : 1;

    const body: Point[] = [];

    for (let i = 0; i < INITIAL_LENGTH; i++) {
        const x = headX + tailDx * i;
        const y = headY;
        body.push([x, y]);
    }

    state.snakes[pid] = {
        body,
        dir,
        spos: 0,
        alive: true,
        score: 0,
    };
}

// For current player only.
export function moveMe(dir: Direction, force = false) {
    const s = state.snakes[state.myId];
    if (!s || !s.alive) return;

    if (!force && s.spos < 1) return;
    s.spos = Math.max(0, s.spos - 1);
    s.dir = dir;

    const nx = s.body[0][0] + dir[0];
    const ny = s.body[0][1] + dir[1];

    s.body.unshift([nx, ny]);

    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
        killMe("wall");
        return;
    }

    let fruit: [number, Point | null] | null = null;
    for (const [id, [fx, fy]] of state.fruits) {
        if (fx === nx && fy === ny) {
            state.fruits.delete(id);
            s.score++;
            updateHud();
            const replacement = spawnFruit(id);
            fruit = [id, replacement];
            break;
        }
    }

    if (!fruit) s.body.pop();

    // Self-collision: skip the tail since it moves forward
    for (let i = 1; i < s.body.length - 1; i++) {
        if (s.body[i][0] === nx && s.body[i][1] === ny) {
            killMe("self");
            return;
        }
    }

    // Opponent-body collision
    const oppId = 1 - state.myId;
    const opp = state.snakes[oppId];
    if (opp && opp.alive) {
        for (const [bx, by] of opp.body) {
            if (bx === nx && by === ny) {
                killMe("collision");
                return;
            }
        }
    }

    send({
        type: "delta",
        pid: state.myId,
        head: [nx, ny],
        dir,
        t: performance.now(),
        fruit: fruit ? [fruit[0], null] : undefined,
    });
}

// Note: assumes input is not called midframe.
export function update() {
    if (!state.gameRunning) return;
    const s = state.snakes[state.myId];
    if (!s || !s.alive) return;

    const dt = performance.now() - state.lastUpdated;

    for (let i = 0; i < state.snakes.length; i++) {
        if (i === state.myId) continue;
        const opp = state.snakes[i];
        if (!opp || !opp.alive) continue;
        opp.spos = Math.min(opp.spos + dt / MS_TILE, 1);
    }

    s.spos += Math.min(dt / MS_TILE, 3);
    while (s.spos >= 1 && s.alive) {
        moveMe(s.dir);
    }

    state.lastUpdated = performance.now();
}

export function applyOppDelta(msg: MsgDelta) {
    const oppId = 1 - state.myId;
    const s = state.snakes[oppId];
    if (!s || !s.alive) return;

    s.spos = 0;
    if (!msg.fruit) {
        s.body.pop();
    } else {
        s.score++;
        updateHud();
        const [fruitId] = msg.fruit;
        state.fruits.delete(fruitId);
        spawnFruit(fruitId);
    }

    s.body.unshift(msg.head);
    s.dir = msg.dir;
}

export function killMe(reason: string) {
    state.snakes[state.myId]!.alive = false;
    state.gameRunning = false;
    send({ type: "died", pid: state.myId, t: performance.now(), reason });
    showOverlay("GAME OVER", `Reason: ${reason}`, "lose");
}

export function killOpponent(pid: number, reason: string) {
    state.snakes[pid]!.alive = false;
    state.gameRunning = false;
    showOverlay("YOU WIN", `Opponent ${reason}`, "win");
}

export function spawnFruit(id: number): Point | null {
    const candidates: boolean[][] = [];
    for (let x = 0; x < COLS; x++) {
        candidates[x] = [];
        for (let y = 0; y < ROWS; y++) {
            candidates[x][y] = true;
        }
    }

    for (const s of state.snakes) {
        if (!s) continue;
        for (const [bx, by] of s.body) {
            candidates[bx][by] = false;
        }
    }

    for (const [i, [fx, fy]] of state.fruits) {
        if (i === id) continue;
        candidates[fx][fy] = false;
    }

    const openCells: Point[] = [];
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            if (candidates[x][y]) openCells.push([x, y]);
        }
    }

    if (openCells.length === 0) return null;

    const choice = openCells[Math.floor(state.rng() * openCells.length)];
    state.fruits.set(id, choice);
    return choice;
}

export function startLoop() {
    if (!state.animFrame) state.animFrame = requestAnimationFrame(renderLoop);
}
