import { createBackgroundEngine } from './backgroundEngine'

let engine = null

self.onmessage = (e) => {
  const msg = e.data
  if (!msg || !msg.type) return

  switch (msg.type) {
    case 'init': {
      if (engine) {
        engine.dispose()
      }
      engine = createBackgroundEngine(msg.canvas, {
        initialWidth: msg.width,
        initialHeight: msg.height,
        dpr: msg.dpr,
        portraitUrl: msg.portraitUrl,
        initialPhase: msg.introPhase,
        reducedMotion: msg.reducedMotion,
        hidden: msg.hidden,
        onReady: () => {
          self.postMessage({ type: 'ready' })
        },
      })
      break
    }
    case 'phase':
      engine?.setPhase(msg.introPhase)
      break
    case 'pointer':
      engine?.setPointer(msg.x, msg.y)
      break
    case 'resize':
      engine?.setSize(msg.width, msg.height, msg.dpr)
      break
    case 'hidden':
      engine?.setHidden(msg.hidden)
      break
    case 'reducedMotion':
      engine?.setReducedMotion(msg.reducedMotion)
      break
    case 'dispose':
      engine?.dispose()
      engine = null
      break
    default:
      break
  }
}
