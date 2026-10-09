import { test } from "node:test";
import assert from "node:assert/strict";

import { lex } from "../../src/lexer/lexer.js";
import { parse } from "../../src/parser/parser.js";
import { analyze } from "../../src/semantic/analyzer.js";
import { evaluate } from "../../src/engine/evaluate.js";
import { EPSILON, near } from "../../src/engine/epsilon.js";

function run(source) {
    return evaluate(analyze(parse(lex(source))));
}

function geom(source, name) {
    return run(source).objects.get(name).geometry;
}

function assertPoint(actual, x, y, epsilon = EPSILON, message = "") {
    assert.equal(actual.type, "Point", message);
    assert.ok(
        Math.abs(actual.x - x) < epsilon && Math.abs(actual.y - y) < epsilon,
        `expected (${x}, ${y}), got (${actual.x}, ${actual.y}) ${message}`,
    );
}

function expectGeometryError(source, pattern) {
    assert.throws(() => run(source), (e) => {
        assert.equal(e.name, "GeometryError", `expected GeometryError, got ${e.name}: ${e.message}`);
        if (pattern) assert.match(e.message, pattern);
        return true;
    });
}

const TRI = `
A = (0, 0)
B = (4, 0)
C = (0, 3)
`;

// --- midpoint -----------------------------------------------------------------

test("engine: midpoint of (0,0),(4,0) is (2,0)", () => {
    const m = geom(`${TRI.replace("C = (0, 3)", "")}
D = mid(AB)
`, "D");
    assertPoint(m, 2, 0);
});

// --- line × line ------------------------------------------------------------------

test("engine: line × line intersection", () => {
    const p = geom(`
A = (0, 0)
B = (4, 0)
C = (0, 3)
D = (4, 3)
E = line(A, B) * line(A, C)
`, "E");
    assertPoint(p, 0, 0);
});

test("engine: line × line parallel -> GeometryError", () => {
    expectGeometryError(`
A = (0, 0)
B = (4, 0)
C = (0, 3)
D = (4, 3)
E = line(A, B) * line(C, D)
`, /parallel/);
});

test("engine: line × line collinear -> GeometryError (infinitely many)", () => {
    expectGeometryError(`
A = (0, 0)
B = (4, 0)
E = line(A, B) * line(B, A)
`, /coincide|infinitely many/);
});

// --- segment × segment -------------------------------------------------------------

test("engine: segment × segment crossing", () => {
    const p = geom(`
A = (0, 0)
B = (4, 4)
C = (0, 4)
D = (4, 0)
E = AB * CD
`, "E");
    assertPoint(p, 2, 2);
});

test("engine: segment × segment parallel disjoint -> GeometryError", () => {
    expectGeometryError(`
A = (0, 0)
B = (1, 0)
C = (0, 1)
D = (1, 1)
E = AB * CD
`, /parallel|no intersection/);
});

test("engine: segment × segment touching at endpoint counts", () => {
    const p = geom(`
A = (0, 0)
B = (2, 0)
C = (2, 0)
D = (2, 2)
E = AB * CD
`, "E");
    assertPoint(p, 2, 0);
});

test("engine: collinear overlapping segments -> GeometryError", () => {
    expectGeometryError(`
A = (0, 0)
B = (4, 0)
C = (1, 0)
D = (3, 0)
E = AB * CD
`, /infinitely many/);
});

// --- segment × line -----------------------------------------------------------------

test("engine: segment × line crossing", () => {
    const p = geom(`
A = (0, 0)
B = (4, 0)
C = (2, -1)
D = (2, 1)
E = AB * line(C, D)
`, "E");
    assertPoint(p, 2, 0);
});

test("engine: segment × line missing the segment -> GeometryError", () => {
    expectGeometryError(`
A = (0, 0)
B = (1, 0)
C = (2, -1)
D = (2, 1)
E = AB * line(C, D)
`, /no intersection/);
});

// --- line × circle / circle × circle --------------------------------------------------

test("engine: line × circle through center: two points", () => {
    const doc = run(`
O = (0, 0)
A = (4, 0)
c = circle(O, 2)
h = line(A, O)
P = intersect(h, c, 1)
Q = intersect(h, c, 2)
`);
    const p = doc.objects.get("P").geometry;
    const q = doc.objects.get("Q").geometry;
    // ordering: x asc -> (-2,0) is index 1, (2,0) index 2
    assertPoint(p, -2, 0);
    assertPoint(q, 2, 0);
});

