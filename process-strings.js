import fs from "fs";
let {stringify} = JSON;
let {isArray} = Array;
let {keys, values, entries} = Object;

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
  let patterns = flags.includes("`") ? [] : [{include: "#string-escapes"}];
  let escapes = [];

  let map = {
    "`": ["verbatim", {match: escapes, name: "constant.character.escape.ruko"}, quote],
    "%": ["format", {include: "#embedded-formatting"}],
    "@": ["template", {include: "#embedded-arguments"}],
    "#": ["interpolated", {include: "#embedded-expressions"}],
  };

  if (flags.includes("`")) for (let key of flags) if (key in map) escapes.push(map[key][2] || key);

  let results = [];
  for (let key of flags)
    if (key in map) {
      let match =
        key != "`" ?
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

  let flagCombis = permutations([...flags]).map(x => x.map(y => escapeSym(y) + "+").join``).join`|`;

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

let combinations = powerSet("`#%@")
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

// All YAML serialization below is custom.
// For number keys with objects as values,
// the object must be on the same line as the number, like "1: { ... }"
let toYAML = obj => {
  let indent = (s, n = 2) =>
    s.split`\n`.map(line => (line.trim() ? " ".repeat(n) + line : line)).join`\n`;

  let singleQuotes = s => {
    return (
      /^\s|[\s:]$/.test(s) || // leading or trailing space or colon
      /^[-:|#'"]/.test(s) ||
      /^[:\[\]\{\},&\*#?|\-<>=!%@]/.test(s) // special YAML characters
    );
  };
  let doubleQuotes = s => /[\b\f\n\r\t]/.test(s);

  let serialize = (obj, inline = false) => {
    if (isArray(obj)) {
      if (inline) {
        return "[" + obj.map(x => serialize(x, true)).join`, ` + "]";
      } else {
        return (
          obj.length == 0 ? "[]"
          : obj.every(x => typeof x != "object") ? obj.map(x => `- ${serialize(x, true)}`).join`\n`
          : obj.map(x => `- ${serialize(x, false).replace(/\n/g, "\n  ")}`).join`\n`
        );
      }
    } else if (typeof obj == "object" && obj != null) {
      if (inline) {
        let entries = keys(obj).map(key => `${key}: ${serialize(obj[key], true)}`);
        return "{" + entries.join`, ` + "}";
      } else {
        let entries = keys(obj).map(key => {
          let isNumericKey = /^\d+$/.test(key);
          let value = serialize(obj[key], isNumericKey);
          return (isArray(obj[key]) && !isNumericKey) || (/\n/.test(value) && !isNumericKey) ?
              `${key}:\n${indent(value)}`
            : `${key}: ${value}`;
        });
        return entries.join`\n`;
      }
    } else if (typeof obj == "string") {
      return (
        /\n/.test(obj) ? `|\n${indent(obj)}`
        : singleQuotes(obj) ? `'${obj.replace(/'/g, "''")}'`
        : doubleQuotes(obj) ? stringify(obj)
        : obj
      );
    } else return String(obj);
  };

  return serialize(obj);
};

console.log(require("util").inspect(map, {depth: null}));
fs.writeFileSync("./code/ruko/string_processor.yaml", toYAML({strings: {patterns: map}}));
