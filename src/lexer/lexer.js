/**
 * Lexer (spec §12).
 *
 * - identifiers:  [A-Za-z_][A-Za-z0-9_]*
 * - numbers:      unsigned, decimal + optional exponent (0, 3.14, 1e3, 2.5e-4)
 * - strings:      "..." with escapes \" \\ \n only
 * - colors:       #RGB / #RRGGBB
 * - comments:     C-style block comments only, not nested
 * - "//" and "_|_": constraint operators (v0.2); "_|_" requires whitespace on both sides
 */

import { Token, TokenKind, Position, SYMBOLS, PARALLEL_OP, PERPENDICULAR_OP } from "./token.js";
import { SyntaxErrorDSLError } from "../errors.js";

export function lex(source) {
    return new Lexer(source).tokenize();
}

class Lexer {
    constructor(source) {
        this.source = source;
        this.offset = 0;
        this.line = 1;
        this.column = 1;
        this.tokens = [];
    }

    tokenize() {
        while (this.offset < this.source.length) {
            const ch = this.peek();

            if (ch === "\n") {
                this.advance();
                continue;
            }
            if (ch === " " || ch === "\t" || ch === "\r") {
                this.advance();
                continue;
            }

            if (ch === "/" && this.peek(1) === "*") {
                this.skipBlockComment();
                continue;
            }

            if (ch === "/" && this.peek(1) === "/") {
                // v0.2: parallel operator (spec_v0.2 §1.1)
                const pos = this.here();
                this.advance();
                this.advance();
                this.emit(TokenKind.SYMBOL, PARALLEL_OP, pos);
                continue;
            }

            if (ch === "_" && this.peek(1) === "|" && this.peek(2) === "_") {
                this.lexPerpendicular();
                continue;
            }

            if (ch === "|") {
                // maximal-munch adjacency like AB_|_CD: the leading "_" was eaten
                // by the identifier; surface the whitespace rule here (spec_v0.2 §1.2)
                if (this.offset > 0 && this.source[this.offset - 1] === "_" && this.peek(1) === "_") {
                    throw new SyntaxErrorDSLError(PERPENDICULAR_WHITESPACE_ERROR, this.here());
                }
                throw new SyntaxErrorDSLError(`unexpected character ${JSON.stringify(ch)}`, this.here());
            }

            if (SYMBOLS.has(ch)) {
                this.emitSymbol();
                continue;
            }

            if (isIdentStart(ch)) {
                this.lexIdentifier();
                continue;
            }

            if (isDigit(ch)) {
                this.lexNumber();
                continue;
            }

            if (ch === '"') {
                this.lexString();
                continue;
            }

            if (ch === "#") {
                this.lexColor();
                continue;
            }

            throw new SyntaxErrorDSLError(`unexpected character ${JSON.stringify(ch)}`, this.here());
        }

        this.tokens.push(new Token(TokenKind.EOF, "", null, this.here()));
        return this.tokens;
    }

    // --- helpers -----------------------------------------------------------

    peek(ahead = 0) {
        return this.source[this.offset + ahead] ?? "";
    }

    here() {
        return new Position(this.offset, this.line, this.column);
    }

    advance() {
        const ch = this.source[this.offset];
        this.offset += 1;
        if (ch === "\n") {
            this.line += 1;
            this.column = 1;
        } else {
            this.column += 1;
        }
        return ch;
    }

    emit(kind, value, position) {
        const text = this.source.slice(position.offset, this.offset);
        this.tokens.push(new Token(kind, text, value, position));
    }

    emitSymbol() {
        const pos = this.here();
        const ch = this.advance();
        this.emit(TokenKind.SYMBOL, ch, pos);
    }

    /** "_|_" token; the character after it must not start an identifier (spec_v0.2 §1.2) */
    lexPerpendicular() {
        const pos = this.here();
        if (isIdentPart(this.peek(3))) {
            throw new SyntaxErrorDSLError(PERPENDICULAR_WHITESPACE_ERROR, pos);
        }
        this.advance();
        this.advance();
        this.advance();
        this.emit(TokenKind.SYMBOL, PERPENDICULAR_OP, pos);
    }

