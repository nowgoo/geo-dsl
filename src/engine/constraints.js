/**
 * Constraint predicates & residuals (spec_v0.2 §6).
 *
 * Single source of truth shared by assertion checking (compile of fully
 * determined programs) and the numerical solver (plan Rule 13).
 *
 * Residual conventions (all returned values are scale-free):
 *   parallel        |cross(u, v)|  for normalized direction vectors
 *   perpendicular   |dot(u, v)|    for normalized direction vectors
 *   between         (|AB| + |BC| - |AC|) / max(1, |AB| + |BC|)
 *   number_equality (lhs - rhs) / max(1, |lhs|, |rhs|)
 */

import { evalDefinition, evalNumber } from "./evaluate.js";
import { EPSILON } from "./epsilon.js";
import { cross, dot, distance, normalize, sub } from "./primitives.js";
import {
    GeometryErrorDSLError,
    TypeErrorDSLError,
} from "../errors.js";

/** assertion mode threshold (fully determined programs) */
export const ASSERT_TOLERANCE = EPSILON;

/** solver acceptance threshold — relaxed vs assertion mode (spec_v0.2 §6) */
export const SOLVE_TOLERANCE = 1e-7;

/**
 * Normalized direction vector of a Line / Segment / Ray operand (plan D5).
 */
export function normalizedDirection(geometry, what = "constraint operand") {
    let direction;
    switch (geometry.type) {
        case "Line":
        case "Ray":
            direction = geometry.direction;
            break;
        case "Segment":
            direction = sub(geometry.b, geometry.a);
            break;
        default:
            throw new TypeErrorDSLError(`${what}: expected Line, Segment or Ray, got ${geometry.type}`);
    }
    const normalized = normalize(direction);
    if (!(Math.abs(normalized.x) + Math.abs(normalized.y) > 0)) {
        throw new GeometryErrorDSLError(`${what}: zero-length direction`);
    }
    return normalized;
}

export function parallelResidual(g1, g2) {
    return Math.abs(cross(normalizedDirection(g1), normalizedDirection(g2)));
}

export function perpendicularResidual(g1, g2) {
    return Math.abs(dot(normalizedDirection(g1), normalizedDirection(g2)));
}

/**
 * @returns {{ raw: number, scale: number }} raw residual and comparison scale
 */
export function betweenResidual(a, b, c) {
    const ab = distance(a, b);
    const bc = distance(b, c);
    return { raw: ab + bc - distance(a, c), scale: Math.max(1, ab + bc) };
}

/**
 * Scaled residual of a canonical constraint: directly comparable against
 * ASSERT_TOLERANCE / SOLVE_TOLERANCE.
 */
export function scaledResidual(constraint, document) {
    switch (constraint.kind) {
        case "parallel":
            return parallelResidual(
                evalDefinition(constraint.first, document),
                evalDefinition(constraint.second, document),
            );
        case "perpendicular":
            return perpendicularResidual(
                evalDefinition(constraint.first, document),
                evalDefinition(constraint.second, document),
            );
        case "between": {
            const a = evalDefinition(constraint.a, document);
            const b = evalDefinition(constraint.b, document);
            const c = evalDefinition(constraint.c, document);
            const { raw, scale } = betweenResidual(a, b, c);
            return raw / scale;
        }
        case "number_equality": {
            const l = evalNumber(constraint.lhs, document);
            const r = evalNumber(constraint.rhs, document);
            return Math.abs(l - r) / Math.max(1, Math.abs(l), Math.abs(r));
        }
        default:
            throw new GeometryErrorDSLError(`unknown constraint kind "${constraint.kind}"`);
    }
}

/**
 * Assertion mode (spec_v0.2 §4.1): every constraint must hold on the fully
 * evaluated document; violations report the constraint source text + position.
 */
export function checkConstraints(document) {
    for (const constraint of document.constraints) {
        let residual;
        try {
            residual = scaledResidual(constraint, document);
        } catch (error) {
            if (error && error.line == null && constraint.position) {
                error.line = constraint.position.line;
                error.column = constraint.position.column;
                error.offset = constraint.position.offset;
            }
            throw error;
        }
        if (!(residual <= ASSERT_TOLERANCE)) {
            throw new GeometryErrorDSLError(
                `constraint violated: ${constraint.source}`,
                constraint.position,
            );
        }
    }
    return document;
}
