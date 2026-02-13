import fs from "fs";
import yaml from "js-yaml";
import prettier from "prettier";
import {optimize} from "oniguruma-parser/optimizer";

let {fromEntries, keys} = Object;
let {isArray} = Array;
let {stringify} = JSON;

let file = fs.readFileSync("C:/Users/Admin/Dropbox/Ruko Language/ruko.tmLanguage.yaml", "utf8");
let parsed = yaml.load(file);

let sortKeys = obj =>
  isArray(obj) ? obj.map(sortKeys)
  : obj && typeof obj == "object" ?
    fromEntries(
      keys(obj)
        .sort((a, b) => a.localeCompare(b))
        .map(k => [k, sortKeys(obj[k])]),
    )
  : obj;

// remove "comment" keys recursively
parsed = stringify(
  parsed,
  (k, v) => {
    switch (typeof v) {
      case "object":
        for (let k of ["comment", "define"]) if (k in v) delete v[k];
        if (k == "repository" || "repository" in v) return v;
        break;
      case "string":
        if (["begin", "end", "match", "while"].includes(k.trim()))
          try {
            return optimize(v).pattern;
          } catch (e) {
            // console.error("Invalid pattern:", e, v);
            return v;
          }
    }
    return sortKeys(v);
  },
  4,
);

// parsed = await prettier.format(parsed, {parser: "json", tabWidth: 4});

fs.writeFileSync("C:/Users/Admin/Dropbox/Ruko Language/ruko.tmLanguage.json", parsed);
fs.writeFileSync(
  "C:/Users/Admin/.vscode/extensions/spu7nix.spwn-language-support-0.0.5/syntaxes/spwn.tmLanguage.json",
  parsed,
);
