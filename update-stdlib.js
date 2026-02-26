import {globSync} from "glob";
import {readFileSync, writeFileSync} from "fs";
import platform from "./src/platform.tmLanguage.json" with {type: "json"};
import regexGen from "./regex-gen.js";
import genex from "genex";
import {unicodeName} from "unicode-name";

let {isArray, from} = Array;
let {fromCodePoint, fromCharCode, raw} = String;
let {parse, stringify} = JSON;
let {keys, values, fromEntries, entries, groupBy} = Object;

let start = performance.now();
// Utility functions
let pipe = (k, ...fns) => fns.reduce((v, fn) => fn(v), k);

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
  pascalSnake: [
    name => /^([A-Z][a-z\d]*_+)*[A-Z\d][a-z\d]*$/.test(name),
    name => name.split(/_+/).filter(Boolean),
  ],
  screamingSnake: [
    name => /^([A-Z][A-Z\d]*_+)*[A-Z\d]+$/.test(name),
    name => name.split(/_+/).filter(Boolean),
  ],
  snake: [
    name => /^([a-z][a-z\d]*_+)*[a-z\d]+$/.test(name),
    name => name.split(/_+/).filter(Boolean),
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

// === GODOT ENGINE STANDARD LIBRARY ===
let gdScriptClasses = parse(
  readFileSync(
    "C:/Users/Admin/Dropbox/Ruko Language/gdscript-classes.json",
    "utf8",
  ),
  "utf8",
);
values(gdScriptClasses).forEach(
  symbols => (symbolSet.class = symbolSet.class.union(new Set(symbols))),
);

// === C/C++ STANDARD LIBRARY ===
let traversePlatform = node => {
  if (node.patterns)
    for (let pattern of node.patterns) {
      if (pattern.match) {
        if (pattern.captures)
          pattern.name = pattern.captures[2]?.name || pattern.name;
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

// === NODE.JS STANDARD LIBRARY ===
let stdlibDir = "C:/Users/Admin/Ruko/DefinitelyTyped-master/types/**/*.ts";
let stdlibFiles = globSync(stdlibDir, {absolute: true})
  .filter(path => !/\/node_modules\//.test(path))
  .reverse();

stdlibFiles.forEach(path => {
  let content = readFileSync(path, "utf8");

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
    symbolSet[key] = symbolSet[key].union(new Set(patterns[key]));
  });
});

// === REPOSITORY ===
let repository = (() => {
  let repo = {};

  for (let [type, symbols] of entries(symbolSet)) {
    // collect normalized word groups for this symbol type
    let groups = new Set();

    for (let [validator, splitter] of values(conventions)) {
      for (let symbol of symbols) {
        if (!validator(symbol)) continue;

        // if there are multiple single letter/digit words, like "XMLHttpRequest",
        // keep them together as "xml http request" instead of "x m l http request"
        // and "uint 16" instead of "uint 1 6"
        let words = splitter(symbol)
          .map(word => word.normalize("NFD").toLowerCase())
          .join(" ")
          .replace(/\b((?:[a-z]\b\s*){2,}|(?:\d\b\s*){2,})\b/g, match =>
            match.replace(/\s/g, ""),
          )
          .replace(/\d+/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .split(" "); // then split them back into individual words

        groups = groups.union(new Set(words));
      }
    }

    let groupList = [...groups]
      // leave out single-letter/digit groups since they can cause false positives
      .filter(word => word.length >= 2 && !/\d/.test(word))
      .map(x => x.trim())
      .sort((a, b) => a.length - b.length);

    repo[`stdlib-${pluralize(type)}`] = {
      match:
        "\\b(?!\\d+)((?i:" +
        regexGen(groupList).source +
        "|\\d+)\\p{Pc}*)*\\g<1>\\b",
      name: `support.${type}.ruko`,
    };
  }

  return repo;
})();

// === STDLIB GRAMMAR ===
let grammar = sortKeys({
  comment:
    "This file was generated using data from https://github.com/DefinitelyTyped/DefinitelyTyped",
  name: "Ruko Standard Library",
  scopeName: "source.rk.std",
  patterns: keys(repository).map(key => ({include: `#${key}`})),
  repository,
});

// === UNICODE CHARACTER NAMES ===
let assignedUnicodeChars = from({length: 0x110000}, (_, i) =>
  fromCodePoint(i),
).filter(char => /\p{Assigned}/u.test(char));
let unicodeWords = [
  ...new Set(
    assignedUnicodeChars.flatMap(char =>
      unicodeName(char)
        .normalize("NFD")
        .replace(/-/g, " ")
        .replace(/[\W--\s]/gv, "")
        .toLowerCase()
        .split(" "),
    ),
  ),
]
  .filter(word => word.length >= 2 && !/\d/.test(word))
  .sort((a, b) => a.length - b.length);
grammar.repository["stdlib-unicode-names"] = {
  match:
    "\\b(?!\\d+)((?i:" +
    regexGen(unicodeWords).source +
    "|\\d+)\\p{Pc}*)*\\g<1>\\b",
  name: "support.constant.character.unicode.ruko",
};
grammar.patterns.push({include: "#stdlib-unicode-names"});

// === HTML CHARACTER ENTITY REFERENCES ===
let htmlEntities = readFileSync(
  "C:/Users/Admin/Dropbox/Ruko Language/html-entities.txt",
  "utf8",
).match(/(?<=&)\w+(?=;)/g);
grammar.repository["stdlib-html-entities"] = {
  match: `\\b(${regexGen(htmlEntities).source})\\b`,
  name: "support.constant.character.html.ruko",
};
grammar.patterns.push({include: "#stdlib-html-entities"});

// === ADOBE GLYPH LIST ===
let aglfn = readFileSync(
  "C:/Users/Admin/Dropbox/Ruko Language/aglfn.txt",
  "utf8",
)
  .split("\n")
  .filter(line => !line.startsWith("#") && line.trim() != "")
  .map(line => line.split(";")[0].trim());
grammar.repository["stdlib-adobe-glyph-list"] = {
  match: `\\b(${regexGen(aglfn).source})\\b`,
  name: "support.constant.character.adobe.ruko",
};
grammar.patterns.push({include: "#stdlib-adobe-glyph-list"});

// === COLOR NAMES ===
import {colornames} from "color-name-list";
// Group by first letter to avoid creating a single huge regex pattern,
// which can be inefficient to match against.
grammar.repository["stdlib-color-names"] = {
  match:
    "\\b(" +
    pipe(
      colornames,
      x =>
        x.flatMap(({name}) =>
          name
            .normalize("NFD")
            .replace(/[\W--\s]/gv, "")
            .toLowerCase()
            .split(" "),
        ),
      x => regexGen([...new Set(x.filter(word => /\D+/.test(word)))]).source,
    ) +
    ")\\b",
  name: "support.constant.color.ruko",
};
grammar.patterns.push({include: "#stdlib-color-names"});

// Remove "comment" and "define" keys from all sub-objects in repository
grammar = parse(
  stringify(grammar, (key, value) => {
    switch (typeof value) {
      case "object":
        for (let k of ["key", "comment", "define", "library"])
          if (value && k in value) delete value[k];
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
writeFileSync(
  "C:/Users/Admin/Dropbox/Ruko Language/ruko-stdlib.tmLanguage.json",
  grammar,
);

let end = performance.now();
console.log(
  `Standard library updated in ${((end - start) / 1000).toFixed(2)} seconds.`,
);
