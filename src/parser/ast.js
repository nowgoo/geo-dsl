/**
 * AST node definitions (spec §15).
 *
 * The AST records the structure the user wrote.
 * No geometry computation happens here.
 */

export class Pos {
    constructor(offset, line, column) {
        this.offset = offset;
        this.line = line;
        this.column = column;
    }
}

// --- expressions ------------------------------------------------------------

export class NumberExpr {
    constructor(value, position) {
        this.type = "NumberExpr";
        this.value = value;
        this.position = position;
    }
}

export class StringExpr {
    constructor(value, position) {
        this.type = "StringExpr";
        this.value = value;
        this.position = position;
    }
}

export class ColorExpr {
    constructor(value, position) {
        this.type = "ColorExpr";
        this.value = value; // "#rgb" / "#rrggbb"
        this.position = position;
    }
}

export class IdentifierExpr {
    constructor(name, position) {
        this.type = "IdentifierExpr";
        this.name = name;
        this.position = position;
    }
}

export class PointLiteralExpr {
    constructor(x, y, position) {
        this.type = "PointLiteralExpr";
        this.x = x;
        this.y = y;
        this.position = position;
    }
}

// --- implicit references ------------------------------------------------------

export class PointRefExpr {
    constructor(name, position) {
        this.type = "PointRefExpr";
        this.name = name;
        this.position = position;
    }
}

export class SegmentRefExpr {
    constructor(from, to, position) {
        this.type = "SegmentRefExpr";
        this.from = from;
        this.to = to;
        this.position = position;
    }
}

export class PolygonRefExpr {
    constructor(points, position) {
        this.type = "PolygonRefExpr";
        this.points = points;
        this.position = position;
    }
}

export class CallExpr {
    constructor(name, args, position) {
        this.type = "CallExpr";
        this.name = name;
        this.args = args;
        this.position = position;
    }
}

export class UnaryExpr {
    constructor(operator, operand, position) {
        this.type = "UnaryExpr";
        this.operator = operator;
        this.operand = operand;
        this.position = position;
    }
}

export class BinaryExpr {
    constructor(operator, left, right, position) {
        this.type = "BinaryExpr";
        this.operator = operator;
        this.left = left;
        this.right = right;
        this.position = position;
    }
}

// --- statements ---------------------------------------------------------------

export class AssignmentStmt {
    constructor(name, expression, position) {
        this.type = "AssignmentStmt";
        this.name = name;
        this.expression = expression;
        this.position = position;
    }
}

export class GeometryRefStmt {
    constructor(reference, position) {
        this.type = "GeometryRefStmt";
        this.reference = reference; // PointRefExpr | SegmentRefExpr | PolygonRefExpr
        this.position = position;
    }
}

// --- v0.2 constraint statements (spec_v0.2 §2, §3) ----------------------------

export class ConstraintStmt {
    /**
     * @param {string} op "parallel" | "perpendicular" | "number_equality"
     * @param {*} lhs reference or measurement expression
     * @param {*} rhs reference or measurement expression
     */
    constructor(op, lhs, rhs, position) {
        this.type = "ConstraintStmt";
        this.op = op;
        this.lhs = lhs;
        this.rhs = rhs;
        this.position = position;
    }
}

export class BetweennessStmt {
    constructor(first, middle, last, position) {
        this.type = "BetweennessStmt";
        this.first = first; // PointRefExpr
        this.middle = middle; // PointRefExpr, must lie between first and last
        this.last = last; // PointRefExpr
        this.position = position;
    }
}

export class UnknownAssignmentStmt {
    constructor(name, position) {
        this.type = "UnknownAssignmentStmt";
        this.name = name; // single uppercase point name
        this.position = position;
    }
}

export class CanvasStmt {
    constructor(properties, position) {
        this.type = "CanvasStmt";
        this.properties = properties; // { width, height, padding } -> expr | null
        this.position = position;
    }
}

export class StyleStmt {
    constructor(selector, properties, position) {
        this.type = "StyleStmt";
        this.selector = selector; // string (type keyword or object name)
        this.properties = properties; // Map<string, expr>
        this.position = position;
    }
}

export class LabelStmt {
    constructor(target, text, offset, position) {
        this.type = "LabelStmt";
        this.target = target; // PointRefExpr
        this.text = text; // StringExpr | null
        this.offset = offset; // PointLiteralExpr | null
        this.position = position;
    }
}

export class MarkStmt {
    constructor(kind, args, position) {
        this.type = "MarkStmt";
        this.kind = kind; // "right_angle" | "equal_length" | "parallel" | "equal_angle"
        this.args = args; // array of reference expressions
        this.position = position;
    }
}

export class HideStmt {
    constructor(targets, position) {
        this.type = "HideStmt";
        this.targets = targets; // array of PointRefExpr | SegmentRefExpr | PolygonRefExpr | IdentifierExpr
        this.position = position;
    }
}

export class Program {
    constructor(statements) {
        this.type = "Program";
        this.statements = statements;
    }
}
