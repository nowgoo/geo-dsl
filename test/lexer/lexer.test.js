import { test } from "node:test";
import assert from "node:assert/strict";

import { lex } from "../../src/lexer/lexer.js";
import { TokenKind } from "../../src/lexer/token.js";
import { SyntaxErrorDSLError } from "../../src/errors.js";

function kinds(source) {
    return lex(source).map((t) => (t.kind === TokenKind.SYMBOL ? `SYM:${t.value}` : t.kind));
}

function simple(source) {
    return lex(source).map((t) =>
        t.kind === TokenKind.EOF ? undefined : (t.value ?? t.text)
    );
}

// --- identifiers ------------------------------------------------------------

test("lexer: single uppercase identifier", () => {
    assert.deepEqual(simple("A"), ["A", undefined]);
});

test("lexer: two uppercase identifiers", () => {
    assert.deepEqual(simple("AB"), ["AB", undefined]);
});

test("lexer: many uppercase identifiers", () => {
    assert.deepEqual(simple("ABCDE"), ["ABCDE", undefined]);
});

test("lexer: lowercase and mixed identifiers", () => {
    assert.deepEqual(simple("omega circle1 _height pointA"), [
        "omega",
        "circle1",
        "_height",
        "pointA",
        undefined,
    ]);
});

// --- numbers ----------------------------------------------------------------

test("lexer: unsigned integer", () => {
    assert.deepEqual(simple("0"), [0, undefined]);
    assert.deepEqual(simple("123"), [123, undefined]);
});

test("lexer: decimal number", () => {
    assert.deepEqual(simple("3.14 0.5"), [3.14, 0.5, undefined]);
});

test("lexer: exponent numbers", () => {
    assert.deepEqual(simple("1e3 2.5e-4 1E+2"), [1000, 0.00025, 100, undefined]);
});

test("lexer: minus is not part of number", () => {
    assert.deepEqual(kinds("-1"), ["SYM:-", TokenKind.NUMBER, TokenKind.EOF]);
});

// --- strings ----------------------------------------------------------------

test("lexer: simple string", () => {
    assert.deepEqual(simple('"A"'), ["A", undefined]);
    assert.deepEqual(simple('"顶点 A"'), ["顶点 A", undefined]);
});

test("lexer: string escapes", () => {
    assert.deepEqual(simple('"a\\"b\\\\c\\nd"'), ['a"b\\c\nd', undefined]);
});

test("lexer: unknown escape is a SyntaxError", () => {
    assert.throws(() => lex('"a\\tb"'), SyntaxErrorDSLError);
});

test("lexer: unclosed string is a SyntaxError", () => {
    assert.throws(() => lex('"abc'), SyntaxErrorDSLError);
});

// --- colors -----------------------------------------------------------------

test("lexer: color literals", () => {
    assert.deepEqual(simple("#f00 #222222"), ["#f00", "#222222", undefined]);
});

test("lexer: invalid color is a SyntaxError", () => {
    assert.throws(() => lex("#f00f"), SyntaxErrorDSLError);
    assert.throws(() => lex("#xy"), SyntaxErrorDSLError);
});

// --- symbols ----------------------------------------------------------------

test("lexer: all symbols", () => {
    const src = "( ) { } [ ] , = : * + - / ^ .";
    assert.deepEqual(simple(src), [
        "(", ")", "{", "}", "[", "]", ",", "=", ":", "*", "+", "-", "/", "^", ".", undefined,
    ]);
});

// --- comments ---------------------------------------------------------------

test("lexer: block comments are skipped (single line, multi line, trailing)", () => {
    assert.deepEqual(kinds("/* comment */ A"), [TokenKind.IDENT, TokenKind.EOF]);
    assert.deepEqual(kinds("/* one\n two */ B"), [TokenKind.IDENT, TokenKind.EOF]);
    assert.deepEqual(kinds("C /* tail */"), [TokenKind.IDENT, TokenKind.EOF]);
});

test("lexer: comments do not nest (first */ closes)", () => {
    // "/* a /* b */" leaves "c" after the first close
    assert.deepEqual(simple("/* a /* b */ c"), ["c", undefined]);
});

