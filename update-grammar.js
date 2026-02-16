import fs from "fs";
import yaml from "js-yaml";
import prettier from "prettier";
import {optimize} from "oniguruma-parser/optimizer";

let {parse, stringify} = JSON;
let {isArray} = Array;
let {keys, values, fromEntries, entries} = Object;

let file = fs.readFileSync("C:/Users/Admin/Dropbox/Ruko Language/ruko.tmLanguage.yaml", "utf8");
let parsed = yaml.load(file);

parsed.repository.numbers.patterns = (() => {
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
    begin: "(?ix)\\b($prefix) # no prefix\n([$digits](?:[$digits_]*[$digits])?) # integer part",
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
        match: "(?ix)(/) # rational delimiter\n([$digits](?:[$digits_]*[$digits])?) # denominator",
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

parsed.repository.strings = (() => {
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
      $: ["verbatim", {match: escapes, name: "constant.character.escape.ruko"}, quote],
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

    let desc = ["plain", results[0]][results.length] || new Intl.ListFormat("en").format(results);

    let hasMulti = multi ? "multi " : "";
    `${hasMulti}${delimiter}-quoted ${desc} string`.trim().replace(/\s{2,}/g, ([match]) => match);

    let flagCombis = permutations([...flags]).map(x => x.map(y => escapeSym(y) + "+").join``)
      .join`|`;

    return {
      comment: `${hasMulti} ${delimiter}-quoted ${desc} string`
        .trim()
        .replace(/\s{2,}/g, match => match[0]),
      begin: `\\s*(${flagCombis})(${multiQuote})\\s*`,
      contentName: /@/.test(flags) ? "string.template.ruko" : `string.quoted.${delimiter}.ruko`,
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

// clone parsed object
let parsed1 = sortKeys(parsed);

// remove "define" key from repository
delete parsed.repository.define;

// remove "comment" and "define" keys from all sub-objects in repository
parsed = stringify(parsed, (k, value) => {
  switch (typeof value) {
    case "object":
      for (let key of ["comment", "define"]) if (key in value) delete value[key];
      if (k == "repository" || "repository" in value) return value;
      break;

    case "string":
      if (["begin", "end", "match", "while"].includes(k.trim()))
        try {
          if (value.split(/\n/).some(line => /(?<!\\)#this\./.test(line)))
            value = value.replace(/(?<!\\)#this\.(.+$)/gm, p2 => {
              let code = p2.replace(/(?<!\\)#this\./, "parsed1.");
              return eval(code);
            });
          return optimize(value).pattern;
        } catch (err) {
          // console.error(err, value)
          return value;
        }
  }
  return sortKeys(value);
});

// parsed = await prettier.format(parsed, {parser: "json", tabWidth: 4});

// recursively mirror directory from source to destination.
// may remove files in destination that are not in source.
// if destination does not exist, it will be created.
// source and destination should be absolute paths.
const mirrorDir = (source, destination) => {
  if (!fs.existsSync(destination)) fs.mkdirSync(destination, {recursive: true});

  let sourceEntries = new Set(fs.readdirSync(source));
  let destEntries = new Set(fs.readdirSync(destination));
  for (let entry of sourceEntries) {
    let sourcePath = `${source}/${entry}`;
    let destPath = `${destination}/${entry}`;
    if (fs.lstatSync(sourcePath).isDirectory()) fs.cpSync(sourcePath, destPath, {recursive: true});
    else fs.copyFileSync(sourcePath, destPath);
  }

  for (let entry of destEntries) {
    if (!sourceEntries.has(entry)) {
      let destPath = `${destination}/${entry}`;
      if (fs.lstatSync(destPath).isDirectory()) fs.rmSync(destPath, {recursive: true, force: true});
      else fs.rmdirSync(destPath);
    }
  }
};

fs.writeFileSync("C:/Users/Admin/Dropbox/Ruko Language/ruko.tmLanguage.json", parsed);
fs.writeFileSync(
  "C:/Users/Admin/Videos/nexovolta.ruko-language-support-0.0.1/syntaxes/ruko.tmLanguage.json",
  parsed,
);
mirrorDir(
  "C:/Users/Admin/Videos/nexovolta.ruko-language-support-0.0.1",
  "C:/Users/Admin/.vscode/extensions/nexovolta.ruko-language-support-0.0.1",
);
