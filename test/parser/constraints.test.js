/**
 * Parser tests for v0.2 constraint statements (spec_v0.2 §2).
 * Parser produces: ConstraintStmt / BetweennessStmt / UnknownAssignmentStmt;
 * "AB = ..." stays AssignmentStmt (reclassification is semantic, plan D7).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { lex } from "../../src/lexer/lexer.js";
import { parse } from "../../src/parser/parser.js";

function one(source) {
    const program = parse(lex(source));
    assert.equal(program.statements.length, 1, "expected a single statement");
    return program.statements[0];
}

function expectSyntaxError(source, pattern) {
    assert.throws(() => parse(lex(source)), (e) => {
        assert.equal(e.name, "SyntaxError");
        if (pattern) assert.match(e.message, pattern);
        return true;
    });
}

// --- structural constraints // and _|_ ----------------------------------------

test("parser: AB // CD -> ConstraintStmt(parallel)", () => {
    const stmt = one("AB // CD");
    assert.equal(stmt.type, "ConstraintStmt");
    assert.equal(stmt.op, "parallel");
    assert.equal(stmt.lhs.type, "SegmentRefExpr");
    assert.equal(stmt.rhs.type, "SegmentRefExpr");
});

test("parser: h _|_ AB -> ConstraintStmt(perpendicular)", () => {
    const stmt = one("h _|_ AB");
    assert.equal(stmt.type, "ConstraintStmt");
    assert.equal(stmt.op, "perpendicular");
    assert.equal(stmt.lhs.type, "IdentifierExpr");
    assert.equal(stmt.lhs.name, "h");
    assert.equal(stmt.rhs.type, "SegmentRefExpr");
});

test("parser: line(AB) // ray(C, D) accepts call operands", () => {
    const stmt = one("line(AB) // ray(C, D)");
    assert.equal(stmt.op, "parallel");
    assert.equal(stmt.lhs.type, "CallExpr");
    assert.equal(stmt.lhs.name, "line");
    assert.equal(stmt.rhs.name, "ray");
});

test("parser: constraint parses without spaces around operators", () => {
    assert.equal(one("AB//CD").op, "parallel");
});

test("parser: two parallel operators in one line is a SyntaxError", () => {
    expectSyntaxError("AB // CD // EF");
});

// --- betweenness A-B-C ----------------------------------------------------------

test("parser: A-B-C -> BetweennessStmt with three point refs", () => {
    const stmt = one("A-B-C");
    assert.equal(stmt.type, "BetweennessStmt");
    assert.deepEqual(
        [stmt.first, stmt.middle, stmt.last].map((p) => p.name),
        ["A", "B", "C"],
    );
});

test("parser: betweenness tolerates spaces around dashes", () => {
    assert.equal(one("A - B - C").type, "BetweennessStmt");
});

test("parser: A - B without third point is a SyntaxError", () => {
    expectSyntaxError("A - B", /three points/);
});

test("parser: betweenness operand must be a single point name", () => {
    expectSyntaxError("A - BC - D", /single point name/);
    // "AB - ..." is not dispatched as betweenness (AB is a segment form);
    // it falls through to the generic expression-statement error
    expectSyntaxError("AB - C - D", /expected a statement/);
});

// --- unknown points C = ? --------------------------------------------------------

test("parser: C = ? -> UnknownAssignmentStmt", () => {
    const stmt = one("C = ?");
    assert.equal(stmt.type, "UnknownAssignmentStmt");
    assert.equal(stmt.name, "C");
});

test("parser: lowercase r = ? is rejected at the parser", () => {
    expectSyntaxError("r = ?", /single uppercase/);
});

test("parser: multi-letter implicit target with ? is rejected", () => {
    expectSyntaxError("AB = ?", /single uppercase/);
});

test("parser: ? outside an unknown assignment is a SyntaxError", () => {
    expectSyntaxError("?");
    expectSyntaxError("D = mid(C, ?)");
});

// --- number/measurement equality ---------------------------------------------------

test("parser: angle(A,B,C) = 2*angle(D,E,F) -> number_equality constraint", () => {
    const stmt = one("angle(A, B, C) = 2 * angle(D, E, F)");
    assert.equal(stmt.type, "ConstraintStmt");
    assert.equal(stmt.op, "number_equality");
    assert.equal(stmt.lhs.name, "angle");
    assert.equal(stmt.rhs.operator, "*");
    assert.equal(stmt.rhs.left.value, 2);
});

test("parser: distance(A,B) = 3/2 -> number_equality constraint", () => {
    const stmt = one("distance(A, B) = 3 / 2");
    assert.equal(stmt.type, "ConstraintStmt");
    assert.equal(stmt.op, "number_equality");
});

test("parser: AB = 5 and AB = CD stay AssignmentStmt (semantic reclassifies, D7)", () => {
    assert.equal(one("AB = 5").type, "AssignmentStmt");
    assert.equal(one("AB = CD").type, "AssignmentStmt");
    assert.equal(one("AB = 5").name, "AB");
});

test("parser: lowercase identifier equality stays an assignment", () => {
    assert.equal(one("height = 3").type, "AssignmentStmt");
});

// --- label text + offset may coexist (spec_v0.2 §8) ---------------------------------

test("parser: label accepts text and offset together", () => {
    const stmt = one('label A "vertex" offset (3, 4)');
    assert.equal(stmt.type, "LabelStmt");
    assert.equal(stmt.text.value, "vertex");
    assert.equal(stmt.offset.type, "PointLiteralExpr");
    assert.equal(stmt.offset.x.value, 3);
});

test("parser: label with only offset still parses", () => {
    const stmt = one("label A offset (-8, 8)");
    assert.equal(stmt.text, null);
    assert.equal(stmt.offset.x.operator, "-");
});

// --- statement mix --------------------------------------------------------------------

test("parser: constraints mix with the other statement kinds", () => {
    const program = parse(lex(`
A = (0, 0)
B = (2, 0)
C = (2, 1)

AB _|_ BC

D = mid(AB)
A-D-C
AB = 2

label A "origin"
`));
    assert.deepEqual(
        program.statements.map((s) => s.type),
        [
            "AssignmentStmt",
            "AssignmentStmt",
            "AssignmentStmt",
            "ConstraintStmt",
            "AssignmentStmt",
            "BetweennessStmt",
            "AssignmentStmt",
            "LabelStmt",
        ],
    );
});

test("parser: constraint statements keep their source position", () => {
    const program = parse(lex("A = (0, 0)\nB = (2, 0)\nAB // CD"));
    const stmt = program.statements[2];
    assert.equal(stmt.type, "ConstraintStmt");
    assert.equal(stmt.position.line, 3);
    assert.equal(stmt.position.column, 1);
});

test("parser: betweenness position points at the first point", () => {
    const program = parse(lex("A-B-C"));
    assert.equal(program.statements[0].position.line, 1);
    assert.equal(program.statements[0].position.column, 1);
});
