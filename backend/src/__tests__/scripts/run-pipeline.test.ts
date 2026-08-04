import fs from 'fs';

/**
 * `scripts/run-pipeline.ts` runs its `main()` on import, so each case sets up
 * argv/fetch first and then loads the module in isolation. Exit codes are the
 * contract CI depends on, so they are asserted rather than the stdout shape.
 */
const runCli = async (argv: string[]): Promise<void> => {
  process.argv = ['node', 'run-pipeline.ts', ...argv];
  process.exitCode = undefined;
  await jest.isolateModulesAsync(async () => {
    require('../../../scripts/run-pipeline');
  });
  // Let the script's async main() settle before the assertions run.
  for (let tick = 0; tick < 5; tick += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
};

const jsonResponse = (body: any, ok = true, status = 200): any => ({
  ok,
  status,
  json: async () => body,
});

let stdout: jest.SpyInstance;
let stderr: jest.SpyInstance;

beforeEach(() => {
  jest.resetModules();
  stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
    name: 'Warehouse gate',
    steps: [{ id: 'validate', kind: 'validate-model', modelId: 'model-uuid-1' }],
  }));
});

afterEach(() => {
  jest.restoreAllMocks();
  process.exitCode = undefined;
});

describe('run-pipeline CLI', () => {
  it('exits zero and prints the run when the pipeline succeeds', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({
      success: true,
      data: { id: 'run-1', status: 'SUCCEEDED', contentHash: 'sha256:run' },
    })) as any;

    await runCli([
      '--project', 'project-1',
      '--definition', './pipeline.json',
      '--token', 'test-token',
      '--api', 'http://localhost:3002/api',
    ]);

    expect(process.exitCode).toBeUndefined();
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('SUCCEEDED'));
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3002/api/projects/project-1/pipelines/runs',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      })
    );
  });

  it('exits non-zero when the run fails so CI fails the job', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({
      success: true,
      data: { id: 'run-2', status: 'FAILED', failureMessage: 'Model validation failed' },
    })) as any;

    await runCli([
      '--project', 'project-1',
      '--definition', './pipeline.json',
      '--token', 'test-token',
    ]);

    expect(process.exitCode).toBe(1);
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('FAILED'));
  });

  it('exits non-zero when the request itself is rejected', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({ success: false, error: 'Project capability required: pipeline.execute' }, false, 403)
    ) as any;

    await runCli([
      '--project', 'project-1',
      '--definition', './pipeline.json',
      '--token', 'test-token',
    ]);

    expect(process.exitCode).toBe(1);
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining('Project capability required: pipeline.execute')
    );
  });

  it('exits non-zero with usage when required arguments are missing', async () => {
    global.fetch = jest.fn() as any;

    await runCli(['--project', 'project-1']);

    expect(process.exitCode).toBe(1);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Usage: npm run pipeline'));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
