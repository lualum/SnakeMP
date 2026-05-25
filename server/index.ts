import * as http from "http";
import { WebSocketServer, WebSocket } from "ws";
import {
    COLS,
    ROWS,
    FRUIT_COUNT,
    DEATH_ANIM_MS,
    DEATH_MULTIPLIER,
    WIN_LENGTH,
    INITIAL_LENGTH,
} from "../shared/config.js";
import { WsMessage, Point, Direction } from "../shared/types.js";

interface ExtendedWebSocket extends WebSocket {
    roomCode: string | null;
    pid: number | null;
}

interface ServerSnake {
    body: Point[];
    dir: Direction;
}

interface Room {
    players: [ExtendedWebSocket, ExtendedWebSocket];
    wantsRestart: [boolean, boolean];
    // Prevent a second death from firing another restart while one is in flight.
    restartPending: boolean;
    scores: [number, number];
    combos: [number, number];
    snakes: [ServerSnake | null, ServerSnake | null];
    fruits: Map<number, Point>;
    fruitCounter: number;
}

const server = http.createServer();
const wss = new WebSocketServer({ server });
const rooms = new Map<string, Room>();
const waiting = new Map<string, ExtendedWebSocket>();

function generateCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let result = "";
    for (let i = 0; i < 4; i++)
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

function send(ws: ExtendedWebSocket, msg: object): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room: Room, msg: object): void {
    const raw = JSON.stringify(msg);
    for (const p of room.players)
        if (p.readyState === WebSocket.OPEN) p.send(raw);
}

function generateFruits(): Point[] {
    const occupied = new Set<string>();
    const fruits: Point[] = [];
    for (let i = 0; i < FRUIT_COUNT; i++) {
        let pos: Point;
        do {
            pos = [
                Math.floor(Math.random() * COLS),
                Math.floor(Math.random() * ROWS),
            ];
        } while (occupied.has(`${pos[0]},${pos[1]}`));
        occupied.add(`${pos[0]},${pos[1]}`);
        fruits.push(pos);
    }
    return fruits;
}

function initServerSnake(pid: number): ServerSnake {
    const headX = pid === 0 ? INITIAL_LENGTH : COLS - INITIAL_LENGTH - 1;
    const headY = Math.floor(ROWS / 2);
    const dir: Direction = pid === 0 ? [1, 0] : [-1, 0];
    const tailDx = pid === 0 ? -1 : 1;
    const body: Point[] = [];
    for (let i = 0; i < INITIAL_LENGTH; i++)
        body.push([headX + tailDx * i, headY]);
    return { body, dir };
}

function fruitsToMap(fruits: Point[]): Map<number, Point> {
    const m = new Map<number, Point>();
    for (let i = 0; i < fruits.length; i++) m.set(i, fruits[i]);
    return m;
}

// Spawn a replacement fruit on the server, avoiding snake bodies and existing fruits.
function serverSpawnFruit(room: Room, excludeId: number): Point | null {
    const occupied = new Set<string>();
    for (const s of room.snakes)
        if (s) for (const [x, y] of s.body) occupied.add(`${x},${y}`);
    for (const [id, [x, y]] of room.fruits)
        if (id !== excludeId) occupied.add(`${x},${y}`);

    const open: Point[] = [];
    for (let x = 0; x < COLS; x++)
        for (let y = 0; y < ROWS; y++)
            if (!occupied.has(`${x},${y}`)) open.push([x, y]);

    if (open.length === 0) return null;
    return open[Math.floor(Math.random() * open.length)];
}

// Apply a move to the server snake and return a death reason, or null if safe.
// fruitEaten is set to the fruit id if the snake ate a fruit this step.
function applyServerMove(
    room: Room,
    pid: number,
    dir: Direction,
): {
    deathReason: string | null;
    ateFruitId: number | null;
    newFruit: Point | null;
} {
    const s = room.snakes[pid];
    if (!s)
        return { deathReason: "no_snake", ateFruitId: null, newFruit: null };

    s.dir = dir;
    const nx = s.body[0][0] + dir[0];
    const ny = s.body[0][1] + dir[1];
    s.body.unshift([nx, ny]);

    // Wall check
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
        return { deathReason: "wall", ateFruitId: null, newFruit: null };
    }

    // Fruit check (must happen before tail pop so body length is correct)
    let ateFruitId: number | null = null;
    let newFruit: Point | null = null;
    for (const [fid, [fx, fy]] of room.fruits) {
        if (fx === nx && fy === ny) {
            ateFruitId = fid;
            newFruit = serverSpawnFruit(room, fid);
            if (newFruit) room.fruits.set(fid, newFruit);
            else room.fruits.delete(fid);
            break;
        }
    }

    // Pop tail only if no fruit was eaten
    if (ateFruitId === null) s.body.pop();

    // Self collision (skip head at index 0, tail already popped)
    for (let i = 1; i < s.body.length; i++)
        if (s.body[i][0] === nx && s.body[i][1] === ny)
            return { deathReason: "self", ateFruitId, newFruit };

    // Opponent collision
    const opp = room.snakes[1 - pid];
    if (opp)
        for (const [ox, oy] of opp.body)
            if (ox === nx && oy === ny)
                return { deathReason: "opponent", ateFruitId, newFruit };

    return { deathReason: null, ateFruitId, newFruit };
}

