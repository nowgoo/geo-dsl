import { test } from "node:test";
import assert from "node:assert/strict";

import { lex } from "../../src/lexer/lexer.js";
import { parse } from "../../src/parser/parser.js";
import { analyze } from "../../src/semantic/analyzer.js";

function compile(source) {
    return analyze(parse(lex(source)));
}

/** deep-clone a definition without source positions (for §51 equivalence) */
function stripPositions(value) {
    if (Array.isArray(value)) return value.map(stripPositions);
    if (value && typeof value === "object") {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            if (k === "position") continue;
            out[k] = stripPositions(v);
        }
        return out;
    }
    return value;
}

function expectError(source, errorName, messagePattern) {
    assert.throws(
        () => compile(source),
        (e) => {
            assert.equal(e.name, errorName, `expected ${errorName}, got ${e.name}: ${e.message}`);
            if (messagePattern) {
                assert.match(e.message, messagePattern);
            }
            return true;
        },
    );
}

// --- basic typing --------------------------------------------------------------

test("semantic: midpoint of segment", () => {
    const doc = compile(`
A = (0,0)
B = (1,0)
D = mid(AB)
`);
    assert.equal(doc.objects.get("D").kind, "Point");
    assert.equal(doc.objects.get("D").definition.type, "MidpointDefinition");
});

test("semantic: bare polygon reference materializes object", () => {
    const doc = compile(`
A = (0,0)
B = (1,0)
C = (0,1)
ABC
`);
    const obj = doc.objects.get("ABC");
    assert.ok(obj);
    assert.equal(obj.kind, "Polygon");
    assert.deepEqual(obj.dependencies, ["A", "B", "C"]);
});

test("semantic: point literal requires numbers", () => {
    expectError(`
A = (0,0)
B = (1,0)
X = (A, 0)
`, "TypeError", /point literal x must be a Number/);
});

test("semantic: midpoint of point pair", () => {
    const doc = compile(`
A = (0,0)
B = (1,0)
D = mid(A, B)
`);
    assert.equal(doc.objects.get("D").definition.type, "MidpointDefinition");
});

test("semantic: mid and midpoint are aliases (identical IR)", () => {
    const a = compile(`
A = (0,0)
B = (1,0)
D = mid(AB)
`);
    const b = compile(`
A = (0,0)
B = (1,0)
D = midpoint(AB)
`);
    assert.deepEqual(
        stripPositions(a.objects.get("D").definition),
        stripPositions(b.objects.get("D").definition),
    );
});

// --- §51 canonical IR equivalence -------------------------------------------------

test("§51: AB * CD ≡ intersect(segment(A,B), segment(C,D))", () => {
    const sugar = compile(`
A = (0,0)
B = (1,0)
C = (0,1)
D = (1,1)
E = AB * CD
`);
    const explicit = compile(`
A = (0,0)
B = (1,0)
C = (0,1)
D = (1,1)
E = intersect(segment(A,B), segment(C,D))
`);
    assert.deepEqual(
        stripPositions(sugar.objects.get("E").definition),
        stripPositions(explicit.objects.get("E").definition),
    );
    assert.deepEqual(sugar.objects.get("E").dependencies, explicit.objects.get("E").dependencies);
});

test("§51: ABC ≡ polygon(A, B, C)", () => {
    const sugar = compile(`
A = (0,0)
B = (1,0)
C = (0,1)
p = ABC
`);
    const explicit = compile(`
A = (0,0)
B = (1,0)
C = (0,1)
p = polygon(A, B, C)
`);
    assert.deepEqual(stripPositions(sugar.objects.get("p").definition), stripPositions(explicit.objects.get("p").definition));
});

test("§51: mid(AB) ≡ midpoint(segment(A,B))", () => {
    const sugar = compile(`
A = (0,0)
B = (1,0)
D = mid(AB)
`);
    const explicit = compile(`
A = (0,0)
B = (1,0)
D = midpoint(segment(A, B))
`);
    assert.deepEqual(stripPositions(sugar.objects.get("D").definition), stripPositions(explicit.objects.get("D").definition));
});

// --- order independence (§7.2) ------------------------------------------------------

test("semantic: use before definition is fine", () => {
    const doc = compile(`
D = mid(AB)
A = (0,0)
B = (1,0)
`);
    assert.equal(doc.objects.get("D").kind, "Point");
    assert.deepEqual(doc.objects.get("D").dependencies, ["A", "B"]);
});

