
import { split } from './util.js'
import * as lang from './lang.js'

const Q = Symbol('q')

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

export default class Machine {
  constructor (cps, maxPrograms, queueSize, memorySize) {
    this.cps = cps
    this.cp0 = 0
    this.maxPrograms = maxPrograms
    this.queueSize = queueSize
    this.memory = new Memory(memorySize)
    this.ops = {}
    this.execution = null
    // machine level ops
    this.addOp('store', (m, s) => {
      let [name, data] = [s.pop(), s.pop()]
      m.set(name, data)
    })
    this.addOp('load', (m, s) => {
      let name = s.pop()
      let data = m.get(name)
      s.push(data)
    })
    // default memory
    this.memory.set(Q, [])
  }
  addOp (name, func) {
    this.ops[name] = func
  }
  get timeLeft () {
    return this.cp0
  }
  installProgram (name, program) {
    if (!program) {
      this.memory.delete(name)
    }
    program.isProgram = true
    return this.memory.set(name, program)
  }
  hasProgram (name) {
    let data = this.memory.get(name)
    return data && data.isProgram
  }
  listPrograms () {
    let out = []
    for (let [k, v] of this.memory.entries()) {
      if (v && v.isProgram) {
        out.push(k)
      }
    }
    return out
  }
  describeProgram (name) {
    let p = this.memory.get(name)
    if (p) {
      if (p.f) {
        return 'native'
      } else if (p.c) {
        return 'constant: ' + p.c
      } else if (p.alias) {
        return 'alias: ' + p.alias
      } else if (p.app) {
        return 'app: ' + (p.src || p.app)
      }
    }
    return 'unknown'
  }
  enqueue (command) {
    let q = this.memory.get(Q)
    if (q.length < this.queueSize) {
      q.push(command)
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
    ex.runFor = this.cp0
    try {
      let { res, used } = lang.run(null, ex)
      this.cp0 -= used
      if (res.paused) {
        this.execution = res
      } else {
        this.execution = null
        allRes.push({
          typ: 'res',
          cmd: cmd,
          val: res
        })
      }
    } catch (e) {
      this.execution = null
      allRes.push({
        typ: 'error',
        cmd: cmd,
        val: 'crash: ' + e
      })
    }
  }
  _runQueue (allRes) {
    let q = this.memory.get(Q)
    loop: for (; this.cp0 > 0 && q.length > 0; this.cp0--) {
      let line = q.shift()
      let [cmd, args] = split(line)
      let prog = this.memory.get(cmd)
      while (prog && prog.isProgram && prog.alias) {
        [cmd, args] = split(prog.alias)
        prog = this.memory.get(cmd)
      }
      if (!prog || !prog.isProgram) {
        allRes.push({
          typ: 'error',
          cmd: cmd,
          val: 'not found'
        })
      } else if (prog.f) {
        let res = prog.f(this, args)
        this.cp0 -= 5
        if (!res) {
          res = {
            typ: 'res',
            cmd: cmd
          }
        }
        if (!res.typ) {
          res = {
            typ: 'res',
            cmd: cmd,
            val: res
          }
        }
        allRes.push(res)
      } else if (prog.c) {
        allRes.push({
          typ: 'res',
          cmd: cmd,
          val: prog.c
        })
      } else if (prog.app) {
        this.memory.set('argv', args)
        try {
          let { res, used } = lang.run(prog.app, { m: this.memory, ops: this.ops, runFor: this.cp0 })
          this.cp0 -= used
          if (res.paused) {
            this.execution = res
          } else {
            allRes.push({
              typ: 'res',
              cmd: cmd,
              val: res
            })
          }
        } catch (e) {
          allRes.push({
            typ: 'error',
            cmd: cmd,
            val: 'crash: ' + e
          })
        }
      } else {
        allRes.push({
          typ: 'error',
          cmd: cmd,
          val: 'can\'t do'
        })
      }
    }
  }
}
