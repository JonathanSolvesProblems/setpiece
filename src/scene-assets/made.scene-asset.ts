/**
 * A place on the set for a piece the set designer makes: an empty stand-in until a piece is made into it.
 * Its one mesh takes the made piece's shape (src/made-shapes.ts); its finish is in the shape's own colours,
 * over bare wood's grain. Every slot shares the one material.
 */
import { BoxGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from '@iwsdk/core';

const finish = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.72 });

function madeSlot(): Group {
  const g = new Group();
  g.name = 'Made';
  const stand = new BoxGeometry(0.02, 0.02, 0.02).translate(0, 0.01, 0);
  const colours = new Float32Array(stand.attributes.position.count * 3);
  for (let i = 0; i < colours.length; i += 3) colours.set([0.77, 0.63, 0.48], i);
  stand.setAttribute('color', new Float32BufferAttribute(colours, 3));
  const body = new Mesh(stand, finish);
  body.name = 'MadeBody';
  g.add(body);
  return g;
}

export const madeSlotModel = madeSlot();
