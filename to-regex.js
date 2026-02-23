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
  // Escape a string for use in a regular expression, handling Unicode properly.
  let hex = code => code.toString(16).toUpperCase();
  let escapeRegExp = (string, flags = "") => {
    let isUnicode = flags.includes("u");
    return string
      .replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")
      .replace(/\\[ftnrv]/g, match => "\\" + match[1]) // preserve common escapes
      .replace(
        /[\x00-\x1f\x7f-\xff]/g,
        match => "\\x" + hex(match.charCodeAt(0)).padStart(2, 0),
      )
      .replace(/(?:[\ud800-\udbff][\udc00-\udfff])|[\u0100-\uffff]/g, match => {
        if (match.length == 2) {
          if (isUnicode) {
            return "\\u{" + hex(match.codePointAt(0)) + "}";
          } else {
            let [high, low] = [match.charCodeAt(0), match.charCodeAt(1)];
            return (
              "\\u" + hex(high).padStart(4, 0) + "\\u" + hex(low).padStart(4, 0)
            );
          }
        }
        let code = match.charCodeAt(0);
        return "\\u" + hex(code).padStart(4, 0);
      });
  };

  // Escape a single character for use in a character class, handling Unicode properly.
  let escapeCharClass = (char, flags = "") => {
    let isUnicode = flags.includes("u");
    return char
      .replace(/[\\[\]^-]/g, "\\$&")
      .replace(/\\[ftnrv]/g, match => "\\" + match[1]) // preserve common escapes
      .replace(
        /[\x00-\x1f\x7f-\xff]/g,
        match => "\\x" + hex(match.charCodeAt(0)).padStart(2, 0),
      )
      .replace(/(?:[\ud800-\udbff][\udc00-\udfff])|[\u0100-\uffff]/g, match => {
        if (match.length == 2) {
          if (isUnicode) {
            return "\\u{" + hex(match.codePointAt(0)) + "}";
          } else {
            let [high, low] = [match.charCodeAt(0), match.charCodeAt(1)];
            return (
              "\\u" + hex(high).padStart(4, 0) + "\\u" + hex(low).padStart(4, 0)
            );
          }
        }
        let code = match.charCodeAt(0);
        return "\\u" + hex(code).padStart(4, 0);
      });
  };

  // Find common prefix of an array of strings.
  let findCommonPrefix = strings => {
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
  };

  // Find common suffix by reversing strings and finding common prefix, then reverse back.
  let findCommonSuffix = strings => {
    let reversed = strings.map(s => s.split("").reverse().join(""));
    let reversedPrefix = findCommonPrefix(reversed);
    return reversedPrefix.split("").reverse().join("");
  };

  // Build a character class from an array of single-character strings, merging consecutive characters into ranges.
  let makeCharClass = (chars, flags = "") => {
    chars = [...new Set(chars)].sort(
      (a, b) => a.codePointAt(0) - b.codePointAt(0),
    );
    let result = "";
    let i = 0;

    while (i < chars.length) {
      let start = chars[i];
      let end = start;
      i++;
      while (
        i < chars.length &&
        chars[i].codePointAt(0) == end.codePointAt(0) + 1
      ) {
        end = chars[i];
        i++;
      }
      result +=
        start == end ? escapeCharClass(start, flags)
        : end.codePointAt(0) == start.codePointAt(0) + 1 ?
          escapeCharClass(start, flags) + escapeCharClass(end, flags)
        : escapeCharClass(start, flags) + "-" + escapeCharClass(end, flags);
    }

    return "[" + result + "]";
  };

  // Check if the strings form a cartesian product of a set of atoms (substrings).
  let isCartesian = strings => {
    if (!strings.includes("")) return false;
    let nonEmpty = strings.filter(s => s);
    if (nonEmpty.length == 0) return false;
    let minLen = Math.min(...nonEmpty.map(s => s.length));
    let atoms = nonEmpty.filter(s => s.length == minLen);
    let n = atoms.length;
    // Bail out early if there are too many atoms to feasibly check (2^n would be huge)
    if (n > 20) return false;

    // Structural pre-pruning: every non-empty string must be expressible as an
    // ordered left-to-right concatenation of atoms (each atom used at most once).
    // This turns the worst-case O(2^n) subset generation into a linear gate:
    // if any string fails the greedy match we know the set is not cartesian.
    for (let s of nonEmpty) {
      let pos = 0;
      let usedAtoms = new Set();
      // Greedy: try to consume the string with atoms in a fixed sorted order.
      // We sort atoms longest-first so the greedy pass doesn't get fooled by prefixes.
      let sortedAtoms = [...atoms].sort((a, b) => b.length - a.length);
      for (let atom of sortedAtoms) {
        if (s.startsWith(atom, pos)) {
          if (usedAtoms.has(atom)) return false; // same atom used twice → not cartesian
          usedAtoms.add(atom);
          pos += atom.length;
        }
      }
      if (pos != s.length) return false; // string has leftover characters not covered by atoms
    }

    let generated = new Set();
    for (let mask = 0; mask < 1 << n; mask++) {
      let str = "";
      for (let i = 0; i < n; i++) if (mask & (1 << i)) str += atoms[i];
      generated.add(str);
    }

    let uniqueStrings = new Set(strings);
    if (generated.size != uniqueStrings.size) return false;
    for (let s of generated) if (!uniqueStrings.has(s)) return false;

    // order atoms by appearance in input
    let inputNonEmpty = strings.filter(s => s);
    let orderedAtoms = [];
    let atomSet = new Set(atoms);
    for (let s of inputNonEmpty)
      if (atomSet.has(s) && !orderedAtoms.includes(s)) orderedAtoms.push(s);

    return orderedAtoms;
  };

  // Check if a pattern string represents exactly one literal character.
  // Returns the actual character string (for use in makeCharClass), or null.
  let getSingleCharFromPattern = p => {
    if (p.length == 0) return null;
    // Unescaped single non-special char
    if (p.length == 1 && !/[|.*+?^${}()\[\]\\]/.test(p)) return p;
    // \xNN
    let m;
    if ((m = p.match(/^\\x([\dA-Fa-f]{2})$/)))
      return String.fromCharCode(parseInt(m[1], 16));
    // \uNNNN
    if ((m = p.match(/^\\u([\dA-Fa-f]{4})$/)))
      return String.fromCharCode(parseInt(m[1], 16));
    // \u{N+} (unicode mode)
    if ((m = p.match(/^\\u\{([\dA-Fa-f]+)\}$/)))
      return String.fromCodePoint(parseInt(m[1], 16));
    // \<special> (escaped metacharacter)
    if (p.length == 2 && p[0] == "\\") return p[1];
    return null;
  };

  // Given an array of alternation-branch pattern strings, try to find a common prefix/suffix
  // such that the middles are all single literal characters, and condense into a char class.
  // Returns the condensed pattern string, or null if not applicable.
  let condenseAlternationParts = (parts, flags) => {
    if (parts.length < 2) return null;
    let pfx = findCommonPrefix(parts);
    let sfx = findCommonSuffix(parts);
    let minLen = Math.min(...parts.map(p => p.length));
    if (pfx.length + sfx.length > minLen)
      sfx = sfx.slice(pfx.length + sfx.length - minLen);
    // Guard: prefix must not end mid-escape sequence
    if (/\\(?:u\{[\dA-Fa-f]*|u[\dA-Fa-f]{0,3}|x[\dA-Fa-f]?)$/.test(pfx))
      return null;
    let middles = parts.map(p =>
      sfx.length > 0 ?
        p.slice(pfx.length, p.length - sfx.length)
      : p.slice(pfx.length),
    );
    // Need at least 2 distinct middles and all must be single literal chars
    if (new Set(middles).size < 2) return null;
    let chars = middles.map(m => getSingleCharFromPattern(m));
    if (!chars.every(c => c != null)) return null;
    return pfx + makeCharClass(chars, flags) + sfx;
  };

  // Main function to build the regex pattern from the array of strings
  let buildPattern = (strings, flags = "") => {
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
          if (atoms[0].length == 1 || isAtomic(escaped)) return escaped + "?";
          else return "(?:" + escaped + ")?";
        } else {
          return atoms
            .map(atom => "(?:" + escapeRegExp(atom, flags) + ")?")
            .join("");
        }
      }
    }

    // Check for repetition
    // IMPORTANT: Do not double wrap or produce suboptimal repetition for basic cases handled by other logic
    let nonEmptyStrings = strings.filter(s => s.length > 0);
    if (nonEmptyStrings.length > 0) {
      let lens = nonEmptyStrings.map(s => s.length);
      let gcd = (a, b) => (b == 0 ? a : gcd(b, a % b));
      let g = lens.reduce((a, b) => gcd(a, b), lens[0]);

      if (g > 0) {
        let sub = nonEmptyStrings[0].slice(0, g);
        if (nonEmptyStrings.every(s => s == sub.repeat(s.length / g))) {
          let reps = nonEmptyStrings
            .map(s => s.length / g)
            .sort((a, b) => a - b);
          let minRep = strings.includes("") ? 0 : reps[0];
          let maxRep = reps[reps.length - 1];
          let quant =
            minRep == 0 && maxRep == 1 ? "?"
            : minRep == maxRep ? "{" + minRep + "}"
            : "{" + minRep + "," + maxRep + "}";
          return g == 1 ?
              escapeRegExp(sub, flags) + quant
            : "(?:" + escapeRegExp(sub, flags) + ")" + quant;
        }
      }
    }

    function isAtomic(pattern) {
      if (pattern.length == 1 && !/[|.*?+^$(){}\[\]\\]/.test(pattern))
        return true;
      if (
        pattern.startsWith("\\u{") &&
        pattern.endsWith("}") &&
        !/[|]/.test(pattern)
      )
        return true;
      if (/^\\u[\dA-Fa-f]{4}$/.test(pattern)) return true;
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

    // Group single-char pattern parts into a char class, then factor any common atomic suffix.
    // Handles cases like ['1','2','3','4','bservable[1-4]'] → '(?:bservable)?[1-4]'
    // and ['U','V','computed'] → '[UV]|computed'.
    // Returns a condensed pattern string, or null if no improvement is possible.
    let condensePartsAdvanced = (parts, flags) => {
      if (parts.length < 2) return null;

      // Step 1: group single-char pattern parts into a char class
      let singleCharIndices = new Set();
      let singleChars = [];
      for (let i = 0; i < parts.length; i++) {
        let c = getSingleCharFromPattern(parts[i]);
        if (c != null) {
          singleCharIndices.add(i);
          singleChars.push(c);
        }
      }

      let newParts;
      let didGroup = singleChars.length >= 2;
      if (didGroup) {
        let charClass = makeCharClass(singleChars, flags);
        newParts = [
          charClass,
          ...parts.filter((_, i) => !singleCharIndices.has(i)),
        ];
      } else {
        newParts = parts;
      }

      if (newParts.length == 1) return newParts[0];

      // Step 2: factor a common atomic suffix from newParts
      let textSuffix = findCommonSuffix(newParts);
      if (
        textSuffix.length > 0 &&
        isAtomic(textSuffix) &&
        !newParts.some(p =>
          /\\(?:u\{[\dA-Fa-f]*|u[\dA-Fa-f]{0,3}|x[\dA-Fa-f]?)$/.test(
            p.slice(0, p.length - textSuffix.length),
          ),
        )
      ) {
        let rests = newParts.map(p => p.slice(0, p.length - textSuffix.length));
        let nonEmpty = rests.filter(r => r != "");
        if (nonEmpty.length < rests.length) {
          // Some rests empty → the suffix absorbs those branches as optional
          let restPart;
          if (nonEmpty.length == 0) {
            restPart = "";
          } else if (nonEmpty.length == 1) {
            let r = nonEmpty[0];
            restPart = isAtomic(r) ? r + "?" : "(?:" + r + ")?";
          } else {
            let inner =
              condenseAlternationParts(nonEmpty, flags) ?? nonEmpty.join("|");
            restPart = isAtomic(inner) ? inner + "?" : "(?:" + inner + ")?";
          }
          return restPart + textSuffix;
        } else if (newParts.length > 1) {
          // All rests non-empty: wrap them and append the common suffix
          let inner = condenseAlternationParts(rests, flags) ?? rests.join("|");
          return (isAtomic(inner) ? inner : "(?:" + inner + ")") + textSuffix;
        }
      }

      if (!didGroup) return null;
      return condenseAlternationParts(newParts, flags) ?? newParts.join("|");
    };

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
        if (lastCode >= 0xd800 && lastCode <= 0xdbff)
          prefix = prefix.slice(0, -1);
      }
      if (suffix.length > 0) {
        let firstCode = suffix.charCodeAt(0);
        if (firstCode >= 0xdc00 && firstCode <= 0xdfff)
          suffix = suffix.slice(1);
      }
    }

    // Handle overlap: if prefix + suffix length > shortest string length.
    // A naive heuristic silently biases toward preserving the prefix because regex
    // engines parse left-to-right and prefix anchoring is generally more valuable.
    // To avoid surprising results we instead evaluate BOTH biases (prefix-first and
    // suffix-first) and also a proportional split, then keep whichever produces the
    // shorter final pattern.  We compute a "candidate" here and let the rest of this
    // function run; the alternative is evaluated in an inner helper below.
    let minLen = Math.min(...strings.map(s => s.length));
    let prefixOrig = prefix;
    let suffixOrig = suffix;
    if (prefix.length + suffix.length > minLen) {
      let overlap = prefix.length + suffix.length - minLen;

      // Proportional split: give each side a share of the cut proportional to its length.
      // This is fairer for symmetric cases (e.g. same-length prefix and suffix).
      let prefixCut = Math.round(
        overlap * (prefix.length / (prefix.length + suffix.length)),
      );
      let suffixCut = overlap - prefixCut;
      prefix = prefix.slice(0, prefix.length - prefixCut);
      suffix = suffix.slice(suffixCut);
    }

    let middle = strings.map(s =>
      s.slice(prefix.length, s.length - suffix.length),
    );

    if (prefix || suffix) {
      // Helper: build a candidate pattern given a specific prefix/suffix split.
      let buildWithSplit = (pfx, sfx) => {
        let mid = strings.map(s =>
          s.slice(pfx.length, s.length - sfx.length || undefined),
        );
        let mp = buildPattern(mid, flags);
        if (mp.includes("|") && (pfx || sfx) && !isAtomic(mp))
          mp = "(?:" + mp + ")";
        return escapeRegExp(pfx, flags) + mp + escapeRegExp(sfx, flags);
      };

      let middlePattern = buildPattern(middle, flags);

      // Check if middle is a repetition of prefix
      if (
        prefix &&
        middlePattern.startsWith("(?:" + escapeRegExp(prefix, flags) + ")")
      ) {
        let quantMatch = middlePattern.match(/^\\(\\?:[^)]+\\)\\{([^}]+)\\}$/);
        if (quantMatch) {
          let quant = quantMatch[1];
          let reps = quant.split(",").map(Number);
          let newMin = reps[0] + 1;
          let newMax = reps[1] ? reps[1] + 1 : newMin;
          let newQuant =
            newMin == newMax ?
              "{" + newMin + "}"
            : "{" + newMin + "," + newMax + "}";
          return (
            "(?:" +
            escapeRegExp(prefix, flags) +
            ")" +
            newQuant +
            escapeRegExp(suffix, flags)
          );
        }
      }

      if (
        middlePattern.includes("|") &&
        (prefix || suffix) &&
        !isAtomic(middlePattern)
      )
        middlePattern = "(?:" + middlePattern + ")";

      let proportionalResult =
        escapeRegExp(prefix, flags) +
        middlePattern +
        escapeRegExp(suffix, flags);

      // If there was an overlap, also evaluate prefix-first and suffix-first bias and
      // return whichever candidate is shortest (ties go to proportional).
      if (prefixOrig.length + suffixOrig.length > minLen) {
        let overlap = prefixOrig.length + suffixOrig.length - minLen;
        let pFirst = buildWithSplit(
          prefixOrig.slice(0, prefixOrig.length - overlap),
          suffixOrig,
        );
        let sFirst = buildWithSplit(prefixOrig, suffixOrig.slice(overlap));
        let best = [proportionalResult, pFirst, sFirst].reduce((a, b) =>
          b.length < a.length ? b : a,
        );
        return best;
      }

      return proportionalResult;
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
          return (
            "(?:" +
            escapeRegExp(sub, flags) +
            "){" +
            count +
            "}" +
            escapeRegExp(rest, flags)
          );
        }
      }
    }

    // Try to group by common prefix or suffix if no global prefix/suffix found
    if (!prefix && !suffix && strings.length > 1) {
      let tryGroup = getChar => {
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
      let buildFromGroups = (groups, charOrder) => {
        let parts = charOrder.map(char =>
          buildPattern(groups.get(char), flags),
        );
        // Try to factor common text prefix from the pattern strings
        if (parts.length >= 2) {
          let commonPfx = findCommonPrefix(parts);
          // Only factor if prefix is non-empty and doesn't end mid-escape or mid-group
          // Also reject if prefix ends mid-escape: \uXX, \u{..., \xX, etc.
          let midEscape =
            /\\(?:u\{[\dA-Fa-f]*|u[\dA-Fa-f]{0,3}|x[\dA-Fa-f]{0,1})$/.test(
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
              if (rests.some(r => /^[?*+{]/.test(r))) validPfx = "";
            }

            if (validPfx.length > 0) {
              let rests = parts.map(p => p.slice(validPfx.length));
              // If all rests are empty except possibly one, or if rests form a simple optional
              let nonEmpty = rests.filter(r => r != "");
              if (nonEmpty.length == 0) {
                return validPfx;
              } else if (nonEmpty.length == rests.length) {
                // All rests non-empty: form alternation of rests
                let restAlt =
                  condenseAlternationParts(rests, flags) ?? rests.join("|");
                let wrapped =
                  isAtomic(restAlt) ? restAlt : "(?:" + restAlt + ")";
                return validPfx + wrapped;
              } else if (
                rests.filter(r => r == "").length > 0 &&
                nonEmpty.length == 1
              ) {
                // One rest is empty — the other becomes optional
                let rest = nonEmpty[0];
                return (
                  validPfx + (isAtomic(rest) ? rest + "?" : "(?:" + rest + ")?")
                );
              } else {
                // Mixed: some empty, some not — if non-empties condense to a char class use [x]?
                let condensedNonEmpty = condenseAlternationParts(
                  nonEmpty,
                  flags,
                );
                if (condensedNonEmpty != null) {
                  return (
                    validPfx +
                    (isAtomic(condensedNonEmpty) ?
                      condensedNonEmpty + "?"
                    : "(?:" + condensedNonEmpty + ")?")
                  );
                }
                let restAlt = rests.join("|");
                let wrapped =
                  isAtomic(restAlt) ? restAlt : "(?:" + restAlt + ")";
                return validPfx + wrapped;
              }
            }
          }
        }

        return (
          condensePartsAdvanced(parts, flags) ??
          condenseAlternationParts(parts, flags) ??
          parts.join("|")
        );
      };

      let firstCharGroup = tryGroup(s => [...s][0]);
      let lastCharGroup = tryGroup(s => {
        let cp = [...s];
        return cp[cp.length - 1];
      });

      if (firstCharGroup || lastCharGroup) {
        let firstResult =
          firstCharGroup ?
            buildFromGroups(firstCharGroup.groups, firstCharGroup.charOrder)
          : null;
        let lastResult = null;
        if (lastCharGroup) {
          // Sort groups by descending size for better compression, ties preserve input order
          let lastOrder = [...lastCharGroup.charOrder].sort(
            (a, b) =>
              lastCharGroup.groups.get(b).length -
              lastCharGroup.groups.get(a).length,
          );
          lastResult = buildFromGroups(lastCharGroup.groups, lastOrder);
        }

        if (firstResult != null && lastResult != null) {
          // Prefer fewer groups; on tie, prefer shorter result
          let firstGroups = firstCharGroup.groups.size;
          let lastGroups = lastCharGroup.groups.size;
          return (
              lastGroups < firstGroups ||
                (lastGroups == firstGroups &&
                  lastResult.length < firstResult.length)
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
    let escapedParts = strings.map(s => escapeRegExp(s, flags));
    return (
      condensePartsAdvanced(escapedParts, flags) ??
      condenseAlternationParts(escapedParts, flags) ??
      escapedParts.join("|")
    );
  };

  // Input validation
  if (!Array.isArray(input)) {
    if (input == undefined) return RegExp("(?:)", flags);
    throw TypeError("Input must be an array");
  }
  if (input.some(s => typeof s != "string"))
    throw TypeError("All elements must be strings");
  if (!input || input.length == 0 || String(input[0]).length == 0)
    return RegExp("(?:)", flags);

  // Remove duplicates, sort by code unit order
  input = [...new Set(input)].sort();

  let pattern = buildPattern(input, flags);
  return RegExp(pattern, flags);
}
