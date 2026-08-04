import { Diagram, DiagramElement, ValidationIssue, ValidationResult } from '../../models/types';
import { modelService } from '../model';
import { metamodelService } from '../metamodel';
import viewpointService from '../viewpoint.service';
import { normalizePosition3D } from '../spatial';
import { concreteSyntaxResolver } from './concrete-syntax.resolver';

export type ValidationSeverity = ValidationIssue['severity'];

const severityRank: Record<ValidationSeverity, number> = {
  error: 3,
  warning: 2,
  info: 1,
};

class ViewValidationService {
  validateDiagram(diagram: Diagram): ValidationResult {
    const modelResult = modelService.validateModel(diagram.modelId);
    const issues = modelResult.issues.filter(issue => (
      !issue.elementId
      || issue.elementId === diagram.modelId
      || Boolean(this.findElementForIssue(diagram, issue))
    ));
    const model = modelService.getModelById(diagram.modelId);
    const metamodel = model ? metamodelService.getMetamodelById(model.conformsTo) : undefined;
    const { viewpoint, representationDescription } = viewpointService.resolveRepresentationDescription(diagram);

    if (model && metamodel) {
      diagram.elements
        .filter(element => element.type === 'node')
        .forEach(element => {
          const semanticId = element.style?.linkedModelElementId
            || element.style?.modelElementRefId
            || element.id;
          const semanticElement = model.elements.find(candidate => candidate.id === semanticId);
          if (!semanticElement) return;
          const position = normalizePosition3D(semanticElement.presentation?.position3D);
          if (!position || position.z === 0) return;
          const appearance = concreteSyntaxResolver.resolve3D(
            semanticElement,
            metamodel,
            representationDescription,
            viewpoint
          );
          if (appearance.verticalPlacement.mode === 'grounded') {
            issues.push({
              severity: 'warning',
              elementId: semanticElement.id,
              location: 'presentation.position3D.z',
              message: `Stored base elevation ${position.z} mm is preserved even though this representation is grounded.`,
            });
          }
        });
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  findElementForIssue(diagram: Diagram, issue: ValidationIssue): DiagramElement | undefined {
    if (!issue.elementId) return undefined;
    return diagram.elements.find(element => this.getSemanticIds(element).includes(issue.elementId!));
  }

  getElementSeverity(
    diagram: Diagram,
    element: DiagramElement,
    issues: ValidationIssue[]
  ): ValidationSeverity | undefined {
    const semanticIds = this.getSemanticIds(element);
    return issues
      .filter(issue => Boolean(issue.elementId && semanticIds.includes(issue.elementId)))
      .map(issue => issue.severity)
      .sort((left, right) => severityRank[right] - severityRank[left])[0];
  }

  private getSemanticIds(element: DiagramElement): string[] {
    return Array.from(new Set([
      element.id,
      element.style?.linkedModelElementId,
      element.style?.modelElementRefId,
    ].filter((value): value is string => typeof value === 'string' && value.length > 0)));
  }
}

export const viewValidationService = new ViewValidationService();
