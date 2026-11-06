/** The space a piece's own shape fills, in the piece's frame. Particles do not count: an effect has no body. */
import { Box3, Matrix4, Mesh, Object3D } from '@iwsdk/core';

export function localBounds(object: Object3D): Box3 {
  const box = new Box3();
  const part = new Box3();
  const toPiece = new Matrix4();
  object.updateWorldMatrix(true, true);
  const inverse = object.matrixWorld.clone().invert();
  object.traverse((child) => {
    if (!(child instanceof Mesh) || child.name === 'EffectParticles' || child.name === 'GrabVolume' || child.name === 'HoverRing') return;
    const geometry = child.geometry;
    if (geometry.boundingBox == null) geometry.computeBoundingBox();
    if (geometry.boundingBox == null) return;
    box.union(part.copy(geometry.boundingBox).applyMatrix4(toPiece.multiplyMatrices(inverse, child.matrixWorld)));
  });
  return box;
}
