// All tunable numbers live here so they can be adjusted without touching logic.

export interface ModelEntry {
  url: string;
  label: string;
  /** Vertical position of the camera target, as a fraction of model height from the bottom. */
  frameHeight: number;
  /** Camera distance from the target, as a multiple of model height. */
  frameDistance: number;
  /** Default morph weights that are always added on top of targets (ARKit names). */
  baseWeights: Record<string, number>;
}

export const MODELS: Record<string, ModelEntry> = {
  hunjang: {
    url: '/models/hunjang.glb',
    label: '귀여운 훈장님',
    frameHeight: 0.62,
    frameDistance: 2.2,
    baseWeights: {},
  },
  'hunjang-real': {
    url: '/models/hunjang-real.glb',
    label: '실사 훈장님',
    frameHeight: 0.62,
    frameDistance: 2.2,
    baseWeights: {},
  },
  // Development face from the three.js examples (ARKit blendshapes, _L/_R suffixes).
  facecap: {
    url: '/models/facecap.glb',
    label: '개발용 얼굴',
    frameHeight: 0.5,
    frameDistance: 1.6,
    baseWeights: {},
  },
};

export const DEFAULT_MODEL = 'hunjang';

export const DECODERS = {
  /** Basis Universal transcoder (KTX2 textures). Files are served from public/. */
  basisTranscoderPath: '/libs/basis/',
};

export const ENGINE = {
  /** Natural frequency of the spring (rad/s). Higher = snappier. */
  springOmega: 14,
  /**
   * Damping ratio ζ. 1 = critically damped (no overshoot). Below 1 the weight passes the
   * goal slightly and swings back (0.5 ≈ 16% overshoot). Above 1 approaches more slowly.
   * Individual channels can override it via setTarget(name, value, { dampingRatio }).
   */
  dampingRatio: 1,
  /**
   * Range written to morphTargetInfluences. Max slightly above 1 so overshoot toward a full
   * expression stays visible; min 0 so a spring swinging past neutral never inverts a morph.
   */
  outputMin: 0,
  outputMax: 1.1,
  /** Largest frame time fed to the spring, in seconds (avoids jumps after tab switches). */
  maxDt: 0.1,
  /**
   * Explicit name overrides, checked before the automatic left/right resolution.
   * Key: requested ARKit name. Value: one or more morph names in the model.
   */
  aliases: {} as Record<string, string[]>,
};

export const LIGHTS = {
  environmentIntensity: 0.6,
  key: { color: 0xfff4e6, intensity: 1.6, position: [-1, 1.5, 2] as const },
  rim: { color: 0xdde8ff, intensity: 1.2, position: [1.5, 1, -2] as const },
};

export const VIEW = {
  background: 0xe9e4da,
  fov: 30,
  maxPixelRatio: 2,
};

export const LANDMARKS_VIEW = {
  /** Camera framing in ?landmarks mode (fractions of model height), so face + collar fit. */
  frameHeight: 0.45,
  frameDistance: 2.2,
  /** Marker sphere radius as a fraction of model height. */
  markerRadius: 0.006,
  colors: { left: 0x2f80ed, right: 0xeb5757, center: 0x27ae60, active: 0xffc107, ghost: 0xffffff },
  /** A pointer press that moves less than this (px) counts as a click, not an orbit drag. */
  clickTolerancePx: 5,
  /** Camera azimuth for the side-view buttons, in degrees (0 = front). */
  sideViewAngle: 80,
  /** Labels of markers hidden behind the model fade to this opacity. */
  hiddenLabelOpacity: 0.15,
  /** Wait this long after the camera stops before re-checking which markers are hidden. */
  occlusionDelayMs: 120,
  /** localStorage key prefix for unfinished picking sessions (per model). */
  draftKey: 'hunjang.landmarks.draft.',
};
