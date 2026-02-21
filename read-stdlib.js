import {globSync} from "glob";
import {readFileSync, writeFileSync} from "fs";
import platform from "./src/platform.tmLanguage.json" with {type: "json"};
import toRegExp from "./to-regex.js";
import genex from "genex";

let {parse, stringify} = JSON;
let {isArray} = Array;
let {keys, values, fromEntries, entries, groupBy} = Object;

let chunk = (array, size) =>
  array.reduce((result, item, index) => {
    if (index % size === 0) result.push([]);
    result[result.length - 1].push(item);
    return result;
  }, []);

let pluralize = word => {
  word = word.toLowerCase().trim();
  return (
    /(?:[sxz]|[cs]h)$/.test(word) ? word + "es"
    : /y$/.test(word) ? word.slice(0, -1) + "ies"
    : word + "s"
  );
};

// A convention is a set of rules that define how to name and organize symbols in a programming language. It can be used to ensure consistency and readability in code. In this case, we will define a convention for naming symbols in the Ruko language based on the standard libraries we have analyzed.

let conventions = {
  pascal: name => /^[A-Z][a-zA-Z0-9]*$/.test(name),
  camel: name => /^[a-z][a-zA-Z0-9]*$/.test(name),
  upper: name => /^[A-Z][A-Z0-9_]*$/.test(name),
  lower: name => /^[a-z][a-z0-9_]*$/.test(name),
  snake: name => /^[a-z][a-z0-9_]*$/.test(name),
  kebab: name => /^[a-z][a-z0-9-]*$/.test(name),
  screamingSnake: name => /^[A-Z][A-Z0-9_]*$/.test(name),
  screamingKebab: name => /^[A-Z][A-Z0-9-]*$/.test(name),
};

let symbolSet = [
  "class",
  "interface",
  "enum",
  "namespace",
  "module",
  "function",
  "type",
  "variable",
  "constant",
  "property",
].reduce((result, key) => ((result[key] = new Set()), result), {});

// === C/C++ STANDARD LIBRARY ===

let traversePlatform = node => {
  if (node.patterns)
    for (let pattern of node.patterns) {
      if (pattern.match) {
        if (pattern.captures) pattern.name = pattern.captures[2]?.name || pattern.name;
        let name = (
          /^invalid\./.test(pattern.name) ?
            pattern.name.replace(/^.+(?=support)/, "")
          : pattern.name).replace(/\.c$/, ".ruko");
        let key = name.split(".")[1];
        let symbols = genex(pattern.match.replace(/^\\b|\\b$/g, "")).generate();
        symbolSet[key] = symbolSet[key].union(new Set(symbols));
      }
      pattern.patterns && traversePlatform(pattern);
    }
};

traversePlatform(platform);

// === GODOT ENGINE STANDARD LIBRARY ===

import gdScriptClasses from "./gdscript-classes.json" with {type: "json"};
values(gdScriptClasses).forEach(
  symbols => (symbolSet.class = symbolSet.class.union(new Set(symbols))),
);

// === NODE.JS STANDARD LIBRARY ===

let stdlibDir = "C:/Users/Admin/Ruko/DefinitelyTyped-master/types/**/*.ts";
let stdlibFiles = globSync(stdlibDir, {absolute: true})
  .filter(path => !/\/node_modules\//.test(path))
  .reverse();
console.log(`Found ${stdlibFiles.length} Node.js standard library files.`);

stdlibFiles.forEach(path => {
  let content = readFileSync(path, "utf8");
  let name = path.match(/(?<=types[\\/])(.+?)(?=[\\/]|\.ts$)/)[1];

  let patterns = {
    class: /\bclass\b\s+\b([a-zA-Z_]\w*)\b/gm, // classes
    interface: /\binterface\b\s+\b([a-zA-Z_]\w*)\b/gm, // interfaces
    enum: /\benum\b\s+\b([a-zA-Z_]\w*)\b/gm, // enums
    namespace: /\bnamespace\b\s+\b([a-zA-Z_]\w*)\b/gm, // namespaces
    module: /\bmodule\b\s+\b([a-zA-Z_]\w*)\b/gm, // modules
    function: /\s*\b([a-zA-Z_]\w*)\b\s*\(/gm, // functions and methods
    type: /\btype\b\s+\b([a-zA-Z_]\w*)\b/gm, // type aliases
    variable: /\b(?:var|let)\b\s+\b([a-zA-Z_]\w*)\b/gm, // variables with var or let
    constant: /\bconst\b\s*\b([a-zA-Z_]\w*)\b/gm, // constants with const
    property: /\b([a-zA-Z_]\w*)\b(?=\s*(\??:|=)\s*)/gm, // properties and variables with type annotations or initializers
  };

  patterns = fromEntries(
    entries(patterns).map(([key, value]) => [
      key,
      [...new Set(content.matchAll(value))]
        .map(([, name]) => name.match(/^\w+/)?.[0])
        .filter(Boolean),
    ]),
  );

  keys(patterns).forEach(key => {
    let symbols = patterns[key].filter(symbol => !symbolSet[key].has(symbol));
    symbolSet[key] = symbolSet[key].union(new Set(symbols));
  });
});

// group by type then by convention
let conventionGroups = fromEntries(
  entries(symbolSet).map(([type, symbols]) => [
    type,
    fromEntries(
      entries(conventions).map(([convention, validator]) => [
        convention,
        new Set([...symbols].filter(symbol => validator(symbol))),
      ]),
    ),
  ]),
);

writeFileSync(
  "C:/Users/Admin/Dropbox/Ruko Language/ruko-stdlib.json",
  stringify(conventionGroups, (_, value) => (value instanceof Set ? [...value] : value), 2),
);
