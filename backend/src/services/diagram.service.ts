import prisma from '../config/database';
import { ApiError } from '../middleware';
import { v4 as uuidv4 } from 'uuid';
import { 
  Diagram, 
  DiagramElement, 
  GridSettings,
  MetaAttribute,
  MetaClass,
  MetaReference,
  Metamodel,
  ModelConnection,
  ModelElement,
  ModelElementPresentation,
  RepresentationDescription,
  RepresentationPinMapping,
  CreateDiagramRequest,
  UpdateDiagramRequest,
  UserRole,
  ResourceWithPermission
} from '../../../shared/types';
import { sharingService } from './sharing.service';
import { canPerformOperation } from '../middleware/permissions';
import { viewpointService } from './viewpoint.service';

export interface DiagramWithPermission extends Diagram, ResourceWithPermission {}

type AttachmentSide = NonNullable<ModelElementPresentation['attachmentSide']>;

const ATTACHMENT_SIDES: AttachmentSide[] = ['top', 'right', 'bottom', 'left'];

class DiagramService {
  private getIncludedElementIds(diagram: any): string[] {
    const ids = Array.isArray(diagram.includedElementIds) ? diagram.includedElementIds : [];
    return Array.from(new Set(ids.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)));
  }

  private async assertCanEditDiagram(diagramId: string, userId: string, userRole: UserRole): Promise<void> {
    if (!canPerformOperation(userRole, 'diagram', 'editPositions')) {
      throw new ApiError(403, 'Your role does not allow editing views');
    }

    const access = await sharingService.checkAccess('DIAGRAM', diagramId, userId);

    if (!access.hasAccess) {
      throw new ApiError(404, 'View not found');
    }

    if (!access.isOwner && access.permission !== 'EDITOR') {
      throw new ApiError(403, 'You do not have permission to modify this view');
    }
  }

  private async assertCanEditModel(modelId: string, userId: string, userRole: UserRole): Promise<void> {
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
  }

  private getAllAttributes(metaClass: MetaClass, metamodel: Metamodel): MetaAttribute[] {
    const allAttributes: MetaAttribute[] = [...(metaClass.attributes || [])];
    const processedClasses = new Set<string>([metaClass.id]);

    const collectInheritedAttributes = (currentClass: MetaClass) => {
      for (const superTypeId of currentClass.superTypes || []) {
        if (processedClasses.has(superTypeId)) continue;
        processedClasses.add(superTypeId);

        const superClass = metamodel.classes.find(cls => cls.id === superTypeId);
        if (superClass) {
          allAttributes.push(...(superClass.attributes || []));
          collectInheritedAttributes(superClass);
        }
      }
    };

    collectInheritedAttributes(metaClass);

    const uniqueAttributes: MetaAttribute[] = [];
    const seenNames = new Set<string>();
    for (let i = allAttributes.length - 1; i >= 0; i -= 1) {
      const attribute = allAttributes[i];
      if (!seenNames.has(attribute.name)) {
        seenNames.add(attribute.name);
        uniqueAttributes.unshift(attribute);
      }
    }

    return uniqueAttributes;
  }

  private getAllReferences(metaClass: MetaClass, metamodel: Metamodel): MetaReference[] {
    const allReferences: MetaReference[] = [...(metaClass.references || [])];
    const processedClasses = new Set<string>([metaClass.id]);

    const collectInheritedReferences = (currentClass: MetaClass) => {
      for (const superTypeId of currentClass.superTypes || []) {
        if (processedClasses.has(superTypeId)) continue;
        processedClasses.add(superTypeId);

        const superClass = metamodel.classes.find(cls => cls.id === superTypeId);
        if (superClass) {
          allReferences.push(...(superClass.references || []));
          collectInheritedReferences(superClass);
        }
      }
    };

    collectInheritedReferences(metaClass);

    const uniqueReferences: MetaReference[] = [];
    const seenNames = new Set<string>();
    for (let i = allReferences.length - 1; i >= 0; i -= 1) {
      const reference = allReferences[i];
      if (!seenNames.has(reference.name)) {
        seenNames.add(reference.name);
        uniqueReferences.unshift(reference);
      }
    }

    return uniqueReferences;
  }

  private buildModelElement(
    metaClass: MetaClass,
    metamodel: Metamodel,
    presentation?: ModelElementPresentation,
    style: Record<string, any> = {}
  ): ModelElement {
    const elementStyle: Record<string, any> = {};
    const references: ModelElement['references'] = {};

    for (const attribute of this.getAllAttributes(metaClass, metamodel)) {
      if (style[attribute.name] !== undefined) {
        elementStyle[attribute.name] = style[attribute.name];
      } else if (attribute.defaultValue !== undefined) {
        elementStyle[attribute.name] = attribute.defaultValue;
      } else {
        const attributeType = typeof attribute.type === 'object' ? 'string' : attribute.type;
        switch (attributeType) {
          case 'number':
            elementStyle[attribute.name] = 0;
            break;
          case 'boolean':
            elementStyle[attribute.name] = false;
            break;
          case 'date':
            elementStyle[attribute.name] = new Date().toISOString();
            break;
          case 'string':
          default:
            elementStyle[attribute.name] = attribute.name === 'name'
              ? `${metaClass.name}_${Date.now().toString().slice(-4)}`
              : '';
            break;
        }
      }
    }

    for (const [key, value] of Object.entries(style)) {
      if (elementStyle[key] === undefined) {
        elementStyle[key] = value;
      }
    }

    for (const reference of this.getAllReferences(metaClass, metamodel)) {
      references[reference.name] = reference.cardinality.upperBound === '*'
        || (typeof reference.cardinality.upperBound === 'number' && reference.cardinality.upperBound > 1)
        ? []
        : null as any;
    }

    return {
      id: uuidv4(),
      modelElementId: metaClass.id,
      style: elementStyle,
      references,
      presentation: {
        position2D: { x: 0, y: 0 },
        size2D: { width: 120, height: 80 },
        ...(presentation || {}),
      },
    };
  }

  private presentationFromDiagramElement(
    element: Partial<DiagramElement>,
    current?: ModelElementPresentation
  ): ModelElementPresentation {
    const style = element.style || {};
    const rawElement = element as Partial<DiagramElement> & Record<string, any>;
    const presentation: ModelElementPresentation = {};

    if (typeof element.x === 'number' || typeof element.y === 'number') {
      presentation.position2D = {
        x: typeof element.x === 'number' ? element.x : (current?.position2D?.x ?? 0),
        y: typeof element.y === 'number' ? element.y : (current?.position2D?.y ?? 0),
      };
    }

    if (typeof element.width === 'number' || typeof element.height === 'number') {
      presentation.size2D = {
        width: typeof element.width === 'number' ? element.width : (current?.size2D?.width ?? 120),
        height: typeof element.height === 'number' ? element.height : (current?.size2D?.height ?? 80),
      };
    }

    if (style.position3D && typeof style.position3D === 'object') {
      presentation.position3D = style.position3D;
    }

    const hasSize3D = ['widthMm', 'heightMm', 'depthMm'].some(key => typeof style[key] === 'number');
    if (hasSize3D) {
      presentation.size3D = {
        widthMm: typeof style.widthMm === 'number' ? style.widthMm : (current?.size3D?.widthMm ?? 500),
        heightMm: typeof style.heightMm === 'number' ? style.heightMm : (current?.size3D?.heightMm ?? 800),
        depthMm: typeof style.depthMm === 'number' ? style.depthMm : (current?.size3D?.depthMm ?? 200),
      };
    }

    if (typeof style.rotationZ === 'number') {
      presentation.rotationZ = style.rotationZ;
    }

    if (style.appearance !== undefined) {
      if (typeof style.appearance === 'string') {
        try {
          presentation.appearance = JSON.parse(style.appearance);
        } catch {
          presentation.appearance = { value: style.appearance };
        }
      } else if (typeof style.appearance === 'object') {
        presentation.appearance = style.appearance;
      }
    }

    const attachedToElementId = rawElement.attachedToElementId ?? style.attachedToElementId;
    if (attachedToElementId !== undefined) {
      presentation.attachedToElementId = attachedToElementId;
    }

    const attachmentSide = rawElement.attachmentSide ?? style.attachmentSide;
    if (attachmentSide !== undefined) {
      presentation.attachmentSide = attachmentSide;
    }

    const attachmentOffsetRatio = rawElement.attachmentOffsetRatio ?? style.attachmentOffsetRatio;
    if (attachmentOffsetRatio !== undefined) {
      presentation.attachmentOffsetRatio = attachmentOffsetRatio;
    }

    return presentation;
  }

  private withSyncedSpatialPosition(
    current: ModelElementPresentation | undefined,
    updates: ModelElementPresentation
  ): ModelElementPresentation {
    if (!updates.position2D || updates.position3D || !current?.position2D || !current?.position3D) {
      return updates;
    }

    return {
      ...updates,
      position3D: {
        x: current.position3D.x + (updates.position2D.x - current.position2D.x),
        y: current.position3D.y + (updates.position2D.y - current.position2D.y),
      },
    };
  }

  private mergePresentation(
    current: ModelElementPresentation | undefined,
    updates: ModelElementPresentation
  ): ModelElementPresentation {
    const syncedUpdates = this.withSyncedSpatialPosition(current, updates);

    return {
      ...(current || {}),
      ...syncedUpdates,
      position2D: syncedUpdates.position2D || current?.position2D,
      position3D: syncedUpdates.position3D || current?.position3D,
      size2D: syncedUpdates.size2D || current?.size2D,
      size3D: syncedUpdates.size3D || current?.size3D,
      appearance: syncedUpdates.appearance || current?.appearance,
    };
  }

  private stripPresentationKeys(style: Record<string, any> = {}): Record<string, any> {
    const {
      position,
      position2D,
      position3D,
      widthMm,
      heightMm,
      depthMm,
      rotationZ,
      appearance,
      linkedModelElementId,
      modelElementRefId,
      attachedToElementId,
      attachmentSide,
      attachmentOffsetRatio,
      ...modelStyle
    } = style;

    return modelStyle;
  }

  private async findDiagramOrThrow(diagramId: string): Promise<any> {
    const diagram = await prisma.diagram.findFirst({
      where: { id: diagramId },
    });

    if (!diagram) {
      throw new ApiError(404, 'View not found');
    }

    return diagram;
  }

  private async findModelOrThrow(modelId: string): Promise<any> {
    const model = await prisma.model.findFirst({
      where: { id: modelId },
    });

    if (!model) {
      throw new ApiError(404, 'Model not found');
    }

    return model;
  }

  private async getActiveRepresentationForDiagram(diagram: any, userId: string): Promise<RepresentationDescription> {
    const resolved = await viewpointService.resolveDiagramRepresentation(
      diagram.modelId,
      userId,
      diagram.viewpointId || undefined,
      diagram.representationDescriptionId || undefined
    );

    if (resolved.representationDescription.kind !== 'diagram') {
      throw new ApiError(400, 'This operation is only supported for diagram representations');
    }

    return resolved.representationDescription;
  }

  private isMetaClassVisible(representation: RepresentationDescription, metaClassId: string): boolean {
    return !representation.visibleMetaClassIds?.length || representation.visibleMetaClassIds.includes(metaClassId);
  }

  private isMetaClassCreatable(representation: RepresentationDescription, metaClassId: string): boolean {
    return !representation.creatableMetaClassIds?.length || representation.creatableMetaClassIds.includes(metaClassId);
  }

  private hasPinAttachmentMetadata(presentation?: ModelElementPresentation): boolean {
    if (!presentation) return false;
    return ['attachedToElementId', 'attachmentSide', 'attachmentOffsetRatio']
      .some(key => Object.prototype.hasOwnProperty.call(presentation, key));
  }

  private findPinMapping(
    representation: RepresentationDescription,
    pinMetaClassId: string
  ): RepresentationPinMapping | undefined {
    return representation.pinMappings?.find(mapping =>
      Array.isArray(mapping.pinMetaClassIds) && mapping.pinMetaClassIds.includes(pinMetaClassId)
    );
  }

  private validateAndApplyPinAttachment(
    modelElement: ModelElement,
    modelElements: ModelElement[],
    metamodel: Metamodel,
    representation: RepresentationDescription,
    includedElementIds: string[],
    presentation?: ModelElementPresentation
  ): ModelElement {
    if (!this.hasPinAttachmentMetadata(presentation)) {
      return modelElement;
    }

    const mapping = this.findPinMapping(representation, modelElement.modelElementId);
    if (!mapping) {
      throw new ApiError(400, 'Attached presentation metadata is only allowed for configured pin metaclasses');
    }

    const ownerId = presentation?.attachedToElementId;
    if (typeof ownerId !== 'string' || !ownerId.trim()) {
      throw new ApiError(400, 'attachedToElementId is required for pin attachment metadata');
    }
    const normalizedOwnerId = ownerId.trim();

    if (normalizedOwnerId === modelElement.id) {
      throw new ApiError(400, 'Pin owner cannot be the pin itself');
    }

    const owner = modelElements.find(element => element.id === normalizedOwnerId);
    if (!owner) {
      throw new ApiError(400, 'Pin owner element was not found in the model');
    }

    if (!includedElementIds.includes(normalizedOwnerId)) {
      throw new ApiError(400, 'Pin owner element must be included in this view');
    }

    if (!Array.isArray(mapping.ownerMetaClassIds) || !mapping.ownerMetaClassIds.includes(owner.modelElementId)) {
      throw new ApiError(400, 'Pin owner metaclass is not compatible with this pin mapping');
    }

    const side = presentation?.attachmentSide;
    if (side !== undefined && !ATTACHMENT_SIDES.includes(side as AttachmentSide)) {
      throw new ApiError(400, 'Invalid pin attachment side');
    }

    if (side !== undefined && Array.isArray(mapping.allowedSides) && mapping.allowedSides.length && !mapping.allowedSides.includes(side)) {
      throw new ApiError(400, 'Pin attachment side is not allowed by this representation');
    }

    const offsetRatio = presentation?.attachmentOffsetRatio;
    if (
      offsetRatio !== undefined
      && (
        typeof offsetRatio !== 'number'
        || !Number.isFinite(offsetRatio)
        || offsetRatio < 0
        || offsetRatio > 1
      )
    ) {
      throw new ApiError(400, 'Pin attachment offset ratio must be between 0 and 1');
    }

    const pinClass = metamodel.classes.find(cls => cls.id === modelElement.modelElementId);
    if (!pinClass) {
      throw new ApiError(400, 'Unknown pin metaclass');
    }

    const referenceName = mapping.attachmentReferenceName || 'owner';
    const ownerReference = this.getAllReferences(pinClass, metamodel).find(reference => reference.name === referenceName);
    if (!ownerReference) {
      throw new ApiError(400, `Pin attachment reference "${referenceName}" was not found on the pin metaclass`);
    }

    const references = { ...(modelElement.references || {}) };
    const isMany = ownerReference.cardinality.upperBound === '*'
      || (typeof ownerReference.cardinality.upperBound === 'number' && ownerReference.cardinality.upperBound > 1);
    references[referenceName] = isMany ? [normalizedOwnerId] : normalizedOwnerId;

    return {
      ...modelElement,
      references,
      presentation: this.mergePresentation(modelElement.presentation, {
        ...(presentation || {}),
        attachedToElementId: normalizedOwnerId,
      }),
    };
  }

  /**
   * Get all diagrams accessible by a user (owned + shared)
   */
  async getAll(userId: string): Promise<DiagramWithPermission[]> {
    // Platform admins see and can edit every diagram on the platform.
    if (await sharingService.isAdmin(userId)) {
      const all = await prisma.diagram.findMany({
        orderBy: { name: 'asc' },
        include: { user: { select: { email: true } } },
      });
      return Promise.all(all.map(async d => {
        const diagram = await this.mapToDiagramWithResolvedRepresentation(d, userId);
        return {
          ...diagram,
          isOwner: d.userId === userId,
          permission: d.userId === userId ? undefined : 'EDITOR' as const,
          ownerEmail: d.userId === userId ? undefined : d.user.email,
        };
      }));
    }

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

    const ownedResult: DiagramWithPermission[] = await Promise.all(ownedDiagrams.map(async d => {
      const diagram = await this.mapToDiagramWithResolvedRepresentation(d, userId);
      return {
        ...diagram,
        isOwner: true,
      };
    }));

    const sharedResult: DiagramWithPermission[] = await Promise.all(sharedDiagrams.map(async d => {
      const shareInfo = sharedResources.find(s => s.resourceId === d.id);
      const diagram = await this.mapToDiagramWithResolvedRepresentation(d, userId);
      return {
        ...diagram,
        isOwner: false,
        permission: shareInfo?.permission as any,
        ownerEmail: shareInfo?.owner.email,
      };
    }));

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

    const resolvedDiagram = await this.mapToDiagramWithResolvedRepresentation(diagram, userId);
    return {
      ...resolvedDiagram,
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

    const resolvedRepresentation = await viewpointService.resolveDiagramRepresentation(
      data.modelId,
      userId,
      data.viewpointId,
      data.representationDescriptionId
    );

    const diagram = await prisma.diagram.create({
      data: {
        id: data.id,
        name: data.name,
        description: data.description,
        modelId: data.modelId,
        viewpointId: resolvedRepresentation.viewpoint.id,
        representationDescriptionId: resolvedRepresentation.representationDescription.id,
        elements: (data.elements || []) as any,
        includedElementIds: (data.includedElementIds || []) as any,
        schemaVersion: 2,
        migrationWarnings: [] as any,
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

    const hasRepresentationUpdate = data.viewpointId !== undefined || data.representationDescriptionId !== undefined;
    let resolvedRepresentation: Awaited<ReturnType<typeof viewpointService.resolveDiagramRepresentation>> | null = null;
    if (hasRepresentationUpdate) {
      const existingDiagram = await this.findDiagramOrThrow(id);
      resolvedRepresentation = await viewpointService.resolveDiagramRepresentation(
        existingDiagram.modelId,
        userId,
        data.viewpointId ?? existingDiagram.viewpointId ?? undefined,
        data.representationDescriptionId ?? existingDiagram.representationDescriptionId ?? undefined
      );
    }

    const diagram = await prisma.diagram.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(resolvedRepresentation && {
          viewpointId: resolvedRepresentation.viewpoint.id,
          representationDescriptionId: resolvedRepresentation.representationDescription.id,
        }),
        ...(data.elements !== undefined && { elements: data.elements as any }),
        ...(data.includedElementIds !== undefined && { includedElementIds: Array.from(new Set(data.includedElementIds)) as any }),
        ...(data.gridSettings !== undefined && { gridSettings: data.gridSettings as any }),
        ...(data.schemaVersion !== undefined && { schemaVersion: data.schemaVersion }),
        ...(data.migrationWarnings !== undefined && { migrationWarnings: data.migrationWarnings as any }),
      },
    });

    return this.mapToDiagram(diagram);
  }

  /**
   * Delete a diagram (owner or platform admin)
   */
  async delete(id: string, userId: string, userRole: UserRole): Promise<void> {
    const existing = await prisma.diagram.findFirst({
      where: userRole === 'ADMIN' ? { id } : { id, userId },
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
   * Add a model element to a view. This is the model-backed replacement for
   * creating duplicate node instances in diagram state.
   */
  async addModelElementToView(
    diagramId: string,
    modelElementId: string,
    userId: string,
    userRole: UserRole,
    presentation?: ModelElementPresentation
  ): Promise<Diagram> {
    await this.assertCanEditDiagram(diagramId, userId, userRole);

    const diagram = await this.findDiagramOrThrow(diagramId);
    const model = await this.findModelOrThrow(diagram.modelId);
    const metamodelRow = await prisma.metamodel.findFirst({ where: { id: model.conformsToId } });
    if (!metamodelRow) {
      throw new ApiError(404, 'Metamodel not found');
    }

    const metamodel: Metamodel = {
      id: metamodelRow.id,
      name: metamodelRow.name,
      eClass: metamodelRow.eClass || '',
      uri: metamodelRow.uri,
      prefix: metamodelRow.prefix,
      classes: (metamodelRow.classes as unknown as MetaClass[]) || [],
      enums: (metamodelRow.enums as any) || [],
      constraints: (metamodelRow.constraints as any) || [],
      conformsTo: metamodelRow.conformsToId,
    };
    const modelElements = (model.elements as unknown as ModelElement[]) || [];
    const elementIndex = modelElements.findIndex(e => e.id === modelElementId);
    const representation = await this.getActiveRepresentationForDiagram(diagram, userId);

    if (elementIndex === -1) {
      throw new ApiError(404, 'Model element not found');
    }

    const includedElementIds = this.getIncludedElementIds(diagram);
    if (includedElementIds.includes(modelElementId)) {
      throw new ApiError(400, 'Model element is already included in this view');
    }

    if (!this.isMetaClassVisible(representation, modelElements[elementIndex].modelElementId)) {
      throw new ApiError(400, 'Model element is not visible in this representation description');
    }

    const hasPresentationUpdate = Boolean(presentation && Object.keys(presentation).length > 0);
    const nextPresentation = hasPresentationUpdate
      ? this.mergePresentation(modelElements[elementIndex].presentation, presentation!)
      : modelElements[elementIndex].presentation;

    if (hasPresentationUpdate || this.hasPinAttachmentMetadata(nextPresentation)) {
      modelElements[elementIndex] = this.validateAndApplyPinAttachment(
        {
          ...modelElements[elementIndex],
          presentation: nextPresentation,
        },
        modelElements,
        metamodel,
        representation,
        includedElementIds,
        nextPresentation
      );

      await prisma.model.update({
        where: { id: diagram.modelId },
        data: { elements: modelElements as any },
      });
    }

    includedElementIds.push(modelElementId);

    const updated = await prisma.diagram.update({
      where: { id: diagramId },
      data: {
        includedElementIds: includedElementIds as any,
        schemaVersion: 2,
      },
    });

    return this.mapToDiagram(updated);
  }

  async createModelElementInView(
    diagramId: string,
    metaClassId: string,
    userId: string,
    userRole: UserRole,
    presentation?: ModelElementPresentation,
    style: Record<string, any> = {}
  ): Promise<{ diagram: Diagram; modelElement: ModelElement }> {
    await this.assertCanEditDiagram(diagramId, userId, userRole);

    const diagram = await this.findDiagramOrThrow(diagramId);
    await this.assertCanEditModel(diagram.modelId, userId, userRole);

    const model = await this.findModelOrThrow(diagram.modelId);
    const metamodelRow = await prisma.metamodel.findFirst({ where: { id: model.conformsToId } });
    if (!metamodelRow) {
      throw new ApiError(404, 'Metamodel not found');
    }

    const metamodel: Metamodel = {
      id: metamodelRow.id,
      name: metamodelRow.name,
      eClass: metamodelRow.eClass || '',
      uri: metamodelRow.uri,
      prefix: metamodelRow.prefix,
      classes: (metamodelRow.classes as unknown as MetaClass[]) || [],
      enums: (metamodelRow.enums as any) || [],
      constraints: (metamodelRow.constraints as any) || [],
      conformsTo: metamodelRow.conformsToId,
    };
    const metaClass = metamodel.classes.find(cls => cls.id === metaClassId);
    const representation = await this.getActiveRepresentationForDiagram(diagram, userId);

    if (!metaClass) {
      throw new ApiError(400, 'Unknown metaclass');
    }

    if (metaClass.abstract) {
      throw new ApiError(400, 'Cannot instantiate abstract metaclass');
    }

    if (!this.isMetaClassCreatable(representation, metaClassId)) {
      throw new ApiError(400, 'Metaclass is not creatable in this representation description');
    }

    const modelElements = (model.elements as unknown as ModelElement[]) || [];
    const includedElementIds = this.getIncludedElementIds(diagram);
    const modelElement = this.validateAndApplyPinAttachment(
      this.buildModelElement(metaClass, metamodel, presentation, style),
      modelElements,
      metamodel,
      representation,
      includedElementIds,
      presentation
    );
    const nextIncludedElementIds = includedElementIds.includes(modelElement.id)
      ? includedElementIds
      : [...includedElementIds, modelElement.id];

    const [, updatedDiagram] = await prisma.$transaction([
      prisma.model.update({
        where: { id: diagram.modelId },
        data: { elements: [...modelElements, modelElement] as any },
      }),
      prisma.diagram.update({
        where: { id: diagramId },
        data: {
          includedElementIds: nextIncludedElementIds as any,
          schemaVersion: 2,
        },
      }),
    ]);

    return {
      diagram: this.mapToDiagram(updatedDiagram),
      modelElement,
    };
  }

  async addAllModelElementsToView(diagramId: string, userId: string, userRole: UserRole): Promise<Diagram> {
    await this.assertCanEditDiagram(diagramId, userId, userRole);

    const diagram = await this.findDiagramOrThrow(diagramId);
    const model = await this.findModelOrThrow(diagram.modelId);
    const modelElements = (model.elements as unknown as ModelElement[]) || [];
    const representation = await this.getActiveRepresentationForDiagram(diagram, userId);
    const includedElementIds = this.getIncludedElementIds(diagram);
    const includedSet = new Set(includedElementIds);

    for (const element of modelElements) {
      if (this.isMetaClassVisible(representation, element.modelElementId)) {
        includedSet.add(element.id);
      }
    }

    const updated = await prisma.diagram.update({
      where: { id: diagramId },
      data: {
        includedElementIds: Array.from(includedSet) as any,
        schemaVersion: 2,
      },
    });

    return this.mapToDiagram(updated);
  }

  async removeModelElementFromView(diagramId: string, modelElementId: string, userId: string, userRole: UserRole): Promise<Diagram> {
    await this.assertCanEditDiagram(diagramId, userId, userRole);

    const diagram = await this.findDiagramOrThrow(diagramId);
    const includedElementIds = this.getIncludedElementIds(diagram).filter(id => id !== modelElementId);

    const updated = await prisma.diagram.update({
      where: { id: diagramId },
      data: { includedElementIds: includedElementIds as any },
    });

    return this.mapToDiagram(updated);
  }

  async updateModelPresentation(
    diagramId: string,
    modelElementId: string,
    presentation: ModelElementPresentation,
    userId: string,
    userRole: UserRole
  ): Promise<Diagram> {
    await this.assertCanEditDiagram(diagramId, userId, userRole);

    const diagram = await this.findDiagramOrThrow(diagramId);
    const model = await this.findModelOrThrow(diagram.modelId);
    const metamodelRow = await prisma.metamodel.findFirst({ where: { id: model.conformsToId } });
    if (!metamodelRow) {
      throw new ApiError(404, 'Metamodel not found');
    }

    const metamodel: Metamodel = {
      id: metamodelRow.id,
      name: metamodelRow.name,
      eClass: metamodelRow.eClass || '',
      uri: metamodelRow.uri,
      prefix: metamodelRow.prefix,
      classes: (metamodelRow.classes as unknown as MetaClass[]) || [],
      enums: (metamodelRow.enums as any) || [],
      constraints: (metamodelRow.constraints as any) || [],
      conformsTo: metamodelRow.conformsToId,
    };
    const representation = await this.getActiveRepresentationForDiagram(diagram, userId);
    const modelElements = (model.elements as unknown as ModelElement[]) || [];
    const elementIndex = modelElements.findIndex(e => e.id === modelElementId);

    if (elementIndex === -1) {
      throw new ApiError(404, 'Model element not found');
    }

    const includedElementIds = this.getIncludedElementIds(diagram);
    if (!includedElementIds.includes(modelElementId)) {
      throw new ApiError(400, 'Model element is not included in this view');
    }

    const mergedPresentation = this.mergePresentation(modelElements[elementIndex].presentation, presentation);
    modelElements[elementIndex] = this.validateAndApplyPinAttachment(
      {
        ...modelElements[elementIndex],
        presentation: mergedPresentation,
      },
      modelElements,
      metamodel,
      representation,
      includedElementIds,
      mergedPresentation
    );

    await prisma.model.update({
      where: { id: diagram.modelId },
      data: { elements: modelElements as any },
    });

    return this.mapToDiagram(diagram);
  }

  /**
   * Add an element to a view. Legacy node requests are interpreted as view
   * membership when they target an existing model element.
   */
  async addElement(diagramId: string, element: DiagramElement, userId: string, userRole: UserRole): Promise<Diagram> {
    await this.assertCanEditDiagram(diagramId, userId, userRole);
    const diagram = await this.findDiagramOrThrow(diagramId);

    if (element.type === 'node') {
      const model = await prisma.model.findFirst({ where: { id: diagram.modelId } });
      if (model) {
        const modelElements = (model.elements as unknown as ModelElement[]) || [];
        const linkedModelElementId = element.style?.linkedModelElementId || element.style?.modelElementRefId;
        const targetModelElementId = modelElements.some(e => e.id === element.modelElementId)
          ? element.modelElementId
          : linkedModelElementId;

        if (targetModelElementId && modelElements.some(e => e.id === targetModelElementId)) {
          return this.addModelElementToView(
            diagramId,
            targetModelElementId,
            userId,
            userRole,
            this.presentationFromDiagramElement(element)
          );
        }
      }
    }

    if (element.type === 'edge' && element.sourceId && element.targetId) {
      const model = await prisma.model.findFirst({ where: { id: diagram.modelId } });
      if (model) {
        const connections = ((model.connections as unknown as ModelConnection[]) || []);
        const connection: ModelConnection = {
          id: element.id,
          sourceId: element.sourceId,
          targetId: element.targetId,
          referenceId: element.modelElementId,
          referenceName: element.style?.name,
          type: element.style?.name || element.modelElementId,
          attributes: element.referenceAttributes || {},
          bendPoints2D: element.points,
        };

        if (!connections.some(c => c.id === connection.id)) {
          connections.push(connection);
          await prisma.model.update({
            where: { id: diagram.modelId },
            data: { connections: connections as any },
          });
        }

        return this.mapToDiagram(diagram);
      }
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
    await this.assertCanEditDiagram(diagramId, userId, userRole);
    const diagram = await this.findDiagramOrThrow(diagramId);
    const includedElementIds = this.getIncludedElementIds(diagram);

    if (includedElementIds.includes(elementId)) {
      const model = await this.findModelOrThrow(diagram.modelId);
      const modelElements = (model.elements as unknown as ModelElement[]) || [];
      const elementIndex = modelElements.findIndex(e => e.id === elementId);

      if (elementIndex === -1) {
        throw new ApiError(404, 'Model element not found');
      }

      const presentation = this.presentationFromDiagramElement(updates, modelElements[elementIndex].presentation);
      const styleUpdates = this.stripPresentationKeys(updates.style || {});
      const mergedPresentation = this.mergePresentation(modelElements[elementIndex].presentation, presentation);
      let nextModelElement: ModelElement = {
        ...modelElements[elementIndex],
        style: {
          ...modelElements[elementIndex].style,
          ...styleUpdates,
        },
        presentation: mergedPresentation,
      };

      if (this.hasPinAttachmentMetadata(mergedPresentation)) {
        const metamodelRow = await prisma.metamodel.findFirst({ where: { id: model.conformsToId } });
        if (!metamodelRow) {
          throw new ApiError(404, 'Metamodel not found');
        }

        const metamodel: Metamodel = {
          id: metamodelRow.id,
          name: metamodelRow.name,
          eClass: metamodelRow.eClass || '',
          uri: metamodelRow.uri,
          prefix: metamodelRow.prefix,
          classes: (metamodelRow.classes as unknown as MetaClass[]) || [],
          enums: (metamodelRow.enums as any) || [],
          constraints: (metamodelRow.constraints as any) || [],
          conformsTo: metamodelRow.conformsToId,
        };
        const representation = await this.getActiveRepresentationForDiagram(diagram, userId);
        nextModelElement = this.validateAndApplyPinAttachment(
          nextModelElement,
          modelElements,
          metamodel,
          representation,
          includedElementIds,
          mergedPresentation
        );
      }

      modelElements[elementIndex] = nextModelElement;

      await prisma.model.update({
        where: { id: diagram.modelId },
        data: { elements: modelElements as any },
      });

      return this.mapToDiagram(diagram);
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
    await this.assertCanEditDiagram(diagramId, userId, userRole);
    const diagram = await this.findDiagramOrThrow(diagramId);
    const includedElementIds = this.getIncludedElementIds(diagram);

    if (includedElementIds.includes(elementId)) {
      return this.removeModelElementFromView(diagramId, elementId, userId, userRole);
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
      description: d.description || undefined,
      modelId: d.modelId,
      viewpointId: d.viewpointId || undefined,
      representationDescriptionId: d.representationDescriptionId || undefined,
      elements: (d.elements as DiagramElement[]) || [],
      includedElementIds: this.getIncludedElementIds(d),
      gridSettings: (d.gridSettings as GridSettings) || { sizeX: 20000, sizeY: 20000 },
      schemaVersion: d.schemaVersion || 1,
      migrationWarnings: (d.migrationWarnings as string[]) || [],
    };
  }

  private async mapToDiagramWithResolvedRepresentation(d: any, userId: string): Promise<Diagram> {
    const diagram = this.mapToDiagram(d);
    if (diagram.viewpointId && diagram.representationDescriptionId) {
      return diagram;
    }

    try {
      const resolved = await viewpointService.resolveDiagramRepresentation(
        diagram.modelId,
        userId,
        diagram.viewpointId,
        diagram.representationDescriptionId
      );

      return {
        ...diagram,
        viewpointId: resolved.viewpoint.id,
        representationDescriptionId: resolved.representationDescription.id,
      };
    } catch {
      return diagram;
    }
  }
}

export const diagramService = new DiagramService();
export default diagramService;
