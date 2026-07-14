import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';

import { TemplateEditor } from '../../components/codegeneration/components/TemplateEditor';

jest.mock('../../services/codegeneration', () => ({
  createHandlebarsCompletions: () => () => null,
}));

// CodeMirror ships untranspiled ESM dependencies that CRA's jest cannot load,
// and its internals are not what these tests cover
jest.mock('@uiw/react-codemirror', () => {
  const mockReact = require('react');
  return {
    __esModule: true,
    default: mockReact.forwardRef((props: any, _ref: any) =>
      mockReact.createElement('div', { 'data-testid': 'codemirror-stub' }, props.value)
    ),
  };
});
jest.mock('@codemirror/lang-javascript', () => ({ javascript: () => [] }));
jest.mock('@codemirror/autocomplete', () => ({ autocompletion: () => [] }));

const metamodels = [
  {
    id: 'mm-1',
    name: 'Smart Warehouse',
    classes: [
      {
        id: 'mc-robot',
        name: 'MobileRobot',
        abstract: false,
        superTypes: [],
        attributes: [{ id: 'a-1', name: 'battery', type: 'number', many: false }],
        references: [],
      },
    ],
  },
] as any;

const models = [
  {
    id: 'm-1',
    name: 'Warehouse Ops',
    conformsTo: 'mm-1',
    elements: [
      { id: 'el-1', name: 'Robot1', modelElementId: 'mc-robot', style: { name: 'Robot1' } },
    ],
  },
] as any;

const renderEditor = () => {
  const onChange = jest.fn();
  render(
    <TemplateEditor
      value=""
      onChange={onChange}
      metamodels={metamodels}
      models={models}
      diagram={null}
      targetMetamodelId="mm-1"
    />
  );
  return { onChange };
};

describe('TemplateEditor', () => {
  it('has an expand toggle that opens the editor full screen', () => {
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: /expand editor/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Template Editor')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /exit full screen/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the model reference panel with class attributes and instances', () => {
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: /show model reference/i }));
    fireEvent.mouseDown(screen.getByLabelText(/metaclass/i));
    fireEvent.click(screen.getByRole('option', { name: /MobileRobot/i }));

    expect(screen.getByText('battery: number')).toBeInTheDocument();
    expect(screen.getByText('Robot1')).toBeInTheDocument();
    expect(screen.getByText('Count MobileRobot')).toBeInTheDocument();
    expect(screen.getByText('Loop MobileRobot')).toBeInTheDocument();
  });

  it('inserts a snippet into the template when a chip is clicked', () => {
    const { onChange } = renderEditor();

    fireEvent.click(screen.getByRole('button', { name: /show model reference/i }));
    fireEvent.mouseDown(screen.getByLabelText(/metaclass/i));
    fireEvent.click(screen.getByRole('option', { name: /MobileRobot/i }));
    fireEvent.click(screen.getByText('Count MobileRobot'));

    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('{{countElements "MobileRobot"}}'));
  });
});
