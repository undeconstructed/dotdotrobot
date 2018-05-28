
export function join(a, s) {
  s = s || ','
  let size = a.length || a.size
  if (size == 0) {
    return ''
  } else if (size == 1) {
    let i = a[Symbol.iterator]()
    return i.next().value.toString()
  } else {
    let i = a[Symbol.iterator]()
    let out = i.next().value.toString()
    for (let e = i.next(); !e.done; e = i.next()) {
      out += s + e.value.toString()
    }
    return out
  }
}
