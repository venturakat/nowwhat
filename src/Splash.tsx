import { useEffect, useRef, useState } from 'react'
import { LOGO_PATHS } from './logo'

// Loading screen: a flat, swirling blob of pile pieces; the extras fly off, the five logo blocks
// land one by one (bottom first) into the pile, it slides into place and "now what" wipes in.
// Plays once when the app opens, then fades away. Tap to skip.

const SPEC = [[104, 60, 108, 0], [86, 57, 87, 4], [96, 63, 66, -3], [70, 56, 45, 6], [54, 64, 24, -8]] // [width, cx, cy, rotation°] in a 120 box (SVG turns clockwise)
const H = 13.5, RX = 4.5
let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9
for (const [w, cx, cy, d] of SPEC) {
  const r = (d * Math.PI) / 180
  for (const [dx, dy] of [[-w / 2, -H / 2], [w / 2, -H / 2], [w / 2, H / 2], [-w / 2, H / 2]]) {
    const x = cx + dx * Math.cos(r) - dy * Math.sin(r), y = cy + dx * Math.sin(r) + dy * Math.cos(r)
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  }
}
const bcx = (minX + maxX) / 2, bcy = (minY + maxY) / 2
const kLock = 45.32 / (maxY - minY)
const LOCK = { x: 46.86 / 2, y: (1.23 + 46.55) / 2, k: kLock } // the sign's place in the logo lockup
const BIG = { x: 134.5, y: 23.5, k: kLock * 2.1 } // where it's built: centre, bigger

type Piece = { el?: SVGRectElement; w: number; phase: number; spin: number; R: number; gone?: number; from?: Pose }
type Pose = { x: number; y: number; rot: number; s: number; z: number; o: number }
const ease = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const back = (t: number) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2) }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const angLerp = (a: number, b: number, t: number) => { const d = (((b - a) % 360) + 540) % 360 - 180; return a + d * t }
const clamp = (x: number) => Math.min(1, Math.max(0, x))

const SWIRL_IN = 450, FIRST = 900, GAP = 190, FLY = 560, MOVE_AT = 2400, MOVE = 700, WORD_AT = 2700, WORD = 650 // swirl shortened by ~0.6 s
export const SPLASH_MS = WORD_AT + WORD

const swirlPose = (b: Piece, t: number): Pose => {
  const grow = ease(Math.min(1, t / SWIRL_IN))
  const shrink = 1 - 0.3 * clamp((t - FIRST) / 1200)
  const a = b.phase + (t / 1000) * (4.2 + (t / 1000) * 1.6) // speeds up while it spins
  const R = b.R * grow * shrink * (1 + 0.08 * Math.sin(t / 180 + b.phase))
  return { x: bcx + R * Math.cos(a), y: bcy + R * Math.sin(a), rot: (b.spin * t) / 1000 + a * 57.3 * 0.5, s: 0.55 + 0.45 * grow, z: b.phase, o: grow }
}

export const Splash = ({ onDone }: { onDone: () => void }) => {
  const sign = useRef<SVGGElement>(null)
  const wrect = useRef<SVGRectElement>(null)
  const word = useRef<SVGGElement>(null)
  const [leaving, setLeaving] = useState(false)
  const done = useRef(false)
  const finish = () => { if (done.current) return; done.current = true; setLeaving(true); setTimeout(onDone, 320) }

  useEffect(() => {
    const g = sign.current!
    const NS = 'http://www.w3.org/2000/svg'
    const mk = (w: number) => { const r = document.createElementNS(NS, 'rect'); r.setAttribute('width', String(w)); r.setAttribute('height', String(H)); r.setAttribute('rx', String(RX)); r.setAttribute('fill', 'currentColor'); g.appendChild(r); return r }
    const blocks: Piece[] = SPEC.map(([w], i) => ({ el: mk(w), w, phase: (i * 2 * Math.PI) / 5 + (i % 2 ? 0.6 : 0), spin: (i % 2 ? -1 : 1) * (180 + i * 40), R: 16 + ((i * 7) % 16) }))
    const EXTRA = 30
    const extras: Piece[] = Array.from({ length: EXTRA }, (_, j) => { const w = 36 + ((j * 37) % 66); return { el: mk(w), w, phase: j * 2.399, spin: (j % 2 ? 1 : -1) * (150 + ((j * 53) % 160)), R: 4 + ((j * 13) % 30), gone: 450 + j * (1300 / EXTRA) } })
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    let t0 = 0, raf = 0, hold = 0
    const frame = (now: number) => {
      if (!wrect.current || !word.current) return // already gone (tapped away)
      if (!t0) t0 = now
      const t = reduced ? SPLASH_MS + 100 : now - t0
      const m = easeInOut(clamp((t - MOVE_AT) / MOVE))
      g.setAttribute('transform', `translate(${lerp(BIG.x, LOCK.x, m)} ${lerp(BIG.y, LOCK.y, m)}) scale(${lerp(BIG.k, LOCK.k, m)}) translate(${-bcx} ${-bcy})`)
      const order: [number, SVGRectElement][] = []
      blocks.forEach((b, i) => {
        const [w, cx, cy, deg] = SPEC[i]
        const rel = FIRST + i * GAP // bottom block lands first
        let p: Pose
        if (t < rel) p = swirlPose(b, t)
        else {
          b.from ??= swirlPose(b, rel)
          const land = Math.min(1, (t - rel) / FLY), e = back(land), f = b.from
          p = { x: lerp(f.x, cx, e), y: lerp(f.y, cy, e), rot: angLerp(f.rot, deg, ease(land)), s: lerp(f.s, 1, ease(land)), z: 999, o: 1 }
        }
        b.el!.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${p.rot}) scale(${p.s}) translate(${-w / 2} ${-H / 2})`)
        b.el!.setAttribute('opacity', String(p.o))
        order.push([p.z, b.el!])
      })
      extras.forEach((b) => {
        const out = clamp((t - b.gone!) / 420) // flung out and shrinking away
        if (out >= 1) { b.el!.setAttribute('opacity', '0'); return }
        const p = swirlPose(b, t), k = ease(out), fling = 1 + k * 1.4
        b.el!.setAttribute('transform', `translate(${bcx + (p.x - bcx) * fling} ${bcy + (p.y - bcy) * fling}) rotate(${p.rot}) scale(${p.s * (1 - k)}) translate(${-b.w / 2} ${-H / 2})`)
        b.el!.setAttribute('opacity', String(p.o * (1 - k)))
        order.push([p.z, b.el!])
      })
      order.sort((a, b) => a[0] - b[0]).forEach(([, el]) => g.appendChild(el))
      const w = ease(clamp((t - WORD_AT) / WORD)) // wordmark wipes in
      wrect.current!.setAttribute('width', String(225 * w))
      word.current!.setAttribute('opacity', String(Math.min(1, w * 2)))
      if (t < SPLASH_MS + 50) raf = requestAnimationFrame(frame)
      else hold = window.setTimeout(finish, reduced ? 500 : 350) // a short look at the finished logo
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); clearTimeout(hold); g.replaceChildren() }
  }, [])

  return (
    <div className={'splash' + (leaving ? ' out' : '')} onClick={finish} aria-label="now what">
      <svg viewBox="-10 -70 300 187">
        <defs><clipPath id="splash-word"><rect ref={wrect} x="55" y="-5" width="0" height="60" /></clipPath></defs>
        <g ref={sign} />
        <g ref={word} fill="currentColor" clipPath="url(#splash-word)" opacity="0">
          {LOGO_PATHS.slice(5).map((d, i) => <path key={i} d={d} />)}
        </g>
      </svg>
    </div>
  )
}
