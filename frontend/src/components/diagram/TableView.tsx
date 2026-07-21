import React from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { diagramService } from '../../services/diagram';
import { modelService } from '../../services/model';
import { metamodelService } from '../../services/metamodel';
import viewpointService from '../../services/viewpoint.service';
import { MetaClass, ModelElement } from '../../models/types';

interface TableViewProps {
  diagramId: string;
}

/**
 * Executable table representation: renders a model's elements (restricted to the
 * representation description's visible metaclasses) as rows, with a column per
 * attribute. Read-only; the semantic model remains the source of truth.
 */
const TableView: React.FC<TableViewProps> = ({ diagramId }) => {
  const diagram = diagramService.getDiagramById(diagramId);
  const model = diagram ? modelService.getModelById(diagram.modelId) : undefined;
  const metamodelId = model?.conformsTo || model?.metamodelId;
  const metamodel = metamodelId ? metamodelService.getMetamodelById(metamodelId) : undefined;
  const { representationDescription } = diagram ? viewpointService.resolveRepresentationDescription(diagram) : { representationDescription: undefined };

  const classById = new Map<string, MetaClass>((metamodel?.classes || []).map(cls => [cls.id, cls]));
  const visible = new Set(representationDescription?.visibleMetaClassIds || []);

  const elements: ModelElement[] = (model?.elements || []).filter(element => (
    visible.size === 0 || visible.has(element.modelElementId)
  ));

  // Columns: the union of attribute names across the metaclasses that are present.
  const attributeNames: string[] = [];
  const seen = new Set<string>();
  elements.forEach(element => {
    const cls = classById.get(element.modelElementId);
    (cls?.attributes || []).forEach(attribute => {
      if (attribute.name !== 'name' && !seen.has(attribute.name)) {
        seen.add(attribute.name);
        attributeNames.push(attribute.name);
      }
    });
  });

  const cellValue = (value: unknown): string => {
    if (value === undefined || value === null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <Box sx={{ p: 2, height: '100%', overflow: 'auto' }} data-testid="table-view">
      {elements.length === 0 ? (
        <Typography color="text.secondary">
          No model elements match this table representation's visible metaclasses.
        </Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Type</TableCell>
                <TableCell>Name</TableCell>
                {attributeNames.map(name => (
                  <TableCell key={name}>{name}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {elements.map(element => {
                const cls = classById.get(element.modelElementId);
                return (
                  <TableRow key={element.id} hover>
                    <TableCell>{cls?.name || element.modelElementId}</TableCell>
                    <TableCell>{cellValue(element.style?.name)}</TableCell>
                    {attributeNames.map(name => (
                      <TableCell key={name}>{cellValue(element.style?.[name])}</TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default TableView;
