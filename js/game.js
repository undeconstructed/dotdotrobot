
import { assert, split, join, distance, toRadians, popN, popArgs } from './util.js'
import * as random from './random.js'
import Machine from './machine.js'
import * as lang from './lang.js'

/**
 * HW: Action helps writing behaviours that take a little while.
 */
class Action {
  tick () {
    return true
  }
}

/**
 * HW: ProgressAction takes several ticks to complete.
 */
class ProgressAction extends Action {
  constructor (ticks) {
    super()
    this.ticks = ticks || 2
    this.started = false
  }
  start () {}
  tick () {
    if (!this.started) {
      this.start()
      this.started = true
    }
    this.ticks--
    this.onTick()
    if (this.ticks === 0) {
      this.end()
      return true
    }
    return false
  }
  onTick () {
  }
  end () {}
}

const IDENTITY = (e => e)

/**
 * HW: AutoAction is a helper for writing ProgressActions inline.
 */
class AutoAction extends ProgressAction {
  constructor (ticks, start, tick, end) {
    super(ticks)
    this.onstart = start || IDENTITY
    this.ontick = tick || IDENTITY
    this.onend = end || IDENTITY
  }
  start () {
    this.onstart()
  }
  onTick () {
    this.ontick()
    return true
  }
  end () {
    this.onend()
  }
}

/**
 * HW: ActionQueue runs actions, and knows if it is busy.
 */
class ActionQueue {
  constructor (length) {
    this.maxLength = length
    this.actions = []
  }
  get busy () {
    return this.actions.length > 0
  }
  get full () {
    return this.actions.length === this.maxLength
  }
  add (opts) {
    if (this.full) {
      console.log('full')
      return false
    }
    let action = opts
    if (!(action instanceof Action)) {
      action = new AutoAction(opts.ticks, opts.start, opts.tick, opts.end)
    }
    this.actions.push(action)
  }
  tick () {
    if (this.busy) {
      let done = this.actions[0].tick()
      if (done) {
        this.actions.shift()
      }
    }
  }
}

/**
 * DotLive is all the things in the game that do something on each tick.
 */
class DotLive {
  constructor (run) {
    assert(run instanceof Run)
    this.run = run
  }
  get hz() {
    return this.run.hz
  }
  tick () {
  }
}

/**
 * DotObject is all the things in the game that have some sort of presence in the world.
 */
class DotObject extends DotLive {
  constructor (run, opts) {
    super(run)
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
    let o = this
    let p = o.parent
    while (!(p instanceof Area)) {
      o = p
      p = o.parent
    }
    return o
  }
  tick () {
  }
  accept () {
    assert(false, 'tried to get a thing to accept something')
    return false
  }
  move (newParent, opts) {
    return this.parent.pass(this, newParent, opts)
  }
  toString () {
    return 'thing'
  }
}

/**
 * Area can contain objects, and lay them out in some sort of geography.
 */
