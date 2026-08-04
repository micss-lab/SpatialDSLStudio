import JSZip from 'jszip';
import {
  SiriusAirdImportResult,
  SiriusAirdPreview,
  SiriusCompatibilityReport,
  SiriusExportOptions,
  SiriusExportResult,
  SiriusImportOptions,
  SiriusImportResult,
  SiriusInteropWarning,
  SiriusOdesignPreview,
  SiriusProjectExportResult,
  SiriusSourceFormat,
  ModelElementPresentation,
} from '../../models/types';
import { apiClient, API_ENDPOINTS } from '../core';
import { modelService } from '../model';
import { normalizePosition3D, validatePresentation } from '../spatial';

interface SpatialDslPresentationSidecar {
  schemaVersion: 1;
  model: { id: string; name?: string; metamodelId?: string };
  elements: Record<string, ModelElementPresentation>;
}

interface SiriusProjectBundle {
  odesignContent?: string;
  odesignPath?: string;
  presentationSidecar?: SpatialDslPresentationSidecar;
  presentationSidecarPath?: string;
  warnings: SiriusInteropWarning[];
  unresolvedReferences: SiriusInteropWarning[];
}

export interface SiriusProjectZipExportResult {
  filename: string;
  blob: Blob;
  report: SiriusCompatibilityReport;
}

class SiriusInteropService {
  async validateOdesign(
    content: string,
    metamodelId?: string,
    options?: Partial<SiriusImportOptions>
  ): Promise<SiriusOdesignPreview> {
    return apiClient.post<SiriusOdesignPreview>(API_ENDPOINTS.SIRIUS_VALIDATE, {
      content,
      sourceFormat: 'odesign',
      metamodelId,
      options,
    });
  }

  async validateFile(file: File, metamodelId?: string): Promise<SiriusOdesignPreview> {
    const format = this.detectSourceFormat(file.name);
    if (format === 'project-zip') {
      const bundle = await this.extractProjectZip(file);
      if (!bundle.odesignContent) {
        return {
          viewpoints: [],
          report: this.createReport('project-zip', bundle.warnings, [{
            severity: 'error',
            code: 'SIRIUS_ODSIGN_NOT_FOUND',
            message: 'The Sirius project ZIP does not contain an .odesign Viewpoint Specification Model.',
          }]),
        };
      }

      const preview = await this.validateOdesign(bundle.odesignContent, metamodelId);
      preview.report = this.mergeLocalReport(preview.report, 'project-zip', bundle);
      return preview;
    }

    const content = await file.text();
    return apiClient.post<SiriusOdesignPreview>(API_ENDPOINTS.SIRIUS_VALIDATE, {
      content,
      sourceFormat: format,
      metamodelId,
    });
  }

  async importOdesign(
    content: string,
    metamodelId: string,
    options?: Partial<SiriusImportOptions>
  ): Promise<SiriusImportResult> {
    return apiClient.post<SiriusImportResult>(API_ENDPOINTS.SIRIUS_IMPORT, {
      content,
      metamodelId,
      options,
    });
  }

  async importFile(file: File, metamodelId: string): Promise<SiriusImportResult> {
    const format = this.detectSourceFormat(file.name);
    if (format === 'aird') {
      throw new Error('Sirius .aird session files are recognized but not imported yet.');
    }
    if (format === 'ecore' || format === 'xmi') {
      throw new Error(`${format} files should be imported through the semantic Ecore/XMI workflow.`);
    }
    if (format === 'project-zip') {
      const bundle = await this.extractProjectZip(file);
      if (!bundle.odesignContent) {
        throw new Error('The Sirius project ZIP does not contain an .odesign file to import.');
      }
      const result = await this.importOdesign(bundle.odesignContent, metamodelId);
      await this.restorePresentationSidecar(bundle, metamodelId);
      result.report = this.mergeLocalReport(result.report, 'project-zip', bundle);
      return result;
    }

    return this.importOdesign(await file.text(), metamodelId);
  }

