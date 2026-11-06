/** The space a piece's own shape fills, in the piece's frame. Particles do not count: an effect has no body. */
import { Box3, Matrix4, Mesh, Object3D } from '@iwsdk/core';

export function localBounds(object: Object3D): Box3 {
  const box = new Box3();
  const part = new Box3();
  const toPiece = new Matrix4();
  object.updateWorldMatrix(true, true);
  const inverse = object.matrixWorld.clone().invert();
  // The piece itself may be off the set, and so hidden; what is hidden inside it (a fitting
  // that is not on, a pose that is not showing) is not part of its shape.
  const visit = (node: Object3D): void => {
    if (node !== object && !node.visible) return;
    if (node instanceof Mesh && node.name !== 'EffectParticles' && node.name !== 'GrabVolume' && node.name !== 'HoverRing') {
      const geometry = node.geometry;
      if (geometry.boundingBox == null) geometry.computeBoundingBox();
      if (geometry.boundingBox != null) {
        box.union(part.copy(geometry.boundingBox).applyMatrix4(toPiece.multiplyMatrices(inverse, node.matrixWorld)));
      }
    }
    for (let i = 0; i < node.children.length; i++) visit(node.children[i]);
  };
  visit(object);
  return box;
}
