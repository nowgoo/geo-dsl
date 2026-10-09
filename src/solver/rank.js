/**
 * Matrix rank via column-pivoted Gram–Schmidt (docs/solver_notes.md §5).
 *
 * Small dense systems only (2 × #unknown points ≤ ~40 columns); sufficient
 * numerically for DOF classification, far simpler than a full QR factorization.
 */

import { EPSILON } from "../engine/epsilon.js";

/**
 * @param {number[][]} matrix m×n (m residuals, n variables)
 * @param {number} [tolerance] column-norm cutoff; default max(m,n)·EPSILON·max₀
 * @returns {number} rank
 */
export function matrixRank(matrix, tolerance) {
    const m = matrix.length;
    const n = m > 0 ? matrix[0].length : 0;
    if (m === 0 || n === 0) return 0;

    // work on column copies
    const columns = Array.from({ length: n }, (_, j) =>
        Array.from({ length: m }, (_, i) => matrix[i][j]),
    );
    const norm = (v) => Math.hypot(...v);

    const maxNorm0 = Math.max(...columns.map(norm));
    if (!(maxNorm0 > 0)) return 0;
    const tol = tolerance ?? Math.max(m, n) * EPSILON * maxNorm0;

    let rank = 0;
    for (let k = 0; k < n; k++) {
        // pick the column with the largest remaining norm
        let best = k;
        let bestNorm = -1;
        for (let j = k; j < n; j++) {
            const size = norm(columns[j]);
            if (size > bestNorm) {
                bestNorm = size;
                best = j;
            }
        }
        if (!(bestNorm > tol)) break;

        [columns[k], columns[best]] = [columns[best], columns[k]];
        const q = columns[k];
        const size = norm(q);
        for (let i = 0; i < m; i++) q[i] /= size;

        // orthogonalize the remaining columns against q
        for (let j = k + 1; j < n; j++) {
            const projection = dot(columns[j], q);
            for (let i = 0; i < m; i++) {
                columns[j][i] -= projection * q[i];
            }
        }
        rank++;
    }
    return rank;
}

function dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
}
