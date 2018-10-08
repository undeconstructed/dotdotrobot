
import { split, popN, popArgs } from './util.js'
import * as lang from './lang.js'

const Q = Symbol('q')

/**
 * Memory looks after the memory in a Machine. Essentially just a map that can
 * limit size in some ways.
 */
class Memory {
  constructor(capacity) {
    this.m = new Map()
    this.cells = 0
  }
  // for cheating in list-words
  entries () {
    return this.m.entries()
  }
  // allocates a temporary memory cell
  alloc (k) {
    k = k || this.cells++
    let cell = this.m.get(k)
    if (cell) {
      throw new Error('REALLOC ' + k)
    }
    cell = {
      temp: true,
      data: null,
      next: null
    }
    this.m.set(k, cell)
    return k
  }
  has (k) {
    return this.m.has(k)
  }
  // sets a memory cell, creating a persistent cell first if needed
  set (k, v, n) {
    let cell = this.m.get(k)
    if (!cell) {
      cell = {
        temp: false,
        data: null,
        next: null
      }
      this.m.set(k, cell)
    }
    cell.data = v
    cell.next = n
  }
  setNext (k, n) {
    let cell = this.m.get(k)
    if (!cell) {
      throw new Error('NOALLOC ' + k)
    }
    cell.next = n
  }
  get (k) {
    let cell = this.m.get(k)
    if (!cell) {
      throw new Error('NOALLOC ' + k)
    }
    return [cell.data, cell.next]
  }
  data (k) {
    let cell = this.m.get(k)
    if (!cell) {
      throw new Error('NOALLOC ' + k)
    }
    return cell.data
  }
  next (k) {
    let cell = this.m.get(k)
    if (!cell) {
      throw new Error('NOALLOC ' + k)
    }
    return cell.next
  }
  delete (k) {
    let cell = this.m.get(k)
    if (!cell) {
      throw new Error('NOALLOC ' + k)
    }
    this.m.delete(k)
  }
  clear () {
    for (let [k, cell] of this.m.entries()) {
      if (cell.temp) {
        this.m.delete(k)
      }
    }
  }
}

/**
 * Socket allows fairly direct remote access into a Machine.
 */
class Socket {
  constructor (machine) {
    this.machine = machine
    this.into = null
    this.inputBus = []
    this.outputBus = []
  }
  // for the external part
  plug (into) {
    this.into = into
  }
  send (cmd) {
    if (!this.into) {
      return
    }
    return this.inputBus.push(cmd)
  }
  recv () {
    if (!this.into) {
      return
    }
    return this.outputBus.shift()
  }
  unplug () {
    this.into = null
  }
  // for the internal part
  push (res) {
    if (!this.into) {
      return
    }
    this.outputBus.push(res)
  }
  tick () {
    if (!this.into) {
      return
    }
    let input = this.inputBus.shift()
    if (input) {
      // this is the component control protocol
      switch (input[0]) {
      case 'read': {
        let name = input[1][0]
        let value = this.machine.memory.get(name)
        this.outputBus.push([ 'read', name, value ])
        break
      }
      case 'write': {
        let name = input[1][0]
        let value = input[1][1]
        this.machine.memory.set(name, value)
        this.outputBus.push([ 'written', name ])
        break
      }
      case 'queue':
        let id = input[1][0]
        let app = input[1][1]
        if (this.machine.enqueue({ id, app })) {
          this.outputBus.push([ 'queued', id ])
        } else {
          this.outputBus.push([ 'queuefull', id ])
        }
        break
      }
    }
  }
}

/**
 * Machine is sort of a computer
 */
