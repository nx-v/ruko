/**
 * Generates an optimized regular expression that matches all strings in the input array.
 *
 * This function analyzes the input strings and creates the most efficient RegExp pattern
 * by detecting common patterns, character classes, repetitions, and other optimizations.
 * It supports both ASCII and Unicode characters when the 'u' flag is specified.
 *
 * **Optimization strategies:**
 * - Single character repetition: ['a', 'aa', 'aaa'] → /a{1,3}/
 * - Character classes: ['a', 'b', 'c'] → /[a-c]/
 * - Group repetition: ['abab', 'ababab'] → /(?:ab){2,3}/
 * - Common prefix/suffix: ['apple', 'aple'] → /ap?ple/
 * - Optional characters: ['color', 'colour'] → /colou?r/
 * - Unicode support with 'u' flag: ['α', 'β'] → /[α-γ]/u
 * - Alternation patterns: ['apple', 'apricot'] → /ap(?:ple|ricot)/
 * - Cartesian products: ['', 'x', 'y', 'xy'] → /(?:x)?(?:y)?/
 *
 * **Examples:**
 * ```javascript
 * toRegExp(['cat', 'bat', 'rat']) // Returns: /[cbr]at/
 * toRegExp(['foo', 'foobar']) // Returns: /foo(?:bar)?/
 * toRegExp(['ab', 'abab', 'ababab']) // Returns: /(?:ab){1,3}/
 * toRegExp(['α', 'β', 'γ'], 'u') // Returns: /[α-γ]/u
 * toRegExp(['color', 'colour']) // Returns: /colou?r/
 * ```
 *
 * @param {string[]} input - Array of strings to match. Empty arrays or arrays containing
 * only empty strings return a non-capturing group (?:).
 * @param {string} [flags=''] - RegExp flags to apply. Supports only the u flag for Unicode.
 * Other flags are ignored.
 * @returns {RegExp} An optimized regular expression that matches any input string.
 * Returns /(?:)/ for empty or invalid input.
 *
 * @throws {TypeError} If input is not an array or contains non-string elements.
 *
 * Inspired by `regexgen` by Devon Govett, licensed under the MIT License.
 */

export default function toRegExp(input, flags = "") {
  if (!Array.isArray(input)) {
    if (input == undefined) {
      return new RegExp("(?:)", flags);
    }
    throw new TypeError("Input must be an array");
  }
  if (input.some(s => typeof s != "string")) throw new TypeError("All elements must be strings");

  if (!input || input.length == 0 || (input.length == 1 && input[0] == "")) {
    return new RegExp("(?:)", flags);
  }

  // Remove duplicates, sort by code unit order
  input = [...new Set(input)].sort();

  let pattern = buildPattern(input, flags);
  return new RegExp(pattern, flags);
}

// Escape a string for use in a regular expression, handling Unicode properly.
function escapeRegExp(string, flags = "") {
  let isUnicode = flags.includes("u");
  return string
    .replace(/[.*+?^$\{}()|[\]\\]/g, "\\$&")
    .replace(/(?:[\uD800-\uDBFF][\uDC00-\uDFFF])|[\u0080-\uFFFF]/g, match => {
      if (match.length == 2) {
        if (isUnicode) {
          return "\\u{" + match.codePointAt(0).toString(16).toUpperCase() + "}";
        } else {
          let high = match.charCodeAt(0);
          let low = match.charCodeAt(1);
          return (
            "\\u" +
            high.toString(16).toUpperCase().padStart(4, "0") +
            "\\u" +
            low.toString(16).toUpperCase().padStart(4, "0")
          );
        }
      }
      let code = match.charCodeAt(0);
      return "\\u" + code.toString(16).toUpperCase().padStart(4, "0");
    });
}

