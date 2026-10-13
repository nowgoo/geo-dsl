import { test } from "node:test";
import assert from "node:assert/strict";

import { lex } from "../../src/lexer/lexer.js";
import { parse } from "../../src/parser/parser.js";

function ast(source) {
    return parse(lex(source));
}

function typePath(node, depth = 0, maxDepth = 12) {
    if (node == null || depth > maxDepth || typeof node !== "object") return node?.type ?? node;
    if (Array.isArray(node)) return node.map((n) => typePath(n, depth + 1, maxDepth));
    const out = { type: node.type };
    for (const key of Object.keys(node)) {
        if (key === "type" || key === "position") continue;
        const v = node[key];
        if (v && typeof v === "object" && (v.type || Array.isArray(v))) {
            out[key] = typePath(v, depth + 1, maxDepth);
        } else if (!["offset", "line", "column"].includes(key)) {
            out[key] = v;
        }
    }
    return out;
}

// --- assignments & point literals ---------------------------------------------

test("parser: simple point literal assignment", () => {
    const program = ast("A = (0, 0)");
    assert.equal(program.statements.length, 1);
    const stmt = program.statements[0];
    assert.equal(stmt.type, "AssignmentStmt");
    assert.equal(stmt.name, "A");
    assert.equal(stmt.expression.type, "PointLiteralExpr");
    assert.equal(stmt.expression.x.type, "NumberExpr");
    assert.equal(stmt.expression.x.value, 0);
});

test("parser: assignment to lowercase identifier", () => {
    const program = ast("omega = circle(O, 2)");
    const stmt = program.statements[0];
    assert.equal(stmt.name, "omega");
    assert.equal(stmt.expression.type, "CallExpr");
    assert.equal(stmt.expression.name, "circle");
});

test("parser: point literal with expressions", () => {
    const program = ast("P = point(-1, 2 * 3 + 1)");
    const call = program.statements[0].expression;
    assert.equal(call.args[0].type, "UnaryExpr");
    assert.equal(call.args[1].type, "BinaryExpr");
    assert.equal(call.args[1].operator, "+");
});

test("parser: point literal from measurement", () => {
    const program = ast("Q = point(distance(A, B) / 2, 0)");
    const call = program.statements[0].expression;
    assert.equal(call.args[0].operator, "/");
    assert.equal(call.args[0].left.name, "distance");
});

test("parser: parenthesized grouping vs point literal", () => {
    // (expr) is grouping
    const grouped = ast("X = (2)").statements[0].expression;
    assert.equal(grouped.type, "NumberExpr");

    // (expr, expr) is a point literal
    const point = ast("X = (2, 3)").statements[0].expression;
    assert.equal(point.type, "PointLiteralExpr");
});

test("parser: nested point literal as grouping inside point literal", () => {
    const program = ast("X = ((1), (2, 3))");
    const lit = program.statements[0].expression;
    assert.equal(lit.type, "PointLiteralExpr");
    assert.equal(lit.x.type, "NumberExpr");
    assert.equal(lit.y.type, "PointLiteralExpr");
});

// --- implicit references --------------------------------------------------------

test("parser: bare point / segment / polygon statements", () => {
    const program = ast("A\nAB\nABC\nABCD");
    assert.deepEqual(
        program.statements.map((s) => s.type),
        ["GeometryRefStmt", "GeometryRefStmt", "GeometryRefStmt", "GeometryRefStmt"],
    );
    assert.equal(program.statements[0].reference.type, "PointRefExpr");
    assert.equal(program.statements[1].reference.type, "SegmentRefExpr");
    assert.equal(program.statements[1].reference.from, "A");
    assert.equal(program.statements[1].reference.to, "B");
    assert.equal(program.statements[2].reference.type, "PolygonRefExpr");
    assert.deepEqual(program.statements[2].reference.points, ["A", "B", "C"]);
    assert.deepEqual(program.statements[3].reference.points, ["A", "B", "C", "D"]);
});

test("parser: implicit refs inside expressions", () => {
    const program = ast("E = AB * CD");
    const bin = program.statements[0].expression;
    assert.equal(bin.type, "BinaryExpr");
    assert.equal(bin.operator, "*");
    assert.equal(bin.left.type, "SegmentRefExpr");
    assert.equal(bin.left.from, "A");
    assert.equal(bin.left.to, "D" === "D" ? "B" : "B");
    assert.equal(bin.right.type, "SegmentRefExpr");
});

test("parser: lowercase identifiers are not implicit refs", () => {
    const program = ast("x = abcd");
    const expr = program.statements[0].expression;
    assert.equal(expr.type, "IdentifierExpr");
    assert.equal(expr.name, "abcd");
});

test("parser: mixed-case identifiers are plain identifiers", () => {
    const program = ast("x = Ab");
    assert.equal(program.statements[0].expression.type, "IdentifierExpr");
});

// --- operator precedence ----------------------------------------------------------

test("parser: ^ is right associative", () => {
    const program = ast("x = 2 ^ 3 ^ 2");
    let node = program.statements[0].expression;
    assert.equal(node.operator, "^");
    assert.equal(node.left.value, 2);
    assert.equal(node.right.operator, "^");
    assert.equal(node.right.left.value, 3);
    assert.equal(node.right.right.value, 2);
});

