
import makeName from './names.js'
import { join } from './util.js'

class Thing {
  constructor () {
    this.parent = null
  }
  place (parent, opts) {
    return parent.accept(this, opts)
  }
  tick () {
  }
  accept () {
    console.log('error')
    return false
  }
  toString () {
    return 'thing'
  }
}

class Programmable extends Thing {
  constructor () {
    super()
    this.commands = null
    this.canDo = []
    this.install('describe', { f: (args) => {
      return {
        type: 'description',
        value: this.toString(),
      }
    }})
  }
  install (name, func) {
    this.canDo[name] = func
  }
  command (commands) {
    if (commands) {
      this.commands = commands
    }
  }
  tick () {
    if (this.commands) {
      let allRes = []
      for (let c of this.commands) {
        let func = this.canDo[c]
        if (!func) {
          allRes.push({
            type: 'don\'t understand',
            value: c
          })
          continue
        }
        if (func.f) {
          let res = func.f()
          allRes.push(res)
        } else if (func.macro) {
          allRes.push({
            type: 'not done',
            value: func.macro
          })
        } else {
          allRes.push({
            type: 'can\'t do',
            value: c
          })
        }
      }
      this.commands = null
      return {
        type: 'programmable-ran',
        value: allRes
      }
    } else {
      return {
        type: 'programmable-bored'
      }
    }
  }
}

class Composite extends Programmable {
  constructor () {
    super()
    this.parts = new Map()
    this.install('tell', { f: (args) => {
      return {
        type: 'tell',
        value: 'fail'
      }
    } })
  }
  accept (component, opts) {
    // assert component is Component
    this.parts.set(opts.slot, component)
    component.parent = this
    return true
  }
  tick () {
    let r0 = super.tick()
    let res = new Map()
    this.parts.forEach(e => {
      let o = e.tick()
      res.set(e.name, o)
    })
    return {
      type: 'composite-ran',
      self: r0,
      parts: res
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
    // assert child is Thing
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
    return false
  }
  toString () {
    return 'world ' + super.toString()
  }
}

class Component extends Programmable {
  constructor (name) {
    super()
    this.name = name
  }
  tick () {
    return {
      type: 'component-ran',
      name: this.name
    }
  }
  toString () {
    return 'component ' + this.name
  }
}

class Arm extends Component {
  constructor (name) {
    super('arm-' + name)
    this.install('grab', { f: (args) => {
      console.log('grab', args)
    } })
  }
  tick () {
    return {
      type: 'arm-component-ran',
      name: this.name
    }
  }
  toString () {
    return 'arm ' + super.toString()
  }
}

class Scanner extends Component {
  constructor (name) {
    super('scanner-' + name)
    this.install('scan', { f: (args) => {
      console.log('scan', args)
    } })
  }
  tick () {
    return {
      type: 'scanner-component-ran',
      name: this.name
    }
  }
  toString () {
    return 'scanner ' + super.toString()
  }
}

class Player extends Piece {
  constructor () {
    super()
    this.events = []
    this.accept(new Arm('arm'), { slot: 'arm' })
    this.accept(new Scanner('eye'), { slot: 'eye' })
    this.install('look', { f: (args) => {
      // TODO - delegate to scanner
      let near = this.parent.visibleTo(this)
      let out = []
      for (let e of near) {
        out.push({
          type: 'seen',
          value: e.toString()
        })
      }
      return out
    } })
    this.install('grab', { macro: 'tell arm-1 grab' })
  }
  startTick (commands) {
    if (commands) {
      this.events.push({
        type: 'info',
        value: 'commands downloaded'
      })
    }
    this.command(commands)
  }
  tick () {
    let res = super.tick()
    this.events.push({
      type: 'player-ran',
      value: res
    })
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
