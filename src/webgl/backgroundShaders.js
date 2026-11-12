export const VERTEX_SHADER = /* glsl */ `
  attribute vec2 aPos;
  varying vec2 vUv;

  void main() {
    vUv = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`

// Pass 1 (Half-Resolution Cached FBO @ ~12fps): Ultra-fast LUT-driven domain-warped studio clouds
// Uses a 4-channel tileable seamless fBm texture (hardware bilinear) instead of 17 inline simplex noises
// so Windows ANGLE/D3D11 shader compilation finishes in <3ms with zero GPU-process freeze.
export const BG_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec2 uResolution;
  uniform float uTime;
  uniform sampler2D uNoiseTex;

  varying vec2 vUv;

  float gaussianLobe(vec2 p, vec2 center, vec2 radii, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    vec2 d = p - center;
    vec2 rd = vec2(c * d.x + s * d.y, -s * d.x + c * d.y) / radii;
    return exp(-dot(rd, rd));
  }

  float screenBlend(float a, float b) {
    return 1.0 - (1.0 - a) * (1.0 - b);
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    float normAspect = max(aspect, 1.0);

    vec2 p = vec2((uv.x - 0.5) * normAspect, uv.y - 0.5);
    float t = uTime * 0.015;

    // Two-stage domain warp using 4 seamless fBm channels stored in uNoiseTex
    vec2 nUv0 = p * 0.24 + vec2(0.11, t * 0.12);
    vec2 nUv1 = p * 0.29 + vec2(0.47 - t * 0.09, 0.23);
    vec4 n0 = texture2D(uNoiseTex, nUv0);
    vec4 n1 = texture2D(uNoiseTex, nUv1 + n0.xy * 0.22);

    vec2 q = n0.rg;
    vec2 r = n1.ba;
    vec2 warpedP = p + (q - 0.5) * 0.18 + (r - 0.5) * 0.07;

    float mist = texture2D(uNoiseTex, p * 0.32 + r * 0.24).a;

    // Directional soft volumetric light rays sampled cleanly from rotated noise coordinates
    float cR = 0.8678; // cos(-0.52)
    float sR = -0.4969; // sin(-0.52)
    vec2 rp = vec2(cR * p.x - sR * p.y, sR * p.x + cR * p.y);
    float rays = texture2D(uNoiseTex, vec2(rp.x * 0.22 + t * 0.05, rp.y * 0.95 - t * 0.03)).r;

    float coreLight = gaussianLobe(warpedP, vec2(-0.21 * normAspect, 0.05), vec2(0.38 * normAspect, 0.38), -0.35);
    float topLeftLight = gaussianLobe(warpedP, vec2(-0.36 * normAspect, 0.36), vec2(0.26 * normAspect, 0.24), -0.20) * 0.80;
    float midRightBridge = gaussianLobe(warpedP, vec2(0.14 * normAspect, 0.04), vec2(0.42 * normAspect, 0.25), -0.32) * 0.72;
    float lowerLeftLight = gaussianLobe(warpedP, vec2(-0.24 * normAspect, -0.25), vec2(0.37 * normAspect, 0.28), 0.15) * 0.74;
    float topRightLight = gaussianLobe(warpedP, vec2(0.26 * normAspect, 0.42), vec2(0.30 * normAspect, 0.20), 0.10) * 0.58;

    float light = coreLight;
    light = screenBlend(light, topLeftLight);
    light = screenBlend(light, midRightBridge);
    light = screenBlend(light, lowerLeftLight);
    light = screenBlend(light, topRightLight);

    float organicDetail = (mist - 0.5) * 0.22 + (rays - 0.5) * 0.13;
    light = clamp(light * 0.89 + organicDetail + 0.06, 0.0, 1.0);

    float topGapShadow = gaussianLobe(warpedP, vec2(-0.08 * normAspect, 0.47), vec2(0.22 * normAspect, 0.17), 0.08);
    light = clamp(light * (1.0 - topGapShadow * 0.36), 0.0, 1.0);

    float rightDepth = gaussianLobe(warpedP, vec2(0.50 * normAspect, -0.18), vec2(0.35 * normAspect, 0.50), 0.20);
    float topRightEdgeDepth = gaussianLobe(warpedP, vec2(0.50 * normAspect, 0.42), vec2(0.25 * normAspect, 0.30), -0.25);
    float bottomLeftEdgeDepth = gaussianLobe(warpedP, vec2(-0.48 * normAspect, -0.48), vec2(0.26 * normAspect, 0.24), 0.30);
    float outerDepth = screenBlend(rightDepth, screenBlend(topRightEdgeDepth, bottomLeftEdgeDepth));

    vec3 colWhite      = vec3(1.000, 1.000, 1.000);
    vec3 colGlow       = vec3(0.902, 0.933, 0.965);
    vec3 colSteelLight = vec3(0.655, 0.725, 0.800);
    vec3 colSteelMid   = vec3(0.427, 0.541, 0.639);
    vec3 colDeepBlue   = vec3(0.247, 0.357, 0.455);
    vec3 colNavy       = vec3(0.118, 0.184, 0.259);

    vec3 bgColor = mix(colDeepBlue, colSteelMid, smoothstep(0.00, 0.42, light));
    bgColor = mix(bgColor, colSteelLight, smoothstep(0.14, 0.62, light));
    bgColor = mix(bgColor, colGlow, smoothstep(0.36, 0.82, light));
    bgColor = mix(bgColor, colWhite, smoothstep(0.58, 0.98, light));

    float troughFactor = clamp((outerDepth * 0.68 + topGapShadow * 0.42) * (1.0 - smoothstep(0.18, 0.76, light)), 0.0, 0.75);
    bgColor = mix(bgColor, colDeepBlue, troughFactor * 0.54);

    float navyHint = clamp(outerDepth * (1.0 - mist) * (1.0 - smoothstep(0.06, 0.44, light)), 0.0, 0.32);
    bgColor = mix(bgColor, colNavy, navyHint * 0.28);

    float subjectBackdropGlow = gaussianLobe(warpedP, vec2(0.26 * normAspect, 0.04), vec2(0.25 * normAspect, 0.36), -0.15);
    bgColor = mix(bgColor, mix(colSteelLight, colGlow, 0.48), subjectBackdropGlow * 0.24);

    float bloomMask = smoothstep(0.62, 1.0, light);
    float lensBloom = bloomMask * sqrt(max(bloomMask, 0.0));
    bgColor = mix(bgColor, colWhite, lensBloom * 0.14);

    gl_FragColor = vec4(clamp(bgColor, 0.0, 1.0), 1.0);
  }
