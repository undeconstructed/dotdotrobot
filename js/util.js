
export const assert = (console ? console.assert : function () {})

export function split(s) {
  s = s.trim().split(/\s+/).join(' ')
  let i = s.indexOf(' ')
  if (i > 0) {
    return [s.substr(0, i), s.substr(i + 1)]
  }
  return [s, null]
}

export function join (a, s, f) {
  f = f || (e => e.toString())
  s = s || ','
  let size = a.length || a.size
  if (size == 0) {
    return ''
  } else if (size == 1) {
    let i = a[Symbol.iterator]()
    return f(i.next().value)
  } else {
    let i = a[Symbol.iterator]()
    let out = f(i.next().value)
    for (let e = i.next(); !e.done; e = i.next()) {
      out += s + f(e.value)
    }
    return out
  }
}

export function distance (p1, p2) {
  let dx = p1.x - p2.x
  let dy = p1.y - p2.y
  return Math.sqrt(dx*dx + dy*dy)
}

export function toRadians (degrees) {
  return (degrees - 90) / 180 * Math.PI
}

export function popN(s, n) {
  if (s.length < n) {
    throw new Error('UNDERFLOW')
  }
  let out = []
  for (let i = 0; i < n; i++) {
    out.push(s.pop())
  }
  return out.reverse()
}

export function popArgs(s, names) {
  if (s.length < names.length) {
    throw new Error('UNDERFLOW')
  }
  let out = {}
  for (let n of names.reverse()) {
    out[n] = s.pop()
  }
  return out
}

// frontend

export function mkel(tag, opts) {
  opts = opts || {}
  let e = document.createElement(tag)
  if (opts.classes) {
    e.classList.add(...opts.classes)
  }
  if (opts.style) {
    e.style = style
  }
  if (opts.text) {
    e.textContent = opts.text
  }
  return e
}


// dumping ground

const mapper = (k, v) => (v instanceof Set || v instanceof Map ? Array.from(v) : v)

function timeF(d) {
  let [h, m, s] = [d.getHours(), d.getMinutes(), d.getSeconds()]
  return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`
}
