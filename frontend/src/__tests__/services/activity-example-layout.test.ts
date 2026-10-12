import { Diagram, DiagramElement, Metamodel, Model, Viewpoint } from '../../models/types';
import { metamodelService } from '../../services/metamodel';
import { modelService } from '../../services/model';
import { viewProjectionService } from '../../services/diagram/view-projection.service';
import viewpointService from '../../services/viewpoint.service';
import { concreteSyntaxResolver } from '../../services/diagram/concrete-syntax.resolver';
import {
  Point2D,
  formatEdgeLabel,
  getEdgeEndpointPair,
  getPolylineMidpoint,
  getShapeGeometry,
} from '../../components/diagram/2d/utils/appearanceUtils';
import activityMetamodelFixture from '../../examples/data/activity-diagram-metamodel.json';
import activityModelFixture from '../../examples/data/activity-diagram-model.json';
import activityViewsFixture from '../../examples/data/activity-diagram-views.json';
import activityViewpointsFixture from '../../examples/data/activity-diagram-viewpoints.json';

// Geometry checks for the bundled activity views, computed the way the 2D
// editor draws them: clipped endpoints, stored bend points, edge labels from
// the notation's labelFormat, and node names below, inside, or hidden.

const activityMetamodel = activityMetamodelFixture as unknown as Metamodel;
const activityModel = activityModelFixture as unknown as Model;
const activityViewpoint = (activityViewpointsFixture as unknown as Viewpoint[])[0];
const representation = activityViewpoint.representationDescriptions[0];

type Segment = [Point2D, Point2D];

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const appearanceOf = (element: DiagramElement): Record<string, any> => (
  typeof element.style?.appearance === 'string' ? JSON.parse(element.style.appearance) : element.style?.appearance || {}
);

const cross = (o: Point2D, a: Point2D, b: Point2D): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Proper crossing: the segments intersect at a point interior to both. */
const segmentsCross = ([a, b]: Segment, [c, d]: Segment): boolean => {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
};

const segmentHitsBox = ([a, b]: Segment, box: Box): boolean => {
  // Liang-Barsky clipping against the box interior.
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const edges: Array<[number, number]> = [
    [-dx, a.x - box.minX], [dx, box.maxX - a.x], [-dy, a.y - box.minY], [dy, box.maxY - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q <= 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 >= t1) return false;
    }
  }
  return true;
};

const shrink = (box: Box, by: number): Box => ({
  minX: box.minX + by, minY: box.minY + by, maxX: box.maxX - by, maxY: box.maxY - by,
});

const materialize = (view: Diagram) => {
  jest.spyOn(modelService, 'getModelById').mockReturnValue(activityModel);
  jest.spyOn(metamodelService, 'getMetamodelById').mockReturnValue(activityMetamodel);
  jest.spyOn(viewpointService, 'resolveRepresentationDescription').mockReturnValue({
    viewpoint: activityViewpoint,
    representationDescription: representation,
  });
  const diagram = viewProjectionService.materializeDiagram(view);
  const nodes = diagram.elements.filter(element => element.type === 'node');
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const edges = diagram.elements.filter(element => element.type === 'edge').map(edge => {
    const source = nodesById.get(edge.sourceId!)!;
    const target = nodesById.get(edge.targetId!)!;
    const bends = Array.isArray(edge.points) && edge.points.length > 2 ? edge.points.slice(1, -1) : [];
    const endpoints = getEdgeEndpointPair(source, target, false, false, {
      sourceShape: appearanceOf(source).shape,
      targetShape: appearanceOf(target).shape,
      sourceToward: bends[0],
      targetToward: bends[bends.length - 1],
    });
    const points = [endpoints.source, ...bends, endpoints.target];
    const segments = points.slice(1).map((point, index) => [points[index], point] as Segment);
    const syntax = concreteSyntaxResolver.resolveEdge(edge, activityMetamodel, representation);
    const label = formatEdgeLabel(syntax.labelFormat, edge.style?.name, edge.referenceAttributes);
    return { edge, source, target, points, segments, label };
  });
  return { nodes, edges };
};

const nodeBox = (node: DiagramElement): Box => ({
  minX: node.x!, minY: node.y!, maxX: node.x! + node.width!, maxY: node.y! + node.height!,
});

