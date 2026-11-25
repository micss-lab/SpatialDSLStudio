import React, { useRef, useState } from 'react';
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { Metamodel } from '../../models/types';
import { editProposal, EvolutionEdit, parseEvolutionProposal } from './evolution-proposal';

const labels: Record<EvolutionEdit['kind'], string> = {
  'rename-class': 'Rename class',
  'rename-attribute': 'Rename attribute',
  'remove-attribute': 'Remove attribute',
  'remove-class': 'Remove class',
};

interface Props {
  source: Metamodel;
  proposal: Metamodel | null;
  busy: boolean;
  onChange: (proposal: Metamodel) => void;
  onReset: () => void;
}

export function EvolutionProposalEditor({ source, proposal, busy, onChange, onReset }: Props) {
  const [operation, setOperation] = useState<EvolutionEdit['kind']>('rename-attribute');
  const [classId, setClassId] = useState('');
  const [attributeId, setAttributeId] = useState('');
  const [newName, setNewName] = useState('');
  const [origin, setOrigin] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const draft = proposal || source;
  const selectedClass = draft.classes.find(cls => cls.id === classId);
  const selectsAttribute = operation === 'rename-attribute' || operation === 'remove-attribute';
  const renames = operation === 'rename-attribute' || operation === 'rename-class';
  const disabled = busy || reading;

  const addChange = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    try {
      const next = editProposal(draft, { kind: operation, classId, attributeId, name: newName });
      onChange(next);
      if (operation === 'remove-class') setClassId('');
      setAttributeId('');
      setNewName('');
      setOrigin('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not stage this change.');
    }
  };

  const readProposal = async (file: File) => {
    setReading(true);
    setError('');
    try {
      const next = parseEvolutionProposal(await file.text(), source);
      onChange(next);
      setOrigin(file.name);
      setClassId('');
      setAttributeId('');
      setNewName('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not read the proposal.');
    } finally {
      setReading(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack spacing={2}>
        <Typography component="h2" variant="h6">Proposed changes</Typography>
        <Typography variant="body2" color="text.secondary">
          Stage a rename or removal, or load an edited Studio metamodel JSON export. Preview the proposal to see how it affects the project.
        </Typography>
        <Stack component="form" onSubmit={addChange} direction={{ xs: 'column', md: 'row' }} gap={1.5}>
          <TextField select size="small" label="Operation" value={operation} disabled={disabled} sx={{ minWidth: 160 }}
            onChange={event => { setOperation(event.target.value as EvolutionEdit['kind']); setAttributeId(''); setNewName(''); }}>
            {Object.entries(labels).map(([kind, label]) => <MenuItem key={kind} value={kind}>{label}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Class" value={selectedClass?.id || ''} disabled={disabled} sx={{ flex: 1, minWidth: 125 }}
            onChange={event => { setClassId(event.target.value); setAttributeId(''); setNewName(''); }}>
            <MenuItem value="" disabled>Choose a class</MenuItem>
            {draft.classes.map(cls => <MenuItem key={cls.id} value={cls.id}>{cls.name}</MenuItem>)}
          </TextField>
          {selectsAttribute && (
            <TextField select size="small" label="Attribute" value={attributeId} disabled={disabled || !selectedClass?.attributes?.length}
              sx={{ flex: 1, minWidth: 125 }} onChange={event => setAttributeId(event.target.value)}>
              <MenuItem value="" disabled>Choose an attribute</MenuItem>
              {selectedClass?.attributes?.map(attribute => (
                <MenuItem key={attribute.id} value={attribute.id}>{attribute.name}</MenuItem>
              ))}
            </TextField>
          )}
          {renames && <TextField label="New name" size="small" value={newName} disabled={disabled}
            sx={{ flex: 1, minWidth: 125 }} onChange={event => setNewName(event.target.value)} />}
          <Button type="submit" variant="outlined" disabled={disabled || !selectedClass || (selectsAttribute && !attributeId) || (renames && !newName.trim())}>
            Stage change
          </Button>
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }}>
          <Button onClick={() => input.current?.click()} disabled={disabled} variant="text">
            {reading ? 'Reading proposal…' : 'Load proposal JSON'}
          </Button>
          <input ref={input} hidden type="file" accept=".json,application/json" onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void readProposal(file);
          }} />
          {proposal && (
            <>
              <Button disabled={disabled} onClick={() => { onReset(); setError(''); setOrigin(''); setClassId(''); setAttributeId(''); setNewName(''); }}>
                Reset proposal
              </Button>
              <Typography role="status" variant="body2" color="text.secondary">
                {origin ? `Loaded ${origin}` : 'Changes staged for preview'}
              </Typography>
            </>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}
