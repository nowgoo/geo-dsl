/**
 * Geometry IR document / objects (spec §17, §19).
 */

export class GeometryObject {
    constructor({ id, name, kind, definition, dependencies = [], position = null }) {
        this.id = id;
        this.name = name;
        this.kind = kind; // "Point" | "Line" | ... (§17 object kinds)
        this.definition = definition;
        this.dependencies = dependencies; // referenced object names
        this.position = position; // source position for runtime error reporting
        this.geometry = null; // filled by evaluation
        this.style = null; // resolved style overrides
    }
}

export class Canvas {
    constructor() {
        this.width = 600;
        this.height = 400;
        this.padding = 20;
        this.explicit = new Set(); // which of width/height/padding were set in DSL
    }
}

export class Document {
    constructor() {
        this.objects = new Map(); // name -> GeometryObject (insertion = document order)
        this.styles = new Map(); // selector -> [{ properties: Map, position }]
        this.canvas = new Canvas();
        this.labels = []; // { target, text, offset, position, resolved }
        this.marks = []; // { kind, args, position, resolved }
        // v0.2 (spec_v0.2 §5)
        this.constraints = []; // canonical constraint nodes (see checkConstraints)
        this.unknowns = new Set(); // point names declared with "C = ?"
    }
}
