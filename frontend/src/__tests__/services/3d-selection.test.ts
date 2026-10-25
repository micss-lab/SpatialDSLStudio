import * as THREE from 'three';
import { isHitWithin } from '../../components/diagram/3d/utils/selection';

describe('isHitWithin', () => {
  it('accepts a mesh nested inside a loaded asset below the element group', () => {
    const group = new THREE.Group();
    const wrapper = new THREE.Group();
    const asset = new THREE.Group();
    const node = new THREE.Group();
    const mesh = new THREE.Mesh();
    node.add(mesh);
    asset.add(node);
    wrapper.add(asset);
    group.add(wrapper);

    expect(isHitWithin(mesh, [null, group])).toBe(true);
  });

  it('accepts the element mesh of a fallback shape and its children', () => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh();
    const outline = new THREE.LineSegments();
    mesh.add(outline);
    group.add(mesh);

    expect(isHitWithin(mesh, [mesh, group])).toBe(true);
    expect(isHitWithin(outline, [mesh, group])).toBe(true);
  });

  it('rejects objects of other elements and missing hits', () => {
    const group = new THREE.Group();
    const other = new THREE.Group();
    const otherMesh = new THREE.Mesh();
    other.add(otherMesh);

    expect(isHitWithin(otherMesh, [null, group])).toBe(false);
    expect(isHitWithin(undefined, [null, group])).toBe(false);
  });
});
