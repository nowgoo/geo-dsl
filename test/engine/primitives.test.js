import { test } from "node:test";
import assert from "node:assert/strict";

import { compile } from "../../src/index.js";
import { near } from "../../src/engine/epsilon.js";

/**
 * M6 coverage additions: primitive argument-shape variants that the
 * main engine suite does not exercise.
 */

test("triangle functions accept polygon references", () => {
    const doc = compile(`
A = (0, 0)
B = (6, 0)
C = (0, 8)
ABC
O = circumcenter(ABC)
omega = circumcircle(ABC)
i = incenter(ABC)
gamma = incircle(ABC)
g = centroid(ABC)
`);
    const o = doc.objects.get("O").geometry;
    assert.ok(near(o.x, 3) && near(o.y, 4));
    assert.ok(near(doc.objects.get("omega").geometry.radius, 5));
    const i = doc.objects.get("i").geometry;
    // right triangle legs 6, 8: r = (6+8-10)/2 = 2 -> incenter (2,2)
    assert.ok(near(i.x, 2) && near(i.y, 2));
    assert.ok(near(doc.objects.get("gamma").geometry.radius, 2));
    const g = doc.objects.get("g").geometry;
    assert.ok(near(g.x, 2) && near(g.y, 8 / 3));
});

test("projection onto materialized bare-ref segment", () => {
    const doc = compile(`
A = (0, 0)
B = (4, 0)
AB
P = (1, 3)
F = projection(P, AB)
`);
    const f = doc.objects.get("F").geometry;
    assert.ok(near(f.x, 1) && near(f.y, 0));
});

test("perpendicular and parallel accept materialized segment refs", () => {
    const doc = compile(`
A = (0, 0)
B = (4, 0)
AB
C = (2, 3)
h = perpendicular(C, AB)
p = parallel(C, AB)
E = h * AB
`);
    assert.equal(doc.objects.get("h").geometry.type, "Line");
    assert.equal(doc.objects.get("p").geometry.type, "Line");
    const e = doc.objects.get("E").geometry;
    assert.ok(near(e.x, 2) && near(e.y, 0));
});

test("perpendicular accepts explicit line()", () => {
    const doc = compile(`
A = (0, 0)
B = (4, 0)
l = line(A, B)
C = (0, 2)
h = perpendicular(C, l)
E = h * l
`);
    const e = doc.objects.get("E").geometry;
    assert.ok(near(e.x, 0) && near(e.y, 0));
});

test("rotate around triangle vertex chain", () => {
    const doc = compile(`
A = (4, 0)
O = (0, 0)
B = rotate(A, 90, O)
C = rotate(B, 90, O)
`);
    const b = doc.objects.get("B").geometry;
    const c = doc.objects.get("C").geometry;
    assert.ok(near(b.x, 0) && near(b.y, 4));
    assert.ok(near(c.x, -4) && near(c.y, 0));
});

test("reflect across materialized segment line", () => {
    const doc = compile(`
A = (0, 0)
B = (0, 5)
AB
P = (3, 1)
Q = reflect(P, AB)
`);
    const q = doc.objects.get("Q").geometry;
    assert.ok(near(q.x, -3) && near(q.y, 1));
});

test("angle_bisector via explicit point triple", () => {
    const doc = compile(`
A = (0, 3)
B = (0, 0)
C = (3, 0)
b = angle_bisector(A, B, C)
`);
    const dir = doc.objects.get("b").geometry.direction;
    assert.ok(near(dir.x, Math.SQRT1_2) && near(dir.y, Math.SQRT1_2));
});

test("length of arc from DSL (quarter circle)", () => {
    const doc = compile(`
O = (0, 0)
P = (1, 0)
Q = (0, 1)
a = arc(O, P, Q)
c = circle(O, length(a))
`);
    assert.ok(near(doc.objects.get("c").geometry.radius, Math.PI / 2));
});

test("distance composes into point literals", () => {
    const doc = compile(`
A = (0, 0)
B = (3, 4)
M = point(distance(A, B) / 2, -1)
`);
    const m = doc.objects.get("M").geometry;
    assert.ok(near(m.x, 2.5) && near(m.y, -1));
});

test("midpoint via explicit pair and via segment agree", () => {
    const a = compile(`
A = (0, 0)
B = (4, 2)
D = mid(AB)
`).objects.get("D").geometry;
    const b = compile(`
A = (0, 0)
B = (4, 2)
D = midpoint(A, B)
`).objects.get("D").geometry;
    assert.ok(near(a.x, b.x) && near(a.y, b.y));
    assert.ok(near(a.x, 2) && near(a.y, 1));
});
