
import makeName from './names.js'
import { join } from './util.js'

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
  constructor (speed, maxPrograms, queueSize, memorySize) {
    this.commandsPerTick = speed
    this.commandsLeftThisTick = 0
    this.maxPrograms = maxPrograms
    this.programs = new Map()
    this.memorySize = memorySize
    this.memory = new Map()
    this.queueSize = queueSize
    this.queue = []
  }
  installProgram (name, func) {
    if (this.programs.size < this.maxPrograms) {
      this.programs.set(name, func)
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
      } else if (p.macro) {
        return 'macro: ' + p.macro
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
    this.commandsLeftThisTick = this.commandsPerTick
  }
  execute () {
    let allRes = []
    loop: for (; this.commandsLeftThisTick > 0 && this.queue.length > 0; this.commandsLeftThisTick--) {
      let line = this.queue.shift()
      let cx = split(line)
      let c = cx.shift()
      // TODO - this is a standin for a programming language
      let prog = this.programs.get(c)
      while (true) {
        if (!prog) {
          allRes.push({
            typ: 'error',
            val: 'don\'t understand ' + c
          })
          continue loop
        } else if (prog.macro) {
          line = prog.macro
          cx = split(line)
          c = cx.shift()
          prog = this.programs.get(c)
        } else {
          break
        }
      }
      if (prog.f) {
        let res = prog.f(this, cx[0] || null)
        if (!res) {
          res = {
            typ: 'res'
          }
        }
        if (!res.typ) {
          res = {
            typ: 'res',
            val: res
          }
        }
        allRes.push(res)
      } else if (prog.c) {
        allRes.push({
          typ: 'res',
          val: prog.c
        })
      } else {
        allRes.push({
          typ: 'error',
          val: 'can\'t do ' +c
        })
      }
    }
    return allRes.length > 0 ? allRes : null
  }
}

class Programmable extends Thing {
  constructor () {
    super()
    // this thing is the actual computer
    this.machine = new Machine(5, 10, 10, 10)
    // universally installed programs
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
  installProgram (name, func) {
    this.machine.installProgram(name, func)
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
    }
    return res
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

class Arm extends Component {
  constructor () {
    super()
    this.howLongToGrab = 3
    this.grabbing = 0
    this.holding = null
    this.installProgram('grab', { f: (m, args) => {
      if (this.holding) {
        return 'already holding!'
      }
      if (this.grabbing === 0) {
        this.grabbing = this.howLongToGrab
        return 'grabbing...'
      }
      return 'already grabbing!'
    } })
    this.installProgram('ongrab', { f: (m, args) => {
      return 'grabbed ' + this.holding
    } })
    this.installProgram('onmiss', { f: (m, args) => {
      return 'missed!'
    } })
    this.installProgram('program' , { f: (m, args) => {
      if (this.holding) {
        this.holding.installProgram('idle', { macro: 'doodle' })
        return 'programmed'
      }
      return 'not now'
    }})
    this.installProgram('release', { f: (m, args) => {
      // let owner = this.piece
      if (this.holding) {
        this.holding.move(this.area, { x: this.holding.x, y: this.holding.y })
        return 'released'
      } else {
        return 'not holding anything!'
      }
    } })
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

class Scanner extends Component {
  constructor () {
    super()
    this.installProgram('scan', { f: (m, args) => {
      let near = this.area.visibleTo(this.piece)
      let seen = []
      for (let e of near) {
        seen.push(e.toString())
      }
      return {
        typ: 'res',
        val: seen
      }
    } })
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
    this.accept(new Arm(), { slot: 'arm-1' })
    this.accept(new Scanner(), { slot: 'eye' })
    // some default programs
    this.installProgram('help', { c: 'try typing list-programs' })
    this.installProgram('look', { macro: 'tell eye scan' })
    this.installProgram('grab', { macro: 'tell arm-1 grab' })
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
  startTick (programs) {
    if (programs) {
      for (let p of programs) {
        if (!this.command(p)) {
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
        events.push(r)
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

class Robot extends Piece {
  constructor (name) {
    super()
    this.name = name
    this.installProgram('doodle', { f: (m, args) => {
      console.log('doodling')
    } })
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
    let r1 = new Robot(makeName())
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
