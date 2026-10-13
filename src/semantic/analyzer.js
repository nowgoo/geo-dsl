/**
 * Semantic analysis (spec §7, §11, §16, §48, §50, §59).
 *
 * Three phases:
 *   A. collect all top-level bindings / materialize bare references / canvas
 *   B. resolve kinds + type-check (order independent, §7.2)
 *   C. canonicalize (desugar) into Geometry IR with dependencies
 */

import { lookupFunction } from "./functions.js";
import { Type, KIND_NAMES, isGeometry } from "./types.js";
import { GeometryObject, Document } from "../ir/document.js";
import {
    SyntaxErrorDSLError,
    NameErrorDSLError,
    TypeErrorDSLError,
    ArgumentErrorDSLError,
    DependencyErrorDSLError,
} from "../errors.js";

const IMPLICIT_FORM = /^[A-Z]{2,}$/; // AB, ABC, ... — never variables (§59)
const POINT_NAME = /^[A-Z]$/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

const CANVAS_PROPERTIES = new Set(["width", "height", "padding"]);

const STYLE_VALUE_KINDS = {
    stroke: { kinds: ["color", "none"] },
    fill: { kinds: ["color", "none"] },
    label_color: { kinds: ["color"] },
    width: { kinds: ["number"] },
    opacity: { kinds: ["number"] },
    radius: { kinds: ["number"] },
    font_size: { kinds: ["number"] },
    font: { kinds: ["string"] },
    font_weight: { kinds: ["string", "number"] },
    font_style: { kinds: ["enum"], values: ["normal", "italic"] },
    cap: { kinds: ["enum"], values: ["butt", "round", "square"] },
    join: { kinds: ["enum"], values: ["miter", "round", "bevel"] },
    dash: { kinds: ["number_list"] },
    label_offset: { kinds: ["point"] },
};

const MARK_SIGNATURES = {
    right_angle: { points: 3 },
    equal_length: { segments: 2 },
    parallel: { segments: 2 },
    equal_angle: { points: 6 },
};

/** measurement functions allowed inside constraint number expressions (spec_v0.2 §3.4) */
const MEASUREMENT_FUNCTIONS = new Set(["distance", "length", "angle", "area", "perimeter"]);
const LINE_LIKE_TYPES = new Set([Type.LINE, Type.SEGMENT, Type.RAY]);

export function analyze(program) {
    return new Analyzer(program).run();
}

class Analyzer {
    constructor(program) {
        this.program = program;
        this.document = new Document();

        this.bindings = new Map(); // name -> AssignmentStmt
        this.bindingOrder = [];
        this.kindCache = new Map(); // name -> type string
        this.resolving = new Set(); // cycle detection during kind inference

        this.pendingBareRefs = []; // GeometryRefStmt list (existence validated later)
        this.pendingHides = []; // HideStmt list
        this.pendingLabels = [];
        this.styleStatements = [];
        this.pendingCanvas = null;
        this.pendingConstraints = []; // ConstraintStmt / BetweennessStmt / {type:"ImplicitConstraint"}
    }

    // === entry ================================================================

    run() {
        this.passA();
        this.passB();
        return this.document;
    }

    // === phase A: collect =======================================================

    passA() {
        for (const stmt of this.program.statements) {
            switch (stmt.type) {
                case "AssignmentStmt":
                    this.collectAssignment(stmt);
                    break;
                case "CanvasStmt":
                    this.collectCanvas(stmt);
                    break;
                case "GeometryRefStmt":
                    this.collectBareRef(stmt);
                    break;
                case "StyleStmt":
                    this.styleStatements.push(stmt);
                    break;
                case "HideStmt":
                    this.collectHide(stmt);
                    break;
                case "LabelStmt":
                    this.pendingLabels.push(stmt);
                    break;
                case "MarkStmt":
                    this.document.marks.push(stmt);
                    break;
                case "UnknownAssignmentStmt":
                    this.collectUnknown(stmt);
                    break;
                case "ConstraintStmt":
                case "BetweennessStmt":
                    this.pendingConstraints.push(stmt);
                    break;
                default:
                    throw new SyntaxErrorDSLError(
                        `unsupported statement ${stmt.type}`,
                        stmt.position,
                    );
            }
        }
    }

