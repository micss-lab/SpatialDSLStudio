import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip,
  CircularProgress, Container, MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useProject } from '../../contexts/ProjectContext';
import { Model } from '../../models/types';
import { diagramService, viewValidationService } from '../../services/diagram';
import { metamodelService } from '../../services/metamodel';
import { modelService } from '../../services/model';
import viewpointService from '../../services/viewpoint.service';
import {
  matchingSimulationModels, parseSimulationReport, ReportPose, resolveSimulationElementId,
  SimulationReport, simulationResultsService,
} from '../../services/simulation-results.service';

type SavedReport = Awaited<ReturnType<typeof simulationResultsService.store>>;
type RuleFinding = SimulationReport['ruleFindings'][number];
type Trace = RuleFinding['elements'][number];

const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const seconds = (value: number) => `${value} s`;
const poseText = ({ x, y, z, rotationZ }: ReportPose) => (
  `X ${x} mm · Y ${y} mm · Z ${z} mm · yaw ${rotationZ}°`
);

function ReportFindings({ report, model, elementIds, projectId }: {
  report: SimulationReport; model?: Model; elementIds?: Record<string, string>; projectId: string;
}) {
  const metamodel = model ? metamodelService.getMetamodelById(model.conformsTo || model.metamodelId) : undefined;
  const visualViews = model ? diagramService.getDiagramsByModelId(model.id).filter(view => {
    const representation = viewpointService.resolveRepresentationDescription(view).representationDescription
      || viewpointService.resolveDefaultForMetamodel(model.conformsTo || model.metamodelId).representationDescription;
    return !representation?.kind || representation.kind === 'diagram';
  }) : [];
  const runtimeViolations = report.ruleFindings.filter(finding => finding.kind === 'runtime-rule-violation').length;

  const renderElement = (trace: Trace, comparison?: { designPose: ReportPose; observedPose: ReportPose }, at?: number) => {
    const elementId = model ? resolveSimulationElementId(report, trace, model, metamodel, elementIds) : undefined;
    const view = elementId ? visualViews.find(candidate => (
      viewValidationService.findElementForIssue(candidate, { elementId, severity: 'info', message: '' })?.type === 'node'
    )) : undefined;
    return (
      <Paper key={trace.elementId} variant="outlined" sx={{ p: 1.5 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }} justifyContent="space-between">
          <Box>
            <Typography variant="subtitle2">{trace.elementName}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{trace.className} · {trace.prim}</Typography>
          </Box>
          {view && elementId ? (
            <Button component={Link} size="small" variant="outlined"
              to={`/projects/${projectId}/views/${view.id}?mode=3d&element=${encodeURIComponent(elementId)}`}>
              Locate in 3D
            </Button>
          ) : <Typography variant="caption" color="text.secondary">Element unavailable in current 3D views.</Typography>}
        </Stack>
        {comparison && (
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} mt={1.5}>
            {[{ label: 'Designed', pose: comparison.designPose }, {
              label: at === undefined ? 'Observed' : `Observed at ${seconds(at)}`, pose: comparison.observedPose,
            }].map(({ label, pose }) => (
              <Box key={label} sx={{ flex: 1, bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Typography variant="body2">{poseText(pose)}</Typography>
              </Box>
            ))}
          </Stack>
        )}
      </Paper>
    );
  };

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack gap={1}>
          <Typography component="h2" variant="h6">{model?.name || 'Simulation run'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {report.provenance.observation.source} · {seconds(report.provenance.observation.durationS)} · {report.provenance.observation.samples} samples
          </Typography>
          <Typography component="code" variant="caption" sx={{ overflowWrap: 'anywhere' }}>{report.provenance.modelHash}</Typography>
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip size="small" label={`${runtimeViolations} runtime rule violations`} color={runtimeViolations ? 'error' : 'default'} />
            <Chip size="small" label={`${report.deviations.length} placement findings`} />
          </Stack>
        </Stack>
      </Paper>
      {report.ruleFindings.length === 0 && report.deviations.length === 0 && (
        <Alert severity="success">This run recorded no changes in rule verdicts or unexpected placement.</Alert>
      )}
      {report.ruleFindings.length > 0 && (
        <Box>
          <Typography component="h2" variant="h6" gutterBottom>Spatial rules</Typography>
          {report.ruleFindings.map((finding, index) => (
            <Accordion key={`${finding.ruleId}:${index}`} defaultExpanded={index === 0}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }}>
                  <Chip size="small" label={finding.severity} color={finding.severity} />
                  <Typography fontWeight={600}>{finding.ruleName}</Typography>
                  <Typography variant="body2" color="text.secondary">{seconds(finding.firstT)} – {seconds(finding.lastT)}</Typography>
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1.5}>
                  <Typography variant="subtitle2">
                    {finding.kind === 'runtime-rule-violation' ? 'Violated during the run' : 'Design violation cleared during the run'} · {finding.samples} samples
                  </Typography>
                  <Typography variant="body2">{finding.message}</Typography>
                  {finding.elements.map(trace => {
                    const pose = finding.poses?.find(candidate => candidate.elementId === trace.elementId);
                    const deviation = report.deviations.find(candidate => candidate.trace.elementId === trace.elementId);
                    return renderElement(trace, pose ?? deviation, pose ? finding.firstT : deviation?.onsetT);
                  })}
                </Stack>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}
      {report.deviations.length > 0 && (
        <Box>
          <Typography component="h2" variant="h6" gutterBottom>Placement findings</Typography>
          {report.deviations.map(deviation => (
            <Accordion key={`${deviation.kind}:${deviation.trace.elementId}`}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
                  <Typography fontWeight={600}>{deviation.trace.elementName}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {deviation.kind === 'runtime-drift' ? 'Runtime drift' : 'Initial offset'} · {seconds(deviation.onsetT)}
                  </Typography>
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1}>
                  {renderElement(deviation.trace, deviation, deviation.onsetT)}
                  <Typography variant="body2" color="text.secondary">Final observed position · {poseText(deviation.finalPose)}</Typography>
                </Stack>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}
    </Stack>
  );
}

export function SimulationResultsPage() {
  const { project, can } = useProject();
  const fileInput = useRef<HTMLInputElement>(null);
  const [params, setParams] = useSearchParams();
  const [saved, setSaved] = useState<SavedReport[] | null>(null);
  const [loaded, setLoaded] = useState<{ id: string; report: SimulationReport } | null>(null);
  const [pending, setPending] = useState<{ file: File; report: SimulationReport; models: Model[] } | null>(null);
  const [modelId, setModelId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [reading, setReading] = useState(false);
  const [importError, setImportError] = useState('');
  const [listError, setListError] = useState('');
  const [reportError, setReportError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const selectedId = params.get('report') || saved?.[0]?.id;
  const selection = saved?.find(item => item.id === selectedId);
  const currentReport = loaded?.id === selectedId ? loaded?.report : undefined;

  useEffect(() => {
    let active = true;
    simulationResultsService.list(project.id).then(items => {
      if (active) setSaved(items);
    }).catch(error => {
      if (active) setListError(errorMessage(error, 'Could not load simulation reports.'));
    });
    return () => { active = false; };
  }, [project.id, refresh]);

  useEffect(() => {
    setReportError('');
    if (!selection) return;
    let active = true;
    simulationResultsService.get(project.id, selection.id).then(report => {
      if (active) setLoaded({ id: selection.id, report });
    }).catch(error => {
      if (active) setReportError(errorMessage(error, 'Could not open this report.'));
    });
    return () => { active = false; };
  }, [project.id, selection, refresh]);

  const selectFile = async (file: File) => {
    setReading(true);
    setImportError('');
    setPending(null);
    try {
      const report = parseSimulationReport(await file.text());
      const models = matchingSimulationModels(report, modelService.getAllModels(), metamodelService.getAllMetamodels());
      if (models.length === 0) throw new Error('The report’s source model is unavailable in this project. Open its project and import the report there.');
      setPending({ file, report, models });
      setModelId(models.length === 1 ? models[0].id : '');
    } catch (error) {
      setImportError(errorMessage(error, 'Could not read the report file.'));
    } finally {
      setReading(false);
    }
  };

  const saveReport = async () => {
    if (!pending || !modelId) return;
    setUploading(true);
    setImportError('');
    try {
      const model = modelService.getModelById(modelId);
      if (!model) throw new Error('The selected model is unavailable. Choose a model in this project.');
      const metamodel = metamodelService.getMetamodelById(model.conformsTo || model.metamodelId);
      const result = await simulationResultsService.store(project.id, pending.file, pending.report, model, metamodel);
      setSaved(previous => [result, ...(previous ?? [])]);
      setParams({ report: result.id });
      setPending(null);
    } catch (error) {
      setImportError(errorMessage(error, 'Could not save the simulation report.'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} justifyContent="space-between" alignItems={{ sm: 'center' }}>
          <Typography component="h1" variant="h4">Simulation Results</Typography>
          {can('model.update') && (
            <>
              <Button variant="outlined" disabled={reading || uploading || saved === null} onClick={() => fileInput.current?.click()}>
                {reading ? 'Reading report…' : 'Import report'}
              </Button>
              <input ref={fileInput} hidden type="file" accept=".json,application/json" aria-label="Choose a twin-loop report"
                onChange={event => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void selectFile(file);
                }} />
            </>
          )}
        </Stack>
        {importError && <Alert severity="error">{importError}</Alert>}
        {pending && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems={{ sm: 'center' }}>
              <Typography variant="subtitle2" sx={{ flex: 1 }}>{pending.file.name}</Typography>
              <TextField select size="small" label="Project model" value={modelId} disabled={uploading}
                sx={{ minWidth: 200 }} onChange={event => setModelId(event.target.value)}>
                {pending.models.map(model => <MenuItem key={model.id} value={model.id}>{model.name} · {model.id.slice(0, 8)}</MenuItem>)}
              </TextField>
              <Button onClick={() => setPending(null)} disabled={uploading}>Cancel</Button>
              <Button variant="contained" onClick={saveReport} disabled={!modelId || uploading}>
                {uploading ? 'Saving…' : 'Save report'}
              </Button>
            </Stack>
          </Paper>
        )}
        {listError && <Alert severity="error" action={<Button onClick={() => { setListError(''); setRefresh(value => value + 1); }}>Retry</Button>}>{listError}</Alert>}
        {saved === null && !listError && <CircularProgress size={24} aria-label="Loading simulation reports" />}
        {saved?.length === 0 && <Typography color="text.secondary">No simulation reports have been imported into this project.</Typography>}
        {saved && saved.length > 0 && (
          <TextField select size="small" label="Saved report" value={selection?.id || ''}
            onChange={event => setParams({ report: event.target.value })} sx={{ maxWidth: 480 }}>
            {saved.map(item => (
              <MenuItem key={item.id} value={item.id}>
                {item.filename} · {item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Just imported'}
              </MenuItem>
            ))}
          </TextField>
        )}
        {saved && selectedId && !selection && <Alert severity="warning">This report is unavailable in the current project.</Alert>}
        {reportError && <Alert severity="error" action={<Button onClick={() => setRefresh(value => value + 1)}>Retry</Button>}>{reportError}</Alert>}
        {selection && !reportError && (currentReport
          ? <ReportFindings key={selection.id} report={currentReport} model={modelService.getModelById(selection.metadata.modelId)}
              elementIds={selection.metadata.elementIds} projectId={project.id} />
          : <CircularProgress size={24} aria-label="Opening simulation report" />)}
      </Stack>
    </Container>
  );
}
