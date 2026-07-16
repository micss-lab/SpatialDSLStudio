import prisma from '../config/database';
import { ApiError } from '../middleware';
import { 
  Model, 
  ModelElement, 
  ModelElementPresentation,
  ModelConnection,
  CreateModelRequest,
  UpdateModelRequest,
  UserRole,
  ResourceWithPermission
} from '../../../shared/types';
import { sharingService } from './sharing.service';
import { canPerformOperation } from '../middleware/permissions';

export interface ModelWithPermission extends Model, ResourceWithPermission {}

class ModelService {
  /**
   * Get all models accessible by a user (owned + shared)
   */
  async getAll(userId: string): Promise<ModelWithPermission[]> {
    // Platform admins see and can edit every model on the platform.
    if (await sharingService.isAdmin(userId)) {
      const all = await prisma.model.findMany({
        orderBy: { name: 'asc' },
        include: { user: { select: { email: true } } },
      });
      return all.map(m => ({
        ...this.mapToModel(m),
        isOwner: m.userId === userId,
        permission: m.userId === userId ? undefined : 'EDITOR',
        ownerEmail: m.userId === userId ? undefined : m.user.email,
      }));
    }

    // Get owned models
    const ownedModels = await prisma.model.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });

    // Get shared models
    const sharedResources = await prisma.sharedResource.findMany({
      where: { 
        sharedWithId: userId,
        resourceType: 'MODEL',
      },
      include: {
        owner: { select: { email: true } },
      },
    });

    const sharedModelIds = sharedResources.map(s => s.resourceId);
    const sharedModels = sharedModelIds.length > 0 
      ? await prisma.model.findMany({
          where: { id: { in: sharedModelIds } },
          orderBy: { name: 'asc' },
        })
      : [];

    const ownedResult: ModelWithPermission[] = ownedModels.map(m => ({
      ...this.mapToModel(m),
      isOwner: true,
    }));

    const sharedResult: ModelWithPermission[] = sharedModels.map(m => {
      const shareInfo = sharedResources.find(s => s.resourceId === m.id);
      return {
        ...this.mapToModel(m),
        isOwner: false,
        permission: shareInfo?.permission as any,
        ownerEmail: shareInfo?.owner.email,
      };
    });

    return [...ownedResult, ...sharedResult];
  }

  /**
   * Get models by metamodel ID accessible by user
   */
  async getByMetamodelId(metamodelId: string, userId: string): Promise<ModelWithPermission[]> {
    const allModels = await this.getAll(userId);
    return allModels.filter(m => m.conformsTo === metamodelId);
  }

  /**
   * Get a single model by ID (with access check)
   */
  async getById(id: string, userId: string): Promise<ModelWithPermission | null> {
    const model = await prisma.model.findFirst({
      where: { id },
    });

    if (!model) return null;

    const access = await sharingService.checkAccess('MODEL', id, userId);
    if (!access.hasAccess) {
      return null;
    }

    return {
      ...this.mapToModel(model),
      isOwner: access.isOwner,
      permission: access.permission,
      ownerEmail: access.ownerEmail,
    };
  }

  /**
   * Create a new model (requires ADMIN or DSL_DESIGNER role)
   */
  async create(data: CreateModelRequest, userId: string, userRole: UserRole): Promise<Model> {
    if (!canPerformOperation(userRole, 'model', 'create')) {
      throw new ApiError(403, 'Your role does not allow creating models');
    }

    // Check user has access to the metamodel
    const access = await sharingService.checkAccess('METAMODEL', data.conformsTo, userId);
    if (!access.hasAccess) {
      throw new ApiError(400, 'Referenced metamodel (conformsTo) not found');
    }

    const model = await prisma.model.create({
      data: {
        id: data.id,
        name: data.name,
        description: data.description,
        metamodelId: data.metamodelId,
        elements: (data.elements || []) as any,
        connections: (data.connections || []) as any,
        conformsToId: data.conformsTo,
        userId,
      },
    });

    return this.mapToModel(model);
  }

  /**
   * Update an existing model (with permission check)
   */
  async update(id: string, data: UpdateModelRequest, userId: string, userRole: UserRole): Promise<Model> {
    const access = await sharingService.checkAccess('MODEL', id, userId);
    
    if (!access.hasAccess) {
      throw new ApiError(404, 'Model not found');
    }

    const canEdit = access.isOwner 
      ? userRole !== 'VIEWER'
      : access.permission === 'EDITOR' && userRole !== 'VIEWER';

    if (!canEdit) {
      throw new ApiError(403, 'You do not have permission to edit this model');
    }

    const model = await prisma.model.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.elements !== undefined && { elements: data.elements as any }),
        ...(data.connections !== undefined && { connections: data.connections as any }),
      },
    });

    return this.mapToModel(model);
  }

  /**
   * Delete a model (owner or platform admin)
   */
  async delete(id: string, userId: string, userRole: UserRole): Promise<void> {
    const existing = await prisma.model.findFirst({
      where: userRole === 'ADMIN' ? { id } : { id, userId },
    });

    if (!existing) {
      throw new ApiError(404, 'Model not found or you are not the owner');
    }

    await sharingService.deleteResourceShares('MODEL', id);
    await prisma.model.delete({
      where: { id },
    });
  }

  /**
   * Add an element to a model (MODELER role can do this)
   */
  async addElement(modelId: string, element: ModelElement, userId: string, userRole: UserRole): Promise<Model> {
    if (!canPerformOperation(userRole, 'model', 'addInstance')) {
      throw new ApiError(403, 'Your role does not allow adding instances');
    }

    const access = await sharingService.checkAccess('MODEL', modelId, userId);

    if (!access.hasAccess) {
      throw new ApiError(404, 'Model not found');
    }

    if (!access.isOwner && access.permission !== 'EDITOR') {
      throw new ApiError(403, 'You do not have permission to modify this model');
    }

    const model = await prisma.model.findFirst({
      where: { id: modelId },
    });

    if (!model) {
      throw new ApiError(404, 'Model not found');
    }

    const elements = (model.elements as unknown as ModelElement[]) || [];
    
    if (elements.some(e => e.id === element.id)) {
      throw new ApiError(400, 'Element with this ID already exists');
    }

    elements.push(element);

    const updated = await prisma.model.update({
      where: { id: modelId },
      data: { elements: elements as any },
    });

    return this.mapToModel(updated);
  }

  /**
   * Update an element in a model
   */
  async updateElement(modelId: string, elementId: string, updates: Partial<ModelElement>, userId: string, userRole: UserRole): Promise<Model> {
    if (!canPerformOperation(userRole, 'model', 'editInstance')) {
      throw new ApiError(403, 'Your role does not allow editing instances');
    }

    const access = await sharingService.checkAccess('MODEL', modelId, userId);

    if (!access.hasAccess) {
      throw new ApiError(404, 'Model not found');
    }

    if (!access.isOwner && access.permission !== 'EDITOR') {
      throw new ApiError(403, 'You do not have permission to modify this model');
    }

    const model = await prisma.model.findFirst({
      where: { id: modelId },
    });

    if (!model) {
      throw new ApiError(404, 'Model not found');
    }

    const elements = (model.elements as unknown as ModelElement[]) || [];
    const elementIndex = elements.findIndex(e => e.id === elementId);

    if (elementIndex === -1) {
      throw new ApiError(404, 'Element not found in model');
    }

    elements[elementIndex] = { ...elements[elementIndex], ...updates };

    const updated = await prisma.model.update({
      where: { id: modelId },
      data: { elements: elements as any },
    });

    return this.mapToModel(updated);
  }

  /**
   * Update canonical presentation data for a model element.
   */
  async updateElementPresentation(
    modelId: string,
    elementId: string,
    presentation: ModelElementPresentation,
    userId: string,
    userRole: UserRole
  ): Promise<Model> {
    if (!canPerformOperation(userRole, 'model', 'editInstance')) {
      throw new ApiError(403, 'Your role does not allow editing instances');
    }

    const access = await sharingService.checkAccess('MODEL', modelId, userId);
    if (!access.hasAccess) {
      throw new ApiError(404, 'Model not found');
    }

    if (!access.isOwner && access.permission !== 'EDITOR') {
      throw new ApiError(403, 'You do not have permission to modify this model');
    }

    const model = await prisma.model.findFirst({
      where: { id: modelId },
    });

    if (!model) {
      throw new ApiError(404, 'Model not found');
    }

    const elements = (model.elements as unknown as ModelElement[]) || [];
    const elementIndex = elements.findIndex(e => e.id === elementId);

    if (elementIndex === -1) {
      throw new ApiError(404, 'Element not found in model');
    }

    elements[elementIndex] = {
      ...elements[elementIndex],
      presentation: {
        ...(elements[elementIndex].presentation || {}),
        ...presentation,
        position2D: presentation.position2D || elements[elementIndex].presentation?.position2D,
        position3D: presentation.position3D || elements[elementIndex].presentation?.position3D,
        size2D: presentation.size2D || elements[elementIndex].presentation?.size2D,
        size3D: presentation.size3D || elements[elementIndex].presentation?.size3D,
        appearance: presentation.appearance || elements[elementIndex].presentation?.appearance,
      },
    };

    const updated = await prisma.model.update({
      where: { id: modelId },
      data: { elements: elements as any },
    });

    return this.mapToModel(updated);
  }

  /**
   * Delete an element from a model
   */
  async deleteElement(modelId: string, elementId: string, userId: string, userRole: UserRole): Promise<Model> {
    if (!canPerformOperation(userRole, 'model', 'deleteInstance')) {
      throw new ApiError(403, 'Your role does not allow deleting instances');
    }

    const access = await sharingService.checkAccess('MODEL', modelId, userId);
    
    if (!access.hasAccess) {
      throw new ApiError(404, 'Model not found');
    }

    if (!access.isOwner && access.permission !== 'EDITOR') {
      throw new ApiError(403, 'You do not have permission to modify this model');
    }

    const model = await prisma.model.findFirst({
      where: { id: modelId },
    });

    if (!model) {
      throw new ApiError(404, 'Model not found');
    }

    const elements = ((model.elements as unknown as ModelElement[]) || []).filter(e => e.id !== elementId);
    const connections = ((model.connections as unknown as ModelConnection[]) || []).filter(
      c => c.sourceId !== elementId && c.targetId !== elementId
    );

    const updated = await prisma.model.update({
      where: { id: modelId },
      data: { 
        elements: elements as any,
        connections: connections as any,
      },
    });

    return this.mapToModel(updated);
  }

  /**
   * Add a connection to a model
   */
  async addConnection(modelId: string, connection: ModelConnection, userId: string, userRole: UserRole): Promise<Model> {
    if (!canPerformOperation(userRole, 'model', 'addInstance')) {
      throw new ApiError(403, 'Your role does not allow adding connections');
    }

    const access = await sharingService.checkAccess('MODEL', modelId, userId);
    
    if (!access.hasAccess) {
      throw new ApiError(404, 'Model not found');
    }

    if (!access.isOwner && access.permission !== 'EDITOR') {
      throw new ApiError(403, 'You do not have permission to modify this model');
    }

    const model = await prisma.model.findFirst({
      where: { id: modelId },
    });

    if (!model) {
      throw new ApiError(404, 'Model not found');
    }

    const connections = (model.connections as unknown as ModelConnection[]) || [];
    
    if (connections.some(c => c.id === connection.id)) {
      throw new ApiError(400, 'Connection with this ID already exists');
    }

    connections.push(connection);

    const updated = await prisma.model.update({
      where: { id: modelId },
      data: { connections: connections as any },
    });

    return this.mapToModel(updated);
  }

  /**
   * Delete a connection from a model
   */
  async deleteConnection(modelId: string, connectionId: string, userId: string, userRole: UserRole): Promise<Model> {
    if (!canPerformOperation(userRole, 'model', 'deleteInstance')) {
      throw new ApiError(403, 'Your role does not allow deleting connections');
    }

    const access = await sharingService.checkAccess('MODEL', modelId, userId);
    
    if (!access.hasAccess) {
      throw new ApiError(404, 'Model not found');
    }

    if (!access.isOwner && access.permission !== 'EDITOR') {
      throw new ApiError(403, 'You do not have permission to modify this model');
    }

    const model = await prisma.model.findFirst({
      where: { id: modelId },
    });

    if (!model) {
      throw new ApiError(404, 'Model not found');
    }

    const connections = ((model.connections as unknown as ModelConnection[]) || []).filter(
      c => c.id !== connectionId
    );

    const updated = await prisma.model.update({
      where: { id: modelId },
      data: { connections: connections as any },
    });

    return this.mapToModel(updated);
  }

  private mapToModel(m: any): Model {
    return {
      id: m.id,
      name: m.name,
      description: m.description || undefined,
      metamodelId: m.metamodelId,
      elements: (m.elements as unknown as ModelElement[]) || [],
      connections: (m.connections as unknown as ModelConnection[]) || [],
      conformsTo: m.conformsToId,
    };
  }
}

export const modelService = new ModelService();
export default modelService;