test("parser: unary minus binds looser than ^ (-2^2 = -(2^2))", () => {
    const program = ast("x = -2 ^ 2");
    const node = program.statements[0].expression;
    assert.equal(node.type, "UnaryExpr");
    assert.equal(node.operand.operator, "^");
});

test("parser: unary minus binds tighter than * (-x * y)", () => {
    const program = ast("x = -a * b");
    const node = program.statements[0].expression;
    assert.equal(node.type, "BinaryExpr");
    assert.equal(node.operator, "*");
    assert.equal(node.left.type, "UnaryExpr");
    assert.equal(node.right.type, "IdentifierExpr");
});

test("parser: * / bind tighter than + -", () => {
    const program = ast("x = 1 + 2 * 3 - 4 / 2");
    const node = program.statements[0].expression;
    assert.equal(node.operator, "-");
    assert.equal(node.left.operator, "+");
    assert.equal(node.left.right.operator, "*");
    assert.equal(node.right.operator, "/");
});

test("parser: * / and + - are left associative", () => {
    const program = ast("x = 1 - 2 - 3");
    const node = program.statements[0].expression;
    assert.equal(node.operator, "-");
    assert.equal(node.left.operator, "-");
    assert.equal(node.left.left.value, 1);
});

test("parser: double unary minus", () => {
    const program = ast("x = --5");
    const node = program.statements[0].expression;
    assert.equal(node.type, "UnaryExpr");
    assert.equal(node.operand.type, "UnaryExpr");
    assert.equal(node.operand.operand.value, 5);
});

test("parser: rotate with negative angle", () => {
    const program = ast("R = rotate(A, -30, O)");
    const call = program.statements[0].expression;
    assert.equal(call.name, "rotate");
    assert.equal(call.args[1].type, "UnaryExpr");
});

test("parser: numeric ops and intersect chain left-assoc", () => {
    const program = ast("X = AB * CD * EF");
    const node = program.statements[0].expression;
    assert.equal(node.operator, "*");
    assert.equal(node.left.operator, "*");
    assert.equal(node.left.left.type, "SegmentRefExpr");
    assert.equal(node.right.type, "SegmentRefExpr");
});

// --- statements: canvas / style / label / mark --------------------------------------

test("parser: canvas statement", () => {
    const program = ast('canvas {\n  width: 600\n  height: 400\n  padding: 30\n}');
    const stmt = program.statements[0];
    assert.equal(stmt.type, "CanvasStmt");
    assert.equal(stmt.properties.width.value, 600);
    assert.equal(stmt.properties.height.value, 400);
    assert.equal(stmt.properties.padding.value, 30);
});

test("parser: style statement with color and name selector", () => {
    const program = ast('style AB {\n  stroke: #f00\n  width: 3\n}');
    const stmt = program.statements[0];
    assert.equal(stmt.type, "StyleStmt");
    assert.equal(stmt.selector, "AB");
    assert.equal(stmt.properties.get("stroke").type, "ColorExpr");
    assert.equal(stmt.properties.get("stroke").value, "#f00");
    assert.equal(stmt.properties.get("width").value, 3);
});

test("parser: style type selector", () => {
    const program = ast("style point {\n  radius: 4\n  fill: #222222\n}");
    assert.equal(program.statements[0].selector, "point");
});

test("parser: style none and string values", () => {
    const program = ast('style circle {\n  fill: none\n  font: "serif"\n}');
    const props = program.statements[0].properties;
    assert.equal(props.get("fill").value, "none");
    assert.equal(props.get("font").value, "serif");
});

test("parser: style dash number list and cap/join enums", () => {
    const program = ast("style segment {\n  dash: 4 2\n  cap: round\n}");
    const props = program.statements[0].properties;
    assert.deepEqual(props.get("dash").map((n) => n.value), [4, 2]);
    assert.equal(props.get("cap").value, "round");
});

test("parser: label statement forms", () => {
    const p1 = ast('label A');
    assert.equal(p1.statements[0].type, "LabelStmt");
    assert.equal(p1.statements[0].target.name, "A");
    assert.equal(p1.statements[0].text, null);
    assert.equal(p1.statements[0].offset, null);

    const p2 = ast('label A "顶点 A"');
    assert.equal(p2.statements[0].text.value, "顶点 A");

    const p3 = ast("label A offset (8,-8)");
    assert.equal(p3.statements[0].offset.type, "PointLiteralExpr");
    assert.equal(p3.statements[0].offset.x.value, 8);
    assert.equal(p3.statements[0].offset.y.type, "UnaryExpr");
    assert.equal(p3.statements[0].offset.y.operand.value, 8);
});

