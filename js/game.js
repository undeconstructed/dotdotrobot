
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

class Programmable extends Thing {
  constructor () {
    super()
    // how many commands to run per tick
    this.speed = 5
    // how many incoming executions can be queued
    this.capacity = 1
    // queued executions
    this.commands = []
    // installed programs
    this.programs = new Map()
    // universally installed programs
    this.install('list-programs', { f: (args) => {
      return [...this.programs.keys()]
    } })
    this.install('dump-program', { f: (args) => {
      let p = this.programs.get(args)
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
    } })
    this.install('describe', { f: (args) => {
      return this.toString()
    } })
  }
  install (name, func) {
    this.programs.set(name, func)
  }
  command (program) {
    if (this.commands.length < this.capacity) {
      this.commands.push(program)
      return true
    }
    return false
  }
  tick () {
    let allRes = []
    loop: for (let t = this.speed; t > 0 && this.commands.length > 0; t--) {
      let line = this.commands.shift()
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
        let res = prog.f(cx[0] || null)
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

class Composite extends Programmable {
  constructor () {
    super()
    this.slots = new Set()
    this.parts = new Map()
    this.install('tell', { f: (args) => {
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
    this.install('list-slots', { f: (args) => {
      return [...this.slots]
    } })
    this.install('list-parts', { f: (args) => {
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
    return {
      typ: 'res*',
      val: res
    }
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
    if (this.parent.slide(this, x, y)) {
      this.x += x
      this.y += y
      return true
    }
    return false
  }
  move (newParent) {
    if (this.parent.pass(this, newParent)) {
      this.parent = newParent
      this.x = 0
      this.y = 0
      return true
    }
    return false
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
    return this.children.remove(child)
  }
  pass (child, newParent, opts) {
    if (this.children.remove(child)) {
      return newParent.accept(child, opts)
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
    this.install('grab', { f: (args) => {
      return 'grabbed'
    } })
  }
  toString () {
    return 'arm ' + super.toString()
  }
}

class Scanner extends Component {
  constructor () {
    super()
    this.install('scan', { f: (args) => {
      let near = this.area.visibleTo(this.piece)
      let seen = []
      for (let e of near) {
        seen.push(e.toString())
      }
      return {
        typ: 'seen',
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
    this.install('help', { c: 'try typing list-programs' })
    this.install('look', { macro: 'tell eye scan' })
    this.install('grab', { macro: 'tell arm-1 grab' })
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
    // turn composite result into more user friendly things
    // TODO - this should be in the default program of the player, not a hard coded thing
    if (res.typ === 'res*' && res.val) {
      for (let r of res.val) {
        switch (r.typ) {
        case 'seen':
          r.src = 'self'
          this.events.push(r)
          break
        default:
          this.events.push(r)
        }
      }
    }
  }
  endTick () {
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
  }
  setName (name) {
    this.name = name
  }
  tick () {
    // this.slide(1, 0)
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
    this.player.place(this.world, { x: 0, y: 0 })
    let r1 = new Robot(makeName())
    r1.place(this.world, { x: 0, y: 0 })
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
