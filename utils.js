import {
  existsSync,
  mkdirSync,
  readdirSync,
  lstatSync,
  cpSync,
  copyFileSync,
  rmSync,
  rmdirSync,
} from "fs";

let {parse, stringify} = JSON;
let {isArray} = Array;
let {keys, values, entries, fromEntries, groupBy} = Object;

// recursively mirror directory from source to destination.
// may remove files in destination that are not in source.
// if destination does not exist, it will be created.
// source and destination should be absolute paths.

export const mirrorDir = (source, destination) => {
  if (!existsSync(destination)) mkdirSync(destination, {recursive: true});

  let sourceEntries = new Set(readdirSync(source));
  let destEntries = new Set(readdirSync(destination));
  for (let entry of sourceEntries) {
    let sourcePath = `${source}/${entry}`;
    let destPath = `${destination}/${entry}`;
    if (lstatSync(sourcePath).isDirectory())
      cpSync(sourcePath, destPath, {recursive: true});
    else copyFileSync(sourcePath, destPath);
  }

  for (let entry of destEntries) {
    if (!sourceEntries.has(entry)) {
      let destPath = `${destination}/${entry}`;
      if (lstatSync(destPath).isDirectory())
        rmSync(destPath, {recursive: true, force: true});
      else rmdirSync(destPath);
    }
  }
};

export const sortKeys = obj =>
  isArray(obj) ? obj.map(sortKeys)
  : obj && typeof obj == "object" ?
    fromEntries(
      keys(obj)
        .sort((a, b) => a.localeCompare(b))
        .map(k => [k, sortKeys(obj[k])]),
    )
  : obj;
