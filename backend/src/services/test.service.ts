import prisma from '../config/database';
import { ApiError } from '../middleware';
import { 
  TestCase, 
  TestValue,
  TestCaseType,
  TestCaseStatus,
  ConstraintType,
  UserRole,
  ResourceWithPermission
} from '../../../shared/types';
import { sharingService } from './sharing.service';
import { canPerformOperation } from '../middleware/permissions';

interface CreateTestCaseData {
  id?: string;
  name: string;
  description?: string;
  type: TestCaseType;
  targetMetaClassId: string;
  targetMetaClassName: string;
  targetProperty?: string;
  modelId?: string;
  metamodelId?: string;
  constraintId?: string;
  constraintType?: ConstraintType;
  testValues?: TestValue[];
  originalInput?: any;
  expectedOutput?: any;
}

interface UpdateTestCaseData {
  name?: string;
  description?: string;
  status?: TestCaseStatus;
  errorMessage?: string;
  testValues?: TestValue[];
  originalInput?: any;
  expectedOutput?: any;
  actualOutput?: any;
}

export interface TestCaseWithPermission extends TestCase, ResourceWithPermission {}

class TestService {
  /**
   * Get all test cases accessible by a user (owned + shared)
   */
  async getAll(userId: string, projectId?: string): Promise<TestCaseWithPermission[]> {
    if (projectId) {
      const projectTests = await prisma.testCase.findMany({
        where: { projectId },
        orderBy: { name: 'asc' },
        include: { user: { select: { email: true } } },
      });
      return projectTests.map(testCase => ({
        ...this.mapToTestCase(testCase),
        isOwner: testCase.userId === userId,
        permission: testCase.userId === userId ? undefined : 'EDITOR',
        ownerEmail: testCase.userId === userId ? undefined : testCase.user.email,
      }));
    }
    // Platform admins see and can edit every test case on the platform.
    if (await sharingService.isAdmin(userId)) {
      const all = await prisma.testCase.findMany({
        orderBy: { name: 'asc' },
        include: { user: { select: { email: true } } },
      });
      return all.map(tc => ({
        ...this.mapToTestCase(tc),
        isOwner: tc.userId === userId,
        permission: tc.userId === userId ? undefined : 'EDITOR',
        ownerEmail: tc.userId === userId ? undefined : tc.user.email,
      }));
    }

    const ownedTestCases = await prisma.testCase.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });

    const sharedResources = await prisma.sharedResource.findMany({
      where: { 
        sharedWithId: userId,
        resourceType: 'TEST_CASE',
      },
      include: {
        owner: { select: { email: true } },
      },
    });

    const sharedTestCaseIds = sharedResources.map(s => s.resourceId);
    const sharedTestCases = sharedTestCaseIds.length > 0 
      ? await prisma.testCase.findMany({
          where: { id: { in: sharedTestCaseIds } },
          orderBy: { name: 'asc' },
        })
      : [];

    const ownedResult: TestCaseWithPermission[] = ownedTestCases.map(tc => ({
      ...this.mapToTestCase(tc),
      isOwner: true,
    }));

    const sharedResult: TestCaseWithPermission[] = sharedTestCases.map(tc => {
      const shareInfo = sharedResources.find(s => s.resourceId === tc.id);
      return {
        ...this.mapToTestCase(tc),
        isOwner: false,
        permission: shareInfo?.permission as any,
        ownerEmail: shareInfo?.owner.email,
      };
    });

    return [...ownedResult, ...sharedResult];
  }

  /**
   * Get test cases by model ID accessible by user
   */
  async getByModelId(modelId: string, userId: string, projectId?: string): Promise<TestCaseWithPermission[]> {
    const allTestCases = await this.getAll(userId, projectId);
    return allTestCases.filter(tc => tc.modelId === modelId);
  }

  /**
   * Get a single test case by ID (with access check)
   */
  async getById(id: string, userId: string, projectId?: string): Promise<TestCaseWithPermission | null> {
    const testCase = await prisma.testCase.findFirst({
      where: { id, ...(projectId && { projectId }) },
    });

    if (!testCase) return null;

    const access = await sharingService.checkAccess('TEST_CASE', id, userId);
    if (!access.hasAccess) {
      return null;
    }

    return {
      ...this.mapToTestCase(testCase),
      isOwner: access.isOwner,
      permission: access.permission,
      ownerEmail: access.ownerEmail,
    };
  }

  /**
   * Create a new test case (requires ADMIN or DSL_DESIGNER role)
   */
  async create(data: CreateTestCaseData, userId: string, userRole: UserRole, projectId?: string): Promise<TestCase> {
    if (!canPerformOperation(userRole, 'test', 'create')) {
      throw new ApiError(403, 'Your role does not allow creating test cases');
    }

    const targetId = data.modelId || data.metamodelId;
    if (projectId && !targetId) {
      throw new ApiError(400, 'A project test case must target a Model or Metamodel in this project');
    }
    if (projectId && targetId) {
      const [model, metamodel] = await Promise.all([
        prisma.model.findFirst({ where: { id: targetId, projectId }, select: { id: true } }),
        prisma.metamodel.findFirst({ where: { id: targetId, projectId }, select: { id: true } }),
      ]);
      if (!model && !metamodel) throw new ApiError(400, 'Test target is not in this project');
    }

    const testCase = await prisma.testCase.create({
      data: {
        id: data.id,
        name: data.name,
        description: data.description,
        type: data.type,
        targetMetaClassId: data.targetMetaClassId,
        targetMetaClassName: data.targetMetaClassName,
        targetProperty: data.targetProperty,
        status: 'pending',
        constraintId: data.constraintId,
        constraintType: data.constraintType,
        testValues: (data.testValues || []) as any,
        originalInput: data.originalInput,
        expectedOutput: data.expectedOutput,
        modelId: targetId || '',
        userId,
        projectId,
      },
    });

    return this.mapToTestCase(testCase);
  }

  /**
   * Create multiple test cases at once
   */
  async createMany(
    testCases: CreateTestCaseData[],
    userId: string,
    userRole: UserRole,
    projectId?: string
  ): Promise<TestCase[]> {
    const created: TestCase[] = [];

    for (const data of testCases) {
      const testCase = await this.create(data, userId, userRole, projectId);
      created.push(testCase);
    }

    return created;
  }

  /**
   * Update an existing test case (with permission check)
   */
  async update(id: string, data: UpdateTestCaseData, userId: string, userRole: UserRole): Promise<TestCase> {
    if (!canPerformOperation(userRole, 'test', 'edit')) {
      throw new ApiError(403, 'Your role does not allow editing test cases');
    }

    const access = await sharingService.checkAccess('TEST_CASE', id, userId);
    
    if (!access.hasAccess) {
      throw new ApiError(404, 'Test case not found');
    }

    if (!access.isOwner && access.permission !== 'EDITOR') {
      throw new ApiError(403, 'You do not have permission to edit this test case');
    }

    const testCase = await prisma.testCase.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.errorMessage !== undefined && { errorMessage: data.errorMessage }),
        ...(data.testValues !== undefined && { testValues: data.testValues as any }),
        ...(data.originalInput !== undefined && { originalInput: data.originalInput }),
        ...(data.expectedOutput !== undefined && { expectedOutput: data.expectedOutput }),
        ...(data.actualOutput !== undefined && { actualOutput: data.actualOutput }),
      },
    });

    return this.mapToTestCase(testCase);
  }

  /**
   * Update test case status (MODELER role can run tests)
   */
  async updateStatus(
    id: string, 
    status: TestCaseStatus, 
    userId: string,
    userRole: UserRole,
    errorMessage?: string,
    actualOutput?: any
  ): Promise<TestCase> {
    if (!canPerformOperation(userRole, 'test', 'run')) {
      throw new ApiError(403, 'Your role does not allow running tests');
    }

    const access = await sharingService.checkAccess('TEST_CASE', id, userId);
    
    if (!access.hasAccess) {
      throw new ApiError(404, 'Test case not found');
    }

    // Running tests requires at least VIEWER share (or ownership)
    // since it only updates status, not test definition

    const testCase = await prisma.testCase.update({
      where: { id },
      data: {
        status,
        ...(errorMessage !== undefined && { errorMessage }),
        ...(actualOutput !== undefined && { actualOutput }),
      },
    });

    return this.mapToTestCase(testCase);
  }

  /**
   * Update test values for a test case
   */
  async updateTestValues(id: string, testValues: TestValue[], userId: string, userRole: UserRole): Promise<TestCase> {
    if (!canPerformOperation(userRole, 'test', 'edit')) {
      throw new ApiError(403, 'Your role does not allow editing test cases');
    }

    const access = await sharingService.checkAccess('TEST_CASE', id, userId);
    
    if (!access.hasAccess) {
      throw new ApiError(404, 'Test case not found');
    }

    if (!access.isOwner && access.permission !== 'EDITOR') {
      throw new ApiError(403, 'You do not have permission to edit this test case');
    }

    const testCase = await prisma.testCase.update({
      where: { id },
      data: {
        testValues: testValues as any,
      },
    });

    return this.mapToTestCase(testCase);
  }

  /**
   * Delete a test case (owner only)
   */
  async delete(id: string, userId: string, userRole?: UserRole, projectId?: string): Promise<void> {
    if (projectId && userRole && !canPerformOperation(userRole, 'test', 'create')) {
      throw new ApiError(403, 'Your role does not allow deleting test definitions');
    }
    const existing = await prisma.testCase.findFirst({
      where: projectId ? { id, projectId } : { id, userId },
    });

    if (!existing) {
      throw new ApiError(404, 'Test case not found or you are not the owner');
    }

    await sharingService.deleteResourceShares('TEST_CASE', id);
    await prisma.testCase.delete({
      where: { id },
    });
  }

  /**
   * Delete all test cases for a model (owner only)
   */
  async deleteByModelId(modelId: string, userId: string, userRole?: UserRole, projectId?: string): Promise<number> {
    if (projectId && userRole && !canPerformOperation(userRole, 'test', 'create')) {
      throw new ApiError(403, 'Your role does not allow deleting test definitions');
    }
    // Get all test cases for this model owned by user
    const testCases = await prisma.testCase.findMany({
      where: projectId ? { modelId, projectId } : { modelId, userId },
      select: { id: true },
    });

    // Delete shares for each
    for (const tc of testCases) {
      await sharingService.deleteResourceShares('TEST_CASE', tc.id);
    }

    const result = await prisma.testCase.deleteMany({
      where: projectId ? { modelId, projectId } : { modelId, userId },
    });

    return result.count;
  }

  /**
   * Reset all test cases for a model to pending status
   */
  async resetByModelId(modelId: string, userId: string, userRole: UserRole, projectId?: string): Promise<number> {
    if (!canPerformOperation(userRole, 'test', 'run')) {
      throw new ApiError(403, 'Your role does not allow running tests');
    }

    const result = await prisma.testCase.updateMany({
      where: projectId ? { modelId, projectId } : { modelId, userId },
      data: {
        status: 'pending',
        errorMessage: null,
        actualOutput: undefined,
      },
    });

    return result.count;
  }

  private mapToTestCase(tc: any): TestCase {
    return {
      id: tc.id,
      projectId: tc.projectId || undefined,
      modelId: tc.modelId || undefined,
      name: tc.name,
      description: tc.description || '',
      type: tc.type as TestCaseType,
      targetMetaClassId: tc.targetMetaClassId,
      targetMetaClassName: tc.targetMetaClassName,
      targetProperty: tc.targetProperty || undefined,
      testValues: (tc.testValues as TestValue[]) || [],
      constraintId: tc.constraintId || undefined,
      constraintType: tc.constraintType as ConstraintType | undefined,
      status: tc.status as TestCaseStatus,
      errorMessage: tc.errorMessage || undefined,
      originalInput: tc.originalInput || undefined,
      expectedOutput: tc.expectedOutput || undefined,
      actualOutput: tc.actualOutput || undefined,
    };
  }
}

export const testService = new TestService();
export default testService;
