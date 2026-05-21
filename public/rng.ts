/**
 * Mulberry32 — fast, seedable 32-bit PRNG.
 * Returns a factory seeded from a string (the room code).
 * Both clients seed from the same code so all Math.random()-equivalent
 * calls produce identical sequences without any network coordination.
 */
export function makeRng(seed: string): () => number {
    // Hash the string down to a uint32.
    let h = 0x9e3779b9;
    for (let i = 0; i < seed.length; i++) {
        h = Math.imul(h ^ seed.charCodeAt(i), 0x9e3779b9);
        h ^= h >>> 16;
    }
    let s = h >>> 0 || 1; // never zero

    return function () {
        s += 0x6d2b79f5;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
    };
}
