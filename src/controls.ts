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
const PANEL_OFFSET = new Vector3(-0.4, 0.3, -0.16);
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
  coachTarget: Signal<string>;
  takeState: Signal<string>;
  takeLength: Signal<number>;
  recordRequested: Signal<number>;
  playRequested: Signal<number>;
};
/** The tally's red: the record button wears it while a take is being recorded. */
const TALLY_RED = '#e0352b';
const CHALK = '#f6f7ef';
/** While the call sheet asks for a frame, Snap frame flashes this many times a second. */
const SNAP_FLASH_RATE = 1.6;

/** Wires the Setpiece control panel to the shared signals the viewfinder reads. */
export class ControlsSystem extends createSystem({
  stages: { required: [SetPiece, StageAnchor] },
}) {
  private stage: Entity | null = null;
  private panelObject: Object3D | null = null;
  private panelPosition = new Vector3();
  private panelQuaternion = new Quaternion();
  private panelTurn = new Quaternion().setFromAxisAngle(UP, PANEL_YAW);
  private snapButton: { setProperties(properties: Record<string, unknown>): void } | null = null;
  private snapLit = false;

  /**
   * In the headset the panel travels with the set, so it is beside the slate
   * wherever the table turns out to be, and inside the same narrow field of view.
   * The page hides the panel and has its own controls.
   */
  update(_delta: number, time: number): void {
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) return;
    const lit =
      (this.globals as Globals).coachTarget.peek() === 'snap' && Math.floor(time * SNAP_FLASH_RATE * 2) % 2 === 0;
    if (lit !== this.snapLit) {
      this.snapLit = lit;
      this.snapButton?.setProperties({ backgroundColor: lit ? OPTIC_YELLOW : CHALK });
    }
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
    // The set is out of sight for the first moment of a session; so is its panel.
    panel.visible = stageObject.visible;
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

    // A take: Record starts and stops a pass, Play loops what has been recorded.
    const record = panel.getElementById<UIKit.Text>('btn-record');
    const play = panel.getElementById<UIKit.Text>('btn-play');
    const requestRecord = () => {
      g.recordRequested.value = g.recordRequested.value + 1;
    };
    const requestPlay = () => {
      g.playRequested.value = g.playRequested.value + 1;
    };
    record?.addEventListener('click', requestRecord);
    play?.addEventListener('click', requestPlay);
    const labelTake = () => {
      const state = g.takeState.peek();
      const has = g.takeLength.peek() > 0;
      const recording = state === 'recording';
      const playing = state === 'playing';
      record?.setProperties({
        text: recording ? 'Stop' : has ? 'Record over' : 'Record',
        borderColor: recording ? TALLY_RED : CHALK_HAZE,
      });
      play?.setProperties({
        display: has && !recording ? 'flex' : 'none',
        text: playing ? 'Stop' : 'Play',
        borderColor: playing ? OPTIC_YELLOW : CHALK_HAZE,
      });
    };
    this.cleanupFuncs.push(
      () => record?.removeEventListener('click', requestRecord),
      () => play?.removeEventListener('click', requestPlay),
      g.takeState.subscribe(labelTake),
      g.takeLength.subscribe(labelTake),
    );

    const snap = panel.getElementById('btn-snap');
    this.snapButton = snap ?? null;
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
