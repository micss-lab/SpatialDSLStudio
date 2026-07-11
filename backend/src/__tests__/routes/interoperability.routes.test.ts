import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../middleware';

const siriusInteropServiceMock = {
  validate: jest.fn(),
  validateAirdView: jest.fn(),
  importOdesign: jest.fn(),
  importAird: jest.fn(),
  exportOdesign: jest.fn(),
};

jest.mock('../../services', () => ({
  siriusInteropService: siriusInteropServiceMock,
}));

import interoperabilityRouter from '../../routes/interoperability.routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { userId: 'user-1', email: 'test@example.com', role: 'DSL_DESIGNER' };
    next();
  });
  app.use('/api/interoperability', interoperabilityRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('interoperability Sirius routes', () => {
  it('validates Sirius content', async () => {
    siriusInteropServiceMock.validate.mockResolvedValue({
      viewpoints: [],
      report: { supported: true, warnings: [], droppedFeatures: [], unresolvedReferences: [] },
    });

    const res = await request(buildApp())
      .post('/api/interoperability/sirius/validate')
      .send({ content: '<description:Group/>', sourceFormat: 'odesign' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(siriusInteropServiceMock.validate).toHaveBeenCalledWith(
      expect.objectContaining({ sourceFormat: 'odesign' }),
      'user-1'
    );
  });

  it('passes Sirius project ZIP validation requests through to the service', async () => {
    siriusInteropServiceMock.validate.mockResolvedValue({
      viewpoints: [],
      report: { supported: true, sourceFormat: 'project-zip', warnings: [], droppedFeatures: [], unresolvedReferences: [] },
    });

    const res = await request(buildApp())
      .post('/api/interoperability/sirius/validate')
      .send({ content: 'UEsDBAo=', sourceFormat: 'project-zip', metamodelId: 'metamodel-1' });

    expect(res.status).toBe(200);
    expect(siriusInteropServiceMock.validate).toHaveBeenCalledWith(
      expect.objectContaining({ sourceFormat: 'project-zip', metamodelId: 'metamodel-1' }),
      'user-1'
    );
  });

  it('routes .aird validation requests to validateAirdView', async () => {
    siriusInteropServiceMock.validateAirdView.mockResolvedValue({
      diagrams: [],
      report: { supported: true, warnings: [], droppedFeatures: [], unresolvedReferences: [] },
    });

    const res = await request(buildApp())
      .post('/api/interoperability/sirius/validate')
      .send({ content: '<viewpoint:DAnalysis/>', sourceFormat: 'aird', modelId: 'model-1', viewpointId: 'viewpoint-1' });

    expect(res.status).toBe(200);
    expect(siriusInteropServiceMock.validateAirdView).toHaveBeenCalledWith(
      expect.objectContaining({ sourceFormat: 'aird', modelId: 'model-1', viewpointId: 'viewpoint-1' }),
      'user-1'
    );
    expect(siriusInteropServiceMock.validate).not.toHaveBeenCalled();
  });

  it('imports Sirius .aird views', async () => {
    siriusInteropServiceMock.importAird.mockResolvedValue({
      diagrams: [{ id: 'diagram-1' }],
      report: { supported: true, warnings: [], droppedFeatures: [], unresolvedReferences: [] },
    });

    const res = await request(buildApp())
      .post('/api/interoperability/sirius/aird/import')
      .send({ content: '<viewpoint:DAnalysis/>', modelId: 'model-1', viewpointId: 'viewpoint-1' });

    expect(res.status).toBe(201);
    expect(siriusInteropServiceMock.importAird).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: 'model-1', viewpointId: 'viewpoint-1' }),
      'user-1',
      'DSL_DESIGNER'
    );
  });

  it('rejects .aird import requests without a modelId', async () => {
    const res = await request(buildApp())
      .post('/api/interoperability/sirius/aird/import')
      .send({ content: '<viewpoint:DAnalysis/>' });

    expect(res.status).toBe(400);
    expect(siriusInteropServiceMock.importAird).not.toHaveBeenCalled();
  });

  it('imports Sirius .odesign content', async () => {
    siriusInteropServiceMock.importOdesign.mockResolvedValue({
      viewpoints: [{ id: 'viewpoint-1' }],
      report: { supported: true, warnings: [], droppedFeatures: [], unresolvedReferences: [] },
    });

    const res = await request(buildApp())
      .post('/api/interoperability/sirius/import')
      .send({ content: '<description:Group/>', metamodelId: 'metamodel-1' });

    expect(res.status).toBe(201);
    expect(siriusInteropServiceMock.importOdesign).toHaveBeenCalledWith(
      expect.objectContaining({ metamodelId: 'metamodel-1' }),
      'user-1',
      'DSL_DESIGNER'
    );
  });

  it('exports Sirius .odesign content', async () => {
    siriusInteropServiceMock.exportOdesign.mockResolvedValue({
      filename: 'minimal.odesign',
      content: '<description:Group/>',
      report: { supported: true, warnings: [], droppedFeatures: [], unresolvedReferences: [] },
    });

    const res = await request(buildApp())
      .post('/api/interoperability/sirius/export')
      .send({ metamodelId: 'metamodel-1', viewpointIds: ['viewpoint-1'] });

    expect(res.status).toBe(200);
    expect(res.body.data.filename).toBe('minimal.odesign');
    expect(siriusInteropServiceMock.exportOdesign).toHaveBeenCalledWith(
      expect.objectContaining({ viewpointIds: ['viewpoint-1'] }),
      'user-1'
    );
  });

  it('rejects import requests without a metamodelId', async () => {
    const res = await request(buildApp())
      .post('/api/interoperability/sirius/import')
      .send({ content: '<description:Group/>' });

    expect(res.status).toBe(400);
    expect(siriusInteropServiceMock.importOdesign).not.toHaveBeenCalled();
  });
});
