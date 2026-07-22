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
});
