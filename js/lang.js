
// docker run -it --rm -v $PWD:/js node /usr/local/bin/node /js/lang.js

import { split } from './util.js'

const STRING = Symbol('string')
const LSTRING = Symbol('lstring')
const NUMBER = Symbol('number')
const WORD = Symbol('word')
const DEF = Symbol('def`')
const IF = Symbol('if')
const LOOP = Symbol('loop')
const END = Symbol('end')

function parse (s) {
  s = s.trimRight()
  if (!s.endsWith(';')) {
    s += ' ; '
  }

  let apps = {}

  function newFrame (name, parent) {
    let isif = name === 'if'
    let isloop = name === 'loop'
    if (isif || isloop) {
      name = parent.name + '$' + parent.subs++
    }
    let symbols = []
    apps[name] = symbols
    return {
      name: name,
      isif: isif,
      isloop: isloop,
      parent: parent,
      subs: 0,
      symbols: symbols
    }
  }

  let frame = newFrame('main', null)

  let n = ''
  let i = null
  let escaped = false

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
      } else if (c === '`') {
        i = LSTRING
        n = ''
      } else if (c === ' ') {
      } else {
        i = WORD
        n = c
      }
    } else {
      switch (i) {
      case STRING:
        if (c === '\\' && !escaped) {
          escaped = true
          break
        }
        if (escaped) {
          escaped = false
          if (c === '"' || c === '\\') {
            n += c
          }
          break
        }
        if (c === '"') {
          frame.symbols.push({
            t: i,
            v: n
          })
          i = null
        } else {
          n += c
        }
        break
      case LSTRING:
        if (c === '`') {
          frame.symbols.push({
            t: STRING,
            v: n
          })
          i = null
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
          } else if (n === 'loop') {
            let nf = newFrame('loop', frame)
            frame.symbols.push({
              t: LOOP,
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

  if (i) {
    throw new Error('unclosed')
  }

  if (frame.parent) {
    throw new Error('unbalanced')
  }

  return apps
}

export const ops = {
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
  'over': (m, s) => {
    let [a, b] = [s.pop(), s.pop()]
    s.push(b)
    s.push(a)
    s.push(b)
  },
  'invert': (m, s) => {
    let v = s.pop()
    s.push(!!v)
  },
  'swap': (m, s) => {
    let [a, b] = [s.pop(), s.pop()]
    s.push(a)
    s.push(b)
  },
  'clear': (m, s) => {
    s.length = 0
  },
  'print': (m, s) => {
    let v = s.pop()
    console.log(v)
    s.push(v)
  },
  'rand': (m, s) => {
    let [max, min] = [s.pop(), s.pop()]
    let r = Math.floor(Math.random() * (max - min + 1)) + min
    s.push(r)
  },
  'split': (m, s) => {
    let arg = s.pop()
    let args = s.split()
    for (let a of args) {
      s.push(a)
    }
    s.push(s.length)
  },
  'join': (m, s) => {
    let arg = s.pop()
    let string = arg.join(',')
    s.push(string)
  },
  'tojson': (m, s) => {
    let j = JSON.stringify(s.pop())
    s.push(j)
  }
}

function run (p, opts) {
  opts = opts || {}
  p = p || opts.frame.a
  let s = opts.s = opts.s || []
  let m = opts.m = opts.m || {}
  let cOps = opts.extraOps = opts.extraOps || {}
  let loadWord = opts.loadWord = opts.loadWord || (name => null)
  let runFor = opts.runFor = opts.runFor || -1
  let frame = opts.frame || ({ a: p, f: p['main'], n: 0, parent: null })

  let opsRun = 0
  let paused = false

  while (true) {
    let c = frame.f[frame.n++]
    if (c.t === END) {
      if (frame.times > 1) {
        // console.log('repeat')
        frame.times--
        frame.n = 0
      } else {
        // console.log('leave')
        frame = frame.parent
        if (!frame) {
          break
        }
      }
    } else if (c.t === IF) {
      let b = s.pop()
      if (b) {
        let sub = frame.a[c.v]
        // console.log('enter if', c.v)
        frame = { a: frame.a, f: sub, n: 0, parent: frame }
      }
    } else if (c.t === LOOP) {
      let [b, a] = [s.pop(), s.pop()]
      let times = a - b
      if (times > 0) {
        let sub = frame.a[c.v]
        // console.log('enter loop', c.v, times)
        frame = { a: frame.a, f: sub, n: 0, parent: frame, times: times }
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
          let sub = frame.a[c.v]
          if (sub) {
            // console.log('enter sub', c.v)
            frame = { a: frame.a, f: sub, n: 0, parent: frame }
          } else {
            let ext = loadWord(c.v)
            if (ext) {
              // console.log('enter ext', c.v)
              frame = { a: ext.app, f: ext.app['main'], n: 0, parent: frame }
            } else {
              s.push('NOWORD ' + c.v)
              break
            }
          }
        }
      }
    } else {
      s.push(c.v)
    }
    opsRun++
    if (runFor > 0 && opsRun > runFor) {
      paused = true
      break
    }
    // console.log(s)
  }

  if (!paused) {
    opts.res = s[s.length - 1]
  } else {
    opts.frame = frame
  }
  opts.used = opsRun
  opts.paused = paused

  return opts
}

function t (src) {
  console.log(src)
  let p = parse(src)
  console.log(p)
  console.log(run(p))
  console.log()
}

// t(':add1 1 + ; 3 4 + 2 - add1 add1 add1 "ok, that\'s it" dup "note" store drop print ;')
// t('1 if "true" print ; 0 if "false" print ; ;')
// t(':add1_if_not_0 dup 0 != if 1 + ; ; 0 add1_if_not_0 print 5 add1_if_not_0 print ;')
// t('5 0 loop "ok" print ; ;')
// t('0 5 loop "ok" print ; ;')
// t('2 3 over swap')

// t(':pow over swap 1 loop over * ; swap drop ; 2 3 pow ;')
// t(':fib dup 1 > if 1 - dup fib swap 1 - fib + ; ; 6 fib ;')
// t(':fac dup 1 > if dup 1 - fac * ; dup 0 = if drop 1 ; dup 1 = if drop 1 ; ; 3 fac ;')

export { parse, run }
