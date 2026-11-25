import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Button, Checkbox, Chip,
  CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Paper, Stack, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useProject } from '../../contexts/ProjectContext';
import { MetamodelEvolutionChange, MetamodelEvolutionReport, MetamodelMigrationResult, MetamodelMigrationRule } from '../../models/lifecycle.types';
import { Metamodel } from '../../models/types';
import { lifecycleService } from '../../services/lifecycle.service';
import { metamodelService } from '../../services/metamodel';
import { initializeProjectSession } from '../../services/project-session.service';
import { EvolutionProposalEditor } from './EvolutionProposalEditor';
import { migrationRuleChoices } from './evolution-proposal';

const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const label = (kind: string) => kind.replace(/-/g, ' ');

function describeChange(change: MetamodelEvolutionChange, source: Metamodel, proposal: Metamodel): string {
  const cls = source.classes.find(candidate => candidate.id === change.classId)
    || proposal.classes.find(candidate => candidate.id === change.classId);
  const beforeName = change.before?.name;
  const afterName = change.after?.name;
  const name = beforeName && afterName && beforeName !== afterName ? `${beforeName} → ${afterName}` : beforeName || afterName || change.classId;
  return change.featureId && cls ? `${cls.name}.${name}` : name;
}

function ReviewDetails({ report, source, proposal }: {
  report: MetamodelEvolutionReport; source: Metamodel; proposal: Metamodel;
}) {
  return (
    <Stack spacing={2}>
      <Stack direction="row" gap={1} flexWrap="wrap">
        <Chip size="small" label={`${report.changes.length} structural changes`} />
        <Chip size="small" label={`${report.impacts.length} affected artifacts`} />
        <Chip size="small" color={report.blockers.length ? 'error' : 'success'} label={`${report.blockers.length} blockers`} />
      </Stack>
      {report.blockers.length > 0 && <Alert severity="error">
        <Typography variant="subtitle2">Resolve these blockers to apply the migration</Typography>
        <ul>{report.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul>
      </Alert>}
      {report.warnings.length > 0 && <Alert severity="warning">
        <Typography variant="subtitle2">Review before applying</Typography>
        <ul>{report.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
      </Alert>}
      {report.changes.length === 0 && <Typography variant="body2" color="text.secondary">
        {report.sourceHash === report.targetHash ? 'The proposal matches the current metamodel.' : 'The proposal changes metamodel data without changing its class or feature structure.'}
      </Typography>}
      {report.changes.length > 0 && <Accordion disableGutters defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>Structural changes</AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1}>
            {report.changes.map(change => (
              <Stack key={`${change.kind}:${change.classId}:${change.featureId}`} direction={{ xs: 'column', sm: 'row' }} gap={0.75}>
                <Typography variant="body2" fontWeight={600}>{describeChange(change, source, proposal)}</Typography>
                <Typography variant="body2" color="text.secondary">{label(change.kind)}</Typography>
                {change.breaking && <Chip size="small" color="warning" label="Breaking" sx={{ alignSelf: 'flex-start' }} />}
              </Stack>
            ))}
          </Stack>
        </AccordionDetails>
      </Accordion>}
      {report.impacts.length > 0 && <Accordion disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>Affected artifacts</AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1.5}>
            {report.impacts.map(({ artifact, name, reasons }) => (
              <Stack key={`${artifact.type}:${artifact.id}`}>
                <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>{name || artifact.id} · {artifact.type}</Typography>
                {reasons.map(reason => <Typography key={reason} variant="body2" color="text.secondary">{reason}</Typography>)}
              </Stack>
            ))}
          </Stack>
        </AccordionDetails>
      </Accordion>}
    </Stack>
  );
}

