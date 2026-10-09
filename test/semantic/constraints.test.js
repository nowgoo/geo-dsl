/**
 * Semantic + assertion-mode tests for v0.2 constraints (spec_v0.2 §3, §4.1).
 * M2 acceptance: valid programs pass, violations report GeometryError with
 * position, §59/D7/D4/D5 classifications hold.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { compile } from "../../src/index.js";
import { analyze } from "../../src/semantic/analyzer.js";
import { parse } from "../../src/parser/parser.js";
import { lex } from "../../src/lexer/lexer.js";
import {
    GeometryErrorDSLError,
    NameErrorDSLError,
    TypeErrorDSLError,
    ArgumentErrorDSLError,
} from "../../src/errors.js";

function expectError(source, kind, pattern) {
    assert.throws(() => compile(source), (e) => {
        assert.equal(e.name, kind, `expected ${kind}, got ${e.name}: ${e.message}`);
        if (pattern) assert.match(e.message, pattern);
        return true;
    });
}

const TAU = `
A = (0, 0)
B = (6, 0)
C = (2, 4)
`;

// --- valid assertion programs (one per constraint form) -------------------------

test("constraint: perpendicular assertion passes on a right angle", () => {
    const doc = compile(`
A = (0, 0)
B = (2, 0)
C = (2, 1)
AB _|_ BC
`);
    assert.equal(doc.constraints.length, 1);
    assert.equal(doc.constraints[0].kind, "perpendicular");
    assert.equal(doc.constraints[0].source, "AB _|_ BC");
});

test("constraint: parallel assertion passes on a parallelogram", () => {
    const doc = compile(`
A = (0, 0)
B = (4, 0)
C = (5, 2)
D = translate(A, 1, 2)
AB // DC
`);
    assert.equal(doc.constraints[0].kind, "parallel");
});

test("constraint: betweenness passes with a midpoint", () => {
    const doc = compile(`
A = (0, 0)
B = (4, 0)
M = mid(AB)
A-M-B
`);
    assert.equal(doc.constraints[0].kind, "between");
    assert.equal(doc.constraints[0].source, "A-M-B");
});

test("constraint: equal segments AB = CD passes", () => {
    compile(`
A = (0, 0)
B = (0, 3)
C = (1, 3)
D = (1, 0)
AB = CD
`);
});

test("constraint: AB = 5 passes for a length-5 segment", () => {
    compile(`
A = (0, 0)
B = (3, 4)
AB = 5
`);
});

test("constraint: angle equality passes (isoceles base angles)", () => {
    compile(`
A = (0, 0)
B = (4, 0)
C = (2, 2)
angle(B, A, C) = angle(A, B, C)
`);
});

test("constraint: generalized angle form angle = 2*angle passes", () => {
    compile(`
A = (0, 0)
B = (4, 0)
C = (4, 4)
D = (4, 2)
angle(A, B, D) = 2 * angle(B, A, C)
`);
});

test("constraint: AB = <measurement expression> passes", () => {
    compile(`
A = (0, 0)
B = (3, 0)
C = (3, 4)
AB = distance(B, C) - 1
`);
});

test("constraint: operands may be materialized bare references", () => {
    const doc = compile(`
A = (0, 0)
B = (2, 0)
C = (2, 2)
D = (0, 2)

AB
BC

AB _|_ BC
`);
    assert.equal(doc.constraints.length, 1);
});

test("constraint: line()/ray() results are valid operands", () => {
    compile(`
A = (0, 0)
B = (2, 0)
C = (0, 1)
D = (2, 1)
line(AB) // ray(C, D)
`);
});

test("constraint: statement order is irrelevant (§7.2)", () => {
    compile(`
AB _|_ BC
C = (2, 1)
B = (2, 0)
A = (0, 0)
`);
});

test("constraint: document.constraints keep document order and source text", () => {
    const doc = compile(`
A = (0, 0)
B = (3, 0)
C = (6, 0)
AB // AB
AB = 3
A-B-C
`);
    assert.deepEqual(
        doc.constraints.map((c) => c.kind),
        ["parallel", "number_equality", "between"],
    );
    assert.equal(doc.constraints[1].source, "AB = 3");
});

// --- violations -------------------------------------------------------------------

test("constraint: violated perpendicular reports GeometryError with source", () => {
    expectError(
        `
A = (0, 0)
B = (2, 0)
C = (3, 1)
AB _|_ BC
`,
        "GeometryError",
        /constraint violated: AB _\|_ BC/,
    );
});

test("constraint: violated parallel reports GeometryError", () => {
    expectError(
        `
A = (0, 0)
B = (4, 0)
C = (1, 2)
D = (3, 1)
AB // CD
`,
        "GeometryError",
        /constraint violated: AB \/\/ CD/,
    );
});

test("constraint: violated betweenness (B outside segment)", () => {
    expectError(
        `
A = (0, 0)
B = (5, 0)
C = (4, 0)
A-B-C
`,
        "GeometryError",
        /constraint violated: A-B-C/,
    );
});

test("constraint: violated betweenness (not collinear)", () => {
    expectError(
        `
A = (0, 0)
B = (2, 1)
C = (4, 0)
A-B-C
`,
        "GeometryError",
    );
});

test("constraint: violated length equality AB = CD", () => {
    expectError(
        `
A = (0, 0)
B = (3, 0)
C = (1, 0)
D = (5, 0)
AB = CD
`,
        "GeometryError",
        /constraint violated: AB = CD/,
    );
});

test("constraint: violated AB = 5", () => {
    expectError(
        `
A = (0, 0)
B = (3, 4)
AB = 6
`,
        "GeometryError",
        /constraint violated: AB = 6/,
    );
});

test("constraint: violated angle equality", () => {
    expectError(
        `
A = (0, 0)
B = (4, 0)
C = (1, 3)
angle(A, B, C) = angle(B, C, A)
`,
        "GeometryError",
    );
});

test("constraint: violations carry the constraint statement position", () => {
    try {
        compile(`
A = (0, 0)
B = (1, 0)
C = (1, 1)
D = (2, 2)
AB // CD
`);
        assert.fail("expected throw");
    } catch (e) {
        assert.equal(e.name, "GeometryError");
        assert.equal(e.line, 6);
    }
});

test("constraint: near-perpendicular within EPSILON passes (tolerance boundary)", () => {
    compile(`
A = (0, 0)
B = (1e5, 0)
C = (1e5, 1e-4)
AB _|_ BC
`);
});

test("constraint: degenerate operand (zero-length segment) errors at check time", () => {
    expectError(
        `
A = (0, 0)
B = (2, 0)
AA // AB
`,
        "GeometryError",
        /coincident/,
    );
});

// --- §59 / D7 / D4 classification ---------------------------------------------------

test("constraint: AB = CD reclassifies to a number constraint (D7)", () => {
    const doc = compile(`
A = (0, 0)
B = (3, 0)
C = (1, 0)
D = (4, 0)
AB = CD
`);
    assert.equal(doc.constraints[0].kind, "number_equality");
});

test("constraint: ABC = DEF stays a §59 NameError (D4)", () => {
    expectError(
        `
A = (0, 0)
B = (1, 0)
C = (0, 1)
D = (2, 0)
E = (2, 1)
F = (0, 1)
ABC = DEF
`,
        "NameError",
        /implicit geometry notation/,
    );
});

test("constraint: AB = <geometry constructor> is a §59 NameError (D7)", () => {
    expectError(
        `
A = (0, 0)
B = (1, 0)
O = (2, 2)
AB = circle(O, 1)
`,
        "NameError",
        /implicit geometry notation/,
    );
});

test("constraint: AB = <point ref> is a §59 NameError", () => {
    expectError(
        `
A = (0, 0)
B = (1, 0)
C = (2, 2)
AB = C
`,
        "NameError",
    );
});

test("constraint: AB = <string> is a §59 NameError", () => {
    expectError(
        `
A = (0, 0)
B = (1, 0)
AB = "text"
`,
        "NameError",
    );
});

test("constraint: AB = mid(A, B) (non-measurement call) is a §59 NameError", () => {
    expectError(
        `
A = (0, 0)
B = (1, 0)
AB = mid(A, B)
`,
        "NameError",
    );
});

// --- D5 operand type matrix ----------------------------------------------------------

test("constraint: Circle cannot join // (D5)", () => {
    expectError(
        `
O = (0, 0)
A = (1, 0)
B = (2, 0)
C = (2, 1)
omega = circle(O, 1)
omega // AB
`,
        "TypeError",
        /Line, Segment or Ray/,
    );
});

test("constraint: Point cannot join _|_ (D5)", () => {
    expectError(
        `
A = (0, 0)
B = (1, 0)
C = (1, 1)
A _|_ BC
`,
        "TypeError",
    );
});

test("constraint: Polygon cannot join // (D5)", () => {
    expectError(
        `
A = (0, 0)
B = (2, 0)
C = (2, 1)
ABC // AB
`,
        "TypeError",
    );
});

test("constraint: number equality with geometry constructor on the right is a TypeError", () => {
    expectError(
        `
A = (0, 0)
B = (1, 0)
O = (3, 3)
length(A, B) = circle(O, 1)
`,
        "TypeError",
    );
});

test("constraint: unknown function in a constraint is a NameError", () => {
    expectError(
        `
A = (0, 0)
B = (1, 0)
C = (1, 1)
frobnicate(A, B) = 3
`,
        "NameError",
    );
});

// --- unknown points ------------------------------------------------------------------

test("unknown: C = ? registers an unknown point object (analyze level)", () => {
    const doc = analyze(parse(lex("C = ?")));
    assert.deepEqual([...doc.unknowns], ["C"]);
    const object = doc.objects.get("C");
    assert.equal(object.kind, "Point");
    assert.equal(object.definition.type, "UnknownPointDefinition");
});

test("unknown: unknown points are Points for typing (D = mid(BC) accepts them)", () => {
    const doc = analyze(parse(lex(`
B = (0, 0)
C = ?
D = mid(BC)
`)));
    assert.equal(doc.objects.get("D").kind, "Point");
    assert.deepEqual([...doc.unknowns], ["C"]);
});

test("unknown: duplicate definition of an unknown name is a NameError", () => {
    expectError(
        `
C = (0, 0)
C = ?
`,
        "NameError",
    );
});

test("unknown: solver resolves A-C-B + AC = 3 to C = (3, 0)", () => {
    const doc = compile("C = ?\nA = (0, 0)\nB = (4, 0)\nA-C-B\nAC = 3");
    const g = doc.objects.get("C").geometry;
    assert.ok(Math.abs(g.x - 3) < 1e-3, `C.x = ${g.x}`);
    assert.ok(Math.abs(g.y) < 1e-2, `C.y = ${g.y}`); // flat transversal valley, see solver_notes
    assert.equal(g.type, "Point");
});

// --- parametric violations (every form, varied operands) ---------------------------

const violations = [
    ["parallel with ray operands", "A = (0, 0)\nB = (4, 0)\nC = (1, 1)\nD = (2, 3)\nray(A, B) // ray(C, D)"],
    ["perpendicular with line() operands", "A = (0, 0)\nB = (4, 0)\nC = (1, 1)\nD = (2, 2)\nline(A, B) _|_ line(C, D)"],
    ["parallel materialized bare refs", "A = (0, 0)\nB = (4, 0)\nC = (1, 1)\nD = (2, 2)\nAB\nCD\nAB // CD"],
    ["betweenness wrong order (endpoint in middle)", "A = (0, 0)\nB = (4, 0)\nC = (2, 0)\nA-C-B".replace("A-C-B", "A-B-C")],
    ["equal length vs polygon perimeter", "A = (0, 0)\nB = (3, 0)\nC = (3, 4)\nD = (0, 4)\nAB = perimeter(ACD)".replace("ACD", "BCD")],
    ["angle equality off by ~1e-3 degrees", "A = (0, 0)\nB = (4, 0)\nC = (2.001, 2)\nangle(B, A, C) = angle(A, B, C)"],
    ["perpendicular tolerance boundary exceeded", "A = (0, 0)\nB = (1, 0)\nC = (100, 1e-3)\nAB _|_ BC"],
    ["equal length off just outside tolerance", "A = (0, 0)\nB = (3, 0)\nC = (1, 0)\nD = (4, 1e-3)\nAB = CD"],
];

for (const [name, source] of violations) {
    test(`violation: ${name} reports constraint violated`, () => {
        assert.throws(() => compile(source), (e) => {
            assert.equal(e.name, "GeometryError");
            assert.match(e.message, /constraint violated/);
            assert.notEqual(e.line, null, "violation carries source position");
            return true;
        });
    });
}

const validBoundary = [
    ["parallel between segments sharing a vertex", "A = (0, 0)\nB = (4, 0)\nC = (4, 4)\nD = (0, 4)\nAB // DC"],
    ["perpendicular diagonal of a square", "A = (0, 0)\nB = (4, 0)\nC = (4, 4)\nD = (0, 4)\nAC _|_ BD"],
    ["betweenness with exactly-equal halves", "A = (0, 0)\nB = (2, 0)\nC = (4, 0)\nA-B-C"],
    ["number equality across two measurement kinds", "A = (0, 0)\nB = (3, 0)\nC = (3, 4)\nD = (0, 4)\nAB = perimeter(BCD) - distance(B, C) - distance(C, D) - distance(D, B) + 3"],
];

for (const [name, source] of validBoundary) {
    test(`assertion holds: ${name}`, () => {
        compile(source);
    });
}
