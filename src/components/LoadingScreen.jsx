import React, { useEffect, useRef } from 'react'
import gsap from 'gsap'

/**
 * LoadingScreen
 *
 * Minimal dark charcoal preloader (#020b14) displaying light-weight sentence-case
 * `Initializing...` text above a 1px progress bar while WebGL shaders, fonts,
 * and portrait textures initialize safely in the background.
 */
export default function LoadingScreen({ isReady, onExitTextComplete }) {
  const overlayRef = useRef(null)
  const wordRef = useRef(null)
  const barWrapRef = useRef(null)
  const barFillRef = useRef(null)
  const onExitRef = useRef(onExitTextComplete)
  const hasExitedRef = useRef(false)
  const mountedAtRef = useRef(0)
  const barTweenRef = useRef(null)

  useEffect(() => {
    onExitRef.current = onExitTextComplete
  }, [onExitTextComplete])

  useEffect(() => {
    mountedAtRef.current = performance.now()
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (wordRef.current) {
      gsap.fromTo(
        wordRef.current,
        { yPercent: prefersReducedMotion ? 0 : 105, opacity: prefersReducedMotion ? 1 : 0 },
        {
          yPercent: 0,
          opacity: 1,
          duration: prefersReducedMotion ? 0.1 : 0.55,
          ease: 'power4.out',
        },
      )
    }

    if (barWrapRef.current) {
      gsap.fromTo(
        barWrapRef.current,
        { opacity: 0 },
        {
          opacity: 1,
          duration: prefersReducedMotion ? 0.08 : 0.4,
          delay: 0.08,
          ease: 'power2.out',
        },
      )
    }

    if (barFillRef.current) {
      barTweenRef.current = gsap.fromTo(
        barFillRef.current,
        { scaleX: 0 },
        {
          scaleX: 0.86,
          duration: prefersReducedMotion ? 0.1 : 1.35,
          ease: 'power2.out',
        },
      )
    }

    return () => {
      barTweenRef.current?.kill()
    }
  }, [])

  useEffect(() => {
    if (!isReady || hasExitedRef.current) return undefined
    hasExitedRef.current = true

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const elapsed = performance.now() - mountedAtRef.current
    const holdDelay = prefersReducedMotion ? 0 : Math.max(0, 520 - elapsed) / 1000

    barTweenRef.current?.kill()
    const tl = gsap.timeline({ delay: holdDelay })

    if (barFillRef.current) {
      tl.to(barFillRef.current, {
        scaleX: 1,
        duration: prefersReducedMotion ? 0.05 : 0.28,
        ease: 'power2.out',
      })
    }

    if (wordRef.current) {
      tl.to(
        wordRef.current,
        {
          yPercent: prefersReducedMotion ? 0 : -115,
          opacity: 0,
          duration: prefersReducedMotion ? 0.1 : 0.36,
          ease: 'power3.in',
        },
        '+=0.05',
      )
    }

    if (barWrapRef.current) {
      tl.to(
        barWrapRef.current,
        {
          opacity: 0,
          duration: prefersReducedMotion ? 0.08 : 0.28,
          ease: 'power2.in',
        },
        '<0.04',
      )
    }

    tl.call(() => {
      if (overlayRef.current) {
        overlayRef.current.style.pointerEvents = 'none'
      }
      onExitRef.current?.()
    })

    return () => {
      tl.kill()
    }
  }, [isReady])

  return (
    <div
      ref={overlayRef}
      aria-label="Initializing portfolio"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-brand-charcoal text-brand-white select-none pointer-events-auto"
    >
      <div className="flex flex-col items-center px-4 text-center">
        <div className="overflow-hidden py-1">
          <span
            ref={wordRef}
            className="block font-light text-2xl sm:text-3xl md:text-4xl lg:text-[2.5rem] leading-[1.1] tracking-[-0.015em] text-brand-white will-change-transform"
          >
            Initializing...
          </span>
        </div>

        {/* Very thin 1px loading bar */}
        <div
          ref={barWrapRef}
          className="mt-4 sm:mt-5 w-44 sm:w-56 md:w-64 h-[1px] bg-brand-steel-light/20 overflow-hidden"
        >
          <div
            ref={barFillRef}
            className="w-full h-full bg-brand-white/90 origin-left will-change-transform"
            style={{ transform: 'scaleX(0)' }}
          />
        </div>
      </div>
    </div>
  )
}