    collectAssignment(stmt) {
        const { name, position } = stmt;
        if (!IDENT.test(name)) {
            throw new SyntaxErrorDSLError(`invalid identifier "${name}"`, position);
        }
        if (IMPLICIT_FORM.test(name)) {
            // §59 + v0.2 plan D7: "AB = <segment ref | measurement expr>" is a constraint;
            // anything else keeps the original "not assignable" NameError
            if (name.length === 2 && isConstraintRhs(stmt.expression)) {
                this.pendingConstraints.push({ type: "ImplicitConstraint", stmt });
                return;
            }
            // §59: implicit notation is not a variable
            throw new NameErrorDSLError(
                `"${name}" is implicit geometry notation (segment/polygon reference) and cannot be assigned; use a lowercase identifier or a single uppercase point name`,
                position,
            );
        }
        if (this.bindings.has(name)) {
            throw new NameErrorDSLError(`name "${name}" is already defined`, position);
        }
        this.bindings.set(name, stmt);
        this.bindingOrder.push(name);
        // placeholder keeps document ordering stable
        this.document.objects.set(name, { pending: true, name, stmt });
    }

    /** "C = ?" (spec_v0.2 §3.3) */
    collectUnknown(stmt) {
        const { name, position } = stmt;
        if (this.bindings.has(name)) {
            throw new NameErrorDSLError(`name "${name}" is already defined`, position);
        }
        this.bindings.set(name, stmt);
        this.bindingOrder.push(name);
        this.document.unknowns.add(name);
        this.document.objects.set(name, { pending: true, name, stmt });
    }

    collectCanvas(stmt) {
        if (this.pendingCanvas) {
            throw new ArgumentErrorDSLError(
                "canvas defined more than once",
                stmt.position,
            );
        }
        for (const [key, value] of Object.entries(stmt.properties)) {
            if (!CANVAS_PROPERTIES.has(key)) {
                throw new ArgumentErrorDSLError(
                    `unknown canvas property "${key}" (expected width, height or padding)`,
                    stmt.position,
                );
            }
            this.document.canvas[key] = this.constNumber(value, `canvas.${key}`);
            this.document.canvas.explicit.add(key);
        }
        this.pendingCanvas = stmt;
    }

    collectBareRef(stmt) {
        const ref = stmt.reference;
        if (ref.type === "PointRefExpr") {
            this.pendingBareRefs.push(stmt);
            return;
        }
        // SegmentRef / PolygonRef: materialize a named object (§7.1), idempotent
        const name = ref.type === "SegmentRefExpr"
            ? `${ref.from}${ref.to}`
            : ref.points.join("");
        if (this.document.objects.has(name) && !this.document.objects.get(name).pending) {
            return; // identical bare reference: same object
        }
        if (this.bindings.has(name)) {
            return; // cannot happen (implicit forms are not assignable) — defensive
        }
        const kind = ref.type === "SegmentRefExpr" ? "Segment" : "Polygon";
        const object = new GeometryObject({
            id: name,
            name,
            kind,
            definition: null, // filled in pass B
            position: stmt.position,
        });
        object.pending = true; // filled with definition in pass B
        this.document.objects.set(name, object);
    }

    /** hide targets: points, segments/polygons (implicit refs) and named objects */
    collectHide(stmt) {
        for (const target of stmt.targets) {
            if (target.type === "SegmentRefExpr" || target.type === "PolygonRefExpr") {
                // materialize the implicit object so it exists (idempotent, like a bare ref)
                const name = target.type === "SegmentRefExpr"
                    ? `${target.from}${target.to}`
                    : target.points.join("");
                if (this.document.objects.has(name) && !this.document.objects.get(name).pending) {
                    continue;
                }
                if (this.bindings.has(name)) {
                    continue; // defensive: implicit forms are not assignable
                }
                const kind = target.type === "SegmentRefExpr" ? "Segment" : "Polygon";
                const object = new GeometryObject({
                    id: name,
                    name,
                    kind,
                    definition: null,
                    position: stmt.position,
                });
                object.pending = true;
                this.document.objects.set(name, object);
            }
        }
        this.pendingHides.push(stmt);
    }

    // === phase B: resolve / check / canonicalize ==================================

