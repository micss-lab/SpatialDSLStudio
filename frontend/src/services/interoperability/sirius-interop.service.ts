import JSZip from 'jszip';
import {
  SiriusCompatibilityReport,
  SiriusExportOptions,
  SiriusExportResult,
  SiriusImportOptions,
  SiriusImportResult,
  SiriusInteropWarning,
  SiriusOdesignPreview,
  SiriusSourceFormat,
} from '../../models/types';
import { apiClient, API_ENDPOINTS } from '../core';

interface SiriusProjectBundle {
  odesignContent?: string;
  odesignPath?: string;
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
      result.report = this.mergeLocalReport(result.report, 'project-zip', bundle);
      return result;
    }

    return this.importOdesign(await file.text(), metamodelId);
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

  async exportProjectZip(
    metamodelId: string,
    viewpointIds?: string[]
  ): Promise<SiriusProjectZipExportResult> {
    const result = await this.exportOdesign(metamodelId, viewpointIds);
    const report: SiriusCompatibilityReport = {
      ...result.report,
      sourceFormat: 'project-zip',
      targetFormat: 'sirius-project',
      droppedFeatures: [
        ...result.report.droppedFeatures,
        {
          severity: 'warning',
          code: 'SIRIUS_DEFERRED_AIRD_EXPORT',
          message: 'Project ZIP export includes the .odesign specification; .aird session/diagram resources remain deferred.',
        },
      ],
    };

    const zip = new JSZip();
    zip.file(`description/${result.filename}`, result.content);
    zip.file('compatibility-report.json', JSON.stringify(report, null, 2));
    const blob = await zip.generateAsync({ type: 'blob' });

    return {
      filename: result.filename.replace(/\.odesign$/i, '.sirius-project.zip'),
      blob,
      report,
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
      return { warnings, unresolvedReferences };
    }

    return {
      odesignContent: await odesign.async('text'),
      odesignPath: odesign.name,
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
