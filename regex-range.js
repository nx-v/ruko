let {max} = Math

let getMaxDigit = base => {
  if (base <= 10) return String(base - 1)
  return String.fromCharCode(97 + base - 11) // 'a' + offset for base 11+
}

let toBaseString = (num, base) => {
  if (base == 10) return String(num)
  let result = num.toString(base)
  return num < 0 ? '-' + result.slice(1) : result
}

let parseBase = (str, base) => parseInt(str, base)

let isNumber = v =>
  (typeof v == 'number' && v - v == 0)
  || (typeof v == 'string' && Number.isFinite(+v) && v.trim() != '')

let splitToPatterns = (min, max, tok, options) => {
  let ranges = splitToRanges(min, max, tok.base)
  let tokens = []
  let start = min
  let prev
  let base = tok.base || 10

  for (let i = 0; i < ranges.length; i++) {
    let max = ranges[i]
    let obj = rangeToPattern(
      toBaseString(start, base),
      toBaseString(max, base),
      options,
    )
    let zeros = ''

    if (!tok.isPadded && prev && prev.pattern == obj.pattern) {
      if (prev.count.length > 1) prev.count.pop()

      prev.count.push(obj.count[0])
      prev.string = prev.pattern + toQuantifier(prev.count)
      start = max + 1
      continue
    }

    if (tok.isPadded) zeros = padZeros(max, tok, options)

    obj.string = zeros + obj.pattern + toQuantifier(obj.count)
    tokens.push(obj)
    start = max + 1
    prev = obj
  }

  return tokens.reverse()
}

let filterPatterns = (arr, comparison, prefix, intersection, options) => {
  let result = []

  for (let ele of arr) {
    let {string} = ele

    // only push if _both_ are negative...
    if (!intersection && !contains(comparison, 'string', string))
      result.push(prefix + string)

    // or _both_ are positive
    if (intersection && contains(comparison, 'string', string))
      result.push(prefix + string)
  }
  return result
}

// Zip strings
function zip(a, b) {
  let arr = []
  for (let i = 0; i < a.length; i++) arr.push([a[i], b[i]])
  return arr
}

let compare = (a, b) =>
  a > b ? 1
  : b > a ? -1
  : 0

let contains = (arr, key, val) => arr.some(ele => ele[key] == val)

let countMaxDigits = (min, len, base = 10) => {
  let maxDigit = getMaxDigit(base)
  let str = toBaseString(min, base)
  let prefix = str.slice(0, -len)
  let suffix = maxDigit.repeat(len)
  return parseBase(prefix + suffix, base)
}

let countZeros = (integer, zeros, base = 10) =>
  integer - (integer % Math.pow(base, zeros))

let toQuantifier = digits => {
  let [start = 0, stop = ''] = digits
  if (stop || start > 1) return `{${start + (stop ? ',' + stop : '')}}`
  return ''
}

let toCharacterClass = (a, b, options) => {
  // Helper to get numeric value of a digit character
  let charToNum = c => {
    if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48
    if (c >= 'a' && c <= 'z') return c.charCodeAt(0) - 97 + 10
    return 0
  }

  let aNum = charToNum(a)
  let bNum = charToNum(b)
  let diff = bNum - aNum

  if (aNum <= 9 && bNum >= 10) {
    let digitEnd = Math.min(9, bNum)
    let letterStart = Math.max(10, aNum)
    let parts = []
    if (aNum <= 9) {
      let digitA = aNum < 10 ? String.fromCharCode(48 + aNum) : a
      let digitB = String.fromCharCode(48 + digitEnd)
      parts.push(digitA == digitB ? digitA : `${digitA}-${digitB}`)
    }
    if (letterStart <= bNum) {
      let letterEnd = bNum
      let letterA = String.fromCharCode(97 + letterStart - 10)
      let letterB = String.fromCharCode(97 + letterEnd - 10)
      parts.push(letterA == letterB ? letterA : `${letterA}-${letterB}`)
    }
    return `[${parts.join('')}]`
  } else {
    let aCode = a.charCodeAt(0)
    let bCode = b.charCodeAt(0)
    let isConsecutive = bCode - aCode == diff
    return `[${a}${isConsecutive && diff > 1 ? '-' : ''}${b}]`
  }
}

let hasPadding = str => /^-?(0+)\d/.test(str)

let padZeros = (value, tok, options) => {
  if (!tok.isPadded) return value

  let diff = Math.abs(tok.maxLen - String(value).length)
  let relax = options.relaxZeros != false

  switch (diff) {
    case 0:
      return ''
    case 1:
      return relax ? '0?' : '0'
    case 2:
      return relax ? '0{0,2}' : '00'
    default:
      return relax ? `0{0,${diff}}` : `0{${diff}}`
  }
}