    passB() {
        // 1. resolve kinds of all bindings (lazy, memoized, cycle-checked)
        for (const name of this.bindingOrder) {
            this.resolveKind(name);
        }

        // 2. bare point references: existence only
        for (const stmt of this.pendingBareRefs) {
            const name = stmt.reference.name;
            this.requireObject(name, stmt.position, `point "${name}"`);
        }

        // 3. materialized bare-ref definitions (before bindings, so expression
        //    refs can bind to them regardless of statement order, §7.1)
        for (const object of [...this.document.objects.values()]) {
            if (!object.pending || this.bindings.has(object.name)) continue;
            this.fillMaterialized(object);
        }

        // 4. fill definitions for bindings
        for (const name of this.bindingOrder) {
            const stmt = this.bindings.get(name);

            // unknown point "C = ?": coordinates come from the solver (spec_v0.2 §5)
            if (stmt.type === "UnknownAssignmentStmt") {
                this.document.objects.set(
                    name,
                    new GeometryObject({
                        id: name,
                        name,
                        kind: Type.POINT,
                        definition: { type: "UnknownPointDefinition" },
                        dependencies: [],
                        position: stmt.position,
                    }),
                );
                continue;
            }

            const result = this.resolve(stmt.expression);
            const kind = result.type;

            if (POINT_NAME.test(name) && kind !== Type.POINT) {
                throw new TypeErrorDSLError(
                    `point name "${name}" can only be bound to a Point, got ${kind}`,
                    stmt.position,
                );
            }
            if (!isGeometry(kind)) {
                throw new ArgumentErrorDSLError(
                    `bindings must be geometry objects (got ${kind}); v0.1 has no numeric/string variables`,
                    stmt.position,
                );
            }

            const dependencies = this.collectDeps(result.def);
            const object = new GeometryObject({
                id: name,
                name,
                kind,
                definition: result.def,
                dependencies,
                position: stmt.position,
            });
            this.document.objects.set(name, object);
        }

        // 4.5 hide statements (targets must exist; implicit refs materialized in collectHide)
        for (const stmt of this.pendingHides) {
            for (const target of stmt.targets) {
                const name = hideTargetName(target);
                const object = this.document.objects.get(name);
                if (!object || object.pending) {
                    throw new NameErrorDSLError(
                        `hide references undefined object "${name}"`,
                        stmt.position,
                    );
                }
                object.hidden = true;
            }
        }

        // 5. styles / labels / marks
        for (const stmt of this.styleStatements) {
            this.checkStyle(stmt);
        }
        this.mergeLabels();
        for (const label of this.document.labels) {
            this.checkLabel(label);
        }
        for (const mark of this.document.marks) {
            this.checkMark(mark);
        }

        // 6. constraints (spec_v0.2 §3, §4) — after all objects exist (order independence)
        for (const pending of this.pendingConstraints) {
            this.document.constraints.push(this.canonicalizeConstraint(pending));
        }
    }

    /** duplicate label targets merge; later statements override (plan D3) */
    mergeLabels() {
        const byTarget = new Map();
        for (const stmt of this.pendingLabels) {
            const name = stmt.target.name;
            const entry = byTarget.get(name) ?? { target: stmt.target, text: null, offset: null, position: stmt.position };
            if (stmt.text) entry.text = stmt.text;
            if (stmt.offset) entry.offset = stmt.offset;
            entry.position = stmt.position;
            byTarget.set(name, entry);
        }
        this.document.labels = [...byTarget.values()];
    }

    fillMaterialized(object) {
        const ref = object.name;
        // materialized segment (2 letters) or polygon (3+ letters)
        if (ref.length === 2) {
            this.requireObject(ref[0], object.position, `point "${ref[0]}"`);
            this.requireObject(ref[1], object.position, `point "${ref[1]}"`);
            object.definition = {
                type: "SegmentDefinition",
                a: { type: "RefDefinition", name: ref[0], position: object.position },
                b: { type: "RefDefinition", name: ref[1], position: object.position },
                position: object.position,
            };
            object.dependencies = [ref[0], ref[1]];
        } else {
            for (const ch of ref) {
                this.requireObject(ch, object.position, `point "${ch}"`);
            }
            object.definition = {
                type: "PolygonDefinition",
                points: [...ref].map((ch) => ({ type: "RefDefinition", name: ch, position: object.position })),
                position: object.position,
            };
            object.dependencies = [...ref];
        }
        object.pending = false;
    }

    // --- kind resolution ----------------------------------------------------

    resolveKind(name) {
        if (this.kindCache.has(name)) {
            return this.kindCache.get(name);
        }
        const materialized = this.document.objects.get(name);
        if (materialized && materialized.kind) {
            // materialized bare-ref object: kind is fixed at creation
            this.kindCache.set(name, materialized.kind);
            return materialized.kind;
        }
        const stmt = this.bindings.get(name);
        if (!stmt) {
            return null; // undefined
        }
        if (stmt.type === "UnknownAssignmentStmt") {
            return Type.POINT; // unknown points are points by construction (spec_v0.2 §3.3)
        }
        if (this.resolving.has(name)) {
            throw new DependencyErrorDSLError(
                "cyclic dependency detected",
                stmt.position,
            );
        }
        this.resolving.add(name);
        const type = this.resolve(stmt.expression).type;
        this.resolving.delete(name);
        this.kindCache.set(name, type);
        return type;
    }