test("engine: line × circle tangent -> one point", () => {
    const p = geom(`
O = (0, 0)
c = circle(O, 2)
t = line((2, -1), (2, 1))
P = t * c
`, "P");
    assertPoint(p, 2, 0);
});

test("engine: line × circle no intersection -> GeometryError", () => {
    expectGeometryError(`
O = (0, 0)
c = circle(O, 1)
t = line((5, -1), (5, 1))
P = t * c
`, /no intersection/);
});

test("engine: circle × circle two intersections + deterministic ordering", () => {
    const doc = run(`
A = (0, 0)
B = (4, 0)
c1 = circle(A, B)
c2 = circle(B, A)
P = intersect(c1, c2, 1)
Q = intersect(c1, c2, 2)
`);
    const p = doc.objects.get("P").geometry;
    const q = doc.objects.get("Q").geometry;
    // both at x=2, y=±sqrt(12); y asc -> (2, -3.464) is index 1
    assertPoint(p, 2, -Math.sqrt(12));
    assertPoint(q, 2, Math.sqrt(12));
});

test("engine: circle × circle without index on 2 results -> ArgumentError (§26)", () => {
    assert.throws(() => run(`
A = (0, 0)
B = (4, 0)
c1 = circle(A, B)
c2 = circle(B, A)
P = c1 * c2
`), (e) => {
        assert.equal(e.name, "ArgumentError");
        assert.match(e.message, /provide an index/);
        return true;
    });
});

test("engine: circle × circle tangent -> one point, index 2 -> GeometryError", () => {
    const doc = run(`
O = (0, 0)
c1 = circle(O, 2)
c2 = circle((4, 0), 2)
P = c1 * c2
`);
    assertPoint(doc.objects.get("P").geometry, 2, 0);

    expectGeometryError(`
O = (0, 0)
c1 = circle(O, 2)
c2 = circle((4, 0), 2)
P = intersect(c1, c2, 2)
`, /out of range/);
});

test("engine: circle × circle disjoint -> GeometryError", () => {
    expectGeometryError(`
O = (0, 0)
c1 = circle(O, 1)
c2 = circle((5, 0), 1)
P = c1 * c2
`, /no intersection/);
});

test("engine: concentric circles -> GeometryError", () => {
    expectGeometryError(`
O = (0, 0)
c1 = circle(O, 1)
c2 = circle(O, 2)
P = intersect(c1, c2, 1)
`, /no intersection|coincide/);
});

// --- projection / perpendicular / parallel ---------------------------------------------

test("engine: projection foot", () => {
    const p = geom(`
A = (0, 0)
B = (4, 0)
P = (2, 3)
F = projection(P, line(A, B))
`, "F");
    assertPoint(p, 2, 0);
});

test("engine: perpendicular through point", () => {
    const doc = run(`
A = (0, 0)
B = (4, 0)
C = (2, 3)
h = perpendicular(C, AB)
E = h * AB
`);
    const h = doc.objects.get("h").geometry;
    assert.equal(h.type, "Line");
    // direction is perpendicular to (1,0)
    assert.ok(Math.abs(h.direction.x) < EPSILON);
    const e = doc.objects.get("E").geometry;
    assertPoint(e, 2, 0);
});

test("engine: parallel through point", () => {
    const doc = run(`
A = (0, 0)
B = (4, 2)
C = (1, 5)
l = parallel(C, line(A, B))
D = (0, 5)
E = l * line(D, (1, 6))
`);
    const l = doc.objects.get("l").geometry;
    // same direction as AB: (4,2) normalized = (0.894, 0.447)
    assert.ok(near(l.direction.x, 2 / Math.sqrt(5)) && near(l.direction.y, 1 / Math.sqrt(5)));
    assert.ok(doc.objects.get("E").geometry);
});

// --- constructions on triangles ---------------------------------------------------------

test("engine: perpendicular bisector", () => {
    const doc = run(`
A = (0, 0)
B = (4, 0)
m = perpendicular_bisector(AB)
E = m * line((-1, 3), (1, 3))
`);
    const e = doc.objects.get("E").geometry;
    assertPoint(e, 2, 3);
});

