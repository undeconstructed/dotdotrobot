
import { assert, split, join, distance } from './util.js'
import * as random from './random.js'
import Machine from './machine.js'
import * as lang from './lang.js'

class Thing {
  constructor (opts) {
    opts = opts || {}
    this.parent = opts.parent || null
    this.size = opts.size || 'small'
    this.position = opts.position || null
    this.colour = opts.colour || 'white'
    this.motion = opts.motion || null
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
  constructor (opts) {
    super(opts)
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
  constructor (opts) {
    super(opts)
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
    return []
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
  constructor (opts) {
    super(opts)
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
    for (let child of this.children) {
      child.tick()
    }
    for (let child of this.children) {
      if (child.motion) {
        let m = child.motion
        let nx = child.position.x + m.x
        let ny =  child.position.y + m.y
        if (nx < 0) nx = 0
        if (ny < 0) ny = 0
        if (nx > this.w) nx = this.w
        if (ny > this.h) ny = this.h
        child.position.x = nx
        child.position.y = ny
        // motion stops immediately for now
        child.motion = { x: 0, y: 0 }
      }
    }
  }
  accept (child, opts) {
    assert(child instanceof Thing)
    this.children.add(child)
    child.parent = this
    child.position = {
      x: opts.x || 0,
      y: opts.y || 0
    }
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
  visibleTo (child) {
    let out = []
    for (let e of this.children) {
      if (e === child) {
        continue
      }
      let dist = distance(child.position, e.position)
      if (dist < 50) {
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
        this.holding.move(this.area, this.holding.position)
        s.push('released')
      } else {
        s.push('not holding anything!')
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
    if (this.holding === piece) {
      if (newParent.accept(piece, opts)) {
        this.holding = null
        return true
      }
    }
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
      let o = near.map(e => ({
        x: e.position.x,
        y: e.position.y,
        size: e.size,
        colour: e.colour
      }))
      s.push(JSON.stringify(o))
    })
    this.compileProgram('scan', 'scan ;')
  }
  toString () {
    return 'scanner ' + super.toString()
  }
}

class Player extends Piece {
  constructor () {
    super({ colour: 'pink', size: 'medium' })
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
    this.installProgram('set-idle', { f: (m, args) => {
      let prog = args ? args.trim() : null
      if (prog) {
        this.installProgram('idle', { alias: prog })
      } else {
        this.installProgam('idle', null)
      }
      return 'ok'
    } })
    this.installProgram('state', { f: (m, args) => {
      return {
        typ: 'state',
        val: {
          power: 100,
          wear: 10
        }
      }
    } })
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
    } })
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
    if (this.machine.cp0 > 0 && this.machine.hasProgram('idle')) {
      this.command('idle')
      let res2 = this.machine.execute()
      if (res2) {
        if (res) {
          res = res.concat(res2)
        } else {
          res = res2
        }
      }
    }
    if (res) {
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
  constructor (name, colour) {
    super({ colour })
    this.name = name
    this.power = { x: 0, y: 0 }
    this.machine.addOp('power', (m, s) => {
      let [y, x] = [s.pop(), s.pop()]
      this.power.x = x
      this.power.y = y
    })
    this.compileProgram('doodle', '0 2 rand 0 2 rand power ;')
  }
  setName (name) {
    this.name = name
  }
  tick () {
    super.tick()
    if (this.machine.cp0 > 0 && this.machine.hasProgram('idle')) {
      this.command('idle')
      this.machine.execute()
    }
    this.motion = { x: this.power.x, y: this.power.y }
  }
  toString () {
    return `${this.colour} robot '${this.name}' ` + super.toString()
  }
}

class Run {
  constructor () {
    this.n = 0
    this.world = new World(this, 100, 100)
    this.player = new Player()
    this.player.place(this.world, { x: 10, y: 20 })
    this.addRandomRobot({ x: 12, y: 16 })
    this.addRandomRobot({ x: 1, y: 1 })
    this.addRandomRobot({ x: 8, y: 22 })
    this.addRandomRobot({ x: 80, y: 90 })
  }
  addRandomRobot (opts) {
    new Robot1(random.name(), random.colour()).place(this.world, opts)
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