    requireObject(name, position, what = `name "${name}"`) {
        const object = this.document.objects.get(name);
        if (object && !object.pending) {
            return object;
        }
        // forward reference: resolve the binding lazily (order independence, §7.2)
        if (this.bindings.has(name)) {
            const kind = this.resolveKind(name); // throws DependencyError on cycles
            if (kind != null) {
                return { name, kind };
            }
        }
        throw new NameErrorDSLError(`undefined ${what}`, position);
    }

    // --- expression resolution (type + canonical definition) --------------------

    /**
     * Resolve an expression AST node to { type, def } where def is the
     * canonical definition node (geometry) or canonical numeric node.
     */
    resolve(expr) {
        switch (expr.type) {
            case "NumberExpr":
                return { type: Type.NUMBER, def: expr };
            case "StringExpr":
                return { type: Type.STRING, def: expr };
            case "ColorExpr":
                return { type: Type.COLOR, def: expr };
            case "PointLiteralExpr": {
                const x = this.resolve(expr.x);
                const y = this.resolve(expr.y);
                if (x.type !== Type.NUMBER) {
                    throw new TypeErrorDSLError(
                        `point literal x must be a Number expression, got ${x.type}`,
                        expr.position,
                    );
                }
                if (y.type !== Type.NUMBER) {
                    throw new TypeErrorDSLError(
                        `point literal y must be a Number expression, got ${y.type}`,
                        expr.position,
                    );
                }
                return {
                    type: Type.POINT,
                    def: { type: "PointLiteralDefinition", x: x.def, y: y.def, position: expr.position },
                };
            }
            case "PointRefExpr": {
                const object = this.requireObject(expr.name, expr.position, `point "${expr.name}"`);
                if (object.kind !== Type.POINT) {
                    throw new TypeErrorDSLError(
                        `"${expr.name}" is a ${object.kind}, not a Point`,
                        expr.position,
                    );
                }
                return { type: Type.POINT, def: { type: "RefDefinition", name: expr.name, position: expr.position } };
            }
            case "SegmentRefExpr": {
                for (const p of [expr.from, expr.to]) {
                    const object = this.requireObject(p, expr.position, `point "${p}"`);
                    if (object.kind !== Type.POINT) {
                        throw new TypeErrorDSLError(
                            `"${p}" is a ${object.kind}, not a Point`,
                            expr.position,
                        );
                    }
                }
                const materializedName = `${expr.from}${expr.to}`;
                const materialized = this.document.objects.get(materializedName);
                if (materialized && materialized.kind) {
                    // §7.1: depend on the materialized object
                    return { type: Type.SEGMENT, def: { type: "RefDefinition", name: materializedName, position: expr.position } };
                }
                return {
                    type: Type.SEGMENT,
                    def: {
                        type: "SegmentDefinition",
                        a: { type: "RefDefinition", name: expr.from, position: expr.position },
                        b: { type: "RefDefinition", name: expr.to, position: expr.position },
                        position: expr.position,
                    },
                };
            }
            case "PolygonRefExpr": {
                for (const p of expr.points) {
                    const object = this.requireObject(p, expr.position, `point "${p}"`);
                    if (object.kind !== Type.POINT) {
                        throw new TypeErrorDSLError(
                            `"${p}" is a ${object.kind}, not a Point`,
                            expr.position,
                        );
                    }
                }
                return {
                    type: Type.POLYGON,
                    def: {
                        type: "PolygonDefinition",
                        points: expr.points.map((p) => ({ type: "RefDefinition", name: p, position: expr.position })),
                        position: expr.position,
                    },
                };
            }
            case "IdentifierExpr": {
                const kind = this.resolveKind(expr.name);
                if (kind == null) {
                    throw new NameErrorDSLError(`undefined name "${expr.name}"`, expr.position);
                }
                return { type: kind, def: { type: "RefDefinition", name: expr.name, position: expr.position } };
            }
            case "UnaryExpr": {
                const operand = this.resolve(expr.operand);
                if (operand.type !== Type.NUMBER) {
                    throw new TypeErrorDSLError(
                        `unary "-" requires a Number operand, got ${operand.type}`,
                        expr.position,
                    );
                }
                return {
                    type: Type.NUMBER,
                    def: { type: "UnaryExpr", operator: expr.operator, operand: operand.def, position: expr.position },
                };
            }
            case "BinaryExpr":
                return this.resolveBinary(expr);
            case "CallExpr":
                return this.resolveCall(expr);
            default:
                throw new SyntaxErrorDSLError(
                    `unexpected expression ${expr.type}`,
                    expr.position ?? null,
                );
        }
    }