  async validateAird(
    content: string,
    modelId: string,
    viewpointId?: string,
    options?: Partial<SiriusImportOptions>
  ): Promise<SiriusAirdPreview> {
    return apiClient.post<SiriusAirdPreview>(API_ENDPOINTS.SIRIUS_VALIDATE, {
      content,
      sourceFormat: 'aird',
      modelId,
      viewpointId,
      options,
    });
  }

  async validateAirdFile(file: File, modelId: string, viewpointId?: string): Promise<SiriusAirdPreview> {
    return this.validateAird(await file.text(), modelId, viewpointId);
  }

  async importAird(
    content: string,
    modelId: string,
    viewpointId?: string,
    options?: Partial<SiriusImportOptions>
  ): Promise<SiriusAirdImportResult> {
    return apiClient.post<SiriusAirdImportResult>(API_ENDPOINTS.SIRIUS_AIRD_IMPORT, {
      content,
      modelId,
      viewpointId,
      options,
    });
  }

  async importAirdFile(file: File, modelId: string, viewpointId?: string): Promise<SiriusAirdImportResult> {
    return this.importAird(await file.text(), modelId, viewpointId);
  }

  async exportOdesign(
    metamodelId: string,
    viewpointIds?: string[],
    options?: Partial<SiriusExportOptions>
  ): Promise<SiriusExportResult> {
    return apiClient.post<SiriusExportResult>(API_ENDPOINTS.SIRIUS_EXPORT, {
      metamodelId,
      viewpointIds,
      options,
    });
  }

  /** Export SpatialDSL views of a model as a Sirius `.aird` session (inverse of importAird). */
  async exportAird(
    modelId: string,
    diagramIds?: string[],
    options?: Partial<SiriusExportOptions>
  ): Promise<SiriusExportResult> {
    return apiClient.post<SiriusExportResult>(API_ENDPOINTS.SIRIUS_AIRD_EXPORT, {
      modelId,
      diagramIds,
      options: { includeAird: true, ...options },
    });
  }

  async exportProjectZip(
    metamodelId: string,
    modelId: string,
    viewpointIds?: string[],
    diagramIds?: string[]
  ): Promise<SiriusProjectZipExportResult> {
    const result = await apiClient.post<SiriusProjectExportResult>(
      API_ENDPOINTS.SIRIUS_PROJECT_EXPORT,
      { metamodelId, modelId, viewpointIds, diagramIds }
    );
    const binary = atob(result.content);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const blob = new Blob([bytes], { type: 'application/zip' });

    return {
      filename: result.filename,
      blob,
      report: result.report,
    };
  }

  downloadText(filename: string, content: string, type = 'application/xml'): void {
    this.downloadBlob(filename, new Blob([content], { type }));
  }