function MigrationHistory({ migrations, projectId }: { migrations: MetamodelMigrationResult[]; projectId: string }) {
  return (
    <Stack spacing={1.5}>
      <Typography component="h2" variant="h6">Migration history</Typography>
      {migrations.length === 0 && <Typography variant="body2" color="text.secondary">No migrations recorded yet.</Typography>}
      {migrations.map(migration => (
        <Accordion key={migration.id} disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" gap={1.5} alignItems="center">
              <Chip size="small" color={migration.status === 'APPLIED' ? 'success' : 'error'} label={migration.status} />
              <Typography variant="body2">{new Date(migration.appliedAt || migration.createdAt).toLocaleString()}</Typography>
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1.5}>
              {migration.status === 'APPLIED' && (
                <Typography variant="body2">{migration.migratedModels.reduce((total, model) => total + model.changedElements, 0)} elements updated and {migration.migratedModels.reduce((total, model) => total + model.deletedElements, 0)} deleted.</Typography>
              )}
              {migration.report.changes.map(change => (
                <Typography key={`${change.kind}:${change.classId}:${change.featureId}`} variant="body2">
                  {label(change.kind)} · {change.before?.name || change.after?.name || change.classId}
                  {change.before?.name && change.after?.name && change.before.name !== change.after.name ? ` → ${change.after.name}` : ''}
                </Typography>
              ))}
              <Button component={Link} to={`/projects/${projectId}/history?checkpoint=${encodeURIComponent(migration.sourceCheckpointId)}`}
                variant="outlined" size="small" sx={{ alignSelf: 'flex-start' }}>View recovery checkpoint</Button>
            </Stack>
          </AccordionDetails>
        </Accordion>
      ))}
    </Stack>
  );
}

interface Review {
  report: MetamodelEvolutionReport;
  proposal: Metamodel;
  rules: MetamodelMigrationRule[];
}

