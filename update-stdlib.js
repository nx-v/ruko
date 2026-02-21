import {globSync} from "glob";
import {readFileSync, writeFileSync} from "fs";
import platform from "./src/platform.tmLanguage.json" with {type: "json"};
import toRegExp from "./to-regex.js";
import genex from "genex";

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

let symbolSet = {
  class: new Set(),
  interface: new Set(),
  enum: new Set(),
  namespace: new Set(),
  module: new Set(),
  function: new Set(),
  type: new Set(),
  variable: new Set(),
  constant: new Set(),
  property: new Set(),
};
let repositoryKeys = keys(symbolSet);

// === C/C++ STANDARD LIBRARY ===

let platforms = [];

// Recursively traverse the Platform grammar.
let traversePlatform = node => {
  if (node.patterns)
    for (let pattern of node.patterns) {
      if (pattern.match) {
        if (pattern.captures) pattern.name = pattern.captures[2]?.name || pattern.name;
        let name = (
          pattern.name.startsWith("invalid.") ?
            pattern.name.replace(/^.+(?=support)/, "")
          : pattern.name).replace(/\.c$/, ".ruko");

        let key = name.split(".")[1];
        let symbols = genex(pattern.match.replace(/^\\b|\\b$/g)).generate();

        console.log(`Compressing ${symbols.length} C ${pluralize(key)}.`);
        symbols = [...new Set(symbols).difference(symbolSet[key] || new Set())];

        let match = `\\b(${toRegExp(symbols).source})\\b`;
        platforms.push({match, name: `support.${key}.c.ruko`, key});

        symbolSet[key] = symbolSet[key].union(new Set(symbols));
      }
      pattern.patterns && traversePlatform(pattern);
    }
};

// Traverse the Platform grammar and extract the patterns into a flat array,
// then group them by their key (e.g. "function", "class", etc.) and sort them
// alphabetically by name.

traversePlatform(platform);

// === GODOT ENGINE STANDARD LIBRARY ===

import gdScriptClasses from "./gdscript-classes.json" with {type: "json"};
entries(gdScriptClasses).forEach(([group, symbols]) => {
  let key = "class";
  console.log(`Compressing ${symbols.length} patterns from gdscript/classes/${group}`);
  symbols = [...new Set(symbols).difference(symbolSet[key] || new Set())];
  let match = `\\b(${toRegExp(symbols).source})\\b`;
  platforms.push({match, name: `support.${key}.godot.ruko`, key});
  symbolSet[key] = symbolSet[key].union(new Set(symbols));
});

platforms = fromEntries(
  entries(groupBy(platforms, p => p.key)).map(([key, patterns]) => [
    `stdlib-${pluralize(key)}`,
    patterns.sort((a, b) => a.name.localeCompare(b.name)),
  ]),
);

// === STANDARD LIBRARY ===