`

// Pass 2 (Full-Resolution Composite): Grain-free mist, 10x6 grid pulses, sharp portrait + lens bokeh
export const MAIN_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec2 uResolution;
  uniform float uTime;
  uniform vec2 uPointer;

  uniform sampler2D uBgTex;
  uniform sampler2D uPortraitTex;
  uniform float uHasPortrait;
  uniform float uPortraitAspect;
  uniform float uPortraitZoom;

  varying vec2 vUv;

  #define BOKEH_SAMPLES 8

  float safePow(float baseVal, float expVal) {
    return baseVal > 0.0001 ? pow(baseVal, expVal) : 0.0;
  }

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float computePortraitCoC(vec2 pUv) {
    vec2 focusDelta = (pUv - vec2(0.50, 0.65)) / vec2(0.21, 0.26);
    float radialOut = length(focusDelta);

    float radialCoC = smoothstep(0.90, 2.40, radialOut) * 0.72;
    float chestCoC = smoothstep(0.34, 0.0, pUv.y) * 0.75;
    float sideCoC = (smoothstep(0.24, 0.05, pUv.x) + smoothstep(0.78, 0.97, pUv.x)) * 0.55;

    return clamp(max(radialCoC, max(chestCoC, sideCoC)), 0.0, 1.0);
  }

  vec4 sampleSmartLensBlur(vec2 pUv, float coc) {
    vec4 centerSample = texture2D(uPortraitTex, clamp(pUv, 0.001, 0.999));

    if (coc < 0.02 || centerSample.a < 0.005) {
      return centerSample;
    }

    vec2 texelScale = vec2(1.0 / max(uPortraitAspect, 1.0), 1.0);
    float maxRadius = 0.020 * coc;

    vec3 accRgb = vec3(0.0);
    float accAlpha = 0.0;
    float colorWeightSum = 0.0;
    float alphaWeightSum = 0.0;

    vec2 tapOffset;
    for (int i = 0; i < BOKEH_SAMPLES; i++) {
      if (i == 0) tapOffset = vec2(-0.1843,  0.1689);
      else if (i == 1) tapOffset = vec2( 0.0446, -0.4307);
      else if (i == 2) tapOffset = vec2( 0.2535,  0.4937);
      else if (i == 3) tapOffset = vec2(-0.5625, -0.3471);
      else if (i == 4) tapOffset = vec2( 0.7429, -0.1046);
      else if (i == 5) tapOffset = vec2(-0.6305,  0.5384);
      else if (i == 6) tapOffset = vec2( 0.1456, -0.8899);
      else             tapOffset = vec2( 0.5666,  0.7795);

      vec2 sampleUv = pUv + tapOffset * maxRadius * texelScale;
      float inBounds = step(0.0, sampleUv.x) * step(sampleUv.x, 1.0) * step(0.0, sampleUv.y) * step(sampleUv.y, 1.0);
      vec2 safeSampleUv = clamp(sampleUv, 0.001, 0.999);

      vec4 s = texture2D(uPortraitTex, safeSampleUv) * inBounds;
      float sChest = smoothstep(0.34, 0.0, safeSampleUv.y) * 0.75;
      float depthGuard = (sChest > coc + 0.12) ? smoothstep(0.45, 0.0, sChest - coc) : 1.0;

      float wAlpha = depthGuard * inBounds;
      accAlpha += s.a * wAlpha;
      alphaWeightSum += wAlpha;

      float wColor = s.a * wAlpha;
      accRgb += s.rgb * wColor;
      colorWeightSum += wColor;
    }

    vec3 finalRgb = colorWeightSum > 0.0001 ? (accRgb / colorWeightSum) : centerSample.rgb;
    float finalAlpha = alphaWeightSum > 0.0001 ? (accAlpha / alphaWeightSum) : centerSample.a;

    return vec4(finalRgb, finalAlpha);
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / max(uResolution.y, 1.0);

    vec3 rawBgColor = texture2D(uBgTex, uv).rgb;

    vec3 colWhite      = vec3(1.000, 1.000, 1.000);
    vec3 colGlow       = vec3(0.902, 0.933, 0.965);
    vec3 colSteelLight = vec3(0.655, 0.725, 0.800);
    vec3 colSteelMid   = vec3(0.427, 0.541, 0.639);
    vec3 colDeepBlue   = vec3(0.247, 0.357, 0.455);
    vec3 colNavy       = vec3(0.118, 0.184, 0.259);
    vec3 colCharcoal   = vec3(0.043, 0.086, 0.129);

    // --- 10x6 Technical Thin Grid with '+' Intersections ---
    vec2 gridCount = vec2(10.0, 6.0);
    vec2 viewPx = uv * uResolution;
    vec2 cellSizePx = uResolution / gridCount;
    vec2 cellPosPx = mod(viewPx, cellSizePx);
    vec2 distToLinePx = min(cellPosPx, cellSizePx - cellPosPx);

    float lineH = 1.0 - smoothstep(0.0, 0.95, distToLinePx.y);
    float lineV = 1.0 - smoothstep(0.0, 0.95, distToLinePx.x);
    float lineMask = max(lineH, lineV);

    float lineHGlow = 1.0 - smoothstep(0.0, 1.9, distToLinePx.y);
    float lineVGlow = 1.0 - smoothstep(0.0, 1.9, distToLinePx.x);

    float nearestCol = floor(uv.x * gridCount.x + 0.5);
    float nearestRow = floor(uv.y * gridCount.y + 0.5);

    float insideBounds = step(10.0, viewPx.x) * step(10.0, uResolution.x - viewPx.x)
                       * step(10.0, viewPx.y) * step(10.0, uResolution.y - viewPx.y);
    float interiorNode = step(0.5, nearestCol) * step(nearestCol, gridCount.x - 0.5)
                       * step(0.5, nearestRow) * step(nearestRow, gridCount.y - 0.5);

    float armPx = 7.0;
    float plusH = lineH * (1.0 - smoothstep(armPx - 0.6, armPx + 0.4, distToLinePx.x));
    float plusV = lineV * (1.0 - smoothstep(armPx - 0.6, armPx + 0.4, distToLinePx.y));
    float plusMask = max(plusH, plusV) * insideBounds * interiorNode;

    vec3 griddedBg = rawBgColor;
    float anyGridPixel = max(max(lineHGlow, lineVGlow), plusMask);

    if (anyGridPixel > 0.001) {
      float bgLuma = dot(rawBgColor, vec3(0.299, 0.587, 0.114));
      vec3 gridInk = mix(colWhite, mix(colSteelMid, colDeepBlue, 0.55), smoothstep(0.66, 0.94, bgLuma));
      float lumaScale = smoothstep(0.55, 0.96, bgLuma);
      float lineOpacity = mix(0.13, 0.08, lumaScale);
      float plusOpacity = mix(0.48, 0.28, lumaScale);

      float hPulse = 0.0;
      if (lineHGlow > 0.001 || plusMask > 0.001) {
        float rowSeed = hash12(vec2(nearestRow, 17.3));
        float hDir = rowSeed > 0.5 ? 1.0 : -1.0;
        float hSpeed = 0.09 + rowSeed * 0.09;
        float hHead = fract(uTime * hSpeed * hDir + rowSeed * 5.7) * 1.4 - 0.2;
        float hSignedDist = (uv.x - hHead) * hDir;
        float hTrail = (hSignedDist <= 0.0)
          ? exp(hSignedDist * 6.5)
          : smoothstep(0.03, 0.0, hSignedDist);
        float hCycle = smoothstep(-0.45, 0.25, sin(uTime * 0.45 + nearestRow * 2.4 + rowSeed * 6.28));
        hPulse = hTrail * hCycle * step(0.5, nearestRow) * step(nearestRow, gridCount.y - 0.5);
      }

      float vPulse = 0.0;
      if (lineVGlow > 0.001 || plusMask > 0.001) {
        float colSeed = hash12(vec2(nearestCol, 43.9));
        float vDir = colSeed > 0.45 ? -1.0 : 1.0;
        float vSpeed = 0.08 + colSeed * 0.08;
        float vHead = fract(uTime * vSpeed * vDir + colSeed * 4.3) * 1.4 - 0.2;
        float vSignedDist = (uv.y - vHead) * vDir;
        float vTrail = (vSignedDist <= 0.0)
          ? exp(vSignedDist * 6.0)
          : smoothstep(0.035, 0.0, vSignedDist);
        float vCycle = smoothstep(-0.45, 0.25, sin(uTime * 0.40 + nearestCol * 1.9 + colSeed * 6.28));
        vPulse = vTrail * vCycle * step(0.5, nearestCol) * step(nearestCol, gridCount.x - 0.5);
      }

      float nodeActivity = 0.0;
      if (plusMask > 0.001) {
        float nodeSeed = hash12(vec2(nearestCol, nearestRow));
        float nodeWave = 0.5 + 0.5 * sin(uTime * (0.75 + nodeSeed * 0.65) + nodeSeed * 18.85);
        float nodeBreath = nodeWave * nodeWave * nodeWave;
        nodeActivity = clamp(nodeBreath * 0.38 + max(hPulse, vPulse) * 0.85, 0.0, 1.0);
      }

      float lineBoost = max(lineH * hPulse, lineV * vPulse);
      float hHalo = hPulse * sqrt(max(hPulse, 0.0));
      float vHalo = vPulse * sqrt(max(vPulse, 0.0));
      float haloBoost = max(lineHGlow * hHalo, lineVGlow * vHalo);
      float pulseStrength = mix(0.48, 0.28, lumaScale);
      float finalLineAlpha = lineMask * lineOpacity + lineBoost * pulseStrength + haloBoost * (pulseStrength * 0.22);
      float finalPlusAlpha = plusMask * (plusOpacity + nodeActivity * mix(0.42, 0.26, lumaScale));

      float gridAlpha = clamp(max(finalLineAlpha, finalPlusAlpha), 0.0, 1.0);
      griddedBg = mix(rawBgColor, gridInk, gridAlpha);
    }

    vec3 color = griddedBg;

    // --- PRODUCT: ENGINEER Cinematic Portrait Integration ---
    if (uHasPortrait > 0.5) {
      float pHeightUv = mix(0.58, 0.94, smoothstep(0.55, 1.35, aspect)) * uPortraitZoom;
      float pWidthUv = pHeightUv * (uPortraitAspect / max(aspect, 0.45));
      float faceAnchorX = mix(0.68, 0.815, smoothstep(0.55, 1.35, aspect));

      vec2 pUv = vec2(
        (uv.x - (faceAnchorX - pWidthUv * 0.5) + uPointer.x * 0.0020) / pWidthUv,
        (uv.y + uPointer.y * 0.0012) / pHeightUv
      );

      if (pUv.x >= 0.0 && pUv.x <= 1.0 && pUv.y >= 0.0 && pUv.y <= 1.0) {
        float coc = computePortraitCoC(pUv);
        vec4 portrait = sampleSmartLensBlur(pUv, coc);

        if (portrait.a > 0.002) {
          vec3 pRgb = portrait.rgb;
          float pLuma = dot(pRgb, vec3(0.299, 0.587, 0.114));

          float skinWarmth = smoothstep(0.015, 0.13, pRgb.r - pRgb.b);

          vec3 graded = mix(pRgb, vec3(pLuma), mix(0.54, 0.34, skinWarmth));
          graded *= mix(vec3(0.90, 0.955, 1.035), vec3(0.95, 0.978, 1.015), skinWarmth);

          float shirtRegion = (1.0 - skinWarmth) * smoothstep(0.26, 0.58, pLuma);
          float tonedShirtLuma = safePow(clamp(pLuma * 0.84, 0.0, 1.0), 1.18);
          vec3 steelShirtTone = mix(colDeepBlue, colSteelMid, smoothstep(0.20, 0.55, tonedShirtLuma));
          steelShirtTone = mix(steelShirtTone, colSteelLight, smoothstep(0.50, 0.85, tonedShirtLuma));
          vec3 shirtGraded = mix(graded * 0.82, steelShirtTone, 0.68);
          graded = mix(graded, shirtGraded, shirtRegion);

          float shadowWeight = safePow(1.0 - clamp(pLuma, 0.0, 1.0), 1.85);
          vec3 shadowTarget = mix(colDeepBlue, colNavy, 0.50);
          graded = mix(graded, mix(graded, shadowTarget, 0.52), shadowWeight * mix(0.75, 0.38, skinWarmth));

          float deepBlackMask = 1.0 - smoothstep(0.0, 0.24, pLuma);
          graded = mix(graded, mix(graded, colCharcoal, 0.55), deepBlackMask * 0.55);

          float hiWeight = smoothstep(0.62, 0.96, pLuma);
          graded = mix(graded, mix(graded, colGlow, 0.35), hiWeight * mix(0.45, 0.18, skinWarmth));

          pRgb = clamp((graded - 0.48) * 1.12 + 0.48, 0.0, 1.0);

          float leftShoulderLight = smoothstep(0.42, 0.10, pUv.x) * smoothstep(0.0, 0.56, pUv.y) * (1.0 - skinWarmth * 0.85);
          vec3 litShoulderTarget = mix(pRgb * 1.18, mix(colGlow, colWhite, 0.35), 0.36);
          pRgb = mix(pRgb, clamp(litShoulderTarget, 0.0, 1.0), leftShoulderLight * 0.65);

          float rightShoulderFalloff = smoothstep(0.54, 0.94, pUv.x) * smoothstep(0.02, 0.52, pUv.y) * (1.0 - skinWarmth * 0.85);
          pRgb = mix(pRgb, pRgb * vec3(0.54, 0.65, 0.78), rightShoulderFalloff * 0.68);
          pRgb = mix(pRgb, colDeepBlue, rightShoulderFalloff * 0.24);

          float leftOuterMix = smoothstep(0.28, 0.05, pUv.x);
          pRgb = mix(pRgb, rawBgColor, leftOuterMix * 0.48);

          float rightOuterMix = smoothstep(0.78, 0.98, pUv.x);
          vec3 rightHazeTarget = mix(rawBgColor, colSteelMid, 0.28);
          pRgb = mix(pRgb, rightHazeTarget, rightOuterMix * 0.42);

          float chestMask = smoothstep(0.34, 0.0, pUv.y);
          vec3 chestHazeColor = mix(rawBgColor, colSteelLight, 0.18);
          pRgb = mix(pRgb, chestHazeColor, chestMask * 0.36);

          float leftEdgeHaze = smoothstep(0.22, 0.03, pUv.x);
          pRgb = mix(pRgb, rawBgColor, leftEdgeHaze * 0.42);

          float bottomEdgeHaze = smoothstep(0.10, 0.0, pUv.y);
          pRgb = mix(pRgb, chestHazeColor, bottomEdgeHaze * 0.48);

          color = mix(griddedBg, pRgb, clamp(portrait.a, 0.0, 1.0));
        }
      }
    }

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`