class Area extends DotObject {
  constructor (run, w, h) {
    super(run)
    this.w = w
    this.h = h
    this.children = new Set()
    this.airwaves = new Map()
    this.airwavesNext = new Map()
  }
  place (parent, x, y) {
    return parent.accept(this, { x: x, y: y })
  }
  tick () {
    for (let child of this.children) {
      child.tick()
    }
    for (let child of this.children) {
      if (child.motion && child.motion.p) {
        let m = child.motion
        let [dx, dy] = this.motionToMap(m)
        let nx = child.position.x + dx
        let ny =  child.position.y + dy
        if (nx < 0) nx = 0
        if (ny < 0) ny = 0
        if (nx > this.w) nx = this.w
        if (ny > this.h) ny = this.h
        child.position.x = nx
        child.position.y = ny
        // motion stops immediately for now
        child.motion = null
      }
    }
    // transmissions from this tick appear to read in the next
    this.airwaves = this.airwavesNext
    this.airwavesNext = new Map()
  }
  accept (child, opts) {
    assert(child instanceof DotObject)
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
  visibleTo (child, distance = 10) {
    let out = []
    for (let e of this.children) {
      if (e === child) {
        continue
      }
      let [b, d] = this.mapToMotion(e.position.x - child.position.x, e.position.y - child.position.y)
      if (d < distance) {
        out.push({
          direction: b,
          distance: d,
          e: e
        })
      }
    }
    return out
  }
  motionToMap (motion) {
    // no resistence for now
    let magnitude = motion.p
    let x = magnitude * Math.cos(motion.d)
    let y = magnitude * Math.sin(motion.d)
    return [x, y]
  }
  mapToMotion (dx, dy) {
    let m = Math.sqrt(dx**2 + dy**2)
    let b = Math.atan2(dy, dx)
    return [b, m]
  }
  tx (frequency, data) {
    // console.log('tx', frequency, data)
    this.airwavesNext.set(frequency, {
      done: false,
      data: data
    })
  }
  rx (frequency) {
    let x = this.airwaves.get(frequency)
    if (x) {
      // console.log('rx', frequency, x.data)
      return x.data
    }
    return null
  }
  toString () {
    if (this.children.size > 0) {
      return 'area with [' + join(this.children, ',') + ']'
    } else {
      return 'area'
    }
  }
}

/**
 * World is an Area and is the root container of all things.
 */
class World extends Area {
  constructor (run, w, h) {
    super(run, w, h)
  }
  move () {
    assert(false, 'tried to move world')
    return false
  }
  toString () {
    return 'world ' + super.toString()
  }
}

/**
 * Programmables have a Machine in them.
 */
class Programmable extends DotObject {
  constructor (run, opts) {
    super(run, opts)
    // this thing is the actual computer
    this.machine = new Machine(100 / this.hz, 20, 10, 10)
    // results of execution
    this._results = []
    // universally installed programs
    this.addHardWord('log', (m, s) => {
      console.log('log', s.pop())
    })
    this.addHardWord('describe', (m, s) => {
      s.push(this.toString())
    })
  }
  addHardWord (name, func) {
    this.machine.addHardWord(name, func)
  }
  compileWord (name, src) {
    this.machine.installWord(name, { src: src, app: lang.parse(src) })
  }
  command (cmd) {
    cmd.app = lang.parse(cmd.src)
    return this.machine.enqueue(cmd)
  }
  // tick will tick the enclosed machine and execute it
  tick () {
    this.machine.tick()
    this.execute()
  }
  execute () {
    let res = this.machine.execute()
    for (let r of res) {
      if (r.e) {
        console.log(r.e)
        delete r.e
      }
    }
    this._results = this._results.concat(res)
  }
  // results will take ownership all queued up results
  results () {
    let r = this._results
    this._results = []
    return r
  }
}

/**
 * BROKEN? SocketComposite can have other programmable things (SocketComponents) inserted
 * into them. Sockets are fairly complicated to deal with, with is why SimpleComposite
 * also exists.
 */
class SocketComposite extends Programmable {
  constructor (run, opts) {
    super(run, opts)
    this.slots = new Set()
    this.parts = new Map()
    // where composed result is after tick
    this.composition = null
    // hardware functions
    this.addHardWord('list-slots', (m, s) => {
      return [...this.slots]
    })
    this.addHardWord('list-parts', (m, s) => {
      let list = {}
      this.parts.forEach((v, k) => {
        list[k] = v.toString()
      })
      return list
    })
    this.addHardWord('tell', (m, s) => {
      let [tgt, src] = [s.pop(), s.pop()]
      let part = this.parts.get(tgt)
      if (part) {
        // XXX - is this right place to compile?
        let app = lang.parse(src)
        let cmd = [ 'queue', [ null, app ] ]
        if (part.socket.send(cmd)) {
          s.push('ok')
        } else {
          s.push('overflow')
        }
      } else {
        s.push('no part')
      }
    })
    this.addHardWord('copy', (m, s) => {
      // let [data, tgt, name] = [s.pop(), s.pop(), s.pop()]
      let args = popArgs(s, ['data', 'tgt', 'name'])
      let part = this.parts.get(args.tgt)
      if (part) {
        let cmd = [ 'write', [ args.name, args.data ] ]
        part.socket.send(cmd)
        s.push('ok')
      } else {
        s.push('no part')
      }
    })
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
    component.socket.plug(this)
    return true
  }
  tick () {
    super.tick()
    this.parts.forEach((part, slot) => part.tick())
    this.composition = this.compose()
  }
  compose () {
    let res = []
    this.parts.forEach((part, slot) => {
      let r = null
      while ((r = part.socket.recv()) != null) {
        if (r[0] === 'output') {
          res.push({
            typ: r[1],
            src: slot,
            val: r[2]
          })
        } else {
          res.push({
            typ: 'debug',
            src: slot,
            val: r
          })
        }
      }
    })
    if (res.length > 0) {
      if (this.machine.hasWord('compose')) {
        this.machine.setVariable('res', res)
        // TODO - this might overflow
        this.command({ src: '"res" compose' })
        this.execute()
        return 'composed'
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

/**
 * BROKEN? SocketComponents have sockets so they can be inserted into a SocketComposite.
 */
class SocketComponent extends Programmable {
  constructor (run) {
    super(run)
    this.socket0 = this.machine.newSocket()
    this.addHardWord('return', (m, s) => {
      let [name, val] = [s.pop(), s.pop()]
      this.socket0.push([ 'output', name, val ])
    })
  }
  get socket () {
    return this.socket0
  }
  tick () {
    super.tick()
    for (let r of this.results()) {
      if (r.id) {
        this.socket0.push([ 'res', r ])
      }
    }
  }
  toString () {
    return 'component'
  }
}

/**
 * SimpleComposites can have lightweight components inserted, which are
 * directly controlled from the owners Machine. This is achieved by letting
 * the components install words into their parent composite.
 */
class SimpleComposite extends Programmable {
  constructor(run, opts) {
    super(run, opts)
    this.slots = new Set()
    this.parts = new Map()
    // hardware functions
    this.addHardWord('list-slots', (m, s) => {
      return [...this.slots]
    })
    this.addHardWord('list-parts', (m, s) => {
      let list = {}
      this.parts.forEach((v, k) => {
        list[k] = v.toString()
      })
      return list
    })
  }
  addSlot (name) {
    this.slots.add(name)
  }
  install (slot, component) {
    assert(component instanceof SimpleComponent)
    if (!this.slots.has(slot) || this.parts.get(slot)) {
      return false
    }
    this.parts.set(slot, component)
    component.linkUp(this, slot)
    let ops = component.ops
    for (let k of Object.keys(ops)) {
      this.machine.addHardWord(slot + '-' + k, ops[k])
    }
    return true
  }
  uninstall (slot) {
    // TODO
  }
  tick () {
    super.tick()
    for (let part of this.parts.values()) {
      part.tick()
    }
  }
  accept (piece) {
    for (let part of this.parts.values()) {
      if (part.accept(piece)) {
        return true
      }
    }
    return false
  }
  pass (piece, newParent, opts) {
    for (let part of this.parts.values()) {
      if (part.pass(piece, newParent, opts)) {
        return true
      }
    }
    return false
  }
}

/**
 * SimpleComponents are tightly coupled with their parent, and do not have their
 * own Machines. They can have no presence except as part of a SimpleComposite.
 */
class SimpleComponent extends DotLive {
  constructor (run, opts) {
    super(run)
    this.owner = null
    this.ops = opts.ops || {}
  }
  linkUp (owner, id) {
    assert(owner instanceof SimpleComposite)
    this.owner = owner
    this.id = id
  }
  accept (piece) {
    return false
  }
  pass (piece, newParent, opts) {
    return false
  }
  toString () {
    return 'simple component'
  }
}

/**
 * LocatorCore is functionality of a GPS thing, for use in components etc.
 */
class LocatorCore {
  locate (host) {
    return {
      x: host.position.x,
      y: host.position.y
    }
  }
}

/**
 * RadioCore is functionality of a radio thing, for use in components etc.
 */
class RadioCore {
  constructor (frequency) {
    this.frequency = frequency
  }
  tx (host, data) {
    if (typeof data != 'string') {
      throw new Error('must write string')
    }
    host.area.tx(this.frequency + 1, data)
  }
  rx (host) {
    return host.area.rx(this.frequency)
  }
}

/**
 * SimpleRadioComponent is a basic radio as a SimpleComponent.
 */
class SimpleRadioComponent extends SimpleComponent {
  constructor (run) {
    super(run)
    this.core = new RadioCore()
  }
  tick () {
  }
  toString () {
    return `radio@${this.core.frequency} ${super.toString()}`
  }
}

/**
 * RadarCore is functionality of a scanner, for use in components etc.
 */
class RadarCore {
  constructor (range = 5) {
    this.range = range
  }
  scan (host) {
    let near = host.area.visibleTo(host.piece)
    let o = near.map(e => ({
      direction: e.direction,
      distance: e.distance,
      size: e.e.size,
      colour: e.e.colour
    }))
    return o
  }
}

/**
 * BROKEN? RadarSocketComponent is a basic scanner as a SocketComponent.
 */
class RadarSocketComponent extends SocketComponent {
  constructor (run) {
    super(run)
    this.core = new RadarCore()
    this.scanning = 0
    this.timeToScan = 1
    this.addHardWord('scan', (m, s) => {
      this.scanning = this.timeToScan
      s.push('scanning')
    })
    this.compileWord('do-scan', 'scan ;')
    this.compileWord('onscan', '"seen" load tojson "seen" return ;')
  }
  tick () {
    if (this.scanning > 0) {
      if ((--this.scanning) == 0) {
        let o = this.core.scan(this)
        this.machine.setVariable('seen', o)
        if (this.machine.hasWord('onscan')) {
          this.command({ src: 'onscan' })
        }
      }
    }
    super.tick()
  }
  toString () {
    return 'scanner ' + super.toString()
  }
}

/**
 * RadarSimpleComponent is a basic scanner as a SimpleComponent.
 */
class RadarSimpleComponent extends SimpleComponent {
  constructor (run) {
    super(run, {
      ops: {
        'scan': (m, s) => {
          if (this.actions.busy) {
            return s.push('busy')
          }
          let args = popArgs(s, [ 'hook' ])
          this.actions.add({ end: () => this._scan(args), ticks: this.timeToScan })
          s.push('scanning')
        }
      }
    })
    this.core = new RadarCore(10)
    this.actions = new ActionQueue()
    this.timeToScan = 0.1 * this.hz
  }
  _scan (args) {
    let o = this.core.scan(this.owner)
    this.owner.machine.setVariable('seen', JSON.stringify(o))
    // this.owner.command({ src: `"seen" load "seen" list-from-json ${args.hook}` })
    this.owner.command({ src: `${args.hook}` })
  }
  tick () {
    this.actions.tick()
  }
  toString () {
    return 'scanner ' + super.toString()
  }
}

/**
 * ArmCore is the functionality of an arm, for use in components etc.
 */
class ArmCore {
}

/**
 * BROKEN? ArmSocketComponent is a basic arm as a SocketComponent.
 */
class ArmSocketComponent extends SocketComponent {
  constructor (run) {
    super(run)
    this.howLongToGrab = 3
    this.grabbing = 0
    this.holding = null
    this.addHardWord('grab', (m, s) => {
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
    this.addHardWord('release', (m, s) => {
      // let owner = this.piece
      if (this.holding) {
        if (this.holding.socket) {
          this.holding.socket.unplug()
        }
        this.holding.move(this.area, this.holding.position)
        s.push('ok')
      } else {
        s.push('not holding anything!')
      }
    })
    this.addHardWord('holding', (m, s) => {
      if (this.holding) {
        s.push(this.holding.toString())
      } else {
        s.push('nothing')
      }
    })
    this.addHardWord('tell', (m, s) => {
      let src = s.pop()
      if (this.holding) {
        let socket = this.holding.socket
        if (socket) {
          // XXX - is this right place to compile?
          let app = lang.parse(src)
          let cmd = [ 'queue', [ null, app ] ]
          socket.send(cmd)
          s.push('ok')
          return
        } else {
          s.push('no socket')
          return
        }
      }
      s.push('not holding anything!')
    })
    this.addHardWord('copy', (m, s) => {
      let args = popArgs(s, ['data', 'name'])
      if (this.holding) {
        let socket = this.holding.socket
        if (socket) {
          let cmd = [ 'write', [ args.name, args.data ] ]
          socket.send(cmd)
          s.push('ok')
          return
        } else {
          s.push('no socket')
          return
        }
      }
      s.push('not holding anything!')
    })
    this.compileWord('do-grab', 'grab "grab" return ;')
    this.compileWord('ongrab', 'holding "grabbed" return ;')
    this.compileWord('onmiss', '"missed" "missed" return ; ')
    this.compileWord('do-tell' , 'program "programmed" return ;')
    this.compileWord('do-release', 'release "released" return ;')
  }
  tick () {
    if (this.grabbing > 0) {
      if ((--this.grabbing) == 0) {
        let near = this.area.visibleTo(this.piece)
        for (let e of near) {
          if (e.e.move(this)) {
            if (this.holding.socket) {
              this.holding.socket.plug(this)
            }
            this.command({ src: 'ongrab' })
            break
          }
        }
        if (this.holding == null) {
          this.command({ src: 'onmiss' })
        }
      }
    }
    if (this.holding) {
      this.holding.tick()
      // stop the thing dead
      this.holding.motion = null
    }
    super.tick()
  }
  accept (o) {
    this.holding = o
    o.parent = this
    return true
  }
  pass (o, newParent, opts) {
    if (this.holding === o) {
      if (newParent.accept(o, opts)) {
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

/**
 * ArmSimpleComponent is a basic arm as a SimpleComponent.
 */
class ArmSimpleComponent extends SimpleComponent {
  constructor(run) {
    super(run, {
      ops: {
        'grab': (m, s) => {
          let args = popArgs(s, [ 'direction', 'hook' ])
          if (this.actions.busy) {
            return s.push('busy')
          }
          if (this.holding) {
            return s.push('already holding!')
          }
          this.actions.add({ end: () => this._grab(args), ticks: this.timeToGrab })
          s.push('grabbing...')
        },
        'release': (m, s) => {
          let args = popArgs(s, [ 'hook' ])
          if (this.actions.busy) {
            return s.push('busy')
          }
          if (!this.holding) {
            return s.push('not holding anything!')
          }
          this.actions.add({ end: () => this._release(args), ticks: this.timeToRelease })
          s.push('releasing...')
        },
        'holding': (m, s) => {
          if (!this.holding) {
            return s.push(null)
          }
          s.push(this.holding.toString())
        },
        'tell': (m, s) => {
          let args = popArgs(s, [ 'src', 'hook' ])
          // XXX - is this right place to compile?
          let app = lang.parse(args.src)
          if (this.actions.busy) {
            return s.push('busy')
          }
          if (!this.holding) {
            return s.push('not holding anything!')
          }
          let socket = this.holding.socket
          if (!socket) {
            return s.push('no socket')
          }
          let cmd = [ 'queue', [ null, app ] ]
          this.holding.socket.send(cmd)
          this.actions.add({ end: () => {
            let data = this.holding.socket.recv()
            this.owner.machine.setVariable('just-read', data)
            this.owner.command({ src: `"just-read" load ${args.hook}` })
          } })
          s.push('ok')
        },
        'read': (m, s) => {
          let args = popArgs(s, ['name', 'hook'])
          if (this.actions.busy) {
            return s.push('busy')
          }
          if (!this.holding) {
            return s.push('not holding anything!')
          }
          let socket = this.holding.socket
          if (!socket) {
            return s.push('no socket')
          }
          let cmd = [ 'read', [ args.name ] ]
          this.holding.socket.send(cmd)
          this.actions.add({ end: () => {
            let data = this.holding.socket.recv()
            this.owner.machine.setVariable('just-read', data[2])
            this.owner.command({ src: `"just-read" load ${args.hook}` })
          } })
          s.push('ok')
        },
        'recv': (m, s) => {
          let data = this.holding.socket.recv()
          s.push(data)
        },
        'write': (m, s) => {
          let args = popArgs(s, ['data', 'name'])
          if (this.actions.busy) {
            return s.push('busy')
          }
          if (!this.holding) {
            return s.push('not holding anything!')
          }
          let socket = this.holding.socket
          if (!socket) {
            return s.push('no socket')
          }
          let cmd = [ 'write', [ args.name, args.data ] ]
          this.holding.socket.send(cmd)
          this.actions.add({ end: () => {
            let data = this.holding.socket.recv()
            this.owner.machine.setVariable('just-read', data)
            this.owner.command({ src: `"just-read" load ${args.hook}` })
          } })
          s.push('ok')
        }
      }
    })
    this.core = new ArmCore()
    this.actions = new ActionQueue(1)
    this.timeToGrab = 3 * this.hz
    this.timeToRelease = 0.5 * this.hz
    this.holding = null
  }
  _grab (args) {
    // let direction = toRadians(args.direction)
    let direction = args.direction
    let near = this.owner.area.visibleTo(this.owner.piece)
    near.sort((a, b) => a.distance - b.distance)
    for (let e of near) {
      if (e.distance <= 1) {
        // very close things confuse the directions
      } else {
        let diff = Math.abs(e.direction - direction)
        if (diff > 0.3) {
          continue
        }
      }
      if (e.e.move(this.owner)) {
        if (this.holding.socket) {
          this.holding.socket.plug(this)
        }
        break
      }
    }
    this.owner.command({ src: `${args.hook}` })
  }
  _release (args) {
    if (this.holding.socket) {
      this.holding.socket.unplug()
    }
    this.holding.move(this.owner.area, this.owner.position)
    this.owner.command({ src: `${args.hook}` })
  }
  tick () {
    this.actions.tick()
    if (this.holding) {
      this.holding.tick()
      // stop the thing dead
      this.holding.motion = null
      // let socket = this.holding.socket
      // if (socket) {
      //   let data = socket.recv()
      //   if (data) {
      //     this.owner.machine.setVariable('just-read', data)
      //   }
      // }
    }
  }
  accept (o) {
    this.holding = o
    o.parent = this.owner
    return true
  }
  pass (o, newParent, opts) {
    if (this.holding === o) {
      if (newParent.accept(o, opts)) {
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

/**
 * SocketControlCentre uses the SocketComposite system.
 */
class SocketControlCentre extends SocketComposite {
  constructor (run, opts) {
    super(run, opts)
    // default extension points
    this.addSlot('arm-1')
    this.addSlot('arm-2')
    this.addSlot('eye')
    // some default components
    this.accept(new ArmSocketComponent(this.run), { slot: 'arm-1' })
    this.accept(new RadarSocketComponent(this.run), { slot: 'eye' })
    // hardwords
    this.addHardWord('state', (m, s) => {
      s.push({
        position: this.position,
        power: [100, 100],
        wear: [10, 100]
      })
    })
    this.addHardWord('return', (m, s) => {
      let args = popArgs(s, [ 'data', 'name' ])
      this.events.push({
        typ: args.name,
        val: args.data
      })
    })
    // XXX - only exists because can't write this as app
    this.addHardWord('compose0', (m, s) => {
      let res = m.get(s.pop())
      // turn composite result into more user friendly things
      if (res) {
        let events = m.get('out') || []
        for (let r of res) {
          if (r.typ === 'res') {
            if (r.id) {
              events.push(r)
            }
          } else if (r.typ === 'debug') {
            // console.log('debug', r)
          } else {
            events.push(r)
          }
        }
        m.set('out', events)
      }
      s.push('ok')
    })
    // some default words
    this.compileWord('look', '"scan" "eye" tell ;')
    this.compileWord('grab', '"grab" "arm-1" tell ;')
    this.compileWord('compose', 'compose0 ;')
  }
  tick () {
    super.tick()
    if (this.composition) {
      if (this.composition === 'composed') {
        // look for any composed events in memory
        let out = this.machine.takeVariable('out')
        if (out) {
          this.events = this.events.concat(out)
        }
      } else {
        // else events direct from components
        this.events = this.events.concat(this.composition)
      }
    }
    if (this.machine.timeLeft > 0 && this.machine.hasWord('idle')) {
      this.command({ src: 'idle' })
      this.execute()
    }
  }
}

/**
 * SimpleControlCentre uses the SimpleComposite system.
 */
class SimpleControlCentre extends SimpleComposite {
  constructor (run, opts) {
    super(run, opts)
    // default extension points
    this.addSlot('arm-1')
    this.addSlot('arm-2')
    this.addSlot('eye')
    // events for sending back out of the game
    this.events = []
    // some default components
    this.install('eye', new RadarSimpleComponent(this.run))
    this.install('arm-1', new ArmSimpleComponent(this.run))
    // hardwords
    this.addHardWord('state', (m, s) => {
      s.push({
        position: this.position,
        power: [100, 100],
        wear: [10, 100]
      })
    })
    this.addHardWord('return', (m, s) => {
      let args = popArgs(s, [ 'data', 'tag' ])
      this.events.push({
        typ: 'ret',
        tag: args.tag,
        val: args.data
      })
    })
    // some default words
    this.compileWord('rot', 'dup 1 - 0 loop dup pull-up swap ; drop ;')
    // this.compileWord('list-n', 'dup 1 + pull-up swap dup 1 + swap 0 loop dup pull-up 2 pull-up swap list-down swap 1 - ; drop ;')
    this.compileWord('list-n', '')
    this.compileWord('list-each', '1 pull-up load2 1 pull-up drop list-each-inner drop drop')
    this.compileWord('list-each-inner', 'dup 0 != if load2 2 pull-up dup 3 pull-up 1 pull-up call 1 pull-up list-each-inner ;')

    this.compileWord('make-list', '"t" list-new 2 "t" list-push 1 "t" list-push')
    this.compileWord('test', ':cb "x" return ; make-list "t" "cb" list-each')

    this.compileWord('look-loop-1', '"look-loop-1" eye-scan ;')
    this.compileWord('look-loop-2', 'list swap "self" 0 0 10 10 5 pull-up 6 list-n to-json "seen" return "look-loop-1" queue ;')
    this.compileWord('grab', '"on-grab" arm-1-grab ;')
    this.compileWord('on-grab', 'arm-1-holding "grabbed" return ;')
    this.compileWord('program', '`"explore" in-a-second` "on-program" arm-1-tell ;')
    this.compileWord('on-program', '"done" "programmed" return release ;')
    this.compileWord('release', '"on-release" arm-1-release ;')
    this.compileWord('on-release', '"done" "released" return ;')
    this.compileWord('read', '"seen" "on-read" arm-1-read ;')
    // this.compileWord('on-read', 'list swap "r1" 0 15 5 10 5 pull-up 6 list-n to-json "seen" return ;')

    this.compileWord('setup-mapping', '"map-data" list-new ;')
    this.compileWord('setup-scanning', '"look-loop-1" queue  ;')

    // this.compileWord('idle', 'setup-mapping setup-scanning "idle" delete ;')
  }
  tick () {
    super.tick()
    if (this.machine.timeLeft > 0 && this.machine.hasWord('idle')) {
      this.command({ src: 'idle' })
      this.execute()
    }
  }
}

/**
 * ControlCentre is an object that has a special link to the game's control system.
 */
class ControlCentre extends SimpleControlCentre {
  constructor (run) {
    super(run, { colour: 'pink', size: 'medium' })
    // where commands come into the sim
    this.commands = null
    // events for sending back out of the sim
    this.events = []
    // some default words
    this.compileWord('sample', '1 2 + ;')
    this.compileWord('help', '"try typing list-words" ;"')
    this.compileWord('get-state', 'state "state" return "ok" ;')
    this.compileWord('set-idle', '"idle" compile ;')
    this.compileWord('degrees', '90 - 180 / pi * ;')
  }
  startTick (commands) {
    this.events = []
    this.commands = commands
  }
  tick () {
    if (this.commands) {
      for (let c of this.commands) {
        if (c.src) {
          // this is something to run in the machine
          if (!this.command(c)) {
            this.events.push({
              typ: 'error',
              val: `command overflow`,
              cmd: c
            })
          }
        } else if (c.frequency) {
          // this is going to be transmitted on the radio
          // XXX - something is odd about how every frequency can be used at once
          this.area.tx(c.frequency, c.data)
        }
      }
      this.commands = null
    }
    super.tick()
  }
  endTick () {
    let res = this.results()
    if (res) {
      for (let r of res) {
        if (r.cmd.id) {
          r.id = r.cmd.id
          delete r.cmd
          this.events.push(r)
        }
      }
    }
    // TODO - this should be done through a radio
    for (let [k, v] of this.area.airwaves.entries()) {
      this.events.push({
        frequency: k,
        data: v.data
      })
    }
    return this.events
  }
  toString () {
    return 'player ' + super.toString()
  }
}

/**
 * Robot1 is a basic robot. It has a Socket to control it, if you can plug into
 * it.
 */
class Robot1 extends Programmable {
  constructor (run, name, colour, frequency) {
    super(run, { colour })
    // internal state
    this.socket0 = this.machine.newSocket()
    this.machine.setVariable('name', name)
    this.time = 0
    this.power = { d: 0, p: 0 }
    this.actions = new ActionQueue(1)
    // hardwired components
    this.locator = new LocatorCore()
    this.scanner = new RadarCore()
    this.radio = new RadioCore(frequency)
    // ops
    this.addHardWord('in-a-second', (m, s) => {
      let args = popArgs(s, ['hook'])
      this.actions.add({
        end: () => {
          this.command({ src: args.hook })
        },
        ticks: this.hz
      })
    })
    this.machine.addHardWord('drive', (m, s) => {
      let args = popArgs(s, ['direction', 'power', 'seconds', 'hook'])
      // args.direction = toRadians(args.bearing)
      this.actions.add({
        start: () => {
          this.power = { d: args.direction, p: args.power / this.hz }
          // console.log('start', this.power, this.position)
        },
        end: () => {
          this.power.p = 0
          // console.log('end', this.power, this.position)
          this.command({ src: args.hook })
        },
        ticks: args.seconds * this.hz
      })
    })
    this.machine.addHardWord('power', (m, s) => {
      let [d, p] = popN(s, 2)
      this.power.d = x
      this.power.p = y
    })
    this.machine.addHardWord('scan', (m, s) => {
      let args = popArgs(s, ['hook'])
      this.actions.add({ end: () => this._scan(args), ticks: 1 * this.hz })
    })
    this.machine.addHardWord('locate', (m, s) => {
      let l = this.locator.locate(this)
      this.machine.setVariable('location', JSON.stringify(l))
    })
    // programs
    this.compileWord('degrees', '90 - 180 / pi * ;')
    this.compileWord('explore', '0 degrees 3 5 "on-arrive" drive ;')
    this.compileWord('on-arrive', '"on-scan" scan ;')
    this.compileWord('on-scan', '180 degrees 3 5 "i" drive ;')

    this.compileWord('north', '180 degrees 2 5 "south" drive ;')
    this.compileWord('south', '0 degrees 2 5 "north" drive ;')
    // this.compileWord('idle', 'north "idle" delete ;')
  }
  get socket () {
    return this.socket0
  }
  _scan (args) {
    let o = this.scanner.scan(this)
    this.machine.setVariable('seen', JSON.stringify(o))
    this.command({ src: `"seen" load ${args.hook}` })
  }
  tick () {
    let radioIn = this.radio.rx(this)
    if (radioIn) {
      let c = JSON.parse(radioIn)
      if (c.src) {
        c.radio = true
        this.command(c)
      } else if (radioIn === 'name') {
        this.radio.tx(this, this.name)
      } else {
        this.radio.tx(this, '???')
      }
    }
    // XXX is this the right place in the sequence ?
    this.actions.tick()
    super.tick()
    if (this.machine.timeLeft > 0 && this.machine.hasWord('idle')) {
      this.command({ src: 'idle' })
      this.machine.execute()
    }
    this.motion = { d: this.power.d, p: this.power.p }
    if (this.machine.getVariable('debug')) {
      for (let r of this.results()) {
        this.socket0.push([ 'res', r ])
      }
    }
    for (let r of this.results()) {
      if (r.cmd.radio) {
        r.id = r.cmd.id
        delete r.cmd
        let toSend = JSON.stringify(r)
        this.radio.tx(this, toSend)
      }
    }
  }
  get name () {
    return this.machine.getVariable('name')
  }
  toString () {
    return `${this.colour} robot '${this.name}' ${super.toString()}`
  }
}

/**
 * Box is just something that might be lying around in the world.
 */
class Box extends DotObject {
  constructor (run, opts) {
    super(run, opts)
  }
  toString () {
    return 'box'
  }
}

/**
 * Run is an episode of the game.
 */
class Run {
  constructor (hz) {
    this.hz = hz
    this.n = 0
    this.world = new World(this, 1000, 1000)
    this.cc = new ControlCentre(this)
    this.cc.place(this.world, { x: 500, y: 500 })
    this.addRandomRobot({ freq: 100, x: 502, y: 505 })
    this.addRandomRobot({ x: 498, y: 500 })
    // this.addRandomRobot({ x: 8, y: 22 })
    // this.addRandomRobot({ x: 80, y: 90 })
    this.addSomeThings()
  }
  addRandomRobot (opts) {
    let name = random.name()
    let colour = random.colour()
    let freq = opts.freq || random.int(0, 1000)
    console.log('frequency', freq)
    new Robot1(this, name, colour, freq).place(this.world, opts)
  }
  addSomeThings () {
    new Box(this).place(this.world, { x: 503, y: 400 })
    new Box(this).place(this.world, { x: 503, y: 484 })
  }
  accept () {
    return false
  }
  tick (commands) {
    this.n++
    this.cc.startTick(commands)
    this.world.tick()
    let events = this.cc.endTick()
    for (let e of events) {
      e.n = this.n
    }
    return events
  }
  toString () {
    return 'run\n' + this.world + '\n' + this.player
  }
}

/**
 * Game is everything someone has done or is doing.
 */
export default class Game {
  constructor (hz) {
    this.run = new Run(hz)
  }
  toString () {
    return 'game\n' + this.run
  }
}
