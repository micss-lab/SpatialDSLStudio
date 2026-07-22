import { Diagram, ValidationIssue } from '../../models/types';
import { modelService } from '../../services/model';
import { viewValidationService } from '../../services/diagram/view-validation.service';

jest.mock('../../services/model', () => ({
  modelService: { validateModel: jest.fn() },
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
  beforeEach(() => jest.clearAllMocks());

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
});