    resolveBinary(expr) {
        const left = this.resolve(expr.left);
        const right = this.resolve(expr.right);
        const lg = isGeometry(left.type);
        const rg = isGeometry(right.type);

        if (expr.operator === "*") {
            if (lg && rg) {
                // geometry * geometry -> intersect (§8, §11.1)
                return {
                    type: Type.POINT,
                    def: {
                        type: "IntersectionDefinition",
                        first: left.def,
                        second: right.def,
                        index: null,
                        position: expr.position,
                    },
                };
            }
            if (!lg && !rg) {
                return {
                    type: Type.NUMBER,
                    def: { type: "BinaryExpr", operator: "*", left: left.def, right: right.def, position: expr.position },
                };
            }
            throw new TypeErrorDSLError(
                `cannot mix geometry and Number with "*": ${left.type} * ${right.type}`,
                expr.position,
            );
        }

        // + - / ^
        if (lg || rg) {
            throw new TypeErrorDSLError(
                `operator "${expr.operator}" is only defined for Numbers, got ${left.type} ${expr.operator} ${right.type}`,
                expr.position,
            );
        }
        if (left.type !== Type.NUMBER || right.type !== Type.NUMBER) {
            throw new TypeErrorDSLError(
                `operator "${expr.operator}" requires Number operands, got ${left.type} and ${right.type}`,
                expr.position,
            );
        }
        return {
            type: Type.NUMBER,
            def: { type: "BinaryExpr", operator: expr.operator, left: left.def, right: right.def, position: expr.position },
        };
    }

    resolveCall(expr) {
        const entry = lookupFunction(expr.name);
        if (!entry) {
            throw new NameErrorDSLError(`unknown function "${expr.name}"`, expr.position);
        }

        if (entry.name === "intersect") {
            return this.resolveIntersect(expr);
        }

        const argResults = expr.args.map((a) => this.resolve(a));
        const signature = matchSignature(entry, argResults, expr);
        if (!signature) {
            const expected = entry.signatures
                .map((s) => describeSignature(s))
                .join(" | ");
            throw new TypeErrorDSLError(
                `no signature of ${entry.name}() matches (${argResults.map((r) => r.type).join(", ")}); expected ${expected}`,
                expr.position,
            );
        }

        const ctx = {
            desugar: (e) => this.resolve(e).def,
            numeric: (e) => this.resolve(e).def,
            point: (e) => {
                const r = this.resolve(e);
                if (r.type !== Type.POINT) {
                    throw new TypeErrorDSLError(
                        `argument of ${entry.name}() must be a Point, got ${r.type}`,
                        e.position,
                    );
                }
                return r.def;
            },
            checkIndex: (e) => this.checkIntersectionIndex(e),
        };

        const def = signature.build(expr.args, ctx);
        return { type: signature.returns, def };
    }

    resolveIntersect(expr) {
        // §25 matrix: Line/Segment/Circle × Line/Segment/Circle
        const MATRIX = new Set([Type.LINE, Type.SEGMENT, Type.CIRCLE]);
        if (expr.args.length < 2 || expr.args.length > 3) {
            throw new ArgumentErrorDSLError(
                `intersect() takes 2 or 3 arguments, got ${expr.args.length}`,
                expr.position,
            );
        }
        const first = this.resolve(expr.args[0]);
        const second = this.resolve(expr.args[1]);
        if (!MATRIX.has(first.type) || !MATRIX.has(second.type)) {
            throw new ArgumentErrorDSLError(
                `unsupported intersection: ${first.type} × ${second.type} (supported: Line, Segment, Circle pairs)`,
                expr.position,
            );
        }
        let index = null;
        if (expr.args.length === 3) {
            index = this.checkIntersectionIndex(expr.args[2]);
        }
        return {
            type: Type.POINT,
            def: {
                type: "IntersectionDefinition",
                first: first.def,
                second: second.def,
                index,
                position: expr.position,
            },
        };
    }

    checkIntersectionIndex(expr) {
        // §26: unsigned integer literal >= 1
        if (expr.type !== "NumberExpr" || !Number.isInteger(expr.value) || expr.value < 1) {
            throw new ArgumentErrorDSLError(
                "intersection index must be an unsigned integer literal >= 1",
                expr.position,
            );
        }
        return expr.value;
    }

