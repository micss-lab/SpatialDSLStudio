import prisma from '../config/database';
import { ApiError } from '../middleware';
import { 
  TransformationPattern, 
  TransformationRule, 
  PatternElement,
  PatternType,
  UserRole,
  ResourceWithPermission
} from '../../../shared/types';
import { sharingService } from './sharing.service';
import { canPerformOperation } from '../middleware/permissions';

interface CreateRuleData {
  id?: string;
  name: string;
  description?: string;
  priority?: number;
  enabled?: boolean;
  lhs: TransformationPattern;
  rhs: TransformationPattern;
  nacs?: TransformationPattern[];
  conditions?: string[];
  diagramId?: string;
}

interface UpdateRuleData {
  name?: string;
  description?: string;
  priority?: number;
  enabled?: boolean;
  lhs?: TransformationPattern;
  rhs?: TransformationPattern;
  nacs?: TransformationPattern[];
  conditions?: string[];
  diagramId?: string;
}

export interface TransformationRuleWithPermission extends TransformationRule, ResourceWithPermission {}

class TransformationService {
  /**
   * Get all rules accessible by a user (owned + shared)
   */
  async getAllRules(userId: string): Promise<TransformationRuleWithPermission[]> {
    // Platform admins see every rule on the platform (read-only for those they
    // don't own).
    if (await sharingService.isAdmin(userId)) {
      const all = await prisma.transformationRule.findMany({
        orderBy: [{ priority: 'desc' }, { name: 'asc' }],
        include: { user: { select: { email: true } } },
      });
      return all.map(r => ({
        ...this.mapToRule(r),
        isOwner: r.userId === userId,
        permission: r.userId === userId ? undefined : 'VIEWER',
        ownerEmail: r.userId === userId ? undefined : r.user.email,
      }));
    }

    const ownedRules = await prisma.transformationRule.findMany({
      where: { userId },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
    });

    const sharedResources = await prisma.sharedResource.findMany({
      where: { 
        sharedWithId: userId,
        resourceType: 'TRANSFORMATION_RULE',
      },
      include: {
        owner: { select: { email: true } },
      },
    });

    const sharedRuleIds = sharedResources.map(s => s.resourceId);
    const sharedRules = sharedRuleIds.length > 0 
      ? await prisma.transformationRule.findMany({
          where: { id: { in: sharedRuleIds } },
          orderBy: [{ priority: 'desc' }, { name: 'asc' }],
        })
      : [];

    const ownedResult: TransformationRuleWithPermission[] = ownedRules.map(r => ({
      ...this.mapToRule(r),
      isOwner: true,
    }));

    const sharedResult: TransformationRuleWithPermission[] = sharedRules.map(r => {
      const shareInfo = sharedResources.find(s => s.resourceId === r.id);
      return {
        ...this.mapToRule(r),
        isOwner: false,
        permission: shareInfo?.permission as any,
        ownerEmail: shareInfo?.owner.email,
      };
    });

    return [...ownedResult, ...sharedResult];
  }

  /**
   * Get a single rule by ID (with access check)
   */
  async getRuleById(id: string, userId: string): Promise<TransformationRuleWithPermission | null> {
    const rule = await prisma.transformationRule.findFirst({
      where: { id },
    });

    if (!rule) return null;

    const access = await sharingService.checkAccess('TRANSFORMATION_RULE', id, userId);
    if (!access.hasAccess) {
      return null;
    }

    return {
      ...this.mapToRule(rule),
      isOwner: access.isOwner,
      permission: access.permission,
      ownerEmail: access.ownerEmail,
    };
  }

  /**
   * Create a new rule (requires ADMIN or DSL_DESIGNER role)
   */
  async createRule(data: CreateRuleData, userId: string, userRole: UserRole): Promise<TransformationRule> {
    if (!canPerformOperation(userRole, 'transformation', 'create')) {
      throw new ApiError(403, 'Your role does not allow creating transformation rules');
    }

    const rule = await prisma.transformationRule.create({
      data: {
        id: data.id,
        name: data.name,
        description: data.description,
        priority: data.priority || 0,
        enabled: data.enabled ?? true,
        lhs: data.lhs as any,
        rhs: data.rhs as any,
        nacs: (data.nacs || []) as any,
        conditions: (data.conditions || []) as any,
        diagramId: data.diagramId,
        userId,
      },
    });

    return this.mapToRule(rule);
  }

  /**
   * Update an existing rule (with permission check)
   */
  async updateRule(id: string, data: UpdateRuleData, userId: string, userRole: UserRole): Promise<TransformationRule> {
    const access = await sharingService.checkAccess('TRANSFORMATION_RULE', id, userId);
    
    if (!access.hasAccess) {
      throw new ApiError(404, 'Rule not found');
    }

    const canEdit = access.isOwner 
      ? userRole !== 'VIEWER'
      : access.permission === 'EDITOR' && userRole !== 'VIEWER';

    if (!canEdit) {
      throw new ApiError(403, 'You do not have permission to edit this rule');
    }

    const rule = await prisma.transformationRule.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.enabled !== undefined && { enabled: data.enabled }),
        ...(data.lhs !== undefined && { lhs: data.lhs as any }),
        ...(data.rhs !== undefined && { rhs: data.rhs as any }),
        ...(data.nacs !== undefined && { nacs: data.nacs as any }),
        ...(data.conditions !== undefined && { conditions: data.conditions as any }),
        ...(data.diagramId !== undefined && { diagramId: data.diagramId }),
      },
    });

    return this.mapToRule(rule);
  }

  /**
   * Delete a rule (owner only)
   */
  async deleteRule(id: string, userId: string): Promise<void> {
    const existing = await prisma.transformationRule.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new ApiError(404, 'Rule not found or you are not the owner');
    }

    await sharingService.deleteResourceShares('TRANSFORMATION_RULE', id);
    await prisma.transformationRule.delete({
      where: { id },
    });
  }

  private mapToRule(r: any): TransformationRule {
    const lhs = r.lhs as TransformationPattern || { id: '', name: '', type: 'LHS', elements: [] };
    const rhs = r.rhs as TransformationPattern || { id: '', name: '', type: 'RHS', elements: [] };
    const nacs = (r.nacs as TransformationPattern[]) || [];
    
    return {
      id: r.id,
      name: r.name,
      description: r.description || undefined,
      lhs: lhs.id || '',
      rhs: rhs.id || '',
      nacs: nacs.map(n => n.id || '').filter(Boolean),
      conditions: (r.conditions as string[]) || [],
      priority: r.priority,
      enabled: r.enabled,
      lhsPattern: lhs,
      rhsPattern: rhs,
      nacPatterns: nacs,
    };
  }
}

export const transformationService = new TransformationService();
export default transformationService;