// Escape a single character for use in a character class, handling Unicode properly.
function escapeCharClass(char, flags = "") {
  let isUnicode = flags.includes("u");
  let code = char.codePointAt(0);
  if (code > 127) {
    if (code > 0xffff) {
      if (isUnicode) {
        return "\\u{" + code.toString(16).toUpperCase() + "}";
      } else {
        let high = char.charCodeAt(0);
        let low = char.charCodeAt(1);
        return (
          "\\u" +
          high.toString(16).toUpperCase().padStart(4, "0") +
          "\\u" +
          low.toString(16).toUpperCase().padStart(4, "0")
        );
      }
    }
    return "\\u" + code.toString(16).toUpperCase().padStart(4, "0");
  } else {
    return char.replace(/[\\[\]\^]/g, "\\$&");
  }
}

function gcd(a, b) {
  return b == 0 ? a : gcd(b, a % b);
}

// Find common prefix of an array of strings.
function findCommonPrefix(strings) {
  if (strings.length == 0) return "";
  let prefix = strings[0];
  for (let s of strings.slice(1)) {
    while (!s.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (prefix == "") break;
    }
    if (prefix == "") break;
  }
  return prefix;
}

// Find common suffix by reversing strings and finding common prefix, then reverse back.
function findCommonSuffix(strings) {
  let reversed = strings.map(s => s.split("").reverse().join(""));
  let reversedPrefix = findCommonPrefix(reversed);
  return reversedPrefix.split("").reverse().join("");
}

// Build a character class from an array of single-character strings, merging consecutive characters into ranges.
function makeCharClass(chars, flags = "") {
  chars = [...new Set(chars)].sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
  let result = "";
  let i = 0;
  while (i < chars.length) {
    let start = chars[i];
    let end = start;
    i++;
    while (i < chars.length && chars[i].codePointAt(0) == end.codePointAt(0) + 1) {
      end = chars[i];
      i++;
    }
    if (start == end) {
      result += escapeCharClass(start, flags);
    } else if (end.codePointAt(0) == start.codePointAt(0) + 1) {
      // Only 2 characters, don't use range
      result += escapeCharClass(start, flags) + escapeCharClass(end, flags);
    } else {
      result += escapeCharClass(start, flags) + "-" + escapeCharClass(end, flags);
    }
  }
  return "[" + result + "]";
}

// Check if the strings form a cartesian product of a set of atoms (substrings).
function isCartesian(strings) {
  if (!strings.includes("")) return false;
  let nonEmpty = strings.filter(s => s);
  if (nonEmpty.length == 0) return false;
  let minLen = Math.min(...nonEmpty.map(s => s.length));
  let atoms = nonEmpty.filter(s => s.length == minLen);
  let n = atoms.length;
  let generated = new Set();
  for (let mask = 0; mask < 1 << n; mask++) {
    let str = "";
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) str += atoms[i];
    }
    generated.add(str);
  }
  let uniqueStrings = new Set(strings);
  if (generated.size != uniqueStrings.size) return false;
  for (let s of generated) {
    if (!uniqueStrings.has(s)) return false;
  }
  // order atoms by appearance in input
  let inputNonEmpty = strings.filter(s => s);
  let orderedAtoms = [];
  let atomSet = new Set(atoms);
  for (let s of inputNonEmpty) {
    if (atomSet.has(s) && !orderedAtoms.includes(s)) orderedAtoms.push(s);
  }
  return orderedAtoms;
}