test("semantic: bare ref statement after expression use", () => {
    const doc = compile(`
G = AD * BE
A = (0,0)
B = (6,0)
C = (2,4)
D = mid(BC)
E = mid(CA)
AD
BE
`);
    // AD/BE materialized -> expression refs depend on the materialized objects (§7.1)
    const g = doc.objects.get("G");
    assert.deepEqual(g.dependencies, ["AD", "BE"]);
    assert.equal(doc.objects.get("AD").kind, "Segment");
    assert.equal(doc.objects.get("BE").kind, "Segment");
});

test("semantic: canvas/style/label order does not matter", () => {
    const doc = compile(`
style AB { stroke: #f00 }
label A
A = (0,0)
B = (1,0)
AB
canvas { width: 300 }
`);
    assert.equal(doc.canvas.width, 300);
    assert.ok(doc.styles.has("AB"));
    assert.equal(doc.labels[0].text, "A");
});

// --- errors (§48, §63) -------------------------------------------------------------

test("semantic: undefined name -> NameError", () => {
    expectError(`
A = (0,0)
D = mid(AX)
`, "NameError", /undefined point "X"/);
});

test("semantic: redefinition -> NameError", () => {
    expectError(`
A = (0,0)
A = (1,0)
`, "NameError", /already defined/);
});

test("semantic: point name bound to non-Point -> TypeError", () => {
    expectError(`
A = circle(O, 1)
O = (0,0)
`, "TypeError", /point name "A" can only be bound to a Point/);
});

test("semantic: assignment to implicit form -> NameError (§59)", () => {
    expectError("AB = (0,0)", "NameError", /implicit geometry notation.*cannot be assigned/);
    expectError("ABC = (0,0)", "NameError", /cannot be assigned/);
});

test("semantic: numeric/geometry mix -> TypeError (§11.1)", () => {
    expectError(`
A = (0,0)
B = (1,0)
X = A * 2
`, "TypeError", /mix geometry and Number/);
    expectError(`
A = (0,0)
B = (1,0)
C = (0,1)
D = (1,1)
X = AB + CD
`, "TypeError", /only defined for Numbers/);
});

test("semantic: geometry only supports * (no +-/^)", () => {
    expectError(`
A = (0,0)
B = (1,0)
C = (0,1)
D = (1,1)
X = AB ^ CD
`, "TypeError", /only defined for Numbers/);
});

test("semantic: unary minus on Point -> TypeError", () => {
    expectError(`
A = (0,0)
X = -A
`, "TypeError", /requires a Number operand/);
});

test("semantic: unknown function -> NameError", () => {
    expectError("A = (0,0)\nX = foo(A)", "NameError", /unknown function "foo"/);
});

test("semantic: wrong argument type -> TypeError (§16)", () => {
    expectError(`
O = (0,0)
c = circle(O, 1)
D = mid(c)
`, "TypeError", /no signature of mid/);
});

test("semantic: intersect unsupported combination -> ArgumentError (§25)", () => {
    expectError(`
A = (0,0)
B = (1,0)
r = ray(A, B)
X = intersect(AB, r)
`, "ArgumentError", /unsupported intersection: Segment × Ray/);
});

test("semantic: intersect multi result without index -> semantic OK (runtime checks count)", () => {
    // type-wise fine; multiple intersections is a runtime condition
    const doc = compile(`
A = (0,0)
B = (4,0)
c1 = circle(A, B)
c2 = circle(B, A)
P = c1 * c2
`);
    assert.equal(doc.objects.get("P").definition.type, "IntersectionDefinition");
    assert.equal(doc.objects.get("P").definition.index, null);
});

test("semantic: intersect index must be unsigned integer literal >= 1 (§26)", () => {
    expectError(`
A = (0,0)
B = (4,0)
c1 = circle(A, B)
c2 = circle(B, A)
P = intersect(c1, c2, 0)
`, "ArgumentError", /unsigned integer literal >= 1/);

    expectError(`
A = (0,0)
B = (4,0)
c1 = circle(A, B)
c2 = circle(B, A)
P = intersect(c1, c2, 2 + 1)
`, "ArgumentError", /unsigned integer literal/);
});

test("semantic: duplicate canvas -> ArgumentError (§30)", () => {
    expectError(`
canvas { width: 600 }
canvas { width: 300 }
`, "ArgumentError", /canvas defined more than once/);
});

