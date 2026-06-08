import prisma from '../src/config/database';

type MetaClassLike = {
  id: string;
  concreteSyntax?: {
    two_d?: Record<string, any>;
    three_d?: Record<string, any>;
  };
};

type ModelElementLike = {
  id: string;
  modelElementId: string;
  style?: Record<string, any>;
  presentation?: Record<string, any>;
};

const stableStringify = (value: any): string => {
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  const ordered = Object.keys(value).sort().reduce<Record<string, any>>((acc, key) => {
    acc[key] = value[key];
    return acc;
  }, {});
  return JSON.stringify(ordered);
};

const parseAppearance = (element: ModelElementLike): Record<string, any> | null => {
  if (element.presentation?.appearance && typeof element.presentation.appearance === 'object') {
    return element.presentation.appearance;
  }

  const raw = element.style?.appearance;
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

async function main() {
  const metamodels = await prisma.metamodel.findMany();
  let migratedMetaclasses = 0;
  let clearedOverrides = 0;

  for (const metamodel of metamodels) {
    const classes = ((metamodel.classes as any[]) || []) as MetaClassLike[];
    const models = await prisma.model.findMany({ where: { conformsToId: metamodel.id } });
    const classAppearance = new Map<string, Record<string, any>>();

    for (const metaClass of classes) {
      const counts = new Map<string, { count: number; appearance: Record<string, any> }>();

      for (const model of models) {
        const elements = ((model.elements as any[]) || []) as ModelElementLike[];
        elements
          .filter(element => element.modelElementId === metaClass.id)
          .forEach(element => {
            const appearance = parseAppearance(element);
            if (!appearance) return;
            const key = stableStringify(appearance);
            const current = counts.get(key) || { count: 0, appearance };
            counts.set(key, { ...current, count: current.count + 1 });
          });
      }

      const modal = Array.from(counts.values()).sort((a, b) => b.count - a.count)[0];
      if (!modal) continue;

      metaClass.concreteSyntax = {
        ...(metaClass.concreteSyntax || {}),
        two_d: {
          ...(metaClass.concreteSyntax?.two_d || {}),
          ...modal.appearance
        }
      };
      classAppearance.set(metaClass.id, modal.appearance);
      migratedMetaclasses += 1;
    }

    if (classAppearance.size > 0) {
      await prisma.metamodel.update({
        where: { id: metamodel.id },
        data: { classes: classes as any }
      });
    }

    for (const model of models) {
      let changed = false;
      const elements = ((model.elements as any[]) || []) as ModelElementLike[];
      elements.forEach(element => {
        const modal = classAppearance.get(element.modelElementId);
        const appearance = parseAppearance(element);
        if (!modal || !appearance || stableStringify(modal) !== stableStringify(appearance)) return;

        if (element.presentation?.appearance) {
          delete element.presentation.appearance;
          changed = true;
        }
        if (element.style?.appearance) {
          delete element.style.appearance;
          changed = true;
        }
        clearedOverrides += 1;
      });

      if (changed) {
        await prisma.model.update({
          where: { id: model.id },
          data: { elements: elements as any }
        });
      }
    }
  }

  console.log(`Migrated ${migratedMetaclasses} metaclass notation defaults.`);
  console.log(`Cleared ${clearedOverrides} matching instance appearance override(s).`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