test("engine: angle bisector of right angle at origin", () => {
    const doc = run(`
A = (0, 3)
B = (0, 0)
C = (3, 0)
b = angle_bisector(A, B, C)
D = (1, 1)
E = b * line((5, 5), (4, 5))
`);
    const b = doc.objects.get("b").geometry;
    assert.ok(near(b.direction.x, Math.SQRT1_2) && near(b.direction.y, Math.SQRT1_2));
    assert.ok(doc.objects.get("E").geometry);
});

test("engine: angle bisector collinear -> GeometryError (§28)", () => {
    expectGeometryError(`
A = (0, 0)
B = (1, 0)
C = (2, 0)
b = angle_bisector(A, B, C)
`, /degenerate|collinear/);
});

// --- transforms ---------------------------------------------------------------------------

test("engine: translate", () => {
    const p = geom(`
A = (1, 2)
P = translate(A, 3, -1)
`, "P");
    assertPoint(p, 4, 1);
});

test("engine: rotate counterclockwise positive (§22)", () => {
    const p = geom(`
A = (1, 0)
O = (0, 0)
P = rotate(A, 90, O)
`, "P");
    assertPoint(p, 0, 1);
});

test("engine: rotate negative is clockwise", () => {
    const p = geom(`
A = (0, 1)
O = (0, 0)
P = rotate(A, -90, O)
`, "P");
    assertPoint(p, 1, 0);
});

test("engine: rotate around non-origin center", () => {
    const p = geom(`
A = (3, 1)
O = (1, 1)
P = rotate(A, 180, O)
`, "P");
    assertPoint(p, -1, 1);
});

test("engine: reflect across line", () => {
    const q = geom(`
A = (1, 1)
B = (1, 5)
P = (3, 2)
Q = reflect(P, line(A, B))
`, "Q");
    assertPoint(q, -1, 2);
});

// --- measurements -----------------------------------------------------------------------------

test("engine: distance", () => {
    const doc = run(`
A = (0, 0)
B = (3, 4)
P = (distance(A, B), 0)
`);
    assertPoint(doc.objects.get("P").geometry, 5, 0);
});

test("engine: length of segment/arc/polyline", () => {
    // segment: 3-4-5
    const doc = run(`
A = (0, 0)
B = (3, 4)
c1 = circle(A, length(AB))

O = (0, 0)
P = (1, 0)
Q = (0, 1)
a = arc(O, P, Q)
c2 = circle(O, length(a))

pl = polyline((0,0), (1,0), (1,1))
c3 = circle(O, length(pl))
`);
    assert.ok(near(doc.objects.get("c1").geometry.radius, 5));
    assert.ok(near(doc.objects.get("c2").geometry.radius, Math.PI / 2));
    assert.ok(near(doc.objects.get("c3").geometry.radius, 2));
});

test("engine: angle returns degrees 0..180", () => {
    const doc = run(`
A = (0, 3)
B = (0, 0)
C = (3, 0)
c = circle(B, angle(A, B, C) / 90)
`);
    // 90 degrees -> radius 1
    const c = doc.objects.get("c").geometry;
    assert.ok(near(c.radius, 1));
});

test("engine: area via shoelace", () => {
    const doc = run(`
A = (0, 0)
B = (4, 0)
C = (0, 3)
ABC
c = circle(B, area(ABC))
`);
    // area = 6 -> radius 6
    const c = doc.objects.get("c").geometry;
    assert.ok(near(c.radius, 6));
});

test("engine: perimeter", () => {
    const doc = run(`
A = (0, 0)
B = (4, 0)
C = (0, 3)
ABC
c = circle(B, perimeter(ABC))
`);
    // 3-4-5 triangle perimeter 12
    const c = doc.objects.get("c").geometry;
    assert.ok(near(c.radius, 12));
});

test("engine: length of line rejected at semantic (§23)", () => {
    assert.throws(() => run(`
A = (0, 0)
B = (1, 0)
x = (length(line(A, B)), 0)
`), (e) => {
        assert.equal(e.name, "TypeError");
        return true;
    });
});

// --- triangle functions -----------------------------------------------------------------------

test("engine: centroid", () => {
    const doc = run(`
A = (0, 0)
B = (6, 0)
C = (0, 3)
g = centroid(ABC)
`);
    assertPoint(doc.objects.get("g").geometry, 2, 1);
});

