import http from "http";
import { WebSocketServer, WebSocket } from "ws";

let LAG_SIMULATION = 200; // ms to delay messages by, for testing

interface ExtendedWebSocket extends WebSocket {
    roomCode?: string | null;
    pid?: number | null;
}

const server = http.createServer();
const wss = new WebSocketServer({ server });
const rooms = new Map<string, ExtendedWebSocket[]>();
const waiting = new Map<string, ExtendedWebSocket>();

function generateCode(): string {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let result = "";
    for (let i = 0; i < 4; i++) {
        result += characters.charAt(
            Math.floor(Math.random() * characters.length),
        );
    }
    return result;
}

wss.on("connection", (ws: ExtendedWebSocket) => {
    ws.on("message", (raw: Buffer) => {
        const msg = JSON.parse(raw.toString());

        if (msg.type === "create") {
            const code = generateCode();
            ws.roomCode = code;
            ws.pid = 0;
            waiting.set(code, ws);
            ws.send(JSON.stringify({ type: "created", code, pid: 0 }));
            console.log(`Room created: ${code}`);
        } else if (msg.type === "join") {
            const code = msg.code?.toUpperCase();
            const host = waiting.get(code);
            if (host) {
                ws.roomCode = code;
                ws.pid = 1;
                rooms.set(code, [host, ws]);
                waiting.delete(code);
                // Send code to both so each client can seed their RNG
                // identically — P0 already has it, but resending is harmless.
                host.send(JSON.stringify({ type: "start", pid: 0, code }));
                ws.send(JSON.stringify({ type: "start", pid: 1, code }));
            } else {
                ws.send(
                    JSON.stringify({ type: "error", msg: "Room not found" }),
                );
            }
        } else {
            if (LAG_SIMULATION === 0) {
                const pair = rooms.get(ws.roomCode!);
                pair?.find((p) => p !== ws)?.send(raw.toString());
                return;
            }
            setTimeout(() => {
                const pair = rooms.get(ws.roomCode!);
                pair?.find((p) => p !== ws)?.send(raw.toString());
            }, LAG_SIMULATION);
        }
    });

    ws.on("close", () => {
        waiting.delete(ws.roomCode!);
        const pair = rooms.get(ws.roomCode!);
        pair?.find((p) => p !== ws)?.send(
            JSON.stringify({ type: "opponent_left" }),
        );
        rooms.delete(ws.roomCode!);
    });
});

server.listen(8000, () => console.log("Server listening on port 8000"));
