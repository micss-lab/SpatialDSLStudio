import prisma from '../config/database';
import { ApiError } from '../middleware';
import { v4 as uuidv4 } from 'uuid';
import {
  ConcreteSyntax,
  ConcreteSyntaxEdge,
  CreateViewpointRequest,
  MetaClass,
  MetaReference,
  Metamodel,
  RepresentationDescription,
  UpdateViewpointRequest,
  UserRole,
  Viewpoint
} from '../../../shared/types';
import { sharingService } from './sharing.service';
import { canPerformOperation } from '../middleware/permissions';

const REPRESENTATION_KINDS = new Set(['diagram', 'table', 'tree']);
const ATTACHMENT_SIDES = new Set(['top', 'right', 'bottom', 'left']);
const PIN_DIRECTIONS = new Set(['input', 'output', 'inout']);

class ViewpointService {
  private mapToMetamodel(row: any): Metamodel {
    return {
      id: row.id,
      name: row.name,
      eClass: row.eClass || '',
      uri: row.uri,
      prefix: row.prefix,
      classes: (row.classes as unknown as MetaClass[]) || [],
      enums: row.enums || [],
      constraints: row.constraints || [],
      conformsTo: row.conformsToId,
    };
  }

  private mapToViewpoint(row: any): Viewpoint {
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      metamodelId: row.metamodelId,
      representationDescriptions: (row.representationDescriptions as RepresentationDescription[]) || [],
      sharedConcreteSyntaxByMetaClassId: (row.sharedConcreteSyntax as Record<string, ConcreteSyntax>) || {},
      isDefault: row.isDefault,
    };
  }

  private buildDefaultRepresentationDescription(viewpointId: string, metamodel: Metamodel): RepresentationDescription {
    const visibleMetaClassIds = metamodel.classes.map(metaClass => metaClass.id);
    const creatableMetaClassIds = metamodel.classes
      .filter(metaClass => !metaClass.abstract)
      .map(metaClass => metaClass.id);
    const concreteSyntaxByMetaClassId: Record<string, ConcreteSyntax> = {};
    const concreteSyntaxByReferenceId: Record<string, ConcreteSyntaxEdge> = {};

    for (const metaClass of metamodel.classes) {
      if (metaClass.concreteSyntax) {
        concreteSyntaxByMetaClassId[metaClass.id] = metaClass.concreteSyntax;
      }

      for (const reference of metaClass.references || []) {
        if ((reference as MetaReference).concreteSyntax) {
          concreteSyntaxByReferenceId[reference.id] = (reference as MetaReference).concreteSyntax!;
        }
      }
    }

    return {
      id: uuidv4(),
      name: 'Default Diagram',
      viewpointId,
      kind: 'diagram',
      visibleMetaClassIds,
      creatableMetaClassIds,
      concreteSyntaxByMetaClassId,
      concreteSyntaxByReferenceId,
      isDefault: true,
    };
  }

  private async assertCanReadMetamodel(metamodelId: string, userId: string): Promise<void> {
    const access = await sharingService.checkAccess('METAMODEL', metamodelId, userId);
    if (!access.hasAccess) {
      throw new ApiError(404, 'Metamodel not found');
    }
  }

  private async assertCanEditMetamodel(metamodelId: string, userId: string, userRole: UserRole): Promise<any> {
    if (!canPerformOperation(userRole, 'metamodel', 'create')) {
      throw new ApiError(403, 'Your role does not allow editing viewpoints');
    }

    const access = await sharingService.checkAccess('METAMODEL', metamodelId, userId);
    if (!access.hasAccess) {
      throw new ApiError(404, 'Metamodel not found');
    }

    if (!access.isOwner && access.permission !== 'EDITOR') {
      throw new ApiError(403, 'You do not have permission to modify this metamodel');
    }

    const metamodel = await prisma.metamodel.findFirst({ where: { id: metamodelId } });
    if (!metamodel) {
      throw new ApiError(404, 'Metamodel not found');
    }

    return metamodel;
  }

  private normalizeName(value: unknown, fieldName: string): string {
    if (typeof value !== 'string') {
      throw new ApiError(400, `${fieldName} is required`);
    }

    const name = value.trim();
    if (!name) {
      throw new ApiError(400, `${fieldName} is required`);
    }

    return name;
  }

  private nameKey(value: string): string {
    return value.trim().toLowerCase();
  }

  private uniqueStringIds(values: unknown, fieldName: string): string[] {
    if (values === undefined) {
      return [];
    }

    if (!Array.isArray(values)) {
      throw new ApiError(400, `${fieldName} must be an array`);
    }

    const ids: string[] = [];
    for (const value of values) {
      if (typeof value !== 'string' || !value.trim()) {
        throw new ApiError(400, `${fieldName} must contain non-empty string IDs`);
      }
      const id = value.trim();
      if (!ids.includes(id)) {
        ids.push(id);
      }
    }

    return ids;
  }

  private normalizePinMappings(value: unknown): RepresentationDescription['pinMappings'] {
    if (value === undefined) {
      return undefined;
    }

    if (!Array.isArray(value)) {
      throw new ApiError(400, 'pinMappings must be an array');
    }

    return value.map((mapping, index) => {
      if (!mapping || typeof mapping !== 'object') {
        throw new ApiError(400, `pinMappings[${index}] must be an object`);
      }

      const candidate = mapping as Record<string, any>;
      const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : uuidv4();
      const pinMetaClassIds = this.uniqueStringIds(candidate.pinMetaClassIds, `pinMappings[${index}].pinMetaClassIds`);
      const ownerMetaClassIds = this.uniqueStringIds(candidate.ownerMetaClassIds, `pinMappings[${index}].ownerMetaClassIds`);

      if (pinMetaClassIds.length === 0) {
        throw new ApiError(400, `pinMappings[${index}].pinMetaClassIds must not be empty`);
      }

      if (ownerMetaClassIds.length === 0) {
        throw new ApiError(400, `pinMappings[${index}].ownerMetaClassIds must not be empty`);
      }

      const allowedSides = candidate.allowedSides === undefined
        ? undefined
        : this.uniqueStringIds(candidate.allowedSides, `pinMappings[${index}].allowedSides`);
      if (allowedSides?.some(side => !ATTACHMENT_SIDES.has(side))) {
        throw new ApiError(400, `pinMappings[${index}].allowedSides contains an invalid side`);
      }

      if (candidate.defaultSide !== undefined && !ATTACHMENT_SIDES.has(candidate.defaultSide)) {
        throw new ApiError(400, `pinMappings[${index}].defaultSide is invalid`);
      }

      if (
        candidate.defaultSide !== undefined
        && allowedSides?.length
        && !allowedSides.includes(candidate.defaultSide)
      ) {
        throw new ApiError(400, `pinMappings[${index}].defaultSide must be one of allowedSides`);
      }

      if (
        candidate.defaultOffsetRatio !== undefined
        && (
          typeof candidate.defaultOffsetRatio !== 'number'
          || !Number.isFinite(candidate.defaultOffsetRatio)
          || candidate.defaultOffsetRatio < 0
          || candidate.defaultOffsetRatio > 1
        )
      ) {
        throw new ApiError(400, `pinMappings[${index}].defaultOffsetRatio must be between 0 and 1`);
      }

      if (candidate.direction !== undefined && !PIN_DIRECTIONS.has(candidate.direction)) {
        throw new ApiError(400, `pinMappings[${index}].direction is invalid`);
      }

      return {
        id,
        pinMetaClassIds,
        ownerMetaClassIds,
        ...(typeof candidate.attachmentReferenceName === 'string' && candidate.attachmentReferenceName.trim() && {
          attachmentReferenceName: candidate.attachmentReferenceName.trim(),
        }),
        ...(candidate.direction !== undefined && { direction: candidate.direction }),
        ...(allowedSides !== undefined && { allowedSides: allowedSides as Array<'top' | 'right' | 'bottom' | 'left'> }),
        ...(candidate.defaultSide !== undefined && { defaultSide: candidate.defaultSide }),
        ...(candidate.defaultOffsetRatio !== undefined && { defaultOffsetRatio: candidate.defaultOffsetRatio }),
      };
    });
  }

  private normalizeRepresentationDescriptions(
    viewpointId: string,
    descriptions: unknown
  ): RepresentationDescription[] {
    if (descriptions === undefined) {
      return [];
    }

    if (!Array.isArray(descriptions)) {
      throw new ApiError(400, 'representationDescriptions must be an array');
    }

    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    const defaultByKind = new Set<string>();

    const normalized = descriptions.map((description, index) => {
      if (!description || typeof description !== 'object') {
        throw new ApiError(400, `representationDescriptions[${index}] must be an object`);
      }

      const candidate = description as Record<string, any>;
      const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : uuidv4();
      if (seenIds.has(id)) {
        throw new ApiError(400, 'Representation description IDs must be unique within a viewpoint');
      }
      seenIds.add(id);

      const name = this.normalizeName(candidate.name, 'Representation description name');
      const nameKey = this.nameKey(name);
      if (seenNames.has(nameKey)) {
        throw new ApiError(409, 'Representation description name must be unique within a viewpoint');
      }
      seenNames.add(nameKey);

      if (typeof candidate.kind !== 'string' || !REPRESENTATION_KINDS.has(candidate.kind)) {
        throw new ApiError(400, 'Representation description kind must be diagram, table, or tree');
      }

      const isDefault = candidate.isDefault === true && !defaultByKind.has(candidate.kind);
      if (isDefault) {
        defaultByKind.add(candidate.kind);
      }

      return {
        id,
        name,
        ...(typeof candidate.description === 'string' && { description: candidate.description }),
        viewpointId,
        kind: candidate.kind,
        visibleMetaClassIds: this.uniqueStringIds(candidate.visibleMetaClassIds, 'visibleMetaClassIds'),
        creatableMetaClassIds: this.uniqueStringIds(candidate.creatableMetaClassIds, 'creatableMetaClassIds'),
        ...(candidate.concreteSyntaxByMetaClassId !== undefined && {
          concreteSyntaxByMetaClassId: candidate.concreteSyntaxByMetaClassId,
        }),
        ...(candidate.concreteSyntaxByReferenceId !== undefined && {
          concreteSyntaxByReferenceId: candidate.concreteSyntaxByReferenceId,
        }),
        ...(candidate.edgeMappings !== undefined && { edgeMappings: candidate.edgeMappings }),
        ...(candidate.pinMappings !== undefined && {
          pinMappings: this.normalizePinMappings(candidate.pinMappings),
        }),
        ...(candidate.toolDefinitions !== undefined && { toolDefinitions: candidate.toolDefinitions }),
        isDefault,
      } as RepresentationDescription;
    });

    if (!normalized.some(description => description.kind === 'diagram' && description.isDefault)) {
      const firstDiagram = normalized.find(description => description.kind === 'diagram');
      if (firstDiagram) {
        firstDiagram.isDefault = true;
      }
    }

    return normalized;
  }

  private async assertUniqueViewpointName(
    metamodelId: string,
    name: string,
    excludeViewpointId?: string
  ): Promise<void> {
    const existing = await prisma.viewpoint.findMany({
      where: { metamodelId },
      select: { id: true, name: true },
    });

    const nameKey = this.nameKey(name);
    if (existing.some(viewpoint => viewpoint.id !== excludeViewpointId && this.nameKey(viewpoint.name) === nameKey)) {
      throw new ApiError(409, 'Viewpoint name must be unique within this metamodel');
    }
  }

  private async generateUniqueDefaultName(metamodelId: string): Promise<string> {
    const existing = await prisma.viewpoint.findMany({
      where: { metamodelId },
      select: { name: true },
    });
    const existingNames = new Set(existing.map(viewpoint => this.nameKey(viewpoint.name)));

    if (!existingNames.has(this.nameKey('Default'))) {
      return 'Default';
    }

    let suffix = 2;
    while (existingNames.has(this.nameKey(`Default ${suffix}`))) {
      suffix += 1;
    }

    return `Default ${suffix}`;
  }

  async getAll(userId: string, metamodelId?: string): Promise<Viewpoint[]> {
    if (metamodelId) {
      await this.assertCanReadMetamodel(metamodelId, userId);
    }

    // Platform admins see and can edit every viewpoint on the platform.
    if (await sharingService.isAdmin(userId)) {
      const allViewpoints = await prisma.viewpoint.findMany({
        where: metamodelId ? { metamodelId } : {},
        orderBy: [{ metamodelId: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
      });
      return allViewpoints.map(row => this.mapToViewpoint(row));
    }

    const ownedMetamodelIds = await prisma.metamodel.findMany({
      where: metamodelId ? { id: metamodelId, userId } : { userId },
      select: { id: true },
    });

    const sharedResources = await prisma.sharedResource.findMany({
      where: {
        sharedWithId: userId,
        resourceType: 'METAMODEL',
        ...(metamodelId ? { resourceId: metamodelId } : {}),
      },
      select: { resourceId: true },
    });

    const accessibleMetamodelIds = Array.from(new Set([
      ...ownedMetamodelIds.map(row => row.id),
      ...sharedResources.map(resource => resource.resourceId),
    ]));

    if (accessibleMetamodelIds.length === 0) {
      return [];
    }

    const viewpoints = await prisma.viewpoint.findMany({
      where: {
        metamodelId: { in: accessibleMetamodelIds },
      },
      orderBy: [{ metamodelId: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
    });

    return viewpoints.map(row => this.mapToViewpoint(row));
  }

  async getById(id: string, userId: string): Promise<Viewpoint | null> {
    const viewpoint = await prisma.viewpoint.findFirst({ where: { id } });
    if (!viewpoint) return null;

    const access = await sharingService.checkAccess('METAMODEL', viewpoint.metamodelId, userId);
    if (!access.hasAccess) return null;

    return this.mapToViewpoint(viewpoint);
  }

  async getDefaultForMetamodel(metamodelId: string, userId: string): Promise<Viewpoint> {
    await this.assertCanReadMetamodel(metamodelId, userId);

    const existing = await prisma.viewpoint.findFirst({
      where: { metamodelId, isDefault: true },
      orderBy: { createdAt: 'asc' },
    });

    if (existing) {
      return this.mapToViewpoint(existing);
    }

    const metamodelRow = await prisma.metamodel.findFirst({ where: { id: metamodelId } });
    if (!metamodelRow) {
      throw new ApiError(404, 'Metamodel not found');
    }

    const metamodel = this.mapToMetamodel(metamodelRow);
    const viewpointId = uuidv4();
    const representationDescription = this.buildDefaultRepresentationDescription(viewpointId, metamodel);

    const defaultName = await this.generateUniqueDefaultName(metamodelId);
    const created = await prisma.viewpoint.create({
      data: {
        id: viewpointId,
        name: defaultName,
        description: 'Default modeling perspective generated from the metamodel.',
        metamodelId,
        representationDescriptions: [representationDescription] as any,
        sharedConcreteSyntax: {} as any,
        isDefault: true,
        userId: metamodelRow.userId,
      },
    });

    return this.mapToViewpoint(created);
  }

  async create(data: CreateViewpointRequest, userId: string, userRole: UserRole): Promise<Viewpoint> {
    const metamodelRow = await this.assertCanEditMetamodel(data.metamodelId, userId, userRole);

    const viewpointId = data.id || uuidv4();
    const name = this.normalizeName(data.name, 'Name');
    await this.assertUniqueViewpointName(data.metamodelId, name);
    const representationDescriptions = this.normalizeRepresentationDescriptions(
      viewpointId,
      data.representationDescriptions || []
    );
    const isDefault = data.isDefault === true;

    const createOperation = prisma.viewpoint.create({
      data: {
        id: viewpointId,
        name,
        description: data.description,
        metamodelId: data.metamodelId,
        representationDescriptions: representationDescriptions as any,
        sharedConcreteSyntax: (data.sharedConcreteSyntaxByMetaClassId || {}) as any,
        isDefault,
        userId: metamodelRow.userId,
      },
    });

    const created = isDefault
      ? (await prisma.$transaction([
          prisma.viewpoint.updateMany({
            where: { metamodelId: data.metamodelId, id: { not: viewpointId }, isDefault: true },
            data: { isDefault: false },
          }),
          createOperation,
        ]))[1]
      : await createOperation;

    return this.mapToViewpoint(created);
  }

  async update(id: string, data: UpdateViewpointRequest, userId: string, userRole: UserRole): Promise<Viewpoint> {
    const existing = await prisma.viewpoint.findFirst({ where: { id } });
    if (!existing) {
      throw new ApiError(404, 'Viewpoint not found');
    }

    await this.assertCanEditMetamodel(existing.metamodelId, userId, userRole);

    const nextName = data.name !== undefined ? this.normalizeName(data.name, 'Name') : undefined;
    if (nextName !== undefined) {
      await this.assertUniqueViewpointName(existing.metamodelId, nextName, id);
    }

    const representationDescriptions = data.representationDescriptions !== undefined
      ? this.normalizeRepresentationDescriptions(id, data.representationDescriptions)
      : undefined;

    const updateOperation = prisma.viewpoint.update({
      where: { id },
      data: {
        ...(nextName !== undefined && { name: nextName }),
        ...(data.description !== undefined && { description: data.description }),
        ...(representationDescriptions !== undefined && { representationDescriptions: representationDescriptions as any }),
        ...(data.sharedConcreteSyntaxByMetaClassId !== undefined && {
          sharedConcreteSyntax: data.sharedConcreteSyntaxByMetaClassId as any,
        }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault === true }),
      },
    });

    const updated = data.isDefault === true
      ? (await prisma.$transaction([
          prisma.viewpoint.updateMany({
            where: { metamodelId: existing.metamodelId, id: { not: id }, isDefault: true },
            data: { isDefault: false },
          }),
          updateOperation,
        ]))[1]
      : await updateOperation;

    return this.mapToViewpoint(updated);
  }

  async delete(id: string, userId: string, userRole: UserRole): Promise<void> {
    const existing = await prisma.viewpoint.findFirst({ where: { id } });
    if (!existing) {
      throw new ApiError(404, 'Viewpoint not found');
    }

    await this.assertCanEditMetamodel(existing.metamodelId, userId, userRole);

    await prisma.viewpoint.delete({ where: { id } });
  }

  getRepresentationDescription(viewpoint: Viewpoint, representationDescriptionId?: string): RepresentationDescription | undefined {
    if (representationDescriptionId) {
      return viewpoint.representationDescriptions.find(description => description.id === representationDescriptionId);
    }

    return viewpoint.representationDescriptions.find(description => description.isDefault && description.kind === 'diagram')
      || viewpoint.representationDescriptions.find(description => description.kind === 'diagram')
      || viewpoint.representationDescriptions[0];
  }

  async resolveDiagramRepresentation(
    modelId: string,
    userId: string,
    viewpointId?: string,
    representationDescriptionId?: string
  ): Promise<{ viewpoint: Viewpoint; representationDescription: RepresentationDescription }> {
    const model = await prisma.model.findFirst({ where: { id: modelId } });
    if (!model) {
      throw new ApiError(404, 'Model not found');
    }

    let viewpoint = viewpointId
      ? await this.getById(viewpointId, userId)
      : await this.getDefaultForMetamodel(model.conformsToId, userId);

    if (!viewpoint) {
      throw new ApiError(400, 'Selected viewpoint not found');
    }

    if (viewpoint.metamodelId !== model.conformsToId) {
      throw new ApiError(400, 'Selected viewpoint does not belong to the model metamodel');
    }

    const representationDescription = this.getRepresentationDescription(viewpoint, representationDescriptionId);
    if (!representationDescription) {
      throw new ApiError(400, 'Selected representation description not found');
    }

    if (representationDescription.kind !== 'diagram') {
      throw new ApiError(400, 'Only diagram representation descriptions can be opened in the current editor');
    }

    return { viewpoint, representationDescription };
  }

  async addRepresentationDescription(
    viewpointId: string,
    description: RepresentationDescription,
    userId: string,
    userRole: UserRole
  ): Promise<Viewpoint> {
    const existing = await prisma.viewpoint.findFirst({ where: { id: viewpointId } });
    if (!existing) {
      throw new ApiError(404, 'Viewpoint not found');
    }

    const descriptions = ((existing.representationDescriptions as unknown as RepresentationDescription[]) || []);
    await this.assertCanEditMetamodel(existing.metamodelId, userId, userRole);

    return this.update(
      viewpointId,
      { representationDescriptions: [...descriptions, { ...description, viewpointId }] },
      userId,
      userRole
    );
  }

  async updateRepresentationDescription(
    viewpointId: string,
    representationDescriptionId: string,
    data: Partial<RepresentationDescription>,
    userId: string,
    userRole: UserRole
  ): Promise<Viewpoint> {
    const existing = await prisma.viewpoint.findFirst({ where: { id: viewpointId } });
    if (!existing) {
      throw new ApiError(404, 'Viewpoint not found');
    }

    await this.assertCanEditMetamodel(existing.metamodelId, userId, userRole);

    const descriptions = ((existing.representationDescriptions as unknown as RepresentationDescription[]) || []);
    const index = descriptions.findIndex(description => description.id === representationDescriptionId);
    if (index === -1) {
      throw new ApiError(404, 'Representation description not found');
    }

    descriptions[index] = {
      ...descriptions[index],
      ...data,
      id: representationDescriptionId,
      viewpointId,
    };

    return this.update(viewpointId, { representationDescriptions: descriptions }, userId, userRole);
  }

  async deleteRepresentationDescription(
    viewpointId: string,
    representationDescriptionId: string,
    userId: string,
    userRole: UserRole
  ): Promise<Viewpoint> {
    const existing = await prisma.viewpoint.findFirst({ where: { id: viewpointId } });
    if (!existing) {
      throw new ApiError(404, 'Viewpoint not found');
    }

    await this.assertCanEditMetamodel(existing.metamodelId, userId, userRole);

    const existingDescriptions = ((existing.representationDescriptions as unknown as RepresentationDescription[]) || []);
    if (!existingDescriptions.some(description => description.id === representationDescriptionId)) {
      throw new ApiError(404, 'Representation description not found');
    }

    const descriptions = existingDescriptions.filter(description => description.id !== representationDescriptionId);

    return this.update(viewpointId, { representationDescriptions: descriptions }, userId, userRole);
  }
}

export const viewpointService = new ViewpointService();
export default viewpointService;
