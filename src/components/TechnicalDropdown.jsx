import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'

function Crosshair({ className = '' }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`hud-crosshair w-3.5 h-3.5 text-[var(--color-brand-technical,#b2b2b2)] shrink-0 select-none transform-gpu ${className}`}
      aria-hidden="true"
    >
      <line x1="8" y1="0" x2="8" y2="16" stroke="currentColor" strokeWidth="1" />
      <line x1="0" y1="8" x2="16" y2="8" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

/**
 * Classic odometer / mechanical traffic counter text component.
 * Numbers roll smoothly inside an overflow-hidden mask column.
 */
function OdometerText({ text, className = '' }) {
  if (!text) return null

  return (
    <span className={`inline-flex items-baseline ${className}`}>
      {text.split('').map((char, index) => {
        const isDigit = /^[0-9]$/.test(char)
        if (!isDigit) {
          return (
            <span key={index} className="inline-block whitespace-pre">
              {char}
            </span>
          )
        }

        const digit = parseInt(char, 10)

        return (
          <span
            key={index}
            className="inline-block overflow-hidden h-[1.18em] leading-none align-baseline"
          >
            <span
              className="hud-odometer-digit flex flex-col transform-gpu"
              data-target={digit}
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <span
                  key={n}
                  className="h-[1.18em] leading-none flex items-center justify-center select-none"
                >
                  {n}
                </span>
              ))}
            </span>
          </span>
        )
      })}
    </span>
  )
}

/**
 * TechnicalDropdown
 *
 * Dark glassmorphic architectural dropup component:
 * - Appears UP above the button
 * - Master Timeline Play / Reverse / Resume engine:
 *   Handles rapid button clicking without glitching, flickering, or resetting.
 * - Smooth reverse number animation on close (odometer numbers roll back down to 0).
 * - Row prefixes and labels reverse-swipe down inside line masks.
 * - Completely shadow-free (zero momentary shadow artifacts during mask swipes).
 *
 * @param {Object} props
 * @param {Array} props.items - List of row items [{ id, num, label, hasSquare, icon, icons }]
 * @param {string} [props.telemetry] - Telemetry coordinate text (e.g. "[59, -25, 5]")
 * @param {string} [props.counter] - Section counter text (e.g. "01 // 05")
 * @param {boolean} [props.isOpen=false] - Visibility toggle
 * @param {Function} [props.onClose] - Close handler
 * @param {string} [props.className] - Additional classes
 */
