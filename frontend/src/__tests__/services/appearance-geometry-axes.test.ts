import * as THREE from 'three';
import { DiagramElement } from '../../models/types';
import { appearanceService } from '../../services/diagram/appearance.service';

jest.mock('three/examples/jsm/loaders/GLTFLoader', () => ({
  GLTFLoader: jest.fn().mockImplementation(() => ({ load: jest.fn() })),
}));

const makeElement = (shape: string): DiagramElement => ({
  id: `element-${shape}`,
  type: 'node',
  modelElementId: 'metaclass-1',
  x: 0,
  y: 0,
  width: 120,
  height: 80,
  style: {
    name: shape,
    widthMm: 600,
    heightMm: 900,
    depthMm: 300,
    appearance: JSON.stringify({
      type: shape,
      shape,
      color: '#4287f5',
      fillColor: '#4287f5',
      strokeColor: '#000000',
      strokeWidth: 1,
    }),
  },
});

const geometrySize = (shape: string): THREE.Vector3 => {
  const geometry = appearanceService.getGeometry(makeElement(shape));
  geometry.computeBoundingBox();
  const size = geometry.boundingBox!.getSize(new THREE.Vector3());
  geometry.dispose();
  return size;
};

describe('3D fallback geometry axis mapping', () => {
  it('maps persisted X/Y/Z extents to Three X/Z/Y for boxes', () => {
    const size = geometrySize('rectangle');

    expect(size.x).toBeCloseTo(600);
    expect(size.y).toBeCloseTo(300);
    expect(size.z).toBeCloseTo(900);
  });

  it('uses the same mapping for extruded profile shapes', () => {
    const size = geometrySize('triangle');

    expect(size.x).toBeCloseTo(600);
    expect(size.y).toBeCloseTo(300);
    expect(size.z).toBeCloseTo(900);
  });
});
