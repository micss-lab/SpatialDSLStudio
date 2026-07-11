import { act, renderHook } from '@testing-library/react';
import { useProjectManagement } from '../../components/codegeneration/hooks/useProjectManagement';
import { codeGenerationService } from '../../services/codegeneration';

jest.mock('../../services/codegeneration', () => ({
  codeGenerationService: {
    importProject: jest.fn(),
    getAllProjects: jest.fn(),
  },
}));

const importProject = codeGenerationService.importProject as jest.Mock;
const getAllProjects = codeGenerationService.getAllProjects as jest.Mock;

const makeFile = (content: string): File => ({
  text: () => Promise.resolve(content),
} as unknown as File);

const project = (id: string, isExample = false) => ({
  id,
  name: `Project ${id}`,
  description: '',
  targetMetamodelId: 'metamodel-1',
  templates: [],
  createdAt: 1,
  updatedAt: 1,
  isExample,
});

describe('useProjectManagement.handleImportProject', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    importProject.mockReset();
    getAllProjects.mockReset();
    alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('imports a single project object and selects it', async () => {
    importProject.mockReturnValue(project('imported-1'));
    getAllProjects.mockReturnValue([project('imported-1'), project('ex-1', true)]);

    const { result } = renderHook(() => useProjectManagement());
    await act(async () => {
      await result.current.handleImportProject(makeFile(JSON.stringify(project('imported-1'))));
    });

    expect(importProject).toHaveBeenCalledTimes(1);
    expect(result.current.selectedProject).toBe('imported-1');
    expect(result.current.projects.map(p => p.id)).toEqual(['imported-1']);
    expect(result.current.exampleProjects.map(p => p.id)).toEqual(['ex-1']);
  });

  it('imports a top-level array of projects', async () => {
    importProject.mockImplementation((p: any) => project(p.id));
    getAllProjects.mockReturnValue([]);

    const { result } = renderHook(() => useProjectManagement());
    await act(async () => {
      await result.current.handleImportProject(
        makeFile(JSON.stringify([project('a'), project('b')]))
      );
    });

    expect(importProject).toHaveBeenCalledTimes(2);
    expect(result.current.selectedProject).toBe('a');
  });

  it('imports from a { projects: [...] } wrapper', async () => {
    importProject.mockImplementation((p: any) => project(p.id));
    getAllProjects.mockReturnValue([]);

    const { result } = renderHook(() => useProjectManagement());
    await act(async () => {
      await result.current.handleImportProject(
        makeFile(JSON.stringify({ projects: [project('x'), project('y')] }))
      );
    });

    expect(importProject).toHaveBeenCalledTimes(2);
    expect(result.current.selectedProject).toBe('x');
  });

  it('alerts and does not throw on invalid JSON', async () => {
    const { result } = renderHook(() => useProjectManagement());
    await act(async () => {
      await result.current.handleImportProject(makeFile('not json'));
    });

    expect(importProject).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalled();
  });

  it('alerts when importProject rejects the payload', async () => {
    importProject.mockImplementation(() => {
      throw new Error('Imported project is missing a valid name');
    });

    const { result } = renderHook(() => useProjectManagement());
    await act(async () => {
      await result.current.handleImportProject(makeFile(JSON.stringify({ bad: true })));
    });

    expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining('Imported project is missing a valid name')
    );
  });
});