const belowLabelBox = (node: DiagramElement): Box => {
  const name = String(node.style?.name || '');
  const width = name.length * 7;
  const centerX = node.x! + node.width! / 2;
  return { minX: centerX - width / 2, maxX: centerX + width / 2, minY: node.y! + node.height! + 5, maxY: node.y! + node.height! + 20 };
};

const edgeLabelBox = (label: string, at: Point2D): Box => {
  const width = label.length * 6 + 4;
  return { minX: at.x - width / 2, maxX: at.x + width / 2, minY: at.y - 9, maxY: at.y + 6 };
};

describe.each((activityViewsFixture as unknown as Diagram[]).map(view => [view.name, view] as const))(
  'activity example view %s',
  (_name, view) => {
    afterEach(() => jest.restoreAllMocks());

    it('has no edge crossings', () => {
      const { edges } = materialize(view);
      expect(edges.length).toBeGreaterThan(5);
      const crossings: string[] = [];
      edges.forEach((first, i) => edges.slice(i + 1).forEach(second => {
        first.segments.forEach(a => second.segments.forEach(b => {
          if (segmentsCross(a, b)) crossings.push(`${first.edge.id} x ${second.edge.id}`);
        }));
      }));
      expect(crossings).toEqual([]);
    });

    it('routes edges around every node they do not connect', () => {
      const { nodes, edges } = materialize(view);
      const hits: string[] = [];
      edges.forEach(({ edge, source, target, segments }) => {
        nodes
          .filter(node => !node.containerMappingId)
          .filter(node => node.id !== source.id && node.id !== target.id)
          .forEach(node => {
            if (segments.some(segment => segmentHitsBox(segment, shrink(nodeBox(node), 1)))) {
              hits.push(`${edge.id} through ${node.style?.name}`);
            }
          });
      });
      expect(hits).toEqual([]);
    });

    it('keeps edge labels and node names clear of other edges', () => {
      const { nodes, edges } = materialize(view);
      const overlaps: string[] = [];
      edges.filter(item => item.label).forEach(item => {
        const box = edgeLabelBox(item.label!, getPolylineMidpoint(item.points));
        edges.filter(other => other !== item).forEach(other => {
          if (other.segments.some(segment => segmentHitsBox(segment, box))) {
            overlaps.push(`label ${item.label} over ${other.edge.id}`);
          }
        });
      });
      nodes
        .filter(node => !node.containerMappingId && (appearanceOf(node).labelPosition || 'below') === 'below')
        .forEach(node => {
          const box = belowLabelBox(node);
          edges.forEach(item => {
            if (item.segments.some(segment => segmentHitsBox(segment, box))) {
              overlaps.push(`name of ${node.style?.name} under ${item.edge.id}`);
            }
          });
        });
      expect(overlaps).toEqual([]);
    });

    it('shows only guard labels on flows and draws fork and join as vertical bars', () => {
      const { nodes, edges } = materialize(view);
      const labels = edges.map(item => item.label).filter(Boolean);
      expect(labels.every(label => /^\[.+\]$/.test(label!) || label === 'invokes')).toBe(true);
      expect(labels).toEqual(expect.arrayContaining(['[in stock]']));

      const bars = nodes.filter(node => ['Fork', 'Join'].includes(String(node.style?.name)));
      expect(bars).toHaveLength(2);
      bars.forEach(bar => {
        expect(bar.height!).toBeGreaterThan(bar.width! * 5);
        expect(appearanceOf(bar)).toEqual(expect.objectContaining({ fillColor: '#000000', labelPosition: 'hidden' }));
      });
      const decision = nodes.find(node => node.style?.name === 'In Stock?')!;
      expect(appearanceOf(decision).shape).toBe('diamond');
    });

    it('keeps a consistent left-to-right flow direction', () => {
      const { edges } = materialize(view);
      const backwards = edges
        .filter(item => item.edge.style?.name !== 'invokes')
        .filter(item => {
          const source = getShapeGeometry(item.source, appearanceOf(item.source).shape).center;
          const target = getShapeGeometry(item.target, appearanceOf(item.target).shape).center;
          return target.x <= source.x;
        })
        .map(item => item.edge.id);
      expect(backwards).toEqual([]);
    });
  }
);
