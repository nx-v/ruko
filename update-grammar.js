import yaml from "js-yaml";
import jsesc from "jsesc";
import regexGen from "./regex-gen.js";
import genex from "genex";
import prettier from "prettier";
import {optimize} from "oniguruma-parser/optimizer";
import {mirrorDir} from "./utils.js";
import {readFileSync, writeFileSync} from "fs";
import {toRegExp} from "oniguruma-to-es";

let {parse, stringify} = JSON;
let {isArray} = Array;
let {keys, values, fromEntries, entries} = Object;

let file = readFileSync(
  "C:/Users/Admin/Dropbox/Ruko Language/ruko.tmLanguage.yaml",
  "utf8",
);
let grammar = yaml.load(file);

// === STRINGS ===
grammar.repository.strings = (() => {
  let permutations = arr => {
    if (arr.length == 0) return [[]];
    let result = [];
    for (let i = 0; i < arr.length; i++) {
      let rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      for (let p of permutations(rest)) result.push([arr[i], ...p]);
    }
    return result;
  };

  let powerSet = (arr, maxLen = arr.length) =>
    [...Array(1 << arr.length).keys()]
      .map(e => [...arr].filter((_, i) => (e >> i) & 1))
      .filter(s => s.length <= maxLen);

  let escapeSym = s => s.replace(/[-/\\^$*+?.#()|[\]{}]/g, "\\$&");

  let scope = ({quote = "'", flags = "", multi = false}) => {
    let delimiter = quote == "'" ? "single" : "double";
    let multiQuote = multi ? quote.repeat(3) + "+" : quote;
    let patterns = flags.includes("$") ? [] : [{include: "#string-escapes"}];
    let escapes = [];

    let map = {
      $: [
        "verbatim",
        {match: escapes, name: "constant.character.escape.ruko"},
        quote,
      ],
      "%": ["format", {include: "#embedded-formatting"}],
      "@": ["template", {include: "#embedded-arguments"}],
      "#": ["interpolated", {include: "#embedded-expressions"}],
    };

    if (flags.includes("$"))
      for (let key of flags) if (key in map) escapes.push(map[key][2] || key);

    let results = [];
    for (let key of flags)
      if (key in map) {
        let match =
          key != "$" ?
            map[key][1]
          : {
              match: escapes.map(x => escapeSym(x).repeat(2)).join`|`,
              name: "constant.character.escape.ruko",
            };
        patterns.push(match);
        results.push(map[key][0]);
      }

    let desc =
      ["plain", results[0]][results.length] ||
      new Intl.ListFormat("en").format(results);

    let hasMulti = multi ? "multi " : "";
    `${hasMulti}${delimiter}-quoted ${desc} string`
      .trim()
      .replace(/\s{2,}/g, ([match]) => match);

    let flagCombis = permutations([...flags]).map(
      x => x.map(y => escapeSym(y) + "+").join``,
    ).join`|`;

    return {
      comment: `${hasMulti} ${delimiter}-quoted ${desc} string`
        .trim()
        .replace(/\s{2,}/g, match => match[0]),
      begin: `\\s*(${flagCombis})(${multiQuote})\\s*`,
      contentName:
        /@/.test(flags) ?
          "string.template.ruko"
        : `string.quoted.${delimiter}.ruko`,
      end: `\\s*((\\2)(?!${quote}+))`,
      captures: {
        1: {name: "storage.type.string.ruko"},
        2: {name: "punctuation.definition.string.ruko"},
      },
      patterns,
    };
  };

  let combinations = powerSet("$#%@")
    .map(x => x.join``)
    .sort((a, b) => b.length - a.length);

  let map = [];
  for (let flag of combinations) {
    map.push(scope({quote: "'", flags: flag, multi: true}));
    map.push(scope({quote: '"', flags: flag, multi: true}));
    map.push(scope({quote: "'", flags: flag}));
    map.push(scope({quote: '"', flags: flag}));
  }

  map.sort((a, b) => keys(b.patterns).length - keys(a.patterns).length);

  return {patterns: map};
})();

let sortKeys = obj =>
  isArray(obj) ? obj.map(sortKeys)
  : obj && typeof obj == "object" ?
    fromEntries(
      keys(obj)
        .sort((a, b) => a.localeCompare(b))
        .map(k => [k, sortKeys(obj[k])]),
    )
  : obj;

// clone grammar object
let grammar1 = sortKeys(grammar);
delete grammar.repository.define;

// remove "comment" and "define" keys from all sub-objects in repository
grammar = parse(
  stringify(grammar, (key, value) => {
    switch (typeof value) {
      case "object":
        if (value.comment || value.define) {
          delete value.comment;
          delete value.define;
        }
        if (/^stdlib/.test(key))
          if (value.patterns) {
            value.patterns = value.patterns.map(val => {
              if (val.match)
                val.match = optimize(val.match).pattern.replace(
                  /(?<=\\b\().+(?=\)\\b$)/,
                  p0 => regexGen(genex(p0).generate()).source,
                );
              return val;
            });
            return value;
          }
        break;
      case "string":
        if (["begin", "end", "match", "while"].includes(key.trim()))
          try {
            if (value.split(/\n/).some(line => /(?<!\\)#this\./.test(line)))
              value = value.replace(/(?<!\\)#this\.(.+$)/gm, p2 => {
                let code = p2.replace(/(?<!\\)#this\./, "grammar1.");
                return eval(code);
              });
            return optimize(value).pattern;
          } catch (err) {
            return value;
          }
    }
    return value;
  }),
);

let stdlib = parse(
  readFileSync(
    "C:/Users/Admin/Dropbox/Ruko Language/ruko-stdlib.tmLanguage.json",
    "utf8",
  ),
);
grammar.information_for_contributors = stdlib.information_for_contributors;
grammar.repository = {
  ...grammar.repository, // main grammar patterns
  ...stdlib.repository, // standard library patterns
};
grammar = stringify(grammar, null, 2);

writeFileSync(
  "C:/Users/Admin/Dropbox/Ruko Language/ruko.tmLanguage.json",
  grammar,
);
writeFileSync(
  "C:/Users/Admin/Ruko/nexovolta.ruko-language-support-0.0.1/syntaxes/ruko.tmLanguage.json",
  grammar,
);
mirrorDir(
  "C:/Users/Admin/Ruko/nexovolta.ruko-language-support-0.0.1",
  "C:/Users/Admin/.vscode/extensions/nexovolta.ruko-language-support-0.0.1",
);

// compile for Shiki Misaki
/*
Shiki uses the JS regex dialect, which is NOT compatible with Oniguruma.
A separate grammar file is needed for Shiki, which uses JS regexes instead of Oniguruma patterns.
This section transforms the Oniguruma patterns in grammar.repository into JS regexes,
and outputs a new grammar file with the transformed patterns.
Note that this does not import anything from the original YAML file, so any patterns that 
rely on dynamic generation using JavaScript (e.g. using genex) will not work in the Shiki 
grammar unless they are pre-generated and hardcoded into the YAML file.
*/
// grammar = parse(grammar, (key, value) => {
//   if (
//     ["begin", "end", "match", "while"].includes(key) &&
//     typeof value == "string"
//   )
//     try {
//       return RegExp(toRegExp(value).source);
//     } catch {
//       try {
//         return optimize(value).pattern;
//       } catch {
//         return value;
//       }
//     }
//   return value;
// });
// writeFileSync(
//   "C:/Users/Admin/Dropbox/Ruko Language/ruko.tmLanguage.js",
//   await prettier.format(
//     "export default " +
//       jsesc(grammar, {
//         compact: false,
//         quotes: "double",
//       }) +
//       ";",
//     {parser: "babel", singleQuote: false, trailingComma: "all", tabWidth: 2},
//   ),
// );
