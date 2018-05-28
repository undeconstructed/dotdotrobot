
// docker run -it --rm -v $PWD:/js node /usr/local/bin/node /js/lang.js

const token = {
  Labl: Symbol('label'),
  Numr: Symbol('number'),
  Punc: Symbol('punc')
}

const node = {
  ROOT: Symbol('root')
}

function tokenise (s) {
  let p0, p1 = 0
  while (true) {
    let c = s[p0]
    if (isDigit(c)) {

    }
  }
  let lines = []
  for (let l of s.split('\n')) {
    let line = []
    for (let w of s.split(' ')) {
      if (isLabel(w)) {
        line.push({
          type: token.Label,
          label: w
        })
      }
    }
    lines.push(line)
  }
  return lines
}

function parse (s) {
  let tree = {
    type: ROOT
  }
  return {}
}

function run (p) {
  return true
}

let s = `
a = call
`

let p = parse(s)
let r = run (p)

console.log(`ok ${r}`)
