import { JSConstraint, Metamodel, Model } from '../../models/types';
import smartWarehouseMetamodelJson from '../../examples/data/smart-warehouse-metamodel.json';
import smartWarehouseModelJson from '../../examples/data/smart-warehouse-model.json';
import { jsService } from '../../services/constraint';

describe('Smart Warehouse validation sample', () => {
  it('contains a deliberate low-battery robot that fails the authored JavaScript constraint', () => {
    const metamodel = smartWarehouseMetamodelJson as unknown as Metamodel;
    const model = smartWarehouseModelJson as unknown as Model;
    const robotClass = metamodel.classes.find(candidate => candidate.name === 'MobileRobot')!;
    const constraint = robotClass.constraints?.find(
      candidate => candidate.id === 'constraint-mobile-robot-battery-reserve'
    ) as JSConstraint;
    const healthyRobot = model.elements.find(candidate => candidate.id.endsWith('0002'))!;
    const lowBatteryRobot = model.elements.find(candidate => candidate.id.endsWith('0003'))!;

    expect(jsService.evaluateJSConstraint(constraint, healthyRobot, model, metamodel).valid).toBe(true);
    expect(jsService.evaluateJSConstraint(constraint, lowBatteryRobot, model, metamodel)).toEqual(
      expect.objectContaining({
        valid: false,
        issues: [expect.objectContaining({
          elementId: lowBatteryRobot.id,
          constraintId: constraint.id,
          severity: 'warning',
        })],
      })
    );
  });

  it('keeps airborne and landed drones at canonical elevations and satisfies 3D constraints', () => {
    const metamodel = smartWarehouseMetamodelJson as unknown as Metamodel;
    const model = smartWarehouseModelJson as unknown as Model;
    const droneClass = metamodel.classes.find(candidate => candidate.name === 'InspectionDrone')!;
    const airborne = model.elements.find(candidate => candidate.style?.name === 'Inspection Drone Alpha')!;
    const landed = model.elements.find(candidate => candidate.style?.name === 'Inspection Drone Beta')!;

    expect(airborne.presentation?.position3D?.z).toBe(4500);
    expect(landed.presentation?.position3D?.z).toBe(0);
    expect(droneClass.constraints).toHaveLength(3);

    for (const constraint of droneClass.constraints as JSConstraint[]) {
      expect(jsService.evaluateJSConstraint(constraint, airborne, model, metamodel).valid).toBe(true);
      expect(jsService.evaluateJSConstraint(constraint, landed, model, metamodel).valid).toBe(true);
    }
  });

  it('backfills z = 0 on every existing physical warehouse element', () => {
    const model = smartWarehouseModelJson as unknown as Model;
    const spatialElements = model.elements.filter(element => element.presentation?.position3D);

    expect(spatialElements.length).toBeGreaterThan(0);
    spatialElements.forEach(element => {
      expect(Number.isFinite(element.presentation!.position3D!.z)).toBe(true);
    });
  });
});
