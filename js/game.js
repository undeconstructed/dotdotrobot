
import makeName from './names.js'
import { join } from './util.js'
import * as lang from './lang.js'

const assert = (console ? console.assert : function () {})

function split(s) {
  s = s.trim().split(/\s+/).join(' ')
  let i = s.indexOf(' ')
  if (i > 0) {
    return [s.substr(0, i), s.substr(i + 1)]
  }
  return [s, null]
}

class Thing {
  constructor () {
    this.parent = null
  }
  place (parent, opts) {
    return parent.accept(this, opts)
  }
  get area () {
    let p = this.parent
    while (p != null) {
      if (p instanceof Area) {
        return p
      }
      p = p.parent
    }
    return p
  }
  get piece () {
    let p = this.parent
    while (p != null) {
      if (p instanceof Piece) {
        return p
      }
      p = p.parent
    }
    return p
  }
  tick () {
  }
  accept () {
    assert(false, 'tried to get a thing to accept something')
    return false
  }
  toString () {
    return 'thing'
  }
}

class Machine {
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
    if (!this.execution) {
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
    return allRes.length > 0 ? allRes : null
  }
}

class Programmable extends Thing {
  constructor () {
    super()
    // this thing is the actual computer
    this.machine = new Machine(50, 20, 10, 10)
    // universally installed programs
    this.addOp('log', (m, s) => {
      console.log('log', s.pop())
    })
    this.installProgram('list-programs', { f: (m, args) => {
      return m.listPrograms()
    } })
    this.installProgram('dump-program', { f: (m, args) => {
      return m.describeProgram(args)
    } })
    this.installProgram('describe', { f: (m, args) => {
      return this.toString()
    } })
  }
  addOp (name, func) {
    this.machine.addOp(name, func)
  }
  compileProgram (name, src) {
    this.machine.installProgram(name, { src: src, app: lang.parse(src) })
  }
  installProgram (name, prorgam) {
    this.machine.installProgram(name, prorgam)
  }
  command (command) {
    return this.machine.enqueue(command)
  }
  tick () {
    this.machine.tick()
    return this.machine.execute()
  }
}

class Composite extends Programmable {
  constructor () {
    super()
    this.slots = new Set()
    this.parts = new Map()
    // tell as an op
    this.addOp('tell', (m, s) => {
      let [tgt, src] = [s.pop(), s.pop()]
      let part = this.parts.get(tgt)
      if (part) {
        if (part.command(src)) {
          s.push('ok')
        } else {
          s.push('overflow')
        }
      } else {
        s.push('no part')
      }
    })
    // tell as a native program
    this.installProgram('tell', { f: (m, args) => {
      if (args) {
        let cx = split(args)
        let part = this.parts.get(cx[0])
        if (part) {
          if (part.command(cx[1])) {
            return {
              typ: 'debug',
              val: 'command pushed to ' + cx[0]
            }
          } else {
            return {
              typ: 'error',
              val: 'command overflow on ' + cx[0]
            }
          }
        }
      }
      return 'error'
    } })
    this.installProgram('list-slots', { f: (m, args) => {
      return [...this.slots]
    } })
    this.installProgram('list-parts', { f: (m, args) => {
      let list = {}
      this.parts.forEach((v, k) => {
        list[k] = v.toString()
      })
      return list
    } })
  }
  addSlot (name) {
    this.slots.add(name)
  }
  accept (component, opts) {
    assert(component instanceof Component)
    if (!this.slots.has(opts.slot)) {
      return false
    }
    this.parts.set(opts.slot, component)
    component.parent = this
    return true
  }
  tick () {
    let r0 = super.tick()
    let res = []
    if (r0) {
      for (let rx of r0) {
        rx.src = 'self'
        res.push(rx)
      }
    }
    this.parts.forEach((part, slot) => {
      let r = part.tick()
      if (r) {
        for (let rx of r) {
          rx.src = slot
          res.push(rx)
        }
      }
    })
    if (res.length > 0) {
      if (this.machine.hasProgram('compose')) {
        this.machine.setVariable('res', res)
        // TODO - this might overflow
        this.command('compose')
        this.machine.execute()
        return null
      }
      return res
    }
    return null
  }
  toString () {
    if (this.parts.size > 0) {
      return 'composite with [' + join(this.parts.values(), ',') + ']'
    } else {
      return 'composite'
    }
  }
}