test("parser: label multi-target expands to one statement per point", () => {
    const p = ast("label A, B, C");
    assert.equal(p.statements.length, 3);
    assert.deepEqual(
        p.statements.map((s) => s.target.name),
        ["A", "B", "C"],
    );
    for (const s of p.statements) {
        assert.equal(s.type, "LabelStmt");
        assert.equal(s.text, null);
        assert.equal(s.offset, null);
    }

    // trailing text/offset applies to every target
    const pt = ast('label A, B "顶点"');
    assert.equal(pt.statements.length, 2);
    for (const s of pt.statements) {
        assert.equal(s.text.value, "顶点");
        assert.equal(s.offset, null);
    }

    const po = ast("label A, B offset (0, 0)");
    assert.equal(po.statements.length, 2);
    for (const s of po.statements) {
        assert.equal(s.offset.type, "PointLiteralExpr");
        assert.equal(s.text, null);
    }
});

test("parser: label mixed single/multi statements coexist", () => {
    const p = ast('label A\nlabel B, C "x"');
    assert.equal(p.statements.length, 3);
    assert.deepEqual(
        p.statements.map((s) => s.target.name),
        ["A", "B", "C"],
    );
    assert.equal(p.statements[1].text.value, "x");
    assert.equal(p.statements[2].text.value, "x");
});

test("parser: label comma with no following point is SyntaxError", () => {
    assert.throws(() => ast("label A,"), (e) => e.name === "SyntaxError");
    assert.throws(() => ast("label A, B,"), (e) => e.name === "SyntaxError");
});

test("parser: hide statement forms", () => {
    const p1 = ast("hide A");
    assert.equal(p1.statements.length, 1);
    const s1 = p1.statements[0];
    assert.equal(s1.type, "HideStmt");
    assert.equal(s1.targets.length, 1);
    assert.equal(s1.targets[0].type, "PointRefExpr");
    assert.equal(s1.targets[0].name, "A");

    // comma-separated multi-object hide on one line
    const p2 = ast("hide A, B, AB, omega, ABC");
    assert.equal(p2.statements.length, 1);
    const s2 = p2.statements[0];
    assert.equal(s2.type, "HideStmt");
    assert.deepEqual(
        s2.targets.map((t) => t.type),
        ["PointRefExpr", "PointRefExpr", "SegmentRefExpr", "IdentifierExpr", "PolygonRefExpr"],
    );
    assert.equal(s2.targets[2].from, "A");
    assert.equal(s2.targets[2].to, "B");
    assert.equal(s2.targets[3].name, "omega");
    assert.deepEqual(s2.targets[4].points, ["A", "B", "C"]);
});

test("parser: hide comma with no following object is SyntaxError", () => {
    assert.throws(() => ast("hide A,"), (e) => e.name === "SyntaxError");
    assert.throws(() => ast("hide A, B,"), (e) => e.name === "SyntaxError");
});

test("parser: hide multiple statements coexist", () => {
    const p = ast("hide A\nhide B, C");
    assert.equal(p.statements.length, 2);
    assert.deepEqual(
        p.statements.flatMap((s) => s.targets.map((t) => t.name)),
        ["A", "B", "C"],
    );
});

test("parser: mark statements", () => {
    const p1 = ast("mark right_angle(A, B, C)");
    assert.equal(p1.statements[0].type, "MarkStmt");
    assert.equal(p1.statements[0].kind, "right_angle");
    assert.equal(p1.statements[0].args.length, 3);

    const p2 = ast("mark equal_length(AB, BC)");
    assert.equal(p2.statements[0].kind, "equal_length");
    assert.equal(p2.statements[0].args.length, 2);
});

// --- errors -----------------------------------------------------------------------------

test("parser: assignment to implicit form parses (semantic rejects later)", () => {
    const program = ast("AB = (0, 0)");
    assert.equal(program.statements[0].type, "AssignmentStmt");
    assert.equal(program.statements[0].name, "AB");
});

test("parser: missing ) is SyntaxError", () => {
    assert.throws(() => ast("D = mid(AB"), (e) => e.name === "SyntaxError");
});

test("parser: bare non-reference expression as statement is SyntaxError", () => {
    assert.throws(() => ast("123"), (e) => e.name === "SyntaxError");
    assert.throws(() => ast('label A "x" "y"'), (e) => e.name === "SyntaxError");
});

test("parser: error positions are reported", () => {
    try {
        ast("A = (0, 0)\nB = (1, 0\n");
        assert.fail("expected throw");
    } catch (e) {
        assert.equal(e.name, "SyntaxError");
        assert.equal(e.line, 3); // error surfaces at EOF after line 2
    }
});

test("parser: full program from spec overview", () => {
    const source = `
A = (0, 0)
B = (6, 0)
C = (2, 4)

ABC

D = mid(BC)
E = mid(CA)

AD
BE

G = AD * BE

label A
label B
label C
label D
label E
label G
`;
    const program = ast(source);
    const types = program.statements.map((s) => s.type);
    assert.deepEqual(types, [
        "AssignmentStmt", "AssignmentStmt", "AssignmentStmt",
        "GeometryRefStmt",
        "AssignmentStmt", "AssignmentStmt",
        "GeometryRefStmt", "GeometryRefStmt",
        "AssignmentStmt",
        "LabelStmt", "LabelStmt", "LabelStmt", "LabelStmt", "LabelStmt", "LabelStmt",
    ]);
});
