import { mockReset } from 'jest-mock-extended';
import { prismaMock } from '../helpers/prisma.mock';
import { projectService } from '../../services/project.service';

beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
});

const projectRow = {
  id: 'project-uuid-1',
  name: 'Smart Warehouse',
  description: 'Warehouse project',
  status: 'ACTIVE' as const,
  ownerId: 'owner-uuid',
  owner: { email: 'owner@example.com' },
  memberships: [{ role: 'MODELER' as const }],
  _count: {
    memberships: 2,
    metamodels: 1,
    viewpoints: 1,
    models: 3,
    diagrams: 2,
    transformationRules: 1,
    codegenProjects: 1,
    testCases: 4,
    storedFiles: 2,
  },
  createdAt: new Date('2026-07-20T10:00:00.000Z'),
  updatedAt: new Date('2026-07-22T10:00:00.000Z'),
};

describe('ProjectService', () => {
  it('keeps DSL design separate while allowing Modelers to create Models and Views', () => {
    const capabilities = projectService.getCapabilities('MODELER');

    expect(capabilities).toEqual(expect.arrayContaining([
      'project.read',
      'model.create',
      'model.update',
      'view.create',
      'view.update',
      'transformation.execute',
      'codegen.execute',
      'test.execute',
      'pipeline.execute',
    ]));
    expect(capabilities).not.toContain('metamodel.create');
    expect(capabilities).not.toContain('viewpoint.update');
    expect(capabilities).not.toContain('project.members.manage');
  });

  it('gives DSL Designers language-authoring plus Modeler capabilities', () => {
    const capabilities = projectService.getCapabilities('DSL_DESIGNER');

    expect(capabilities).toEqual(expect.arrayContaining([
      'metamodel.create',
      'metamodel.update',
      'viewpoint.create',
      'viewpoint.update',
      'model.create',
      'view.create',
      'codegen.author',
      'checkpoint.create',
      'metamodel.evolve',
    ]));
    expect(capabilities).not.toContain('project.members.manage');
  });

  it('resolves a project membership independently from the platform role', async () => {
    prismaMock.studioProject.findUnique.mockResolvedValue({
      id: projectRow.id,
      ownerId: projectRow.ownerId,
      status: projectRow.status,
      memberships: [{ role: 'MODELER' }],
    } as any);

    const access = await projectService.getAccess(projectRow.id, 'member-uuid', 'VIEWER');

    expect(access).toEqual(expect.objectContaining({
      projectId: projectRow.id,
      role: 'MODELER',
      isOwner: false,
      isPlatformAdmin: false,
    }));
    expect(projectService.toEffectiveUserRole(access!)).toBe('MODELER');
  });

  it('scopes the project picker to memberships and maps artifact counts', async () => {
    prismaMock.studioProject.findMany.mockResolvedValue([projectRow] as any);

    const projects = await projectService.getAll('member-uuid', 'MODELER');

    expect(prismaMock.studioProject.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: 'ACTIVE',
        memberships: { some: { userId: 'member-uuid' } },
      },
    }));
    expect(projects[0]).toEqual(expect.objectContaining({
      role: 'MODELER',
      isPlatformAdmin: false,
      memberCount: 2,
      artifactCounts: expect.objectContaining({
        metamodels: 1,
        models: 3,
        views: 2,
      }),
    }));
  });
});
