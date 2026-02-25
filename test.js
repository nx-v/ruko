import {optimize} from "oniguruma-parser/optimizer";
import genex from "genex";
import toRegex from "./to-regex.js";

let {raw} = String;

let pattern = raw`(?x)(foo|bar|baz|qux|quux|corge|grault|garply|waldo|fred|plugh|xyzzy|thud)`;

pattern = genex(optimize(pattern).pattern).generate();
pattern = toRegex(pattern).source;

console.log(pattern);
