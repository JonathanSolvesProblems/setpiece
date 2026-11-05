import {
  createSystem,
  Entity,
  Object3D,
  Quaternion,
  setWorldPosition,
  setWorldQuaternion,
  UIKit,
  UIKitMLAsset,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { StageStatus } from './placement.js';
import { SetPiece, StageAnchor } from './set-components.js';

/**
 * Where the panel sits relative to the stage, as the scene authors it: left of
 * the slate, a little above it, turned in toward the viewer.
 */
const PANEL_OFFSET = new Vector3(-0.46, 0.32, -0.07);
const PANEL_YAW = (34 * Math.PI) / 180;
const UP = new Vector3(0, 1, 0);

const LENSES = [24, 35, 50, 85];
const BOARD_SLOTS = 6;
// Optic yellow marks the selected lens and a stage that is good to go (charter law 7).
const OPTIC_YELLOW = '#d6e13c';
const SLATE = '#3f4044';
const CHALK_HAZE = '#6f6c6b';
const PLACED_STATUSES = new Set<string>([
  StageStatus.Table,
  StageStatus.Touch,
  StageStatus.Restored,
  StageStatus.Manual,
]);

type Globals = {
  lensMm: Signal<number>;
  snapRequested: Signal<number>;
  eyelineText: Signal<string[]>;
  shotList: Signal<string[]>;
  stageStatus: Signal<string>;
  resetStageRequested: Signal<number>;
  newBoardRequested: Signal<number>;
};

/** Wires the Setpiece control panel to the shared signals the viewfinder reads. */
export class ControlsSystem extends createSystem({
  stages: { required: [SetPiece, StageAnchor] },
}) {
  private stage: Entity | null = null;
  private panelObject: Object3D | null = null;
  private panelPosition = new Vector3();
  private panelQuaternion = new Quaternion();
  private panelTurn = new Quaternion().setFromAxisAngle(UP, PANEL_YAW);

  /**
   * In the headset the panel travels with the set, so it is beside the slate
   * wherever the table turns out to be, and inside the same narrow field of view.
   * The page hides the panel and has its own controls.
   */
  update(): void {
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) return;
    const stageObject = this.stage?.object3D;
    if (stageObject == null) return;
    if (this.panelObject == null) this.panelObject = this.scene.getObjectByName('Controls Panel') ?? null;
    const panel = this.panelObject;
    if (panel == null) return;
    stageObject.updateWorldMatrix(true, false);
    this.panelPosition.copy(PANEL_OFFSET).applyMatrix4(stageObject.matrixWorld);
    stageObject.getWorldQuaternion(this.panelQuaternion).multiply(this.panelTurn);
    setWorldPosition(panel, this.panelPosition);
    setWorldQuaternion(panel, this.panelQuaternion);
  }

  init(): void {
    for (const stage of this.queries.stages.entities) this.stage = stage;
    this.cleanupFuncs.push(
      this.queries.stages.subscribe('qualify', (stage) => {
        this.stage = stage;
      }),
    );
    const panel = this.world.getSceneObject<UIKitMLAsset>('controls-panel');
    if (panel == null) return;
    const g = this.globals as Globals;
    // The whole panel belongs to the headset; the page has its own controls.
    const root = panel.getElementById('panel-root');
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        root?.setProperties({ display: state === VisibilityState.NonImmersive ? 'none' : 'flex' });
      }),
    );

    for (const mm of LENSES) {
      const button = panel.getElementById(`lens-${mm}`);
      if (button == null) continue;
      const pick = () => {
        g.lensMm.value = mm;
      };
      button.addEventListener('click', pick);
      this.cleanupFuncs.push(() => button.removeEventListener('click', pick));
    }
    this.cleanupFuncs.push(
      g.lensMm.subscribe((mm) => {
        for (const l of LENSES) {
          panel.getElementById(`lens-${l}`)?.setProperties({
            borderColor: l === mm ? OPTIC_YELLOW : SLATE,
          });
        }
      }),
    );

    const stageStatus = panel.getElementById<UIKit.Text>('stage-status');
    this.cleanupFuncs.push(
      g.stageStatus.subscribe((text) => {
        stageStatus?.setProperties({
          text,
          borderColor: PLACED_STATUSES.has(text) ? OPTIC_YELLOW : CHALK_HAZE,
        });
      }),
    );
    const resetStage = panel.getElementById('btn-reset-stage');
    const requestReset = () => {
      g.resetStageRequested.value = g.resetStageRequested.value + 1;
    };
    resetStage?.addEventListener('click', requestReset);
    this.cleanupFuncs.push(() => resetStage?.removeEventListener('click', requestReset));

    const newBoard = panel.getElementById('btn-new-board');
    const requestNewBoard = () => {
      g.newBoardRequested.value = g.newBoardRequested.value + 1;
    };
    newBoard?.addEventListener('click', requestNewBoard);
    this.cleanupFuncs.push(() => newBoard?.removeEventListener('click', requestNewBoard));

    const snap = panel.getElementById('btn-snap');
    const requestSnap = () => {
      g.snapRequested.value = g.snapRequested.value + 1;
    };
    snap?.addEventListener('click', requestSnap);
    this.cleanupFuncs.push(() => snap?.removeEventListener('click', requestSnap));

    const eyeA = panel.getElementById<UIKit.Text>('eyeline-a');
    const eyeB = panel.getElementById<UIKit.Text>('eyeline-b');
    const boardCount = panel.getElementById<UIKit.Text>('board-count');
    this.cleanupFuncs.push(
      g.eyelineText.subscribe((lines) => {
        eyeA?.setProperties({ text: lines[0] ?? 'A: place the creature and an actor' });
        eyeB?.setProperties({ text: lines[1] ?? '' });
      }),
      // The card under the monitor is the shot list; the panel only keeps count.
      g.shotList.subscribe((lines) => {
        boardCount?.setProperties({
          text: lines.length === 0 ? 'No frames yet' : `${lines.length} of ${BOARD_SLOTS} frames, on the card`,
        });
      }),
    );

    // In the page, the wordmark and the Enter XR button already exist outside
    // the viewport, so the panel shows neither; in the headset it shows both.
    const title = panel.getElementById('panel-title');
    const xrButton = panel.getElementById('xr-button');
    const exitButton = panel.getElementById('exit-button');
    if (xrButton == null || exitButton == null) return;
    if (!this.world.xrEnabled) {
      xrButton.setProperties({ display: 'none' });
      exitButton.setProperties({ display: 'none' });
      title?.setProperties({ display: 'none' });
      return;
    }
    const launchXR = () => this.world.launchXR();
    const exitXR = () => this.world.exitXR();
    xrButton.addEventListener('click', launchXR);
    exitButton.addEventListener('click', exitXR);
    this.cleanupFuncs.push(
      () => xrButton.removeEventListener('click', launchXR),
      () => exitButton.removeEventListener('click', exitXR),
      this.world.visibilityState.subscribe((state) => {
        const is2D = state === VisibilityState.NonImmersive;
        title?.setProperties({ display: is2D ? 'none' : 'flex' });
        xrButton.setProperties({ display: 'none' });
        exitButton.setProperties({ display: is2D ? 'none' : 'flex' });
      }),
    );
  }
}