test("semantic: canvas unknown property -> ArgumentError (D4)", () => {
    expectError("canvas { colour: 600 }", "ArgumentError", /unknown canvas property/);
});

test("semantic: style unknown object -> NameError (§36)", () => {
    expectError(`
A = (0,0)
style XY { stroke: #f00 }
`, "NameError", /style selector "XY"/);
});

test("semantic: style on materialized bare-ref name works (§7.1)", () => {
    const doc = compile(`
A = (0,0)
B = (1,0)
AB
style AB { stroke: #f00 }
`);
    assert.ok(doc.styles.has("AB"));
});

test("semantic: style unknown property -> ArgumentError (D4)", () => {
    expectError(`
A = (0,0)
style A { colour: #f00 }
`, "ArgumentError", /unknown style property/);
});

test("semantic: style property value validation", () => {
    expectError(`
A = (0,0)
style A { width: "thick" }
`, "ArgumentError", /invalid value for style property "width"/);

    expectError(`
A = (0,0)
style A { font_style: bold }
`, "ArgumentError", /font_style/);
});

test("semantic: label undefined point -> NameError (§37)", () => {
    expectError("label Q", "NameError", /undefined point "Q"/);
});

test("semantic: label defaults (§37)", () => {
    const doc = compile(`
A = (0,0)
label A
`);
    assert.equal(doc.labels[0].text, "A");
    assert.deepEqual(doc.labels[0].offset, { x: 8, y: -8 });
});

test("semantic: label multi-target expands with shared text/offset", () => {
    const doc = compile(`
A = (0,0)
B = (1,0)
C = (0,1)
label A, B, C "顶点"
`);
    assert.deepEqual(
        doc.labels.map((l) => l.target.name),
        ["A", "B", "C"],
    );
    for (const l of doc.labels) {
        assert.equal(l.text, "顶点");
        assert.deepEqual(l.offset, { x: 8, y: -8 }); // shared text keeps default offset
    }

    const doc2 = compile(`
A = (0,0)
B = (1,0)
label A, B offset (-10, -10)
`);
    for (const l of doc2.labels) {
        assert.deepEqual(l.offset, { x: -10, y: -10 });
        assert.equal(l.text, l.target.name); // default text per point
    }
});

test("semantic: label multi-target undefined point -> NameError (§37)", () => {
    expectError(`
A = (0,0)
label A, Q
`, "NameError", /undefined point "Q"/);
});

test("semantic: label multi-target merges with single-target statements (D3)", () => {
    const doc = compile(`
A = (0,0)
B = (1,0)
label A, B
label B "renamed"
label B offset (0, 0)
`);
    assert.equal(doc.labels.length, 2);
    assert.equal(doc.labels[0].text, "A");
    assert.equal(doc.labels[1].text, "renamed");
    assert.deepEqual(doc.labels[1].offset, { x: 0, y: 0 });
});

test("semantic: hide marks objects hidden (point / segment / polygon / named object)", () => {
    const doc = compile(`
A = (0,0)
B = (8,0)
C = (3,5)
ABC
D = mid(BC)
omega = circumcircle(ABC)
hide D, omega, ABC
`);
    assert.equal(doc.objects.get("D").hidden, true);
    assert.equal(doc.objects.get("omega").hidden, true);
    assert.equal(doc.objects.get("ABC").hidden, true);
    assert.equal(doc.objects.get("A").hidden, false);
    assert.equal(doc.objects.get("B").hidden, false);
    assert.equal(doc.objects.get("C").hidden, false);
});

test("semantic: hide materializes implicit segment/polygon refs", () => {
    const doc = compile(`
A = (0,0)
B = (8,0)
C = (3,5)
hide AB
hide ACB
`);
    assert.equal(doc.objects.get("AB").hidden, true);
    assert.equal(doc.objects.get("AB").kind, "Segment");
    assert.equal(doc.objects.get("ACB").hidden, true);
    assert.equal(doc.objects.get("ACB").kind, "Polygon");
});

test("semantic: hide undefined object -> NameError", () => {
    expectError(`
A = (0,0)
hide Q
`, "NameError", /undefined object "Q"/);
    expectError(`
hide AB
`, "NameError", /undefined point "A"/); // AB materialization requires its points
});

