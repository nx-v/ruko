import fs from "fs";
import yaml from "js-yaml";
import {optimize} from "oniguruma-parser/optimizer";
const {fromEntries, entries, keys, values} = Object;

let file = fs.readFileSync("C:/Users/Admin/Dropbox/Ruko Language/ruko.tmLanguage.yaml", "utf8");
let parsed = yaml.load(file);

function sortKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj && typeof obj == "object")
    return fromEntries(
      keys(obj)
        .sort()
        .map(k => [k, sortKeys(obj[k])]),
    );

  return obj;
}

// remove "comment" keys recursively
parsed = JSON.stringify(parsed, (k, v) => {
  switch (typeof v) {
    case "string":
      return /^(begin|match)$/.test(k) ? optimize(v).pattern : v;
    case "object":
      return v && "comment" in v ?
          fromEntries(entries(v).filter(([k]) => k != "comment"))
        : sortKeys(v);
    default:
      return v;
  }
});

let output = parsed;

fs.writeFileSync("C:/Users/Admin/Dropbox/Ruko Language/ruko.tmLanguage.json", output);
fs.writeFileSync(
  "C:/Users/Admin/.vscode/extensions/spu7nix.spwn-language-support-0.0.5/syntaxes/spwn.tmLanguage.json",
  output,
);
