
// docker run -it --rm -v $PWD:/js node /usr/local/bin/node /js/lang.js

import { split, popN } from './util.js'

const STRING = Symbol('string')
const LSTRING = Symbol('lstring')
const NUMBER = Symbol('number')
const WORD = Symbol('word')
const DEF = Symbol('def`')
const IF = Symbol('if')
const LOOP = Symbol('loop')
const END = Symbol('end')

// parses/"compiles" source code
// returns a collection of identifiers, where "main" is the entry point
function parse (s) {
  s = s.trimRight() + ' \0'

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
      } else if (c === '\0') {
        // allowing for a missing final ;
        frame.symbols.push({ t: END })
        break
      } else if (c === ':') {
        i = DEF
        n = ''
      } else if ((c >= '0' && c <= '9')) { // || c === '-') {
        i = NUMBER
        n = c
      } else if (c === '"') {
        i = STRING
        n = ''
      } else if (c === '`') {
        i = LSTRING
        n = ''
      } else if (c === ' ' || c === '\n') {
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
    throw new Error('UNCLOSED')
  }

  if (frame.parent) {
    throw new Error('UNBALANCED')
  }

  return apps
}

// basic stack-only operations, the machine arg should not be used
export const OPS = {
  'i': (m, s) => {},
  '+': (m, s) => {
    let [a, b] = popN(s, 2)
    s.push(a + b)
  },
  '-': (m, s) => {
    let [a, b] = popN(s, 2)
    s.push(a - b)
  },
  '*': (m, s) => {
    let [a, b] = popN(s, 2)
    s.push(a * b)
  },
  '/': (m, s) => {
    let [a, b] = popN(s, 2)
    s.push(a / b)
  },
  '=': (m, s) => {
    let [a, b] = popN(s, 2)
    s.push(a == b)
  },
  '>': (m, s) => {
    let [a, b] = popN(s, 2)
    s.push(a > b)
  },
  '>=': (m, s) => {
    let [a, b] = popN(s, 2)
    s.push(a >= b)
  },
  '<': (m, s) => {
    let [a, b] = popN(s, 2)
    s.push(a < b)
  },
  '<=': (m, s) => {
    let [a, b] = popN(s, 2)
    s.push(a <= b)
  },
  '!=': (m, s) => {
    let [a, b] = popN(s, 2)
    s.push(a != b)
  },
  'and' : (m, s) => {
    let [a, b] = popN(s, 2)
    s.push(!!a && !!b)
  },
  'drop': (m, s) => {
    popN(s, 1)
  },
  'dup': (m, s) => {
    let [v] = popN(s, 1)
    s.push(v)
    s.push(v)
  },
  'over': (m, s) => {
    let [a, b] = popN(s, 2)
    s.push(b)
    s.push(a)
    s.push(b)
  },
  'invert': (m, s) => {
    let [v] = popN(s, 1)
    s.push(!v)
  },
  'swap': (m, s) => {
    let [a, b] = popN(s, 2)
    s.push(b)
    s.push(a)
  },
  'clear': (m, s) => {
    s.length = 0
  },
  'pull-up': (m, s) => {
    let [n] = popN(s, 1)
    let x = null
    function r(n) {
      if (n) {
        let e = s.pop()
        r(n - 1)
        s.push(e)
      } else {
        x = s.pop()
      }
    }
    r(n)
    s.push(x)
  },
  'print': (m, s) => {
    let [v] = popN(s, 1)
    console.log(v)
    s.push(v)
  },
  'rand': (m, s) => {
    let [min, max] = popN(s, 2)
    let r = Math.floor(Math.random() * (max - min + 1)) + min
    s.push(r)
  },
  'split': (m, s) => {
    let [v] = popN(s, 1)
    let args = v.split()
    for (let a of args) {
      s.push(a)
    }
    s.push(s.length)
  },
  'join': (m, s) => {
    let [v] = popN(s, 1)
    let string = v.join(',')
    s.push(string)
  },
  'to-json': (m, s) => {
    let [v] = popN(s, 1)
    let json = JSON.stringify(v)
    s.push(json)
  },
  'pi': (m, s) => {
    s.push(Math.PI)
  },
  'dump-stack': (m, s) => {
    console.log(JSON.stringify(s))
  }
}

// p is the program to run, if started a new program
// opts is a collection of options, which can be an entire state when continuing an execution
// returns an update opts object, which is either paused or has a result
function run (p, opts) {
  opts = opts || {}
  // if no program, then this is a continuation
  p = p || opts.frame.a
  // if no stack, create one
  let stack = opts.stack = opts.stack || []
  // if no machine, then no problem, run on a complete abstract
  let machine = opts.machine
  // more operations
  let extraOps = opts.extraOps = opts.extraOps || {}
  // how to load dynamic words
  let loadWord = opts.loadWord = opts.loadWord || (name => null)
  // how long to run the execution before pausing
  let runFor = opts.runFor = opts.runFor || -1
  // the active frame
  let frame = opts.frame || ({ a: p, f: p['main'], n: 0, parent: null })

  // how many ops executed in this run
  let opsRun = 0
  // whether we finish or have to pause
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
      let b = stack.pop()
      if (b) {
        let sub = frame.a[c.v]
        // console.log('enter if', c.v)
        frame = { a: frame.a, f: sub, n: 0, parent: frame }
      }
    } else if (c.t === LOOP) {
      let [b, a] = [stack.pop(), stack.pop()]
      let times = a - b
      if (times > 0) {
        let sub = frame.a[c.v]
        // console.log('enter loop', c.v, times)
        frame = { a: frame.a, f: sub, n: 0, parent: frame, times: times }
      }
    } else if (c.t === WORD) {
      if (c.v === 'call') {
        let oc = c
        c = {
          t: WORD,
          v: stack.pop()
        }
      }
      let op = OPS[c.v]
      if (op) {
        // this is a core operation
        op(machine, stack)
      } else {
        op = extraOps[c.v]
        if (op) {
          // this is an extra operation
          op(machine, stack)
        } else {
          let sub = frame.a[c.v]
          if (sub) {
            // this is label in the current program
            // console.log('enter sub', c.v)
            frame = { a: frame.a, f: sub, n: 0, parent: frame }
          } else {
            let ext = loadWord(c.v)
            if (ext) {
              // this is a dynamic word
              // console.log('enter ext', c.v)
              frame = { a: ext.app, f: ext.app['main'], n: 0, parent: frame }
            } else {
              // this is a runtime error
              throw new Error('NOWORD ' + c.v)
            }
          }
        }
      }
    } else {
      stack.push(c.v)
    }
    opsRun++
    if (runFor > 0 && opsRun > runFor) {
      paused = true
      break
    }
    // console.log(s)
  }

  if (!paused) {
    // result is the top of the stack
    opts.res = stack[stack.length - 1]
  } else {
    opts.frame = frame
  }
  opts.used = opsRun
  opts.paused = paused

  return opts
}

// stupid little testing function
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
