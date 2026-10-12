import { Metamodel, Model, ModelElement } from '../../shared/types';

/** Deterministic 32-bit PRNG (mulberry32). Same seed, same sequence on every platform. */
export const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Grid pitch. Larger than the longest rotated footprint, so normal cells never conflict. */
export const CELL_MM = 8000;

/** Probability that a cell deliberately violates one rule; about 5 percent of elements end up involved. */
export const VIOLATION_CELL_PROBABILITY = 0.035;

type ViolationKind = 'overlap' | 'aisle' | 'stranded-charger' | 'drone-over-rack';

export interface SyntheticModel {
  model: Model;
  violatingElementIds: Set<string>;
  violationCells: Record<ViolationKind, number>;
}

interface ElementSpec {
  className: string;
  size: [number, number, number];
  z?: number;
  style?: Record<string, unknown>;
}

const SPECS: Record<string, ElementSpec> = {
  Conveyor: { className: 'Conveyor', size: [6000, 2000, 3000], style: { InitialPositions: '', Produced: false } },
  StorageRack: { className: 'StorageRack', size: [2000, 1000, 2500], style: { InitialPositions: '', Capacity: 100, Levels: 4 } },
  Dock: { className: 'Dock', size: [5000, 3000, 500], style: { InitialPositions: '', GateNumber: 1 } },
  ChargingStation: { className: 'ChargingStation', size: [2000, 2000, 6000], style: { InitialPositions: '' } },
  PathwayArea: { className: 'PathwayArea', size: [6000, 4000, 200], style: { InitialPositions: '' } },
  OutputLocation: { className: 'OutputLocation', size: [6000, 3000, 3000], style: { InitialPositions: '' } },
  MobileRobot: {
    className: 'MobileRobot',
    size: [3000, 3000, 4000],
    style: { InitialPositions: '', Priority: 1, LowBatteryThreshold: 20, ChargeRate: 10, BatteryLevel: 100, HasProduct: false },
  },
  InspectionDrone: {
    className: 'InspectionDrone',
    size: [1200, 1200, 400],
    z: 4500,
    style: { Status: 'Airborne', BatteryLevel: 90, MaxAltitudeMm: 10000 },
  },
};

/** Normal cells, weighted. A charger cell holds a charging station on top of a pathway area. */
const NORMAL_CELLS: Array<[string, number]> = [
  ['Conveyor', 3],
  ['StorageRack', 3],
  ['Dock', 1],
  ['charger', 1],
  ['PathwayArea', 2],
  ['OutputLocation', 1],
  ['MobileRobot', 2],
  ['InspectionDrone', 1],
];

const VIOLATIONS: Array<[ViolationKind, number]> = [
  ['overlap', 2], // two conveyors 1000 mm apart: noOverlap among fixed equipment
  ['aisle', 2], // two racks with a 200 mm aisle: minimum aisle width
  ['stranded-charger', 1], // a charging station with no pathway: adjacency
  ['drone-over-rack', 1], // a drone 500 mm above a rack: 3D clearance
];

const pickWeighted = <T>(random: () => number, entries: Array<[T, number]>): T => {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return entries[entries.length - 1][0];
};

const yaw = (random: () => number): number => Math.round((random() * 360 - 180) * 1000) / 1000;

/**
 * Generate a Smart Warehouse model with exactly `count` placed elements on a
 * square grid, each with a random yaw. About 5 percent of the elements sit in
 * cells built to violate one of the example spatial rules.
 */
export function generateSyntheticWarehouse(metamodel: Metamodel, count: number, seed: number): SyntheticModel {
  const random = seededRandom(seed);
  const classIds = Object.fromEntries(metamodel.classes.map(metaClass => [metaClass.name, metaClass.id]));
  const elements: ModelElement[] = [];
  const violatingElementIds = new Set<string>();
  const violationCells: Record<ViolationKind, number> = {
    overlap: 0, aisle: 0, 'stranded-charger': 0, 'drone-over-rack': 0,
  };
  const chargingStationIds: string[] = [];
  const columns = Math.ceil(Math.sqrt(count));
  let cell = 0;

  const add = (spec: ElementSpec, x: number, y: number, rotationZ: number, z = spec.z ?? 0): ModelElement => {
    const index = elements.length;
    const id = `synthetic-${seed}-${String(index).padStart(6, '0')}`;
    const element: ModelElement = {
      id,
      modelElementId: classIds[spec.className],
      style: { name: `${spec.className} ${index}`, ...(spec.style || {}) },
      references: {},
      presentation: {
        position3D: { x, y, z },
        size3D: { widthMm: spec.size[0], heightMm: spec.size[1], depthMm: spec.size[2] },
        rotationZ,
      },
    };
    if (spec.className === 'ChargingStation') chargingStationIds.push(id);
    if (spec.className === 'MobileRobot') {
      // assignedStation is mandatory (1..1); the first cell is always a charger cell.
      element.references.assignedStation = chargingStationIds[chargingStationIds.length - 1];
    }
    elements.push(element);
    return element;
  };

  while (elements.length < count) {
    const cx = (cell % columns) * CELL_MM;
    const cy = Math.floor(cell / columns) * CELL_MM;
    const remaining = count - elements.length;
    cell += 1;

    if (cell === 1 && remaining >= 2) {
      add(SPECS.PathwayArea, cx, cy, yaw(random));
      add(SPECS.ChargingStation, cx, cy, yaw(random));
      continue;
    }

    if (remaining >= 2 && random() < VIOLATION_CELL_PROBABILITY) {
      const kind = pickWeighted(random, VIOLATIONS);
      violationCells[kind] += 1;
      const angle = yaw(random);
      const radians = (angle * Math.PI) / 180;
      const alongY = { x: -Math.sin(radians), y: Math.cos(radians) };
      let created: ModelElement[];
      if (kind === 'overlap') {
        created = [
          add(SPECS.Conveyor, cx, cy, angle),
          add(SPECS.Conveyor, cx + Math.cos(radians) * 1000, cy + Math.sin(radians) * 1000, angle),
        ];
      } else if (kind === 'aisle') {
        created = [
          add(SPECS.StorageRack, cx - alongY.x * 600, cy - alongY.y * 600, angle),
          add(SPECS.StorageRack, cx + alongY.x * 600, cy + alongY.y * 600, angle),
        ];
      } else if (kind === 'stranded-charger') {
        created = [add(SPECS.ChargingStation, cx, cy, angle)];
      } else {
        created = [add(SPECS.StorageRack, cx, cy, angle), add(SPECS.InspectionDrone, cx, cy, yaw(random), 3000)];
      }
      created.forEach(element => violatingElementIds.add(element.id));
      continue;
    }

    let kind = pickWeighted(random, NORMAL_CELLS);
    if (kind === 'charger' && remaining < 2) kind = 'Conveyor';
    if (kind === 'charger') {
      add(SPECS.PathwayArea, cx, cy, yaw(random));
      add(SPECS.ChargingStation, cx, cy, yaw(random));
    } else {
      add(SPECS[kind], cx, cy, yaw(random));
    }
  }

  return {
    model: {
      id: `synthetic-warehouse-${count}`,
      name: `Synthetic warehouse (${count} elements, seed ${seed})`,
      metamodelId: metamodel.id,
      conformsTo: metamodel.id,
      elements,
      connections: [],
    },
    violatingElementIds,
    violationCells,
  };
}
