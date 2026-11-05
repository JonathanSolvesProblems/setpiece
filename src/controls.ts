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
import { BRIEFS } from './briefs.js';
import { ASSETS, assetTitle, SHELF_SLOTS, SHELVES } from './catalog.js';
import type { Shelf } from './catalog.js';
import { LENSES, Rig, SENSORS } from './camera-formats.js';
import { StageStatus } from './placement.js';
import { SetPiece, StageAnchor } from './set-components.js';

/**
 * Where the panel sits relative to the stage, as the scene authors it: left of
 * the slate, a little above it, turned in toward the viewer.
 */
const PANEL_OFFSET = new Vector3(-0.4, 0.3, -0.16);
const PANEL_YAW = (34 * Math.PI) / 180;
const UP = new Vector3(0, 1, 0);

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
  roomScanRequested: Signal<number>;
  roomScanOffered: Signal<boolean>;
  recordRequested: Signal<number>;
  playRequested: Signal<number>;
  trayToggle: Signal<string>;
  trayOn: Signal<string[]>;
  removeSelected: Signal<number>;
  clearSet: Signal<number>;
  selectedIsActor: Signal<boolean>;
  poseRequested: Signal<number>;
  lookRequested: Signal<number>;
  castLine: Signal<string>;
  sensorIndex: Signal<number>;
  cameraRig: Signal<string>;
  briefIndex: Signal<number>;
  briefPrinted: Signal<number>;
  briefSkip: Signal<number>;
};
const TABS = ['shoot', 'camera', 'assets', 'briefs'] as const;
/** The tally's red: the record button wears it while a take is being recorded. */
const TALLY_RED = '#e0352b';
const CHALK = '#f6f7ef';
/** Rays prefer the higher order, whatever is nearer. Nothing else on the set is above the board's 5. */
const PANEL_ORDER = 10;
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
    // Pieces carry generous unseen grab zones. A ray that reaches the panel must
    // press the panel, even when one of those zones is nearer the hand. UIKit
    // sets this on every element itself, so it goes in as an inherited property.
    root?.setProperties({ pointerEventsOrder: PANEL_ORDER });
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

    // Offered only while the set floats and the headset can scan the room for a table.
    const findTable = panel.getElementById('btn-find-table');
    const requestScan = () => {
      g.roomScanRequested.value = g.roomScanRequested.value + 1;
    };
    findTable?.addEventListener('click', requestScan);
    this.cleanupFuncs.push(
      () => findTable?.removeEventListener('click', requestScan),
      g.roomScanOffered.subscribe((offered) => {
        findTable?.setProperties({ display: offered ? 'flex' : 'none' });
      }),
    );

    const newBoard = panel.getElementById('btn-new-board');
    const requestNewBoard = () => {
      g.newBoardRequested.value = g.newBoardRequested.value + 1;
    };
    newBoard?.addEventListener('click', requestNewBoard);
    this.cleanupFuncs.push(() => newBoard?.removeEventListener('click', requestNewBoard));

    // Tabs keep a panel this size on the table: one page shows, Snap frame is always there.
    const wire = (id: string, run: () => void): void => {
      const element = panel.getElementById(id);
      element?.addEventListener('click', run);
      this.cleanupFuncs.push(() => element?.removeEventListener('click', run));
    };
    const showTab = (tab: string): void => {
      for (const name of TABS) {
        panel.getElementById(`page-${name}`)?.setProperties({ display: name === tab ? 'flex' : 'none' });
        panel.getElementById(`tab-${name}`)?.setProperties({ borderColor: name === tab ? OPTIC_YELLOW : CHALK_HAZE });
      }
    };
    for (const name of TABS) wire(`tab-${name}`, () => showTab(name));
    showTab('shoot');

    // The camera kit.
    wire('btn-format', () => {
      g.sensorIndex.value = (g.sensorIndex.peek() + 1) % SENSORS.length;
    });
    wire('btn-rig', () => {
      g.cameraRig.value = g.cameraRig.peek() === Rig.Drone ? Rig.Tripod : Rig.Drone;
    });
    const format = panel.getElementById<UIKit.Text>('btn-format');
    const rig = panel.getElementById<UIKit.Text>('btn-rig');
    this.cleanupFuncs.push(
      g.sensorIndex.subscribe((i) => format?.setProperties({ text: SENSORS[i]?.name ?? '' })),
      g.cameraRig.subscribe((value) => rig?.setProperties({ text: value === Rig.Drone ? 'Drone' : 'Tripod' })),
    );

    // The asset library: one shelf shows; a slot adds its item, or takes it off the set.
    let shelf: Shelf = 'Cast';
    const onShelf = (): typeof ASSETS => ASSETS.filter((asset) => asset.shelf === shelf);
    const showShelf = (): void => {
      const items = onShelf();
      const on = g.trayOn.peek();
      for (const name of SHELVES) {
        panel.getElementById(`shelf-${name}`)?.setProperties({ borderColor: name === shelf ? OPTIC_YELLOW : SLATE });
      }
      for (let i = 0; i < SHELF_SLOTS; i++) {
        const item = items[i];
        panel.getElementById<UIKit.Text>(`asset-${i}`)?.setProperties({
          display: item ? 'flex' : 'none',
          text: item ? assetTitle(item.label) : '',
          borderColor: item && on.includes(item.label) ? OPTIC_YELLOW : CHALK_HAZE,
        });
      }
      panel.getElementById<UIKit.Text>('assets-count')?.setProperties({ text: `${on.length} on the set` });
    };
    for (const name of SHELVES) {
      wire(`shelf-${name}`, () => {
        shelf = name;
        showShelf();
      });
    }
    for (let i = 0; i < SHELF_SLOTS; i++) {
      wire(`asset-${i}`, () => {
        const item = onShelf()[i];
        if (item) g.trayToggle.value = item.label;
      });
    }
    wire('btn-remove', () => {
      g.removeSelected.value = g.removeSelected.peek() + 1;
    });
    wire('btn-clear-set', () => {
      g.clearSet.value = g.clearSet.peek() + 1;
    });
    wire('btn-pose', () => {
      g.poseRequested.value = g.poseRequested.peek() + 1;
    });
    wire('btn-look', () => {
      g.lookRequested.value = g.lookRequested.peek() + 1;
    });
    const cast = panel.getElementById<UIKit.Text>('cast-line');
    this.cleanupFuncs.push(
      g.trayOn.subscribe(showShelf),
      g.castLine.subscribe((line) => {
        const selected = line !== '';
        cast?.setProperties({ text: selected ? line : 'Pick up a piece to select it' });
        panel.getElementById('btn-remove')?.setProperties({ display: selected ? 'flex' : 'none' });
      }),
      g.selectedIsActor.subscribe((actor) => {
        panel.getElementById('btn-pose')?.setProperties({ display: actor ? 'flex' : 'none' });
        panel.getElementById('btn-look')?.setProperties({ display: actor ? 'flex' : 'none' });
      }),
    );

    // The shot briefs.
    wire('btn-skip-brief', () => {
      g.briefSkip.value = g.briefSkip.peek() + 1;
    });
    const briefCount = panel.getElementById<UIKit.Text>('brief-count');
    const briefTitle = panel.getElementById<UIKit.Text>('brief-title');
    const briefAsk = panel.getElementById<UIKit.Text>('brief-ask');
    const showBrief = (): void => {
      const index = g.briefIndex.peek();
      const brief = BRIEFS[index];
      const printed = g.briefPrinted.peek();
      briefCount?.setProperties({ text: `${printed} OF ${BRIEFS.length} PRINTED` });
      briefTitle?.setProperties({ text: brief ? brief.title : 'That is a wrap' });
      briefAsk?.setProperties({ text: brief ? brief.ask : 'Every shot on the list is printed.' });
    };
    this.cleanupFuncs.push(g.briefIndex.subscribe(showBrief), g.briefPrinted.subscribe(showBrief));

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
