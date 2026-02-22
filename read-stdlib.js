import {globSync} from "glob";
import {readFileSync, writeFileSync} from "fs";
import platform from "./src/platform.tmLanguage.json" with {type: "json"};
import toRegExp from "./to-regex.js";
import genex from "genex";

let {isArray} = Array;
let {raw} = String;
let {parse, stringify} = JSON;
let {keys, values, fromEntries, entries, groupBy} = Object;

let stdlibDir = "C:/Users/Admin/Ruko/DefinitelyTyped-master/types/**/*.ts";
let stdlibFiles = globSync(stdlibDir, {absolute: true})
  .filter(path => !/\/node_modules\//.test(path))
  .reverse();
let chunk = (array, chunkSize) =>
  array.reduce((result, item, index) => {
    if (index % chunkSize === 0) result.push([]);
    result[result.length - 1].push(item);
    return result;
  }, []);

let libraries = stdlibFiles.map(path => path.match(/(?<=types[\\/])(.+?)(?=__|[-.\\/]|\.ts$)/)[1]);

// install 20 libraries at a time
console.log(
  "npm install -g " +
    chunk([...new Set(libraries)], 12)
      .map(group => group.join(" "))
      .join("\nnpm install -g "),
); // install missing libraries with npm
