import { createComponent, Types } from '@iwsdk/core';

export const SetRole = {
  Actor: 'actor',
  Creature: 'creature',
  Camera: 'camera',
  Stage: 'stage',
  Prop: 'prop',
} as const;

/**
 * A piece on the miniature stage. The stage is 1:10, so an eyeHeight of
 * 0.16 m is a 1.6 m eye line on the real set.
 */
export const SetPiece = createComponent('SetPiece', {
  role: { type: Types.Enum, enum: SetRole, default: SetRole.Actor },
  label: { type: Types.String, default: '' },
  eyeHeight: {
    type: Types.Float32,
    default: 0.16,
    min: 0,
    max: 1,
    step: 0.01,
    help: 'Eye height above the piece origin, in miniature metres',
  },
});

export const Placement = {
  Floating: 'floating',
  Table: 'table',
  Touch: 'touch',
  Manual: 'manual',
  Restored: 'restored',
} as const;

/** Where the stage sits, and whether its pose is saved between sessions. */
export const StageAnchor = createComponent('StageAnchor', {
  placement: { type: Types.Enum, enum: Placement, default: Placement.Floating },
  persist: { type: Types.Boolean, default: true },
});

export const Cue = {
  Pick: 'pick',
  Place: 'place',
} as const;

/** A sound the stage makes: a piece lifted off the slate, or set back down. */
export const SoundCue = createComponent('SoundCue', {
  cue: { type: Types.Enum, enum: Cue, default: Cue.Pick },
});

/** The shot camera. lensMm is a full-frame focal length; the viewfinder is a 16:9 crop. */
/** How far the camera head tilts on its tripod, up or down, in radians. */
export const CAMERA_TILT_LIMIT = 1.3;

export const ShotCamera = createComponent('ShotCamera', {
  lensMm: { type: Types.Float32, default: 35, min: 12, max: 200, step: 1 },
  tilt: {
    type: Types.Float32,
    default: 0,
    min: -CAMERA_TILT_LIMIT,
    max: CAMERA_TILT_LIMIT,
    step: 0.01,
    help: 'Tilt of the camera head in radians, up is positive',
  },
  aimed: {
    type: Types.Boolean,
    default: false,
    help: 'True once the tilt has been set by hand; until then the camera tilts itself at the nearest actor',
  },
});
