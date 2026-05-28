import express from "express";
import path from "path";
import * as http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { serverConfig } from "@shared/server-config";
import { GameHooks, State } from "@shared/state";
import {
    COLS,
    DEATH_ANIM_MS,
    DEATH_MULTIPLIER,
    ROWS,
    WIN_LENGTH,
} from "@shared/config";
import { Point, WsMessage } from "@shared/types";

interface ExtendedWebSocket extends WebSocket {
    roomCode: string | null;
    pid: number | null;
}

interface Room {
    players: [ExtendedWebSocket, ExtendedWebSocket];
    wantsRestart: [boolean, boolean];
    restartPending: boolean;
    state: State;
}

const dirname = import.meta?.dirname || __dirname;

const app = express();

const clientDist = path.resolve(dirname, "../../dist/public");

app.use(express.static(clientDist));

app.get("/games/:roomCode", (req, res) => {
    const roomCode = String(req.params.roomCode ?? "").toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(roomCode))
        return res.status(404).send("Invalid room code");
    res.sendFile(path.join(clientDist, "index.html"));
});

// SPA fallback (must stay after other routes).
app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
});

const server = http.createServer(app);
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

function makeFruitsArray(state: State): Point[] {
    const fruits: Point[] = [];
    for (const [, pt] of state.fruits) fruits.push(pt);
    return fruits;
}

function makeHooks(code: string, getRoom: () => Room | undefined): GameHooks {
    return {
        onMove(pid, _dir) {
            const room = getRoom();
            if (!room) return;
            const snake = room.state.snakes[pid];
            if (!snake) return;
            const [hx, hy] = snake.body[0];

            if (hx < 0 || hx >= COLS || hy < 0 || hy >= ROWS) {
                room.state.kill(pid, "wall");
                return;
            }

            const selfHit = snake.body
                .slice(1)
                .some(([bx, by]) => bx === hx && by === hy);
            if (selfHit) {
                room.state.kill(pid, "self");
                return;
            }

            const opp = room.state.snakes[1 - pid];
            if (opp?.body.some(([bx, by]) => bx === hx && by === hy)) {
                room.state.kill(pid, "opponent");
            }
        },

        onFruitEaten(pid, fruitId, _clientNewFruit) {
            const room = getRoom();
            if (!room) return;

            room.state.combo[pid]++;
            room.state.combo[1 - pid] = 0;
            room.state.score[pid] += room.state.combo[pid];

            // Server is the sole authority on fruit placement; ignore the
            // client-supplied value and compute the replacement here so both
            // clients receive the same authoritative position.
            const newFruit = room.state.getFruitLoc(fruitId);
            if (newFruit) room.state.fruits.set(fruitId, newFruit);

            broadcast(room, {
                type: "fruit_eaten",
                pid,
                fruitId,
                newFruit,
                score: [...room.state.score] as [number, number],
                combo: room.state.combo[pid],
            });

            if (room.state.score[pid] >= WIN_LENGTH) {
                broadcast(room, {
                    type: "result",
                    winner: pid,
                    scores: [...room.state.score] as [number, number],
                });
            }
        },

        onDied(pid, reason) {
            const room = getRoom();
            if (!room) return;
            if (room.restartPending) return;
            room.restartPending = true;

            const survivor = 1 - pid;
            room.state.score[survivor] = Math.floor(
                room.state.score[survivor] * DEATH_MULTIPLIER,
            );
            room.state.combo = [0, 0];

            broadcast(room, {
                type: "died",
                pid,
                reason,
                score: [...room.state.score] as [number, number],
            });

            if (room.state.score[survivor] >= WIN_LENGTH) {
                setTimeout(() => {
                    if (!rooms.has(code)) return;
                    room.restartPending = false;
                    broadcast(room, {
                        type: "result",
                        winner: survivor,
                        scores: [...room.state.score] as [number, number],
                    });
                }, DEATH_ANIM_MS + 200);
            } else {
                setTimeout(() => {
                    if (!rooms.has(code)) return;
                    room.restartPending = false;
                    room.state.startRound(false);
                    broadcast(room, {
                        type: "round_restart",
                        fruits: makeFruitsArray(room.state),
                    });
                }, DEATH_ANIM_MS + 200);
            }
        },

        onResult(winner, scores) {
            // Result is broadcast directly from onFruitEaten / onDied.
        },

        startLoop() {
            // No render loop on the server.
        },

        showGame() {
            // No UI on the server.
        },
    };
}

function createRoom(
    host: ExtendedWebSocket,
    guest: ExtendedWebSocket,
    code: string,
): Room {
    const state = new State();
    const room: Room = {
        players: [host, guest],
        wantsRestart: [false, false],
        restartPending: false,
        state,
    };

    const hooks = makeHooks(code, () => rooms.get(code));
    state.setHooks(hooks);
    state.startRound(true);

    return room;
}

wss.on("connection", (ws: ExtendedWebSocket) => {
    ws.roomCode = null;
    ws.pid = null;

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

            const room = createRoom(host, ws, code);
            rooms.set(code, room);

            const fruits = makeFruitsArray(room.state);
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

            // Apply the move to the shared State and let hooks handle
            // fruit scoring and death detection.
            room.state.moveSnake(pid, msg.dir, true);

            // Relay the raw move to the opponent for smooth rendering.
            send(other, msg);
            return;
        }

        // Legacy no-ops — server now handles these authoritatively.
        if (
            msg.type === "fruit_eaten" ||
            msg.type === "died_relay" ||
            msg.type === "result_relay"
        ) {
            return;
        }

        if (msg.type === "restart") {
            room.wantsRestart[pid] = true;
            const otherId = 1 - pid;

            if (room.wantsRestart[otherId]) {
                room.wantsRestart = [false, false];
                room.state.startRound(true);
                const fruits = makeFruitsArray(room.state);
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

const PORT = serverConfig.PORT;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
