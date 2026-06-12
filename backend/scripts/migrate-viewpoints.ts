import prisma from '../src/config/database';
import { v4 as uuidv4 } from 'uuid';
import {
  ConcreteSyntax,
  ConcreteSyntaxEdge,
  MetaClass,
  MetaReference,
  RepresentationDescription,
} from '../../shared/types';

const buildDefaultRepresentationDescription = (
  viewpointId: string,
  classes: MetaClass[]
): RepresentationDescription => {
  const concreteSyntaxByMetaClassId: Record<string, ConcreteSyntax> = {};
  const concreteSyntaxByReferenceId: Record<string, ConcreteSyntaxEdge> = {};

  classes.forEach(metaClass => {
    if (metaClass.concreteSyntax) {
      concreteSyntaxByMetaClassId[metaClass.id] = metaClass.concreteSyntax;
    }

    (metaClass.references || []).forEach((reference: MetaReference) => {
      if (reference.concreteSyntax) {
        concreteSyntaxByReferenceId[reference.id] = reference.concreteSyntax;
      }
    });
  });

  return {
    id: uuidv4(),
    name: 'Default Diagram',
    viewpointId,
    kind: 'diagram',
    visibleMetaClassIds: classes.map(metaClass => metaClass.id),
    creatableMetaClassIds: classes.filter(metaClass => !metaClass.abstract).map(metaClass => metaClass.id),
    concreteSyntaxByMetaClassId,
    concreteSyntaxByReferenceId,
    isDefault: true,
  };
};

async function main() {
  const metamodels = await prisma.metamodel.findMany();

  for (const metamodel of metamodels) {
    let viewpoint = await prisma.viewpoint.findFirst({
      where: { metamodelId: metamodel.id, isDefault: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!viewpoint) {
      const viewpointId = uuidv4();
      const representationDescription = buildDefaultRepresentationDescription(
        viewpointId,
        (metamodel.classes as unknown as MetaClass[]) || []
      );

      viewpoint = await prisma.viewpoint.create({
        data: {
          id: viewpointId,
          name: 'Default',
          description: 'Default modeling perspective generated from the metamodel.',
          metamodelId: metamodel.id,
          representationDescriptions: [representationDescription] as any,
          sharedConcreteSyntax: {} as any,
          isDefault: true,
          userId: metamodel.userId,
        },
      });

      console.log(`Created default viewpoint for metamodel ${metamodel.name}`);
    }

    const descriptions = (viewpoint.representationDescriptions as RepresentationDescription[]) || [];
    const defaultDiagram = descriptions.find(description => description.isDefault && description.kind === 'diagram')
      || descriptions.find(description => description.kind === 'diagram');

    if (!defaultDiagram) {
      console.warn(`No diagram representation description found for metamodel ${metamodel.name}`);
      continue;
    }

    const models = await prisma.model.findMany({ where: { conformsToId: metamodel.id } });
    const modelIds = models.map(model => model.id);
    if (modelIds.length === 0) continue;

    const result = await prisma.diagram.updateMany({
      where: {
        modelId: { in: modelIds },
        OR: [
          { viewpointId: null },
          { representationDescriptionId: null },
        ],
      },
      data: {
        viewpointId: viewpoint.id,
        representationDescriptionId: defaultDiagram.id,
      },
    });

    if (result.count > 0) {
      console.log(`Linked ${result.count} diagram(s) for metamodel ${metamodel.name}`);
    }
  }
}

main()
  .catch(error => {
    console.error('Viewpoint migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
