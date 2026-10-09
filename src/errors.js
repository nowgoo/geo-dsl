/**
 * Unified error model (spec §48).
 *
 * Every error carries: name, message, line, column, offset.
 * Subclasses: SyntaxError, NameError, TypeError, ArgumentError,
 * GeometryError, DependencyError.
 */

export class GeometryDSLError extends Error {
    /**
     * @param {string} message
     * @param {{line?: number, column?: number, offset?: number}} [position]
     */
    constructor(message, position = {}) {
        super(message);
        this.name = this.constructor.errorName;
        this.line = position.line ?? null;
        this.column = position.column ?? null;
        this.offset = position.offset ?? null;
    }

    static get errorName() {
        return "Error";
    }
}

export class SyntaxErrorDSLError extends GeometryDSLError {
    static get errorName() {
        return "SyntaxError";
    }
}

export class NameErrorDSLError extends GeometryDSLError {
    static get errorName() {
        return "NameError";
    }
}

export class TypeErrorDSLError extends GeometryDSLError {
    static get errorName() {
        return "TypeError";
    }
}

export class ArgumentErrorDSLError extends GeometryDSLError {
    static get errorName() {
        return "ArgumentError";
    }
}

export class GeometryErrorDSLError extends GeometryDSLError {
    static get errorName() {
        return "GeometryError";
    }
}

export class DependencyErrorDSLError extends GeometryDSLError {
    static get errorName() {
        return "DependencyError";
    }
}

/** v0.2 (spec_v0.2 §7): solver failures — under-constrained / inconsistent / no convergence */
export class ConstraintErrorDSLError extends GeometryDSLError {
    static get errorName() {
        return "ConstraintError";
    }
}

/**
 * Format an error for CLI display with a source excerpt and caret
 * (spec §48 example style).
 *
 * @param {GeometryDSLError} error
 * @param {string} source
 * @returns {string}
 */
export function formatError(error, source) {
    const lines = [`${error.name}:`, `  ${error.message}`];

    if (error.line == null || source == null) {
        return lines.join("\n");
    }

    const sourceLines = source.split(/\r\n|\r|\n/);
    const lineText = sourceLines[error.line - 1] ?? "";
    const gutter = String(error.line).padStart(4);
    lines.push("");
    lines.push(`  ${gutter} | ${lineText}`);
    if (error.column != null) {
        lines.push(`  ${" ".repeat(gutter.length)} | ${" ".repeat(error.column - 1)}^`);
    }
    return lines.join("\n");
}
