import {optimize} from "oniguruma-parser/optimizer";
import {globSync} from "glob";
import {readFileSync, writeFileSync} from "fs";
import platform from "./src/platform.tmLanguage.json" with {type: "json"};
import toRegExp from "./to-regex.js";

let {parse, stringify} = JSON;
let {isArray} = Array;
let {keys, values, fromEntries, entries, groupBy} = Object;

let sortKeys = obj =>
  isArray(obj) ? obj.map(sortKeys)
  : obj && typeof obj == "object" ?
    fromEntries(
      keys(obj)
        .sort((a, b) => a.localeCompare(b))
        .map(k => [k, sortKeys(obj[k])]),
    )
  : obj;

let pluralize = word => {
  word = word.toLowerCase().trim();
  return (
    /(?:[sxz]|[cs]h)$/.test(word) ? word + "es"
    : /y$/.test(word) ? word.slice(0, -1) + "ies"
    : word + "s"
  );
};

// Sort the patterns alphabetically for each library and then sort the libraries alphabetically.
let repositoryKeys = [
  "function",
  "type",
  "class",
  "interface",
  "module",
  "enum",
  "namespace",
  "variable",
  "constant",
  "property",
  "parameter",
];

//  === C/C++ STANDARD LIBRARY ===

// Recursively traverse the Platform grammar.

let platforms = [];

let traversePlatform = node => {
  if (node.patterns)
    for (let pattern of node.patterns) {
      if (pattern.match) {
        if (pattern.captures) pattern.name = pattern.captures["2"]?.name || pattern.name;
        let name = (
          pattern.name.startsWith("invalid.") ?
            pattern.name.replace(/^.+(?=support)/, "")
          : pattern.name).replace(/\.c$/, ".ruko");
        let key = name.split(".")[1];

        // Turn all non-capturing groups into capturing to save some bytes
        // and make the patterns more readable, since we don't need capturing
        // groups in this case.
        let match = pattern.match.split("(?:").join("(");

        platforms.push({
          match,
          name:
            ["class", "function", "type"].includes(key) ?
              `support.${key}.c.ruko`
            : `entity.name.${key}.c.ruko`,
          key,
        });
      }
      pattern.patterns && traversePlatform(pattern);
    }
};

// Traverse the Platform grammar and extract the patterns into a flat array,
// then group them by their key (e.g. "function", "class", etc.) and sort them
// alphabetically by name.

traversePlatform(platform);
platforms = fromEntries(
  entries(groupBy(platforms, p => p.key)).map(([key, patterns]) => [
    `stdlib-${pluralize(key)}`,
    patterns.sort((a, b) => a.name.localeCompare(b.name)),
  ]),
);

// === STANDARD LIBRARY ===

let stdlibDir = "C:/Users/Admin/Ruko/DefinitelyTyped-master/types/**/*.d.ts";
let stdlibFiles = globSync(stdlibDir, {absolute: true})
  .filter(path => !/\/node_modules\//.test(path))
  .reverse();
console.log(`Found ${stdlibFiles.length} standard library files.`);

let libraries = stdlibFiles
  .map(path => {
    // Read the file content and find all declared names
    let content = readFileSync(path, "utf8");
    let name = path.match(/(?<=types[\\/])(.+?)(?=[\\/]|\.d\.ts$)/)[1];

    // Look for first word in name, which is usually the library name, but may be more specific if there
    // are multiple libraries in the same file (e.g. "react" and "react-dom" in "react/index.d.ts").
    // Replace any non-alphanumeric characters with a single dash and convert to lowercase to get the library name.
    // For example, "react" and "react-dom" would both become "react", while "node" would remain as "node".

    let library = name.match(/^\w+/)[0].replace(/[-_]+/g, "-").toLowerCase();

    // Group them according to their declaration type and remove duplicates.

    let patterns = {
      class: [...new Set(content.matchAll(/class\s+(\w+)/gm))].map(m => m[1]),
      interface: [...new Set(content.matchAll(/interface\s+(\w+)/gm))].map(m => m[1]),
      function: [...new Set(content.matchAll(/function\s+(\w+)/gm))].map(m => m[1]),
      type: [...new Set(content.matchAll(/type\s+(\w+)/gm))].map(m => m[1]),
      variable: [...new Set(content.matchAll(/(?:var|let)\s+(\w+)/gm))].map(m => m[1]),
      constant: [...new Set(content.matchAll(/const\s+(\w+)/gm))].map(m => m[1]),
      enum: [...new Set(content.matchAll(/enum\s+(\w+)/gm))].map(m => m[1]),
      namespace: [...new Set(content.matchAll(/namespace\s+(\w+)/gm))].map(m => m[1]),
      module: [...new Set(content.matchAll(/module\s+(\w+)/gm))].map(m => m[1]),
      property: [...new Set(content.matchAll(/\b(\w+)(?=\s*[:=])/gm))].map(m => m[1]),

      // Look for function parameters, which may be contained within nested
      // brackets/braces/parentheses, and extract them into a separate pattern.
      // Use recursive regex patterns to handle nested structures, and split the
      // parameters by commas or pipes to get individual parameter names.

      parameter: [
        ...new Set(content.matchAll(/(?:function\s+\w+\s*\(([^)]*)\)|\(([^)]*)\)\s*=>)/gm)),
      ].flatMap(m => {
        let params = m[1] || m[2];
        if (!params) return [];

        // Remove any default values or type annotations from the parameters, and
        // split them by commas or pipes to get individual parameter names.

        return params
          .split(/[,|]/)
          .map(p =>
            p
              .trim()
              .replace(/=[^,|]+/, "")
              .replace(/:\s*[^,|]+/, ""),
          )
          .filter(p => /^\w+$/.test(p));
      }),
    };

    patterns = fromEntries(
      entries(patterns).map(([key, value]) => [
        key,
        [...new Set(value)].map(name => name.match(/\w+/)?.[0]).filter(Boolean),
      ]),
    );

    return {name: library, patterns};
  })

  // If library is the same, combine it with the names found in the current file.
  // otherwise, push the current library and start a new one.

  .reduce((acc, lib) => {
    let existing = acc.find(l => l.name == lib.name);
    if (existing) {
      for (let key in lib.patterns)
        existing.patterns[key] = [
          ...new Set([...(existing.patterns[key] || []), ...(lib.patterns[key] || [])]),
        ];
    } else acc.push(lib);
    return acc;
  }, []);

