import { AssetType, defineAssets } from '@iwsdk/core';
import {
  explosionEffect,
  fireEffect,
  rainEffect,
  smokeEffect,
  sparksEffect,
  waterEffect,
} from './scene-assets/effects.scene-asset.js';
import { actorA, actorB, actorC, actorD, creature } from './scene-assets/figures.scene-asset.js';
import {
  carProp,
  crateProp,
  lampPostProp,
  motorbikeProp,
  treeProp,
  vanProp,
  wallProp,
} from './scene-assets/props.scene-asset.js';
import { cameraRigModel, stagePlate } from './scene-assets/rig.scene-asset.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
  stage: stagePlate,
  'actor-a': actorA,
  'actor-b': actorB,
  creature: creature,
  'camera-rig': cameraRigModel,
  'actor-c': actorC,
  'actor-d': actorD,
  car: carProp,
  van: vanProp,
  motorbike: motorbikeProp,
  wall: wallProp,
  'lamp-post': lampPostProp,
  tree: treeProp,
  crate: crateProp,
  fire: fireEffect,
  smoke: smokeEffect,
  water: waterEffect,
  explosion: explosionEffect,
  rain: rainEffect,
  sparks: sparksEffect,
  'controls-panel': {
    url: publicAssetUrl('ui/controls.uikitml'),
    type: AssetType.UIKitML,
    name: 'Controls Panel',
  },
  'chalk-haze': {
    url: publicAssetUrl('textures/chalk-haze.png'),
    type: AssetType.Texture,
    name: 'Chalk haze',
  },
  paper: {
    url: publicAssetUrl('textures/paper.png'),
    type: AssetType.Texture,
    name: 'Paper',
  },
});
