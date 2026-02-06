let {raw} = String;

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import regexgen from "regexgen";
import {optimize} from "oniguruma-parser/optimizer";
import toRegexRange from "../Code/regexrange.js";

let {stringify} = JSON;
let {isArray} = Array;
let {keys, values, entries} = Object;

let bases = [
  {name: "binary", prefix: "\\\\b0*", radix: 2, regex: null},
  {name: "ternary", prefix: "\\\\t0*", radix: 3, regex: null},
  {name: "quaternary", prefix: "\\\\q0*", radix: 4, regex: null},
  {name: "senary", prefix: "\\\\s0*", radix: 6, regex: null},
  {name: "octal", prefix: "\\\\o0*", radix: 8, regex: null},
  {name: "decimal", prefix: "\\\\0*", radix: 10, regex: null},
  {name: "duodecimal", prefix: "\\\\z0*", radix: 12, regex: null},
  {name: "hexadecimal", prefix: "\\\\x0*", radix: 16, regex: null},
];

for (let base of bases) {
  base.regex =
    base.prefix +
    `(?${base.radix <= 10 ? "" : "i"}:${optimize(toRegexRange(0x0, 0x10ffff, {base: base.radix, shorthand: true})).pattern})`;
}

fs.writeFileSync("Code/number_bases.yaml", yaml.dump(bases), "utf-8");
