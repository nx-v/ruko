import fs from "fs";
import yaml from "js-yaml";
import {optimize} from "oniguruma-parser/optimizer";
const {fromEntries, keys} = Object;
const {isArray} = Array;
const {stringify} = JSON;

let file = fs.readFileSync("C:/Users/Admin/Dropbox/Ruko Language/ruko.tmLanguage.yaml", "utf8");
let parsed = yaml.load(file);

const sortKeys = obj =>
  isArray(obj) ? obj.map(sortKeys)
  : obj && typeof obj == "object" ?
    fromEntries(
      keys(obj)
        .sort()
        .map(k => [k, sortKeys(obj[k])]),
    )
  : obj;

// remove "comment" keys recursively
parsed = stringify(parsed, (k, v) => {
  if (typeof v == "string") {
    if (["begin", "end", "match", "while"].includes(k.trim()))
      try {
        return optimize(v).pattern;
      } catch {
        return v.split(/(?<!\\)#\s.+\n/g).join``
          .replace(/^\s+|\s+$/g, "")
          .replace(/(?<!\\)\s+/g, " ");
      }
    if (["comment", "define"].includes(k.trim())) return;
  }
  return sortKeys(v);
});

// parsed = JSON.stringify(parsed, null, 2);

fs.writeFileSync("C:/Users/Admin/Dropbox/Ruko Language/ruko.tmLanguage.json", parsed);
fs.writeFileSync(
  "C:/Users/Admin/.vscode/extensions/spu7nix.spwn-language-support-0.0.5/syntaxes/spwn.tmLanguage.json",
  parsed,
);