    // --- styles / labels / marks ------------------------------------------------

    checkStyle(stmt) {
        const { selector } = stmt;
        if (!KIND_NAMES.has(selector) && !this.document.objects.has(selector)) {
            throw new NameErrorDSLError(
                `style selector "${selector}" does not match a type or an existing object`,
                stmt.position,
            );
        }
        const properties = new Map();
        for (const [key, valueNode] of stmt.properties) {
            const spec = STYLE_VALUE_KINDS[key];
            if (!spec) {
                throw new ArgumentErrorDSLError(
                    `unknown style property "${key}"`,
                    stmt.position,
                );
            }
            properties.set(key, this.styleValue(key, valueNode, spec));
        }
        if (!this.document.styles.has(selector)) {
            this.document.styles.set(selector, []);
        }
        this.document.styles.get(selector).push({ properties, position: stmt.position });
    }

    styleValue(key, node, spec) {
        const value = this.constValue(node, `style.${key}`);
        for (const kind of spec.kinds) {
            if (kind === "color" && typeof value === "string" && /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value)) {
                return value;
            }
            if (kind === "none" && value === "none") {
                return "none";
            }
            if (kind === "number" && typeof value === "number") {
                return value;
            }
            if (kind === "string" && typeof value === "string") {
                return value;
            }
            if (kind === "enum" && typeof value === "string" && spec.values.includes(value)) {
                return value;
            }
            if (kind === "number_list" && Array.isArray(value) && value.every((v) => typeof v === "number")) {
                return value;
            }
            if (kind === "point" && value && typeof value === "object" && "x" in value && "y" in value) {
                return value;
            }
        }
        throw new ArgumentErrorDSLError(
            `invalid value for style property "${key}": ${JSON.stringify(value)}`,
            node.position ?? null,
        );
    }

    checkLabel(label) {
        const target = label.target.name;
        const object = this.document.objects.get(target);
        if (!object || object.pending) {
            throw new NameErrorDSLError(`label references undefined point "${target}"`, label.position);
        }
        if (object.kind !== Type.POINT) {
            throw new TypeErrorDSLError(`label target must be a Point, "${target}" is a ${object.kind}`, label.position);
        }
        label.text = label.text ? label.text.value : target; // default text = point name (§37)
        label.offset = label.offset ? this.constPoint(label.offset, "label offset") : { x: 8, y: -8 }; // default (§35.1)
    }

    checkMark(mark) {
        const sig = MARK_SIGNATURES[mark.kind];
        if (!sig) {
            throw new ArgumentErrorDSLError(
                `unknown mark kind "${mark.kind}" (expected right_angle, equal_length, parallel, equal_angle)`,
                mark.position,
            );
        }
        const want = sig.points ?? sig.segments * 1;
        if (mark.args.length !== (sig.points ?? sig.segments)) {
            throw new ArgumentErrorDSLError(
                `mark ${mark.kind}() takes ${want} argument${want === 1 ? "" : "s"}, got ${mark.args.length}`,
                mark.position,
            );
        }
        const expectType = sig.points ? Type.POINT : Type.SEGMENT;
        mark.args = mark.args.map((arg, i) => {
            const r = this.resolve(arg);
            if (r.type !== expectType) {
                throw new TypeErrorDSLError(
                    `argument ${i + 1} of mark ${mark.kind}() must be a ${expectType}, got ${r.type}`,
                    arg.position,
                );
            }
            return r.def;
        });
    }

    // --- v0.2 constraints (spec_v0.2 §3, §4) ---------------------------------------

    canonicalizeConstraint(pending) {
        if (pending.type === "BetweennessStmt") {
            return this.canonicalizeBetweenness(pending);
        }
        if (pending.type === "ImplicitConstraint") {
            return this.canonicalizeImplicitLength(pending.stmt);
        }
        if (pending.op === "number_equality") {
            return this.canonicalizeNumberEquality(pending);
        }
        return this.canonicalizeLineLike(pending);
    }

    /** "A-B-C": collinear + strictly between (spec_v0.2 §3.2) */
    canonicalizeBetweenness(stmt) {
        const [first, middle, last] = [stmt.first, stmt.middle, stmt.last];
        const points = [first, middle, last].map((ref) => {
            const object = this.requireObject(ref.name, ref.position, `point "${ref.name}"`);
            if (object.kind !== Type.POINT) {
                throw new TypeErrorDSLError(
                    `betweenness operand "${ref.name}" must be a Point, got ${object.kind}`,
                    ref.position,
                );
            }
            return { type: "RefDefinition", name: ref.name, position: ref.position };
        });
        return {
            kind: "between",
            a: points[0],
            b: points[1],
            c: points[2],
            source: `${first.name}-${middle.name}-${last.name}`,
            position: stmt.position,
        };
    }

    /** "AB = <rhs>" desugars to length(AB) = <rhs as number> (spec_v0.2 §3.4) */
    canonicalizeImplicitLength(stmt) {
        const position = stmt.position;
        const segRef = { type: "SegmentRefExpr", from: stmt.name[0], to: stmt.name[1], position };
        const lhs = this.resolve(segRef); // Segment by construction
        const rhs = this.resolveNumericSide(stmt.expression, "right");
        return {
            kind: "number_equality",
            lhs: { type: "LengthCall", target: lhs.def, position },
            rhs: rhs.def,
            source: `${stmt.name} = ${describeExpr(stmt.expression)}`,
            position,
        };
    }

    canonicalizeNumberEquality(stmt) {
        const lhs = this.resolveNumericSide(stmt.lhs, "left");
        const rhs = this.resolveNumericSide(stmt.rhs, "right");
        return {
            kind: "number_equality",
            lhs: lhs.def,
            rhs: rhs.def,
            source: `${describeExpr(stmt.lhs)} = ${describeExpr(stmt.rhs)}`,
            position: stmt.position,
        };
    }

    canonicalizeLineLike(stmt) {
        const first = this.resolveLineSide(stmt.lhs, stmt.op);
        const second = this.resolveLineSide(stmt.rhs, stmt.op);
        const symbol = stmt.op === "parallel" ? "//" : "_|_";
        return {
            kind: stmt.op,
            first: first.def,
            second: second.def,
            source: `${describeExpr(stmt.lhs)} ${symbol} ${describeExpr(stmt.rhs)}`,
            position: stmt.position,
        };
    }

    /** Line/Segment/Ray operand (plan D5); everything else is a TypeError */
    resolveLineSide(expr, op) {
        const result = this.resolve(expr);
        if (!LINE_LIKE_TYPES.has(result.type)) {
            const symbol = op === "parallel" ? "//" : "_|_";
            throw new TypeErrorDSLError(
                `operand of "${symbol}" must be a Line, Segment or Ray, got ${result.type}`,
                expr.position,
            );
        }
        return result;
    }

    /** Number or Segment operand (Segment wraps in length()); spec_v0.2 §3.4 */
    resolveNumericSide(expr, side) {
        const result = this.resolve(expr);
        if (result.type === Type.NUMBER) {
            return result;
        }
        if (result.type === Type.SEGMENT) {
            return { def: { type: "LengthCall", target: result.def, position: expr.position } };
        }
        throw new TypeErrorDSLError(
            `${side} side of a number constraint must be a number expression or a segment reference, got ${result.type}`,
            expr.position,
        );
    }

    // --- constants ----------------------------------------------------------------

    constNumber(node, what) {
        const value = this.constValue(node, what);
        if (typeof value !== "number") {
            throw new ArgumentErrorDSLError(`${what} must be a number`, node.position ?? null);
        }
        return value;
    }

    constPoint(node, what) {
        if (node.type !== "PointLiteralExpr") {
            throw new ArgumentErrorDSLError(`${what} must be a point literal like (8, -8)`, node.position ?? null);
        }
        return {
            x: this.constNumber(node.x, `${what} x`),
            y: this.constNumber(node.y, `${what} y`),
        };
    }

    /** Evaluate a constant expression (numbers, strings, colors, lists, point literals). */
    constValue(node, what) {
        switch (node.type) {
            case "NumberExpr":
                return node.value;
            case "StringExpr":
                return node.value;
            case "ColorExpr":
                return node.value;
            case "UnaryExpr":
                return -this.constValue(node.operand, what);
            case "BinaryExpr": {
                const l = this.constValue(node.left, what);
                const r = this.constValue(node.right, what);
                if (typeof l !== "number" || typeof r !== "number") {
                    throw new ArgumentErrorDSLError(`${what} must be a constant`, node.position ?? null);
                }
                switch (node.operator) {
                    case "+": return l + r;
                    case "-": return l - r;
                    case "*": return l * r;
                    case "/": return l / r;
                    case "^": return l ** r;
                    default:
                        throw new ArgumentErrorDSLError(`${what}: unknown operator`, node.position ?? null);
                }
            }
            case "PointLiteralExpr":
                return {
                    x: this.constValue(node.x, what),
                    y: this.constValue(node.y, what),
                };
            default:
                if (Array.isArray(node)) {
                    return node.map((n) => this.constValue(n, what));
                }
                throw new ArgumentErrorDSLError(
                    `${what}: only literal values are allowed here`,
                    node.position ?? null,
                );
        }
    }

    // --- dependency extraction -------------------------------------------------------

    collectDeps(node, out = new Set()) {
        if (node == null) return [];
        walk(node, out);
        return [...out];

        function walk(n, acc) {
            if (n == null || typeof n !== "object") return;
            if (Array.isArray(n)) {
                for (const item of n) walk(item, acc);
                return;
            }
            switch (n.type) {
                case "RefDefinition":
                    acc.add(n.name);
                    return;
                case "PointRefExpr":
                    acc.add(n.name);
                    return;
                case "SegmentRefExpr":
                    acc.add(n.from);
                    acc.add(n.to);
                    return;
                case "PolygonRefExpr":
                    for (const p of n.points) acc.add(p);
                    return;
                case "IdentifierExpr":
                    acc.add(n.name);
                    return;
                default:
                    for (const key of Object.keys(n)) {
                        if (key === "type" || key === "position") continue;
                        walk(n[key], acc);
                    }
            }
        }
    }
}