  downloadBlob(filename: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private async extractProjectZip(file: File): Promise<SiriusProjectBundle> {
    const zip = await JSZip.loadAsync(await this.readFileArrayBuffer(file));
    const files = Object.values(zip.files).filter(entry => !entry.dir);
    const warnings: SiriusInteropWarning[] = [];
    const unresolvedReferences: SiriusInteropWarning[] = [];

    files.forEach(entry => this.assertSafeProjectPath((entry as any).unsafeOriginalName || entry.name));

    const sidecars = files.filter(entry => (
      entry.name.split('/').pop()?.toLowerCase() === 'spatialdsl-presentation.json'
    ));
    let presentationSidecar: SpatialDslPresentationSidecar | undefined;
    let presentationSidecarPath: string | undefined;
    if (sidecars.length === 0) {
      warnings.push({
        severity: 'warning',
        code: 'SPATIALDSL_PRESENTATION_SIDECAR_MISSING',
        message: 'No spatialdsl-presentation.json was found. Sirius 2D layout can still be imported, but elevation and 3D extents cannot be restored losslessly.',
      });
    } else if (sidecars.length > 1) {
      unresolvedReferences.push({
        severity: 'error',
        code: 'SPATIALDSL_PRESENTATION_SIDECAR_AMBIGUOUS',
        message: 'The project ZIP contains more than one spatialdsl-presentation.json sidecar.',
      });
    } else {
      presentationSidecarPath = sidecars[0].name;
      try {
        const parsed = JSON.parse(await sidecars[0].async('text')) as SpatialDslPresentationSidecar;
        const presentationsAreCanonical = parsed.elements && typeof parsed.elements === 'object'
          && !Array.isArray(parsed.elements)
          && Object.entries(parsed.elements).every(([elementId, presentation]) => (
            Boolean(elementId)
            && validatePresentation(presentation).length === 0
            && (
              !presentation.position3D
              || (Boolean(normalizePosition3D(presentation.position3D))
                && typeof presentation.position3D.z === 'number')
            )
          ));
        if (parsed.schemaVersion !== 1 || !parsed.model?.id || !presentationsAreCanonical) {
          throw new Error('unsupported or malformed sidecar schema');
        }
        presentationSidecar = parsed;
        warnings.push({
          severity: 'info',
          code: 'SPATIALDSL_PRESENTATION_SIDECAR_RECOGNIZED',
          message: `Validated lossless SpatialDSL presentation data from "${sidecars[0].name}".`,
          sourcePath: sidecars[0].name,
        });
      } catch (error) {
        unresolvedReferences.push({
          severity: 'error',
          code: 'SPATIALDSL_PRESENTATION_SIDECAR_INVALID',
          message: `Could not validate "${sidecars[0].name}" as a SpatialDSL presentation sidecar.`,
          sourcePath: sidecars[0].name,
        });
      }
    }

    files
      .filter(entry => entry.name.toLowerCase().endsWith('.aird'))
      .forEach(entry => warnings.push({
        severity: 'warning',
        code: 'SIRIUS_DEFERRED_AIRD',
        message: `Sirius session file "${entry.name}" was detected but .aird import is deferred.`,
        sourcePath: entry.name,
      }));

    files
      .filter(entry => /\.(ecore|xmi)$/i.test(entry.name))
      .forEach(entry => warnings.push({
        severity: 'info',
        code: 'SIRIUS_SEMANTIC_FILE_DELEGATED',
        message: `Semantic file "${entry.name}" should be imported through the Ecore/XMI workflow.`,
        sourcePath: entry.name,
      }));

    const odesign = files.find(entry => entry.name.toLowerCase().endsWith('.odesign'));
    if (!odesign) {
      unresolvedReferences.push({
        severity: 'error',
        code: 'SIRIUS_ODSIGN_NOT_FOUND',
        message: 'The Sirius project ZIP does not contain an .odesign Viewpoint Specification Model.',
      });
      return { presentationSidecar, presentationSidecarPath, warnings, unresolvedReferences };
    }

    return {
      odesignContent: await odesign.async('text'),
      odesignPath: odesign.name,
      presentationSidecar,
      presentationSidecarPath,
      warnings: [
        ...warnings,
        {
          severity: 'info',
          code: 'SIRIUS_PROJECT_ZIP_ODSIGN_IMPORTED',
          message: `Using "${odesign.name}" from the Sirius project ZIP.`,
          sourcePath: odesign.name,
        },
      ],
      unresolvedReferences,
    };
  }

  private async restorePresentationSidecar(
    bundle: SiriusProjectBundle,
    metamodelId: string
  ): Promise<void> {
    const sidecar = bundle.presentationSidecar;
    if (!sidecar) return;

    const conformingModels = modelService.getAllModels().filter(model => (
      (model.conformsTo || model.metamodelId) === metamodelId
    ));
    const model = conformingModels.find(candidate => candidate.id === sidecar.model.id)
      || conformingModels.find(candidate => candidate.name === sidecar.model.name)
      || (conformingModels.length === 1 ? conformingModels[0] : undefined);
    if (!model) {
      bundle.unresolvedReferences.push({
        severity: 'warning',
        code: 'SPATIALDSL_PRESENTATION_MODEL_UNRESOLVED',
        message: `Presentation sidecar model "${sidecar.model.name || sidecar.model.id}" is not present in this project. Import its semantic XMI first, then re-import the bundle to restore 3D placement.`,
        sourcePath: bundle.presentationSidecarPath,
      });
      return;
    }

    let restored = 0;
    const restoredElements = [...model.elements];
    Object.entries(sidecar.elements).forEach(([elementId, sidecarPresentation]) => {
      const elementIndex = restoredElements.findIndex(candidate => candidate.id === elementId);
      const element = restoredElements[elementIndex];
      if (!element) {
        bundle.unresolvedReferences.push({
          severity: 'warning',
          code: 'SPATIALDSL_PRESENTATION_ELEMENT_UNRESOLVED',
          message: `Presentation sidecar element "${elementId}" is not present in model "${model.name}".`,
          sourcePath: bundle.presentationSidecarPath,
          spatialElementId: elementId,
        });
        return;
      }

      const position3D = normalizePosition3D(sidecarPresentation.position3D);
      const presentation: ModelElementPresentation = {
        ...(element.presentation || {}),
        ...sidecarPresentation,
        ...(position3D && { position3D }),
      };
      restoredElements[elementIndex] = { ...element, presentation };
      restored += 1;
    });

    if (restored > 0) {
      // Await the whole-model upsert so import completion means the sidecar is
      // durable, rather than merely queued by a fire-and-forget presentation save.
      await modelService.importModel({ ...model, elements: restoredElements });
    }

    bundle.warnings.push({
      severity: 'info',
      code: 'SPATIALDSL_PRESENTATION_SIDECAR_RESTORED',
      message: `Restored SpatialDSL presentation data for ${restored} model element${restored === 1 ? '' : 's'} in "${model.name}".`,
      sourcePath: bundle.presentationSidecarPath,
    });
  }

  private detectSourceFormat(filename: string): SiriusSourceFormat {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.zip')) return 'project-zip';
    if (lower.endsWith('.aird')) return 'aird';
    if (lower.endsWith('.ecore')) return 'ecore';
    if (lower.endsWith('.xmi')) return 'xmi';
    return 'odesign';
  }

  private readFileArrayBuffer(file: File): Promise<ArrayBuffer> {
    if (typeof file.arrayBuffer === 'function') {
      return file.arrayBuffer();
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  }

  private createReport(
    sourceFormat: SiriusSourceFormat,
    warnings: SiriusInteropWarning[] = [],
    unresolvedReferences: SiriusInteropWarning[] = []
  ): SiriusCompatibilityReport {
    return {
      sourceFormat,
      targetFormat: 'spatialdsl',
      supported: ![...warnings, ...unresolvedReferences].some(warning => warning.severity === 'error'),
      warnings,
      droppedFeatures: [],
      unresolvedReferences,
    };
  }

  private mergeLocalReport(
    report: SiriusCompatibilityReport,
    sourceFormat: SiriusSourceFormat,
    bundle: SiriusProjectBundle
  ): SiriusCompatibilityReport {
    const next: SiriusCompatibilityReport = {
      ...report,
      sourceFormat,
      warnings: [...bundle.warnings, ...report.warnings],
      unresolvedReferences: [...bundle.unresolvedReferences, ...report.unresolvedReferences],
    };
    next.supported = ![...next.warnings, ...next.droppedFeatures, ...next.unresolvedReferences]
      .some(warning => warning.severity === 'error');
    return next;
  }

  private assertSafeProjectPath(path: string): void {
    if (!path || path.includes('\\') || path.includes('\0') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
      throw new Error(`Unsafe Sirius project ZIP path: ${path}`);
    }

    const segments = path.split('/');
    if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
      throw new Error(`Unsafe Sirius project ZIP path: ${path}`);
    }
  }
}

export const siriusInteropService = new SiriusInteropService();
export default siriusInteropService;
