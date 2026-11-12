import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

// Disable visibilitychange from triggering ScrollTrigger refresh to prevent window focus / blur animation resets
ScrollTrigger.config({
  autoRefreshEvents: 'DOMContentLoaded,load,resize',
})

/**
 * Dynamically detects natural visual rows in a text container by measuring word positions,
 * wraps each row in an overflow-hidden mask, and returns the row elements to animate.
 *
 * @param {HTMLElement} container - The container element (should have no React JSX children to ensure React 19 safety)
 * @param {string} text - The raw text string to split by rows
 * @returns {HTMLElement[]} Array of row inner elements ready for GSAP animation
 */
export function buildRowMasks(container, text) {
  if (!container || !text) return []

  const words = text.trim().split(/\s+/)
  container.innerHTML = ''

  // 1. Create temporary word spans to measure where lines naturally wrap in the current viewport
  const wordSpans = words.map((word, i) => {
    const span = document.createElement('span')
    span.style.display = 'inline-block'
    span.textContent = word + (i < words.length - 1 ? '\u00A0' : '')
    container.appendChild(span)
    return span
  })

  // 2. Group words into rows by comparing offsetTop
  const rows = []
  let currentRow = []
  let currentTop = -1

  wordSpans.forEach((span) => {
    const top = span.offsetTop
    if (top !== currentTop) {
      if (currentRow.length > 0) {
        rows.push(currentRow)
      }
      currentRow = [span]
      currentTop = top
    } else {
      currentRow.push(span)
    }
  })
  if (currentRow.length > 0) {
    rows.push(currentRow)
  }

  // 3. Rebuild container with overflow-hidden row masks
  container.innerHTML = ''
  const rowInners = []

  rows.forEach((rowWords) => {
    const mask = document.createElement('div')
    mask.className = 'line-mask overflow-hidden block leading-[1.16]'

    const inner = document.createElement('span')
    inner.className = 'row-mask-inner block transform-gpu'
    inner.textContent = rowWords.map((w) => w.textContent).join('')

    mask.appendChild(inner)
    container.appendChild(mask)
    rowInners.push(inner)
  })

  return rowInners
}

/**
 * Global reusable line-mask swipe-up reveal animation method powered by GSAP & ScrollTrigger.
 * Features smooth physics-based speed decaying (power4.out) and viewport-based triggering.
 * Animates all elements all-at-once by default (stagger: 0) to avoid robotic top-to-bottom cascades.
 * Uses robust fromTo tweening that works seamlessly with React 19 StrictMode and window focus events.
 *
 * @param {HTMLElement|string|HTMLElement[]|NodeList} targets - Target element(s) or selector
 * @param {Object} [options={}] - Animation configuration options
 * @param {number} [options.duration=1.15] - Duration per line in seconds (smooth long-tail speed decay)
 * @param {number} [options.stagger=0] - Delay between elements (default 0 for all-at-once reveal)
 * @param {number} [options.delay=0] - Delay before animation starts
 * @param {string} [options.ease='power4.out'] - Smooth speed decaying easing curve
 * @param {number} [options.yPercent=115] - Initial vertical offset percentage below mask
 * @param {HTMLElement|string|Object|boolean|null} [options.scrollTrigger=null] - ScrollTrigger target or config
 * @param {gsap.core.Timeline} [options.timeline=null] - Optional master timeline to attach to
 * @param {string|number} [options.position=0] - Timeline insert position (default 0 for all-at-once coordination)
 * @returns {gsap.core.Tween|gsap.core.Timeline|null} GSAP animation instance
 */
