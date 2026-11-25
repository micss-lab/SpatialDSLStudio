import { act, renderHook } from '@testing-library/react';
import { useViewValidation } from '../../components/diagram/shared/hooks/useViewValidation';
import { Diagram } from '../../models/types';
import { diagramService, viewValidationService } from '../../services/diagram';

jest.mock('../../services/diagram', () => ({
  diagramService: { getDiagramById: jest.fn() },
  viewValidationService: { validateDiagram: jest.fn() },
}));

const diagram = { id: 'view-1', modelId: 'model-1', elements: [] } as unknown as Diagram;
const readDiagram = jest.mocked(diagramService.getDiagramById);
const validate = jest.mocked(viewValidationService.validateDiagram);
const change = (modelId: string) => window.dispatchEvent(new CustomEvent('model:changed', { detail: { modelId } }));

beforeEach(() => {
  jest.useFakeTimers();
  readDiagram.mockReturnValue(diagram);
  validate.mockClear();
  validate.mockReturnValue({ valid: true, issues: [] });
});

afterEach(() => jest.useRealTimers());

it('validates once after a drag and uses the latest diagram', () => {
  const { rerender, result } = renderHook(({ paused }) => useViewValidation(diagram, paused), {
    initialProps: { paused: false },
  });
  expect(validate).toHaveBeenCalledTimes(1);

  rerender({ paused: true });
  act(() => {
    change('model-1');
    change('model-1');
    jest.advanceTimersByTime(1000);
  });
  expect(validate).toHaveBeenCalledTimes(1);

  const latest = { ...diagram, name: 'Updated' };
  const issue = { severity: 'error' as const, message: 'Rack clearance' };
  readDiagram.mockReturnValue(latest);
  validate.mockReturnValue({ valid: false, issues: [issue] });
  rerender({ paused: false });
  act(() => { jest.advanceTimersByTime(300); });
  expect(validate).toHaveBeenCalledTimes(2);
  expect(validate).toHaveBeenLastCalledWith(latest);
  expect(result.current.issues).toEqual([issue]);
});

it('debounces matching model and view events and ignores other artifacts', () => {
  const { unmount } = renderHook(() => useViewValidation(diagram, false));
  act(() => {
    change('other-model');
    window.dispatchEvent(new CustomEvent('view:changed', { detail: { diagramId: 'other-view' } }));
    jest.advanceTimersByTime(500);
  });
  expect(validate).toHaveBeenCalledTimes(1);

  act(() => {
    change('model-1');
    jest.advanceTimersByTime(250);
    window.dispatchEvent(new CustomEvent('view:changed', { detail: { diagramId: 'view-1' } }));
    jest.advanceTimersByTime(299);
  });
  expect(validate).toHaveBeenCalledTimes(1);
  act(() => { jest.advanceTimersByTime(1); });
  expect(validate).toHaveBeenCalledTimes(2);

  act(() => { change('model-1'); });
  unmount();
  act(() => { jest.advanceTimersByTime(300); });
  expect(validate).toHaveBeenCalledTimes(2);
});
