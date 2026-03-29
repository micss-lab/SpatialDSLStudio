import { prismaMock } from '../helpers/prisma.mock';
import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';


const sharingServiceMock = {
  checkAccess: jest.fn(),
  deleteResourceShares: jest.fn(),
};
jest.mock('../../services/sharing.service', () => ({
  sharingService: sharingServiceMock,
}));

beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
});

import { codeGenerationService } from '../../services/codegeneration.service';
import { ApiError } from '../../middleware/errorHandler';

const mockProjectRow = {
  id: 'proj-uuid-1',
  name: 'TestProject',
  description: 'A test project',
  isExample: false,
  targetMetamodelId: 'mm-uuid-1',
  templates: [],
  userId: 'user-uuid-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('CodeGenerationService', () => {
  describe('getAllProjects', () => {
    it('returns owned projects', async () => {
      prismaMock.codeGenerationProject.findMany.mockResolvedValueOnce([mockProjectRow]);
      prismaMock.sharedResource.findMany.mockResolvedValue([]);

      const result = await codeGenerationService.getAllProjects('user-uuid-1');

      expect(result).toHaveLength(1);
      expect(result[0].isOwner).toBe(true);
    });
  });

  describe('getProjectsByMetamodelId', () => {
    it('filters projects by metamodel ID', async () => {
      prismaMock.codeGenerationProject.findMany.mockResolvedValueOnce([mockProjectRow]);
      prismaMock.sharedResource.findMany.mockResolvedValue([]);

      const result = await codeGenerationService.getProjectsByMetamodelId('mm-uuid-1', 'user-uuid-1');

      expect(result).toHaveLength(1);
    });
  });

  describe('getProjectById', () => {
    it('returns project when accessible', async () => {
      prismaMock.codeGenerationProject.findFirst.mockResolvedValue(mockProjectRow);
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });

      const result = await codeGenerationService.getProjectById('proj-uuid-1', 'user-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('proj-uuid-1');
    });

    it('returns null when not found', async () => {
      prismaMock.codeGenerationProject.findFirst.mockResolvedValue(null);

      const result = await codeGenerationService.getProjectById('nonexistent', 'user-uuid-1');

      expect(result).toBeNull();
    });
  });

  describe('createProject', () => {
    it('creates project for DSL_DESIGNER', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.codeGenerationProject.create.mockResolvedValue(mockProjectRow);

      const result = await codeGenerationService.createProject(
        {
          id: 'proj-uuid-1',
          name: 'TestProject',
          targetMetamodelId: 'mm-uuid-1',
          templates: [],
        },
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      expect(result.name).toBe('TestProject');
    });

    it('throws 403 for MODELER role', async () => {
      await expect(
        codeGenerationService.createProject(
          { id: 'proj-uuid-1', name: 'TestProject', targetMetamodelId: 'mm-uuid-1', templates: [] },
          'user-uuid-1',
          'MODELER'
        )
      ).rejects.toThrow(ApiError);
    });

    it('throws 400 when referenced metamodel not accessible', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: false, isOwner: false });

      await expect(
        codeGenerationService.createProject(
          {
            id: 'proj-uuid-1',
            name: 'TestProject',
            targetMetamodelId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            templates: [],
          },
          'user-uuid-1',
          'DSL_DESIGNER'
        )
      ).rejects.toThrow(ApiError);
    });

    it('skips metamodel check for example projects', async () => {
      prismaMock.codeGenerationProject.create.mockResolvedValue({ ...mockProjectRow, isExample: true });

      const result = await codeGenerationService.createProject(
        {
          id: 'proj-uuid-1',
          name: 'ExampleProject',
          isExample: true,
          targetMetamodelId: 'example-metamodel-id',
          templates: [],
        },
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      expect(sharingServiceMock.checkAccess).not.toHaveBeenCalled();
    });
  });

  describe('updateProject', () => {
    it('updates project for owner with edit permission', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.codeGenerationProject.update.mockResolvedValue({ ...mockProjectRow, name: 'Updated Project' });

      const result = await codeGenerationService.updateProject(
        'proj-uuid-1',
        { name: 'Updated Project' },
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      expect(result.name).toBe('Updated Project');
    });

    it('throws 403 when MODELER tries to edit templates', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });

      await expect(
        codeGenerationService.updateProject('proj-uuid-1', { name: 'Updated' }, 'user-uuid-1', 'MODELER')
      ).rejects.toThrow(ApiError);
    });
  });

  describe('deleteProject', () => {
    it('deletes project for owner', async () => {
      prismaMock.codeGenerationProject.findFirst.mockResolvedValue(mockProjectRow);
      sharingServiceMock.deleteResourceShares.mockResolvedValue(undefined);
      prismaMock.codeGenerationProject.delete.mockResolvedValue(mockProjectRow);

      await expect(codeGenerationService.deleteProject('proj-uuid-1', 'user-uuid-1')).resolves.toBeUndefined();
    });

    it('throws 404 when not owner', async () => {
      prismaMock.codeGenerationProject.findFirst.mockResolvedValue(null);

      await expect(codeGenerationService.deleteProject('proj-uuid-1', 'other-user')).rejects.toThrow(ApiError);
    });
  });

  describe('addTemplate', () => {
    it('adds template to project', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.codeGenerationProject.findFirst.mockResolvedValue(mockProjectRow);
      prismaMock.codeGenerationProject.update.mockResolvedValue({
        ...mockProjectRow,
        templates: [{ id: 'tmpl-1', name: 'Template1', targetClass: 'cls-1', template: '' }],
      });

      await codeGenerationService.addTemplate(
        'proj-uuid-1',
        { id: 'tmpl-1', name: 'Template1', targetClass: 'cls-1', template: '' } as any,
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      expect(prismaMock.codeGenerationProject.update).toHaveBeenCalled();
    });

    it('throws 400 when template ID already exists', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.codeGenerationProject.findFirst.mockResolvedValue({
        ...mockProjectRow,
        templates: [{ id: 'tmpl-1', name: 'ExistingTemplate' }],
      });

      await expect(
        codeGenerationService.addTemplate(
          'proj-uuid-1',
          { id: 'tmpl-1', name: 'DuplicateTemplate' } as any,
          'user-uuid-1',
          'DSL_DESIGNER'
        )
      ).rejects.toThrow(ApiError);
    });
  });

  describe('deleteTemplate', () => {
    it('removes template from project', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.codeGenerationProject.findFirst.mockResolvedValue({
        ...mockProjectRow,
        templates: [{ id: 'tmpl-1', name: 'Template1' }],
      });
      prismaMock.codeGenerationProject.update.mockResolvedValue({
        ...mockProjectRow,
        templates: [],
      });

      await codeGenerationService.deleteTemplate('proj-uuid-1', 'tmpl-1', 'user-uuid-1', 'DSL_DESIGNER');

      expect(prismaMock.codeGenerationProject.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { templates: [] },
        })
      );
    });
  });
});
