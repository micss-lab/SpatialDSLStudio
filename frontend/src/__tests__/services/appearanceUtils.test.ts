import {
  defaultAppearance,
  getAppearanceSettings,
  getElementDisplayName,
  getFillColor,
  getStrokeColor,
  getStrokeWidth,
  getEdgeEndpointPair,
  getNearestAttachmentOnBoundary,
  AppearanceSettings,
} from '../../components/diagram/2d/utils/appearanceUtils';

function makeDiagramElement(styleOverrides: any = {}): any {
  return {
    id: 'elem-1',
    modelElementId: 'cls-1',
    position: { x: 0, y: 0, z: 0 },
    size: { width: 100, height: 60 },
    style: {
      name: 'MyElement',
      ...styleOverrides,
    },
  };
}

describe('defaultAppearance', () => {
  it('has expected default values', () => {
    expect(defaultAppearance.type).toBe('rectangle');
    expect(defaultAppearance.color).toBe('#4287f5');
    expect(defaultAppearance.strokeColor).toBe('black');
    expect(defaultAppearance.strokeWidth).toBe(1);
  });
});

describe('getAppearanceSettings', () => {
  it('returns default appearance when no style set', () => {
    const element = makeDiagramElement();
    const result = getAppearanceSettings(element);
    expect(result).toEqual(defaultAppearance);
  });

  it('parses appearance from element style JSON', () => {
    const element = makeDiagramElement({
      appearance: JSON.stringify({ type: 'ellipse', color: '#ff0000', fillColor: '#ff0000', strokeColor: 'red', strokeWidth: 2 }),
    });
    const result = getAppearanceSettings(element);
    expect(result.type).toBe('ellipse');
    expect(result.color).toBe('#ff0000');
  });

  it('sets shape to type when shape is missing from parsed appearance', () => {
    const element = makeDiagramElement({
      appearance: JSON.stringify({ type: 'diamond', color: '#ff0000', fillColor: '#ff0000', strokeColor: 'black', strokeWidth: 1 }),
    });
    const result = getAppearanceSettings(element);
    expect(result.shape).toBe('diamond');
  });

  it('falls back to defaults on malformed appearance JSON', () => {
    const element = makeDiagramElement({ appearance: 'not-json{{}' });
    const result = getAppearanceSettings(element);
    expect(result).toEqual(defaultAppearance);
  });

  it('checks linked model element appearance when element has no appearance', () => {
    const element = makeDiagramElement({ linkedModelElementId: 'model-elem-1' });
    const model = {
      id: 'model-1',
      name: 'Test',
      metamodelId: 'mm-1',
      conformsTo: 'mm-1',
      elements: [
        {
          id: 'model-elem-1',
          modelElementId: 'cls-1',
          attributes: {},
          style: {
            name: 'LinkedElem',
            appearance: JSON.stringify({ type: 'triangle', color: '#00ff00', fillColor: '#00ff00', strokeColor: 'green', strokeWidth: 3 }),
          },
        },
      ],
      connections: [],
    } as any;

    const result = getAppearanceSettings(element, model);
    expect(result.type).toBe('triangle');
    expect(result.color).toBe('#00ff00');
  });
});

describe('getElementDisplayName', () => {
  it('returns element own name when not linked', () => {
    const element = makeDiagramElement({ name: 'MyElement' });
    expect(getElementDisplayName(element)).toBe('MyElement');
  });

  it('returns Unnamed when no name set', () => {
    const element = makeDiagramElement({ name: '' });
    expect(getElementDisplayName(element)).toBe('Unnamed');
  });

  it('returns linked element name when linked', () => {
    const element = makeDiagramElement({ linkedModelElementId: 'model-elem-1', name: 'ElementName' });
    const model = {
      elements: [
        {
          id: 'model-elem-1',
          style: { name: 'LinkedName' },
        },
      ],
    } as any;

    expect(getElementDisplayName(element, model)).toBe('LinkedName');
  });

  it('falls back to element name when linked element not found', () => {
    const element = makeDiagramElement({ linkedModelElementId: 'nonexistent', name: 'FallbackName' });
    const model = { elements: [] } as any;

    expect(getElementDisplayName(element, model)).toBe('FallbackName');
  });
});

