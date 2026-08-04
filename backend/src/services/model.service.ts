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
import {
  normalizeModelElementSpatial,
  normalizePresentation,
  validatePresentation,
} from '../../../shared/spatial';
import { spatialElementErrors } from '../middleware/presentationValidation';

export interface ModelWithPermission extends Model, ResourceWithPermission {}

class ModelService {
  private normalizeElement(element: ModelElement, path = 'element'): ModelElement {
    const errors = spatialElementErrors(element, path);
    if (errors.length > 0) throw new ApiError(400, errors[0]);
    return normalizeModelElementSpatial(element);
  }

  private normalizeElements(elements: ModelElement[] = []): ModelElement[] {
    return elements.map((element, index) => this.normalizeElement(element, `elements[${index}]`));
  }

  /**
   * Get all models accessible by a user (owned + shared)
   */
  async getAll(userId: string, projectId?: string): Promise<ModelWithPermission[]> {
    if (projectId) {
      const projectModels = await prisma.model.findMany({
        where: { projectId },
        orderBy: { name: 'asc' },
        include: { user: { select: { email: true } } },
      });
      return projectModels.map(model => ({
        ...this.mapToModel(model),
        isOwner: model.userId === userId,
        permission: model.userId === userId ? undefined : 'EDITOR',
        ownerEmail: model.userId === userId ? undefined : model.user.email,
      }));
    }
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
  async getByMetamodelId(metamodelId: string, userId: string, projectId?: string): Promise<ModelWithPermission[]> {
    const allModels = await this.getAll(userId, projectId);
    return allModels.filter(m => m.conformsTo === metamodelId);
  }

  /**
   * Get a single model by ID (with access check)
   */
  async getById(id: string, userId: string, projectId?: string): Promise<ModelWithPermission | null> {
    const model = await prisma.model.findFirst({
      where: { id, ...(projectId && { projectId }) },
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
  async create(data: CreateModelRequest, userId: string, userRole: UserRole, projectId?: string): Promise<Model> {
    if (!canPerformOperation(userRole, 'model', 'create')) {
      throw new ApiError(403, 'Your role does not allow creating models');
    }

    // Check user has access to the metamodel
    const access = await sharingService.checkAccess('METAMODEL', data.conformsTo, userId);
    if (!access.hasAccess) {
      throw new ApiError(400, 'Referenced metamodel (conformsTo) not found');
    }
    if (projectId) {
      const metamodel = await prisma.metamodel.findFirst({ where: { id: data.conformsTo, projectId } });
      if (!metamodel) throw new ApiError(400, 'Referenced metamodel is not in this project');
    }

    const model = await prisma.model.create({
      data: {
        id: data.id,
        name: data.name,
        description: data.description,
        metamodelId: data.metamodelId,
        elements: this.normalizeElements(data.elements || []) as any,
        connections: (data.connections || []) as any,
        conformsToId: data.conformsTo,
        userId,
        projectId,
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
        ...(data.elements !== undefined && { elements: this.normalizeElements(data.elements) as any }),
        ...(data.connections !== undefined && { connections: data.connections as any }),
      },
    });

    return this.mapToModel(model);
  }

  /**
   * Delete a model (owner or platform admin)
   */
  async delete(id: string, userId: string, userRole: UserRole, projectId?: string): Promise<void> {
    if (projectId && !canPerformOperation(userRole, 'model', 'deleteInstance')) {
      throw new ApiError(403, 'Your role does not allow deleting models');
    }
    const existing = await prisma.model.findFirst({
      where: projectId
        ? { id, projectId }
        : userRole === 'ADMIN' ? { id } : { id, userId },
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

    elements.push(this.normalizeElement(element));

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

    elements[elementIndex] = this.normalizeElement({ ...elements[elementIndex], ...updates });

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

    const presentationErrors = validatePresentation(presentation);
    if (presentationErrors.length > 0) throw new ApiError(400, presentationErrors[0]);

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

    const currentPresentation = normalizePresentation(elements[elementIndex].presentation);
    const normalizedUpdates = normalizePresentation(presentation);
    const current2D = currentPresentation?.position2D;
    const current3D = currentPresentation?.position3D;
    const aligned = !current2D || !current3D
      || (current2D.x === current3D.x && current2D.y === current3D.y);
    let syncedUpdates = normalizedUpdates;

    if (normalizedUpdates.position2D && !normalizedUpdates.position3D && current2D && current3D) {
      syncedUpdates = {
        ...normalizedUpdates,
        position3D: {
          x: current3D.x + (normalizedUpdates.position2D.x - current2D.x),
          y: current3D.y + (normalizedUpdates.position2D.y - current2D.y),
          z: current3D.z,
        },
      };
    } else if (normalizedUpdates.position3D && !normalizedUpdates.position2D && aligned) {
      syncedUpdates = {
        ...normalizedUpdates,
        position2D: {
          x: normalizedUpdates.position3D.x,
          y: normalizedUpdates.position3D.y,
        },
      };
    }

    const candidate = {
      ...elements[elementIndex],
      presentation: {
        ...(currentPresentation || {}),
        ...syncedUpdates,
        position2D: syncedUpdates.position2D || currentPresentation?.position2D,
        position3D: syncedUpdates.position3D || currentPresentation?.position3D,
        size2D: syncedUpdates.size2D || currentPresentation?.size2D,
        size3D: syncedUpdates.size3D || currentPresentation?.size3D,
        appearance: Object.prototype.hasOwnProperty.call(syncedUpdates, 'appearance')
          ? syncedUpdates.appearance
          : currentPresentation?.appearance,
      },
    };
    elements[elementIndex] = this.normalizeElement(candidate);

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
      projectId: m.projectId || undefined,
      name: m.name,
      description: m.description || undefined,
      metamodelId: m.metamodelId,
      elements: this.normalizeElements((m.elements as unknown as ModelElement[]) || []),
      connections: (m.connections as unknown as ModelConnection[]) || [],
      conformsTo: m.conformsToId,
    };
  }
}

export const modelService = new ModelService();
export default modelService;
