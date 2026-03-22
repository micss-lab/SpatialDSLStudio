/**
 * Local types for code generation components
 */

import { Diagram, Metamodel, Model } from '../../../models/types';

/**
 * Props for the main CodeGenerator component
 */
export interface CodeGeneratorProps {
  diagramId?: string; // Make diagramId optional
}

/**
 * Props for TabPanel component
 */
export interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

/**
 * Props for TemplateEditor component
 */
export interface TemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
  metamodels?: Metamodel[];
  models?: Model[];
  diagram?: Diagram | null;
  targetMetamodelId?: string;
}

/**
 * Interface for project template editing
 */
export interface ProjectTemplate {
  id: string;
  name: string;
  language: 'java' | 'python';
  content: string;
  outputPattern: string;
  isNew?: boolean;
}