/**
 * Generates a tileable 128x128 RGBA seamless value-noise / fBm lookup buffer in <1.5ms.
 * Replaces 17 inline GLSL Simplex noise calls with 4 hardware-interpolated texture lookups.
 */
export function buildSeamlessNoiseData(size = 128) {
  const perm = new Uint8Array(size * size)
  let seed = 1337
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return (seed >>> 16) / 65536
  }
  for (let i = 0; i < perm.length; i++) {
    perm[i] = Math.floor(nextRand() * 256)
  }

  const smoothstep = (t) => t * t * (3 - 2 * t)
  const samplePeriodic = (x, y, freq, offset) => {
    const gx = ((x * freq) % freq + freq) % freq
    const gy = ((y * freq) % freq + freq) % freq
    const x0 = Math.floor(gx)
    const y0 = Math.floor(gy)
    const x1 = (x0 + 1) % freq
    const y1 = (y0 + 1) % freq
    const fx = smoothstep(gx - x0)
    const fy = smoothstep(gy - y0)

    const idx = (ix, iy) => ((iy * freq + ix + offset) & (size * size - 1))
    const a = perm[idx(x0, y0)] / 255
    const b = perm[idx(x1, y0)] / 255
    const c = perm[idx(x0, y1)] / 255
    const d = perm[idx(x1, y1)] / 255

    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy
  }

  const fbmPeriodic = (u, v, offset) => {
    let sum = 0
    sum += 0.55 * samplePeriodic(u, v, 4, offset)
    sum += 0.30 * samplePeriodic(u, v, 8, offset + 97)
    sum += 0.15 * samplePeriodic(u, v, 16, offset + 211)
    return Math.max(0, Math.min(255, Math.round(sum * 255)))
  }

  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    const v = y / size
    for (let x = 0; x < size; x++) {
      const u = x / size
      const p = (y * size + x) * 4
      data[p] = fbmPeriodic(u, v, 13)
      data[p + 1] = fbmPeriodic(u, v, 317)
      data[p + 2] = fbmPeriodic(u, v, 743)
      data[p + 3] = fbmPeriodic(u, v, 1291)
    }
  }
  return data
}