class Piece extends Composite {
  constructor () {
    super()
  }
  slide (x, y) {
    return this.parent.slide(this, x, y)
  }
  move (newParent, opts) {
    return this.parent.pass(this, newParent, opts)
  }
  toString () {
    return 'piece ' + super.toString()
  }
}

class Area extends Thing {
  constructor (w, h) {
    super()
    this.w = w
    this.h = h
    this.children = new Set()
  }
  place (parent, x, y) {
    return parent.accept(this, { x: x, y: y })
  }
  tick () {
    for (let e of this.children) {
      e.tick()
    }
  }
  accept (child, opts) {
    assert(child instanceof Thing)
    this.children.add(child)
    child.parent = this
    child.x = opts.x || 0
    child.y = opts.y || 0
    return true
  }
  remove (child) {
    return this.children.delete(child)
  }
  pass (child, newParent, opts) {
    if (this.children.has(child)) {
      if (newParent.accept(child, opts)) {
        this.children.delete(child)
        return true
      }
    }
    return false
  }
  slide (child, x, y) {
    let nx = child.x + x
    let ny =  child.y + y
    if (nx >= 0 && ny >= 0 && nx <= this.w && ny <= this.h) {
      child.x = nx
      child.y = ny
      return true
    }
    return false
  }
  visibleTo (child) {
    let out = []
    for (let e of this.children) {
      if (e === child) {
        continue
      }
      if (e.x == child.x && e.y == child.y) {
        out.push(e)
      }
    }
    return out
  }
  toString () {
    if (this.children.size > 0) {
      return 'area with [' + join(this.children, ',') + ']'
    } else {
      return 'area'
    }
  }
}

class World extends Area {
  constructor (run, w, h) {
    super(w, h)
    this.run = run
  }
  move () {
    assert(false, 'tried to move world')
    return false
  }
  toString () {
    return 'world ' + super.toString()
  }
}

class Component extends Programmable {
  constructor () {
    super()
  }
  toString () {
    return 'component'
  }
}

class Arm1 extends Component {
  constructor () {
    super()
    this.howLongToGrab = 3
    this.grabbing = 0
    this.holding = null
    this.addOp('grab', (m, s) => {
      if (this.holding) {
        s.push('already holding!')
        return
      }
      if (this.grabbing === 0) {
        this.grabbing = this.howLongToGrab
        s.push('grabbing...')
        return
      }
      s.push('already grabbing!')
    })
    this.addOp('release', (m, s) => {
      // let owner = this.piece
      if (this.holding) {
        this.holding.move(this.area, { x: this.holding.x, y: this.holding.y })
        s.push('released')
      } else {
        s.puhs('not holding anything!')
      }
    })
    this.addOp('holding', (m, s) => {
      s.push(this.holding.toString())
    })
    this.addOp('program', (m, s) => {
      if (this.holding) {
        this.holding.installProgram('idle', { alias: 'doodle' })
        s.push('programmed')
        return
      }
      s.push('not now')
    })
    this.compileProgram('grab', 'grab ;')
    this.compileProgram('ongrab', 'holding ;')
    this.compileProgram('onmiss', '"missed!" ; ')
    this.compileProgram('program' , 'program ;')
    this.compileProgram('release', 'release ;')
  }
  command (command) {
    if (this.grabbing > 0) {
      return false
    }
    return super.command(command)
  }
  tick () {
    if (this.grabbing > 0) {
      if ((--this.grabbing) == 0) {
        let near = this.area.visibleTo(this.piece)
        for (let e of near) {
          if (e instanceof Piece) {
            e.move(this)
            super.command('ongrab')
            break
          }
        }
        if (this.holding == null) {
          super.command('onmiss')
        }
      } else {
        return null
      }
    }
    // XXX - should things be entirely disabled when grabbed?
    // if (this.holding) {
    //   this.holding.tick()
    // }
    return super.tick()
  }
  accept (piece) {
    assert(piece instanceof Piece)
    this.holding = piece
    piece.parent = this
    return true
  }
  pass (piece, newParent, opts) {
    if (this.holding == piece) {
      if (newParent.accept(piece, opts)) {
        this.holding = null
        return true
      }
    }
    return false
  }
  slide (child, x, y) {
    // arm has a very strong grip
    return false
  }
  toString () {
    return 'arm ' + super.toString()
  }
}

