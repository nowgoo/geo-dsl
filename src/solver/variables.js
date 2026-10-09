/**
 * Unknown-variable structure analysis (plan D8: fixed prefix evaluated once,
 * dependent subgraph re-evaluated per iteration).
 */

import { buildDependencyGraph, topologicalOrder } from "../engine/dependency.js";

/**
 * Partition document objects relative to the unknown points.
 *
 * @param {import("../ir/document.js").Document} document
 * @returns {{
 *   unknowns: string[],        // unknown point names, document order
 *   fixedNames: Set<string>,   // evaluated once, before solving
 *   dependentNames: Set<string>, // transitively depend on an unknown point
 *   dependentOrder: string[],  // dependents in topological (evaluation) order
 * }}
 */
export function analyzeUnknownStructure(document) {
    const edges = buildDependencyGraph(document.objects);
    const order = topologicalOrder(document.objects, edges); // dependencies first

    const unknowns = [...document.unknowns];
    const unknownSet = new Set(unknowns);
    const dependentNames = new Set();

    // topological order guarantees all dependencies of a node are classified first
    for (const name of order) {
        if (unknownSet.has(name)) continue;
        for (const dep of edges.get(name) ?? []) {
            if (unknownSet.has(dep) || dependentNames.has(dep)) {
                dependentNames.add(name);
                break;
            }
        }
    }

    const fixedNames = new Set(order.filter((n) => !unknownSet.has(n) && !dependentNames.has(n)));
    const dependentOrder = order.filter((n) => dependentNames.has(n));

    return { unknowns, fixedNames, dependentNames, dependentOrder };
}