// Remove any empty patterns and convert the arrays of names into
// optimized regex patterns using oniguruma-parser/optimizer.

for (let lib of libraries)
  for (let key in lib.patterns) {
    if (lib.patterns[key].length > 0) {
      let pattern = lib.patterns[key].filter(Boolean).join("|");

      let match;
      try {
        console.log(`Optimizing pattern for ${key}.${lib.name} with toRegExp`);
        match = toRegExp(lib.patterns[key]).source.split("(?:").join("(");
        match = `\\b(${match})\\b`;
      } catch {
        console.log(`Fallback to default pattern for ${key}.${lib.name}`);
        match = `\\b(${pattern})\\b`;
      }

      lib.patterns[key] = {
        match,
        name:
          ["class", "function", "type"].includes(key) ?
            `support.${key}.${lib.name}.ruko`
          : `entity.name.${key}.${lib.name}.ruko`,
        key,
      };
    } else delete lib.patterns[key];
  }

// Transpose patterns so that they are grouped by type instead of by library.
// For example, all function patterns from all libraries would be grouped
// together under "stdlib-functions", all class patterns under "stdlib-classes", etc.

libraries = groupBy(
  libraries.flatMap(lib => values(lib.patterns).map(pattern => ({...pattern, library: lib.name}))),
  p => "stdlib-" + pluralize(p.key),
);

// Combine both the C/C++ standard library patterns and the standard library patterns
// into a single repository object, sorted alphabetically by key and then by pattern name.

let grammar = {
  comment:
    "This file was generated using data from https://github.com/DefinitelyTyped/DefinitelyTyped",
  name: "Ruko Standard Library",
  scopeName: "source.rk.std",
  patterns: repositoryKeys.map(key => ({include: `#stdlib-${pluralize(key)}`})),
  repository: fromEntries(
    repositoryKeys.map(key => [
      `stdlib-${pluralize(key)}`,
      {
        patterns: [
          ...(libraries[`stdlib-${pluralize(key)}`] || []),
          ...(platforms[`stdlib-${pluralize(key)}`] || []),
        ].map(x => {
          delete x.library;
          return x;
        }),
      },
    ]),
  ),
};

// Remove "comment" and "define" keys from all sub-objects in repository
grammar = parse(
  stringify(grammar, (key, value) => {
    switch (typeof value) {
      case "object":
        delete value.key || delete value.comment || delete value.define || delete value.library;
        break;
      case "string":
        if (key == "match") {
          // Optimize the regex pattern using oniguruma-parser/optimizer with all available
          // optimizations enabled, and expose the anchors to prevent ReDoS attacks.
          value = optimize(value, {
            override: {
              alternationToClass: true,
              extractPrefix: true,
              extractPrefix2: true,
              extractSuffix: true,
              optionalize: true,
              mergeRanges: true,
              unnestUselessClasses: true,
              unwrapNegationWrappers: true,
              unwrapUselessClasses: true,
              useShorthands: true,
            },
          }).pattern;
        }
    }
    return value;
  }),
);

grammar.information_for_contributors = [
  "This file is generated from ruko.stdlib.tmLanguage.yaml using update-stdlib.js.",
  "To make changes to the standard library patterns, edit ruko.stdlib.tmLanguage.yaml and run update-stdlib.js.",
  "The repository field is sorted alphabetically, and the patterns within each repository entry are also sorted alphabetically.",
  "All entries in the repository are sorted alphabetically, and the patterns are also sorted alphabetically. This makes it easier to find and modify specific patterns, and helps maintain a consistent structure in the grammar file.",
];
grammar = stringify(sortKeys(grammar));

writeFileSync("C:/Users/Admin/Dropbox/Ruko Language/ruko-stdlib.tmLanguage.json", grammar);
