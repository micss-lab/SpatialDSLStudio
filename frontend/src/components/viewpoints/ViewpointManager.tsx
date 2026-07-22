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
  RepresentationContainerMapping,
  RepresentationConditionalStyle,
  RepresentationDescription,
  RepresentationEdgeMapping,
  RepresentationFilter,
  RepresentationKind,
  RepresentationLayer,
  RepresentationPropertySection,
  ToolDefinition,
  ToolOperation,
  ToolOperationValue,
  SiriusCompatibilityReport,
  SiriusInteropWarning,
  Viewpoint
} from '../../models/types';
import { useAuth } from '../../contexts/AuthContext';
import { metamodelService } from '../../services/metamodel';
import { diagramService } from '../../services/diagram';
import { modelInheritanceUtilsService, modelService } from '../../services/model';
import viewpointService from '../../services/viewpoint.service';
import { siriusInteropService } from '../../services/interoperability';
import ColorSwatchField from '../common/ColorSwatchField';
import { CreatedBy } from '../common';
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
const toolTypeOptions: Array<{ value: string; label: string; target: 'node' | 'edge' | 'none' }> = [
  { value: 'create-node', label: 'Create node', target: 'node' },
  { value: 'create-edge', label: 'Create edge', target: 'edge' },
  { value: 'delete', label: 'Delete', target: 'none' },
  { value: 'direct-edit', label: 'Direct edit', target: 'node' },
  { value: 'reconnect', label: 'Reconnect edge', target: 'edge' },
];
const normalizedToolType = (type?: string): string => (
  type === 'node' ? 'create-node' : type === 'edge' ? 'create-edge' : type || 'create-node'
);
const toolTargetKind = (type?: string): 'node' | 'edge' | 'none' => (
  toolTypeOptions.find(option => option.value === normalizedToolType(type))?.target || 'none'
);

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
  containerMappings: [],
  propertySections: [],
  edgeMappings: [],
  pinMappings: [],
  layers: [],
  filters: [],
  conditionalStyles: [],
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

  const handleExportSiriusAird = async () => {
    if (!metamodelId) return;
    setIsSiriusBusy(true);
    setError('');
    setSiriusStatus('');
    try {
      const models = modelService.getModelsByMetamodelId(metamodelId);
      if (models.length === 0) {
        throw new Error('Create a model with views before exporting a Sirius .aird session.');
      }
      // .aird export serializes the model's views; mirror .aird import's model resolution.
      const model = models[0];
      const result = await siriusInteropService.exportAird(model.id);
      siriusInteropService.downloadText(result.filename, result.content);
      setSiriusReport(result.report);
      const fromModel = models.length > 1 ? ` for model "${model.name}"` : '';
      setSiriusStatus(`Exported ${result.filename}${fromModel}.`);
      setIsSiriusReportOpen(true);
    } catch (error: any) {
      setError(error.message || 'Failed to export Sirius .aird view');
    } finally {
      setIsSiriusBusy(false);
    }
  };

  const handleExportSiriusProjectZip = async () => {
    if (!metamodelId) return;
    setIsSiriusBusy(true);
    setError('');
    try {
      const models = modelService.getModelsByMetamodelId(metamodelId);
      if (models.length === 0) {
        throw new Error('Create a model with at least one view before exporting a Sirius project ZIP.');
      }
      const model = models[0];
      const result = await siriusInteropService.exportProjectZip(metamodelId, model.id);
      siriusInteropService.downloadBlob(result.filename, result.blob);
      setSiriusReport(result.report);
      const fromModel = models.length > 1 ? ` for model "${model.name}"` : '';
      setSiriusStatus(`Exported ${result.filename}${fromModel}.`);
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
      ...(description.tableColumns !== undefined && { tableColumns: [...description.tableColumns] }),
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
          {canEditMetamodel && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileDownloadIcon />}
              disabled={isSiriusBusy}
              onClick={handleExportSiriusAird}
            >
              Export .aird View
            </Button>
          )}
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
                secondary={
                  <>
                    {`${previewText(viewpoint.description) ? `${previewText(viewpoint.description)} · ` : ''}${viewpoint.representationDescriptions.length} representation(s)${usedViewpointCounts.get(viewpoint.id) ? ` · ${usedViewpointCounts.get(viewpoint.id)} view(s)` : ''}`}
                    <CreatedBy isOwner={metamodel?.isOwner} ownerEmail={metamodel?.ownerEmail} />
                  </>
                }
                secondaryTypographyProps={{ component: 'div' }}
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
  const tableColumnOptions = Array.from(new Set(
    metamodel.classes
      .filter(cls => visibleSet.size === 0 || visibleSet.has(cls.id))
      .flatMap(cls => modelInheritanceUtilsService.getAllAttributes(cls, metamodel).map(attribute => attribute.name))
  ));
  const selectedTableColumns = draft.tableColumns === undefined
    ? tableColumnOptions
    : draft.tableColumns;
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

  const edgeMappings = draft.edgeMappings || [];
  const mappedReferenceIds = new Set(edgeMappings.map(mapping => mapping.referenceId).filter(Boolean));
  const addableReferences = references.filter(entry => !mappedReferenceIds.has(entry.reference.id));

  const addEdgeMapping = (referenceId: string) => {
    const entry = references.find(candidate => candidate.reference.id === referenceId);
    if (!entry) return;
    onChange({
      ...draft,
      edgeMappings: [
        ...edgeMappings,
        { id: uuidv4(), referenceId: entry.reference.id, referenceName: entry.reference.name },
      ],
    });
  };

  const updateEdgeMapping = (id: string, patch: Partial<RepresentationEdgeMapping>) => {
    onChange({
      ...draft,
      edgeMappings: edgeMappings.map(mapping => (mapping.id === id ? { ...mapping, ...patch } : mapping)),
    });
  };

  const removeEdgeMapping = (id: string) => {
    onChange({ ...draft, edgeMappings: edgeMappings.filter(mapping => mapping.id !== id) });
  };

  const containerMappings = draft.containerMappings || [];
  const getContainmentReferences = (metaClassId: string) => {
    const metaClass = metamodel.classes.find(candidate => candidate.id === metaClassId);
    return metaClass
      ? modelInheritanceUtilsService.getAllReferences(metaClass, metamodel).filter(reference => reference.containment)
      : [];
  };
  const containerClasses = metamodel.classes.filter(metaClass => getContainmentReferences(metaClass.id).length > 0);
  const mappedContainerKeys = new Set(containerMappings.map(mapping => (
    `${mapping.containerMetaClassId}:${mapping.containmentReferenceId}`
  )));
  const addableContainerPairs = containerClasses.flatMap(metaClass => (
    getContainmentReferences(metaClass.id)
      .filter(reference => !mappedContainerKeys.has(`${metaClass.id}:${reference.id}`))
      .map(reference => ({ metaClass, reference }))
  ));

  const addContainerMapping = () => {
    const pair = addableContainerPairs[0];
    if (!pair) return;
    onChange({
      ...draft,
      visibleMetaClassIds: Array.from(new Set([
        ...(draft.visibleMetaClassIds || []),
        pair.metaClass.id,
        pair.reference.target,
      ])),
      containerMappings: [
        ...containerMappings,
        {
          id: uuidv4(),
          containerMetaClassId: pair.metaClass.id,
          containmentReferenceId: pair.reference.id,
          childMetaClassIds: [pair.reference.target],
          concreteSyntax: draft.concreteSyntaxByMetaClassId?.[pair.metaClass.id]
            || pair.metaClass.concreteSyntax
            || { two_d: { shape: 'rectangle', fillColor: '#f8fafc', strokeColor: '#64748b', defaultSize: { width: 420, height: 260 } } },
        },
      ],
    });
  };

  const updateContainerMapping = (id: string, patch: Partial<RepresentationContainerMapping>) => {
    onChange({
      ...draft,
      containerMappings: containerMappings.map(mapping => (
        mapping.id === id ? { ...mapping, ...patch } : mapping
      )),
    });
  };

  const removeContainerMapping = (id: string) => {
    onChange({
      ...draft,
      containerMappings: containerMappings.filter(mapping => mapping.id !== id),
    });
  };

  const propertySections = draft.propertySections || [];
  const getPropertySectionClasses = (section: RepresentationPropertySection): MetaClass[] => {
    const configured = section.metaClassIds || [];
    return configured.length > 0
      ? metamodel.classes.filter(metaClass => configured.includes(metaClass.id))
      : metamodel.classes.filter(metaClass => visibleSet.size === 0 || visibleSet.has(metaClass.id));
  };
  const getPropertyAttributeOptions = (section: RepresentationPropertySection): string[] => (
    Array.from(new Set(getPropertySectionClasses(section).flatMap(metaClass => (
      modelInheritanceUtilsService.getAllAttributes(metaClass, metamodel).map(attribute => attribute.name)
    ))))
  );
  const getPropertyReferenceOptions = (section: RepresentationPropertySection): string[] => (
    Array.from(new Set(getPropertySectionClasses(section).flatMap(metaClass => (
      modelInheritanceUtilsService.getAllReferences(metaClass, metamodel).map(reference => reference.name)
    ))))
  );
  const addPropertySection = () => {
    const defaultClass = concreteClasses.find(metaClass => visibleSet.size === 0 || visibleSet.has(metaClass.id));
    const suffix = propertySections.length > 0 ? ` ${propertySections.length + 1}` : '';
    onChange({
      ...draft,
      propertySections: [
        ...propertySections,
        {
          id: uuidv4(),
          name: `Properties${suffix}`,
          metaClassIds: defaultClass ? [defaultClass.id] : [],
          attributeNames: defaultClass
            ? modelInheritanceUtilsService.getAllAttributes(defaultClass, metamodel).map(attribute => attribute.name)
            : [],
          referenceNames: defaultClass
            ? modelInheritanceUtilsService.getAllReferences(defaultClass, metamodel).map(reference => reference.name)
            : [],
        },
      ],
    });
  };
  const updatePropertySection = (id: string, patch: Partial<RepresentationPropertySection>) => {
    onChange({
      ...draft,
      propertySections: propertySections.map(section => (
        section.id === id ? { ...section, ...patch } : section
      )),
    });
  };
  const removePropertySection = (id: string) => {
    onChange({
      ...draft,
      propertySections: propertySections.filter(section => section.id !== id),
    });
  };

  const layers = draft.layers || [];
  const filters = draft.filters || [];
  const conditionalStyles = draft.conditionalStyles || [];
  const updateLayer = (id: string, patch: Partial<RepresentationLayer>) => {
    onChange({
      ...draft,
      layers: layers.map(layer => (layer.id === id ? { ...layer, ...patch } : layer)),
    });
  };
  const updateFilter = (id: string, patch: Partial<RepresentationFilter>) => {
    onChange({
      ...draft,
      filters: filters.map(filter => (filter.id === id ? { ...filter, ...patch } : filter)),
    });
  };
  const updateConditionalStyle = (
    id: string,
    patch: Partial<RepresentationConditionalStyle>
  ) => {
    onChange({
      ...draft,
      conditionalStyles: conditionalStyles.map(style => (
        style.id === id ? { ...style, ...patch } : style
      )),
    });
  };

  const toolDefinitions = draft.toolDefinitions || [];

  const addTool = (type: string) => {
    const label = toolTypeOptions.find(option => option.value === type)?.label || 'Tool';
    onChange({
      ...draft,
      toolDefinitions: [...toolDefinitions, { id: uuidv4(), name: label, type }],
    });
  };

  const updateTool = (id: string, patch: Partial<ToolDefinition>) => {
    onChange({
      ...draft,
      toolDefinitions: toolDefinitions.map(tool => (tool.id === id ? { ...tool, ...patch } : tool)),
    });
  };

  const removeTool = (id: string) => {
    onChange({ ...draft, toolDefinitions: toolDefinitions.filter(tool => tool.id !== id) });
  };

  const getToolAttributes = (tool: ToolDefinition) => {
    const metaClass = metamodel.classes.find(candidate => candidate.id === tool.metaClassId);
    return metaClass
      ? modelInheritanceUtilsService.getAllAttributes(metaClass, metamodel).filter(attribute => !attribute.many)
      : [];
  };

  const setToolOperations = (tool: ToolDefinition, operations: ToolOperation[]) => {
    updateTool(tool.id, {
      payload: {
        ...(tool.payload || {}),
        operations,
      },
    });
  };

  const addSetAttributeOperation = (tool: ToolDefinition) => {
    const attributes = getToolAttributes(tool);
    const operations = tool.payload?.operations || [];
    const usedNames = new Set(operations.map(operation => operation.attributeName));
    const attribute = attributes.find(candidate => !usedNames.has(candidate.name));
    if (!attribute) return;
    const attributeType = attribute.type;

    const value: ToolOperationValue = attributeType === 'number'
      ? 0
      : attributeType === 'boolean'
        ? false
        : typeof attributeType === 'object'
          ? metamodel.enums?.find(candidate => candidate.id === attributeType.enumId)?.literals[0]?.name || ''
          : attributeType === 'date'
            ? new Date().toISOString()
            : '';
    setToolOperations(tool, [
      ...operations,
      { type: 'set-attribute', attributeName: attribute.name, value },
    ]);
  };

  const updateSetAttributeOperation = (
    tool: ToolDefinition,
    operationIndex: number,
    patch: Partial<ToolOperation>
  ) => {
    const operations = [...(tool.payload?.operations || [])];
    operations[operationIndex] = { ...operations[operationIndex], ...patch } as ToolOperation;
    setToolOperations(tool, operations);
  };

  const removeSetAttributeOperation = (tool: ToolDefinition, operationIndex: number) => {
    setToolOperations(
      tool,
      (tool.payload?.operations || []).filter((_, index) => index !== operationIndex)
    );
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
          {!readOnly && <Button data-testid="save-representation" variant="contained" startIcon={<SaveIcon />} onClick={onSave}>Save</Button>}
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
            <InputLabel id="representation-kind-label">Kind</InputLabel>
            <Select
              labelId="representation-kind-label"
              id="representation-kind"
              label="Kind"
              value={draft.kind}
              disabled={readOnly}
              onChange={event => {
                const kind = event.target.value as RepresentationKind;
                onChange({
                  ...draft,
                  kind,
                  containerMappings: kind === 'diagram' ? draft.containerMappings : [],
                  propertySections: kind === 'diagram' ? draft.propertySections : [],
                });
              }}
            >
              <MenuItem value="diagram">visual view</MenuItem>
              <MenuItem value="table">table</MenuItem>
              <MenuItem value="tree">tree</MenuItem>
            </Select>
          </FormControl>
          <FormControlLabel
            control={<Checkbox checked={Boolean(draft.isDefault)} disabled={readOnly} />}
            label="Default representation"
            onChange={(_, checked) => onChange({ ...draft, isDefault: checked })}
          />
          <Typography variant="caption" color="text.secondary">
            Visual, table, and tree views are executable.
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

          {draft.kind === 'table' && (
            <>
              <Divider />
              <Typography variant="subtitle2">Table Columns</Typography>
              <Typography variant="caption" color="text.secondary">
                Choose the model attributes shown as editable columns. With no explicit configuration, all attributes are shown.
              </Typography>
              <FormControl size="small" fullWidth>
                <InputLabel id="table-columns-label">Attributes</InputLabel>
                <Select
                  labelId="table-columns-label"
                  id="table-columns"
                  multiple
                  label="Attributes"
                  value={selectedTableColumns}
                  disabled={readOnly}
                  SelectDisplayProps={{ 'data-testid': 'table-columns-select' } as any}
                  onChange={event => {
                    const value = event.target.value;
                    onChange({
                      ...draft,
                      tableColumns: typeof value === 'string' ? value.split(',') : value as string[],
                    });
                  }}
                  renderValue={selected => (selected as string[]).join(', ') || 'No attributes'}
                >
                  {tableColumnOptions.map(name => (
                    <MenuItem key={name} value={name}>
                      <Checkbox size="small" checked={selectedTableColumns.includes(name)} />
                      {name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  disabled={readOnly}
                  onClick={() => onChange({ ...draft, tableColumns: [...tableColumnOptions] })}
                >
                  Select all
                </Button>
                <Button
                  size="small"
                  disabled={readOnly}
                  onClick={() => onChange({ ...draft, tableColumns: [] })}
                >
                  Clear all
                </Button>
                <Button
                  size="small"
                  disabled={readOnly}
                  onClick={() => {
                    const nextDraft = { ...draft };
                    delete nextDraft.tableColumns;
                    onChange(nextDraft);
                  }}
                >
                  Use automatic
                </Button>
              </Stack>
            </>
          )}

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
          <Typography variant="subtitle2">Mappings</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={`${draft.containerMappings?.length || 0} container mappings`} />
            <Chip size="small" label={`${draft.propertySections?.length || 0} property sections`} />
            <Chip size="small" label={`${draft.edgeMappings?.length || 0} edge mappings`} />
            <Chip size="small" label={`${draft.pinMappings?.length || 0} pin mappings`} />
            <Chip size="small" label={`${draft.layers?.length || 0} additional layers`} />
            <Chip size="small" label={`${draft.filters?.length || 0} filters`} />
            <Chip size="small" label={`${draft.conditionalStyles?.length || 0} conditional styles`} />
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

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>Node Mappings</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Each visible concrete metaclass is a node mapping. Toggle whether it can be created from the palette and jump to its style.
            </Typography>
            {concreteClasses.filter(cls => visibleSet.has(cls.id)).length === 0 ? (
              <Typography color="text.secondary">No visible concrete metaclasses yet.</Typography>
            ) : (
              <Stack spacing={1}>
                {concreteClasses.filter(cls => visibleSet.has(cls.id)).map(cls => (
                  <Stack key={cls.id} direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                    <Typography variant="body2" sx={{ minWidth: 140, fontWeight: 500 }}>{cls.name}</Typography>
                    <Chip size="small" variant="outlined" label={getClassSyntaxSource(cls)} />
                    <FormControlLabel
                      control={<Checkbox size="small" checked={creatableSet.has(cls.id)} disabled={readOnly} onChange={(_, checked) => setCreatable(cls.id, checked)} />}
                      label={<Typography variant="caption">creatable</Typography>}
                    />
                    <Button size="small" onClick={() => onSelectClassNotation(cls.id)}>Edit style</Button>
                  </Stack>
                ))}
              </Stack>
            )}
          </Paper>

          {draft.kind === 'diagram' && (
            <Paper variant="outlined" sx={{ p: 2 }} data-testid="sirius-advanced-features">
              <Typography variant="subtitle1" gutterBottom>Sirius Advanced Features</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                Imported layers, filters, and conditional styles are retained for Sirius round trips. Runtime expression evaluation remains disabled.
              </Typography>

              <Typography variant="subtitle2">Additional Layers</Typography>
              {layers.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No additional layers.</Typography>
              ) : (
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {layers.map(layer => (
                    <Paper key={layer.id} variant="outlined" sx={{ p: 1.25 }}>
                      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                        <FormControlLabel
                          control={(
                            <Checkbox
                              size="small"
                              checked={layer.enabled ?? layer.activeByDefault ?? false}
                              disabled={readOnly || layer.optional === false}
                              onChange={(_, checked) => updateLayer(layer.id, {
                                enabled: checked,
                                activeByDefault: checked,
                              })}
                            />
                          )}
                          label={`${layer.label || layer.name} layer enabled`}
                        />
                        <Chip size="small" variant="outlined" label={`${layer.mappings?.length || 0} mappings`} />
                        {layer.optional === false && <Chip size="small" label="mandatory" />}
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}

              <Divider sx={{ my: 1.5 }} />
              <Typography variant="subtitle2">Filters</Typography>
              {filters.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No filters.</Typography>
              ) : (
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {filters.map(filter => (
                    <Paper key={filter.id} variant="outlined" sx={{ p: 1.25 }}>
                      <FormControlLabel
                        control={(
                          <Checkbox
                            size="small"
                            checked={filter.enabled !== false}
                            disabled={readOnly}
                            onChange={(_, checked) => updateFilter(filter.id, { enabled: checked })}
                          />
                        )}
                        label={`${filter.name} filter enabled`}
                      />
                      {filter.rules.map(rule => (
                        <Typography key={rule.id} variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {rule.kind} / {rule.filterKind || 'hide'}: {rule.semanticConditionExpression || rule.viewConditionExpression || 'no condition'}
                        </Typography>
                      ))}
                    </Paper>
                  ))}
                </Stack>
              )}

              <Divider sx={{ my: 1.5 }} />
              <Typography variant="subtitle2">Conditional Styles</Typography>
              {conditionalStyles.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No conditional styles.</Typography>
              ) : (
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {conditionalStyles.map((style, index) => (
                    <Paper key={style.id} variant="outlined" sx={{ p: 1.25 }}>
                      <FormControlLabel
                        control={(
                          <Checkbox
                            size="small"
                            checked={style.enabled !== false}
                            disabled={readOnly}
                            onChange={(_, checked) => updateConditionalStyle(style.id, { enabled: checked })}
                          />
                        )}
                        label={`Conditional style ${index + 1} enabled`}
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {style.mappingKind} mapping {style.mappingId}: {style.predicateExpression || 'no predicate'}
                      </Typography>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Paper>
          )}

          {draft.kind === 'diagram' && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>Container Mappings</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Render children of a containment reference inside their semantic parent. Container size is fixed by this mapping; automatic sizing is a later feature.
            </Typography>
            {!readOnly && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={addContainerMapping}
                disabled={addableContainerPairs.length === 0}
                data-testid="add-container-mapping"
                sx={{ mb: 2 }}
              >
                Add container mapping
              </Button>
            )}
            {containerMappings.length === 0 ? (
              <Typography color="text.secondary">No container mappings. Nodes render at the diagram root.</Typography>
            ) : (
              <Stack spacing={2}>
                {containerMappings.map(mapping => {
                  const containmentReferences = getContainmentReferences(mapping.containerMetaClassId);
                  const reference = containmentReferences.find(candidate => (
                    candidate.id === mapping.containmentReferenceId || candidate.name === mapping.containmentReferenceId
                  ));
                  const childClass = metamodel.classes.find(candidate => candidate.id === reference?.target);
                  const syntax = mapping.concreteSyntax || {};
                  const twoD = syntax.two_d || {};
                  const update2D = (patch: Partial<NonNullable<ConcreteSyntax['two_d']>>) => {
                    updateContainerMapping(mapping.id, {
                      concreteSyntax: { ...syntax, two_d: { ...twoD, ...patch } },
                    });
                  };

                  return (
                    <Paper key={mapping.id} variant="outlined" sx={{ p: 1.5 }}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <FormControl size="small" sx={{ minWidth: 170 }}>
                          <InputLabel id={`container-${mapping.id}-class-label`}>Container metaclass</InputLabel>
                          <Select
                            id={`container-${mapping.id}-class`}
                            labelId={`container-${mapping.id}-class-label`}
                            label="Container metaclass"
                            value={mapping.containerMetaClassId}
                            disabled={readOnly}
                            onChange={event => {
                              const containerMetaClassId = event.target.value as string;
                              const nextReference = getContainmentReferences(containerMetaClassId)[0];
                              updateContainerMapping(mapping.id, {
                                containerMetaClassId,
                                containmentReferenceId: nextReference?.id || '',
                                childMetaClassIds: nextReference ? [nextReference.target] : [],
                              });
                            }}
                          >
                            {containerClasses.map(candidate => (
                              <MenuItem key={candidate.id} value={candidate.id}>{candidate.name}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <FormControl size="small" sx={{ minWidth: 190 }}>
                          <InputLabel id={`container-${mapping.id}-reference-label`}>Containment reference</InputLabel>
                          <Select
                            id={`container-${mapping.id}-reference`}
                            labelId={`container-${mapping.id}-reference-label`}
                            label="Containment reference"
                            value={reference?.id || ''}
                            disabled={readOnly}
                            onChange={event => {
                              const containmentReferenceId = event.target.value as string;
                              const nextReference = containmentReferences.find(candidate => candidate.id === containmentReferenceId);
                              updateContainerMapping(mapping.id, {
                                containmentReferenceId,
                                childMetaClassIds: nextReference ? [nextReference.target] : [],
                              });
                            }}
                          >
                            {containmentReferences.map(candidate => (
                              <MenuItem key={candidate.id} value={candidate.id}>{candidate.name}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <Chip size="small" label={`Children: ${childClass?.name || 'unresolved'}`} />
                        {!readOnly && (
                          <Tooltip title="Remove container mapping">
                            <IconButton size="small" color="error" onClick={() => removeContainerMapping(mapping.id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center" sx={{ mt: 1.5 }}>
                        <FormControl size="small" sx={{ minWidth: 120 }}>
                          <InputLabel>Shape</InputLabel>
                          <Select label="Shape" value={twoD.shape || 'rectangle'} disabled={readOnly} onChange={event => update2D({ shape: event.target.value as any })}>
                            {shapeOptions.map(shape => <MenuItem key={shape} value={shape}>{shape}</MenuItem>)}
                          </Select>
                        </FormControl>
                        <ColorSwatchField label="Fill" value={twoD.fillColor || '#f8fafc'} disabled={readOnly} onChange={value => update2D({ fillColor: value })} />
                        <ColorSwatchField label="Stroke" value={twoD.strokeColor || '#64748b'} disabled={readOnly} onChange={value => update2D({ strokeColor: value })} />
                        <TextField
                          label="Container width"
                          type="number"
                          size="small"
                          sx={{ width: 100 }}
                          value={twoD.defaultSize?.width || 420}
                          disabled={readOnly}
                          onChange={event => update2D({ defaultSize: { width: Number(event.target.value), height: twoD.defaultSize?.height || 260 } })}
                        />
                        <TextField
                          label="Container height"
                          type="number"
                          size="small"
                          sx={{ width: 100 }}
                          value={twoD.defaultSize?.height || 260}
                          disabled={readOnly}
                          onChange={event => update2D({ defaultSize: { width: twoD.defaultSize?.width || 420, height: Number(event.target.value) } })}
                        />
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Paper>
          )}

          {draft.kind === 'diagram' && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>Property Sections</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Group the semantic attributes and references shown in an element&apos;s property panel. An empty metaclass selection applies the section to every visible metaclass.
            </Typography>
            {!readOnly && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={addPropertySection}
                data-testid="add-property-section"
                sx={{ mb: 2 }}
              >
                Add property section
              </Button>
            )}
            {propertySections.length === 0 ? (
              <Typography color="text.secondary">No property sections. The editor uses its default property fields.</Typography>
            ) : (
              <Stack spacing={2}>
                {propertySections.map(section => {
                  const attributeOptions = getPropertyAttributeOptions(section);
                  const referenceOptions = getPropertyReferenceOptions(section);
                  return (
                    <Paper key={section.id} variant="outlined" sx={{ p: 1.5 }} data-testid={`property-section-${section.id}`}>
                      <Stack spacing={1.5}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <TextField
                            label="Section name"
                            size="small"
                            value={section.name}
                            disabled={readOnly}
                            fullWidth
                            onChange={event => updatePropertySection(section.id, { name: event.target.value })}
                          />
                          {!readOnly && (
                            <Tooltip title="Remove property section">
                              <IconButton size="small" color="error" onClick={() => removePropertySection(section.id)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                        <FormControl size="small" fullWidth>
                          <InputLabel id={`property-section-${section.id}-classes-label`}>Applies to metaclasses</InputLabel>
                          <Select
                            labelId={`property-section-${section.id}-classes-label`}
                            label="Applies to metaclasses"
                            multiple
                            value={section.metaClassIds || []}
                            disabled={readOnly}
                            onChange={event => updatePropertySection(section.id, { metaClassIds: event.target.value as string[] })}
                            renderValue={selected => (selected as string[]).length > 0
                              ? `${(selected as string[]).length} metaclass(es)`
                              : 'All visible metaclasses'}
                          >
                            {metamodel.classes.map(metaClass => (
                              <MenuItem key={metaClass.id} value={metaClass.id}>
                                <Checkbox size="small" checked={(section.metaClassIds || []).includes(metaClass.id)} />
                                {metaClass.name}{metaClass.abstract ? ' (abstract)' : ''}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <FormControl size="small" fullWidth>
                          <InputLabel id={`property-section-${section.id}-attributes-label`}>Attributes</InputLabel>
                          <Select
                            labelId={`property-section-${section.id}-attributes-label`}
                            label="Attributes"
                            multiple
                            value={section.attributeNames || []}
                            disabled={readOnly}
                            onChange={event => updatePropertySection(section.id, { attributeNames: event.target.value as string[] })}
                            renderValue={selected => (selected as string[]).join(', ') || 'No attributes'}
                          >
                            {attributeOptions.map(name => (
                              <MenuItem key={name} value={name}>
                                <Checkbox size="small" checked={(section.attributeNames || []).includes(name)} />
                                {name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <FormControl size="small" fullWidth>
                          <InputLabel id={`property-section-${section.id}-references-label`}>References</InputLabel>
                          <Select
                            labelId={`property-section-${section.id}-references-label`}
                            label="References"
                            multiple
                            value={section.referenceNames || []}
                            disabled={readOnly}
                            onChange={event => updatePropertySection(section.id, { referenceNames: event.target.value as string[] })}
                            renderValue={selected => (selected as string[]).join(', ') || 'No references'}
                          >
                            {referenceOptions.map(name => (
                              <MenuItem key={name} value={name}>
                                <Checkbox size="small" checked={(section.referenceNames || []).includes(name)} />
                                {name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Paper>
          )}

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>Edge Mappings</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              With no edge mappings, every metamodel reference can be drawn as an edge. Add mappings to restrict which references become edges (by source/target metaclass) and to style them.
            </Typography>
            {!readOnly && (
              <FormControl fullWidth size="small" sx={{ mb: 2 }} disabled={addableReferences.length === 0}>
                <InputLabel>Add edge mapping</InputLabel>
                <Select
                  label="Add edge mapping"
                  value=""
                  SelectDisplayProps={{ 'data-testid': 'add-edge-mapping-select' } as any}
                  onChange={event => event.target.value && addEdgeMapping(event.target.value as string)}
                >
                  {addableReferences.map(entry => (
                    <MenuItem key={entry.reference.id} value={entry.reference.id}>
                      {entry.sourceClass.name}.{entry.reference.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {edgeMappings.length === 0 ? (
              <Typography color="text.secondary">No edge mappings. All references are drawable as edges.</Typography>
            ) : (
              <Stack spacing={2}>
                {edgeMappings.map(mapping => {
                  const refEntry = references.find(entry => entry.reference.id === mapping.referenceId);
                  const targetName = refEntry ? (metamodel.classes.find(cls => cls.id === refEntry.reference.target)?.name || '?') : '';
                  const syntax = mapping.concreteSyntax || {};
                  const updateSyntax = (patch: Partial<ConcreteSyntaxEdge>) => updateEdgeMapping(mapping.id, { concreteSyntax: { ...syntax, ...patch } });
                  return (
                    <Paper key={mapping.id} variant="outlined" sx={{ p: 1.5 }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {refEntry ? `${refEntry.sourceClass.name}.${refEntry.reference.name} to ${targetName}` : (mapping.referenceName || 'Unresolved reference')}
                        </Typography>
                        {!readOnly && (
                          <Tooltip title="Remove edge mapping">
                            <IconButton size="small" color="error" onClick={() => removeEdgeMapping(mapping.id)}><DeleteIcon fontSize="small" /></IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                        <FormControl size="small" sx={{ minWidth: 160 }}>
                          <InputLabel>Source metaclasses</InputLabel>
                          <Select
                            multiple
                            label="Source metaclasses"
                            value={mapping.sourceMetaClassIds || []}
                            disabled={readOnly}
                            onChange={event => updateEdgeMapping(mapping.id, { sourceMetaClassIds: (event.target.value as string[]) })}
                            renderValue={selected => `${(selected as string[]).length || 'any'} class(es)`}
                          >
                            {concreteClasses.map(cls => (
                              <MenuItem key={cls.id} value={cls.id}>
                                <Checkbox size="small" checked={(mapping.sourceMetaClassIds || []).includes(cls.id)} />
                                {cls.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <FormControl size="small" sx={{ minWidth: 160 }}>
                          <InputLabel>Target metaclasses</InputLabel>
                          <Select
                            multiple
                            label="Target metaclasses"
                            value={mapping.targetMetaClassIds || []}
                            disabled={readOnly}
                            onChange={event => updateEdgeMapping(mapping.id, { targetMetaClassIds: (event.target.value as string[]) })}
                            renderValue={selected => `${(selected as string[]).length || 'any'} class(es)`}
                          >
                            {concreteClasses.map(cls => (
                              <MenuItem key={cls.id} value={cls.id}>
                                <Checkbox size="small" checked={(mapping.targetMetaClassIds || []).includes(cls.id)} />
                                {cls.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Stack>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                        <ColorSwatchField label="Line" value={syntax.lineColor || '#000000'} disabled={readOnly} onChange={value => updateSyntax({ lineColor: value })} />
                        <TextField label="Width" type="number" size="small" sx={{ width: 90 }} value={syntax.lineWidth ?? 2} disabled={readOnly} onChange={event => updateSyntax({ lineWidth: Number(event.target.value) })} />
                        <FormControl size="small" sx={{ minWidth: 110 }}>
                          <InputLabel>Arrow</InputLabel>
                          <Select label="Arrow" value={syntax.arrowHead || 'filled'} disabled={readOnly} onChange={event => updateSyntax({ arrowHead: event.target.value as any })}>
                            {arrowOptions.map(arrow => <MenuItem key={arrow} value={arrow}>{arrow}</MenuItem>)}
                          </Select>
                        </FormControl>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>Tools</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Palette and interaction tools for this representation: node/edge creation, delete, direct edit, and reconnect. Tool names round-trip through .odesign export.
            </Typography>
            {!readOnly && (
              <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel>Add tool</InputLabel>
                <Select
                  label="Add tool"
                  value=""
                  SelectDisplayProps={{ 'data-testid': 'add-tool-select' } as any}
                  onChange={event => event.target.value && addTool(event.target.value as string)}
                >
                  {toolTypeOptions.map(option => (
                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {toolDefinitions.length === 0 ? (
              <Typography color="text.secondary">No tools. The default palette uses creatable metaclasses.</Typography>
            ) : (
              <Stack spacing={1.5}>
                {toolDefinitions.map(tool => {
                  const targetKind = toolTargetKind(tool.type);
                  return (
                    <Paper key={tool.id} variant="outlined" sx={{ p: 1.5 }}>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                        <TextField label="Name" size="small" value={tool.name} disabled={readOnly} sx={{ minWidth: 160 }} onChange={event => updateTool(tool.id, { name: event.target.value })} />
                        <FormControl size="small" sx={{ minWidth: 150 }}>
                          <InputLabel id={`tool-${tool.id}-type-label`}>Type</InputLabel>
                          <Select
                            id={`tool-${tool.id}-type`}
                            labelId={`tool-${tool.id}-type-label`}
                            label="Type"
                            value={normalizedToolType(tool.type)}
                            disabled={readOnly}
                            onChange={event => updateTool(tool.id, {
                              type: event.target.value as string,
                              metaClassId: undefined,
                              referenceId: undefined,
                              payload: undefined,
                            })}
                          >
                            {toolTypeOptions.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
                          </Select>
                        </FormControl>
                        {targetKind === 'node' && (
                          <FormControl size="small" sx={{ minWidth: 150 }}>
                            <InputLabel id={`tool-${tool.id}-metaclass-label`}>Metaclass</InputLabel>
                            <Select id={`tool-${tool.id}-metaclass`} labelId={`tool-${tool.id}-metaclass-label`} label="Metaclass" value={tool.metaClassId || ''} disabled={readOnly} onChange={event => updateTool(tool.id, { metaClassId: event.target.value as string, payload: undefined })}>
                              {concreteClasses.map(cls => <MenuItem key={cls.id} value={cls.id}>{cls.name}</MenuItem>)}
                            </Select>
                          </FormControl>
                        )}
                        {targetKind === 'edge' && (
                          <FormControl size="small" sx={{ minWidth: 170 }}>
                            <InputLabel id={`tool-${tool.id}-reference-label`}>Reference</InputLabel>
                            <Select id={`tool-${tool.id}-reference`} labelId={`tool-${tool.id}-reference-label`} label="Reference" value={tool.referenceId || ''} disabled={readOnly} onChange={event => updateTool(tool.id, { referenceId: event.target.value as string })}>
                              {references.map(entry => <MenuItem key={entry.reference.id} value={entry.reference.id}>{entry.sourceClass.name}.{entry.reference.name}</MenuItem>)}
                            </Select>
                          </FormControl>
                        )}
                        {!readOnly && (
                          <Tooltip title="Remove tool">
                            <IconButton size="small" color="error" onClick={() => removeTool(tool.id)}><DeleteIcon fontSize="small" /></IconButton>
                          </Tooltip>
                        )}
                      </Stack>

                      {normalizedToolType(tool.type) === 'create-node' && tool.metaClassId && (
                        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                            <Box>
                              <Typography variant="subtitle2">Initial attribute operations</Typography>
                              <Typography variant="caption" color="text.secondary">
                                Safe scalar values applied when this tool creates an element.
                              </Typography>
                            </Box>
                            {!readOnly && (
                              <Button
                                size="small"
                                startIcon={<AddIcon />}
                                onClick={() => addSetAttributeOperation(tool)}
                                disabled={(tool.payload?.operations || []).length >= getToolAttributes(tool).length}
                              >
                                Add value
                              </Button>
                            )}
                          </Stack>

                          {(tool.payload?.operations || []).length === 0 ? (
                            <Typography variant="body2" color="text.secondary">No initial values; metaclass defaults are used.</Typography>
                          ) : (
                            <Stack spacing={1}>
                              {(tool.payload?.operations || []).map((operation, operationIndex) => {
                                const attributes = getToolAttributes(tool);
                                const attribute = attributes.find(candidate => candidate.name === operation.attributeName);
                                const attributeType = attribute?.type;
                                const enumType = attributeType && typeof attributeType === 'object'
                                  ? metamodel.enums?.find(candidate => candidate.id === attributeType.enumId)
                                  : undefined;
                                const updateAttribute = (attributeName: string) => {
                                  const nextAttribute = attributes.find(candidate => candidate.name === attributeName);
                                  const nextAttributeType = nextAttribute?.type;
                                  const nextValue: ToolOperationValue = nextAttributeType === 'number'
                                    ? 0
                                    : nextAttributeType === 'boolean'
                                      ? false
                                      : nextAttributeType && typeof nextAttributeType === 'object'
                                        ? metamodel.enums?.find(candidate => candidate.id === nextAttributeType.enumId)?.literals[0]?.name || ''
                                        : nextAttributeType === 'date'
                                          ? new Date().toISOString()
                                          : '';
                                  updateSetAttributeOperation(tool, operationIndex, { attributeName, value: nextValue });
                                };

                                return (
                                  <Stack key={`${tool.id}-operation-${operationIndex}`} direction="row" spacing={1} alignItems="center">
                                    <FormControl size="small" sx={{ minWidth: 170 }}>
                                      <InputLabel id={`tool-${tool.id}-operation-${operationIndex}-attribute-label`}>Attribute</InputLabel>
                                      <Select
                                        id={`tool-${tool.id}-operation-${operationIndex}-attribute`}
                                        labelId={`tool-${tool.id}-operation-${operationIndex}-attribute-label`}
                                        label="Attribute"
                                        value={operation.attributeName}
                                        disabled={readOnly}
                                        onChange={event => updateAttribute(event.target.value as string)}
                                      >
                                        {attributes.map(candidate => (
                                          <MenuItem key={candidate.id} value={candidate.name}>{candidate.name}</MenuItem>
                                        ))}
                                      </Select>
                                    </FormControl>

                                    {attribute?.type === 'boolean' ? (
                                      <FormControl size="small" sx={{ minWidth: 120 }}>
                                        <InputLabel id={`tool-${tool.id}-operation-${operationIndex}-value-label`}>Value</InputLabel>
                                        <Select
                                          id={`tool-${tool.id}-operation-${operationIndex}-value`}
                                          labelId={`tool-${tool.id}-operation-${operationIndex}-value-label`}
                                          label="Value"
                                          value={String(operation.value)}
                                          disabled={readOnly}
                                          onChange={event => updateSetAttributeOperation(tool, operationIndex, { value: event.target.value === 'true' })}
                                        >
                                          <MenuItem value="true">true</MenuItem>
                                          <MenuItem value="false">false</MenuItem>
                                        </Select>
                                      </FormControl>
                                    ) : enumType ? (
                                      <FormControl size="small" sx={{ minWidth: 140 }}>
                                        <InputLabel id={`tool-${tool.id}-operation-${operationIndex}-value-label`}>Value</InputLabel>
                                        <Select
                                          id={`tool-${tool.id}-operation-${operationIndex}-value`}
                                          labelId={`tool-${tool.id}-operation-${operationIndex}-value-label`}
                                          label="Value"
                                          value={String(operation.value ?? '')}
                                          disabled={readOnly}
                                          onChange={event => updateSetAttributeOperation(tool, operationIndex, { value: event.target.value as string })}
                                        >
                                          {enumType.literals.map(literal => (
                                            <MenuItem key={literal.name} value={literal.name}>{literal.name}</MenuItem>
                                          ))}
                                        </Select>
                                      </FormControl>
                                    ) : (
                                      <TextField
                                        label="Value"
                                        size="small"
                                        type={attribute?.type === 'number' ? 'number' : attribute?.type === 'date' ? 'datetime-local' : 'text'}
                                        value={operation.value ?? ''}
                                        disabled={readOnly}
                                        onChange={event => updateSetAttributeOperation(tool, operationIndex, {
                                          value: attribute?.type === 'number' ? Number(event.target.value) : event.target.value,
                                        })}
                                      />
                                    )}

                                    {!readOnly && (
                                      <Tooltip title="Remove initial value">
                                        <IconButton size="small" color="error" onClick={() => removeSetAttributeOperation(tool, operationIndex)}>
                                          <DeleteIcon fontSize="small" />
                                        </IconButton>
                                      </Tooltip>
                                    )}
                                  </Stack>
                                );
                              })}
                            </Stack>
                          )}
                        </Box>
                      )}
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Paper>
        </Stack>
      </Box>
    </Paper>
  );
};

export default ViewpointManager;
