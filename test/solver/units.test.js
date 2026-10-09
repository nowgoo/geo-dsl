/**
 * IR shape and low-level solver module unit tests.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { compile } from "../../src/index.js";
import { analyze } from "../../src/semantic/analyzer.js";
import { parse } from "../../src/parser/parser.js";
import { lex } from "../../src/lexer/lexer.js";
import { matrixRank } from "../../src/solver/rank.js";

// --- constraint IR shape --------------------------------------------------------

test("ir: structural constraints store canonical line-like defs", () => {
    const doc = compile("A = (0, 0)\nB = (2, 0)\nC = (2, 1)\nh = perpendicular(C, AB)\nh _|_ AB");
    const constraint = doc.constraints[0];
    assert.equal(constraint.kind, "perpendicular");
    assert.equal(constraint.first.type, "RefDefinition"); // h object
    assert.equal(constraint.second.type, "SegmentDefinition"); // inline AB
    assert.equal(constraint.first.name, "h");
});

test("ir: number_equality wraps implicit refs in LengthCall", () => {
    const doc = compile("A = (0, 0)\nB = (3, 0)\nC = (1, 0)\nD = (4, 0)\nAB = CD");
    const constraint = doc.constraints[0];
    assert.equal(constraint.kind, "number_equality");
    assert.equal(constraint.lhs.type, "LengthCall");
    assert.equal(constraint.rhs.type, "LengthCall");
    assert.equal(constraint.lhs.target.type, "SegmentDefinition");
});

test("ir: unknown points are Point objects with UnknownPointDefinition", () => {
    const doc = analyze(parse(lex("A = (0, 0)\nB = (4, 0)\nC = ?\nA-C-B\nAC = 3")));
    assert.deepEqual([...doc.unknowns], ["C"]);
    const object = doc.objects.get("C");
    assert.equal(object.kind, "Point");
    assert.equal(object.definition.type, "UnknownPointDefinition");
    assert.equal(object.geometry, null); // not solved at analyze stage
});

// --- rank unit tests (M5) ---------------------------------------------------------

test("rank: full-rank identity", () => {
    assert.equal(matrixRank([[1, 0, 0], [0, 1, 0], [0, 0, 1]]), 3);
});

test("rank: rank-1 matrix", () => {
    assert.equal(matrixRank([[1, 2, 3], [2, 4, 6], [3, 6, 9]]), 1);
});

test("rank: zero matrix", () => {
    assert.equal(matrixRank([[0, 0], [0, 0]]), 0);
});

test("rank: wide matrix rank is capped by rows", () => {
    assert.equal(matrixRank([[1, 0, 0, 0], [0, 1, 0, 0]]), 2);
});

test("rank: near-dependent columns below default tolerance are ignored", () => {
    // second column ~1e-14 of the first: numerically dependent
    assert.equal(matrixRank([[1, 3e-15], [0, 1e-15]]), 1);
});

test("rank: duplicated constraint Jacobian loses a rank", () => {
    // AC=3 twice: both residual rows have identical gradients
    assert.equal(matrixRank([[0.6, 0.8], [0.6, 0.8]]), 1);
});

test("rank: tall matrix keeps full column rank", () => {
    assert.equal(matrixRank(
        [[1, 0], [0, 1], [1, 1], [1, -1], [2, 0.5]],
    ), 2);
});

test("api: ConstraintErrorDSLError is part of the public exports", async () => {
    const index = await import("../../src/index.js");
    const { ConstraintErrorDSLError } = index;
    assert.equal(typeof ConstraintErrorDSLError, "function");
    const error = new ConstraintErrorDSLError("under-constrained", { line: 3, column: 1 });
    assert.equal(error.name, "ConstraintError");
    assert.equal(error.line, 3);
});

test("solve: styles can target solved unknown points", () => {
    const doc = compile(`
A = (0, 0)
B = (4, 0)
C = ?
A-C-B
AC = 3
style C { radius: 6 fill: #f00 }
`);
    assert.equal(doc.objects.get("C").style, null); // style resolution happens in render
    const svg = (async () => (await import("../../src/index.js")).renderSVG(doc))();
    return svg.then((out) => assert.match(out, /r="6"/));
});
