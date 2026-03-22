import prisma from '../config/database';
import { ApiError } from '../middleware';
import { 
  Diagram, 
  DiagramElement, 
  GridSettings,
  CreateDiagramRequest,
  UpdateDiagramRequest,
  UserRole,
  ResourceWithPermission
} from '../../../shared/types';
import { sharingService } from './sharing.service';
import { canPerformOperation } from '../middleware/permissions';

export interface DiagramWithPermission extends Diagram, ResourceWithPermission {}

class DiagramService {
  /**
   * Get all diagrams accessible by a user (owned + shared)
   */
  async getAll(userId: string): Promise<DiagramWithPermission[]> {
    const ownedDiagrams = await prisma.diagram.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });

    const sharedResources = await prisma.sharedResource.findMany({
      where: { 
        sharedWithId: userId,
        resourceType: 'DIAGRAM',
      },
      include: {
        owner: { select: { email: true } },
      },
    });

    const sharedDiagramIds = sharedResources.map(s => s.resourceId);
    const sharedDiagrams = sharedDiagramIds.length > 0 
      ? await prisma.diagram.findMany({
          where: { id: { in: sharedDiagramIds } },
          orderBy: { name: 'asc' },
        })
      : [];

    const ownedResult: DiagramWithPermission[] = ownedDiagrams.map(d => ({
      ...this.mapToDiagram(d),
      isOwner: true,
    }));

    const sharedResult: DiagramWithPermission[] = sharedDiagrams.map(d => {
      const shareInfo = sharedResources.find(s => s.resourceId === d.id);
      return {
        ...this.mapToDiagram(d),
        isOwner: false,
        permission: shareInfo?.permission as any,
        ownerEmail: shareInfo?.owner.email,
      };
    });

    return [...ownedResult, ...sharedResult];
  }

  /**
   * Get diagrams by model ID accessible by user
   */
  async getByModelId(modelId: string, userId: string): Promise<DiagramWithPermission[]> {
    const allDiagrams = await this.getAll(userId);
    return allDiagrams.filter(d => d.modelId === modelId);
  }

  /**
   * Get a single diagram by ID (with access check)
   */
  async getById(id: string, userId: string): Promise<DiagramWithPermission | null> {
    const diagram = await prisma.diagram.findFirst({
      where: { id },
    });

    if (!diagram) return null;

    const access = await sharingService.checkAccess('DIAGRAM', id, userId);
    if (!access.hasAccess) {
      return null;
    }

    return {
      ...this.mapToDiagram(diagram),
      isOwner: access.isOwner,
      permission: access.permission,
      ownerEmail: access.ownerEmail,
    };
  }

  /**
   * Create a new diagram (requires ADMIN or DSL_DESIGNER role)
   */
  async create(data: CreateDiagramRequest, userId: string, userRole: UserRole): Promise<Diagram> {
    if (!canPerformOperation(userRole, 'diagram', 'create')) {
      throw new ApiError(403, 'Your role does not allow creating diagrams');
    }

    // Check user has access to the model
    const access = await sharingService.checkAccess('MODEL', data.modelId, userId);
    if (!access.hasAccess) {
      throw new ApiError(400, 'Referenced model not found');
    }

    const diagram = await prisma.diagram.create({
      data: {
        id: data.id,
        name: data.name,
        modelId: data.modelId,
        elements: (data.elements || []) as any,
        gridSettings: (data.gridSettings || { sizeX: 20000, sizeY: 20000 }) as any,
        userId,
      },
    });

    return this.mapToDiagram(diagram);
  }

  /**
   * Update an existing diagram (with permission check)
   */
  async update(id: string, data: UpdateDiagramRequest, userId: string, userRole: UserRole): Promise<Diagram> {
    const access = await sharingService.checkAccess('DIAGRAM', id, userId);
    
    if (!access.hasAccess) {
      throw new ApiError(404, 'Diagram not found');
    }

    const canEdit = access.isOwner 
      ? userRole !== 'VIEWER'
      : access.permission === 'EDITOR' && canPerformOperation(userRole, 'diagram', 'editPositions');

    if (!canEdit) {
      throw new ApiError(403, 'You do not have permission to edit this diagram');
    }

    const diagram = await prisma.diagram.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.elements !== undefined && { elements: data.elements as any }),
        ...(data.gridSettings !== undefined && { gridSettings: data.gridSettings as any }),
      },
    });

    return this.mapToDiagram(diagram);
  }

  /**
   * Delete a diagram (owner only)
   */
  async delete(id: string, userId: string): Promise<void> {
    const existing = await prisma.diagram.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new ApiError(404, 'Diagram not found or you are not the owner');
    }

    await sharingService.deleteResourceShares('DIAGRAM', id);
    await prisma.diagram.delete({
      where: { id },
    });
  }

  /**
   * Add an element to a diagram
   */
  async addElement(diagramId: string, element: DiagramElement, userId: string, userRole: UserRole): Promise<Diagram> {
    if (!canPerformOperation(userRole, 'diagram', 'editPositions')) {
      throw new ApiError(403, 'Your role does not allow editing diagrams');
    }

    const access = await sharingService.checkAccess('DIAGRAM', diagramId, userId);
    
    if (!access.hasAccess) {
      throw new ApiError(404, 'Diagram not found');
    }

    if (!access.isOwner && access.permission !== 'EDITOR') {
      throw new ApiError(403, 'You do not have permission to modify this diagram');
    }

    const diagram = await prisma.diagram.findFirst({
      where: { id: diagramId },
    });

    if (!diagram) {
      throw new ApiError(404, 'Diagram not found');
    }

    const elements = (diagram.elements as unknown as DiagramElement[]) || [];
    
    if (elements.some(e => e.id === element.id)) {
      throw new ApiError(400, 'Element with this ID already exists');
    }

    elements.push(element);

    const updated = await prisma.diagram.update({
      where: { id: diagramId },
      data: { elements: elements as any },
    });

    return this.mapToDiagram(updated);
  }

  /**
   * Update an element in a diagram (EDITOR can edit positions)
   */
  async updateElement(diagramId: string, elementId: string, updates: Partial<DiagramElement>, userId: string, userRole: UserRole): Promise<Diagram> {
    if (!canPerformOperation(userRole, 'diagram', 'editPositions')) {
      throw new ApiError(403, 'Your role does not allow editing diagrams');
    }

    const access = await sharingService.checkAccess('DIAGRAM', diagramId, userId);
    
    if (!access.hasAccess) {
      throw new ApiError(404, 'Diagram not found');
    }

    if (!access.isOwner && access.permission !== 'EDITOR') {
      throw new ApiError(403, 'You do not have permission to modify this diagram');
    }

    const diagram = await prisma.diagram.findFirst({
      where: { id: diagramId },
    });

    if (!diagram) {
      throw new ApiError(404, 'Diagram not found');
    }

    const elements = (diagram.elements as unknown as DiagramElement[]) || [];
    const elementIndex = elements.findIndex(e => e.id === elementId);

    if (elementIndex === -1) {
      throw new ApiError(404, 'Element not found in diagram');
    }

    elements[elementIndex] = { ...elements[elementIndex], ...updates };

    const updated = await prisma.diagram.update({
      where: { id: diagramId },
      data: { elements: elements as any },
    });

    return this.mapToDiagram(updated);
  }

  /**
   * Delete an element from a diagram
   */
  async deleteElement(diagramId: string, elementId: string, userId: string, userRole: UserRole): Promise<Diagram> {
    if (!canPerformOperation(userRole, 'diagram', 'editPositions')) {
      throw new ApiError(403, 'Your role does not allow editing diagrams');
    }

    const access = await sharingService.checkAccess('DIAGRAM', diagramId, userId);
    
    if (!access.hasAccess) {
      throw new ApiError(404, 'Diagram not found');
    }

    if (!access.isOwner && access.permission !== 'EDITOR') {
      throw new ApiError(403, 'You do not have permission to modify this diagram');
    }

    const diagram = await prisma.diagram.findFirst({
      where: { id: diagramId },
    });

    if (!diagram) {
      throw new ApiError(404, 'Diagram not found');
    }

    const elements = ((diagram.elements as unknown as DiagramElement[]) || []).filter(e => e.id !== elementId);

    const updated = await prisma.diagram.update({
      where: { id: diagramId },
      data: { elements: elements as any },
    });

    return this.mapToDiagram(updated);
  }

  /**
   * Update grid settings
   */
  async updateGridSettings(diagramId: string, gridSettings: GridSettings, userId: string, userRole: UserRole): Promise<Diagram> {
    if (!canPerformOperation(userRole, 'diagram', 'editPositions')) {
      throw new ApiError(403, 'Your role does not allow editing diagrams');
    }

    const access = await sharingService.checkAccess('DIAGRAM', diagramId, userId);
    
    if (!access.hasAccess) {
      throw new ApiError(404, 'Diagram not found');
    }

    if (!access.isOwner && access.permission !== 'EDITOR') {
      throw new ApiError(403, 'You do not have permission to modify this diagram');
    }

    const updated = await prisma.diagram.update({
      where: { id: diagramId },
      data: { gridSettings: gridSettings as any },
    });

    return this.mapToDiagram(updated);
  }

  private mapToDiagram(d: any): Diagram {
    return {
      id: d.id,
      name: d.name,
      modelId: d.modelId,
      elements: (d.elements as DiagramElement[]) || [],
      gridSettings: (d.gridSettings as GridSettings) || { sizeX: 20000, sizeY: 20000 },
    };
  }
}

export const diagramService = new DiagramService();
export default diagramService;
