import yaml from "js-yaml";
import {optimize} from "oniguruma-parser/optimizer";
import {mirrorDir} from "./utils.js";
import {readFileSync, writeFileSync} from "fs";
import toRegExp from "./to-regex.js";
import genex from "genex";

let {parse, stringify} = JSON;
let {isArray} = Array;
let {keys, values, fromEntries, entries} = Object;

let file = readFileSync(
  "C:/Users/Admin/Dropbox/Ruko Language/ruko.tmLanguage.yaml",
  "utf8",
);
let grammar = yaml.load(file);

// === NUMBERS ===

grammar.repository.numbers.patterns = (() => {
  let bases = [
    {name: "binary", digits: "01", prefix: "0b"},
    {name: "ternary", digits: "012", prefix: "0t"},
    {name: "quaternary", digits: "0-3", prefix: "0q"},
    {name: "senary", digits: "0-5", prefix: "0s"},
    {name: "octal", digits: "0-7", prefix: "0o"},
    {name: "duodecimal", digits: "\\dAB", prefix: "0z"},
    {name: "hexadecimal", digits: "\\h", prefix: "0x"},
    {name: "arbitrary-base", digits: "\\p{alnum}", prefix: "(?!0)\\d+b"},
    {name: "decimal", digits: "0-9", prefix: ""},
  ];

  let base = {
    applyEndPatternLast: true,
    comment: "$name ($prefix prefix)",
    name: "constant.numeric.$name.ruko",
    begin:
      "(?ix)\\b($prefix) # no prefix\n([$digits](?:[$digits_]*[$digits])?) # integer part",
    end: "$|",
    captures: {
      1: {name: "storage.type.numeric.ruko"},
      2: {name: "constant.numeric.$name.integer.ruko"},
    },
    patterns: [
      {
        match: "(\\.)([$digits](?:[$digits_]*[$digits])?)",
        name: "constant.numeric.$name.fraction.ruko",
        captures: {1: {name: "punctuation.separator.$name.ruko"}},
      },
      {
        match:
          "(?ix)(\\\\?[ep]) # exponent delimiter\n([+-])? # sign\n([$digits](?:[$digits_]*[$digits])?) # exponent",
        captures: {
          1: {name: "keyword.operator.expression.exponent.ruko"},
          2: {name: "keyword.operator.sign.exponent.ruko"},
          3: {name: "constant.numeric.$name.exponent.ruko"},
        },
      },
      {
        match:
          "(?ix)(/) # rational delimiter\n([$digits](?:[$digits_]*[$digits])?) # denominator",
        captures: {
          1: {name: "punctuation.separator.rational.ruko"},
          2: {name: "constant.numeric.$name.denominator.ruko"},
        },
      },
      {include: "#byte-shift-suffix"},
      {include: "#unit-suffix"},
    ],
  };

  let map = bases.map(({name, digits, prefix}) => {
    let result = parse(
      stringify(base, (_, value) =>
        typeof value == "string" ?
          value
            .replace(/\$name/g, name)
            .replace(/\$digits/g, digits)
            .replace(/\$prefix/g, prefix)
        : value,
      ),
    );
    if (prefix) result.begin = result.begin.replace("(?:)", `(?:${prefix})`);
    return result;
  });

  return map;
})();

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
        delete value.comment || delete value.define;
        if (/^stdlib-(css|unicode)/.test(key))
          if (value.match) {
            console.log(value.match, key);
            value.match = optimize(value.match).pattern.replace(
              /(?<=\\b)\((.+)\)(?=\\b)/,
              match => "(" + toRegExp(genex(match).generate()).source + ")",
            );
            return value;
          } else if (value.patterns)
            value.patterns = value.patterns.map(v => {
              if (v.match)
                v.match = optimize(v.match).pattern.replace(
                  /(?<=\\b)\((.+)\)(?=\\b)/,
                  match => "(" + toRegExp(genex(match).generate()).source + ")",
                );
              return v;
            });
        break;
      case "string":
        if (["begin", "end", "match", "while"].includes(key.trim()))
          try {
            if (value.split(/\n/).some(line => /(?<!\\)#this\./.test(line)))
              value = value.replace(/(?<!\\)#this\.(.+$)/gm, p2 => {
                let code = p2.replace(/(?<!\\)#this\./, "grammar1.");
                return eval(code);
              });
            return optimize(value, {
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
                exposeAnchors: true,
                removeEmptyGroups: true,
                unwrapUselessGroups: true,
                useShorthands: true,
              },
            }).pattern;
          } catch (err) {
            return value;
          }
    }
    return sortKeys(value);
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
  ...sortKeys(grammar.repository), // main grammar patterns
  ...sortKeys(stdlib.repository), // standard library patterns
};
grammar = stringify(grammar);

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