// Main function to build the regex pattern from the array of strings
function buildPattern(strings, flags = "") {
  if (strings.length == 0) return "";
  if (strings.length == 1) {
    let s = strings[0];
    if (s.length > 0) {
      for (let len = 1; len <= Math.floor(s.length / 2); len++) {
        if (s.length % len == 0) {
          let sub = s.slice(0, len);
          let rep = s.length / len;
          if (s == sub.repeat(rep)) {
            if (len == 1) {
              return escapeRegExp(sub, flags) + "{" + rep + "}";
            } else {
              return "(?:" + escapeRegExp(sub, flags) + "){" + rep + "}";
            }
          }
        }
      }
    }
    return escapeRegExp(s, flags);
  }

  // Check for cartesian products and empty string handling first
  if (strings.includes("")) {
    let atoms = isCartesian(strings);
    if (atoms) {
      if (atoms.length == 1) {
        let escaped = escapeRegExp(atoms[0], flags);
        if (atoms[0].length == 1 || isAtomic(escaped)) {
          return escaped + "?";
        } else {
          return "(?:" + escaped + ")?";
        }
      } else {
        return atoms.map(atom => "(?:" + escapeRegExp(atom, flags) + ")?").join("");
      }
    }
  }

  // Check for repetition
  // IMPORTANT: Do not double wrap or produce suboptimal repetition for basic cases handled by other logic
  let nonEmptyStrings = strings.filter(s => s.length > 0);
  if (nonEmptyStrings.length > 0) {
    let lens = nonEmptyStrings.map(s => s.length);
    let g = lens.reduce((a, b) => gcd(a, b), lens[0]);
    if (g > 0) {
      let sub = nonEmptyStrings[0].slice(0, g);
      if (nonEmptyStrings.every(s => s == sub.repeat(s.length / g))) {
        let reps = nonEmptyStrings.map(s => s.length / g).sort((a, b) => a - b);
        let minRep = strings.includes("") ? 0 : reps[0];
        let maxRep = reps[reps.length - 1];
        let quant;
        if (minRep == 0 && maxRep == 1) {
          quant = "?";
        } else if (minRep == maxRep) {
          quant = "{" + minRep + "}";
        } else {
          quant = "{" + minRep + "," + maxRep + "}";
        }

        if (g == 1) {
          return escapeRegExp(sub, flags) + quant;
        } else {
          return "(?:" + escapeRegExp(sub, flags) + ")" + quant;
        }
      }
    }
  }

  function isAtomic(pattern) {
    if (pattern.length == 1 && !/[|.*?+^$(){}\[\]\\]/.test(pattern)) return true;
    if (pattern.startsWith("\\u{") && pattern.endsWith("}") && !/[|]/.test(pattern)) return true;
    if (/^\\u[0-9A-Fa-f]{4}$/.test(pattern)) return true;
    if (/^\\.$/.test(pattern)) return true;
    if (/^\[[^\]]+\]$/.test(pattern)) return true;
    // Check for a balanced (?:...) or (?:...)? group
    if (pattern.startsWith("(?:") || pattern.startsWith("(")) {
      let open = 0;
      for (let i = 0; i < pattern.length; i++) {
        if (pattern[i] == "\\") {
          i++;
          continue;
        }
        if (pattern[i] == "(") open++;
        else if (pattern[i] == ")") {
          open--;
          if (open == 0) {
            // The closing paren is at i; rest is either empty or "?"
            let rest = pattern.slice(i + 1);
            return rest == "" || rest == "?";
          }
        }
      }
    }
    return false;
  }

  // Fallback for empty string if not handled by cartesian
  if (strings.includes("")) {
    let nonEmpty = strings.filter(s => s);
    if (nonEmpty.length == 0) {
      return "(?:)";
    }
    let alt = buildPattern(nonEmpty, flags);
    if (isAtomic(alt)) {
      return alt + "?";
    } else {
      return "(?:" + alt + ")?";
    }
  }

  let prefix = findCommonPrefix(strings);
  let suffix = findCommonSuffix(strings);

  if (flags.includes("u")) {
    if (prefix.length > 0) {
      let lastCode = prefix.charCodeAt(prefix.length - 1);
      if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
        prefix = prefix.slice(0, -1);
      }
    }
    if (suffix.length > 0) {
      let firstCode = suffix.charCodeAt(0);
      if (firstCode >= 0xdc00 && firstCode <= 0xdfff) {
        suffix = suffix.slice(1);
      }
    }
  }

  // Handle overlap: if prefix + suffix length > shortest string length
  let minLen = Math.min(...strings.map(s => s.length));
  if (prefix.length + suffix.length > minLen) {
    let overlap = prefix.length + suffix.length - minLen;
    // Heuristic: shorten the longer one or split difference?
    // Usually suffix is less strictly defined (regex engine usually parses left-to-right).
    // suffix = suffix.slice(overlap);
    prefix = prefix.slice(0, prefix.length - overlap);
  }

  if (suffix.length > 0 && prefix.length > 0) {
    // Ensure middle calculation is correct after overlap reduction
    // The prefix was reduced, so middle should start after the new prefix length
    // and end before the suffix length from the end.
    // So slicing by shorter prefix includes MORE characters.
    // Therefore, logic is correct as is: middle = s.slice(prefix.length, s.length - suffix.length);
  }

  let middle = strings.map(s => s.slice(prefix.length, s.length - suffix.length));

  if (prefix || suffix) {
    let middlePattern = buildPattern(middle, flags);
    // Check if middle is a repetition of prefix
    if (prefix && middlePattern.startsWith("(?:" + escapeRegExp(prefix, flags) + ")")) {
      let quantMatch = middlePattern.match(/^\\(\\?:[^)]+\\)\\{([^}]+)\\}$/);
      if (quantMatch) {
        let quant = quantMatch[1];
        let reps = quant.split(",").map(Number);
        let newMin = reps[0] + 1;
        let newMax = reps[1] ? reps[1] + 1 : newMin;
        let newQuant = newMin == newMax ? `{${newMin}}` : `{${newMin},${newMax}}`;
        return "(?:" + escapeRegExp(prefix, flags) + ")" + newQuant + escapeRegExp(suffix, flags);
      }
    }
    if (middlePattern.includes("|") && (prefix || suffix) && !isAtomic(middlePattern)) {
      middlePattern = "(?:" + middlePattern + ")";
    }

    // Check if middlePattern + prefix matches repetition (e.g. carcar... -> (?:car){...})
    // This is hard because prefix is fixed.
    return escapeRegExp(prefix, flags) + middlePattern + escapeRegExp(suffix, flags);
  }

  // Check for repetition of a substring at the START of huge string
  if (strings.length == 1 && strings[0].length > 10) {
    // Simple heuristic for single string repetition
    let s = strings[0];
    for (let len = 1; len <= s.length / 2; len++) {
      let sub = s.slice(0, len);
      // Check how many times sub repeats at start
      let count = 0;
      let pos = 0;
      while (s.startsWith(sub, pos)) {
        count++;
        pos += len;
      }
      if (count > 3 && pos > 0) {
        // arbitrary threshold
        let rest = s.slice(pos);
        // If rest is small or empty, optimize
        // Return (?:sub){count}rest
        return "(?:" + escapeRegExp(sub, flags) + "){" + count + "}" + escapeRegExp(rest, flags);
      }
    }
  }

  // Try to group by common prefix or suffix if no global prefix/suffix found
  if (!prefix && !suffix && strings.length > 1) {
    const tryGroup = getChar => {
      let groups = new Map();
      let charOrder = [];
      for (let s of strings) {
        if (s.length == 0) continue;
        let char = getChar(s);
        if (!char) continue;
        if (!groups.has(char)) {
          groups.set(char, []);
          charOrder.push(char);
        }
        groups.get(char).push(s);
      }
      return groups.size < strings.length ? {groups, charOrder} : null;
    };

    // Build alternation from groups, then try to factor a common textual prefix from the parts
    const buildFromGroups = (groups, charOrder) => {
      let parts = charOrder.map(char => buildPattern(groups.get(char), flags));
      // Try to factor common text prefix from the pattern strings
      if (parts.length >= 2) {
        let commonPfx = findCommonPrefix(parts);
        // Only factor if prefix is non-empty and doesn't end mid-escape or mid-group
        // Also reject if prefix ends mid-escape: \uXX, \u{..., \xX, etc.
        const midEscape = /\\(?:u\{[0-9A-Fa-f]*|u[0-9A-Fa-f]{0,3}|x[0-9A-Fa-f]{0,1})$/.test(
          commonPfx,
        );
        if (
          commonPfx.length > 0 &&
          !commonPfx.endsWith("\\") &&
          !/\|/.test(commonPfx) &&
          !midEscape
        ) {
          // Ensure prefix ends on an atomic boundary (not mid-char-class or mid-group)
          // Find largest valid prefix that closes all brackets/parens
          let validPfx = commonPfx;
          let open = 0;
          let inClass = false;
          for (let i = 0; i < validPfx.length; i++) {
            let c = validPfx[i];
            if (c == "\\") {
              i++;
              continue;
            }
            if (c == "[") {
              inClass = true;
              continue;
            }
            if (c == "]") {
              inClass = false;
              continue;
            }
            if (inClass) continue;
            if (c == "(") open++;
            else if (c == ")") open--;
          }
          if (open != 0 || inClass) {
            // Trim back to last safe position — for simplicity just skip factoring
            validPfx = "";
          }
          if (validPfx.length > 0) {
            let rests = parts.map(p => p.slice(validPfx.length));
            // If any rest starts with a quantifier, the prefix split landed mid-atom
            // (e.g. prefix "b" extracted from "b?cd" leaving rest "?cd"). Skip factoring.
            if (rests.some(r => /^[?*+{]/.test(r))) {
              validPfx = "";
            }
          }
          if (validPfx.length > 0) {
            let rests = parts.map(p => p.slice(validPfx.length));
            // If all rests are empty except possibly one, or if rests form a simple optional
            let nonEmpty = rests.filter(r => r != "");
            if (nonEmpty.length == 0) {
              return validPfx;
            } else if (nonEmpty.length == rests.length) {
              // All rests non-empty: form alternation of rests
              let restAlt = rests.join("|");
              let wrapped = isAtomic(restAlt) ? restAlt : "(?:" + restAlt + ")";
              return validPfx + wrapped;
            } else if (rests.filter(r => r == "").length > 0 && nonEmpty.length == 1) {
              // One rest is empty — the other becomes optional
              let rest = nonEmpty[0];
              return validPfx + (isAtomic(rest) ? rest + "?" : "(?:" + rest + ")?");
            } else {
              // Mixed: some empty, some not — treat empties + non-empties as optional group
              let restAlt = rests.join("|");
              let wrapped = isAtomic(restAlt) ? restAlt : "(?:" + restAlt + ")";
              return validPfx + wrapped;
            }
          }
        }
      }
      return parts.join("|");
    };

    let firstCharGroup = tryGroup(s => [...s][0]);
    let lastCharGroup = tryGroup(s => {
      let cp = [...s];
      return cp[cp.length - 1];
    });

    if (firstCharGroup || lastCharGroup) {
      let firstResult =
        firstCharGroup ? buildFromGroups(firstCharGroup.groups, firstCharGroup.charOrder) : null;
      let lastResult = null;
      if (lastCharGroup) {
        // Sort groups by descending size for better compression, ties preserve input order
        let lastOrder = [...lastCharGroup.charOrder].sort(
          (a, b) => lastCharGroup.groups.get(b).length - lastCharGroup.groups.get(a).length,
        );
        lastResult = buildFromGroups(lastCharGroup.groups, lastOrder);
      }

      if (firstResult != null && lastResult != null) {
        // Prefer fewer groups; on tie, prefer shorter result
        let firstGroups = firstCharGroup.groups.size;
        let lastGroups = lastCharGroup.groups.size;
        return (
            lastGroups < firstGroups ||
              (lastGroups == firstGroups && lastResult.length < firstResult.length)
          ) ?
            lastResult
          : firstResult;
      }
      return firstResult ?? lastResult;
    }
  }

  // Use iterator to check code point count, not length property
  // Check if all are single characters (handling Unicode code points correctly)
  if (strings.every(s => [...s].length == 1)) {
    let isUnicode = flags.includes("u");
    if (isUnicode || !strings.some(s => s.length > 1)) {
      return makeCharClass(
        strings.map(s => [...s][0]),
        flags,
      );
    }
  }

  // Alternation
  return strings.map(s => escapeRegExp(s, flags)).join("|");
}
