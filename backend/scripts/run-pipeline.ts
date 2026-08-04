import fs from 'fs';
import path from 'path';

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const main = async (): Promise<void> => {
  const api = argument('--api') || process.env.SPATIALDSL_API_URL || 'http://localhost:3002/api';
  const projectId = argument('--project');
  const definitionPath = argument('--definition');
  const token = argument('--token') || process.env.SPATIALDSL_TOKEN;
  if (!projectId || !definitionPath || !token) {
    throw new Error('Usage: npm run pipeline -- --project <id> --definition <file.json> [--api <url>] [--token <jwt>]');
  }
  const absoluteDefinitionPath = path.resolve(process.cwd(), definitionPath);
  const definition = JSON.parse(fs.readFileSync(absoluteDefinitionPath, 'utf8'));
  const response = await fetch(`${api.replace(/\/$/, '')}/projects/${encodeURIComponent(projectId)}/pipelines/runs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(definition),
  });
  const payload = await response.json() as any;
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `Pipeline request failed with HTTP ${response.status}`);
  }
  process.stdout.write(`${JSON.stringify(payload.data, null, 2)}\n`);
  if (payload.data.status !== 'SUCCEEDED') process.exitCode = 1;
};

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

