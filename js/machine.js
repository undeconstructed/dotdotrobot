
import { split } from './util.js'
import * as lang from './lang.js'

export default class Machine {
  constructor (cps, maxPrograms, queueSize, memorySize) {
    this.cps = cps
    this.cp0 = 0
    this.maxPrograms = maxPrograms
    this.programs = new Map()
    this.memorySize = memorySize
    this.memory = {}
    this.queueSize = queueSize
    this.queue = []
    this.ops = {}
    this.execution = null
    this.installProgram('install', { f: (m, args) => {
      let [name, src] = split(args)
      let app = null
      try {
        app = lang.parse(src)
      } catch (e) {
        return {
          typ: 'error',
          val: 'can\'t compile: ' + e
        }
      }
      this.installProgram(name, { app, src })
    } })
    this.installProgram('script', { f: (m, args) => {
      // this is a dynamicly inputted program
      let src = args
      let app = null
      try {
        app = lang.parse(src)
      } catch (e) {
        return {
          typ: 'error',
          val: 'can\'t compile: ' + e
        }
      }
      try {
        let { res, used } = lang.run(app, { m: this.memory, ops: this.ops, runFor: this.cp0 })
        this.cp0 -= used
        return {
          typ: 'res',
          val: res
        }
      } catch (e) {
        return {
          typ: 'error',
          val: 'crash: ' + e
        }
      }
    }})
  }
  addOp (name, func) {
    this.ops[name] = func
  }
  installProgram (name, prorgam) {
    if (this.programs.size < this.maxPrograms) {
      this.programs.set(name, prorgam)
      return true
    }
    return false
  }
  hasProgram (name) {
    return this.programs.has(name)
  }
  listPrograms () {
    return [...this.programs.keys()]
  }
  describeProgram (name) {
    let p = this.programs.get(name)
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
    if (this.queue.length < this.queueSize) {
      this.queue.push(command)
      return true
    }
    return false
  }
  setVariable (name, value) {
    this.memory[name] = value
  }
  getVariable (name) {
    return this.memory[name]
  }
  takeVariable (name) {
    let value = this.memory[name]
    delete this.memory[name]
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
    return allRes.length > 0 ? allRes : null
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
    loop: for (; this.cp0 > 0 && this.queue.length > 0; this.cp0--) {
      let line = this.queue.shift()
      let [cmd, args] = split(line)
      let prog = this.programs.get(cmd)
      while (prog && prog.alias) {
        [cmd, args] = split(prog.alias)
        prog = this.programs.get(cmd)
      }
      if (!prog) {
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