class Scanner1 extends Component {
  constructor () {
    super()
    this.addOp('scan', (m, s) => {
      let near = this.area.visibleTo(this.piece)
      s.push( near.join(', '))
    })
    this.compileProgram('scan', 'scan ;')
  }
  toString () {
    return 'scanner ' + super.toString()
  }
}

class Player extends Piece {
  constructor () {
    super()
    // default extension points
    this.addSlot('arm-1')
    this.addSlot('arm-2')
    this.addSlot('eye')
    // events for sending back out of the game
    this.events = []
    // some default components
    this.accept(new Arm1(), { slot: 'arm-1' })
    this.accept(new Scanner1(), { slot: 'eye' })
    // some default programs
    this.compileProgram('sample', '1 2 + ;')
    this.compileProgram('help', '"try typing list-programs" ;"')
    this.compileProgram('look', '"scan" "eye" tell ;')
    this.compileProgram('grab', '"grab" "arm-1" tell ;')
    this.installProgram('compose', { f: (m, args) => {
      let res = m.getVariable('res')
      // turn composite result into more user friendly things
      if (res) {
        let events = m.getVariable('out') || []
        for (let r of res) {
          switch (r.src) {
          case 'eye':
            r.typ = 'seen'
            r.src = 'self'
            events.push(r)
            break
          default:
            events.push(r)
          }
        }
        m.setVariable('out', events)
      }
    }})
  }
  startTick (commands) {
    if (commands) {
      for (let c of commands) {
        if (!this.command(c)) {
          this.events.push({
            typ: 'error',
            val: `command overflow`
          })
        }
      }
    }
  }
  tick () {
    let res = super.tick()
    if (res) {
      // if no compose program was installed
      for (let r of res) {
        this.events.push(r)
      }
    }
  }
  endTick () {
    // look for any events in memory
    let out = this.machine.takeVariable('out')
    if (out) {
      this.events = this.events.concat(out)
    }
    let oldEvents = this.events
    this.events = []
    return oldEvents
  }
  toString () {
    return 'player ' + super.toString()
  }
}

class Robot1 extends Piece {
  constructor (name) {
    super()
    this.name = name
    this.compileProgram('doodle', '"doodling" log')
  }
  setName (name) {
    this.name = name
  }
  tick () {
    if (this.machine.hasProgram('idle')) {
      this.command('idle')
    }
    super.tick()
  }
  toString () {
    return `robot '${this.name}'@(${this.x},${this.y}) ` + super.toString()
  }
}

class Run {
  constructor () {
    this.n = 0
    this.world = new World(this, 100, 100)
    this.player = new Player()
    this.player.place(this.world, { x: 10, y: 20 })
    let r1 = new Robot1(makeName())
    r1.place(this.world, { x: 10, y: 20 })
  }
  accept () {
    return false
  }
  tick (commands) {
    this.n++
    this.player.startTick(commands)
    this.world.tick()
    let events = this.player.endTick()
    for (let e of events) {
      e.n = this.n
    }
    return events
  }
  toString () {
    return 'run\n' + this.world + '\n' + this.player
  }
}

export default class Game {
  constructor () {
    this.run = new Run()
  }
  toString () {
    return 'game\n' + this.run
  }
}
