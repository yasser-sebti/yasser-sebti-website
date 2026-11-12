import React, { useEffect, useRef } from 'react'
import { createBackgroundEngine } from '../webgl/backgroundEngine'

const CSS_FALLBACK_BACKGROUND =
  'radial-gradient(ellipse 74% 68% at 34% 32%, #ffffff 0%, #e6eef6 48%, #a7b9cc 76%, #6d8aa3 94%, #3f5b74 100%)'

/**
 * AtmosphericBackground
 *
 * Full-bleed WebGL backdrop executed inside a dedicated OffscreenCanvas Web Worker
 * whenever supported (with automatic main-thread fallback). All shader linking,
 * bitmap decoding, and GPU uploads happen off the main UI thread so `Initializing...`
 * progress and reveal animations stay completely freeze-free.
 */
export default function AtmosphericBackground({ onReady, introPhase = 'done' }) {
  const containerRef = useRef(null)
  const onReadyRef = useRef(onReady)
  const introPhaseRef = useRef(introPhase)
  const dispatchRef = useRef(null)

  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])

  useEffect(() => {
    introPhaseRef.current = introPhase
    dispatchRef.current?.setPhase(introPhase)
  }, [introPhase])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    let isDisposed = false
    let hasNotifiedReady = false

    const notifyReadyOnce = () => {
      if (hasNotifiedReady || isDisposed) return
      hasNotifiedReady = true
      onReadyRef.current?.()
    }

    const canvas = document.createElement('canvas')
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    container.appendChild(canvas)

    const getOptimalDpr = () => Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.15 : 1.5)
    const initialWidth = Math.max(container.clientWidth || window.innerWidth, 1)
    const initialHeight = Math.max(container.clientHeight || window.innerHeight, 1)
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const hasFinePointer = window.matchMedia('(pointer: fine)').matches

    let worker = null
    let fallbackEngine = null
    let api = null

    const canUseWorker =
      typeof Worker === 'function' && typeof canvas.transferControlToOffscreen === 'function'

    if (canUseWorker) {
      try {
        const offscreen = canvas.transferControlToOffscreen()
        worker = new Worker(new URL('../webgl/background.worker.js', import.meta.url), {
          type: 'module',
        })

        worker.onmessage = (e) => {
          if (e.data?.type === 'ready') {
            notifyReadyOnce()
          }
        }
        worker.onerror = () => {
          notifyReadyOnce()
        }

        worker.postMessage(
          {
            type: 'init',
            canvas: offscreen,
            width: initialWidth,
            height: initialHeight,
            dpr: getOptimalDpr(),
            portraitUrl: '/assets/myself-v2-cutout.webp',
            introPhase: introPhaseRef.current,
            reducedMotion: reducedMotionQuery.matches,
            hidden: document.hidden,
          },
          [offscreen],
        )

        api = {
          setPhase: (nextPhase) => worker?.postMessage({ type: 'phase', introPhase: nextPhase }),
          setPointer: (x, y) => worker?.postMessage({ type: 'pointer', x, y }),
          setSize: (width, height, dpr) => worker?.postMessage({ type: 'resize', width, height, dpr }),
          setHidden: (hidden) => worker?.postMessage({ type: 'hidden', hidden }),
          setReducedMotion: (reduced) => worker?.postMessage({ type: 'reducedMotion', reducedMotion: reduced }),
        }
      } catch {
        worker?.terminate()
        worker = null
      }
    }

    if (!api) {
      fallbackEngine = createBackgroundEngine(canvas, {
        initialWidth,
        initialHeight,
        dpr: getOptimalDpr(),
        portraitUrl: '/assets/myself-v2-cutout.webp',
        initialPhase: introPhaseRef.current,
        reducedMotion: reducedMotionQuery.matches,
        hidden: document.hidden,
        onReady: notifyReadyOnce,
      })
      api = fallbackEngine
    }

    dispatchRef.current = api

    const handlePointerMove = (e) => {
      const nx = (e.clientX / Math.max(window.innerWidth, 1)) * 2 - 1
      const ny = (e.clientY / Math.max(window.innerHeight, 1)) * 2 - 1
      api.setPointer(Math.max(-1, Math.min(1, nx)), Math.max(-1, Math.min(1, -ny)))
    }

    const handlePointerLeave = () => {
      api.setPointer(0, 0)
    }

    if (hasFinePointer) {
      window.addEventListener('pointermove', handlePointerMove, { passive: true })
      document.addEventListener('mouseleave', handlePointerLeave)
    }

    let lastW = initialWidth
    let lastH = initialHeight
    const handleResize = () => {
      if (isDisposed || !container) return
      const width = Math.max(container.clientWidth || window.innerWidth, 1)
      const height = Math.max(container.clientHeight || window.innerHeight, 1)
      if (width === lastW && height === lastH) return
      lastW = width
      lastH = height
      api.setSize(width, height, getOptimalDpr())
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(container)
    window.addEventListener('resize', handleResize, { passive: true })

    const handleVisibilityChange = () => {
      api.setHidden(document.hidden)
    }
    const handleMotionChange = () => {
      api.setReducedMotion(reducedMotionQuery.matches)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    if (reducedMotionQuery.addEventListener) {
      reducedMotionQuery.addEventListener('change', handleMotionChange)
    }

    return () => {
      isDisposed = true
      dispatchRef.current = null
      resizeObserver.disconnect()
      if (hasFinePointer) {
        window.removeEventListener('pointermove', handlePointerMove)
        document.removeEventListener('mouseleave', handlePointerLeave)
      }
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (reducedMotionQuery.removeEventListener) {
        reducedMotionQuery.removeEventListener('change', handleMotionChange)
      }

      if (worker) {
        worker.postMessage({ type: 'dispose' })
        worker.terminate()
      }
      if (fallbackEngine) {
        fallbackEngine.dispose()
      }
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas)
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none select-none"
      style={{ background: CSS_FALLBACK_BACKGROUND }}
    />
  )
}
