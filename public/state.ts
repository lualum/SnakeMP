import { Point, Snake } from "./types";
import { makeRng } from "./rng";

export const state = {
    ws: null as WebSocket | null,
    myId: -1,
    gameRunning: false,
    snakes: [null, null] as (Snake | null)[],
    fruits: new Map<number, Point>(),
    wantRestart: false,
    oppWantRestart: false,
    lastUpdated: performance.now(),
    animFrame: null as number | null,
    rng: makeRng(""), // placeholder — reseeded from room code before startGame()
};
