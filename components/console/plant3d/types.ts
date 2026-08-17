/**
 * Canvas contract, shared by both platform builds.
 *
 * `PlantScene3DCanvas` exists twice — a real WebGL implementation in
 * `.web.tsx` and a null stub in `.tsx` so the native bundle never pulls in
 * three.js. Only one of those is ever bundled, but TypeScript resolves the
 * plain `.tsx`, which used to mean the props existed in two places and drifted
 * the moment either was edited. They live here instead, and both files import
 * them.
 */
import type { PlantScene3DConfig } from '../../../lib/plantScene3d';

/**
 * One asset's screen-space geometry for the frame, produced by the in-canvas
 * projector and consumed by the DOM label overlay.
 *
 * Lives here rather than beside the projector so the native stub can name it
 * without the types module reaching into a three.js component.
 */
export type ProjectedAsset = {
  id: string;
  /** Where the connector attaches, in CSS px relative to the canvas. */
  anchorX: number;
  anchorY: number;
  /** The model's screen-space footprint. Cards must not cover this. */
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
  /** Distance from the camera, for front-to-back placement priority. */
  distance: number;
  /** False when the asset is behind the camera or well off-screen. */
  onScreen: boolean;
};

/** A node of the model tree, flattened for the editor's part list. */
export type PartNode = { name: string; depth: number; kind: 'mesh' | 'group' | 'port' | 'anchor' };

/**
 * Which edges of the canvas are covered by chrome, in CSS px.
 *
 * The canvas is deliberately full-bleed — the 3D is the page's ground, not a
 * card on it — so the analytics column, the chart strip and the rails all float
 * *over* it. That means the middle of the canvas is not the middle of the map
 * the operator can actually see, and anything that centres the plant has to
 * work against this rectangle rather than the raw viewport: the label solver
 * for where cards may land, and the camera for where the yard sits.
 */
export type PlantViewInsets = { top: number; right: number; bottom: number; left: number };

/** Live facts painted onto a component's floating label. */
export type PlantCalloutFacts = {
  status: string;
  health?: number;
  machines?: number;
  machinesActive?: number;
  alarms?: number;
  telemetry?: string;
  /** kW. */
  power?: number;
  /** °C. */
  temperature?: number;
};

/**
 * Where the camera is asked to stand.
 *
 * Distinct from `PlantViewMode` in `lib/plantViewState`, which also models the
 * two transitional states the *dashboard* passes through. The camera only ever
 * has two goals; the transition between them is the rig's business.
 */
export type PlantCameraMode = 'overview' | 'immersive';

/** Imperative camera command, applied once per `id`. */
export type PlantCameraCommand = {
  id: number;
  kind: 'zoom-in' | 'zoom-out' | 'fit' | 'reset';
};

export type PlantScene3DCanvasProps = {
  scene: PlantScene3DConfig;
  /** Resolved status colour per component id (live telemetry for `auto`). */
  statusColors: Record<string, string>;
  dark: boolean;
  /** Editor mode: parts become clickable and the selection is outlined. */
  editable?: boolean;
  selectedComponentId?: string | null;
  selectedPart?: string | null;
  onSelectPart?: (componentId: string, partName: string) => void;
  onSelectComponent?: (componentId: string) => void;
  interactionMode?: 'parts' | 'connections';
  onPartsDiscovered?: (componentId: string, parts: PartNode[]) => void;
  callouts?: Record<string, PlantCalloutFacts>;

  // --- digital-twin mode (unused by the editor) ---
  viewMode?: PlantCameraMode;
  /** Dashboard/immersive selection: whole components, never parts. */
  onHoverComponent?: (componentId: string | null) => void;
  /** Fired when the pointer goes down on empty space rather than on an asset. */
  onBackgroundClick?: () => void;
  cameraCommand?: PlantCameraCommand | null;
  /** Suppresses the floating labels while the dashboard is mid-transition. */
  labelsVisible?: boolean;
  /**
   * Chrome covering the canvas edges. The camera frames and centres the plant
   * inside what is left, so the yard sits in the visible map area rather than
   * behind the panels. Omitted (the editor) means the whole canvas is visible.
   */
  insets?: PlantViewInsets;

  /**
   * Where asset labels are drawn.
   *
   * `html` pins a card to each anchor inside the scene — simple, and what the
   * editor wants, since it only ever has one component in focus. `projected`
   * emits screen-space geometry instead and lets the DOM overlay place the
   * cards, which is the only way to keep six of them off the models and off
   * each other.
   */
  labelMode?: 'html' | 'projected' | 'none';
  /** `projected` mode: per-frame screen geometry for the overlay. */
  onProjectLabels?: (assets: ProjectedAsset[]) => void;
};
