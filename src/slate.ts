/**
 * The slate's field strip. A clapper slate carries its fields down one edge in
 * stencil capitals with the values written beside them in chalk. This system
 * draws that strip for the stage (lens, shots, eyelines) into a canvas texture
 * and keeps it current. Fonts come from the page's font-face rules.
 */
import { CanvasTexture, createSystem, Entity, Mesh, MeshBasicMaterial, SRGBColorSpace } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { SetPiece, SetRole } from './set-components.js';

const W = 1400;
const H = 200;
const SLATE = '#3f4044';
const CHALK = '#f6f7ef';
const CHALK_DUST = '#c7c7b7';
const CHALK_HAZE = '#6f6c6b';
const STENCIL = '"Big Shoulders Stencil"';
const TEXT = '"Big Shoulders"';

type Globals = {
  lensMm: Signal<number>;
  shotList: Signal<string[]>;
  eyelineText: Signal<string[]>;
};

export class SlateSystem extends createSystem({
  pieces: { required: [SetPiece] },
}) {
  private canvas!: HTMLCanvasElement;
  private texture!: CanvasTexture;
  private strip: Mesh | null = null;
  private dirty = true;
  private fontsReady = false;

  init(): void {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    const g = this.globals as Globals;
    const mark = () => {
      this.dirty = true;
    };
    this.cleanupFuncs.push(g.lensMm.subscribe(mark), g.shotList.subscribe(mark), g.eyelineText.subscribe(mark), () =>
      this.texture.dispose(),
    );
    void document.fonts
      .load(`900 56px ${STENCIL}`)
      .then(() => document.fonts.load(`700 40px ${TEXT}`))
      .finally(() => {
        this.fontsReady = true;
        this.dirty = true;
      });
  }

  update(): void {
    if (this.strip == null) {
      const stage = this.findStage();
      const strip = stage?.object3D?.getObjectByName('Strip') as Mesh | undefined;
      if (strip == null) return;
      strip.material = new MeshBasicMaterial({ map: this.texture, toneMapped: false });
      this.strip = strip;
    }
    if (this.dirty && this.fontsReady) {
      this.dirty = false;
      this.draw();
    }
  }

  private findStage(): Entity | undefined {
    for (const piece of this.queries.pieces.entities) {
      if (piece.getValue(SetPiece, 'role') === SetRole.Stage) return piece;
    }
    return undefined;
  }

  /** One row along the back edge: the title at the left, then the fields. */
  private draw(): void {
    const ctx = this.canvas.getContext('2d');
    if (ctx == null) return;
    const g = this.globals as Globals;
    ctx.fillStyle = SLATE;
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = CHALK;
    ctx.font = `900 118px ${STENCIL}`;
    ctx.fillText('SETPIECE', 24, 142);
    let x = 560;
    const field = (label: string, value: string, width: number): void => {
      ctx.fillStyle = CHALK_HAZE;
      ctx.fillRect(x - 24, 36, 3, 128);
      ctx.fillStyle = CHALK_DUST;
      ctx.font = `700 34px ${STENCIL}`;
      ctx.fillText(label, x, 76);
      ctx.fillStyle = CHALK;
      ctx.font = `700 60px ${TEXT}`;
      ctx.fillText(value, x, 148);
      x += width;
    };
    field('LENS', `${g.lensMm.peek()} mm`, 230);
    const shots = g.shotList.peek().length;
    field('SHOTS', shots === 0 ? 'none' : `${shots} of 6`, 230);
    const eyelines = g.eyelineText.peek();
    for (let i = 0; i < 2; i++) {
      const line = eyelines[i];
      const deg = line ? /look (up|down) (\d+) deg/.exec(line) : null;
      field(i === 0 ? 'EYELINE A' : 'EYELINE B', deg ? `${deg[1]} ${deg[2]} deg` : 'no actor', 200);
    }
    this.texture.needsUpdate = true;
  }
}
