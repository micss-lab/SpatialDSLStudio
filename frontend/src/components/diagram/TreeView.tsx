import React, { useEffect, useState } from 'react';
import {
  Box,
  Chip,
  Collapse,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { MetaClass, Metamodel, ModelElement } from '../../models/types';
import { diagramService } from '../../services/diagram';
import { metamodelService } from '../../services/metamodel';
import { modelInheritanceUtilsService, modelService } from '../../services/model';
import viewpointService from '../../services/viewpoint.service';

interface TreeViewProps {
  diagramId: string;
}

interface ContainmentTreeNode {
  element: ModelElement;
  metaClass?: MetaClass;
  children: ContainmentTreeNode[];
}

const referenceIds = (value: string | string[] | null | undefined): string[] => {
  if (Array.isArray(value)) return value;
  return typeof value === 'string' && value ? [value] : [];
};

const buildContainmentForest = (
  elements: ModelElement[],
  metamodel: Metamodel,
  visibleMetaClassIds: string[]
): ContainmentTreeNode[] => {
  const elementById = new Map(elements.map(element => [element.id, element]));
  const classById = new Map(metamodel.classes.map(metaClass => [metaClass.id, metaClass]));
  const visibleClasses = new Set(visibleMetaClassIds);
  const visibleElements = elements.filter(element => (
    visibleClasses.size === 0 || visibleClasses.has(element.modelElementId)
  ));
  const visibleElementIds = new Set(visibleElements.map(element => element.id));
  const parentByChildId = new Map<string, string>();

  elements.forEach(parent => {
    const metaClass = classById.get(parent.modelElementId);
    if (!metaClass) return;

    modelInheritanceUtilsService.getAllReferences(metaClass, metamodel)
      .filter(reference => reference.containment)
      .forEach(reference => {
        const value = parent.references?.[reference.name] ?? parent.references?.[reference.id];
        referenceIds(value).forEach(childId => {
          if (elementById.has(childId) && !parentByChildId.has(childId)) {
            parentByChildId.set(childId, parent.id);
          }
        });
      });
  });

  const findVisibleParentId = (elementId: string): string | undefined => {
    const visited = new Set<string>([elementId]);
    let parentId = parentByChildId.get(elementId);

    while (parentId && !visited.has(parentId)) {
      if (visibleElementIds.has(parentId)) return parentId;
      visited.add(parentId);
      parentId = parentByChildId.get(parentId);
    }

    return undefined;
  };

  const childrenByParentId = new Map<string, string[]>();
  const rootIds: string[] = [];
  visibleElements.forEach(element => {
    const parentId = findVisibleParentId(element.id);
    if (!parentId) {
      rootIds.push(element.id);
      return;
    }

    const childIds = childrenByParentId.get(parentId) || [];
    childIds.push(element.id);
    childrenByParentId.set(parentId, childIds);
  });

  const includedIds = new Set<string>();
  const buildNode = (elementId: string, path: Set<string>): ContainmentTreeNode | null => {
    const element = elementById.get(elementId);
    if (!element || path.has(elementId)) return null;

    includedIds.add(elementId);
    const nextPath = new Set(path).add(elementId);
    const children = (childrenByParentId.get(elementId) || [])
      .map(childId => buildNode(childId, nextPath))
      .filter((node): node is ContainmentTreeNode => Boolean(node));

    return {
      element,
      metaClass: classById.get(element.modelElementId),
      children,
    };
  };

  const forest = rootIds
    .map(rootId => buildNode(rootId, new Set()))
    .filter((node): node is ContainmentTreeNode => Boolean(node));

  // Malformed cyclic containment has no natural root. Keep every visible
  // element reachable by promoting one member of each remaining cycle.
  visibleElements.forEach(element => {
    if (includedIds.has(element.id)) return;
    const node = buildNode(element.id, new Set());
    if (node) forest.push(node);
  });

  return forest;
};

const elementLabel = (node: ContainmentTreeNode): string => {
  const name = node.element.style?.name ?? node.element.name;
  if (name !== undefined && name !== null && String(name).trim()) return String(name);
  return node.metaClass?.name || node.element.id;
};

interface TreeNodeRowProps {
  node: ContainmentTreeNode;
  level: number;
  expandedIds: Set<string>;
  onToggle: (elementId: string) => void;
}

const TreeNodeRow: React.FC<TreeNodeRowProps> = ({ node, level, expandedIds, onToggle }) => {
  const label = elementLabel(node);
  const hasChildren = node.children.length > 0;
  const expanded = hasChildren && expandedIds.has(node.element.id);

  return (
    <Box
      role="treeitem"
      aria-level={level}
      aria-expanded={hasChildren ? expanded : undefined}
      data-element-id={node.element.id}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ minHeight: 40, borderRadius: 1, px: 0.5, '&:hover': { bgcolor: 'action.hover' } }}
      >
        {hasChildren ? (
          <IconButton
            size="small"
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
            onClick={() => onToggle(node.element.id)}
          >
            {expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
          </IconButton>
        ) : (
          <Box sx={{ width: 34, flexShrink: 0 }} />
        )}
        <Typography variant="body2" sx={{ fontWeight: 500, minWidth: 0, overflowWrap: 'anywhere' }}>
          {label}
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          label={node.metaClass?.name || node.element.modelElementId}
          sx={{ ml: 'auto !important' }}
        />
      </Stack>
      {hasChildren && (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <Box role="group" sx={{ ml: 2.1, pl: 1.5, borderLeft: '1px solid', borderColor: 'divider' }}>
            {node.children.map(child => (
              <TreeNodeRow
                key={child.element.id}
                node={child}
                level={level + 1}
                expandedIds={expandedIds}
                onToggle={onToggle}
              />
            ))}
          </Box>
        </Collapse>
      )}
    </Box>
  );
};