test("lexer: unclosed comment reports starting line", () => {
    try {
        lex("A\n/* oops\nnever closed");
        assert.fail("expected throw");
    } catch (e) {
        assert.ok(e instanceof SyntaxErrorDSLError);
        assert.match(e.message, /line 2/);
    }
});

test("lexer: comment sequence inside expression lexes as comment then symbol", () => {
    // a * / b is a valid token sequence (no comment): '*' then '/'
    assert.deepEqual(simple("a */"), ["a", "*", "/", undefined]);
});

// --- v0.2 constraint tokens (spec_v0.2 §1) ----------------------------------

test("lexer: // lexes as the parallel operator", () => {
    const tokens = lex("AB // CD");
    const op = tokens.find((t) => t.text === "//");
    assert.ok(op, "expected a // token");
    assert.equal(op.kind, TokenKind.SYMBOL);
});

test("lexer: _|_ lexes as the perpendicular operator when whitespace-delimited", () => {
    const tokens = lex("h _|_ AB");
    const op = tokens.find((t) => t.text === "_|_");
    assert.ok(op, "expected a _|_ token");
    assert.equal(op.kind, TokenKind.SYMBOL);
    // adjacent identifiers still work around it
    assert.deepEqual(tokens.filter((t) => t.kind === TokenKind.IDENT).map((t) => t.text), ["h", "AB"]);
});

test("lexer: _|_ without surrounding whitespace is a SyntaxError (maximal munch)", () => {
    assert.throws(() => lex("AB_|_CD"), (e) => {
        assert.ok(e instanceof SyntaxErrorDSLError);
        assert.match(e.message, /must be surrounded by whitespace/);
        return true;
    });
    assert.throws(() => lex("x _|_CD"), /surrounded by whitespace/);
    assert.throws(() => lex("x_|_ y"), /surrounded by whitespace/);
});

test("lexer: ? lexes as a symbol", () => {
    const tokens = lex("C = ?");
    assert.deepEqual(
        tokens.map((t) => (t.kind === TokenKind.EOF ? undefined : t.text)),
        ["C", "=", "?", undefined],
    );
});

test("lexer: a lone | is still an unexpected character", () => {
    assert.throws(() => lex("a | b"), (e) => {
        assert.ok(e instanceof SyntaxErrorDSLError);
        assert.match(e.message, /unexpected character/);
        return true;
    });
});

// --- positions ----------------------------------------------------------------

test("lexer: positions track line and column", () => {
    const tokens = lex("A = (1,\n  2)");
    const [a, eq, lp, one, comma, two] = tokens;
    const at = (t) => [t.position.line, t.position.column];
    assert.deepEqual(at(a), [1, 1]);
    assert.deepEqual(at(eq), [1, 3]);
    assert.deepEqual(at(lp), [1, 5]);
    assert.deepEqual(at(one), [1, 6]);
    assert.deepEqual(at(comma), [1, 7]);
    assert.deepEqual(at(two), [2, 3]);
});

test("lexer: offsets are monotonically increasing and EOF present", () => {
    const tokens = lex("AB CD");
    for (let i = 1; i < tokens.length; i++) {
        assert.ok(tokens[i].position.offset > tokens[i - 1].position.offset);
    }
    assert.equal(tokens[tokens.length - 1].kind, TokenKind.EOF);
});

// --- misc errors ------------------------------------------------------------

test("lexer: unexpected character is a SyntaxError", () => {
    assert.throws(() => lex("A @ B"), SyntaxErrorDSLError);
    assert.throws(() => lex("A ∥ B"), SyntaxErrorDSLError);
});

test("lexer: digit followed by identifier splits into two tokens", () => {
    assert.deepEqual(simple("12e"), [12, "e", undefined]); // "12e" is not valid exponent
    assert.deepEqual(simple("12x"), [12, "x", undefined]);
});

test("lexer: constraint operators carry source positions", () => {
    const tokens = lex("AB // CD");
    const op = tokens.find((t) => t.text === "//");
    assert.equal(op.position.line, 1);
    assert.equal(op.position.column, 4);
    assert.equal(op.position.offset, 3);
});

test("lexer: perpendicular operator position spans three characters", () => {
    const tokens = lex("h\n  h _|_ AB");
    const op = tokens.find((t) => t.text === "_|_");
    assert.equal(op.position.line, 2);
    assert.equal(op.position.column, 5);
    assert.equal(op.position.offset, 6);
});
