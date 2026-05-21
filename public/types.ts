export type Point = [number, number];
export type Direction = [1, 0] | [-1, 0] | [0, 1] | [0, -1];
export type Period = [number, number];
export interface Snake {
    body: Point[];
    spos: number;
    dir: Direction;
    alive: boolean;
    score: number;
}
export interface MsgDelta {
    type: "delta";
    pid: number;
    head: Point;
    dir: Direction;
    t: number;
    // fruit: [id] signals a fruit was eaten. No position needed — both sides
    // call spawnFruit() with the shared seeded RNG and get the same result.
    fruit?: [number, null];
}
export interface MsgDied {
    type: "died";
    pid: number;
    t: number;
    reason: string;
}
export interface MsgRestart {
    type: "restart";
}
export interface MsgOpponentLeft {
    type: "opponent_left";
}
export interface MsgCreated {
    type: "created";
    pid: number;
    code: string;
}
export interface MsgStart {
    type: "start";
    pid: number;
    code: string;
}
export interface MsgError {
    type: "error";
    msg: string;
}
export type WsMessage =
    | MsgDelta
    | MsgDied
    | MsgRestart
    | MsgOpponentLeft
    | MsgCreated
    | MsgStart
    | MsgError;
