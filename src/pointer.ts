/**
 * The walkthrough's pointer. A newcomer told to "pinch Talk" has to find Talk first, so while the walkthrough is on
 * a small yellow arrow bobs just above the thing the call sheet is asking for: Talk, Snap frame or Step inside on
 * the panel, or the piece to pick up. It follows the call sheet's own target, so it moves on when the step does,
 * and it goes when the walkthrough is skipped or done. Only in a session at the table; never in the lens.
 */
import { ConeGeometry, createSystem, Entity, Mesh, MeshBasicMaterial, Object3D, Quaternion, setWorldPosition, setWorldQuaternion, UIKitMLAsset, Vector3, VisibilityState } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { localBounds } from './bounds.js';
import { SetPiece } from './set-components.js';
import { ViewfinderSystem } from './viewfinder.js';

/** The panel's buttons the call sheet can ask for, by the target's name. */
const BUTTONS: Record<string, string> = { talk: 'btn-voice', snap: 'btn-snap', inside: 'btn-inside' };
/** Metres to one panel unit, as the panel is scaled in the scene (src/controls.ts measures the same). */
const PANEL_UNIT = 0.00101;
/** The arrow's tip rests this far above what it points at, bobs this far, this many times a second. */
const GAP = 0.012;
const BOB = 0.006;
const BOB_RATE = 2.2;
/** The arrow stands this far off the panel's face, toward the wearer, so it is never inside the panel. */
const OFF_PANEL = 0.012;
const ARROW_HEIGHT = 0.026;
/** A piece's height is measured again this often, in frames: it can be resized or changed while pointed at. */
const MEASURE_EVERY = 45;

type Globals = { coachTarget: Signal<string>; walkthrough: Signal<boolean>; lifeSize: Signal<boolean>; takeState: Signal<string> };
type Element = Object3D & { size?: { value?: number[] }; isVisible?: { peek(): boolean } };

export class WalkthroughPointerSystem extends createSystem({ pieces: { required: [SetPiece] } }) {
  private arrow!: Mesh;
  private at = new Vector3();
  private up = new Vector3();
  private out = new Vector3();
  private facing = new Quaternion();
  private level = new Quaternion();
  private panel: UIKitMLAsset | null = null;
  private panelObject: Object3D | null = null;
  /** What is pointed at now: the target's name, its button or its piece, and how high the piece stands. */
  private target = '';
  private button: Element | null = null;
  private piece: Entity | null = null;
  private pieceTop = 0;
  private sinceMeasured = 0;

  init(): void {
    // The cone's tip is turned to point down at what is asked for.
    const shape = new ConeGeometry(0.011, ARROW_HEIGHT, 4);
    shape.rotateX(Math.PI);
    const arrow = new Mesh(shape, new MeshBasicMaterial({ color: 0xd6e13c, depthTest: false }));
    arrow.name = 'WalkthroughPointer';
    arrow.renderOrder = 1001;
    arrow.frustumCulled = false;
    arrow.visible = false;
    this.arrow = arrow;
    this.world.createTransformEntity(arrow);
    this.world.getSystem(ViewfinderSystem)?.hideFromLens(arrow);
  }

  update(_delta: number, time: number): void {
    const g = this.globals as unknown as Globals;
    const wanted =
      this.world.visibilityState.peek() === VisibilityState.Visible && g.walkthrough.peek() && !g.lifeSize.peek() && g.takeState.peek() === 'idle' ? g.coachTarget.peek() : '';
    if (wanted !== this.target) this.aimAt(wanted);
    if (this.target === '') return;
    const bob = Math.abs(Math.sin(time * Math.PI * BOB_RATE)) * BOB;
    if (this.button != null) {
      const panel = this.panelObject;
      if (panel == null || !panel.visible || this.button.isVisible?.peek() === false) {
        this.arrow.visible = false;
        return;
      }
      // Above the button's top edge, along the panel's own up, and a little off its face toward the wearer.
      this.button.getWorldPosition(this.at);
      panel.getWorldQuaternion(this.facing);
      const half = ((this.button.size?.value?.[1] ?? 24) * PANEL_UNIT) / 2;
      this.up.set(0, 1, 0).applyQuaternion(this.facing);
      this.out.set(0, 0, 1).applyQuaternion(this.facing);
      this.at.addScaledVector(this.up, half + GAP + ARROW_HEIGHT / 2 + bob).addScaledVector(this.out, OFF_PANEL);
      setWorldPosition(this.arrow, this.at);
      setWorldQuaternion(this.arrow, this.facing);
      this.arrow.visible = true;
      return;
    }
    const object = this.piece?.object3D;
    if (object == null || !object.visible) {
      // The piece it pointed at went: the next of its kind is found on the next frame.
      this.arrow.visible = false;
      this.target = '';
      return;
    }
    if (++this.sinceMeasured >= MEASURE_EVERY) this.measure(object);
    object.getWorldPosition(this.at);
    this.at.y += this.pieceTop + GAP + ARROW_HEIGHT / 2 + bob;
    setWorldPosition(this.arrow, this.at);
    setWorldQuaternion(this.arrow, this.level);
    this.arrow.visible = true;
  }

  /** Finds what the call sheet now asks for: one of the panel's buttons, or the first piece of that kind on the set. */
  private aimAt(wanted: string): void {
    this.target = wanted;
    this.button = null;
    this.piece = null;
    this.arrow.visible = false;
    if (wanted === '') return;
    const id = BUTTONS[wanted];
    if (id != null) {
      this.panel ??= this.world.getSceneObject<UIKitMLAsset>('controls-panel') ?? null;
      this.panelObject ??= this.scene.getObjectByName('Controls Panel') ?? null;
      this.button = (this.panel?.getElementById(id) as Element | undefined) ?? null;
      if (this.button == null) this.target = '';
      return;
    }
    for (const piece of this.queries.pieces.entities) {
      if (piece.getValue(SetPiece, 'role') !== wanted || piece.object3D?.visible !== true) continue;
      this.piece = piece;
      this.measure(piece.object3D);
      return;
    }
    // Nothing of that kind is on the set: looked for again on the next frame.
    this.target = '';
  }

  /** How high the piece stands above its own foot, in the room's metres. */
  private measure(object: Object3D): void {
    this.sinceMeasured = 0;
    const box = localBounds(object);
    this.pieceTop = box.isEmpty() ? 0.05 : box.max.y * object.getWorldScale(this.out).y;
  }
}
