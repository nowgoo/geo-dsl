#!/usr/bin/env node
/**
 * CLI (spec §66, §67): geometry render input.geo [-o out.svg] [--width N] [--height N] [--padding N]
 *
 * Uses only Node.js built-ins. Core library stays browser-safe (§69).
 */

import fs from "node:fs";
import path from "node:path";
import { compile, renderSVG, formatError, DEFAULT_RUNTIME_URL } from "../src/index.js";

const USAGE = `geometry render input.geo [-o output.svg] [--width N] [--height N] [--padding N]
                           [--interactive] [--runtime-url URL]

Options:
  -o, --output <file>   write SVG to file instead of stdout
  --width <n>           override canvas width
  --height <n>          override canvas height
  --padding <n>         override canvas padding
  --interactive         emit an interactive figure (drag points, hover,
                        selection; needs the runtime module at --runtime-url)
  --runtime-url <url>   URL of the interactive runtime module
                        (default: ${DEFAULT_RUNTIME_URL})
  --inline              embed the runtime from --runtime-url (local file,
                        e.g. dist/geometry-dsl-runtime.js) into the SVG:
                        fully self-contained, opens from file://
  -h, --help            show this help
`;

function parseArgs(argv) {
    const options = { positional: [] };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        switch (arg) {
            case "-h":
            case "--help":
                options.help = true;
                break;
            case "-o":
            case "--output":
                options.output = requireValue(argv, ++i, arg);
                break;
            case "--width":
                options.width = requireNumber(argv, ++i, arg);
                break;
            case "--height":
                options.height = requireNumber(argv, ++i, arg);
                break;
            case "--padding":
                options.padding = requireNumber(argv, ++i, arg);
                break;
            case "--interactive":
                options.interactive = true;
                break;
            case "--runtime-url":
                options.runtimeUrl = requireValue(argv, ++i, arg);
                break;
            case "--inline":
                options.inline = true;
                break;
            default:
                if (arg.startsWith("-")) {
                    throw new Error(`unknown option "${arg}"`);
                }
                options.positional.push(arg);
        }
    }
    return options;
}

function requireValue(argv, i, flag) {
    if (i >= argv.length) throw new Error(`option ${flag} requires a value`);
    return argv[i];
}

function requireNumber(argv, i, flag) {
    const raw = requireValue(argv, i, flag);
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`option ${flag} requires a non-negative number, got "${raw}"`);
    }
    return value;
}

/** --inline: load the runtime source from a local file path */
function readRuntimeSource(url) {
    try {
        return fs.readFileSync(url, "utf8");
    } catch (error) {
        throw new Error(
            `--inline requires --runtime-url to be a readable local file, got "${url}": ${error.message}`,
        );
    }
}

function main() {
    const argv = process.argv.slice(2);
    const command = argv[0];

    if (!command || command === "-h" || command === "--help" || command === "help") {
        process.stdout.write(USAGE);
        process.exit(command ? 0 : 1);
    }
    if (command !== "render") {
        process.stderr.write(`geometry: unknown command "${command}"\n\n${USAGE}`);
        process.exit(1);
    }

    const options = parseArgs(argv.slice(1));

    if (options.positional.length !== 1) {
        process.stderr.write("geometry render: exactly one input file is required\n\n" + USAGE);
        process.exit(1);
    }

    const input = options.positional[0];
    let source;
    try {
        source = fs.readFileSync(input, "utf8");
    } catch (error) {
        process.stderr.write(`geometry: cannot read ${input}: ${error.message}\n`);
        process.exit(1);
    }

    let svg;
    try {
        const document = compile(source, {
            width: options.width,
            height: options.height,
            padding: options.padding,
        });
        const interactiveOptions = options.interactive
            ? {
                  interactive: {
                      runtimeUrl: options.runtimeUrl,
                      ...(options.inline
                          ? { runtimeSource: readRuntimeSource(options.runtimeUrl) }
                          : {}),
                  },
              }
            : {};
        svg = renderSVG(document, interactiveOptions);
    } catch (error) {
        process.stderr.write(formatError(error, source) + "\n");
        process.exit(1);
    }

    if (options.output) {
        fs.mkdirSync(path.dirname(options.output), { recursive: true });
        fs.writeFileSync(options.output, svg);
        process.stdout.write(`wrote ${options.output}\n`);
    } else {
        process.stdout.write(svg + "\n");
    }
}

main();
