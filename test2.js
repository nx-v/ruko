let rk = `
  4 + 5 * (2 - 3)
`

function compile(code) {
  // The (0, eval) trick forces eval to run in the global scope
  return eval(code)
}

let compiledCode = compile(rk)
console.log("Final Compiled Code:", compiledCode)