test("engine: circumcenter and circumcircle", () => {
    const doc = run(`
A = (0, 0)
B = (6, 0)
C = (0, 8)
O = circumcenter(ABC)
omega = circumcircle(ABC)
`);
    assertPoint(doc.objects.get("O").geometry, 3, 4);
    const omega = doc.objects.get("omega").geometry;
    assert.ok(near(omega.radius, 5));
    assert.ok(near(omega.center.x, 3) && near(omega.center.y, 4));
});

test("engine: circumcenter collinear -> GeometryError (§28)", () => {
    expectGeometryError(`
A = (0, 0)
B = (1, 0)
C = (2, 0)
O = circumcenter(ABC)
`, /collinear/);
});

test("engine: incenter and incircle", () => {
    const doc = run(`
A = (0, 0)
B = (4, 0)
C = (0, 3)
i = incenter(ABC)
gamma = incircle(ABC)
`);
    const i = doc.objects.get("i").geometry;
    const gamma = doc.objects.get("gamma").geometry;
    // right triangle: incenter at (r, r), r = (3+4-5)/2 = 1
    assertPoint(i, 1, 1);
    assert.ok(near(gamma.radius, 1));
});

// --- arc ---------------------------------------------------------------------------------------

test("engine: arc minor arc selection", () => {
    const doc = run(`
O = (0, 0)
A = (1, 0)
B = (0, 1)
a = arc(O, A, B)
`);
    const arc = doc.objects.get("a").geometry;
    assert.equal(arc.type, "Arc");
    assert.ok(near(arc.radius, 1));
    assert.ok(near(arc.sweep, Math.PI / 2));
    assert.equal(arc.ccw, true);
});

test("engine: arc radius mismatch -> GeometryError (§28)", () => {
    expectGeometryError(`
O = (0, 0)
A = (1, 0)
B = (0, 2)
a = arc(O, A, B)
`, /radius mismatch/);
});

test("engine: arc antipodal endpoints -> GeometryError (§28)", () => {
    expectGeometryError(`
O = (0, 0)
A = (1, 0)
B = (-1, 0)
a = arc(O, A, B)
`, /antipodal|not unique/);
});

// --- degenerate geometry (§28) -------------------------------------------------------------------

test("engine: zero-length segment -> GeometryError", () => {
    expectGeometryError(`
A = (0, 0)
B = (0, 0)
AB
`, /coincident/);
});

test("engine: zero-radius circle -> GeometryError", () => {
    expectGeometryError(`
O = (0, 0)
c = circle(O, 0)
`, /zero radius/);
});

test("engine: duplicate polygon vertices -> GeometryError", () => {
    expectGeometryError(`
A = (0, 0)
B = (1, 0)
C = (0, 1)
D = (0, 0)
p = polygon(A, B, C, D)
`, /duplicate vertices/);
});

test("engine: division by zero -> GeometryError", () => {
    expectGeometryError(`
O = (0, 0)
c = circle(O, 1 / 0)
`, /division by zero|non-finite/);
});

// --- cyclic dependency ------------------------------------------------------------------------------

test("engine: cyclic dependency -> DependencyError (§29)", () => {
    assert.throws(() => run(`
A = mid(BC)
B = mid(AC)
C = mid(AB)
`), (e) => {
        assert.equal(e.name, "DependencyError");
        assert.match(e.message, /cyclic/);
        return true;
    });
});

// --- error positions -----------------------------------------------------------------------------------

test("engine: runtime errors carry source positions", () => {
    try {
        run(`
A = (0, 0)
B = (1, 0)
C = (5, 5)
D = (6, 5)
E = AB * CD
`);
        assert.fail("expected throw");
    } catch (e) {
        assert.equal(e.name, "GeometryError");
        assert.equal(e.line, 6);
        assert.ok(e.column > 0);
    }
});

// --- spec §29 dependency graph example -------------------------------------------------------------------

test("engine: medians example from spec §29", () => {
    const doc = run(`
A = (0, 0)
B = (6, 0)
C = (2, 4)
D = mid(BC)
E = mid(CA)
G = AD * BE
`);
    // centroid of the triangle
    assertPoint(doc.objects.get("D").geometry, 4, 2);
    assertPoint(doc.objects.get("E").geometry, 1, 2);
    // medians intersect at centroid (8/3, 4/3)
    assertPoint(doc.objects.get("G").geometry, 8 / 3, 4 / 3);
});
