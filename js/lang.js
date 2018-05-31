
// docker run -it --rm -v $PWD:/js node /usr/local/bin/node /js/lang.js

const STRING = Symbol('string')
const NUMBER = Symbol('number')
const WORD = Symbol('word')
const DEF = Symbol('def`')
const IF = Symbol('if')
const END = Symbol('end')

function parse (s) {
  s = s.trimRight()
  if (!s.endsWith(';')) {
    s += ' ; '
  }

  let apps = {}

  function newFrame (name, parent) {
    let isif = name === 'if'
    if (isif) {
      name = parent.name + '_if_' + parent.ifs++
    }
    let symbols = []
    apps[name] = symbols
    return {
      name: name,
      isif: isif,
      parent: parent,
      ifs: 0,
      symbols: symbols
    }
  }

  let frame = newFrame('main', null)

  let n = ''
  let i = null

  for (let c of s) {
    if (!i) {
      if (c === ';') {
        frame.symbols.push({ t: END })
        if (frame.parent) {
          frame = frame.parent
        } else {
          // hopefully this is end of the program
          break
        }
      } else if (c === ':') {
        i = DEF
        n = ''
      } else if (c >= '0' && c <= '9') {
        i = NUMBER
        n = c
      } else if (c === '"') {
        i = STRING
        n = ''
      } else if (c === ' ') {
      } else {
        i = WORD
        n = c
      }
    } else {
      switch (i) {
      case STRING:
        if (c === '"') {
          frame.symbols.push({
            t: i,
            v: n
          })
          i = null
        } else if (c === '\\') {
        } else {
          n += c
        }
        break
      case NUMBER:
        if (c === ' ') {
          frame.symbols.push({
            t: i,
            v: n - 0
          })
          i = null
        } else if (c >= '0' && c <= '9') {
          n += c
        } else {
          throw new Error('invalid number char ' + c)
        }
        break
      case WORD:
        if (c === ' ') {
          if (n === 'if') {
            let nf = newFrame('if', frame)
            frame.symbols.push({
              t: IF,
              v: nf.name
            })
            frame = nf
          } else {
            frame.symbols.push({
              t: i,
              v: n
            })
          }
          i = null
        } else {
          n += c
        }
        break
      case DEF:
        if (c === ' ') {
          let nf = newFrame(n, frame)
          frame = nf
          i = null
        } else {
          n += c
        }
        break
      }
    }
  }

  if (frame.parent) {
    throw new Error('unbalanced')
  }

  return apps
}

const ops = {
  '+': (m, s) => {
    let [a, b] = [s.pop(), s.pop()]
    s.push(a + b)
  },
  '-': (m, s) => {
    let [b, a] = [s.pop(), s.pop()]
    s.push(a - b)
  },
  '*': (m, s) => {
    let [a, b] = [s.pop(), s.pop()]
    s.push(a * b)
  },
  '/': (m, s) => {
    let [b, a] = [s.pop(), s.pop()]
    s.push(a / b)
  },
  '=': (m, s) => {
    let [b, a] = [s.pop(), s.pop()]
    s.push(a == b)
  },
  '>': (m, s) => {
    let [b, a] = [s.pop(), s.pop()]
    s.push(a > b)
  },
  '>=': (m, s) => {
    let [b, a] = [s.pop(), s.pop()]
    s.push(a >= b)
  },
  '<': (m, s) => {
    let [b, a] = [s.pop(), s.pop()]
    s.push(a < b)
  },
  '<=': (m, s) => {
    let [b, a] = [s.pop(), s.pop()]
    s.push(a <= b)
  },
  '!=': (m, s) => {
    let [b, a] = [s.pop(), s.pop()]
    s.push(a != b)
  },
  'drop': (m, s) => {
    s.pop()
  },
  'dup': (m, s) => {
    let v = s.pop()
    s.push(v)
    s.push(v)
  },
  'store': (m, s) => {
    let [name, data] = [s.pop(), s.pop()]
    m[name] = data
  },
  'read': (m, s) => {
    name = s.pop()
    s.push(m[name])
  },
  'print': (m, s) => {
    let v = s.pop()
    console.log(v)
    s.push(v)
  }
}

function run (p, opts) {
  let s = opts.s || []
  let m = opts.m || {}
  let cOps = opts.ops || {}

  let frame = { f: p['main'], n: 0, parent: null }
  while (true) {
    let c = frame.f[frame.n++]
    if (c.t === END) {
      frame = frame.parent
      if (!frame) {
        return s.pop()
      }
    } else if (c.t === IF) {
      let b = s.pop()
      if (b) {
        let sub = p[c.v]
        // console.log('enter if', c.v)
        frame = { f: sub, n: 0, parent: frame }
      }
    } else if (c.t === WORD) {
      let op = ops[c.v]
      if (op) {
        op(m, s)
      } else {
        op = cOps[c.v]
        if (op) {
          op(m, s)
        } else {
          let sub = p[c.v]
          if (!sub) {
            return 'ERROR 2'
          }
          // console.log('enter sub', c.v)
          frame = { f: sub, n: 0, parent: frame }
        }
      }
    } else {
      s.push(c.v)
    }
  }
  console.assert(false, 'reached end of run!')
  return s.pop()
}

// let s = []
// let m = {}
// // let source = ':add1 1 + ; 3 4 + 2 - add1 add1 add1 "ok, that\'s it" dup "note" store drop print ;'
// // let source = '1 if "true" print ; 0 if "false" print ; ;'
// let source = ':add1_if_not_0 dup 0 != if 1 + ; ; 0 add1_if_not_0 print 5 add1_if_not_0 print ;'
//
// let p = parse(source)
// console.log('program', p)
// let r = run (p, s, m)
// console.log('stack', s)
// console.log('memory', m)

export { parse, run }