/** Render the semantic model as an expandable containment hierarchy. */
const TreeView: React.FC<TreeViewProps> = ({ diagramId }) => {
  const diagram = diagramService.getDiagramById(diagramId);
  const model = diagram ? modelService.getModelById(diagram.modelId) : undefined;
  const metamodelId = model?.conformsTo || model?.metamodelId;
  const metamodel = metamodelId ? metamodelService.getMetamodelById(metamodelId) : undefined;
  const { representationDescription } = diagram
    ? viewpointService.resolveRepresentationDescription(diagram)
    : { representationDescription: undefined };
  const forest = model && metamodel
    ? buildContainmentForest(model.elements || [], metamodel, representationDescription?.visibleMetaClassIds || [])
    : [];
  const rootKey = forest.map(node => node.element.id).join('|');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(forest.map(node => node.element.id))
  );

  useEffect(() => {
    setExpandedIds(current => {
      const next = new Set(current);
      forest.forEach(node => next.add(node.element.id));
      return next;
    });
    // The root key tracks hierarchy changes without making the mutable model
    // cache itself an effect dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootKey]);

  const toggleExpanded = (elementId: string) => {
    setExpandedIds(current => {
      const next = new Set(current);
      if (next.has(elementId)) next.delete(elementId);
      else next.add(elementId);
      return next;
    });
  };

  return (
    <Box sx={{ p: 2, height: '100%', overflow: 'auto' }} data-testid="tree-view">
      {!model || !metamodel ? (
        <Typography color="text.secondary">Unable to load this tree representation's model or metamodel.</Typography>
      ) : forest.length === 0 ? (
        <Typography color="text.secondary">
          No model elements match this tree representation's visible metaclasses.
        </Typography>
      ) : (
        <Paper variant="outlined" sx={{ p: 1 }} role="tree" aria-label={representationDescription?.name || 'Model hierarchy'}>
          {forest.map(node => (
            <TreeNodeRow
              key={node.element.id}
              node={node}
              level={1}
              expandedIds={expandedIds}
              onToggle={toggleExpanded}
            />
          ))}
        </Paper>
      )}
    </Box>
  );
};

export default TreeView;