describe('getFillColor', () => {
  const appearance: AppearanceSettings = {
    type: 'rectangle',
    shape: 'rectangle',
    color: '#4287f5',
    fillColor: '#ff0000',
    strokeColor: 'black',
    strokeWidth: 1,
  };

  it('returns highlight color when highlighted', () => {
    const result = getFillColor(appearance, true);
    expect(result).toBe('rgba(255, 165, 0, 0.2)');
  });

  it('returns fillColor when not highlighted', () => {
    const result = getFillColor(appearance, false);
    expect(result).toBe('#ff0000');
  });

  it('falls back to color when fillColor not set', () => {
    const appWithoutFill = { ...appearance, fillColor: undefined } as any;
    const result = getFillColor(appWithoutFill, false);
    expect(result).toBe('#4287f5');
  });

  it('falls back to default when neither color nor fillColor set', () => {
    const appWithoutColors = { ...appearance, fillColor: undefined, color: undefined } as any;
    const result = getFillColor(appWithoutColors, false);
    expect(result).toBe('#4287f5');
  });
});

describe('getStrokeColor', () => {
  const appearance: AppearanceSettings = {
    type: 'rectangle',
    shape: 'rectangle',
    color: '#4287f5',
    fillColor: '#4287f5',
    strokeColor: '#333333',
    strokeWidth: 1,
  };

  it('returns highlight orange when highlighted', () => {
    const result = getStrokeColor(appearance, false, true);
    expect(result).toBe('#FFA500');
  });

  it('returns selection blue when selected and not highlighted', () => {
    const result = getStrokeColor(appearance, true, false);
    expect(result).toBe('#3f51b5');
  });

  it('returns appearance stroke color when not selected or highlighted', () => {
    const result = getStrokeColor(appearance, false, false);
    expect(result).toBe('#333333');
  });

  it('falls back to black when no strokeColor', () => {
    const appWithoutStroke = { ...appearance, strokeColor: undefined } as any;
    const result = getStrokeColor(appWithoutStroke, false, false);
    expect(result).toBe('black');
  });
});

describe('getStrokeWidth', () => {
  const appearance: AppearanceSettings = {
    type: 'rectangle',
    shape: 'rectangle',
    color: '#4287f5',
    fillColor: '#4287f5',
    strokeColor: 'black',
    strokeWidth: 2,
  };

  it('increases stroke width when selected', () => {
    const result = getStrokeWidth(appearance, true, false);
    expect(result).toBe(3);
  });

  it('increases stroke width when highlighted', () => {
    const result = getStrokeWidth(appearance, false, true);
    expect(result).toBe(3);
  });

  it('returns base width when neither selected nor highlighted', () => {
    const result = getStrokeWidth(appearance, false, false);
    expect(result).toBe(2);
  });

  it('defaults to 1 when strokeWidth not set', () => {
    const appWithoutWidth = { ...appearance, strokeWidth: undefined } as any;
    const result = getStrokeWidth(appWithoutWidth, false, false);
    expect(result).toBe(1);
  });
});

describe('getNearestAttachmentOnBoundary', () => {
  const ownerBounds = { x: 100, y: 100, width: 200, height: 80 };

  it('returns the nearest side and clamped offset ratio', () => {
    const result = getNearestAttachmentOnBoundary(ownerBounds, { x: 305, y: 130 });

    expect(result.side).toBe('right');
    expect(result.attachmentOffsetRatio).toBe(0.375);
  });

  it('respects allowed sides', () => {
    const result = getNearestAttachmentOnBoundary(ownerBounds, { x: 305, y: 130 }, ['top', 'bottom']);

    expect(result.side).toBe('top');
    expect(result.attachmentOffsetRatio).toBe(1);
  });
});

describe('getEdgeEndpointPair', () => {
  it('uses a pin center when requested', () => {
    const source = {
      id: 'pin-1',
      type: 'node',
      modelElementId: 'pin',
      x: 10,
      y: 20,
      width: 16,
      height: 16,
      style: {},
    } as any;
    const target = {
      id: 'node-1',
      type: 'node',
      modelElementId: 'action',
      x: 100,
      y: 20,
      width: 100,
      height: 60,
      style: {},
    } as any;

    const result = getEdgeEndpointPair(source, target, true, false);

    expect(result.source).toEqual({ x: 18, y: 28 });
    expect(result.target.x).toBeLessThan(150);
  });
});
