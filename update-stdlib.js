import {globSync} from "glob";
import {readFileSync, writeFileSync} from "fs";
import platform from "./src/platform.tmLanguage.json" with {type: "json"};
import toRegExp from "./to-regex.js";
import genex from "genex";

let {isArray} = Array;
let {parse, stringify} = JSON;
let {keys, values, fromEntries, entries, groupBy} = Object;

// Utility functions
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

// Conventions are divided into validators and splitters.
// Validators are functions that check if a symbol follows a certain convention,
// while splitters are functions that break down a symbol into its components based on the convention.
let conventions = {
  pascal: [
    name => /^([A-Z][a-zA-Z\d]*)+$/.test(name),
    name => name.match(/[A-Z][a-z\d]*|\d+/g).filter(Boolean),
  ],
  camel: [
    name => /^[a-z][a-zA-Z\d]*([A-Z][a-z\d]*)*$/.test(name),
    name => name.match(/^[a-z]+|[A-Z][a-z\d]*|\d+/g).filter(Boolean),
  ],
  snake: [
    name => /^([a-z][a-z\d]*_+)*[a-z\d]+$/.test(name),
    name => name.split(/_+/).filter(Boolean),
  ],
  kebab: [
    name => /^([a-z][a-z\d]*-+)*[a-z\d]+\b$/.test(name),
    name => name.split(/-+/).filter(Boolean),
  ],
  screamingSnake: [
    name => /^([A-Z][A-Z\d]*_+)*[A-Z\d]+$/.test(name),
    name => name.split(/_+/).filter(Boolean),
  ],
  screamingKebab: [
    name => /^([A-Z][A-Z\d]*-+)*[A-Z\d]+\b$/.test(name),
    name => name.split(/-+/).filter(Boolean),
  ],
  pascalSnake: [
    name => /^([A-Z][a-z\d]*_+)*[A-Z\d][a-z\d]*$/.test(name),
    name => name.split(/_+/).filter(Boolean),
  ],
  pascalKebab: [
    name => /^([A-Z][a-z\d]*-+)*[A-Z\d][a-z\d]*\b$/.test(name),
    name => name.split(/-+/).filter(Boolean),
  ],
  upper: [name => /^[A-Z][A-Z\d]*$/.test(name), name => [name]],
  lower: [name => /^[a-z][a-z\d]*$/.test(name), name => [name]],
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

// === REPOSITORY ===

let repository = (() => {
  let repo = {};

  for (let [type, symbols] of entries(symbolSet)) {
    // collect normalized word groups for this symbol type
    let groups = new Set();

    for (let [convention, [validator, splitter]] of entries(conventions)) {
      for (let symbol of symbols) {
        if (!validator(symbol)) continue;

        // if there are multiple single letter/digit words, like "XMLHttpRequest",
        // keep them together as "xml http request" instead of "x m l http request"
        // and "uint 16" instead of "uint 1 6"
        let words = splitter(symbol)
          .map(word => word.toLowerCase())
          .join(" ")
          .replace(/\b((?:[a-z]\b\s*){2,}|(?:\d\b\s*){2,})\b/g, match => match.replace(/\s/g, ""))
          .replace(/\s+/g, " ")
          .trim()
          .split(" ");

        for (let w of words) groups.add(w);
      }
    }

    let groupList = [...groups]
      .sort((a, b) => a.length - b.length)
      // leave out single-letter/digit groups since they can cause false positives
      .filter(x => x.length >= 2);

    repo[`stdlib-${pluralize(type)}`] = {
      match:
        "\\b((?i:" +
        values(groupBy(groupList, g => g.length))
          .map(g => toRegExp(g).source)
          .join("|") +
        ")\\p{Pc}*)*\\g<1>\\b",
      name: `support.${type}.ruko`,
    };
  }

  return repo;
})();

// === STDLIB GRAMMAR ===

// Combine both the C/C++ standard library patterns and the standard library patterns
// into a single repository object, sorted alphabetically by key and then by pattern name.
let grammar = sortKeys({
  comment:
    "This file was generated using data from https://github.com/DefinitelyTyped/DefinitelyTyped",
  name: "Ruko Standard Library",
  scopeName: "source.rk.std",
  patterns: keys(repository).map(key => ({include: `#${key}`})),
  repository,
});

// === ADOBE GLYPH LIST ===
let aglfn = readFileSync("C:/Users/Admin/Dropbox/Ruko Language/aglfn.txt", "utf8")
  .split("\n")
  .filter(line => !line.startsWith("#") && line.trim() != "")
  .map(line => line.split(";")[0].trim());
grammar.repository["stdlib-adobe-glyph-list"] = {
  match: `\\b(${toRegExp(aglfn).source})\\b`,
  name: "support.constant.character.adobe.ruko",
};
grammar.patterns.push({include: "#stdlib-adobe-glyph-list"});

// === COLOR NAMES ===

import {colornames} from "color-name-list";
// Group by first letter to avoid creating a single huge regex pattern,
// which can be inefficient to match against.
grammar.repository["stdlib-color-names"] = {
  patterns: "abcdefghijklmnopqrstuvwxyz".split("").map(letter => {
    let symbols = colornames
      .filter(({name}) => name.toLowerCase().startsWith(letter))
      .map(({name}) => name.normalize("NFD").replace(/\W/g, "").toLowerCase());
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
