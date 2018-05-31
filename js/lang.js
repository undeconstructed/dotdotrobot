
// docker run -it --rm -v $PWD:/js node /usr/local/bin/node /js/lang.js

const STRING = Symbol('s')
const NUMBER = Symbol('n')
const WORD = Symbol('w')
const DEF = Symbol('d')
const END = Symbol('end')

function parse (s) {
  s += ' '

  let apps = {}
  let main = []
  apps['main'] = main

  let subn = null
  let sub = null

  let o = main
  let n = ''
  let i = null

  for (let c of s) {
    if (!i) {
      if (sub && c === ';') {
        apps[subn] = sub
        sub = null
        o = main
      } else if (!sub && c === ':') {
        i = DEF
        subn = ''
        sub = []
        o = sub
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
          o.push({
            t: i,
            v: n
          })
          i = null
        } else {
          n += c
        }
        break
      case NUMBER:
        if (c === ' ') {
          o.push({
            t: i,
            v: n - 0
          })
          i = null
        } else if (c >= '0' && c <= '9') {
          n += c
        } else {
          throw new Error('invalid number ' + c)
        }
        break
      case WORD:
        if (c === ' ') {
          o.push({
            t: i,
            v: n
          })
          i = null
        } else if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || (c === '-')) {
          n += c
        } else {
          throw new Error('invalid word ' + c)
        }
        break
      case DEF:
        if (c === ' ') {
          i = null
        } else if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || (c === '-')) {
          subn += c
        } else {
          throw new Error('invalid name ' + c)
        }
        break
      }
    }
  }
  main.push({ t: END })
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

function run (p, s, m) {
  let calls = []
  let frame = { f: p['main'], n: 0 }
  while (true) {
    let c = frame.f[frame.n++]
    if (c.t === END) {
      return s
    } else if (c.t === WORD) {
      let op = ops[c.v]
      if (op) {
        op(m, s)
      } else {
        let sub = p[c.v]
        if (!sub) {
          return 'ERROR 2'
        }
        calls.push(frame)
        // console.log('enter sub', c.v)
        frame = { f: sub, n: 0 }
        continue
      }
    } else {
      s.push(c.v)
    }
    if (frame.n === frame.f.length) {
      frame = calls.pop()
      // console.log('leave sub')
    }
  }
}

let s = []
let m = {}
let source = ':add1 1 + ; 3 4 + 2 - add1 add1 add1 "ok, that\'s it" dup "note" store drop print'

let p = parse(source)
// console.log('program', p)
let r = run (p, s, m)
// console.log('stack', s)
// console.log('memory', m)