let stdlibDir = "C:/Users/Admin/Ruko/DefinitelyTyped-master/types/**/*.ts";
let stdlibFiles = globSync(stdlibDir, {absolute: true})
  .filter(path => !/\/node_modules\//.test(path))
  .reverse();
console.log(`Found ${stdlibFiles.length} standard library files.`);

let libraries = stdlibFiles
  .map(path => {
    // Read the file content and find all declared names
    let content = readFileSync(path, "utf8");
    let name = path.match(/(?<=types[\\/])(.+?)(?=[\\/]|\.ts$)/)[1];

    // Look for first word in name, which is usually the library name, but may be more specific if there
    // are multiple libraries in the same file (e.g. "react" and "react-dom" in "react/index.ts").
    // Replace any non-alphanumeric characters with a single dash and convert to lowercase to get the library name.
    // For example, "react" and "react-dom" would both become "react", while "node" would remain as "node".
    let library = name.match(/^\w+/)[0].replace(/[-_]+/g, "-").toLowerCase();

    // Group them according to their declaration type and remove duplicates.
    let patterns = {
      class: /\bclass\b\s+\b([a-zA-Z_]\w*)\b/gm, // classes
      interface: /\binterface\b\s+\b([a-zA-Z_]\w*)\b/gm, // interfaces
      enum: /\benum\b\s+\b([a-zA-Z_]\w*)\b/gm, // enums
      namespace: /\bnamespace\b\s+\b([a-zA-Z_]\w*)\b/gm, // namespaces
      module: /\bmodule\b\s+\b([a-zA-Z_]\w*)\b/gm, // modules
      function: /\bfunction\b\s+\b([a-zA-Z_]\w*)\b|\s*\b([a-zA-Z_]\w*)\b\s*\(/gm, // functions and methods
      type: /\btype\b\s+\b([a-zA-Z_]\w*)\b/gm, // type aliases
      variable: /\b(?:var|let)\b\s+\b([a-zA-Z_]\w*)\b/gm, // variables with var or let
      constant: /\bconst\b\s*\b([a-zA-Z_]\w*)\b/gm, // constants with const
      property: /\b([a-zA-Z_]\w*)\b(?=\s*(\??:|=)\s*)/gm, // properties and variables with type annotations or initializers
    };

    // Sort the patterns alphabetically for each library and then sort the libraries alphabetically.
    patterns = fromEntries(
      entries(patterns).map(([key, value]) => [
        key,
        [...new Set(content.matchAll(value))]
          .map(([, name, name1]) => (name || name1).match(/^\w+/)?.[0])
          .filter(Boolean),
      ]),
    );

    console.log(
      `Extracted ${keys(patterns).reduce((sum, key) => sum + patterns[key].length, 0)} symbols from ${library} (./${path
        .match(/types[\\/](.+?)$/)[1]
        .split("\\")
        .join("/")}).`,
    );

    return {name: library, patterns};
  })

  // If library is the same, combine it with the names found in the current file.
  // otherwise, push the current library and start a new one.
  .reduce((acc, lib) => {
    let existing = acc.find(l => l.name == lib.name);
    if (existing) {
      for (let key in lib.patterns) {
        let symbols = lib.patterns[key] || [];
        existing.patterns[key] = [...new Set(existing.patterns[key] || []).union(new Set(symbols))];

        if (symbols.length > 0)
          console.log(
            `Merged ${symbols.length} ${pluralize(key)} from ${lib.name} with existing ${pluralize(key)} (${existing.patterns[key].length} total).`,
          );
      }
    } else acc.push(lib);
    return acc;
  }, []);

// Remove any empty patterns and convert the arrays of names into
// optimized regex patterns using oniguruma-parser/optimizer.

// to query the patterns for debugging, you can use the following code:
void libraries.find(({name}) => name == "three")?.patterns;

for (let lib of libraries)
  for (let key in lib.patterns)
    if (lib.patterns[key].length > 0) {
      let symbols = lib.patterns[key] || [];
      symbols = [...new Set(symbols).difference(symbolSet[key] || new Set())];
      let length = symbols.length;
      console.log(`Aggregating ${length} ${pluralize(key)} from ${lib.name}.`);
      let match = symbols; // don't merge yet
      lib.patterns[key] = {
        match,
        name: `support.${key}.${lib.name}.ruko`,
        key,
      };
    } else delete lib.patterns[key];

// Transpose patterns so that they are grouped by type instead of by library.
// For example, all function patterns from all libraries would be grouped
// together under "stdlib-functions", all class patterns under "stdlib-classes", etc.
libraries = groupBy(
  libraries.flatMap(lib =>
    values(lib.patterns)
      .map(pattern => {
        console.log(`Processing pattern for ${pattern.name} with ${pattern.match.length} symbols.`);
        let symbols = pattern.match;
        // Split the patterns into smaller groups by first letter to avoid creating
        // huge regex patterns that can be inefficient to match against.
        let groups = groupBy(symbols, sym => sym[0].toLowerCase());
        return entries(groups).map(([letter, symbols]) => {
          console.log(
            `Compressing ${symbols.length} symbols starting with "${letter}" for ${pattern.name}.`,
          );
          let match = `\\b(${toRegExp(symbols).source})\\b`;
          return {...pattern, match};
        });
      })
      .flat(),
  ),
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
        patterns: (libraries[`stdlib-${pluralize(key)}`] || [])
          .concat(platforms[`stdlib-${pluralize(key)}`] || [])
          .map(x => {
            delete x.library;
            return x;
          })
          .sort((a, b) => stringify(a).length - stringify(b).length),
      },
    ]),
  ),
};

// === ADOBE GLYPH LIST ===

let aglfn = readFileSync("C:/Users/Admin/Dropbox/Ruko Language/aglfn.txt", "utf8")
  .split("\n")
  .filter(line => !line.startsWith("#") && line.trim() != "")
  .map(line => line.split(";")[0].trim());
console.log(`Compressing ${aglfn.length} Adobe Glyph List symbols.`);
grammar.repository["stdlib-adobe-glyph-list"] = {
  match: `\\b(${toRegExp(aglfn).source})\\b`,
  name: "support.constant.character.adobe.ruko",
};
grammar.patterns.push({include: "#stdlib-adobe-glyph-list"});

// === COLOR NAMES ===

import {colornames} from "color-name-list";
console.log(`Compressing ${colornames.length} color name patterns.`);
// Group by first letter to avoid creating a single huge regex pattern,
// which can be inefficient to match against.
grammar.repository["stdlib-color-names"] = {
  patterns: "abcdefghijklmnopqrstuvwxyz".split("").map(letter => {
    let symbols = colornames
      .filter(({name}) => name.toLowerCase().startsWith(letter))
      .map(({name}) => name.normalize("NFD").replace(/\W/g, "").toLowerCase());
    console.log(`Compressing ${symbols.length} color names starting with "${letter}".`);
    return {
      match: `\\b(${toRegExp(symbols).source})\\b`,
      name: "support.constant.color.ruko",
    };
  }),
};
grammar.patterns.push({include: "#stdlib-color-names"});

// Remove "comment" and "define" keys from all sub-objects in repository
grammar = parse(
  stringify(grammar, (key, value) => {
    switch (typeof value) {
      case "object":
        delete value.key || delete value.comment || delete value.define || delete value.library;
        break;
      // Remove non-capturing groups added by the optimizer,
      // since they are not needed in this context and can make the regex harder to read.
      case "string":
        if (key == "match") return value.split("(?:").join("(");
    }
    return value;
  }),
);

grammar.information_for_contributors = [
  "This file is generated from ruko.stdlib.tmLanguage.yaml using update-stdlib.js.",
  "To make changes to the standard library patterns, edit ruko.stdlib.tmLanguage.yaml and run update-stdlib.js.",
];
grammar = stringify(sortKeys(grammar), null, 2);

writeFileSync("C:/Users/Admin/Dropbox/Ruko Language/ruko-stdlib.tmLanguage.json", grammar);