let toRegexRange = (min, max, options) => {
  if (isNumber(min) == false)
    throw TypeError('toRegexRange: expected the first argument to be a number')

  if (max == void 0 || min == max) return String(min)

  if (isNumber(max) == false)
    throw TypeError(
      'toRegexRange: expected the second argument to be a number.',
    )

  let opts = {relaxZeros: true, base: 10, ...options}
  if (typeof opts.strictZeros == 'boolean')
    opts.relaxZeros = opts.strictZeros == false

  let base = Math.max(2, Math.min(36, Math.floor(opts.base)))

  let relax = String(opts.relaxZeros)
  let shorthand = String(opts.shorthand)
  let capture = String(opts.capture)
  let wrap = String(opts.wrap)
  let cacheKey =
    min + ':' + max + '=' + relax + shorthand + capture + wrap + base

  if (toRegexRange.cache.hasOwnProperty(cacheKey))
    return toRegexRange.cache[cacheKey].result

  let a = Math.min(min, max)
  let b = Math.max(min, max)

  if (Math.abs(a - b) == 1) {
    let result = min + '|' + max
    if (opts.capture) return `(${result})`
    if (opts.wrap == false) return result
    return `(?:${result})`
  }

  let isPadded = hasPadding(min) || hasPadding(max)
  let state = {min, max, a, b, base}
  let positives = []
  let negatives = []

  if (isPadded) {
    state.isPadded = isPadded
    state.maxLen = String(state.max).length
  }

  if (a < 0) {
    let newMin = b < 0 ? Math.abs(b) : 1
    negatives = splitToPatterns(newMin, Math.abs(a), state, opts)
    a = state.a = 0
  }

  if (b >= 0) positives = splitToPatterns(a, b, state, opts)

  state.negatives = negatives
  state.positives = positives
  state.result = collatePatterns(negatives, positives, opts)

  if (opts.capture == true) state.result = `(${state.result})`
  else if (opts.wrap != false && positives.length + negatives.length > 1)
    state.result = `(?:${state.result})`

  toRegexRange.cache[cacheKey] = state
  return state.result
}

let tokenizePattern = pattern => {
  let tokens = []
  for (let i = 0; i < pattern.length; ) {
    if (pattern[i] === '[') {
      let j = pattern.indexOf(']', i)
      let tok = pattern.slice(i, j + 1)
      i = j + 1
      if (i < pattern.length && pattern[i] === '{') {
        let k = pattern.indexOf('}', i)
        tok += pattern.slice(i, k + 1)
        i = k + 1
      }
      tokens.push(tok)
    } else if (pattern[i] === '\\') {
      let tok = pattern.slice(i, i + 2)
      i += 2
      if (i < pattern.length && pattern[i] === '{') {
        let k = pattern.indexOf('}', i)
        tok += pattern.slice(i, k + 1)
        i = k + 1
      }
      tokens.push(tok)
    } else {
      let tok = pattern[i++]
      if (i < pattern.length && pattern[i] === '?') tok += pattern[i++]
      else if (i < pattern.length && pattern[i] === '{') {
        let k = pattern.indexOf('}', i)
        tok += pattern.slice(i, k + 1)
        i = k + 1
      }
      tokens.push(tok)
    }
  }
  return tokens
}

let isAtomicRegex = str => {
  if (str.length <= 1) return true
  if (str[0] === '\\' && str.length === 2) return true
  if (str[0] === '[') return str.indexOf(']') === str.length - 1
  if (str.startsWith('(?:')) {
    let depth = 0
    for (let i = 0; i < str.length; i++) {
      if (str[i] === '(') depth++
      else if (str[i] === ')') depth--
      if (depth === 0) return i === str.length - 1
    }
  }
  return false
}

let makeGroupOptional = str => {
  if (!str) return ''
  return isAtomicRegex(str) ? str + '?' : '(?:' + str + ')?'
}

