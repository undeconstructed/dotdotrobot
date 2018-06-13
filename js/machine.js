
import { split } from './util.js'
import * as lang from './lang.js'

const Q = Symbol('q')

/**
 * Memory looks after the memory in a Machine.
 */
class Memory {
  constructor() {
    this.m = new Map()
  }
  entries () {
    return this.m.entries()
  }
  has (k) {
    return this.m.has(k)
  }
  set (k, v) {
    return this.m.set(k, v)
  }
  get (k) {
    return this.m.get(k)
  }
  delete (k) {
    return this.m.delete(k)
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
        let name = input[1]
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
      let [name, src] = [s.pop(), s.pop()]
      let app = null
      try {
        app = lang.parse(src)
      } catch (e) {
        return {
          typ: 'error',
          val: 'can\'t compile: ' + e
        }
      }
      this.installWord(name, { app, src })
      s.push('ok')
    })
    this.addHardWord('queue', (m, s) => {
      let src = s.pop()
      this.enqueue({ src })
    })
    this.addHardWord('list-words', (m, s) => {
      let l = this.listOps().concat(this.listHardWords()).concat(this.listWords())
      s.push(l)
    })
    this.addHardWord('describe-word', (m, s) => {
      let name = s.pop()
      let d = this.describeWord(name)
      s.push(d)
    })
    this.addHardWord('delete', (m, s) => {
      let k = s.pop()
      m.delete(k)
    })
    this.addHardWord('store', (m, s) => {
      let [name, data] = [s.pop(), s.pop()]
      m.set(name, data)
    })
    this.addHardWord('load', (m, s) => {
      let name = s.pop()
      let data = m.get(name)
      s.push(data)
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
    let data = this.memory.get(name)
    return data && data.isWord
  }
  listOps () {
    return Object.keys(lang.ops)
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
    let p = this.memory.get(name)
    if (p) {
      return p.src
    }
    return 'unknown'
  }
  enqueue (cmd) {
    let q = this.memory.get(Q)
    if (q.length < this.queueSize) {
      q.push(cmd)
      return true
    }
    return false
  }
  setVariable (name, value) {
    this.memory.set(name, value)
  }
  getVariable (name) {
    return this.memory.get(name)
  }
  takeVariable (name) {
    let value = this.memory.get(name)
    this.memory.delete(name)
    return value
  }
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
        val: 'crash: ' + e
      })
    }
  }
  _runQueue (allRes) {
    let q = this.memory.get(Q)
    loop: for (; this.cp0 > 0 && q.length > 0; this.cp0--) {
      let cmd = q.shift()
      let app = cmd.app
      try {
        let res = lang.run(app, { m: this.memory, extraOps: this.hardWords, runFor: this.cp0, loadWord: (name) => {
          let word = this.memory.get(name)
          if (word && word.isWord) {
            return word
          }
          return null
        } })
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
        console.log(e)
        allRes.push({
          typ: 'error',
          id: cmd.id,
          src: cmd.src,
          val: 'crash: ' + e
        })
      }
    }
  }
}
