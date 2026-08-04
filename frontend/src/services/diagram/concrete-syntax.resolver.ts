import {
  ConcreteSyntax2D,
  ConcreteSyntax3D,
  ConcreteSyntaxEdge,
  DiagramElement,
  MetaClass,
  Metamodel,
  Model,
  ModelConnection,
  ModelElement,
  RepresentationDescription,
  VerticalPlacement3D,
  Viewpoint,
} from '../../models/types';

export interface ResolvedAppearance2D extends ConcreteSyntax2D {
  type: string;
  color: string;
  shape: NonNullable<ConcreteSyntax2D['shape']>;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  widthMm?: number;
  heightMm?: number;
  depthMm?: number;
  imageSrc?: string;
  modelSrc?: string;
  modelUrl?: string;
  modelFileId?: string;
}

export interface ResolvedAppearance3D extends ConcreteSyntax3D {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  fallbackShape: NonNullable<ConcreteSyntax3D['fallbackShape']>;
  fallbackColor: string;
  verticalPlacement: VerticalPlacement3D;
}

const DEFAULT_2D: ResolvedAppearance2D = {
  type: 'rectangle',
  shape: 'rectangle',
  color: '#4287f5',
  fillColor: '#4287f5',
  strokeColor: 'black',
  strokeWidth: 1,
  fontSize: 12,
  fontFamily: 'Arial',
  fontColor: 'black'
};

const DEFAULT_3D: ResolvedAppearance3D = {
  fallbackShape: 'box',
  fallbackColor: '#4287f5',
  widthMm: 500,
  heightMm: 800,
  depthMm: 200,
  defaultSizeMm: { widthMm: 500, heightMm: 800, depthMm: 200 },
  verticalPlacement: { mode: 'grounded' },
};

const DEFAULT_EDGE: ConcreteSyntaxEdge = {
  lineColor: 'black',
  lineWidth: 2,
  arrowHead: 'filled'
};

class ConcreteSyntaxResolver {
  resolve2D(
    element: ModelElement,
    metamodel?: Metamodel | null,
    representationDescription?: RepresentationDescription,
    viewpoint?: Viewpoint
  ): ResolvedAppearance2D {
    const metaClass = this.findMetaClass(metamodel, element.modelElementId);
    const inherited = this.inheritedConcreteSyntax(metaClass, metamodel, 'two_d') as ConcreteSyntax2D;
    const viewpointSyntax = viewpoint?.sharedConcreteSyntaxByMetaClassId?.[element.modelElementId]?.two_d || {};
    const representationSyntax = representationDescription?.concreteSyntaxByMetaClassId?.[element.modelElementId]?.two_d || {};
    const instance = this.parseInstanceAppearance(element);
    const resolved = {
      ...DEFAULT_2D,
      ...inherited,
      ...viewpointSyntax,
      ...representationSyntax,
      ...instance
    };

    if (!resolved.shape && (resolved as any).type) resolved.shape = (resolved as any).type;
    resolved.type = resolved.shape || resolved.type || 'rectangle';
    resolved.color = resolved.fillColor || resolved.color || DEFAULT_2D.color;
    return resolved;
  }

  resolve3D(
    element: ModelElement,
    metamodel?: Metamodel | null,
    representationDescription?: RepresentationDescription,
    viewpoint?: Viewpoint
  ): ResolvedAppearance3D {
    const metaClass = this.findMetaClass(metamodel, element.modelElementId);
    const inherited = this.inheritedConcreteSyntax(metaClass, metamodel, 'three_d') as ConcreteSyntax3D;
    const viewpointSyntax = viewpoint?.sharedConcreteSyntaxByMetaClassId?.[element.modelElementId]?.three_d || {};
    const representationSyntax = representationDescription?.concreteSyntaxByMetaClassId?.[element.modelElementId]?.three_d || {};
    const instance = this.parseInstanceAppearance(element);
    const defaultSizeMm = instance.defaultSizeMm
      || representationSyntax.defaultSizeMm
      || viewpointSyntax.defaultSizeMm
      || inherited?.defaultSizeMm
      || DEFAULT_3D.defaultSizeMm!;
    const verticalPlacement = instance.verticalPlacement
      || representationSyntax.verticalPlacement
      || viewpointSyntax.verticalPlacement
      || inherited?.verticalPlacement
      || DEFAULT_3D.verticalPlacement;

    return {
      ...DEFAULT_3D,
      ...inherited,
      ...viewpointSyntax,
      ...representationSyntax,
      ...instance,
      widthMm: instance.widthMm ?? defaultSizeMm.widthMm,
      heightMm: instance.heightMm ?? defaultSizeMm.heightMm,
      depthMm: instance.depthMm ?? defaultSizeMm.depthMm,
      verticalPlacement: {
        mode: verticalPlacement.mode === 'adjustable' ? 'adjustable' : 'grounded',
        ...(verticalPlacement.defaultBaseZMm !== undefined && {
          defaultBaseZMm: verticalPlacement.defaultBaseZMm,
        }),
        ...(verticalPlacement.minBaseZMm !== undefined && {
          minBaseZMm: verticalPlacement.minBaseZMm,
        }),
        ...(verticalPlacement.maxBaseZMm !== undefined && {
          maxBaseZMm: verticalPlacement.maxBaseZMm,
        }),
        ...(verticalPlacement.stepMm !== undefined && { stepMm: verticalPlacement.stepMm }),
      },
      fallbackColor: instance.fallbackColor
        || instance.fillColor
        || instance.color
        || representationSyntax.fallbackColor
        || viewpointSyntax.fallbackColor
        || inherited?.fallbackColor
        || DEFAULT_3D.fallbackColor
    };
  }

