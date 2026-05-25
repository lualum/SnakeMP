import "./ui";
import "./network";
import { State } from "../shared/state";
import { hooks } from "./hooks";
import { MS_TILE } from "../shared/config";

class ClientState extends State {
    ws: WebSocket | null = null;
    myId: number = 0;
    animFrame: number | null = null;

    update(): void {
        if (!this.gameRunning) return;
        const s = this.snakes[this.myId];
        if (!s) return;

        const now = performance.now();
        const dt = now - this.lastUpdated;

        for (let i = 0; i < this.snakes.length; i++) {
            if (i === this.myId) continue;
            const opp = this.snakes[i]!;
            opp.spos = Math.min(opp.spos + dt / MS_TILE, 1);
        }

        s.spos += Math.min(dt / MS_TILE, 3);
        while (s.spos >= 1) this.moveSnake(this.myId, s.dir);

        this.lastUpdated = now;
    }
}

export const state = new ClientState();
state.setHooks(hooks);

console.log("Game initialized.");
