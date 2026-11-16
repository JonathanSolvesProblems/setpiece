/**
 * The monitor and the storyboard card stand at the back of the set, and a house or a truck in front of them hid the
 * board from the wearer ("the panel that shows frames was blocked in a house"). They rise so the card's foot clears
 * the tallest piece on the set, and come back down when it goes. Measured when the set changes (a piece added,
 * removed, sized or put down), never in a frame; the frames only ease the two toward where they should be.
 *
 * The same measuring finds a piece hanging past the slate's left edge, where the panel stands, and the panel moves
 * left by as much (src/controls.ts reads `aside`), so a wall beside it is never between the wearer and a button.
 */
import { createSystem, Object3D } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { localBounds } from './bounds.js';
import { assetByLabel } from './catalog.js';
import { Held, SetPiece, SetRole } from './set-components.js';

/** The card's foot stands this far above the tallest piece. */
const CLEAR = 0.03;
/** The most the two rise: beyond this the monitor is out of a seated wearer's view. */
const MOST = 0.36;
/** The slate's left edge, and the most the panel moves left for a piece hanging past it. */
const SLATE_LEFT = -0.3;
const ASIDE_MOST = 0.26;
/** How fast they rise and settle, as a share of what is left each second. */
const RATE = 5;

type Globals = { trayOn: Signal<string[]>; layoutChanged: Signal<number>; setsBuilt: Signal<number>; lifeSize: Signal<boolean>; designing: Signal<boolean> };

export class SightlineSystem extends createSystem({
  pieces: { required: [SetPiece] },
  held: { required: [SetPiece, Held] },
}) {
  private monitor: Object3D | null = null;
  private card: Object3D | null = null;
  private monitorY = 0;
  private cardY = 0;
  /** The card's foot above the slate as it was built. */
  private cardFoot = 0;
  private lift = 0;
  private wanted = 0;
  /** How far left of its usual place the panel should stand, metres: a piece hangs that far past the slate's left edge. */
  aside = 0;
  private stale = true;

  init(): void {
    const g = this.globals as unknown as Globals;
    const changed = (): void => {
      this.stale = true;
    };
    this.cleanupFuncs.push(
      g.trayOn.subscribe(changed),
      g.layoutChanged.subscribe(changed),
      g.setsBuilt.subscribe(changed),
      this.queries.held.subscribe('disqualify', changed),
    );
  }

  update(delta: number): void {
    if (this.monitor == null || this.card == null) {
      const monitor = this.scene.getObjectByName('Viewfinder');
      const card = this.scene.getObjectByName('StoryboardCard');
      if (monitor == null || card == null) return;
      this.monitor = monitor;
      this.card = card;
      this.monitorY = monitor.position.y;
      this.cardY = card.position.y;
      const tall = (card as Object3D & { geometry?: { parameters?: { height?: number } } }).geometry?.parameters?.height ?? 0.2;
      this.cardFoot = card.position.y - tall / 2;
    }
    const g = this.globals as unknown as Globals;
    // Measured once the designer has finished and nothing is in a hand: a piece on its way down is not where it will stand.
    if (this.stale && !g.designing.peek() && this.queries.held.entities.size === 0) {
      this.stale = false;
      this.wanted = this.measure();
    }
    if (g.lifeSize.peek()) return;
    const left = this.wanted - this.lift;
    if (Math.abs(left) < 0.0005) return;
    this.lift += left * Math.min(1, RATE * delta);
    this.monitor.position.y = this.monitorY + this.lift;
    this.card.position.y = this.cardY + this.lift;
  }

  /** How far the monitor and the card have to rise for the card's foot to clear the tallest piece on the set. */
  private measure(): number {
    let tallest = 0;
    let leftmost = 0;
    for (const piece of this.queries.pieces.entities) {
      const object = piece.object3D;
      const role = piece.getValue(SetPiece, 'role');
      if (object == null || !object.visible || role === SetRole.Stage || role === SetRole.Camera) continue;
      // Rain, smoke and fire are seen through.
      if (assetByLabel(String(piece.getValue(SetPiece, 'label')))?.shelf === 'Effects') continue;
      const box = localBounds(object);
      if (box.isEmpty()) continue;
      tallest = Math.max(tallest, object.position.y + box.max.y * object.scale.y);
      // The piece's left edge on the slate, turned as it stands: the farthest left of its box's four corners.
      const c = Math.cos(object.rotation.y) * object.scale.x;
      const s = Math.sin(object.rotation.y) * object.scale.x;
      leftmost = Math.min(
        leftmost,
        object.position.x + Math.min(box.min.x * c + box.min.z * s, box.min.x * c + box.max.z * s, box.max.x * c + box.min.z * s, box.max.x * c + box.max.z * s),
      );
    }
    this.aside = Math.max(0, Math.min(ASIDE_MOST, SLATE_LEFT - leftmost));
    return Math.max(0, Math.min(MOST, tallest + CLEAR - this.cardFoot));
  }
}
