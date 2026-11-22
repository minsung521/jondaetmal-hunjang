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
  /** Per-model overrides of FACE_PARTS (src/data/faceParts.<model>.json wins over these). */
  faceParts?: DeepPartial<FacePartsParams>;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export const MODELS: Record<string, ModelEntry> = {
  hunjang: {
    url: '/models/hunjang.glb',
    label: '귀여운 훈장님',
    frameHeight: 0.62,
    frameDistance: 2.2,
    baseWeights: {},
    // Big painted cartoon eyes (half-width ≈ 0.26 eyeDist): a 0.22 ball can't cover them,
    // so use a larger ball that shows a ≈0.25 disc and bulges ≈0.13 out of the face.
    // The painted eye white reaches further sideways than the eyeball, so widen the lids.
    faceParts: { eyes: { radius: 0.3, depth: 0.17, irisAngle: 30, pupilAngle: 14 }, eyelids: { width: 1.2 } },
  },
  'hunjang-real': {
    url: '/models/hunjang-real.glb',
    label: '실사 훈장님',
    frameHeight: 0.62,
    frameDistance: 2.2,
    baseWeights: {},
    // Small eye openings: sit the eyeballs deeper so only a ≈0.14 disc shows and they
    // protrude ≈0.05 (otherwise they look like ping-pong balls from the side).
    // Lips are sculpted slightly apart (0.12 eyeDist), so cut a slightly thicker band.
    faceParts: { eyes: { depth: 0.17, irisAngle: 24, pupilAngle: 10 }, lipGap: { thickness: 0.08 } },
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

/**
 * Code-built face parts (stage C). Lengths are in eyeDist units (distance between eye_L and
 * eye_R); angles in degrees. Override per model in MODELS[key].faceParts or, after tuning in
 * ?debug, in src/data/faceParts.<model>.json.
 */
export interface FacePartsParams {
  eyes: {
    visible: boolean;
    /** Eyeball radius. */
    radius: number;
    /** Eyeball centre sits this far behind the eye landmark (along -Z). Smaller = bulgier. */
    depth: number;
    /** Nudges from the landmark: outward from the face centre (mirrored L/R), and up. */
    offsetX: number;
    offsetY: number;
    /** Largest gaze rotation from straight ahead. */
    maxAngle: number;
    /** Gaze spring ω (rad/s); critically damped. */
    gazeOmega: number;
    /** Angular radius of iris / pupil measured from the front of the eyeball. */
    irisAngle: number;
    pupilAngle: number;
    scleraColor: string;
    irisColor: string;
    irisEdgeColor: string;
    pupilColor: string;
    roughness: number;
    clearcoat: number;
    clearcoatRoughness: number;
  };
  mouth: {
    visible: boolean;
    /** Front of the interior relative to the lip line (+ = forward). Slightly negative = just behind. */
    ahead: number;
    /** How far toward the corners it reaches (1 = to the corners). Keep ≥ lipGap.width. */
    width: number;
    /** Half-height and depth of the cross-section. */
    height: number;
    depth: number;
    /** Vertical nudge from the lip midpoint. */
    offsetY: number;
    color: string;
  };
  lipGap: {
    enabled: boolean;
    /** Band thickness around the lip mid-line (full thickness, at the centre). */
    thickness: number;
    /** How far toward the corners the gap reaches (1 = all the way to the corners). */
    width: number;
    /** 0 = same thickness everywhere, 1 = band thins to nothing at the gap ends. */
    taper: number;
    /** Depth window around the lip line: small in front (keeps the moustache), larger behind. */
    depthFront: number;
    depthBack: number;
    /**
     * Also cut triangles that straddle the lip line inside the gap, so the upper and lower lip
     * are fully separated there and jawOpen can move the lower lip without stretching skin.
     */
    cutStraddling: boolean;
    /**
     * Only triangles whose normal z is above this are removed. Slightly negative so the lip
     * crease faces that curl into the mouth (facing a bit down/back) go too; the depth window
     * already keeps the back of the head out.
     */
    minFacing: number;
  };
  /**
   * Eyelid shells (stage D): an upper and a lower partial sphere shell per eye, slightly larger
   * than the eyeball, rotated about the eye's horizontal axis to cover it. Edge positions are
   * fractions of the visible eyeball's half-angle (0 = centre of the eye, 1 = top/bottom of the
   * visible disc, negative = below centre), so the same numbers fit both models.
   */
  eyelids: {
    visible: boolean;
    /** Shell radius = eyeball radius × (1 + gap). */
    gap: number;
    /** Horizontal stretch of the shells, to also cover painted eye white beside the eyeball. */
    width: number;
    /** Upper lid edge at rest (a little below the top = stern look), at eyeWide, at full squint. */
    upperRest: number;
    upperWide: number;
    squintUpperDrop: number;
    /** Lower lid edge at rest (hidden under the skin) and at full eyeSquint. */
    lowerRest: number;
    lowerSquint: number;
    /** On eyeBlink the upper lid comes down to the lower lid; the lower lid also rises this much. */
    blinkLowerRise: number;
    /** How far the closed upper lid overlaps the lower one. */
    overlap: number;
    /** Lids follow vertical gaze by this fraction of the eyeball's pitch. */
    followGaze: number;
    /** Dark lash line along each edge (angular width in degrees). */
    lashColor: string;
    lashWidth: number;
    /** Multiplier on the skin colour sampled from the texture around the eye. */
    brightness: number;
    roughness: number;
  };
}

export const FACE_PARTS: FacePartsParams = {
  eyes: {
    visible: true,
    radius: 0.22,
    depth: 0.1,
    offsetX: 0,
    offsetY: 0,
    maxAngle: 20,
    gazeOmega: 18,
    irisAngle: 36,
    pupilAngle: 16,
    scleraColor: '#f4f1ea',
    irisColor: '#4a2a17',
    irisEdgeColor: '#1e1009',
    pupilColor: '#050505',
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  },
  mouth: {
    visible: true,
    ahead: -0.03,
    width: 0.95,
    height: 0.3,
    depth: 0.6,
    offsetY: 0,
    color: '#3a0d0d',
  },
  lipGap: {
    enabled: true,
    thickness: 0.06,
    width: 0.9,
    taper: 0.5,
    depthFront: 0.06,
    depthBack: 0.2,
    cutStraddling: true,
    minFacing: -0.5,
  },
  eyelids: {
    visible: true,
    gap: 0.05,
    width: 1,
    upperRest: 0.5,
    upperWide: 1.15,
    squintUpperDrop: 0.15,
    lowerRest: -1.15,
    lowerSquint: -0.35,
    blinkLowerRise: 0.7,
    overlap: 0.12,
    followGaze: 0.35,
    lashColor: '#3a2418',
    lashWidth: 6,
    brightness: 1,
    roughness: 0.6,
  },
};

export const GAZE = {
  /** Follow the pointer with the eyes (outside ?debug this is always on). */
  followPointer: true,
  /** Pointer distance from the eyes, in normalized screen units (-1..1), that maps to maxAngle. */
  pointerRange: 0.6,
};

/** Head group pivot = midpoint of jawPivot_L/R plus this offset (eyeDist units). */
export const HEAD = {
  pivotOffset: [0, 0, 0] as [number, number, number],
};

// ---------------------------------------------------------------------------------------------
// Stage D: generated morph targets.
// Every length is in eyeDist units; vectors use model-root axes (+x = character's left, +y up,
// +z toward the viewer). Per-target `strength`/`radius` are the knobs exposed in ?debug and
// saved to src/data/morphConfig.<model>.json; the handle lists stay here.
// ---------------------------------------------------------------------------------------------

export type V3 = [number, number, number];

export interface MorphHandle {
  /** Landmark the handle is centred on, or several (their average). */
  at: string | string[];
  offset?: V3;
  /** Falloff radius: weight = 1 − smoothstep(distance / radius). */
  radius: number;
  /** Per-axis stretch of the falloff, e.g. [1.4, 0.8, 1] = wider than tall. */
  shape?: V3;
  /** Displacement at full weight. */
  move: V3;
  /** Also add the mirror image (landmark _L↔_R, x of offset and move negated). */
  mirror?: boolean;
  /** Only act on the upper or lower lip side of the lip line (see MORPHS.lipBand). */
  lip?: 'upper' | 'lower';
}

export interface MorphTargetDef {
  strength: number;
  radius: number;
  handles: MorphHandle[];
}

export interface JawDef {
  /** Multiplies the angle. */
  strength: number;
  /** Multiplies the soft bands (outside the lip gap, neck falloff). */
  radius: number;
  /** Jaw rotation at jawOpen = 1, degrees, about the jawPivot_R→jawPivot_L axis. */
  angle: number;
  pivotOffset: V3;
  /**
   * The neck starts below a plane through the pivot axis and a point this far below the chin;
   * under it the weight fades over neckFalloff. The margin keeps the underside of the chin
   * (where the beard is rooted) moving fully, so the beard does not tear away from it.
   */
  chinMargin: number;
  neckFalloff: number;
  /** Behind the pivot (ears, back of the head), weight fades over this. */
  backFalloff: number;
  /** Beard: below the chin it blends from rotating to following the chin's movement. */
  beardFollow: number;
  beardBlend: number;
}

export interface MorphDefs {
  targets: Record<string, MorphTargetDef>;
  jaw: JawDef;
  /**
   * Upper/lower lip split used by jawOpen and lip-gated handles. Inside the lip gap the split is
   * sharp (the lips are cut apart there); outside the mouth corners it blends over outerUp/Down.
   */
  lipBand: { gapUp: number; gapDown: number; outerUp: number; outerDown: number };
  /** Robe/shoulders: below collarFront (fading in over `collarMargin` above it) and not beard. */
  fixed: { collarMargin: number };
  /** Beard detection: a vertex below the chin is beard if another front-facing surface lies
   *  behind it within `layerDepth`, and it connects to the chin through such vertices. */
  beard: { layerDepth: number; seedRadius: number };
}

export const MORPHS: MorphDefs = {
  targets: {
    browDown: {
      strength: 1,
      radius: 1,
      handles: [
        { at: 'browInner_L', mirror: true, radius: 0.4, shape: [1.3, 0.8, 1], move: [-0.05, -0.1, 0.02] },
        { at: 'browOuter_L', mirror: true, radius: 0.4, shape: [1.3, 0.8, 1], move: [0, -0.06, 0] },
        { at: ['browInner_L', 'browInner_R'], offset: [0, 0.06, 0], radius: 0.3, move: [0, -0.04, 0.03] },
      ],
    },
    browInnerUp: {
      strength: 1,
      radius: 1,
      handles: [
        { at: 'browInner_L', mirror: true, radius: 0.4, shape: [1.3, 0.8, 1], move: [0, 0.12, 0] },
        { at: ['browInner_L', 'browInner_R'], offset: [0, 0.25, 0], radius: 0.5, move: [0, 0.04, 0] },
      ],
    },
    browOuterUpLeft: {
      strength: 1,
      radius: 1,
      handles: [
        { at: 'browOuter_L', radius: 0.45, shape: [1.2, 0.8, 1], move: [0, 0.13, 0] },
        { at: 'browInner_L', radius: 0.35, move: [0, 0.03, 0] },
      ],
    },
    // Eye targets: the eyelid shells do the main work; these are the skin helpers around them.
    eyeWide: {
      strength: 1,
      radius: 1,
      handles: [
        { at: 'browInner_L', mirror: true, radius: 0.4, shape: [1.3, 0.8, 1], move: [0, 0.05, 0] },
        { at: 'browOuter_L', mirror: true, radius: 0.4, shape: [1.3, 0.8, 1], move: [0, 0.05, 0] },
      ],
    },
    eyeSquint: {
      strength: 1,
      radius: 1,
      handles: [
        { at: 'eye_L', mirror: true, offset: [0, -0.35, 0], radius: 0.35, shape: [1.4, 0.8, 1], move: [0, 0.06, 0.02] },
        { at: 'browOuter_L', mirror: true, radius: 0.35, move: [0, -0.03, 0] },
      ],
    },
    eyeBlink: {
      strength: 1,
      radius: 1,
      handles: [
        { at: 'eye_L', mirror: true, offset: [0, -0.35, 0], radius: 0.3, shape: [1.4, 0.8, 1], move: [0, 0.025, 0] },
        { at: 'browInner_L', mirror: true, radius: 0.35, move: [0, -0.02, 0] },
      ],
    },
    mouthFrown: {
      strength: 1,
      radius: 1,
      handles: [
        { at: 'mouthCorner_L', mirror: true, radius: 0.4, move: [0.01, -0.1, -0.01] },
        { at: 'chin', radius: 0.45, shape: [1.5, 1, 1], move: [0, 0.03, 0.02] },
      ],
    },
    mouthSmile: {
      strength: 1,
      radius: 1,
      handles: [
        { at: 'mouthCorner_L', mirror: true, radius: 0.45, move: [0.05, 0.09, -0.04] },
        { at: 'cheek_L', mirror: true, radius: 0.45, move: [0.01, 0.05, 0.03] },
      ],
    },
    mouthPress: {
      strength: 1,
      radius: 1,
      handles: [
        { at: 'upperLip', lip: 'upper', radius: 0.35, shape: [2.2, 0.8, 1], move: [0, -0.035, -0.01] },
        { at: 'lowerLip', lip: 'lower', radius: 0.35, shape: [2.2, 0.8, 1], move: [0, 0.04, -0.01] },
        { at: 'mouthCorner_L', mirror: true, radius: 0.25, move: [-0.02, 0, 0] },
      ],
    },
    noseSneer: {
      strength: 1,
      radius: 1,
      handles: [
        { at: 'noseTip', mirror: true, offset: [0.2, -0.05, -0.15], radius: 0.25, move: [0, 0.06, 0] },
        { at: 'upperLip', lip: 'upper', radius: 0.3, shape: [1.6, 1, 1], move: [0, 0.03, 0] },
        { at: 'browInner_L', mirror: true, radius: 0.3, move: [0.02, -0.03, 0] },
      ],
    },
  },
  jaw: {
    strength: 1,
    radius: 1,
    angle: 18,
    pivotOffset: [0, 0, 0],
    chinMargin: 0.5,
    neckFalloff: 0.3,
    backFalloff: 0.4,
    beardFollow: 0.85,
    beardBlend: 0.6,
  },
  lipBand: { gapUp: 0.005, gapDown: 0.005, outerUp: 0.1, outerDown: 0.35 },
  fixed: { collarMargin: 0.15 },
  beard: { layerDepth: 2.5, seedRadius: 0.8 },
};

/** The core expression list (debug sliders, stage E mapping). jawOpen is built by rotation. */
export const CORE_EXPRESSIONS = [
  'browDown',
  'browInnerUp',
  'browOuterUpLeft',
  'eyeWide',
  'eyeSquint',
  'eyeBlink',
  'jawOpen',
  'mouthFrown',
  'mouthSmile',
  'mouthPress',
  'noseSneer',
];
