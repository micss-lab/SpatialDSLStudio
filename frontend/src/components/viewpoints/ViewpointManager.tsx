import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import SaveIcon from '@mui/icons-material/Save';
import ArchiveIcon from '@mui/icons-material/Archive';
import { useNavigate, useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import {
  ConcreteSyntax,
  ConcreteSyntaxEdge,
  MetaClass,
  MetaReference,
  Metamodel,
  RepresentationDescription,
  RepresentationKind,
  SiriusCompatibilityReport,
  SiriusInteropWarning,
  Viewpoint
} from '../../models/types';
import { useAuth } from '../../contexts/AuthContext';
import { metamodelService } from '../../services/metamodel';
import { diagramService } from '../../services/diagram';
import { modelService } from '../../services/model';
import viewpointService from '../../services/viewpoint.service';
import { siriusInteropService } from '../../services/interoperability';
import ColorSwatchField from '../common/ColorSwatchField';
import { fileStorageService } from '../../services/core';

type ViewpointDraft = Pick<Viewpoint, 'name' | 'description' | 'isDefault'>;
type SiriusFileAction = 'validate' | 'import';

const shapeOptions = [
  'default',
  'square',
  'rectangle',
  'circle',
  'ellipse',
  'diamond',
  'triangle',
  'star',
  'cylinder',
  'sphere',
  'cone',
  'custom-image',
  'custom-3d-model',
];
const fallbackShapeOptions = ['box', 'sphere', 'cylinder'];
const arrowOptions = ['none', 'open', 'filled', 'diamond'];

const emptyViewpointDraft = (): ViewpointDraft => ({
  name: '',
  description: '',
  isDefault: false,
});

const emptyRepresentationDraft = (
  viewpointId: string,
  metamodel: Metamodel
): RepresentationDescription => ({
  id: uuidv4(),
  name: '',
  description: '',
  viewpointId,
  kind: 'diagram',
  visibleMetaClassIds: metamodel.classes.map(cls => cls.id),
  creatableMetaClassIds: metamodel.classes.filter(cls => !cls.abstract).map(cls => cls.id),
  concreteSyntaxByMetaClassId: {},
  concreteSyntaxByReferenceId: {},
  edgeMappings: [],
  pinMappings: [],
  toolDefinitions: [],
  isDefault: false,
});

const getAllReferences = (metamodel: Metamodel): Array<{ sourceClass: MetaClass; reference: MetaReference }> => (
  metamodel.classes.flatMap(sourceClass => (
    (sourceClass.references || []).map(reference => ({ sourceClass, reference }))
  ))
);

const getNotationCount = (record?: Record<string, unknown>): number => Object.keys(record || {}).length;

const getPreferredViewpointId = (viewpoints: Viewpoint[], currentId = ''): string => {
  if (currentId && viewpoints.some(viewpoint => viewpoint.id === currentId)) {
    return currentId;
  }

  return (viewpoints.find(viewpoint => viewpoint.isDefault) || viewpoints[0])?.id || '';
};

const dispatchViewpointChanged = (viewpointId: string, representationDescriptionId?: string): void => {
  window.dispatchEvent(new CustomEvent('viewpoint:changed', {
    detail: { viewpointId, representationDescriptionId },
  }));
};

const previewText = (value?: string, maxLength = 52): string => {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}...` : trimmed;
};

const hasObjectValues = (value?: Record<string, unknown>): boolean => Boolean(value && Object.keys(value).length > 0);

const getReportItems = (report: SiriusCompatibilityReport): Array<{ label: string; items: SiriusInteropWarning[] }> => [
  { label: 'Warnings', items: report.warnings },
  { label: 'Dropped Features', items: report.droppedFeatures },
  { label: 'Unresolved References', items: report.unresolvedReferences },
];

const getReportSummary = (report: SiriusCompatibilityReport): string => (
  `${report.sourceFormat} to ${report.targetFormat} · `
  + `${report.warnings.length} warning(s), `
  + `${report.droppedFeatures.length} dropped, `
  + `${report.unresolvedReferences.length} unresolved`
);

const getRepresentationKindLabel = (kind: string): string => (
  kind === 'diagram' ? 'visual view' : kind
);

const mergeConcreteSyntax = (
  fallback: ConcreteSyntax = {},
  override?: ConcreteSyntax
): ConcreteSyntax => {
  const merged: ConcreteSyntax = {
    ...fallback,
    ...(override || {}),
  };

  if (fallback.two_d || override?.two_d) {
    const twoD = {
      ...(fallback.two_d || {}),
      ...(override?.two_d || {}),
    };
    if (fallback.two_d?.defaultSize || override?.two_d?.defaultSize) {
      twoD.defaultSize = {
        width: override?.two_d?.defaultSize?.width ?? fallback.two_d?.defaultSize?.width ?? 120,
        height: override?.two_d?.defaultSize?.height ?? fallback.two_d?.defaultSize?.height ?? 80,
      };
    }
    merged.two_d = twoD;
  }

  if (fallback.three_d || override?.three_d) {
    const threeD = {
      ...(fallback.three_d || {}),
      ...(override?.three_d || {}),
    };
    if (fallback.three_d?.defaultSizeMm || override?.three_d?.defaultSizeMm) {
      threeD.defaultSizeMm = {
        widthMm: override?.three_d?.defaultSizeMm?.widthMm ?? fallback.three_d?.defaultSizeMm?.widthMm ?? 500,
        heightMm: override?.three_d?.defaultSizeMm?.heightMm ?? fallback.three_d?.defaultSizeMm?.heightMm ?? 800,
        depthMm: override?.three_d?.defaultSizeMm?.depthMm ?? fallback.three_d?.defaultSizeMm?.depthMm ?? 200,
      };
    }
    merged.three_d = threeD;
  }

  return merged;
};

const ViewpointManager: React.FC = () => {
  const { metamodelId } = useParams<{ metamodelId: string }>();
  const navigate = useNavigate();
  const { canEditMetamodel } = useAuth();
  const [metamodel, setMetamodel] = useState<Metamodel | null>(null);
  const [viewpoints, setViewpoints] = useState<Viewpoint[]>([]);
  const [selectedViewpointId, setSelectedViewpointId] = useState<string>('');
  const [viewpointDraft, setViewpointDraft] = useState<ViewpointDraft>(emptyViewpointDraft());
  const [isCreatingViewpoint, setIsCreatingViewpoint] = useState(false);
  const [representationDraft, setRepresentationDraft] = useState<RepresentationDescription | null>(null);
  const [selectedClassNotationId, setSelectedClassNotationId] = useState('');
  const [selectedReferenceNotationId, setSelectedReferenceNotationId] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSiriusBusy, setIsSiriusBusy] = useState(false);
  const [siriusStatus, setSiriusStatus] = useState('');
  const [jsonImportStatus, setJsonImportStatus] = useState('');
  const [siriusReport, setSiriusReport] = useState<SiriusCompatibilityReport | null>(null);
  const [isSiriusReportOpen, setIsSiriusReportOpen] = useState(false);
  const isCreatingViewpointRef = useRef(false);
  const siriusFileInputRef = useRef<HTMLInputElement | null>(null);
  const airdFileInputRef = useRef<HTMLInputElement | null>(null);
  const jsonFileInputRef = useRef<HTMLInputElement | null>(null);
  const siriusFileActionRef = useRef<SiriusFileAction>('import');

  const selectedViewpoint = useMemo(
    () => viewpoints.find(viewpoint => viewpoint.id === selectedViewpointId) || null,
    [selectedViewpointId, viewpoints]
  );

  const usedViewpointCounts = useMemo(() => {
    const counts = new Map<string, number>();
    diagramService.getAllDiagrams().forEach(diagram => {
      if (!diagram.viewpointId) return;
      counts.set(diagram.viewpointId, (counts.get(diagram.viewpointId) || 0) + 1);
    });
    return counts;
  }, []);

  useEffect(() => {
    if (!metamodelId) return;

    let cancelled = false;
    const loadedMetamodel = metamodelService.getMetamodelById(metamodelId);
    const cachedViewpoints = viewpointService.getCachedViewpoints(metamodelId);
    setMetamodel(loadedMetamodel || null);
    setViewpoints(cachedViewpoints);
    setSelectedViewpointId(currentId => getPreferredViewpointId(cachedViewpoints, currentId));
    setIsLoading(true);

    viewpointService.loadViewpoints(metamodelId)
      .then(nextViewpoints => {
        if (cancelled) return;
        setViewpoints(nextViewpoints);
        setSelectedViewpointId(currentId => (
          isCreatingViewpointRef.current ? currentId : getPreferredViewpointId(nextViewpoints, currentId)
        ));
      })
      .catch(error => {
        if (!cancelled) {
          setError(error.message || 'Failed to load viewpoints');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [metamodelId]);

  useEffect(() => {
    if (!selectedViewpoint) {
      if (!isCreatingViewpoint) {
        setViewpointDraft(emptyViewpointDraft());
      }
      return;
    }

    setIsCreatingViewpoint(false);
    isCreatingViewpointRef.current = false;
    setViewpointDraft({
      name: selectedViewpoint.name,
      description: selectedViewpoint.description || '',
      isDefault: Boolean(selectedViewpoint.isDefault),
    });
  }, [isCreatingViewpoint, selectedViewpoint]);

  const refreshViewpoint = (viewpoint: Viewpoint) => {
    setViewpoints(current => {
      const withoutCurrent = current.filter(candidate => candidate.id !== viewpoint.id);
      return [...withoutCurrent, viewpoint].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
    });
    isCreatingViewpointRef.current = false;
    setIsCreatingViewpoint(false);
    setSelectedViewpointId(viewpoint.id);
    setRepresentationDraft(null);
    dispatchViewpointChanged(viewpoint.id);
  };

  const handleCreateDefault = async () => {
    if (!metamodelId || !canEditMetamodel) return;
    try {
      const viewpoint = await viewpointService.getDefaultViewpoint(metamodelId);
      refreshViewpoint(viewpoint);
    } catch (error: any) {
      setError(error.message || 'Failed to create default viewpoint');
    }
  };

  const handleOpenSiriusFilePicker = (action: SiriusFileAction) => {
    if (action === 'import' && !canEditMetamodel) return;
    siriusFileActionRef.current = action;
    siriusFileInputRef.current?.click();
  };

  const handleOpenJsonFilePicker = () => {
    if (!canEditMetamodel) return;
    jsonFileInputRef.current?.click();
  };

  const handleJsonFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !metamodelId || !canEditMetamodel) return;

    setIsSiriusBusy(true);
    setJsonImportStatus('');
    setSiriusStatus('');
    setSiriusReport(null);
    setError('');

    try {
      const content = await file.text();
      const imported = await viewpointService.importViewpointsJson(content, metamodelId);
      const nextViewpoints = await viewpointService.loadViewpoints(metamodelId);
      setViewpoints(nextViewpoints);
      setSelectedViewpointId(currentId => (
        imported[0]?.id && nextViewpoints.some(viewpoint => viewpoint.id === imported[0].id)
          ? imported[0].id
          : getPreferredViewpointId(nextViewpoints, currentId)
      ));
      imported.forEach(viewpoint => dispatchViewpointChanged(viewpoint.id));
      setJsonImportStatus(`Imported or updated ${imported.length} viewpoint(s) from ${file.name}.`);
    } catch (error: any) {
      setError(error.message || 'Failed to import viewpoint JSON');
    } finally {
      setIsSiriusBusy(false);
    }
  };

  const handleSiriusFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !metamodelId) return;

    setIsSiriusBusy(true);
    setSiriusStatus('');
    setJsonImportStatus('');
    setError('');

    try {
      if (siriusFileActionRef.current === 'validate') {
        const preview = await siriusInteropService.validateFile(file, metamodelId);
        setSiriusReport(preview.report);
        setSiriusStatus(`${preview.viewpoints.length} viewpoint(s) found in ${file.name}.`);
        setIsSiriusReportOpen(true);
        return;
      }

      const result = await siriusInteropService.importFile(file, metamodelId);
      setSiriusReport(result.report);
      setSiriusStatus(`Imported ${result.viewpoints.length} Sirius viewpoint(s) from ${file.name}.`);
      setIsSiriusReportOpen(true);

      const nextViewpoints = await viewpointService.loadViewpoints(metamodelId);
      setViewpoints(nextViewpoints);
      setSelectedViewpointId(currentId => (
        result.viewpoints[0]?.id && nextViewpoints.some(viewpoint => viewpoint.id === result.viewpoints[0].id)
          ? result.viewpoints[0].id
          : getPreferredViewpointId(nextViewpoints, currentId)
      ));
    } catch (error: any) {
      setError(error.message || 'Sirius interoperability action failed');
    } finally {
      setIsSiriusBusy(false);
    }
  };

  const handleExportSiriusOdesign = async () => {
    if (!metamodelId) return;
    setIsSiriusBusy(true);
    setError('');
    try {
      const result = await siriusInteropService.exportOdesign(metamodelId);
      siriusInteropService.downloadText(result.filename, result.content);
      setSiriusReport(result.report);
      setSiriusStatus(`Exported ${result.filename}.`);
      setIsSiriusReportOpen(true);
    } catch (error: any) {
      setError(error.message || 'Failed to export Sirius .odesign');
    } finally {
      setIsSiriusBusy(false);
    }
  };

  const handleExportSiriusProjectZip = async () => {
    if (!metamodelId) return;
    setIsSiriusBusy(true);
    setError('');
    try {
      const result = await siriusInteropService.exportProjectZip(metamodelId);
      siriusInteropService.downloadBlob(result.filename, result.blob);
      setSiriusReport(result.report);
      setSiriusStatus(`Exported ${result.filename}.`);
      setIsSiriusReportOpen(true);
    } catch (error: any) {
      setError(error.message || 'Failed to export Sirius project ZIP');
    } finally {
      setIsSiriusBusy(false);
    }
  };

  const handleOpenAirdFilePicker = () => {
    if (!canEditMetamodel) return;
    airdFileInputRef.current?.click();
  };

  const handleAirdFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !metamodelId || !canEditMetamodel) return;

    setIsSiriusBusy(true);
    setSiriusStatus('');
    setJsonImportStatus('');
    setSiriusReport(null);
    setError('');

    try {
      if (!selectedViewpointId) {
        throw new Error('Select a viewpoint before importing a Sirius .aird view.');
      }
      const models = modelService.getModelsByMetamodelId(metamodelId);
      if (models.length === 0) {
        throw new Error('Import a model for this metamodel before importing a Sirius .aird view.');
      }
      // .aird import resolves semantic targets against an already-imported model.
      const model = models[0];

      const result = await siriusInteropService.importAirdFile(file, model.id, selectedViewpointId);
      setSiriusReport(result.report);
      setIsSiriusReportOpen(true);
      const intoModel = models.length > 1 ? ` into model "${model.name}"` : '';
      setSiriusStatus(
        `Imported ${result.diagrams.length} Sirius view(s)${intoModel} from ${file.name}. Reopen the Views list to see them.`
      );
      result.diagrams.forEach(diagram => window.dispatchEvent(
        new CustomEvent('view:changed', { detail: { diagramId: diagram.id } })
      ));
    } catch (error: any) {
      setError(error.message || 'Failed to import Sirius .aird view');
    } finally {
      setIsSiriusBusy(false);
    }
  };

  const handleStartCreateViewpoint = () => {
    if (!canEditMetamodel) return;
    isCreatingViewpointRef.current = true;
    setIsCreatingViewpoint(true);
    setSelectedViewpointId('');
    setRepresentationDraft(null);
    setViewpointDraft({
      name: 'New Viewpoint',
      description: '',
      isDefault: viewpoints.length === 0,
    });
  };

  const handleSaveViewpoint = async () => {
    if (!canEditMetamodel) return;

    const nextName = viewpointDraft.name.trim();
    if (!metamodelId || !nextName) {
      setError('Viewpoint name is required');
      return;
    }

    const duplicateName = viewpoints.some(viewpoint => (
      viewpoint.id !== selectedViewpoint?.id
      && viewpoint.name.trim().toLocaleLowerCase() === nextName.toLocaleLowerCase()
    ));
    if (duplicateName) {
      setError('Viewpoint name must be unique for this metamodel');
      return;
    }

    try {
      if (isCreatingViewpoint) {
        const viewpoint = await viewpointService.createViewpoint({
          name: nextName,
          description: viewpointDraft.description,
          metamodelId,
          representationDescriptions: [],
          isDefault: viewpointDraft.isDefault,
        });
        refreshViewpoint(viewpoint);
      } else if (selectedViewpoint) {
        const viewpoint = await viewpointService.updateViewpoint(selectedViewpoint.id, {
          name: nextName,
          description: viewpointDraft.description,
          isDefault: viewpointDraft.isDefault,
        });
        refreshViewpoint(viewpoint);
      }
      setError('');
    } catch (error: any) {
      setError(error.message || 'Failed to save viewpoint');
    }
  };

  const handleCancelViewpointEdit = () => {
    setError('');
    if (isCreatingViewpoint) {
      isCreatingViewpointRef.current = false;
      setIsCreatingViewpoint(false);
      setSelectedViewpointId(getPreferredViewpointId(viewpoints));
      setViewpointDraft(emptyViewpointDraft());
      return;
    }

    if (selectedViewpoint) {
      setViewpointDraft({
        name: selectedViewpoint.name,
        description: selectedViewpoint.description || '',
        isDefault: Boolean(selectedViewpoint.isDefault),
      });
    }
  };

  const handleDeleteViewpoint = async (viewpoint: Viewpoint) => {
    if (!canEditMetamodel) return;

    const usageCount = usedViewpointCounts.get(viewpoint.id) || 0;
    const message = usageCount > 0
      ? `${usageCount} view(s) use this viewpoint. Delete the viewpoint definition anyway? Existing views will fall back to default resolution on reload.`
      : 'Delete this viewpoint?';
    if (!window.confirm(message)) return;

    try {
      await viewpointService.deleteViewpoint(viewpoint.id);
      const nextViewpoints = viewpoints.filter(candidate => candidate.id !== viewpoint.id);
      setViewpoints(nextViewpoints);
      setSelectedViewpointId(getPreferredViewpointId(nextViewpoints));
      setRepresentationDraft(null);
      dispatchViewpointChanged(viewpoint.id);
    } catch (error: any) {
      setError(error.message || 'Failed to delete viewpoint');
    }
  };

  const handleEditRepresentation = (description: RepresentationDescription) => {
    setRepresentationDraft({
      ...description,
      visibleMetaClassIds: [...(description.visibleMetaClassIds || [])],
      creatableMetaClassIds: [...(description.creatableMetaClassIds || [])],
      concreteSyntaxByMetaClassId: { ...(description.concreteSyntaxByMetaClassId || {}) },
      concreteSyntaxByReferenceId: { ...(description.concreteSyntaxByReferenceId || {}) },
    });
    setSelectedClassNotationId('');
    setSelectedReferenceNotationId('');
  };

  const handleCreateRepresentation = () => {
    if (!canEditMetamodel || !selectedViewpoint || !metamodel) return;
    handleEditRepresentation(emptyRepresentationDraft(selectedViewpoint.id, metamodel));
  };

  const handleSaveRepresentation = async () => {
    if (!canEditMetamodel) return;

    if (!selectedViewpoint || !representationDraft || !representationDraft.name.trim()) {
      setError('Representation name is required');
      return;
    }

    const visible = new Set(representationDraft.visibleMetaClassIds || []);
    const concrete = new Set((metamodel?.classes || []).filter(cls => !cls.abstract).map(cls => cls.id));
    const invalidCreatable = (representationDraft.creatableMetaClassIds || []).some(metaClassId => (
      !visible.has(metaClassId) || !concrete.has(metaClassId)
    ));
    if (invalidCreatable) {
      setError('Creatable metaclasses must be visible concrete classes');
      return;
    }

    try {
      const exists = selectedViewpoint.representationDescriptions.some(description => description.id === representationDraft.id);
      const payload = {
        ...representationDraft,
        name: representationDraft.name.trim(),
        viewpointId: selectedViewpoint.id,
      };
      const viewpoint = exists
        ? await viewpointService.updateRepresentationDescription(selectedViewpoint.id, payload.id, payload)
        : await viewpointService.createRepresentationDescription(selectedViewpoint.id, payload);

      refreshViewpoint(viewpoint);
      dispatchViewpointChanged(selectedViewpoint.id, payload.id);
      setError('');
    } catch (error: any) {
      setError(error.message || 'Failed to save representation description');
    }
  };

  const handleDuplicateRepresentation = async (description: RepresentationDescription) => {
    if (!canEditMetamodel || !selectedViewpoint) return;
    try {
      const duplicate: RepresentationDescription = {
        ...description,
        id: uuidv4(),
        viewpointId: selectedViewpoint.id,
        name: `${description.name} Copy`,
        isDefault: false,
      };
      const viewpoint = await viewpointService.createRepresentationDescription(selectedViewpoint.id, duplicate);
      refreshViewpoint(viewpoint);
      dispatchViewpointChanged(selectedViewpoint.id, duplicate.id);
    } catch (error: any) {
      setError(error.message || 'Failed to duplicate representation description');
    }
  };

  const handleDeleteRepresentation = async (description: RepresentationDescription) => {
    if (!canEditMetamodel || !selectedViewpoint || !window.confirm('Delete this representation description?')) return;
    try {
      const viewpoint = await viewpointService.deleteRepresentationDescription(selectedViewpoint.id, description.id);
      refreshViewpoint(viewpoint);
      dispatchViewpointChanged(selectedViewpoint.id, description.id);
    } catch (error: any) {
      setError(error.message || 'Failed to delete representation description');
    }
  };

  if (!metamodelId || !metamodel) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Metamodel not found.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)', bgcolor: 'background.default' }}>
      <Paper sx={{ width: 320, borderRadius: 0, p: 2, overflowY: 'auto' }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <Tooltip title="Back to metamodel">
            <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => navigate(`/metamodels/${metamodel.id}`)}>
              Back
            </Button>
          </Tooltip>
        </Stack>
        <Typography variant="h6">{metamodel.name}</Typography>
        <Typography variant="caption" color="text.secondary">Viewpoints</Typography>
        <Stack direction="row" spacing={1} sx={{ my: 2, flexWrap: 'wrap', rowGap: 1 }}>
          {canEditMetamodel && (
            <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={handleStartCreateViewpoint}>
              Create
            </Button>
          )}
          {canEditMetamodel && viewpoints.length === 0 && (
            <Button size="small" variant="outlined" onClick={handleCreateDefault}>
              Create Default Viewpoint
            </Button>
          )}
        </Stack>
        <input
          ref={siriusFileInputRef}
          type="file"
          hidden
          accept=".odesign,.xml,.zip,.aird,.ecore,.xmi"
          onChange={handleSiriusFileChange}
        />
        <Divider sx={{ my: 2 }} />
        <Typography variant="caption" color="text.secondary">SpatialDSL JSON</Typography>
        <input
          ref={jsonFileInputRef}
          type="file"
          hidden
          accept=".json,application/json"
          onChange={handleJsonFileChange}
        />
        <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
          {canEditMetamodel && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileUploadIcon />}
              disabled={isSiriusBusy}
              onClick={handleOpenJsonFilePicker}
            >
              Import JSON
            </Button>
          )}
        </Stack>
        {jsonImportStatus && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {jsonImportStatus}
          </Alert>
        )}
        <Divider sx={{ my: 2 }} />
        <Typography variant="caption" color="text.secondary">Sirius Compatibility</Typography>
        <input
          ref={airdFileInputRef}
          type="file"
          hidden
          accept=".aird"
          onChange={handleAirdFileChange}
        />
        <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<FileUploadIcon />}
            disabled={isSiriusBusy}
            onClick={() => handleOpenSiriusFilePicker('validate')}
          >
            Validate
          </Button>
          {canEditMetamodel && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileUploadIcon />}
              disabled={isSiriusBusy || !selectedViewpointId}
              onClick={handleOpenAirdFilePicker}
            >
              Import .aird View
            </Button>
          )}
          {canEditMetamodel && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileUploadIcon />}
              disabled={isSiriusBusy}
              onClick={() => handleOpenSiriusFilePicker('import')}
            >
              Import Sirius
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            startIcon={<FileDownloadIcon />}
            disabled={isSiriusBusy || viewpoints.length === 0}
            onClick={handleExportSiriusOdesign}
          >
            Export .odesign
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ArchiveIcon />}
            disabled={isSiriusBusy || viewpoints.length === 0}
            onClick={handleExportSiriusProjectZip}
          >
            Export Zip
          </Button>
        </Stack>
        {isSiriusBusy && <LinearProgress sx={{ mb: 1.5 }} />}
        {siriusStatus && (
          <Alert
            severity={siriusReport?.supported === false ? 'warning' : 'success'}
            sx={{ mb: 2 }}
            action={siriusReport ? (
              <Button color="inherit" size="small" onClick={() => setIsSiriusReportOpen(true)}>
                Report
              </Button>
            ) : undefined}
          >
            {siriusStatus}
          </Alert>
        )}
        <List dense disablePadding>
          {viewpoints.map(viewpoint => (
            <ListItemButton
              key={viewpoint.id}
              selected={viewpoint.id === selectedViewpointId}
              onClick={() => setSelectedViewpointId(viewpoint.id)}
              sx={{ alignItems: 'flex-start', borderRadius: 1, mb: 0.5 }}
            >
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" noWrap>{viewpoint.name}</Typography>
                    {viewpoint.isDefault && <Chip size="small" label="Default" />}
                  </Stack>
                }
                secondary={`${previewText(viewpoint.description) ? `${previewText(viewpoint.description)} · ` : ''}${viewpoint.representationDescriptions.length} representation(s)${usedViewpointCounts.get(viewpoint.id) ? ` · ${usedViewpointCounts.get(viewpoint.id)} view(s)` : ''}`}
              />
              {canEditMetamodel && (
                <Tooltip title="Delete viewpoint">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteViewpoint(viewpoint);
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </ListItemButton>
          ))}
        </List>
        {viewpoints.length === 0 && !isLoading && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            No viewpoints for this metamodel.
          </Typography>
        )}
        {isLoading && <Typography variant="caption" color="text.secondary">Loading...</Typography>}
      </Paper>

      <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
        <Box sx={{ display: 'grid', gridTemplateColumns: { md: 'minmax(340px, 460px) 1fr' }, gap: 2 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              {isCreatingViewpoint ? 'New Viewpoint' : selectedViewpoint?.name || 'Viewpoint'}
            </Typography>
            {!canEditMetamodel && <Alert severity="info" sx={{ mb: 2 }}>Read-only role.</Alert>}
            <Stack spacing={2}>
              <TextField
                label="Name"
                size="small"
                value={viewpointDraft.name}
                disabled={!canEditMetamodel || (!selectedViewpoint && !isCreatingViewpoint)}
                onChange={event => setViewpointDraft({ ...viewpointDraft, name: event.target.value })}
              />
              <TextField
                label="Description"
                size="small"
                multiline
                minRows={3}
                value={viewpointDraft.description || ''}
                disabled={!canEditMetamodel || (!selectedViewpoint && !isCreatingViewpoint)}
                onChange={event => setViewpointDraft({ ...viewpointDraft, description: event.target.value })}
              />
              <FormControlLabel
                control={<Checkbox checked={Boolean(viewpointDraft.isDefault)} disabled={!canEditMetamodel || (!selectedViewpoint && !isCreatingViewpoint)} />}
                label="Default viewpoint"
                onChange={(_, checked) => setViewpointDraft({ ...viewpointDraft, isDefault: checked })}
              />
              <Typography variant="caption" color="text.secondary">
                A metamodel normally has one default viewpoint.
              </Typography>
              {canEditMetamodel && (selectedViewpoint || isCreatingViewpoint) && (
                <Stack direction="row" spacing={1}>
                  <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSaveViewpoint}>
                    Save
                  </Button>
                  <Button onClick={handleCancelViewpointEdit}>
                    Cancel
                  </Button>
                  {selectedViewpoint && (
                    <Button color="error" startIcon={<DeleteIcon />} onClick={() => handleDeleteViewpoint(selectedViewpoint)}>
                      Delete
                    </Button>
                  )}
                </Stack>
              )}
            </Stack>
          </Paper>

          <Paper sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="h6">Representation Descriptions</Typography>
              {canEditMetamodel && selectedViewpoint && (
                <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={handleCreateRepresentation}>
                  Add
                </Button>
              )}
            </Stack>
            <Stack spacing={1}>
              {(selectedViewpoint?.representationDescriptions || []).map(description => (
                <Box key={description.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="subtitle2" noWrap>{description.name}</Typography>
                        <Chip size="small" label={getRepresentationKindLabel(description.kind)} />
                        {description.isDefault && <Chip size="small" label="Default" />}
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        Visible {description.visibleMetaClassIds?.length || 0} / Creatable {description.creatableMetaClassIds?.length || 0} / Notation {getNotationCount(description.concreteSyntaxByMetaClassId) + getNotationCount(description.concreteSyntaxByReferenceId)}
                      </Typography>
                      {description.description && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {description.description}
                        </Typography>
                      )}
                    </Box>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" onClick={() => handleEditRepresentation(description)}>
                        Edit
                      </Button>
                      {canEditMetamodel && (
                        <>
                          <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => handleDuplicateRepresentation(description)}>
                            Duplicate
                          </Button>
                          <Button size="small" color="error" onClick={() => handleDeleteRepresentation(description)}>
                            Delete
                          </Button>
                        </>
                      )}
                    </Stack>
                  </Stack>
                </Box>
              ))}
            </Stack>
            {selectedViewpoint?.representationDescriptions.length === 0 && (
              <Typography color="text.secondary" sx={{ py: 3 }}>No representation descriptions yet.</Typography>
            )}
          </Paper>
        </Box>

        {representationDraft && (
          <RepresentationEditor
            metamodel={metamodel}
            viewpoint={selectedViewpoint}
            draft={representationDraft}
            readOnly={!canEditMetamodel}
            selectedClassNotationId={selectedClassNotationId}
            selectedReferenceNotationId={selectedReferenceNotationId}
            onChange={setRepresentationDraft}
            onSave={handleSaveRepresentation}
            onCancel={() => setRepresentationDraft(null)}
            onSelectClassNotation={setSelectedClassNotationId}
            onSelectReferenceNotation={setSelectedReferenceNotationId}
          />
        )}
      </Box>

      <Dialog
        open={isSiriusReportOpen}
        onClose={() => setIsSiriusReportOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Sirius Compatibility Report</DialogTitle>
        <DialogContent dividers>
          {siriusReport && (
            <Stack spacing={2}>
              <Alert severity={siriusReport.supported ? 'success' : 'warning'}>
                {getReportSummary(siriusReport)}
              </Alert>
              {getReportItems(siriusReport).map(section => (
                <Box key={section.label}>
                  <Typography variant="subtitle2" gutterBottom>
                    {section.label} ({section.items.length})
                  </Typography>
                  {section.items.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">None</Typography>
                  ) : (
                    <Stack spacing={1}>
                      {section.items.map((item, index) => (
                        <Alert key={`${item.code}-${index}`} severity={item.severity === 'error' ? 'error' : item.severity === 'info' ? 'info' : 'warning'}>
                          <Typography variant="body2" fontWeight={600}>{item.code}</Typography>
                          <Typography variant="body2">{item.message}</Typography>
                          {(item.sourcePath || item.sourceElementId || item.spatialElementId) && (
                            <Typography variant="caption" color="text.secondary">
                              {[item.sourcePath, item.sourceElementId, item.spatialElementId].filter(Boolean).join(' · ')}
                            </Typography>
                          )}
                        </Alert>
                      ))}
                    </Stack>
                  )}
                </Box>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsSiriusReportOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

interface RepresentationEditorProps {
  metamodel: Metamodel;
  viewpoint: Viewpoint | null;
  draft: RepresentationDescription;
  readOnly: boolean;
  selectedClassNotationId: string;
  selectedReferenceNotationId: string;
  onChange: (draft: RepresentationDescription) => void;
  onSave: () => void;
  onCancel: () => void;
  onSelectClassNotation: (id: string) => void;
  onSelectReferenceNotation: (id: string) => void;
}

const RepresentationEditor: React.FC<RepresentationEditorProps> = ({
  metamodel,
  viewpoint,
  draft,
  readOnly,
  selectedClassNotationId,
  selectedReferenceNotationId,
  onChange,
  onSave,
  onCancel,
  onSelectClassNotation,
  onSelectReferenceNotation,
}) => {
  const concreteClasses = metamodel.classes.filter(cls => !cls.abstract);
  const references = getAllReferences(metamodel);
  const visibleSet = new Set(draft.visibleMetaClassIds || []);
  const creatableSet = new Set(draft.creatableMetaClassIds || []);
  const selectedClass = metamodel.classes.find(cls => cls.id === selectedClassNotationId) || metamodel.classes[0];
  const selectedReferenceEntry = references.find(entry => entry.reference.id === selectedReferenceNotationId) || references[0];
  const classFallbackSyntax = selectedClass
    ? viewpoint?.sharedConcreteSyntaxByMetaClassId?.[selectedClass.id] || selectedClass.concreteSyntax || {}
    : {};
  const classOverrideSyntax = selectedClass
    ? draft.concreteSyntaxByMetaClassId?.[selectedClass.id]
    : undefined;
  const classSyntax = mergeConcreteSyntax(classFallbackSyntax, classOverrideSyntax);
  const referenceFallbackSyntax = selectedReferenceEntry?.reference.concreteSyntax || {};
  const referenceOverrideSyntax = selectedReferenceEntry
    ? draft.concreteSyntaxByReferenceId?.[selectedReferenceEntry.reference.id]
    : undefined;
  const referenceSyntax = {
    ...referenceFallbackSyntax,
    ...(referenceOverrideSyntax || {}),
  };

  const getClassSyntaxSource = (cls: MetaClass): string => {
    if (draft.concreteSyntaxByMetaClassId?.[cls.id]) return 'representation notation';
    if (viewpoint?.sharedConcreteSyntaxByMetaClassId?.[cls.id]) return 'viewpoint shared default';
    if (cls.concreteSyntax) return 'metaclass fallback';
    return 'built-in fallback';
  };

  const getReferenceSyntaxSource = (reference: MetaReference): string => {
    if (draft.concreteSyntaxByReferenceId?.[reference.id]) return 'representation notation';
    if (reference.concreteSyntax) return 'reference fallback';
    return 'built-in fallback';
  };

  const setVisible = (metaClassId: string, checked: boolean) => {
    const nextVisible = checked
      ? Array.from(new Set([...(draft.visibleMetaClassIds || []), metaClassId]))
      : (draft.visibleMetaClassIds || []).filter(id => id !== metaClassId);
    const nextVisibleSet = new Set(nextVisible);
    onChange({
      ...draft,
      visibleMetaClassIds: nextVisible,
      creatableMetaClassIds: (draft.creatableMetaClassIds || []).filter(id => nextVisibleSet.has(id)),
    });
  };

  const setCreatable = (metaClassId: string, checked: boolean) => {
    onChange({
      ...draft,
      visibleMetaClassIds: Array.from(new Set([...(draft.visibleMetaClassIds || []), metaClassId])),
      creatableMetaClassIds: checked
        ? Array.from(new Set([...(draft.creatableMetaClassIds || []), metaClassId]))
        : (draft.creatableMetaClassIds || []).filter(id => id !== metaClassId),
    });
  };

  const updateClassSyntax = (syntax: ConcreteSyntax | undefined) => {
    if (!selectedClass) return;
    const next = { ...(draft.concreteSyntaxByMetaClassId || {}) };
    if (!syntax) {
      delete next[selectedClass.id];
    } else {
      next[selectedClass.id] = syntax;
    }
    onChange({ ...draft, concreteSyntaxByMetaClassId: next });
  };

  const updateClass2D = (key: string, value: any) => {
    updateClassSyntax({
      ...classSyntax,
      two_d: {
        ...(classSyntax.two_d || {}),
        [key]: value,
      },
    });
  };

  const updateClass2DSize = (key: 'width' | 'height', value: number) => {
    updateClassSyntax({
      ...classSyntax,
      two_d: {
        ...(classSyntax.two_d || {}),
        defaultSize: {
          width: classSyntax.two_d?.defaultSize?.width || 120,
          height: classSyntax.two_d?.defaultSize?.height || 80,
          [key]: value,
        },
      },
    });
  };

  const updateClass3D = (key: string, value: any) => {
    updateClassSyntax({
      ...classSyntax,
      three_d: {
        ...(classSyntax.three_d || {}),
        [key]: value,
      },
    });
  };

  const updateClass3DSize = (key: 'widthMm' | 'heightMm' | 'depthMm', value: number) => {
    updateClassSyntax({
      ...classSyntax,
      three_d: {
        ...(classSyntax.three_d || {}),
        defaultSizeMm: {
          widthMm: classSyntax.three_d?.defaultSizeMm?.widthMm || 500,
          heightMm: classSyntax.three_d?.defaultSizeMm?.heightMm || 800,
          depthMm: classSyntax.three_d?.defaultSizeMm?.depthMm || 200,
          [key]: value,
        },
      },
    });
  };

  const handleClass3DModelUpload = (file?: File) => {
    if (!file || readOnly) return;
    if (!file.name.toLowerCase().endsWith('.glb')) {
      window.alert('Please upload a GLB 3D model file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      window.alert('3D model file size must be 10MB or less.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async event => {
      try {
        const result = event.target?.result as string;
        const fileId = await fileStorageService.storeFile(result, 'model', file.name);
        updateClassSyntax({
          ...classSyntax,
          three_d: {
            ...(classSyntax.three_d || {}),
            modelFileId: fileId,
            modelUrl: undefined,
          },
        });
      } catch (error: any) {
        window.alert(error.message || 'Failed to store 3D model file.');
      }
    };
    reader.readAsDataURL(file);
  };

  const updateReferenceSyntax = (syntax: ConcreteSyntaxEdge | undefined) => {
    if (!selectedReferenceEntry) return;
    const next = { ...(draft.concreteSyntaxByReferenceId || {}) };
    if (!syntax) {
      delete next[selectedReferenceEntry.reference.id];
    } else {
      next[selectedReferenceEntry.reference.id] = syntax;
    }
    onChange({ ...draft, concreteSyntaxByReferenceId: next });
  };

  return (
    <Paper sx={{ mt: 2, p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">Representation Editor</Typography>
        <Stack direction="row" spacing={1}>
          {!readOnly && <Button variant="contained" startIcon={<SaveIcon />} onClick={onSave}>Save</Button>}
          <Button onClick={onCancel}>Close</Button>
        </Stack>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { md: '360px 1fr' }, gap: 2 }}>
        <Stack spacing={2}>
          <TextField label="Name" size="small" value={draft.name} disabled={readOnly} onChange={event => onChange({ ...draft, name: event.target.value })} />
          <TextField
            label="Description"
            size="small"
            value={draft.description || ''}
            disabled={readOnly}
            multiline
            minRows={2}
            onChange={event => onChange({ ...draft, description: event.target.value })}
          />
          <FormControl size="small">
            <InputLabel>Kind</InputLabel>
            <Select
              label="Kind"
              value={draft.kind}
              disabled={readOnly}
              onChange={event => onChange({ ...draft, kind: event.target.value as RepresentationKind })}
            >
              <MenuItem value="diagram">visual view</MenuItem>
              <MenuItem value="table" disabled>table (planned)</MenuItem>
              <MenuItem value="tree" disabled>tree (planned)</MenuItem>
            </Select>
          </FormControl>
          <FormControlLabel
            control={<Checkbox checked={Boolean(draft.isDefault)} disabled={readOnly} />}
            label="Default representation"
            onChange={(_, checked) => onChange({ ...draft, isDefault: checked })}
          />
          <Typography variant="caption" color="text.secondary">
            Visual views are executable now; table and tree are reserved.
          </Typography>

          <Divider />
          <Typography variant="subtitle2">Visible Metaclasses</Typography>
          <Stack direction="row" spacing={1}>
            <Button size="small" disabled={readOnly} onClick={() => onChange({ ...draft, visibleMetaClassIds: metamodel.classes.map(cls => cls.id) })}>Select all</Button>
            <Button size="small" disabled={readOnly} onClick={() => onChange({ ...draft, visibleMetaClassIds: [], creatableMetaClassIds: [] })}>Clear all</Button>
          </Stack>
          <Box sx={{ maxHeight: 220, overflow: 'auto' }}>
            {metamodel.classes.map(cls => (
              <FormControlLabel
                key={cls.id}
                sx={{ display: 'block' }}
                control={<Checkbox size="small" checked={visibleSet.has(cls.id)} disabled={readOnly} onChange={(_, checked) => setVisible(cls.id, checked)} />}
                label={`${cls.name}${cls.abstract ? ' (abstract)' : ''}`}
              />
            ))}
          </Box>

          <Divider />
          <Typography variant="subtitle2">Creatable Metaclasses</Typography>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              disabled={readOnly}
              onClick={() => onChange({
                ...draft,
                creatableMetaClassIds: concreteClasses.filter(cls => visibleSet.has(cls.id)).map(cls => cls.id),
              })}
            >
              Use visible concrete
            </Button>
            <Button size="small" disabled={readOnly} onClick={() => onChange({ ...draft, creatableMetaClassIds: [] })}>Clear all</Button>
          </Stack>
          <Box sx={{ maxHeight: 220, overflow: 'auto' }}>
            {concreteClasses.map(cls => (
              <FormControlLabel
                key={cls.id}
                sx={{ display: 'block' }}
                control={<Checkbox size="small" checked={creatableSet.has(cls.id)} disabled={readOnly || !visibleSet.has(cls.id)} onChange={(_, checked) => setCreatable(cls.id, checked)} />}
                label={cls.name}
              />
            ))}
          </Box>

          <Divider />
          <Typography variant="subtitle2">Reserved Mappings</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={`${draft.edgeMappings?.length || 0} edge mappings`} />
            <Chip size="small" label={`${draft.pinMappings?.length || 0} pin mappings`} />
            <Chip size="small" label={`${draft.toolDefinitions?.length || 0} tools`} />
          </Stack>
        </Stack>

        <Stack spacing={2}>
          {draft.visibleMetaClassIds.length === 0 && <Alert severity="warning">Visual representation has no visible metaclasses.</Alert>}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>Metaclass Notation</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Stored on this representation description. Fallbacks are shown as starting values.
            </Typography>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Metaclass</InputLabel>
              <Select
                label="Metaclass"
                value={selectedClass?.id || ''}
                onChange={event => onSelectClassNotation(event.target.value)}
              >
                {metamodel.classes.map(cls => (
                  <MenuItem key={cls.id} value={cls.id}>
                    {cls.name} - {getClassSyntaxSource(cls)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {selectedClass && (
              <Stack spacing={2}>
                <FormControl size="small">
                  <InputLabel>Shape</InputLabel>
                  <Select label="Shape" value={classSyntax.two_d?.shape || 'rectangle'} disabled={readOnly} onChange={event => updateClass2D('shape', event.target.value)}>
                    {shapeOptions.map(shape => <MenuItem key={shape} value={shape}>{shape}</MenuItem>)}
                  </Select>
                </FormControl>
                <Stack direction="row" spacing={1}>
                  <ColorSwatchField label="Fill" value={classSyntax.two_d?.fillColor || '#4287f5'} disabled={readOnly} onChange={value => updateClass2D('fillColor', value)} />
                  <ColorSwatchField label="Stroke" value={classSyntax.two_d?.strokeColor || '#000000'} disabled={readOnly} onChange={value => updateClass2D('strokeColor', value)} />
                  <TextField label="Stroke width" type="number" size="small" value={classSyntax.two_d?.strokeWidth || 1} disabled={readOnly} onChange={event => updateClass2D('strokeWidth', Number(event.target.value))} />
                </Stack>
                <Stack direction="row" spacing={1}>
                  <TextField label="Width" type="number" size="small" value={classSyntax.two_d?.defaultSize?.width || 120} disabled={readOnly} onChange={event => updateClass2DSize('width', Number(event.target.value))} />
                  <TextField label="Height" type="number" size="small" value={classSyntax.two_d?.defaultSize?.height || 80} disabled={readOnly} onChange={event => updateClass2DSize('height', Number(event.target.value))} />
                </Stack>
                <Divider />
                <Typography variant="subtitle2">3D</Typography>
                <TextField
                  label="3D model URL"
                  size="small"
                  value={classSyntax.three_d?.modelUrl || ''}
                  disabled={readOnly}
                  placeholder="/models/mobile_robot.glb or https://..."
                  onChange={event => updateClass3D('modelUrl', event.target.value || undefined)}
                />
                {!readOnly && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Button size="small" variant="outlined" component="label">
                      Upload GLB
                      <input
                        type="file"
                        hidden
                        accept=".glb,model/gltf-binary"
                        onChange={event => {
                          handleClass3DModelUpload(event.target.files?.[0]);
                          event.target.value = '';
                        }}
                      />
                    </Button>
                    {(classSyntax.three_d?.modelFileId || classSyntax.three_d?.modelUrl) && (
                      <Button
                        size="small"
                        color="error"
                        onClick={() => updateClassSyntax({
                          ...classSyntax,
                          three_d: {
                            ...(classSyntax.three_d || {}),
                            modelFileId: undefined,
                            modelUrl: undefined,
                          },
                        })}
                      >
                        Clear model
                      </Button>
                    )}
                    {classSyntax.three_d?.modelFileId && (
                      <Typography variant="caption" color="text.secondary">
                        Stored model: {classSyntax.three_d.modelFileId.slice(0, 8)}...
                      </Typography>
                    )}
                  </Stack>
                )}
                <FormControl size="small">
                  <InputLabel>Fallback</InputLabel>
                  <Select label="Fallback" value={classSyntax.three_d?.fallbackShape || 'box'} disabled={readOnly} onChange={event => updateClass3D('fallbackShape', event.target.value)}>
                    {fallbackShapeOptions.map(shape => <MenuItem key={shape} value={shape}>{shape}</MenuItem>)}
                  </Select>
                </FormControl>
                <ColorSwatchField label="Fallback color" value={classSyntax.three_d?.fallbackColor || '#4287f5'} disabled={readOnly} onChange={value => updateClass3D('fallbackColor', value)} />
                <Stack direction="row" spacing={1}>
                  <TextField label="W mm" type="number" size="small" value={classSyntax.three_d?.defaultSizeMm?.widthMm || 500} disabled={readOnly} onChange={event => updateClass3DSize('widthMm', Number(event.target.value))} />
                  <TextField label="H mm" type="number" size="small" value={classSyntax.three_d?.defaultSizeMm?.heightMm || 800} disabled={readOnly} onChange={event => updateClass3DSize('heightMm', Number(event.target.value))} />
                  <TextField label="D mm" type="number" size="small" value={classSyntax.three_d?.defaultSizeMm?.depthMm || 200} disabled={readOnly} onChange={event => updateClass3DSize('depthMm', Number(event.target.value))} />
                </Stack>
                {!readOnly && (
                  <Stack direction="row" spacing={1}>
                    <Button size="small" onClick={() => updateClassSyntax(hasObjectValues(classFallbackSyntax as Record<string, unknown>) ? classFallbackSyntax : undefined)}>Copy fallback</Button>
                    <Button size="small" color="error" onClick={() => updateClassSyntax(undefined)}>Clear notation</Button>
                  </Stack>
                )}
              </Stack>
            )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>Reference Notation</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Stored on this representation description. Fallbacks are shown as starting values.
            </Typography>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Reference</InputLabel>
              <Select
                label="Reference"
                value={selectedReferenceEntry?.reference.id || ''}
                onChange={event => onSelectReferenceNotation(event.target.value)}
              >
                {references.map(entry => (
                  <MenuItem key={entry.reference.id} value={entry.reference.id}>
                    {entry.sourceClass.name}.{entry.reference.name} - {getReferenceSyntaxSource(entry.reference)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {selectedReferenceEntry ? (
              <Stack spacing={2}>
                <Stack direction="row" spacing={1}>
                  <ColorSwatchField label="Line" value={referenceSyntax.lineColor || '#000000'} disabled={readOnly} onChange={value => updateReferenceSyntax({ ...referenceSyntax, lineColor: value })} />
                  <TextField label="Width" type="number" size="small" value={referenceSyntax.lineWidth || 2} disabled={readOnly} onChange={event => updateReferenceSyntax({ ...referenceSyntax, lineWidth: Number(event.target.value) })} />
                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel>Arrow</InputLabel>
                    <Select label="Arrow" value={referenceSyntax.arrowHead || 'filled'} disabled={readOnly} onChange={event => updateReferenceSyntax({ ...referenceSyntax, arrowHead: event.target.value as any })}>
                      {arrowOptions.map(arrow => <MenuItem key={arrow} value={arrow}>{arrow}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Stack>
                <TextField label="Dash pattern" size="small" value={(referenceSyntax.lineDash || []).join(',')} disabled={readOnly} onChange={event => updateReferenceSyntax({ ...referenceSyntax, lineDash: event.target.value.split(',').map(value => Number(value.trim())).filter(Number.isFinite) })} />
                <TextField label="Label format" size="small" value={referenceSyntax.labelFormat || ''} disabled={readOnly} onChange={event => updateReferenceSyntax({ ...referenceSyntax, labelFormat: event.target.value || undefined })} />
                {!readOnly && (
                  <Stack direction="row" spacing={1}>
                    <Button size="small" onClick={() => updateReferenceSyntax(hasObjectValues(referenceFallbackSyntax as Record<string, unknown>) ? referenceFallbackSyntax : undefined)}>Copy fallback</Button>
                    <Button size="small" color="error" onClick={() => updateReferenceSyntax(undefined)}>Clear notation</Button>
                  </Stack>
                )}
              </Stack>
            ) : (
              <Typography color="text.secondary">No references are defined in this metamodel.</Typography>
            )}
          </Paper>
        </Stack>
      </Box>
    </Paper>
  );
};

export default ViewpointManager;
