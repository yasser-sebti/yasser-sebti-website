import React, { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { buildRowMasks, maskSwipeUpReveal, thinLineSwipe } from './utils/textReveal'
import LoadingScreen from './components/LoadingScreen'
import TechnicalDropdown from './components/TechnicalDropdown'
import { SPECIALIZATIONS_DATA, TOOLS_TECHS_DATA } from './data/dropdownData'

// Lazy-load WebGL shader backdrop in its own lightweight async chunk
const AtmosphericBackground = lazy(() => import('./components/AtmosphericBackground'))

const DESCRIPTION_TEXT =
  'With 6+ years of visual systems craftsmanship, I design and develop brand-first digital products—creating AI-powered websites, applications, and software systems.'

function ArrowOutwardIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="currentColor" d="M6.4 18L5 16.6L14.6 7H6V5h12v12h-2V8.4z" />
    </svg>
  )
}

function AddIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="currentColor" d="M11 13H5v-2h6V5h2v6h6v2h-6v6h-2z" />
    </svg>
  )
}

function ArrowDownwardIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="currentColor" d="M11 4v12.175l-5.6-5.6L4 12l8 8l8-8l-1.4-1.425l-5.6 5.6V4z" />
    </svg>
  )
}

export default function App() {
  const containerRef = useRef(null)
  const uiLayerRef = useRef(null)
  const titleProductRef = useRef(null)
  const titleEngineerRef = useRef(null)
  const subheadLeftRef = useRef(null)
  const subheadRightRef = useRef(null)
  const descRef = useRef(null)
  const descRowsRef = useRef([])
  const nameTagRef = useRef(null)
  const scrollIndicatorRef = useRef(null)

  const [shouldLoadBg, setShouldLoadBg] = useState(false)
  const [bgReady, setBgReady] = useState(false)
  const [fontsReady, setFontsReady] = useState(
    () => !(typeof document !== 'undefined' && document.fonts && document.fonts.ready),
  )
  const [phase, setPhase] = useState('loading') // 'loading' | 'zooming' | 'done'
  const [contentRevealed, setContentRevealed] = useState(false)
  const [activeDropdown, setActiveDropdown] = useState(null) // null | 'specializations' | 'tools'

  // Defer lazy WebGL chunk evaluation until after the preloader paints cleanly
  useEffect(() => {
    let cancelled = false
    let idleId = null
    const triggerBgLoad = () => {
      if (!cancelled) setShouldLoadBg(true)
    }

    const startTimer = window.setTimeout(() => {
      if (cancelled) return
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(triggerBgLoad, { timeout: 250 })
      } else {
        triggerBgLoad()
      }
    }, 160)

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready
        .then(() => {
          if (!cancelled) setFontsReady(true)
        })
        .catch(() => {
          if (!cancelled) setFontsReady(true)
        })
    }

    // Hard safety timeout so slow networks or unsupported WebGL never block entry
    const safetyTimer = window.setTimeout(() => {
      setBgReady(true)
      setFontsReady(true)
    }, 4000)

    return () => {
      cancelled = true
      window.clearTimeout(startTimer)
      if (idleId !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId)
      }
      window.clearTimeout(safetyTimer)
    }
  }, [])

  // Pre-apply absolute-zero clip mask via GSAP before any paint (never toggled in React style prop -> zero flicker).
  // Keep scale on the DOM UI wrapper only so the WebGL canvas stays 1:1 pixel-locked without CSS bitmap shaking.
  useLayoutEffect(() => {
    if (containerRef.current) {
      gsap.set(containerRef.current, {
        clipPath: 'inset(50% 50% 50% 50%)',
        willChange: 'clip-path',
      })
    }
    if (uiLayerRef.current) {
      gsap.set(uiLayerRef.current, {
        scale: 0.94,
        willChange: 'transform',
      })
    }
  }, [])

  // Pre-build description row masks once web fonts are ready while behind the preloader
  useLayoutEffect(() => {
    if (!fontsReady || !descRef.current) return
    descRowsRef.current = buildRowMasks(descRef.current, DESCRIPTION_TEXT)
    if (descRowsRef.current.length > 0) {
      gsap.set(descRowsRef.current, { yPercent: 115 })
    }
  }, [fontsReady])

  const handleBgReady = useCallback(() => {
    setBgReady(true)
  }, [])

  const isAssetsReady = bgReady && fontsReady

  // Triggered right after centered Initializing... text finishes disappearing
  const handleExitTextComplete = useCallback(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (containerRef.current) {
        gsap.set(containerRef.current, { clearProps: 'clipPath,willChange' })
      }
      if (uiLayerRef.current) {
        gsap.set(uiLayerRef.current, { clearProps: 'transform,willChange' })
      }
      setContentRevealed(true)
      setPhase('done')
      return
    }
    setPhase('zooming')
  }, [])

  // Smooth mask-zoom synchronously from absolute 0 (inset 50%) directly into full homepage
  useLayoutEffect(() => {
    if (phase !== 'zooming' || !containerRef.current) return undefined

    const el = containerRef.current
    const uiEl = uiLayerRef.current
    const tl = gsap.timeline({
      onComplete: () => {
        gsap.set(el, { clearProps: 'clipPath,willChange' })
        if (uiEl) gsap.set(uiEl, { clearProps: 'transform,willChange' })
        setPhase('done')
      },
    })

    tl.fromTo(
      el,
      {
        clipPath: 'inset(50% 50% 50% 50%)',
      },
      {
        clipPath: 'inset(0% 0% 0% 0%)',
        duration: 1.25,
        ease: 'power3.out',
      },
      0,
    )

    if (uiEl) {
      tl.fromTo(
        uiEl,
        { scale: 0.94 },
        { scale: 1, duration: 1.25, ease: 'power3.out' },
        0,
      )
    }

    // Trigger pre-measured hero curtain reveals right as the aperture opens outward
    tl.call(() => setContentRevealed(true), null, 0.24)

    return () => {
      tl.kill()
    }
  }, [phase])

  // Stage and animate homepage typography reveals
  useGSAP(
    () => {
      const headerElements = [titleProductRef.current, titleEngineerRef.current].filter(Boolean)
      const subheadElements = [subheadLeftRef.current, subheadRightRef.current].filter(Boolean)
      const descRows = descRowsRef.current
      const nameElement = nameTagRef.current ? [nameTagRef.current] : []
      const scrollElement = scrollIndicatorRef.current ? [scrollIndicatorRef.current] : []

      const allTextElements = [
        ...subheadElements,
        ...descRows,
        ...nameElement,
        ...scrollElement,
      ]

      // Keep typography tucked cleanly inside overflow masks before mask-zoom starts
      if (!contentRevealed) {
        gsap.set([...headerElements, ...allTextElements], { yPercent: 110 })
        return undefined
      }

      const tl = gsap.timeline()

      // 1. Big Header (PRODUCT ENGINEER): Monumental mask curtain with smooth speed decay
      maskSwipeUpReveal(headerElements, {
        timeline: tl,
        position: 0,
        duration: 1.25,
        yPercent: 105,
        stagger: 0.05,
        ease: 'power4.out',
      })

      // 2. Subheads, description rows, name tag, scroll hint: All at once
      maskSwipeUpReveal(allTextElements, {
        timeline: tl,
        position: 0,
        duration: 1.15,
        yPercent: 115,
        stagger: 0,
        ease: 'power4.out',
      })

      // 3. Topbar button labels: Thin line swipe animation
      thinLineSwipe('.topbar-nav-link', {
        timeline: tl,
        position: 0.15,
        duration: 0.65,
        stagger: 0.08,
        ease: 'power3.out',
        mode: 'sweep',
      })

      // Only re-measure wrapped description rows when viewport width actually changes
      let lastWidth = window.innerWidth
      const handleResize = () => {
        const nextWidth = window.innerWidth
        if (nextWidth === lastWidth) return
        lastWidth = nextWidth
        if (descRef.current) {
          const rows = buildRowMasks(descRef.current, DESCRIPTION_TEXT)
          descRowsRef.current = rows
          gsap.set(rows, { yPercent: 0 })
        }
      }

      window.addEventListener('resize', handleResize, { passive: true })
      return () => window.removeEventListener('resize', handleResize)
    },
    { scope: containerRef, dependencies: [contentRevealed] },
  )

  return (
    <>
      {/* Dark Charcoal Preloader Overlay with centered INITIALIZING... text */}
      {phase === 'loading' && (
        <LoadingScreen
          isReady={isAssetsReady}
          onExitTextComplete={handleExitTextComplete}
        />
      )}

      <div
        ref={containerRef}
        className="relative w-screen h-screen bg-transparent text-brand-charcoal overflow-hidden select-text font-sans"
      >
        {/* Safe Lazy-Loaded Atmospheric WebGL Background (1:1 Native Pixels, Mipmapped Portrait Zoom) */}
        {shouldLoadBg && (
          <Suspense fallback={null}>
            <AtmosphericBackground onReady={handleBgReady} introPhase={phase} />
          </Suspense>
        )}

        {/* Foreground DOM Layer scaled smoothly inside mask without forcing WebGL bitmap resampling */}
        <div
          ref={uiLayerRef}
          className="relative z-10 w-full h-full flex flex-col justify-between px-4 sm:px-6 md:px-8 lg:px-10 pt-3 sm:pt-4 pb-4 sm:pb-6"
        >
          {/* Header Placeholder (Strictly STATIC: No reveal animation) */}
        <header className="relative z-30 w-full flex items-center justify-between">
          {/* Left: Avatar Logo + Portfolio label */}
          <div className="flex items-center gap-3 sm:gap-5">
            <img
              src="/assets/logo.svg"
              alt="Logo"
              className="h-10 sm:h-12 md:h-14 lg:h-16 w-auto object-contain"
            />
            <span className="font-normal text-base sm:text-lg md:text-[20px] lg:text-[22px] tracking-[-0.015em] uppercase text-brand-charcoal">
              PORTFOLIO / 2027
            </span>
          </div>

          {/* Right: Navigation Items */}
          <nav className="flex items-center gap-6 sm:gap-10 md:gap-14 font-normal text-base sm:text-lg md:text-[20px] lg:text-[22px] tracking-[-0.015em] uppercase text-brand-charcoal">
            <span className="topbar-nav-link text-brand-charcoal hover:opacity-80 transition-opacity inline-flex items-center cursor-pointer">
              <span className="inline-flex items-center">
                <span className="mr-2 sm:mr-3">01</span>
                <span>ABOUT</span>
              </span>
              <span className="thin-swipe-line" />
            </span>
            <span className="topbar-nav-link text-brand-charcoal hover:opacity-80 transition-opacity inline-flex items-center cursor-pointer">
              <span className="inline-flex items-center">
                <span className="mr-2 sm:mr-3">02</span>
                <span>WORK</span>
              </span>
              <span className="thin-swipe-line" />
            </span>
            <span className="topbar-nav-link text-brand-charcoal hover:opacity-80 transition-opacity inline-flex items-center cursor-pointer">
              <span className="inline-flex items-center">
                <span className="mr-2 sm:mr-3">03</span>
                <span>SERVICES</span>
              </span>
              <span className="thin-swipe-line" />
            </span>

            {/* LET'S TALK: Outlined button with brand charcoal border and text */}
            <button
              type="button"
              className="border border-brand-charcoal bg-transparent text-brand-charcoal font-normal text-base sm:text-lg md:text-[20px] lg:text-[22px] tracking-[-0.015em] px-4 sm:px-5 md:px-6 py-1.5 sm:py-2 rounded-none inline-flex items-center gap-2 sm:gap-3 hover:bg-brand-charcoal hover:text-brand-white transition-colors duration-200 cursor-pointer uppercase"
            >
              <span>LET'S TALK</span>
              <ArrowOutwardIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </nav>
        </header>

        {/* Main Content Viewport */}
        <main className="relative z-10 flex-1 w-full mt-3 sm:mt-5 md:mt-7 lg:mt-8">
          {/* Foreground Content (Headline, Sub-Headlines, Description, Buttons) — z-20 above portrait */}
          <div className="relative z-20 w-fit max-w-[72vw] sm:max-w-none pt-1">
            {/* Big Headline (PRODUCT ENGINEER) with Monumental Mask Curtain Reveal */}
            <div className="w-full">
              <div className="overflow-hidden leading-[0.83]">
                <div
                  ref={titleProductRef}
                  className="font-bold text-[17.5vw] sm:text-[16vw] lg:text-[14.8vw] leading-[0.83] tracking-[-0.035em] text-brand-charcoal block transform-gpu"
                >
                  PRODUCT
                </div>
              </div>
              <div className="overflow-hidden leading-[0.83]">
                <div
                  ref={titleEngineerRef}
                  className="font-bold text-[17.5vw] sm:text-[16vw] lg:text-[14.8vw] leading-[0.83] tracking-[-0.035em] text-brand-charcoal block transform-gpu"
                >
                  ENGINEER
                </div>
              </div>
            </div>

            {/* Sub-Headlines directly under the big header */}
            <div className="w-full flex items-center justify-between font-bold text-xl sm:text-2xl md:text-3xl lg:text-[2.2rem] leading-none uppercase tracking-[-0.025em] text-brand-charcoal mt-2 sm:mt-3 md:mt-4">
              <div className="overflow-hidden">
                <span
                  ref={subheadLeftRef}
                  className="subhead-line block pl-1.5 sm:pl-2 md:pl-2.5 lg:pl-3 transform-gpu"
                >
                  BRAND IDENTITY
                </span>
              </div>
              <div className="overflow-hidden">
                <span
                  ref={subheadRightRef}
                  className="subhead-line block transform-gpu"
                >
                  AI DEVELOPMENT
                </span>
              </div>
            </div>

            {/* Description Text (Strictly Row-by-Row dynamic detection) */}
            <div
              ref={descRef}
              className="mt-3 sm:mt-4 md:mt-5 max-w-2xl md:max-w-3xl lg:max-w-4xl pl-1.5 sm:pl-2 md:pl-2.5 lg:pl-3 font-normal text-xl sm:text-2xl md:text-3xl lg:text-[2.25rem] xl:text-[2.5rem] leading-[1.16] tracking-[-0.02em] text-brand-charcoal"
            />

            {/* Action Buttons Row (Strictly STATIC: No reveal animations applied) */}
            <div className="mt-6 sm:mt-8 md:mt-10 lg:mt-12 flex flex-row flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 md:gap-5 pl-1.5 sm:pl-2 md:pl-2.5 lg:pl-3">
              {/* Specializations Dropdown Trigger */}
              <div className="relative" data-dropdown-trigger="specializations">
                <button
                  type="button"
                  aria-expanded={activeDropdown === 'specializations'}
                  onClick={() =>
                    setActiveDropdown((curr) =>
                      curr === 'specializations' ? null : 'specializations',
                    )
                  }
                  className={`text-brand-white font-normal text-base sm:text-lg md:text-xl lg:text-[1.65rem] tracking-[-0.015em] px-6 sm:px-8 md:px-10 py-2.5 sm:py-3 md:py-3.5 lg:py-4 rounded-none inline-flex items-center gap-4 sm:gap-5 transition-all duration-300 cursor-pointer select-none border ${
                    activeDropdown === 'specializations'
                      ? 'dark-glass-active shadow-none'
                      : 'border-transparent bg-brand-charcoal hover:bg-brand-navy shadow-sm'
                  }`}
                >
                  <span className="relative inline-flex flex-col">
                    <span>Specializations</span>
                    <span
                      className={`btn-underline-line ${
                        activeDropdown === 'specializations' ? 'is-active' : ''
                      }`}
                    />
                  </span>
                  <AddIcon
                    className={`w-5 h-5 sm:w-6 sm:h-6 transition-transform duration-200 ${
                      activeDropdown === 'specializations' ? 'rotate-45' : ''
                    }`}
                  />
                </button>

                <div className="absolute bottom-full left-0 mb-3 z-50 pointer-events-none">
                  <TechnicalDropdown
                    {...SPECIALIZATIONS_DATA}
                    isOpen={activeDropdown === 'specializations'}
                    onClose={() => setActiveDropdown(null)}
                  />
                </div>
              </div>

              {/* Tools & Techs Dropdown Trigger */}
              <div className="relative" data-dropdown-trigger="tools">
                <button
                  type="button"
                  aria-expanded={activeDropdown === 'tools'}
                  onClick={() =>
                    setActiveDropdown((curr) => (curr === 'tools' ? null : 'tools'))
                  }
                  className={`text-brand-white font-normal text-base sm:text-lg md:text-xl lg:text-[1.65rem] tracking-[-0.015em] px-6 sm:px-8 md:px-10 py-2.5 sm:py-3 md:py-3.5 lg:py-4 rounded-none inline-flex items-center gap-4 sm:gap-5 transition-all duration-300 cursor-pointer select-none border ${
                    activeDropdown === 'tools'
                      ? 'dark-glass-active shadow-none'
                      : 'border-transparent bg-brand-charcoal hover:bg-brand-navy shadow-sm'
                  }`}
                >
                  <span className="relative inline-flex flex-col">
                    <span>Tools & Techs</span>
                    <span
                      className={`btn-underline-line ${
                        activeDropdown === 'tools' ? 'is-active' : ''
                      }`}
                    />
                  </span>
                  <AddIcon
                    className={`w-5 h-5 sm:w-6 sm:h-6 transition-transform duration-200 ${
                      activeDropdown === 'tools' ? 'rotate-45' : ''
                    }`}
                  />
                </button>

                <div className="absolute bottom-full right-0 sm:right-auto sm:left-0 mb-3 z-50 pointer-events-none">
                  <TechnicalDropdown
                    {...TOOLS_TECHS_DATA}
                    isOpen={activeDropdown === 'tools'}
                    onClose={() => setActiveDropdown(null)}
                  />
                </div>
              </div>

              {/* Socials Link Button */}
              <button
                type="button"
                className="border border-brand-charcoal bg-transparent text-brand-charcoal font-normal text-base sm:text-lg md:text-xl lg:text-[1.65rem] tracking-[-0.015em] px-6 sm:px-8 md:px-10 py-2.5 sm:py-3 md:py-3.5 lg:py-4 rounded-none inline-flex items-center gap-4 sm:gap-5 hover:bg-brand-charcoal hover:text-brand-white transition-colors duration-200 cursor-pointer"
              >
                <span>Socials</span>
                <ArrowOutwardIcon className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>
          </div>

          {/* Bottom-right Name Tag */}
          <div className="absolute right-0 bottom-6 sm:bottom-8 md:bottom-10 z-20 pointer-events-none text-right pr-4 sm:pr-6 md:pr-8 lg:pr-10 overflow-hidden">
            <span
              ref={nameTagRef}
              className="name-line font-normal text-lg sm:text-xl md:text-2xl lg:text-[1.85rem] xl:text-[2.15rem] leading-none tracking-[-0.02em] text-brand-charcoal whitespace-nowrap inline-block transform-gpu"
            >
              <span className="text-brand-charcoal/40 mr-2 sm:mr-3 font-light">//</span>
              Yasser Abdelmotaleb Sebti
            </span>
          </div>
        </main>

        {/* Bottom Center Indicator: scroll, gently */}
        <div className="absolute bottom-2 sm:bottom-3 md:bottom-4 left-1/2 -translate-x-1/2 z-30 overflow-hidden">
          <div
            ref={scrollIndicatorRef}
            className="scroll-line flex items-center gap-2 sm:gap-2.5 text-xs sm:text-sm md:text-base font-normal tracking-[-0.01em] text-brand-charcoal transform-gpu"
          >
            <ArrowDownwardIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-charcoal" />
            <span>scroll, gently</span>
            <ArrowDownwardIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-charcoal" />
          </div>
        </div>
        </div>
      </div>
    </>
  )
}
