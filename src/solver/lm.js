/**
 * Levenberg–Marquardt least squares with a forward-difference numeric
 * Jacobian (docs/solver_notes.md §2–§3, plan D8).
 *
 * Deterministic by construction: fixed constants, no randomness, no clocks.
 * `residualFn(x)` may throw (degenerate geometry mid-iteration) — a throwing
 * evaluation is treated as an invalid step, not a solver failure.
 */

/** frozen parameters (docs/solver_notes.md §3) */
export const LM_OPTIONS = {
    maxIterations: 200,
    lambdaInitial: 1e-3,
    lambdaFactor: 2,
    lambdaReduction: 3,
    lambdaMax: 1e12,
    gradientTolerance: 1e-12,
    stepTolerance: 1e-12,
    // central-difference step: machine-eps^(1/3) ≈ 6e-6 balances truncation
    // against cancellation; keeps the numeric Jacobian accurate to ~1e-10 so
    // converged residuals reach ~1e-10, well below SOLVE_TOLERANCE (1e-7).
    // (Deviation from plan D8's forward difference: forward diff with
    // sqrt(EPSILON)=3.16e-5 stalled residuals at 1e-6, measured.)
    diffStep: 6e-6,
};

/**
 * @param {(x: number[]) => number[]} residualFn scaled residuals; may throw
 * @param {number[]} x0 initial guess
 * @param {object} [options] overrides for LM_OPTIONS
 * @returns {{ x: number[], residuals: number[]|null, cost: number,
 *             converged: boolean, iterations: number }}
 */
export function lmSolve(residualFn, x0, options = {}) {
    const opts = { ...LM_OPTIONS, ...options };

    let x = x0.slice();
    let residuals = safeResiduals(residualFn, x);
    if (residuals === null) {
        return { x, residuals: null, cost: Infinity, converged: false, iterations: 0 };
    }
    let cost = sumSquares(residuals);
    let lambda = opts.lambdaInitial;
    let iterations = 0;

    for (; iterations < opts.maxIterations; iterations++) {
        const jacobian = numericJacobian(residualFn, x, residuals, opts.diffStep);
        const gradient = matVecTranspose(jacobian, residuals); // Jᵀ r
        // relative gradient termination (noise floor scales with residual size)
        if (maxAbs(gradient) < opts.gradientTolerance * (Math.sqrt(cost) + 1)) {
            return { x, residuals, cost, converged: true, iterations };
        }

        const step = normalStep(jacobian, residuals, lambda);
        if (step === null) {
            lambda *= opts.lambdaFactor;
            if (lambda > opts.lambdaMax) break;
            continue;
        }

        // step tolerance: the proposed move is below float resolution —
        // we are numerically at a (local) minimizer (MINPACK-style xtol)
        if (maxAbs(step) < opts.stepTolerance * (maxAbs(x) + 1)) {
            return { x, residuals, cost, converged: true, iterations };
        }

        const xNew = x.map((v, i) => v + step[i]);
        const rNew = safeResiduals(residualFn, xNew);
        if (rNew !== null) {
            const costNew = sumSquares(rNew);
            if (costNew < cost) {
                const improvement = cost - costNew;
                x = xNew;
                residuals = rNew;
                cost = costNew;
                lambda = Math.max(lambda / opts.lambdaReduction, 1e-15);
                if (Math.sqrt(improvement) < opts.stepTolerance * (Math.sqrt(cost) + 1)) {
                    return { x, residuals, cost, converged: true, iterations: iterations + 1 };
                }
                continue;
            }
        }

        lambda *= opts.lambdaFactor;
        if (lambda > opts.lambdaMax) break;
    }

    return { x, residuals, cost, converged: false, iterations };
}

/** Central-difference Jacobian; failed evaluations contribute a zero column. */
export function numericJacobian(residualFn, x, r0, diffStep = LM_OPTIONS.diffStep) {
    const m = r0.length;
    const n = x.length;
    const jacobian = Array.from({ length: m }, () => new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
        const h = diffStep * Math.max(1, Math.abs(x[j]));
        const xPlus = x.slice();
        xPlus[j] += h;
        const xMinus = x.slice();
        xMinus[j] -= h;
        const rPlus = safeResiduals(residualFn, xPlus);
        const rMinus = safeResiduals(residualFn, xMinus);
        if (rPlus === null || rMinus === null) continue;
        for (let i = 0; i < m; i++) {
            jacobian[i][j] = (rPlus[i] - rMinus[i]) / (2 * h);
        }
    }
    return jacobian;
}

/** Marquardt-scaled step: solve (JᵀJ + λ·diag(JᵀJ)) δ = −Jᵀr */
function normalStep(jacobian, r, lambda) {
    const n = jacobian[0] ? jacobian[0].length : 0;
    const normal = Array.from({ length: n }, () => new Array(n).fill(0));
    const rhs = new Array(n).fill(0);
    for (let i = 0; i < jacobian.length; i++) {
        for (let a = 0; a < n; a++) {
            rhs[a] += jacobian[i][a] * r[i];
            for (let b = 0; b < n; b++) {
                normal[a][b] += jacobian[i][a] * jacobian[i][b];
            }
        }
    }
    for (let a = 0; a < n; a++) {
        normal[a][a] += lambda * (normal[a][a] || 1);
        rhs[a] = -rhs[a];
    }
    try {
        return solveLinear(normal, rhs);
    } catch {
        return null; // singular: let lambda grow
    }
}

/** Gaussian elimination with partial pivoting; throws on singular matrix */
export function solveLinear(matrix, rhs) {
    const n = rhs.length;
    const a = matrix.map((row, i) => [...row, rhs[i]]);
    for (let col = 0; col < n; col++) {
        let pivot = col;
        for (let row = col + 1; row < n; row++) {
            if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
        }
        if (Math.abs(a[pivot][col]) < 1e-14) {
            throw new Error("singular normal matrix");
        }
        [a[col], a[pivot]] = [a[pivot], a[col]];
        for (let row = col + 1; row < n; row++) {
            const factor = a[row][col] / a[col][col];
            for (let k = col; k <= n; k++) {
                a[row][k] -= factor * a[col][k];
            }
        }
    }
    const x = new Array(n).fill(0);
    for (let row = n - 1; row >= 0; row--) {
        let sum = a[row][n];
        for (let col = row + 1; col < n; col++) sum -= a[row][col] * x[col];
        x[row] = sum / a[row][row];
    }
    return x;
}

function safeResiduals(residualFn, x) {
    try {
        const r = residualFn(x);
        if (!Array.isArray(r) || !r.every((v) => typeof v === "number" && Number.isFinite(v))) {
            return null;
        }
        return r;
    } catch {
        return null; // degenerate intermediate geometry: invalid point, not fatal
    }
}

function matVecTranspose(jacobian, v) {
    const n = jacobian[0] ? jacobian[0].length : 0;
    const out = new Array(n).fill(0);
    for (let i = 0; i < jacobian.length; i++) {
        for (let j = 0; j < n; j++) {
            out[j] += jacobian[i][j] * v[i];
        }
    }
    return out;
}

function sumSquares(v) {
    let s = 0;
    for (const value of v) s += value * value;
    return s;
}

function maxAbs(v) {
    let m = 0;
    for (const value of v) m = Math.max(m, Math.abs(value));
    return m;
}