function EvolutionWorkspace({ metamodelId }: { metamodelId: string }) {
  const { project, can } = useProject();
  const projectId = project.id;
  const canEvolve = can('metamodel.evolve');
  const [source, setSource] = useState<Metamodel | null>(null);
  const [proposal, setProposal] = useState<Metamodel | null>(null);
  const [history, setHistory] = useState<MetamodelMigrationResult[] | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [rulesNeedPreview, setRulesNeedPreview] = useState(false);
  const [selectedRules, setSelectedRules] = useState<string[]>([]);
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [success, setSuccess] = useState<MetamodelMigrationResult | null>(null);

  useEffect(() => {
    let current = true;
    metamodelService.waitForPendingSave(metamodelId)
      .then(() => lifecycleService.getMetamodel(projectId, metamodelId)).then(metamodel => {
        if (current) setSource(metamodel);
      }).catch(error => {
        if (current) setLoadError(errorMessage(error, 'Could not load the metamodel.'));
      });
    lifecycleService.listMigrations(projectId, metamodelId).then(migrations => {
      if (current) setHistory(migrations);
    }).catch(error => {
      if (current) setHistoryError(errorMessage(error, 'Could not load migration history.'));
    });
    return () => { current = false; };
  }, [projectId, metamodelId, refresh]);

  const replaceProposal = (next: Metamodel | null) => {
    setProposal(next);
    setReview(null);
    setRulesNeedPreview(false);
    setSelectedRules([]);
    setError('');
  };
  const choices = source && review ? migrationRuleChoices(review.report.changes, source) : [];
  const canApply = canEvolve && !!review && review.proposal === proposal && !rulesNeedPreview
    && review.report.blockers.length === 0 && review.report.sourceHash !== review.report.targetHash;

  const preview = async () => {
    if (!proposal || !canEvolve || busy) return;
    const rules = choices.filter(choice => selectedRules.includes(choice.id)).map(choice => choice.rule);
    setBusy('preview');
    setError('');
    try {
      const report = await lifecycleService.previewEvolution(projectId, metamodelId, proposal, rules);
      setReview({ proposal, report, rules });
      setRulesNeedPreview(false);
    } catch (error) {
      setRulesNeedPreview(true);
      setError(errorMessage(error, 'Could not preview this migration.'));
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    if (!canApply || !review || busy) return;
    setBusy('apply');
    setConfirm(false);
    setError('');
    setRefreshError('');
    let result: MetamodelMigrationResult;
    try {
      result = await lifecycleService.applyEvolution(projectId, metamodelId, {
        expectedSourceHash: review.report.sourceHash,
        nextMetamodel: review.proposal,
        rules: review.rules,
      });
    } catch (error) {
      setRulesNeedPreview(true);
      setError(errorMessage(error, 'The migration failed. Preview again before retrying.'));
      setBusy(null);
      return;
    }

    setSuccess(result);
    setHistory(previous => [result, ...(previous || []).filter(migration => migration.id !== result.id)]);
    setSource(review.proposal);
    replaceProposal(null);
    try {
      await initializeProjectSession();
      setSource(await lifecycleService.getMetamodel(projectId, metamodelId));
    } catch {
      setRefreshError('The migration was saved. Reload the project to refresh its editor data.');
    } finally {
      setBusy(null);
    }
  };

  const reload = () => {
    setLoadError('');
    setHistoryError('');
    setRefresh(value => value + 1);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={2.5}>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} justifyContent="space-between" alignItems={{ sm: 'center' }}>
          <div>
            <Typography component="h1" variant="h4">Metamodel Evolution</Typography>
            {source && <Typography color="text.secondary">{source.name}</Typography>}
          </div>
          <Button component={Link} to={`/projects/${projectId}/metamodels/${metamodelId}`} variant="outlined" disabled={busy === 'apply'}>Back to metamodel</Button>
        </Stack>
        {loadError && <Alert severity="error" action={<Button onClick={reload}>Retry</Button>}>{loadError}</Alert>}
        {!source && !loadError && <CircularProgress size={24} aria-label="Loading metamodel" />}
        {success && <Alert severity="success" action={<Button component={Link} to={`/projects/${projectId}/history?checkpoint=${encodeURIComponent(success.sourceCheckpointId)}`}>
          View recovery checkpoint
        </Button>}>Migration applied. Studio captured a recovery checkpoint before updating the project.</Alert>}
        {refreshError && <Alert severity="warning" action={<Button onClick={() => window.location.reload()}>Reload</Button>}>{refreshError}</Alert>}
        {source && canEvolve && (
          <>
            <EvolutionProposalEditor source={source} proposal={proposal} busy={!!busy} onChange={replaceProposal} onReset={() => replaceProposal(null)} />
            {error && <Alert severity="error">{error}</Alert>}
            {busy === 'apply' && <Typography role="status">Applying migration and refreshing project data…</Typography>}
            {proposal && <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Stack spacing={2}>
                <Typography component="h2" variant="h6">Migration preview</Typography>
                {review && <ReviewDetails report={review.report} source={source} proposal={proposal} />}
                {choices.length > 0 && (
                  <Stack component="fieldset" sx={{ border: 0, p: 0, m: 0 }}>
                    <Typography component="legend" variant="subtitle2">Migration rules</Typography>
                    {choices.map(choice => <FormControlLabel key={choice.id} label={choice.label} control={<Checkbox
                      checked={selectedRules.includes(choice.id)} disabled={!!busy}
                      onChange={(_, checked) => {
                        setSelectedRules(previous => checked ? [...previous, choice.id] : previous.filter(id => id !== choice.id));
                        setRulesNeedPreview(true);
                      }} />} />)}
                  </Stack>
                )}
                {rulesNeedPreview && <Typography variant="body2" role="status">Run the preview again before applying.</Typography>}
                <Stack direction="row" gap={1} flexWrap="wrap">
                  <Button variant={canApply ? 'outlined' : 'contained'} disabled={!!busy} onClick={preview}>
                    {busy === 'preview' ? 'Previewing…' : review ? 'Preview again' : 'Preview migration'}
                  </Button>
                  <Button variant="contained" disabled={!canApply || !!busy} onClick={() => setConfirm(true)}>Review and apply</Button>
                </Stack>
              </Stack>
            </Paper>}
          </>
        )}
        {historyError && <Alert severity="error" action={<Button onClick={reload}>Retry</Button>}>{historyError}</Alert>}
        {history === null && !historyError && <CircularProgress size={24} aria-label="Loading migration history" />}
        {history && <MigrationHistory migrations={history} projectId={projectId} />}
      </Stack>
      <Dialog open={confirm} onClose={() => setConfirm(false)} aria-labelledby="confirm-evolution-title">
        <DialogTitle id="confirm-evolution-title">Apply metamodel migration</DialogTitle>
        <DialogContent>
          <Stack spacing={1}>
            <Typography>The migration will update {source?.name} and its affected models. Studio will capture a recovery checkpoint first.</Typography>
            {choices.filter(choice => selectedRules.includes(choice.id)).map(choice => <Typography key={choice.id} variant="body2">{choice.label}</Typography>)}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(false)}>Cancel</Button>
          <Button variant="contained" onClick={apply} disabled={!canApply || !!busy}>Apply migration</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export function MetamodelEvolutionPage() {
  const { id } = useParams<{ id: string }>();
  const { project } = useProject();
  return id ? <EvolutionWorkspace key={`${project.id}:${id}`} metamodelId={id} /> : <Alert severity="error">Choose a metamodel to review its evolution.</Alert>;
}