export default function TechnicalDropdown({
  items = [],
  telemetry = '[59, -25, 5]',
  counter = '01 // 05',
  isOpen = false,
  onClose,
  className = '',
}) {
  const containerRef = useRef(null)
  const masterTl = useRef(null)
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen)
  const [shouldRender, setShouldRender] = useState(isOpen)

  // Synchronously ensure DOM is ready to render when isOpen switches to true
  if (prevIsOpen !== isOpen) {
    setPrevIsOpen(isOpen)
    if (isOpen) {
      setShouldRender(true)
    }
  }

  // Master timeline play / reverse coordination
  useLayoutEffect(() => {
    if (!shouldRender) {
      if (masterTl.current) {
        masterTl.current.kill()
        masterTl.current = null
      }
      return undefined
    }

    const container = containerRef.current
    if (!container) return undefined

    // Build unified master timeline once per DOM mount
    if (!masterTl.current) {
      const q = gsap.utils.selector(container)

      const tl = gsap.timeline({
        paused: true,
        onReverseComplete: () => {
          setShouldRender(false)
        },
      })

      // 1. Container Mask Swipe-Up
      tl.fromTo(
        container,
        { clipPath: 'inset(100% 0% 0% 0%)', y: 18 },
        { clipPath: 'inset(0% 0% 0% 0%)', y: 0, duration: 0.45, ease: 'power4.out' },
        0,
      )

      // 2. Corner & Center Crosshairs (+)
      tl.fromTo(
        q('.hud-crosshair'),
        { scale: 0, rotate: (i) => (i % 2 === 0 ? 45 : -45) },
        {
          scale: 1,
          rotate: 0,
          duration: 0.32,
          stagger: { amount: 0.1, from: 'random' },
          ease: 'back.out(2)',
        },
        0.04,
      )

      // 3. Trim-Path Architectural Lines
      tl.fromTo(
        q('.hud-top-line'),
        { scaleX: 0, transformOrigin: 'left' },
        { scaleX: 1, duration: 0.38, ease: 'power3.out' },
        0.08,
      )

      tl.fromTo(
        q('.hud-vert-upper'),
        { scaleY: 0, transformOrigin: 'top' },
        { scaleY: 1, duration: 0.35, ease: 'power3.out' },
        0.1,
      )

      tl.fromTo(
        q('.hud-vert-lower'),
        { scaleY: 0, transformOrigin: 'bottom' },
        { scaleY: 1, duration: 0.35, ease: 'power3.out' },
        0.12,
      )

      // Row Dividers
      const dividers = q('.hud-divider')
      dividers.forEach((div, idx) => {
        const origin = idx % 2 === 0 ? 'left' : 'right'
        gsap.set(div, { transformOrigin: origin })
      })

      tl.fromTo(
        dividers,
        { scaleX: 0 },
        {
          scaleX: 1,
          duration: 0.38,
          stagger: { amount: 0.14, from: 'random' },
          ease: 'power3.out',
        },
        0.1,
      )

      // 4. Row Number Prefixes: Smooth Mask Swipe-Up
      tl.fromTo(
        q('.hud-num-swipe'),
        { yPercent: 120 },
        { yPercent: 0, duration: 0.65, stagger: 0.05, ease: 'power3.out' },
        0.08,
      )

      // 5. Row Labels: Smooth Mask Swipe-Up
      tl.fromTo(
        q('.hud-label-swipe'),
        { yPercent: 120 },
        { yPercent: 0, duration: 0.65, stagger: 0.05, ease: 'power3.out' },
        0.11,
      )

      // 6. Markers (Small Rectangles & SVG Icons)
      tl.fromTo(
        q('.hud-marker'),
        { scale: 0 },
        {
          scale: 1,
          duration: 0.3,
          stagger: { amount: 0.12, from: 'random' },
          ease: 'back.out(2)',
        },
        0.14,
      )

      // 7. Odometer Numbers: Smooth Roll Up to Target Digit (Reverses smoothly on close!)
      const odometerDigits = q('.hud-odometer-digit')
      odometerDigits.forEach((el, idx) => {
        const target = parseFloat(el.getAttribute('data-target') || '0')
        tl.fromTo(
          el,
          { yPercent: 0 },
          { yPercent: -target * 10, duration: 0.85, ease: 'power3.out' },
          0.08 + idx * 0.04,
        )
      })

      masterTl.current = tl
    }

    // Play forward on open, smoothly reverse on close
    if (isOpen) {
      masterTl.current.timeScale(1).play()
    } else {
      masterTl.current.timeScale(1.35).reverse()
    }
  }, [isOpen, shouldRender, items, telemetry, counter])

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (masterTl.current) {
        masterTl.current.kill()
        masterTl.current = null
      }
    }
  }, [])

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return undefined

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.()
      }
    }

    const handlePointerDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        if (!e.target.closest('[data-dropdown-trigger]')) {
          onClose?.()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [isOpen, onClose])

  if (!shouldRender && !isOpen) return null

  return (
    <div
      ref={containerRef}
      className={`relative z-50 dark-glass text-[var(--color-brand-white,#ffffff)] pt-5 pb-7 px-5 sm:px-6 select-none font-sans pointer-events-auto w-[330px] sm:w-[410px] md:w-[470px] shadow-none ${className}`}
    >
      {/* --- Top Architectural Elements with Safe Distance Gaps --- */}
      {/* Top Left Crosshair */}
      <div className="absolute top-5 left-5 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <Crosshair />
      </div>

      {/* Top Right Crosshair */}
      <div className="absolute top-5 right-5 translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <Crosshair />
      </div>

      {/* Top Horizontal Border: Trim path line */}
      <div
        className="hud-top-line absolute top-5 left-11 right-11 h-[1px] bg-[var(--color-brand-technical,#b2b2b2)] opacity-70 pointer-events-none transform-gpu"
        aria-hidden="true"
      />

      {/* --- Left Vertical Architectural Guide Lines --- */}
      {/* Upper vertical line segment */}
      <div
        className="hud-vert-upper absolute left-5 top-11 h-[34%] w-[1px] bg-[var(--color-brand-technical,#b2b2b2)] opacity-70 pointer-events-none transform-gpu"
        aria-hidden="true"
      />

      {/* Center Left Crosshair (aligned with row 3) */}
      <div className="absolute left-5 top-[50%] -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <Crosshair />
      </div>

      {/* Lower vertical line segment */}
      <div
        className="hud-vert-lower absolute left-5 top-[57%] bottom-12 w-[1px] bg-[var(--color-brand-technical,#b2b2b2)] opacity-70 pointer-events-none transform-gpu"
        aria-hidden="true"
      />

      {/* --- Main List Items (HUD Display with Line Masks) --- */}
      <ul className="flex flex-col mt-0.5 mb-2 list-none p-0 pointer-events-none select-none">
        {items.map((item, index) => {
          const isLastRow = index === items.length - 1

          return (
            <li
              key={item.id || index}
              className="relative flex flex-col cursor-default"
            >
              {/* Row Content */}
              <div className="flex items-center justify-between py-2.5 sm:py-3.5 pl-6 sm:pl-7 pr-1">
                {/* Number prefix & Label with smooth overflow-hidden masks */}
                <div className="flex items-baseline gap-2.5 sm:gap-3.5">
                  <span className="overflow-hidden inline-block align-baseline">
                    <span className="hud-num-swipe inline-block transform-gpu font-normal text-lg sm:text-xl md:text-2xl tracking-tight text-[var(--color-brand-accent-steel,#688ca8)] shrink-0">
                      {item.num || `${index + 1} /`}
                    </span>
                  </span>
                  <span className="overflow-hidden inline-block align-baseline">
                    <span className="hud-label-swipe inline-block transform-gpu font-normal text-lg sm:text-xl md:text-2xl tracking-[-0.015em] text-[var(--color-brand-white,#ffffff)]">
                      {item.label}
                    </span>
                  </span>
                </div>

                {/* Right Element: SVG icon(s) beside the small technical rectangle */}
                <div className="flex items-center gap-3 sm:gap-3.5 shrink-0">
                  {item.icons && item.icons.length > 0 ? (
                    <div className="hud-marker flex items-center gap-2 shrink-0 transform-gpu">
                      {item.icons.map((src, i) => (
                        <img
                          key={i}
                          src={src}
                          alt=""
                          className="w-[22px] h-[22px] sm:w-[25px] sm:h-[25px] object-contain shrink-0"
                        />
                      ))}
                    </div>
                  ) : item.icon ? (
                    <div className="hud-marker shrink-0 transform-gpu">
                      <img
                        src={item.icon}
                        alt=""
                        className="w-[22px] h-[22px] sm:w-[25px] sm:h-[25px] object-contain shrink-0"
                      />
                    </div>
                  ) : null}

                  {item.hasSquare !== false && (
                    <div
                      className="hud-marker w-1.5 h-1.5 bg-[var(--color-brand-technical,#b2b2b2)] shrink-0 transform-gpu"
                      aria-hidden="true"
                    />
                  )}
                </div>
              </div>

              {/* Thin Divider Line: Trim path animation */}
              {!isLastRow && (
                <div
                  className="hud-divider w-[calc(100%-2.25rem)] ml-6 sm:ml-7 h-[1px] bg-[var(--color-brand-technical,#b2b2b2)] opacity-70 transform-gpu"
                  aria-hidden="true"
                />
              )}
            </li>
          )
        })}
      </ul>

      {/* --- Bottom Crosshairs, Telemetry & Counter --- */}
      {/* Bottom Left Crosshair */}
      <div className="absolute bottom-6 left-5 -translate-x-1/2 translate-y-1/2 pointer-events-none">
        <Crosshair />
      </div>

      {/* Microscopic Telemetry Text with classic rolling odometer numbers */}
      <div className="absolute bottom-6 left-11 translate-y-1/2 pointer-events-none select-none">
        <OdometerText
          text={telemetry}
          className="text-[10px] sm:text-[11px] font-mono tracking-[0.08em] text-[var(--color-brand-technical,#b2b2b2)] opacity-85"
        />
      </div>

      {/* Counter Text (01 // 05) with classic rolling odometer numbers */}
      <div className="absolute bottom-6 right-11 translate-y-1/2 pointer-events-none select-none">
        <OdometerText
          text={counter}
          className="text-sm sm:text-base md:text-lg font-normal tracking-[-0.015em] text-[var(--color-brand-technical,#b2b2b2)] select-none"
        />
      </div>

      {/* Bottom Right Crosshair */}
      <div className="absolute bottom-6 right-5 translate-x-1/2 translate-y-1/2 pointer-events-none">
        <Crosshair />
      </div>
    </div>
  )
}
