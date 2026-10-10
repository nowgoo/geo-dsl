/**
 * Constraint solver driver (spec_v0.2 §4.2, docs/solver_notes.md, plan D8-D11).
 *
 * Pipeline position: analyze -> [here] -> layout.
 *   1. evaluate the fixed subgraph once
 *   2. deterministic multistart Levenberg–Marquardt over unknown point
 *      coordinates; residuals come from engine/constraints.js (Rule 13) and
 *      are evaluated by re-running the dependent subgraph
 *   3. classify failure: under-constrained / over-constrained or inconsistent
 *      / no convergence (all ConstraintError)
 *   4. final full evaluation (labels + marks resolve here)
 *
 * Deterministic: FNV-1a seeding, fixed start count, no randomness/clock
 * (Rule 9). The first start that satisfies SOLVE_TOLERANCE wins.
 */

import { Point } from "../ir/geometry.js";
import { evaluate } from "../engine/evaluate.js";
import { scaledResidual, SOLVE_TOLERANCE } from "../engine/constraints.js";
import { analyzeUnknownStructure } from "./variables.js";
import { lmSolve, numericJacobian } from "./lm.js";
import { matrixRank } from "./rank.js";
import { ConstraintErrorDSLError } from "../errors.js";

/** deterministic multistart count (plan D11) */
const STARTS = 8;

export function solveConstraints(document, options = {}) {
    const { unknowns, fixedNames, dependentNames } = analyzeUnknownStructure(document);
    const constraints = document.constraints;
    const n = unknowns.length * 2;
    const position = constraints[0]?.position ??
        document.objects.get(unknowns[0])?.position ?? null;

    // 1. fixed subgraph: evaluated once, never touched again
    evaluate(document, { only: fixedNames });
    const spread = fixedSpread(document);

    const setVariables = (x) => {
        for (let i = 0; i < unknowns.length; i++) {
            const object = document.objects.get(unknowns[i]);
            object.geometry = new Point(x[2 * i], x[2 * i + 1]);
        }
    };
    const residualFn = (x) => {
        setVariables(x);
        evaluate(document, { only: dependentNames });
        return constraints.map((constraint) => scaledResidual(constraint, document));
    };

    // 2. deterministic multistart (docs/solver_notes.md §4);
    // start 0 can be warm-started from dragged positions (spec_v0.3 §5.5, M5)
    const warm = options.warmStart ?? null; // Map name -> {x, y}
    const rng = mulberry32(fnv1a(unknowns.join("|")));
    let best = null;
    for (let start = 0; start < STARTS; start++) {
        const x0 = new Array(n).fill(0);
        if (start === 0 && warm) {
            for (let i = 0; i < unknowns.length; i++) {
                const p = warm.get(unknowns[i]);
                if (p) {
                    x0[2 * i] = p.x;
                    x0[2 * i + 1] = p.y;
                }
            }
        } else if (start > 0) {
            for (let i = 0; i < n; i++) {
                x0[i] = (rng() * 2 - 1) * spread;
            }
        }
        const result = lmSolve(residualFn, x0);
        if (result.residuals === null) continue; // initial guess degenerate

        // polish: restarting LM from its own output walks below the noise floor
        // of a single run (narrow-valley systems like squares stall ~1e-7)
        let { x, residuals, converged } = result;
        for (let polish = 0; polish < 3; polish++) {
            const next = lmSolve(residualFn, x);
            if (next.residuals === null) break;
            const before = residuals.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
            const after = next.residuals.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
            if (!(after < before)) {
                if (after > before) converged = converged || next.converged;
                break;
            }
            x = next.x;
            residuals = next.residuals;
            converged = converged || next.converged;
        }

        const maxAbs = residuals.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
        if (best === null || maxAbs < best.maxAbs) {
            best = { x, residuals, maxAbs, converged };
        }
        if (best.maxAbs <= SOLVE_TOLERANCE) break; // first acceptable solution wins
    }

    // 3. three-state failure classification (docs/solver_notes.md §5)
    if (best === null || best.maxAbs > SOLVE_TOLERANCE) {
        if (best !== null && best.converged) {
            throw new ConstraintErrorDSLError(
                `over-constrained or inconsistent constraint system near solution ` +
                `(max scaled residual ${best.maxAbs.toExponential(2)})`,
                position,
            );
        }
        throw new ConstraintErrorDSLError(
            `no convergence after ${STARTS} starts`,
            position,
        );
    }

    // DOF diagnosis (plan D10): rank of the numeric Jacobian at the solution
    const jacobian = numericJacobian(residualFn, best.x, best.residuals);
    setVariables(best.x); // numericJacobian leaves a shifted evaluation behind
    const rank = matrixRank(jacobian);
    if (rank < n) {
        throw new ConstraintErrorDSLError(
            `under-constrained system: ${n - rank} degree${n - rank === 1 ? "" : "s"} ` +
            `of freedom left near the solution (unknowns: ${unknowns.join(", ")})`,
            position,
        );
    }

    // 4. final full evaluation (solved coordinates + labels + marks)
    evaluate(document);
    return document;
}

/** bounding scale of the already-evaluated fixed points; fallback 1 */
function fixedSpread(document) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const object of document.objects.values()) {
        const g = object.geometry;
        if (g && g.type === "Point") {
            minX = Math.min(minX, g.x);
            maxX = Math.max(maxX, g.x);
            minY = Math.min(minY, g.y);
            maxY = Math.max(maxY, g.y);
        }
    }
    if (!Number.isFinite(minX)) return 1;
    return Math.max(1, maxX - minX, maxY - minY);
}

/** FNV-1a 32-bit hash of the variable names (deterministic seed, plan D9) */
function fnv1a(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