  resolveDiagramElementAppearance(
    element: DiagramElement,
    model?: Model | null,
    metamodel?: Metamodel | null,
    representationDescription?: RepresentationDescription,
    viewpoint?: Viewpoint
  ): ResolvedAppearance2D {
    const linkedElement = this.findLinkedModelElement(element, model);
    if (linkedElement) {
      return {
        ...this.resolve2D(linkedElement, metamodel, representationDescription, viewpoint),
        ...this.parseAppearance(element.style?.appearance),
      };
    }

    return {
      ...DEFAULT_2D,
      ...this.parseAppearance(element.style?.appearance)
    };
  }

  resolveEdge(
    connection: ModelConnection | DiagramElement,
    metamodel?: Metamodel | null,
    representationDescription?: RepresentationDescription
  ): ConcreteSyntaxEdge {
    const referenceId = 'modelElementId' in connection
      ? connection.modelElementId
      : connection.referenceId;
    const referenceName = 'style' in connection
      ? connection.style?.name
      : connection.referenceName || connection.type;

    const reference = metamodel?.classes
      .flatMap(cls => cls.references)
      .find(ref => ref.id === referenceId || ref.name === referenceName);

    return {
      ...DEFAULT_EDGE,
      ...(reference?.concreteSyntax || {}),
      ...(referenceId ? representationDescription?.concreteSyntaxByReferenceId?.[referenceId] || {} : {}),
      ...(referenceName ? this.findEdgeMappingSyntax(representationDescription, referenceName, referenceId) : {}),
      ...this.parseAppearance('style' in connection ? connection.style?.appearance : undefined)
    };
  }

  private findEdgeMappingSyntax(
    representationDescription: RepresentationDescription | undefined,
    referenceName: string,
    referenceId?: string
  ): ConcreteSyntaxEdge {
    return representationDescription?.edgeMappings?.find(mapping => (
      (referenceId && mapping.referenceId === referenceId) || mapping.referenceName === referenceName
    ))?.concreteSyntax || {};
  }

  private findLinkedModelElement(element: DiagramElement, model?: Model | null): ModelElement | undefined {
    if (!model) return undefined;
    const linkedId = element.style?.linkedModelElementId || element.style?.modelElementRefId || element.id;
    return model.elements.find(candidate => candidate.id === linkedId);
  }

  private parseInstanceAppearance(element: ModelElement): Record<string, any> {
    return {
      ...this.parseAppearance(element.style?.appearance),
      ...(element.presentation?.appearance || {})
    };
  }

  private parseAppearance(value: unknown): Record<string, any> {
    if (!value) return {};
    if (typeof value === 'object') {
      const parsed = { ...(value as Record<string, any>) };
      if (parsed.type && !parsed.shape) parsed.shape = parsed.type;
      return parsed;
    }
    if (typeof value !== 'string') return {};

    try {
      const parsed = JSON.parse(value);
      if (parsed.type && !parsed.shape) parsed.shape = parsed.type;
      return parsed;
    } catch {
      return {};
    }
  }

  private inheritedConcreteSyntax(
    metaClass: MetaClass | undefined,
    metamodel: Metamodel | undefined | null,
    key: 'two_d' | 'three_d'
  ): ConcreteSyntax2D | ConcreteSyntax3D {
    if (!metaClass || !metamodel) return {};
    if (metaClass.concreteSyntax?.[key]) return metaClass.concreteSyntax[key] || {};

    for (const superTypeId of metaClass.superTypes || []) {
      const inherited = this.inheritedConcreteSyntax(this.findMetaClass(metamodel, superTypeId), metamodel, key);
      // Multiple inheritance follows declared superTypes order; the first ancestor notation wins.
      if (Object.keys(inherited).length > 0) return inherited;
    }

    return {};
  }

  private findMetaClass(metamodel: Metamodel | undefined | null, classId: string): MetaClass | undefined {
    return metamodel?.classes.find(cls => cls.id === classId);
  }
}

export const concreteSyntaxResolver = new ConcreteSyntaxResolver();
export const defaultResolvedAppearance2D = DEFAULT_2D;
