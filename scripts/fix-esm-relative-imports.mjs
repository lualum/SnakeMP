import fs from "node:fs";
import path from "node:path";

const targetDir = process.argv[2];
if (!targetDir) {
    console.error("Usage: node scripts/fix-esm-relative-imports.mjs <dir>");
    process.exit(2);
}

function isBareOrHasExtension(spec) {
    if (!spec.startsWith(".")) return true;
    const lastSegment = spec.split("/").pop() ?? "";
    return lastSegment.includes(".");
}

function* walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* walk(fullPath);
        else yield fullPath;
    }
}

const jsFiles = [...walk(targetDir)].filter((f) => f.endsWith(".js"));
let changedCount = 0;

for (const filePath of jsFiles) {
    const original = fs.readFileSync(filePath, "utf8");
    let next = original;

    // Handles: import ... from "./x"; export ... from "./x"; import "./x";
    next = next.replace(
        /(\bfrom\s+["'])(\.[^"'#?]+)(["'])|(\bimport\s+["'])(\.[^"'#?]+)(["'])/g,
        (match, fromPrefix, fromSpec, fromQuote, importPrefix, importSpec, importQuote) => {
            const prefix = fromPrefix ?? importPrefix;
            const spec = fromSpec ?? importSpec;
            const quote = fromQuote ?? importQuote;

            if (!prefix || !spec || !quote) return match;
            if (isBareOrHasExtension(spec)) return `${prefix}${spec}${quote}`;

            const resolved = path.resolve(path.dirname(filePath), spec);
            if (fs.existsSync(`${resolved}.js`)) return `${prefix}${spec}.js${quote}`;
            if (fs.existsSync(path.join(resolved, "index.js")))
                return `${prefix}${spec}/index.js${quote}`;

            return `${prefix}${spec}${quote}`;
        },
    );

    if (next !== original) {
        fs.writeFileSync(filePath, next);
        changedCount++;
    }
}

if (changedCount > 0) {
    console.log(`Fixed ESM relative import extensions in ${changedCount} file(s) under ${targetDir}`);
}
