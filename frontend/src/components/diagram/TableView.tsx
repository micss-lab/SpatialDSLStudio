import React, { useState } from 'react';
import {
  Box,
  Checkbox,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from '@mui/material';
import { MetaAttribute, MetaClass, ModelElement } from '../../models/types';
import { diagramService } from '../../services/diagram';
import { metamodelService } from '../../services/metamodel';
import { modelInheritanceUtilsService, modelService } from '../../services/model';
import viewpointService from '../../services/viewpoint.service';

interface TableViewProps {
  diagramId: string;
}

type SortColumn = '__type' | string;
type SortDirection = 'asc' | 'desc';

const editableValue = (value: unknown, attribute?: MetaAttribute): string => {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (attribute?.type === 'date' && typeof value === 'string') return value.slice(0, 10);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const typedValue = (rawValue: unknown, attribute?: MetaAttribute): unknown => {
  if (!attribute) return rawValue;

  if (attribute.many) {
    const values = String(rawValue ?? '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
    return attribute.type === 'number' ? values.map(Number) : values;
  }

  if (attribute.type === 'number') return Number(rawValue);
  if (attribute.type === 'boolean') return Boolean(rawValue);
  return rawValue;
};

/**
 * Executable table representation. Rows are visible semantic model elements;
 * configured attributes become sortable, inline-editable columns.
 */
const TableView: React.FC<TableViewProps> = ({ diagramId }) => {
  const diagram = diagramService.getDiagramById(diagramId);
  const model = diagram ? modelService.getModelById(diagram.modelId) : undefined;
  const metamodelId = model?.conformsTo || model?.metamodelId;
  const metamodel = metamodelId ? metamodelService.getMetamodelById(metamodelId) : undefined;
  const { representationDescription } = diagram
    ? viewpointService.resolveRepresentationDescription(diagram)
    : { representationDescription: undefined };
  const [draftValues, setDraftValues] = useState<Record<string, Record<string, unknown>>>({});
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const classById = new Map<string, MetaClass>((metamodel?.classes || []).map(cls => [cls.id, cls]));
  const attributesByClassId = new Map<string, Map<string, MetaAttribute>>();
  (metamodel?.classes || []).forEach(metaClass => {
    attributesByClassId.set(
      metaClass.id,
      new Map(
        modelInheritanceUtilsService
          .getAllAttributes(metaClass, metamodel!)
          .map(attribute => [attribute.name, attribute])
      )
    );
  });

  const visible = new Set(representationDescription?.visibleMetaClassIds || []);
  const elements: ModelElement[] = (model?.elements || []).filter(element => (
    visible.size === 0 || visible.has(element.modelElementId)
  ));

  const automaticColumns: string[] = [];
  const seenColumns = new Set<string>();
  elements.forEach(element => {
    const attributes = attributesByClassId.get(element.modelElementId);
    attributes?.forEach(attribute => {
      if (!seenColumns.has(attribute.name)) {
        seenColumns.add(attribute.name);
        automaticColumns.push(attribute.name);
      }
    });
  });
  const configuredColumns = representationDescription?.tableColumns;
  const columns = configuredColumns === undefined
    ? automaticColumns
    : Array.from(new Set(configuredColumns));

  const currentValue = (element: ModelElement, column: string): unknown => {
    const elementDrafts = draftValues[element.id];
    if (elementDrafts && Object.prototype.hasOwnProperty.call(elementDrafts, column)) {
      return elementDrafts[column];
    }
    return element.style?.[column];
  };

  const setDraftValue = (elementId: string, column: string, value: unknown) => {
    setDraftValues(current => ({
      ...current,
      [elementId]: {
        ...(current[elementId] || {}),
        [column]: value,
      },
    }));
  };

  const persistValue = (
    element: ModelElement,
    column: string,
    rawValue: unknown,
    attribute?: MetaAttribute
  ) => {
    if (!model) return;
    const value = typedValue(rawValue, attribute);
    const saved = modelService.updateModelElementProperties(model.id, element.id, { [column]: value });
    setDraftValue(element.id, column, saved ? value : element.style?.[column]);
  };

  const requestSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(direction => direction === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortColumn(column);
    setSortDirection('asc');
  };

  const valueForSort = (element: ModelElement, column: SortColumn): unknown => (
    column === '__type'
      ? classById.get(element.modelElementId)?.name || element.modelElementId
      : currentValue(element, column)
  );

  const compareValues = (left: unknown, right: unknown): number => {
    if (left === right) return 0;
    if (left === undefined || left === null || left === '') return 1;
    if (right === undefined || right === null || right === '') return -1;
    if (typeof left === 'number' && typeof right === 'number') return left - right;
    if (typeof left === 'boolean' && typeof right === 'boolean') return Number(left) - Number(right);
    return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
  };

  const sortedElements = elements
    .map((element, index) => ({ element, index }))
    .sort((left, right) => {
      if (!sortColumn) return left.index - right.index;
      const comparison = compareValues(
        valueForSort(left.element, sortColumn),
        valueForSort(right.element, sortColumn)
      );
      return comparison === 0
        ? left.index - right.index
        : comparison * (sortDirection === 'asc' ? 1 : -1);
    })
    .map(entry => entry.element);

  const columnHeader = (column: SortColumn, label: string) => (
    <TableCell key={column} sortDirection={sortColumn === column ? sortDirection : false}>
      <TableSortLabel
        active={sortColumn === column}
        direction={sortColumn === column ? sortDirection : 'asc'}
        onClick={() => requestSort(column)}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );

  return (
    <Box sx={{ p: 2, height: '100%', overflow: 'auto' }} data-testid="table-view">
      {elements.length === 0 ? (
        <Typography color="text.secondary">
          No model elements match this table representation's visible metaclasses.
        </Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" stickyHeader aria-label={representationDescription?.name || 'Model elements'}>
            <TableHead>
              <TableRow>
                {columnHeader('__type', 'Type')}
                {columns.map(name => columnHeader(name, name))}
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedElements.map(element => {
                const cls = classById.get(element.modelElementId);
                const rowLabel = String(element.style?.name || element.name || element.id);
                return (
                  <TableRow key={element.id} hover data-element-id={element.id}>
                    <TableCell>{cls?.name || element.modelElementId}</TableCell>
                    {columns.map(column => {
                      const attribute = attributesByClassId.get(element.modelElementId)?.get(column);
                      const value = currentValue(element, column);
                      const label = `Edit ${column} for ${rowLabel}`;

                      if (!attribute) {
                        return <TableCell key={column} aria-label={`${column} not available for ${rowLabel}`}>—</TableCell>;
                      }

                      if (attribute.type === 'boolean' && !attribute.many) {
                        return (
                          <TableCell key={column}>
                            <Checkbox
                              size="small"
                              checked={Boolean(value)}
                              inputProps={{ 'aria-label': label }}
                              onChange={event => persistValue(element, column, event.target.checked, attribute)}
                            />
                          </TableCell>
                        );
                      }

                      const attributeType = attribute.type;
                      const enumType = typeof attributeType === 'object' && attributeType.enumId
                        ? metamodel?.enums?.find(metaEnum => metaEnum.id === attributeType.enumId)
                        : undefined;

                      if (enumType && !attribute.many) {
                        return (
                          <TableCell key={column}>
                            <TextField
                              select
                              hiddenLabel
                              size="small"
                              variant="standard"
                              value={editableValue(value, attribute)}
                              inputProps={{ 'aria-label': label }}
                              onChange={event => persistValue(element, column, event.target.value, attribute)}
                              sx={{ minWidth: 110 }}
                            >
                              {enumType.literals.map(literal => (
                                <MenuItem key={literal.name} value={literal.name}>{literal.name}</MenuItem>
                              ))}
                            </TextField>
                          </TableCell>
                        );
                      }

                      return (
                        <TableCell key={column}>
                          <TextField
                            hiddenLabel
                            size="small"
                            variant="standard"
                            type={attribute.type === 'number' && !attribute.many ? 'number' : attribute.type === 'date' && !attribute.many ? 'date' : 'text'}
                            value={editableValue(value, attribute)}
                            inputProps={{ 'aria-label': label }}
                            onChange={event => setDraftValue(element.id, column, event.target.value)}
                            onBlur={event => persistValue(element, column, event.target.value, attribute)}
                            onKeyDown={event => {
                              if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                            }}
                            sx={{ minWidth: 110 }}
                          />
                        </TableCell>
                      );
                    })}
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