export default class Machine {
  constructor (cps, maxPrograms, queueSize, memorySize) {
    this.cps = cps
    this.cp0 = 0
    this.maxPrograms = maxPrograms
    this.queueSize = queueSize
    this.memory = new Memory(memorySize)
    this.hardWords = {}
    this.execution = null
    this.sockets = []
    // machine level hardWords
    this.addHardWord('compile', (m, s) => {
      // this compiles and installs a program
      let [src, name] = popN(s, 2)
      let app = null
      try {
        app = lang.parse(src)
      } catch (e) {
        s.push('compile error: ' + e)
        return
      }
      m.installWord(name, { app, src })
    })
    this.addHardWord('queue', (m, s) => {
      let [src] = popN(s, 1)
      let cmd = { src }
      try {
        cmd.app = lang.parse(cmd.src)
      } catch (e) {
        s.push('compile error: ' + e)
        return
      }
      m.enqueue(cmd)
    })
    this.addHardWord('list-words', (m, s) => {
      let l = m.listOps().concat(m.listHardWords()).concat(m.listWords())
      s.push(l)
    })
    this.addHardWord('describe-word', (m, s) => {
      let [name] = popN(s, 1)
      let d = this.describeWord(name)
      s.push(d)
    })
    this.addHardWord('delete', (m, s) => {
      let [name] = popN(s, 1)
      m.memory.delete(name)
    })
    this.addHardWord('store', (m, s) => {
      let [data, name] = popN(s, 2)
      m.memory.set(name, data)
    })
    this.addHardWord('store2', (m, s) => {
      let [next, data, name] = popN(s, 3)
      m.memory.set(name, data, next)
    })
    this.addHardWord('load', (m, s) => {
      let [name] = popN(s, 1)
      let data = m.memory.data(name)
      s.push(data)
    })
    this.addHardWord('load2', (m, s) => {
      let [name] = popN(s, 1)
      let [data, next] = m.memory.get(name)
      s.push(data)
      s.push(next)
    })
    this.addHardWord('list-new', (m, s) => {
      let [name] = popN(s, 1)
      m.memory.alloc(name)
    })
    this.addHardWord('list-push', (m, s) => {
      let [data, name] = popN(s, 2)
      let on = m.memory.next(name)
      let n = m.memory.alloc()
      m.memory.set(n, data, on)
      m.memory.setNext(name, n)
    })
    this.addHardWord('list-pop', (m, s) => {
      let [name] = popN(s, 1)
      let on = m.memory.next(name)
      let [v, n] = m.memory.get(on)
      s.push(v)
      m.memory.setNext(name, n)
    })
    this.addHardWord('list-to-json', (m, s) => {
      let [name] = popN(s, 1)
      let n = m.memory.next(name)
      let tmp = []
      while (n != null) {
        let [v, nn] = m.memory.get(n)
        tmp.push(v)
        n = nn
      }
      s.push(JSON.stringify(tmp))
    })
    this.addHardWord('list-from-json', (m, s) => {
      let [json, name] = popN(s, 2)
      let tmp = JSON.parse(json)
      tmp.reverse()
      let on = null
      for (let e of tmp) {
        let n = m.memory.alloc()
        m.memory.set(n, e, on)
        on = n
      }
      m.memory.set(name, null, on)
    })
    // default memory
    this.memory.set(Q, [])
  }
  newSocket () {
    let s = new Socket(this)
    this.sockets.push(s)
    return s
  }
  addHardWord (name, func) {
    this.hardWords[name] = func
  }
  get timeLeft () {
    return this.cp0
  }
  installWord (name, word) {
    if (!word) {
      this.memory.delete(name)
      return
    }
    word.isWord = true
    return this.memory.set(name, word)
  }
  hasWord (name) {
    if (this.memory.has(name)) {
      let data = this.memory.data(name)
      return data && data.isWord
    }
    return false
  }
  listOps () {
    return Object.keys(lang.OPS)
  }
  listHardWords () {
    return Object.keys(this.hardWords)
  }
  listWords () {
    let out = []
    for (let [k, v] of this.memory.entries()) {
      if (v && v.isWord) {
        out.push(k)
      }
    }
    return out
  }
  describeWord (name) {
    let op = lang.ops[name]
    if (op) {
      return 'op'
    }
    let hardWord = this.hardWords[name]
    if (hardWord) {
      return 'hard'
    }
    let v = this.memory.data(name)
    if (v && p.isWord) {
      return v.src
    }
    return 'unknown'
  }
  enqueue (cmd) {
    let q = this.memory.data(Q)
    if (q.length < this.queueSize) {
      q.push(cmd)
      return true
    }
    return false
  }
  // hardware level access to memory
  setVariable (name, value) {
    this.memory.set(name, value)
  }
  getVariable (name) {
    if (this.memory.has(name)) {
      return this.memory.data(name)
    }
    return null
  }
  takeVariable (name) {
    if (this.memory.has(name)) {
      let value = this.memory.data(name)
      this.memory.delete(name)
      return value
    }
    return null
  }
  // execution stuff
  tick () {
    this.cp0 = this.cps
    for (let s of this.sockets) {
      s.tick()
    }
  }
  execute () {
    let allRes = []
    if (this.execution) {
      this._continue(allRes)
    }
    if (!this.execution) {
      this._runQueue(allRes)
    }
    return allRes
  }
  _continue (allRes) {
    let ex = this.execution
    let cmd = ex.cmd
    ex.runFor = this.cp0
    try {
      let res = lang.run(null, ex)
      this.cp0 -= res.used
      if (res.paused) {
        this.execution = res
      } else {
        this.execution = null
        allRes.push({
          typ: 'res',
          id: cmd.id,
          val: res.res
        })
      }
    } catch (e) {
      this.execution = null
      allRes.push({
        typ: 'error',
        id: cmd.id,
        src: cmd.src,
        e: e,
        val: 'CRASH ' + e.message
      })
    }
  }
  _runQueue (allRes) {
    let q = this.memory.data(Q)
    loop: for (; this.cp0 > 0 && q.length > 0; this.cp0--) {
      this.memory.clear()
      let cmd = q.shift()
      let app = cmd.app
      try {
        let res = lang.run(app, {
          machine: this,
          extraOps: this.hardWords,
          runFor: this.cp0,
          loadWord: (name) => {
            if (this.memory.has(name)) {
              let word = this.memory.data(name)
              if (word && word.isWord) {
                return word
              }
            }
            return null
          }
        })
        this.cp0 -= res.used
        if (res.paused) {
          res.cmd = cmd
          this.execution = res
        } else {
          allRes.push({
            typ: 'res',
            id: cmd.id,
            val: res.res
          })
        }
      } catch (e) {
        allRes.push({
          typ: 'error',
          id: cmd.id,
          src: cmd.src,
          e: e,
          val: 'CRASH ' + e.message
        })
      }
    }
  }
}