test("semantic: hide hidden objects still evaluate and keep dependencies", () => {
    const doc = compile(`
A = (0,0)
B = (8,0)
C = (3,5)
D = mid(BC)
AD
hide D, AD
`);
    const d = doc.objects.get("D");
    assert.equal(d.hidden, true);
    assert.deepEqual(d.dependencies, ["B", "C"]);
    const ad = doc.objects.get("AD");
    assert.equal(ad.hidden, true);
    assert.deepEqual(ad.dependencies, ["A", "D"]);
});

test("semantic: hide order does not matter", () => {
    const doc = compile(`
hide D
A = (0,0)
B = (8,0)
C = (3,5)
D = mid(BC)
`);
    assert.equal(doc.objects.get("D").hidden, true);
});

test("semantic: mark kinds and arities", () => {
    expectError(`
A = (0,0)
B = (1,0)
mark right_angle(A, B)
`, "ArgumentError", /takes 3 arguments/);

    expectError(`
A = (0,0)
mark skew(A)
`, "ArgumentError", /unknown mark kind/);

    const doc = compile(`
A = (0,0)
B = (1,0)
C = (1,1)
mark right_angle(A, B, C)
`);
    assert.equal(doc.marks[0].kind, "right_angle");
    assert.equal(doc.marks[0].args.length, 3);
});

test("semantic: cyclic dependency -> DependencyError (§29)", () => {
    expectError(`
A = mid(BC)
B = mid(AC)
C = mid(AB)
`, "DependencyError", /cyclic dependency/);
});

test("semantic: number/string bindings rejected (D16)", () => {
    expectError("x = 42", "ArgumentError", /bindings must be geometry objects/);
});

test("semantic: name type fixing - lowercase binds geometry", () => {
    const doc = compile(`
O = (0,0)
omega = circle(O, 1)
`);
    assert.equal(doc.objects.get("omega").kind, "Circle");
});

test("semantic: definition keeps construction (§19)", () => {
    const doc = compile(`
A = (0,0)
B = (1,0)
D = mid(AB)
`);
    const d = doc.objects.get("D");
    assert.deepEqual(d.dependencies, ["A", "B"]);
    assert.equal(d.definition.type, "MidpointDefinition");
    assert.equal(d.geometry, null); // not evaluated yet
});

test("semantic: document object order = document order", () => {
    const doc = compile(`
A = (0,0)
B = (1,0)
AB
c = circle(A, 1)
D = mid(AB)
`);
    assert.deepEqual([...doc.objects.keys()], ["A", "B", "AB", "c", "D"]);
});

test("semantic: identical bare refs are idempotent (§7.1)", () => {
    const doc = compile(`
A = (0,0)
B = (1,0)
AB
AB
`);
    assert.deepEqual([...doc.objects.keys()], ["A", "B", "AB"]);
});

test("semantic: AB and BA are distinct objects (§7.1)", () => {
    const doc = compile(`
A = (0,0)
B = (1,0)
AB
BA
`);
    assert.deepEqual([...doc.objects.keys()], ["A", "B", "AB", "BA"]);
});

test("semantic: circle through point vs radius overloads", () => {
    const doc = compile(`
O = (0,0)
A = (2,0)
c1 = circle(O, 2)
c2 = circle(O, A)
`);
    assert.equal(doc.objects.get("c1").definition.type, "CircleCenterRadiusDefinition");
    assert.equal(doc.objects.get("c2").definition.type, "CircleThroughPointDefinition");
});

test("semantic: measurement returns number usable in expressions", () => {
    const doc = compile(`
A = (0,0)
B = (4,0)
O = (0,0)
c = circle(O, distance(A, B) / 2)
`);
    const def = doc.objects.get("c").definition;
    assert.equal(def.type, "CircleCenterRadiusDefinition");
    assert.equal(def.radius.type, "BinaryExpr");
    assert.equal(def.radius.operator, "/");
    assert.equal(def.radius.left.type, "DistanceCall");
});

test("semantic: rotate negative angle parses and types (§22)", () => {
    const doc = compile(`
A = (0,0)
O = (0,0)
R = rotate(A, -30, O)
`);
    assert.equal(doc.objects.get("R").kind, "Point");
});

test("semantic: error positions are attached", () => {
    try {
        compile("A = (0,0)\nA = (1,0)");
        assert.fail("expected throw");
    } catch (e) {
        assert.equal(e.line, 2);
        assert.equal(e.column, 1);
        assert.equal(e.name, "NameError");
        assert.ok(typeof e.offset === "number");
    }
});