/** canonical object name for a hide target */
function hideTargetName(target) {
    switch (target.type) {
        case "PointRefExpr":
        case "IdentifierExpr":
            return target.name;
        case "SegmentRefExpr":
            return `${target.from}${target.to}`;
        case "PolygonRefExpr":
            return target.points.join("");
        default:
            return null;
    }
}

/** RHS forms that make "AB = ..." a constraint instead of a §59 NameError (plan D7) */
function isConstraintRhs(expr) {
    switch (expr.type) {
        case "SegmentRefExpr":
        case "NumberExpr":
        case "UnaryExpr":
        case "BinaryExpr":
            return true;
        case "CallExpr":
            return MEASUREMENT_FUNCTIONS.has(expr.name);
        default:
            return false;
    }
}

/** human-readable expression reconstruction for constraint messages */
function describeExpr(expr) {
    switch (expr.type) {
        case "PointRefExpr": return expr.name;
        case "SegmentRefExpr": return `${expr.from}${expr.to}`;
        case "PolygonRefExpr": return expr.points.join("");
        case "IdentifierExpr": return expr.name;
        case "NumberExpr": return String(expr.value);
        case "UnaryExpr": return `-${describeExpr(expr.operand)}`;
        case "BinaryExpr": return `${describeExpr(expr.left)} ${expr.operator} ${describeExpr(expr.right)}`;
        case "CallExpr": return `${expr.name}(${expr.args.map(describeExpr).join(", ")})`;
        default: return expr.type;
    }
}