let factorToAlts = arrays => {
  let deduped = [],
    seen = new Set()
  for (let arr of arrays) {
    let key = arr.join('\0')
    if (!seen.has(key)) {
      seen.add(key)
      deduped.push(arr)
    }
  }
  arrays = deduped
  if (!arrays.length) return []
  if (arrays.length === 1) return [arrays[0].join('')]

  let pLen = 0
  outer: while (pLen < arrays[0].length) {
    let tok = arrays[0][pLen]
    for (let i = 1; i < arrays.length; i++)
      if (pLen >= arrays[i].length || arrays[i][pLen] !== tok) break outer
    pLen++
  }
  let prefix = arrays[0].slice(0, pLen).join('')
  let tails = arrays.map(a => a.slice(pLen))
  let hasEmpty = tails.some(t => !t.length)
  let nonEmpty = tails.filter(t => t.length)

  if (!nonEmpty.length) return [prefix]

  let groups = new Map(),
    order = []
  for (let t of nonEmpty) {
    let first = t[0]
    if (!groups.has(first)) {
      groups.set(first, [])
      order.push(first)
    }
    groups.get(first).push(t.slice(1))
  }

  let contAlts = []
  for (let tok of order) {
    let rests = groups.get(tok)
    if (rests.length === 1) {
      contAlts.push(tok + rests[0].join(''))
      continue
    }
    let subAlts = factorToAlts(rests)
    let expandedParts = subAlts.map(a => tok + a)
    let expandedCost =
      expandedParts.reduce((s, a) => s + a.length, 0) + expandedParts.length - 1
    let groupedPart =
      subAlts.length === 1 ?
        tok + subAlts[0]
      : tok + '(?:' + subAlts.join('|') + ')'
    if (groupedPart.length <= expandedCost) {
      contAlts.push(groupedPart)
    } else {
      contAlts.push(...expandedParts)
    }
  }

  if (prefix || hasEmpty) {
    let expanded =
      hasEmpty ?
        [prefix, ...contAlts.map(c => prefix + c)]
      : contAlts.map(c => prefix + c)
    let expandedLen =
      expanded.reduce((s, a) => s + a.length, 0) + expanded.length - 1

    let body
    if (!contAlts.length) return [prefix]
    if (contAlts.length === 1) {
      body = hasEmpty ? makeGroupOptional(contAlts[0]) : contAlts[0]
    } else {
      let joined = '(?:' + contAlts.join('|') + ')'
      body = hasEmpty ? joined + '?' : joined
    }
    let grouped = [prefix + body]
    if (grouped[0].length <= expandedLen) return grouped
    return expanded
  }

  return contAlts
}

function factorPatterns(patterns) {
  if (!patterns.length) return ''
  if (patterns.length === 1) return patterns[0]
  let tokenized = patterns.map(tokenizePattern)
  return factorToAlts(tokenized).join('|')
}

function collatePatterns(neg, pos, options) {
  let onlyNegative = filterPatterns(neg, pos, '-', false, options) || []
  let onlyPositive = filterPatterns(pos, neg, '', false, options) || []
  let intersected = filterPatterns(neg, pos, '-?', true, options) || []
  let subpatterns = onlyNegative.concat(intersected).concat(onlyPositive)
  return factorPatterns(subpatterns)
}

function splitToRanges(min, max, base = 10) {
  let nines = 1
  let zeros = 1

  let stop = countMaxDigits(min, nines, base)
  let stops = new Set([max])

  while (min <= stop && stop <= max) {
    stops.add(stop)
    nines += 1
    stop = countMaxDigits(min, nines, base)
  }

  stop = countZeros(max + 1, zeros, base) - 1

  while (min < stop && stop <= max) {
    stops.add(stop)
    zeros += 1
    stop = countZeros(max + 1, zeros, base) - 1
  }

  stops = [...stops]
  stops.sort(compare)
  return stops
}

/**
 * Convert a range to a regex pattern
 * @param {Number} `start`
 * @param {Number} `stop`
 * @return {String}
 */

function rangeToPattern(start, stop, options) {
  if (start == stop) {
    return {pattern: start, count: [], digits: 0}
  }

  let base = options.base || 10
  let maxDigit = getMaxDigit(base)
  let zipped = zip(start, stop)
  let digits = zipped.length
  let pattern = ''
  let count = 0

  for (let i = 0; i < digits; i++) {
    let [startDigit, stopDigit] = zipped[i]

    if (startDigit == stopDigit) pattern += startDigit
    else if (startDigit != '0' || stopDigit != maxDigit)
      pattern += toCharacterClass(startDigit, stopDigit, options)
    else count++
  }

  if (count)
    pattern +=
      options.shorthand && base == 10 ? '\\d'
      : base <= 10 ? `[0-${maxDigit}]`
      : options.shorthand && maxDigit == '9' ? '\\d'
      : `[${options.shorthand ? '\\d' : '0-9'}a-${maxDigit}]`

  return {pattern, count: [count], digits}
}

toRegexRange.cache = {}
toRegexRange.clearCache = () => (toRegexRange.cache = {})

module.exports = toRegexRange

// - Private Use Area - U+E000-F8FF
// - Supplementary Private Use Area-A - U+F0000-FFFFD
// - Supplementary Private Use Area-B - U+100000-10FFFD

let base = 16
let pattern = toRegexRange(0x0, 0x10ffff, {
  base,
  shorthand: true,
  relaxZeros: true,
})
console.log(pattern)

// let re = RegExp("^" + pattern + "$")
// const assert = require("assert")
// assert(
//   [...Array(0x10ffff + 1).keys()].every(i => {
//     let str = i.toString(base)
//     return re.test(str)
//   }),
// )
