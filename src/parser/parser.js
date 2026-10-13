/**
 * Parser (spec §13).
 *
 * Pratt parser for expressions; recursive descent for statements.
 *
 * Statement dispatch (by leading token):
 *   ident "="            -> assignment
 *   "canvas" "{"         -> canvas statement
 *   "style" selector "{" -> style statement
 *   "label" point-ref    -> label statement
 *   "hide"  object-refs  -> hide statement
 *   "mark" ident "("     -> mark statement
 *   otherwise            -> expression statement (implicit geometry reference)
 */

import * as A from "./ast.js";
import { PRECEDENCE } from "./precedence.js";
import { TokenKind, PARALLEL_OP, PERPENDICULAR_OP } from "../lexer/token.js";
import { SyntaxErrorDSLError } from "../errors.js";

const POINT_NAME = /^[A-Z]$/;

export function parse(tokens) {
    return new Parser(tokens).parseProgram();
}

class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.index = 0;
    }

    // --- token helpers ------------------------------------------------------

    peek(ahead = 0) {
        return this.tokens[Math.min(this.index + ahead, this.tokens.length - 1)];
    }

    next() {
        const token = this.tokens[this.index];
        if (token.kind !== TokenKind.EOF) {
            this.index += 1;
        }
        return token;
    }

    check(kind, value = null) {
        const t = this.peek();
        if (t.kind !== kind) return false;
        if (value !== null && t.text !== value) return false;
        return true;
    }

    checkSymbol(value) {
        return this.check(TokenKind.SYMBOL, value);
    }

    expectSymbol(value) {
        const t = this.peek();
        if (!this.checkSymbol(value)) {
            throw new SyntaxErrorDSLError(
                `expected "${value}" but found ${describe(t)}`,
                t.position,
            );
        }
        return this.next();
    }

    expectIdent(message = "expected identifier") {
        const t = this.peek();
        if (t.kind !== TokenKind.IDENT) {
            throw new SyntaxErrorDSLError(`${message} but found ${describe(t)}`, t.position);
        }
        return this.next();
    }

    // --- program / statements ------------------------------------------------

    parseProgram() {
        const statements = [];
        while (!this.check(TokenKind.EOF)) {
            const stmt = this.parseStatement();
            // parseLabel expands to one LabelStmt per target
            if (Array.isArray(stmt)) {
                statements.push(...stmt);
            } else {
                statements.push(stmt);
            }
        }
        return new A.Program(statements);
    }

    parseStatement() {
        const t = this.peek();

        if (t.kind === TokenKind.IDENT) {
            if (t.text === "canvas" && this.peek(1).kind === TokenKind.SYMBOL && this.peek(1).text === "{") {
                return this.parseCanvas();
            }
            if (t.text === "style") {
                return this.parseStyle();
            }
            if (t.text === "label") {
                return this.parseLabel();
            }
            if (t.text === "hide") {
                return this.parseHide();
            }
            if (
                t.text === "mark" &&
                this.peek(1).kind === TokenKind.IDENT &&
                this.peek(2).kind === TokenKind.SYMBOL &&
                this.peek(2).text === "("
            ) {
                return this.parseMark();
            }
            if (this.peek(1).kind === TokenKind.SYMBOL && this.peek(1).text === "=") {
                const p2 = this.peek(2);
                if (p2.kind === TokenKind.SYMBOL && p2.text === "?") {
                    return this.parseUnknownAssignment();
                }
                return this.parseAssignment();
            }
            if (
                this.peek(1).kind === TokenKind.SYMBOL &&
                this.peek(1).text === "-" &&
                POINT_NAME.test(t.text)
            ) {
                return this.parseBetweenness();
            }
        }

        // expression statement: implicit geometry reference or constraint
        const startToken = this.peek();
        const expr = this.parseExpression();

        const opToken = this.peek();
        if (opToken.kind === TokenKind.SYMBOL) {
            if (opToken.text === PARALLEL_OP || opToken.text === PERPENDICULAR_OP) {
                this.next();
                const rhs = this.parseExpression();
                const op = opToken.text === PARALLEL_OP ? "parallel" : "perpendicular";
                return new A.ConstraintStmt(op, expr, rhs, pos(startToken.position));
            }
            if (opToken.text === "=") {
                // measurement equality: angle(...) = 2*angle(...), perimeter(ABC) = 3*distance(...)
                // (identifier assignment and implicit-ref "=" are dispatched above; §59/plan D7)
                this.next();
                const rhs = this.parseExpression();
                return new A.ConstraintStmt("number_equality", expr, rhs, pos(startToken.position));
            }
        }

        if (
            expr.type !== "PointRefExpr" &&
            expr.type !== "SegmentRefExpr" &&
            expr.type !== "PolygonRefExpr"
        ) {
            throw new SyntaxErrorDSLError(
                `expected a statement or implicit geometry reference (A / AB / ABC), found ${expr.type}`,
                startToken.position,
            );
        }
        return new A.GeometryRefStmt(expr, pos(expr.position));
    }

    /** "C = ?" (spec_v0.2 §3.3) — only single uppercase point names may be unknown */
    parseUnknownAssignment() {
        const ident = this.expectIdent("expected point name");
        this.expectSymbol("=");
        this.expectSymbol("?");
        if (!POINT_NAME.test(ident.text)) {
            throw new SyntaxErrorDSLError(
                `only single uppercase point names can be unknown: "${ident.text} = ?" is not supported in v0.2`,
                ident.position,
            );
        }
        return new A.UnknownAssignmentStmt(ident.text, pos(ident.position));
    }

    /** "A-B-C": betweenness + collinearity (spec_v0.2 §3.2) */
    parseBetweenness() {
        const first = this.parseBetweennessPoint();
        this.expectSymbol("-");
        const middle = this.parseBetweennessPoint();
        if (!(this.peek().kind === TokenKind.SYMBOL && this.peek().text === "-")) {
            throw new SyntaxErrorDSLError(
                "betweenness constraint requires three points: A-B-C",
                middle.position,
            );
        }
        this.next(); // "-"
        const last = this.parseBetweennessPoint();
        return new A.BetweennessStmt(first, middle, last, first.position);
    }

    parseBetweennessPoint() {
        const t = this.expectIdent("expected point name in betweenness chain");
        const expr = this.classifyIdentifier(t);
        if (expr.type !== "PointRefExpr") {
            throw new SyntaxErrorDSLError(
                `betweenness operands must be single point names, got "${t.text}"`,
                t.position,
            );
        }
        return expr;
    }

    parseAssignment() {
        const ident = this.expectIdent("expected assignment target");
        this.expectSymbol("=");
        const expression = this.parseExpression();
        return new A.AssignmentStmt(ident.text, expression, pos(ident.position));
    }

    // --- canvas / style --------------------------------------------------------

    parseCanvas() {
        const kw = this.next(); // "canvas"
        this.expectSymbol("{");
        const properties = {};
        while (!this.checkSymbol("}")) {
            if (this.check(TokenKind.EOF)) {
                throw new SyntaxErrorDSLError("unclosed canvas block: expected \"}\"", kw.position);
            }
            const name = this.expectIdent("expected canvas property name");
            this.expectSymbol(":");
            const value = this.parsePropertyValue();
            properties[name.text] = value;
        }
        this.expectSymbol("}");
        return new A.CanvasStmt(properties, pos(kw.position));
    }

    parseStyle() {
        const kw = this.next(); // "style"
        const selector = this.expectIdent("expected style selector");
        this.expectSymbol("{");
        const properties = new Map();
        while (!this.checkSymbol("}")) {
            if (this.check(TokenKind.EOF)) {
                throw new SyntaxErrorDSLError("unclosed style block: expected \"}\"", kw.position);
            }
            const name = this.expectIdent("expected style property name");
            this.expectSymbol(":");
            const value = this.parsePropertyValue();
            properties.set(name.text, value);
        }
        this.expectSymbol("}");
        return new A.StyleStmt(selector.text, properties, pos(kw.position));
    }

    parsePropertyValue() {
        const t = this.peek();
        if (t.kind === TokenKind.NUMBER) {
            this.next();
            // number list: dash: 4 2
            if (this.check(TokenKind.NUMBER)) {
                const list = [new A.NumberExpr(t.value, pos(t.position))];
                while (this.check(TokenKind.NUMBER)) {
                    const n = this.next();
                    list.push(new A.NumberExpr(n.value, pos(n.position)));
                }
                return list;
            }
            return new A.NumberExpr(t.value, pos(t.position));
        }
        if (t.kind === TokenKind.COLOR) {
            this.next();
            return new A.ColorExpr(t.text, pos(t.position));
        }
        if (t.kind === TokenKind.STRING) {
            this.next();
            return new A.StringExpr(t.value, pos(t.position));
        }
        if (t.kind === TokenKind.IDENT) {
            if (t.text === "none") {
                this.next();
                return new A.StringExpr("none", pos(t.position));
            }
            if (t.text === "butt" || t.text === "round" || t.text === "square" ||
                t.text === "miter" || t.text === "bevel" ||
                t.text === "normal" || t.text === "italic" ||
                t.text === "bold" || t.text === "bolder" || t.text === "lighter") {
                this.next();
                return new A.StringExpr(t.text, pos(t.position));
            }
            throw new SyntaxErrorDSLError(
                `unexpected identifier "${t.text}" in property value`,
                t.position,
            );
        }
        if (this.checkSymbol("(")) {
            // point literal, e.g. label_offset: (8, -8)
            return this.parseExpression();
        }
        if (this.checkSymbol("-")) {
            return this.parseExpression();
        }
        throw new SyntaxErrorDSLError(`invalid property value: found ${describe(t)}`, t.position);
    }

    // --- label / mark ------------------------------------------------------------

    /**
     * label A [, B, C]... [string | "offset" point_literal]
     * Returns one LabelStmt per target; text/offset apply to all targets.
     */
    parseLabel() {
        const kw = this.next(); // "label"
        const targets = [this.parseLabelTarget()];
        while (this.checkSymbol(",")) {
            this.next(); // ","
            targets.push(this.parseLabelTarget());
        }

        let text = null;
        let offset = null;

        if (this.check(TokenKind.STRING)) {
            const s = this.next();
            text = new A.StringExpr(s.value, pos(s.position));
        }
        // v0.2 (spec_v0.2 §8): text and offset may both appear
        if (this.check(TokenKind.IDENT) && this.peek().text === "offset") {
            this.next(); // "offset"
            const lit = this.parseExpression();
            if (lit.type !== "PointLiteralExpr") {
                throw new SyntaxErrorDSLError(
                    "label offset must be a point literal like (8, -8)",
                    kw.position,
                );
            }
            offset = lit;
        }

        return targets.map((t) => new A.LabelStmt(t, text, offset, pos(kw.position)));
    }

    parseLabelTarget() {
        const target = this.expectIdent("expected point name after label");
        const targetExpr = this.classifyIdentifier(target);
        if (targetExpr.type !== "PointRefExpr") {
            throw new SyntaxErrorDSLError(
                `label target must be a single point name, got "${target.text}"`,
                target.position,
            );
        }
        return targetExpr;
    }

    parseHide() {
        const kw = this.next(); // "hide"
        const targets = [this.parseHideTarget()];
        while (this.checkSymbol(",")) {
            this.next(); // ","
            targets.push(this.parseHideTarget());
        }
        return new A.HideStmt(targets, pos(kw.position));
    }

    /** hide target: point name (A), segment (AB), polygon (ABC…) or named object */
    parseHideTarget() {
        const t = this.expectIdent("expected object name after hide");
        return this.classifyIdentifier(t);
    }

    parseMark() {
        const kw = this.next(); // "mark"
        const kindIdent = this.expectIdent("expected mark kind");
        this.expectSymbol("(");
        const args = [];
        if (!this.checkSymbol(")")) {
            args.push(this.parseExpression());
            while (this.checkSymbol(",")) {
                this.next();
                args.push(this.parseExpression());
            }
        }
        this.expectSymbol(")");
        return new A.MarkStmt(kindIdent.text, args, pos(kw.position));
    }

    // --- expressions (Pratt) ------------------------------------------------------

    parseExpression(minPrecedence = 0) {
        let left = this.parseUnary();

        while (true) {
            const t = this.peek();
            if (t.kind !== TokenKind.SYMBOL) break;
            const prec = PRECEDENCE[t.text];
            if (prec === undefined || t.text === "unary") break;
            if (prec < minPrecedence) break;
            this.next();
            const isRightAssoc = t.text === "^";
            const nextMin = isRightAssoc ? prec : prec + 1;
            const right = this.parseExpression(nextMin);
            left = new A.BinaryExpr(t.text, left, right, pos(t.position));
        }

        return left;
    }

    parseUnary() {
        if (this.checkSymbol("-")) {
            const t = this.next();
            const operand = this.parseExpression(PRECEDENCE.unary);
            return new A.UnaryExpr("-", operand, pos(t.position));
        }
        return this.parsePrimary();
    }

    parsePrimary() {
        const t = this.peek();

        if (t.kind === TokenKind.NUMBER) {
            this.next();
            return new A.NumberExpr(t.value, pos(t.position));
        }

        if (t.kind === TokenKind.STRING) {
            this.next();
            return new A.StringExpr(t.value, pos(t.position));
        }

        if (t.kind === TokenKind.COLOR) {
            this.next();
            return new A.ColorExpr(t.text, pos(t.position));
        }

        if (t.kind === TokenKind.IDENT) {
            this.next();
            // function call?
            if (this.checkSymbol("(")) {
                this.next();
                const args = [];
                if (!this.checkSymbol(")")) {
                    args.push(this.parseExpression());
                    while (this.checkSymbol(",")) {
                        this.next();
                        args.push(this.parseExpression());
                    }
                }
                this.expectSymbol(")");
                return new A.CallExpr(t.text, args, pos(t.position));
            }
            return this.classifyIdentifier(t);
        }

        if (this.checkSymbol("(")) {
            return this.parseParenthesized();
        }

        throw new SyntaxErrorDSLError(`unexpected ${describe(t)} in expression`, t.position);
    }

    parseParenthesized() {
        const lp = this.expectSymbol("(");
        const first = this.parseExpression();

        if (this.checkSymbol(",")) {
            this.next();
            const second = this.parseExpression();
            this.expectSymbol(")");
            return new A.PointLiteralExpr(first, second, pos(lp.position));
        }

        this.expectSymbol(")");
        return first; // grouping
    }

    // --- implicit reference classification (spec §14) -------------------------------

    /**
     * Classify an identifier token into implicit geometry reference or plain identifier.
     */
    classifyIdentifier(token) {
        const name = token.text;
        const p = pos(token.position);
        if (/^[A-Z]$/.test(name)) {
            return new A.PointRefExpr(name, p);
        }
        if (/^[A-Z]{2}$/.test(name)) {
            return new A.SegmentRefExpr(name[0], name[1], p);
        }
        if (/^[A-Z]{3,}$/.test(name)) {
            return new A.PolygonRefExpr([...name], p);
        }
        return new A.IdentifierExpr(name, p);
    }
}

function pos(tokenPosition) {
    return new A.Pos(tokenPosition.offset, tokenPosition.line, tokenPosition.column);
}

function describe(token) {
    if (token.kind === TokenKind.EOF) return "end of input";
    if (token.kind === TokenKind.STRING) return `string ${JSON.stringify(token.text)}`;
    return JSON.stringify(token.text);
}
