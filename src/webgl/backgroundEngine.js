import {
  VERTEX_SHADER,
  BG_FRAGMENT_SHADER,
  MAIN_FRAGMENT_SHADER,
  buildSeamlessNoiseData,
} from './backgroundShaders'

function compileShader(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  return shader
}

/**
 * Creates a GPU-accelerated atmospheric background renderer targeting either an
 * OffscreenCanvas inside a Web Worker (zero main-thread stalls) or a standard canvas fallback.
 */
export function createBackgroundEngine(
  canvas,
  {
    initialWidth = 1280,
    initialHeight = 720,
    dpr = 1,
    portraitUrl = '/assets/myself-v2-cutout.webp',
    initialPhase = 'loading',
    reducedMotion = false,
    hidden = false,
    onReady,
  },
) {
  const ctxAttrs = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'default',
  }

  let gl = canvas.getContext('webgl2', ctxAttrs)
  const isWebGL2 = Boolean(gl)
  if (!gl) {
    gl = canvas.getContext('webgl', ctxAttrs)
  }

  if (!gl) {
    onReady?.()
    return {
      setPhase: () => {},
      setPointer: () => {},
      setSize: () => {},
      setHidden: () => {},
      setReducedMotion: () => {},
      dispose: () => {},
    }
  }

  const parallelExt = gl.getExtension('KHR_parallel_shader_compile')
  const raf =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb) => setTimeout(() => cb(performance.now()), 16)
  const cancelRaf =
    typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : (id) => clearTimeout(id)

  let isDisposed = false
  let isCompiled = false
  let hasNotifiedReady = false
  let animationFrameId = null
  let pendingRafId = null
  let pendingTimerId = null

  let cssWidth = Math.max(initialWidth, 1)
  let cssHeight = Math.max(initialHeight, 1)
  let currentDpr = Math.max(dpr, 1)
  let bgWidth = Math.max(Math.round(cssWidth * 0.5), 64)
  let bgHeight = Math.max(Math.round(cssHeight * 0.5), 64)

  let phase = initialPhase
  let isHidden = hidden
  let isReducedMotion = reducedMotion
  let zoomStartMs = 0
  let portraitZoom = initialPhase === 'loading' ? 0.9 : 1.0

  const pointer = { targetX: 0, targetY: 0, currentX: 0, currentY: 0 }
  const startTimeMs = performance.now()
  const MIN_FRAME_MS = 1000 / 30
  const BG_UPDATE_MS = 1000 / 12
  let lastRenderTime = 0
  let lastBgRenderTime = -BG_UPDATE_MS

  const notifyReadyOnce = () => {
    if (hasNotifiedReady || isDisposed) return
    hasNotifiedReady = true
    onReady?.()
  }

  const syncCanvasSize = () => {
    canvas.width = Math.max(Math.round(cssWidth * currentDpr), 1)
    canvas.height = Math.max(Math.round(cssHeight * currentDpr), 1)
  }
  syncCanvasSize()

  // Fullscreen quad buffer
  const quadBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

  // 128x128 seamless 4-channel fBm noise texture (hardware REPEAT + LINEAR)
  const noiseSize = 128
  const noiseData = buildSeamlessNoiseData(noiseSize)
  const noiseTex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, noiseTex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
  if (isWebGL2) {
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, noiseSize, noiseSize)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, noiseSize, noiseSize, gl.RGBA, gl.UNSIGNED_BYTE, noiseData)
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, noiseSize, noiseSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, noiseData)
  }

  // Half-resolution background FBO texture
  const bgTex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, bgTex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, bgWidth, bgHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)

  const bgFbo = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, bgFbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, bgTex, 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)

  let portraitTex = null
  let hasPortrait = 0
  let portraitAspect = 1600 / 1195
  let bgProgram = null
  let mainProgram = null
  let bgLocs = null
  let mainLocs = null

  const yieldFrame = () =>
    new Promise((resolve) => {
      pendingRafId = raf(resolve)
    })

  const yieldSlice = () =>
    new Promise((resolve) => {
      pendingTimerId = setTimeout(() => {
        pendingRafId = raf(resolve)
      }, 16)
    })

  const linkProgramNonBlocking = async (vertSource, fragSource) => {
    const vs = compileShader(gl, gl.VERTEX_SHADER, vertSource)
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSource)
    const program = gl.createProgram()
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)

    if (parallelExt) {
      while (!isDisposed && !gl.getProgramParameter(program, parallelExt.COMPLETION_STATUS_KHR)) {
        await yieldFrame()
      }
    } else {
      await yieldFrame()
    }

    gl.deleteShader(vs)
    gl.deleteShader(fs)

    if (isDisposed || !gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program)
      return null
    }
    return program
  }

  const drawQuad = (posAttr) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
    gl.enableVertexAttribArray(posAttr)
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  const renderFrame = (forceBg = false, nowMs = performance.now()) => {
    if (isDisposed || !isCompiled) return
    const elapsed = (nowMs - startTimeMs) * 0.001

    if (phase === 'zooming') {
      if (isReducedMotion) {
        portraitZoom = 1.0
      } else {
        const progress = Math.min(Math.max((nowMs - zoomStartMs) / 1250, 0), 1)
        const eased = 1 - Math.pow(1 - progress, 3) // exact GSAP power3.out curve
        portraitZoom = 0.9 + 0.1 * eased
      }
    } else if (phase === 'done') {
      portraitZoom = 1.0
    } else {
      portraitZoom = 0.9
    }

    if (forceBg || nowMs - lastBgRenderTime >= BG_UPDATE_MS) {
      lastBgRenderTime = nowMs
      gl.bindFramebuffer(gl.FRAMEBUFFER, bgFbo)
      gl.viewport(0, 0, bgWidth, bgHeight)
      gl.useProgram(bgProgram)
      gl.uniform2f(bgLocs.uResolution, cssWidth, cssHeight)
      gl.uniform1f(bgLocs.uTime, elapsed)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, noiseTex)
      gl.uniform1i(bgLocs.uNoiseTex, 0)
      drawQuad(bgLocs.aPos)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    }

    pointer.currentX += (pointer.targetX - pointer.currentX) * 0.14
    pointer.currentY += (pointer.targetY - pointer.currentY) * 0.14

    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.useProgram(mainProgram)
    gl.uniform2f(mainLocs.uResolution, cssWidth, cssHeight)
    gl.uniform1f(mainLocs.uTime, elapsed)
    gl.uniform2f(mainLocs.uPointer, pointer.currentX, pointer.currentY)
    gl.uniform1f(mainLocs.uHasPortrait, hasPortrait)
    gl.uniform1f(mainLocs.uPortraitAspect, portraitAspect)
    gl.uniform1f(mainLocs.uPortraitZoom, portraitZoom)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, bgTex)
    gl.uniform1i(mainLocs.uBgTex, 0)

    if (portraitTex) {
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, portraitTex)
      gl.uniform1i(mainLocs.uPortraitTex, 1)
    }

    drawQuad(mainLocs.aPos)
  }

  const startLoop = () => {
    if (isDisposed || !isCompiled || animationFrameId !== null) return
    if (isHidden || isReducedMotion || phase === 'loading') return

    const tick = (now) => {
      if (isDisposed) return
      if (isHidden || isReducedMotion || phase === 'loading') {
        animationFrameId = null
        return
      }
      const targetInterval = phase === 'zooming' ? 0 : MIN_FRAME_MS
      if (now - lastRenderTime >= targetInterval) {
        lastRenderTime = now
        renderFrame(false, now)
      }
      animationFrameId = raf(tick)
    }
    animationFrameId = raf(tick)
  }

  const stopLoop = () => {
    if (animationFrameId !== null) {
      cancelRaf(animationFrameId)
      animationFrameId = null
    }
  }

  const loadPortraitOffThread = async () => {
    if (typeof createImageBitmap === 'function') {
      try {
        const response = await fetch(portraitUrl)
        if (!response.ok) return null
        const blob = await response.blob()
        try {
          const bitmap = await createImageBitmap(blob, {
            imageOrientation: 'flipY',
            premultiplyAlpha: 'none',
            colorSpaceConversion: 'none',
          })
          return { source: bitmap, width: bitmap.width, height: bitmap.height, needsFlip: false, closeable: true }
        } catch {
          const bitmap = await createImageBitmap(blob)
          return { source: bitmap, width: bitmap.width, height: bitmap.height, needsFlip: true, closeable: true }
        }
      } catch {
        return null
      }
    }

    if (typeof Image === 'function') {
      return new Promise((resolve) => {
        const img = new Image()
        img.decoding = 'async'
        img.onload = () =>
          resolve({
            source: img,
            width: img.naturalWidth,
            height: img.naturalHeight,
            needsFlip: true,
            closeable: false,
          })
        img.onerror = () => resolve(null)
        img.src = portraitUrl
      })
    }

    return null
  }

  const initAsync = async () => {
    const portraitPromise = loadPortraitOffThread()

    await yieldFrame()
    if (isDisposed) return

    bgProgram = await linkProgramNonBlocking(VERTEX_SHADER, BG_FRAGMENT_SHADER)
    if (isDisposed || !bgProgram) {
      notifyReadyOnce()
      return
    }
    bgLocs = {
      aPos: gl.getAttribLocation(bgProgram, 'aPos'),
      uResolution: gl.getUniformLocation(bgProgram, 'uResolution'),
      uTime: gl.getUniformLocation(bgProgram, 'uTime'),
      uNoiseTex: gl.getUniformLocation(bgProgram, 'uNoiseTex'),
    }

    await yieldSlice()
    if (isDisposed) return

    // Pre-render half-res background FBO cleanly in its own slice
    lastBgRenderTime = performance.now()
    gl.bindFramebuffer(gl.FRAMEBUFFER, bgFbo)
    gl.viewport(0, 0, bgWidth, bgHeight)
    gl.useProgram(bgProgram)
    gl.uniform2f(bgLocs.uResolution, cssWidth, cssHeight)
    gl.uniform1f(bgLocs.uTime, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, noiseTex)
    gl.uniform1i(bgLocs.uNoiseTex, 0)
    drawQuad(bgLocs.aPos)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.flush()

    await yieldSlice()
    if (isDisposed) return

    mainProgram = await linkProgramNonBlocking(VERTEX_SHADER, MAIN_FRAGMENT_SHADER)
    if (isDisposed || !mainProgram) {
      notifyReadyOnce()
      return
    }
    mainLocs = {
      aPos: gl.getAttribLocation(mainProgram, 'aPos'),
      uResolution: gl.getUniformLocation(mainProgram, 'uResolution'),
      uTime: gl.getUniformLocation(mainProgram, 'uTime'),
      uPointer: gl.getUniformLocation(mainProgram, 'uPointer'),
      uBgTex: gl.getUniformLocation(mainProgram, 'uBgTex'),
      uPortraitTex: gl.getUniformLocation(mainProgram, 'uPortraitTex'),
      uHasPortrait: gl.getUniformLocation(mainProgram, 'uHasPortrait'),
      uPortraitAspect: gl.getUniformLocation(mainProgram, 'uPortraitAspect'),
      uPortraitZoom: gl.getUniformLocation(mainProgram, 'uPortraitZoom'),
    }

    const loadedPortrait = await portraitPromise
    if (isDisposed) {
      if (loadedPortrait?.closeable) loadedPortrait.source.close?.()
      return
    }

    await yieldSlice()
    if (isDisposed) {
      if (loadedPortrait?.closeable) loadedPortrait.source.close?.()
      return
    }

    if (loadedPortrait && loadedPortrait.source) {
      const { source, width, height, needsFlip, closeable } = loadedPortrait
      portraitTex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, portraitTex)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

      if (needsFlip) {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      }
      if (isWebGL2 && !needsFlip) {
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height)
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source)
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
      }
      if (needsFlip) {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      }
      gl.flush()

      portraitAspect = height > 0 ? width / height : 1600 / 1195
      hasPortrait = 1
      if (closeable) source.close?.()
    }

    await yieldSlice()
    if (isDisposed) return

    isCompiled = true
    renderFrame(false, performance.now())

    await yieldFrame()
    if (isDisposed) return

    notifyReadyOnce()
    if (phase !== 'loading') {
      startLoop()
    }
  }

  initAsync()

  return {
    setPhase: (nextPhase) => {
      phase = nextPhase
      if (nextPhase === 'loading') {
        portraitZoom = 0.9
        stopLoop()
      } else if (nextPhase === 'zooming') {
        zoomStartMs = performance.now()
        lastRenderTime = 0
        startLoop()
      } else {
        portraitZoom = 1.0
        startLoop()
      }
    },
    setPointer: (x, y) => {
      pointer.targetX = x
      pointer.targetY = y
    },
    setSize: (nextWidth, nextHeight, nextDpr) => {
      const w = Math.max(nextWidth, 1)
      const h = Math.max(nextHeight, 1)
      const d = Math.max(nextDpr, 1)
      if (w === cssWidth && h === cssHeight && d === currentDpr) return
      cssWidth = w
      cssHeight = h
      currentDpr = d
      bgWidth = Math.max(Math.round(cssWidth * 0.5), 64)
      bgHeight = Math.max(Math.round(cssHeight * 0.5), 64)
      syncCanvasSize()

      gl.bindTexture(gl.TEXTURE_2D, bgTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, bgWidth, bgHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      renderFrame(true)
    },
    setHidden: (nextHidden) => {
      isHidden = nextHidden
      if (isHidden || isReducedMotion || phase === 'loading') {
        stopLoop()
        renderFrame(true)
      } else {
        startLoop()
      }
    },
    setReducedMotion: (nextReduced) => {
      isReducedMotion = nextReduced
      if (isHidden || isReducedMotion || phase === 'loading') {
        stopLoop()
        renderFrame(true)
      } else {
        startLoop()
      }
    },
    dispose: () => {
      isDisposed = true
      stopLoop()
      if (pendingTimerId !== null) clearTimeout(pendingTimerId)
      if (pendingRafId !== null) cancelRaf(pendingRafId)
      if (portraitTex) gl.deleteTexture(portraitTex)
      gl.deleteTexture(noiseTex)
      gl.deleteTexture(bgTex)
      gl.deleteFramebuffer(bgFbo)
      gl.deleteBuffer(quadBuffer)
      if (bgProgram) gl.deleteProgram(bgProgram)
      if (mainProgram) gl.deleteProgram(mainProgram)
    },
  }
}