function matchSignature(entry, argResults, expr) {
    for (const sig of entry.signatures) {
        if (signatureMatches(sig, argResults)) {
            return sig;
        }
    }
    return null;
}

function signatureMatches(sig, argResults) {
    const specs = sig.args;
    const restSpec = specs.length > 0 && typeof specs[specs.length - 1] === "object" && !Array.isArray(specs[specs.length - 1])
        ? specs[specs.length - 1]
        : null;
    const fixed = restSpec ? specs.slice(0, -1) : specs;

    if (restSpec) {
        if (argResults.length < restSpec.min + fixed.length) return false;
    } else if (argResults.length !== fixed.length) {
        return false;
    }

    for (let i = 0; i < fixed.length; i++) {
        if (!typeMatchesSpec(fixed[i], argResults[i].type)) return false;
    }
    if (restSpec) {
        for (let i = fixed.length; i < argResults.length; i++) {
            if (!typeMatchesSpec(restSpec.rest, argResults[i].type)) return false;
        }
    }
    return true;
}

function typeMatchesSpec(spec, type) {
    if (Array.isArray(spec)) return spec.includes(type);
    if (spec === "Geometry") return isGeometry(type);
    return spec === type;
}

function describeSignature(sig) {
    return "(" + sig.args.map((s) => describeSpec(s)).join(", ") + ")";
}

function describeSpec(spec) {
    if (Array.isArray(spec)) return spec.join(" | ");
    if (typeof spec === "object") return `...${spec.rest.join(" | ")}${spec.min > 0 ? ` (min ${spec.min + 0})` : ""}`;
    return spec;
}