    // --- comments ----------------------------------------------------------

    skipBlockComment() {
        const startPos = this.here();
        this.advance(); // "/"
        this.advance(); // "*"
        while (this.offset < this.source.length) {
            if (this.peek() === "*" && this.peek(1) === "/") {
                this.advance();
                this.advance();
                return;
            }
            this.advance();
        }
        throw new SyntaxErrorDSLError(
            `unclosed block comment (started at line ${startPos.line})`,
            startPos,
        );
    }

    // --- identifiers -------------------------------------------------------

    lexIdentifier() {
        const pos = this.here();
        let text = "";
        while (this.offset < this.source.length && isIdentPart(this.peek())) {
            text += this.advance();
        }
        this.emit(TokenKind.IDENT, text, pos);
    }

    // --- numbers -----------------------------------------------------------

    lexNumber() {
        const pos = this.here();
        let text = "";
        while (this.offset < this.source.length && isDigit(this.peek())) {
            text += this.advance();
        }
        if (this.peek() === ".") {
            if (isDigit(this.peek(1))) {
                text += this.advance(); // "."
                while (this.offset < this.source.length && isDigit(this.peek())) {
                    text += this.advance();
                }
            }
            // "12." without a digit is not consumed here; "." is a symbol
        }
        if (this.peek() === "e" || this.peek() === "E") {
            let ahead = 1;
            if (this.peek(1) === "+" || this.peek(1) === "-") {
                ahead = 2;
            }
            if (isDigit(this.peek(ahead))) {
                text += this.advance(); // "e"
                if (this.peek() === "+" || this.peek() === "-") {
                    text += this.advance();
                }
                while (this.offset < this.source.length && isDigit(this.peek())) {
                    text += this.advance();
                }
            }
            // "12e" without digits: "e" lexes as identifier downstream
        }
        const value = Number(text);
        this.emit(TokenKind.NUMBER, value, pos);
    }

    // --- strings -----------------------------------------------------------

    lexString() {
        const pos = this.here();
        this.advance(); // opening quote
        let text = "";
        while (true) {
            if (this.offset >= this.source.length) {
                throw new SyntaxErrorDSLError(
                    `unclosed string literal (started at line ${pos.line})`,
                    pos,
                );
            }
            const ch = this.advance();
            if (ch === '"') {
                break;
            }
            if (ch === "\n") {
                throw new SyntaxErrorDSLError(
                    `unclosed string literal (started at line ${pos.line})`,
                    pos,
                );
            }
            if (ch === "\\") {
                const esc = this.advance();
                if (esc === '"') {
                    text += '"';
                } else if (esc === "\\") {
                    text += "\\";
                } else if (esc === "n") {
                    text += "\n";
                } else {
                    throw new SyntaxErrorDSLError(
                        `unknown escape sequence "\\${esc}" in string literal`,
                        this.here(),
                    );
                }
                continue;
            }
            text += ch;
        }
        this.emit(TokenKind.STRING, text, pos);
    }

    // --- colors ------------------------------------------------------------

    lexColor() {
        const pos = this.here();
        this.advance(); // "#"
        let hex = "";
        while (this.offset < this.source.length && isHexDigit(this.peek()) && hex.length < 6) {
            hex += this.advance();
        }
        if (hex.length !== 3 && hex.length !== 6) {
            throw new SyntaxErrorDSLError(
                `invalid color literal "#${hex}": expected #RGB or #RRGGBB`,
                pos,
            );
        }
        this.emit(TokenKind.COLOR, `#${hex}`, pos);
    }
}

function isDigit(ch) {
    return ch >= "0" && ch <= "9";
}

/** spec_v0.2 §1.2: kept from v0.1.1 wording */
const PERPENDICULAR_WHITESPACE_ERROR =
    '"_|_" is reserved for the perpendicular operator (planned in v0.2);\n' +
    'it must be surrounded by whitespace';

function isHexDigit(ch) {
    return isDigit(ch) || (ch >= "a" && ch <= "f") || (ch >= "A" && ch <= "F");
}

function isIdentStart(ch) {
    return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}

function isIdentPart(ch) {
    return isIdentStart(ch) || isDigit(ch);
}
