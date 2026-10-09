/**
 * Dependency graph: extraction, cycle detection, topological sort (spec §29).
 *
 * Deterministic: traversal follows document definition order (plan D7).
 */

import { DependencyErrorDSLError } from "../errors.js";

/**
 * Build adjacency + reverse edges from object dependencies.
 * Only edges to objects present in the document are kept.
 */
export function buildDependencyGraph(objects) {
    const names = new Set(objects.keys());
    const edges = new Map(); // name -> Set of dependency names
    for (const [name, object] of objects) {
        const deps = new Set();
        for (const dep of object.dependencies ?? []) {
            if (names.has(dep) && dep !== name) {
                deps.add(dep);
            }
        }
        edges.set(name, deps);
    }
    return edges;
}

/**
 * Detect cycles via DFS; throw DependencyError on the first cycle found.
 */
export function detectCycles(edges) {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map();
    for (const name of edges.keys()) color.set(name, WHITE);

    const stack = [];
    const visit = (name) => {
        color.set(name, GRAY);
        stack.push(name);
        for (const dep of edges.get(name) ?? []) {
            const c = color.get(dep);
            if (c === GRAY) {
                const cycleStart = stack.indexOf(dep);
                const cycle = [...stack.slice(cycleStart), dep];
                throw new DependencyErrorDSLError(
                    `cyclic dependency detected: ${cycle.join(" -> ")}`,
                );
            }
            if (c === WHITE) {
                visit(dep);
            }
        }
        stack.pop();
        color.set(name, BLACK);
    };

    for (const name of edges.keys()) {
        if (color.get(name) === WHITE) visit(name);
    }
}

/**
 * Topological order, deterministic: visit objects in document order,
 * dependencies first (DFS post-order). Returns array of names.
 */
export function topologicalOrder(objects, edges) {
    const order = [];
    const visited = new Set();

    const visit = (name) => {
        if (visited.has(name)) return;
        visited.add(name);
        for (const dep of edges.get(name) ?? []) {
            visit(dep);
        }
        order.push(name);
    };

    for (const name of objects.keys()) {
        visit(name);
    }
    return order;
}
