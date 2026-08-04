import { Diagram, ValidationIssue } from '../../models/types';
import { modelService } from '../../services/model';
import { metamodelService } from '../../services/metamodel';
import viewpointService from '../../services/viewpoint.service';
import { viewValidationService } from '../../services/diagram/view-validation.service';

jest.mock('../../services/model', () => ({
  modelService: { validateModel: jest.fn(), getModelById: jest.fn() },
}));
jest.mock('../../services/metamodel', () => ({
  metamodelService: { getMetamodelById: jest.fn() },
}));
jest.mock('../../services/viewpoint.service', () => ({
  __esModule: true,
  default: { resolveRepresentationDescription: jest.fn(() => ({})) },
}));

const diagram: Diagram = {
  id: 'diagram-1',
  name: 'Focused view',
  modelId: 'model-1',
  elements: [
    {
      id: 'view-node-1',
      type: 'node',
      modelElementId: 'class-robot',
      style: { linkedModelElementId: 'robot-1' },
    },
  ],
};

describe('viewValidationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (modelService.getModelById as jest.Mock).mockReturnValue(undefined);
    (viewpointService.resolveRepresentationDescription as jest.Mock).mockReturnValue({});
  });

  it('surfaces an OCL failure for a visible semantic element and filters hidden-element issues', () => {
    const visibleOclIssue: ValidationIssue = {
      severity: 'error',
      message: 'Battery invariant failed',
      elementId: 'robot-1',
      constraintId: 'ocl-battery-invariant',
    };
    (modelService.validateModel as jest.Mock).mockReturnValue({
      valid: false,
      issues: [
        visibleOclIssue,
        { severity: 'warning', message: 'Hidden issue', elementId: 'robot-hidden' },
        { severity: 'info', message: 'Model-wide note', elementId: 'model-1' },
      ],
    });

    const result = viewValidationService.validateDiagram(diagram);

    expect(result.issues).toEqual([
      visibleOclIssue,
      expect.objectContaining({ message: 'Model-wide note' }),
    ]);
    expect(viewValidationService.findElementForIssue(diagram, visibleOclIssue)?.id).toBe('view-node-1');
  });

  it('uses the highest issue severity when marking an element', () => {
    expect(viewValidationService.getElementSeverity(diagram, diagram.elements[0], [
      { severity: 'info', message: 'Info', elementId: 'robot-1' },
      { severity: 'warning', message: 'Warning', elementId: 'robot-1' },
      { severity: 'error', message: 'Error', elementId: 'robot-1' },
    ])).toBe('error');
  });

  it('warns without overwriting when an elevated element opens in a grounded representation', () => {
    (modelService.validateModel as jest.Mock).mockReturnValue({ valid: true, issues: [] });
    (modelService.getModelById as jest.Mock).mockReturnValue({
      id: 'model-1',
      conformsTo: 'metamodel-1',
      elements: [{
        id: 'robot-1',
        modelElementId: 'class-robot',
        style: { name: 'Elevated robot' },
        references: {},
        presentation: { position3D: { x: 100, y: 200, z: 4500 } },
      }],
    });
    (metamodelService.getMetamodelById as jest.Mock).mockReturnValue({
      id: 'metamodel-1',
      classes: [{
        id: 'class-robot',
        name: 'Robot',
        attributes: [],
        references: [],
        superTypes: [],
      }],
    });

    const result = viewValidationService.validateDiagram(diagram);

    expect(result.issues).toEqual([
      expect.objectContaining({
        severity: 'warning',
        elementId: 'robot-1',
        location: 'presentation.position3D.z',
        message: expect.stringContaining('4500 mm'),
      }),
    ]);
    expect((modelService.getModelById as jest.Mock).mock.results[0].value.elements[0]
      .presentation.position3D.z).toBe(4500);
  });
});
