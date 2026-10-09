/**
 * Global numeric policy (spec §27).
 *
 * IEEE-754 doubles everywhere; no exact equality on computed values;
 * a single tolerance constant for the whole engine.
 */

export const EPSILON = 1e-9;

export function near(a, b, epsilon = EPSILON) {
    return Math.abs(a - b) < epsilon;
}

export function isFiniteNumber(v) {
    return typeof v === "number" && Number.isFinite(v);
}

/**
 * Deterministic ordering comparator with epsilon (spec §26):
 * x ascending, then y ascending.
 */
export function comparePointsXY(p, q) {
    if (!near(p.x, q.x)) {
        return p.x - q.x;
    }
    return p.y - q.y;
}
