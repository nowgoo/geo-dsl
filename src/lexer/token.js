/**
 * Token model (spec §12).
 */

export const TokenKind = {
    IDENT: "IDENT",
    NUMBER: "NUMBER",
    STRING: "STRING",
    COLOR: "COLOR",
    SYMBOL: "SYMBOL",
    EOF: "EOF",
};

export class Position {
    constructor(offset, line, column) {
        this.offset = offset;
        this.line = line;
        this.column = column;
    }
}

export class Token {
    /**
     * @param {string} kind one of TokenKind
     * @param {string} text raw source text of the token
     * @param {*} value decoded value (number for NUMBER, unescaped string for STRING)
     * @param {Position} position
     */
    constructor(kind, text, value, position) {
        this.kind = kind;
        this.text = text;
        this.value = value;
        this.position = position;
    }
}

export const SYMBOLS = new Set([
    "(", ")", "{", "}", "[", "]", ",", "=", ":", "*", "+", "-", "/", "^", ".",
    "?", // v0.2 unknown-point marker (C = ?)
]);

/**
 * Multi-character operator tokens (v0.2 constraints, spec_v0.2 §1).
 * Emitted as SYMBOL with this exact text.
 */
export const PARALLEL_OP = "//";
export const PERPENDICULAR_OP = "_|_";
export const MULTI_CHAR_SYMBOLS = [PARALLEL_OP, PERPENDICULAR_OP];