export function maskSwipeUpReveal(targets, options = {}) {
  let elements = []

  if (typeof targets === 'string') {
    elements = Array.from(document.querySelectorAll(targets))
  } else if (Array.isArray(targets)) {
    elements = targets.filter((el) => el instanceof HTMLElement)
  } else if (targets instanceof NodeList) {
    elements = Array.from(targets).filter((el) => el instanceof HTMLElement)
  } else if (targets instanceof HTMLElement) {
    elements = [targets]
  }

  if (elements.length === 0) return null

  const {
    duration = 1.15,
    stagger = 0,               // All-at-once reveal by default
    delay = 0,
    ease = 'power4.out',       // Quintessential smooth speed decay
    yPercent = 115,
    scrollTrigger = null,
    timeline = null,
    position = 0,              // Default to 0 for all-at-once timeline coordination
    onComplete = undefined,
  } = options

  const tweenConfig = {
    yPercent: 0,
    duration,
    stagger,
    ease,
    delay,
    onComplete,
  }

  // Viewport ScrollTrigger integration (for scrollable sections)
  if (scrollTrigger && !timeline) {
    tweenConfig.scrollTrigger = {
      trigger: scrollTrigger === true ? elements[0] : scrollTrigger,
      start: 'top 85%',
      toggleActions: 'play none none none',
      once: true,
    }
  }

  // Use fromTo so GSAP fully manages the initial masked offset and final position cleanly across React 19 lifecycles
  if (timeline) {
    return timeline.fromTo(elements, { yPercent }, tweenConfig, position)
  }

  return gsap.fromTo(elements, { yPercent }, tweenConfig)
}

/**
 * Global reusable thin line swipe animation method.
 * Animates a crisp horizontal line swipe across target buttons or labels.
 * Can be triggered on entrance (revealing or swiping across) or dynamically on interaction.
 *
 * @param {HTMLElement|string|HTMLElement[]|NodeList} targets - Target element(s) or selector
 * @param {Object} [options={}] - Animation configuration options
 * @param {number} [options.duration=0.65] - Duration of the line swipe in seconds
 * @param {number} [options.stagger=0.08] - Delay between staggered button lines
 * @param {string} [options.ease='power4.out'] - Smooth speed decaying easing curve
 * @param {string} [options.mode='sweep'] - 'sweep' (swipes across from left to right and clears) or 'reveal' (swipes in to stay)
 * @param {gsap.core.Timeline} [options.timeline=null] - Optional master timeline to sequence with
 * @param {string|number} [options.position=undefined] - Position within timeline
 * @returns {gsap.core.Tween|gsap.core.Timeline|null} GSAP animation instance
 */
export function thinLineSwipe(targets, options = {}) {
  let elements = []

  if (typeof targets === 'string') {
    elements = Array.from(document.querySelectorAll(targets))
  } else if (Array.isArray(targets)) {
    elements = targets.filter((el) => el instanceof HTMLElement)
  } else if (targets instanceof NodeList) {
    elements = Array.from(targets).filter((el) => el instanceof HTMLElement)
  } else if (targets instanceof HTMLElement) {
    elements = [targets]
  }

  if (elements.length === 0) return null

  const {
    duration = 0.65,
    stagger = 0.08,
    ease = 'power4.out',
    mode = 'sweep',
    timeline = null,
    position = undefined,
  } = options

  // Find line elements inside targets (or use target itself if it's the line)
  const lines = elements.map((el) => {
    if (el.classList.contains('thin-swipe-line')) return el
    let childLine = el.querySelector('.thin-swipe-line')
    if (!childLine) {
      childLine = document.createElement('span')
      childLine.className = 'thin-swipe-line'
      el.appendChild(childLine)
    }
    return childLine
  })

  const subTl = gsap.timeline()

  if (mode === 'reveal') {
    subTl.fromTo(
      lines,
      { scaleX: 0, transformOrigin: 'left' },
      {
        scaleX: 1,
        duration,
        stagger,
        ease,
      },
    )
  } else {
    // Sweep mode: swipes across from left to right, then smoothly exits to the right
    subTl
      .fromTo(
        lines,
        { scaleX: 0, transformOrigin: 'left' },
        {
          scaleX: 1,
          duration: duration * 0.55,
          stagger,
          ease: 'power3.out',
        },
      )
      .to(
        lines,
        {
          scaleX: 0,
          transformOrigin: 'right',
          duration: duration * 0.55,
          stagger,
          ease: 'power3.inOut',
        },
        `+=${duration * 0.1}`,
      )
  }

  if (timeline) {
    return timeline.add(subTl, position)
  }

  return subTl
}
