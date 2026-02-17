import {optimize} from "oniguruma-parser/optimizer";
import {globSync} from "glob";
import regexgen from "regexgen";

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  lstatSync,
  cpSync,
  copyFileSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "fs";

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

// === STANDARD LIBRARY ===
let stdlibDir = "C:/Users/Admin/Ruko/DefinitelyTyped-master/types/**/*.d.ts";
let stdlibFiles = globSync(stdlibDir, {absolute: true})
  .filter(path => !/\/node_modules\//.test(path))
  .reverse();
console.log(`Found ${stdlibFiles.length} standard library files.`);

let libraries = stdlibFiles
  .map(path => {
    // Read the file content and find all declared names
    // (classes, interfaces, functions, types, variables, constants, enums, namespaces, modules, parameters, properties)
    // Group them according to their declaration type and store them in a set to avoid duplicates.
    let content = readFileSync(path, "utf8");
    let name = path.match(/(?<=types[\\/])(.+?)(?=[\\/]|\.d\.ts$)/)[1];

    // look for first word in name, which is usually the library name,
    // but may be more specific if there are multiple files for the
    // same library (e.g. "react" and "react-dom").
    let library = name.match(/^\w+/)[0].replace(/[-_]+/g, "_").toLowerCase();

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
      parameter: [...new Set(content.matchAll(/function\s+\w+\s*\(([^)]*)\)/gm))]
        .flatMap(m => m[1].split(",").map(p => p.trim().split(":")[0].trim()))
        .filter(Boolean),
      property: [...new Set(content.matchAll(/\b(\w+)(?=\s*[:=])/gm))].map(m => m[1]),
    };

    // if library is the same, combine it with the names found in the current file.
    // otherwise, push the current library and start a new one.
    patterns = fromEntries(
      entries(patterns).map(([key, value]) => [
        key,
        [...new Set(value)].map(name => name.match(/\w+/)?.[0]).filter(Boolean),
      ]),
    );

    return {name: library, patterns};
  })
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

for (let lib of libraries)
  for (let key in lib.patterns) {
    if (lib.patterns[key].length > 0) {
      let pattern = lib.patterns[key].filter(Boolean).join("|");
      lib.patterns[key] = {
        match: `\\b(${pattern})\\b`,
        name:
          ["class", "function", "type"].includes(key) ?
            `support.${key}.${lib.name}.ruko`
          : `entity.name.${key}.${lib.name}.ruko`,
        key,
      };
    } else delete lib.patterns[key];
  }

let pluralize = word => {
  word = word.toLowerCase().trim();
  return (
    /(?:[sxz]|[cs]h)$/.test(word) ? word + "es"
    : /y$/.test(word) ? word.slice(0, -1) + "ies"
    : word + "s"
  );
};

// transpose patterns so that they are grouped by type instead of by library.
// this makes it easier to maintain and update the patterns, as well as to add new libraries.
let transposed = groupBy(
  libraries.flatMap(lib => values(lib.patterns).map(pattern => ({...pattern, library: lib.name}))),
  p => "stdlib-" + pluralize(p.key),
);

let grammar = {
  comment:
    "This file was generated using data from https://github.com/DefinitelyTyped/DefinitelyTyped",
  name: "Ruko Standard Library",
  scopeName: "source.rk.stdlib",
  patterns: repositoryKeys.map(key => ({include: `#stdlib-${pluralize(key)}`})),
  repository: fromEntries(
    repositoryKeys.map(key => [
      `stdlib-${pluralize(key)}`,
      {
        patterns:
          transposed[`stdlib-${pluralize(key)}`]?.map(({library, ...pattern}) => pattern) ?? [],
      },
    ]),
  ),
};

// remove "comment" and "define" keys from all sub-objects in repository
grammar = parse(
  stringify(grammar, (key, value) => {
    switch (typeof value) {
      case "object":
        delete value.key;
        break;
      case "string":
        if (key == "match") {
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
              useUnicodeAliases: true,
              useUnicodeProps: true,
              removeUselessFlags: true,
              exposeAnchors: true,
              removeEmptyGroups: true,
              unwrapUselessGroups: true,
              preventReDoS: true,
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
grammar = stringify(grammar);

writeFileSync("C:/Users/Admin/Dropbox/Ruko Language/ruko-stdlib.tmLanguage.json", grammar);