// Centralised death handler — mirrors the old died_relay path.
function handleServerDeath(
    code: string,
    room: Room,
    pid: number,
    reason: string,
): void {
    if (room.restartPending) return;
    room.restartPending = true;

    const survivor = 1 - pid;
    room.scores[survivor] = Math.floor(
        room.scores[survivor] * DEATH_MULTIPLIER,
    );
    room.combos = [0, 0];

    broadcast(room, {
        type: "died",
        pid,
        reason,
        score: [...room.scores] as [number, number],
    });

    if (room.scores[survivor] >= WIN_LENGTH) {
        setTimeout(() => {
            if (!rooms.has(code)) return;
            room.restartPending = false;
            broadcast(room, {
                type: "result",
                winner: survivor,
                scores: [...room.scores] as [number, number],
            });
        }, DEATH_ANIM_MS + 200);
    } else {
        setTimeout(() => {
            if (!rooms.has(code)) return;
            room.restartPending = false;
            // Reset server snake state for the new round
            room.snakes = [initServerSnake(0), initServerSnake(1)];
            const fruits = generateFruits();
            room.fruits = fruitsToMap(fruits);
            broadcast(room, { type: "round_restart", fruits });
        }, DEATH_ANIM_MS + 200);
    }
}

wss.on("connection", (ws: ExtendedWebSocket) => {
    ws.on("message", (raw: Buffer) => {
        const msg = JSON.parse(raw.toString()) as WsMessage;

        if (msg.type === "create") {
            let code = generateCode();
            while (waiting.has(code)) code = generateCode();
            ws.roomCode = code;
            ws.pid = 0;
            waiting.set(code, ws);
            send(ws, { type: "created", code, pid: 0 });
            console.log(`Room created: ${code}`);
            return;
        }

        if (msg.type === "join") {
            const code = (msg as any).code?.toUpperCase();
            const host = waiting.get(code);
            if (!host) {
                send(ws, { type: "error", msg: "Room not found" });
                return;
            }
            ws.roomCode = code;
            ws.pid = 1;
            waiting.delete(code);

            const room: Room = {
                players: [host, ws],
                wantsRestart: [false, false],
                restartPending: false,
                scores: [0, 0],
                combos: [0, 0],
                snakes: [initServerSnake(0), initServerSnake(1)],
                fruits: new Map(),
                fruitCounter: 0,
            };
            rooms.set(code, room);

            const fruits = generateFruits();
            room.fruits = fruitsToMap(fruits);
            send(host, { type: "start", pid: 0, code, fruits });
            send(ws, { type: "start", pid: 1, code, fruits });

            console.log(`Room started: ${code}`);
            return;
        }

        const code = ws.roomCode;
        if (!code) return;
        const room = rooms.get(code);
        if (!room) return;

        const pid = ws.pid;
        if (pid === null) return;
        const other = room.players[1 - pid];

        if (msg.type === "move") {
            if (room.restartPending) return;

            // Apply the move to the server's authoritative snake state and check
            // for collisions. The opponent gets the move regardless so their
            // rendering stays smooth; a "died" broadcast follows immediately if
            // a collision is detected.
            const { deathReason, ateFruitId, newFruit } = applyServerMove(
                room,
                pid,
                msg.dir,
            );

            // Relay the move to the opponent for visual smoothness.
            send(other, msg);

            if (deathReason) {
                handleServerDeath(code, room, pid, deathReason);
                return;
            }

            // If a fruit was eaten, handle scoring authoritatively here instead
            // of waiting for the client's fruit_eaten message.
            if (ateFruitId !== null) {
                room.combos[pid]++;
                room.combos[1 - pid] = 0;
                room.scores[pid] += room.combos[pid];
                broadcast(room, {
                    type: "fruit_eaten",
                    pid,
                    fruitId: ateFruitId,
                    newFruit,
                    score: [...room.scores] as [number, number],
                    combo: room.combos[pid],
                });

                if (room.scores[pid] >= WIN_LENGTH) {
                    broadcast(room, {
                        type: "result",
                        winner: pid,
                        scores: [...room.scores] as [number, number],
                    });
                }
            }
            return;
        }

        // fruit_eaten is now handled server-side inside the move handler above.
        // This branch is kept as a no-op for older clients but should not fire.
        if (msg.type === "fruit_eaten") {
            return;
        }

        // died_relay is no longer sent by clients — the server detects deaths.
        // This branch is kept as a safety no-op.
        if (msg.type === "died_relay") {
            return;
        }

        // result_relay is no longer needed — the server broadcasts results directly.
        if (msg.type === "result_relay") {
            return;
        }

        // Explicit play-again after a match result (button press).
        if (msg.type === "restart") {
            room.wantsRestart[pid] = true;
            const otherId = 1 - pid;

            if (room.wantsRestart[otherId]) {
                room.wantsRestart = [false, false];
                room.scores = [0, 0];
                room.combos = [0, 0];
                room.snakes = [initServerSnake(0), initServerSnake(1)];
                const fruits = generateFruits();
                room.fruits = fruitsToMap(fruits);
                broadcast(room, { type: "restart_ack", fruits });
            } else {
                send(ws, { type: "restart_waiting" });
                send(other, { type: "opponent_restart" });
            }
            return;
        }
    });

    ws.on("close", () => {
        const code = ws.roomCode;
        if (!code) return;
        waiting.delete(code);
        const room = rooms.get(code);
        if (room) {
            const other = room.players.find((p) => p !== ws);
            other && send(other, { type: "opponent_left" });
            rooms.delete(code);
            console.log(`Room closed: ${code}`);
        }
    });
});

server.listen(8000, () => console.log("Server listening on port 8000"));
