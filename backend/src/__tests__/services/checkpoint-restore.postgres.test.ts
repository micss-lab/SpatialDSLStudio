import { randomUUID } from 'node:crypto';
import prisma from '../../config/database';
import { projectCheckpointService } from '../../services/lifecycle/project-checkpoint.service';

// The regular Jest configuration maps database imports to a mock. This suite
// uses the migrated PostgreSQL test database explicitly supplied by CI.
jest.mock('../../config/database', () => {
  const { PrismaClient } = jest.requireActual('@prisma/client');
  return { __esModule: true, default: new PrismaClient({ datasourceUrl: process.env.LIFECYCLE_TEST_DATABASE_URL }) };
});

const describeWithDatabase = process.env.LIFECYCLE_TEST_DATABASE_URL ? describe : describe.skip;

describeWithDatabase('Guided checkpoint restore on PostgreSQL', () => {
  const owners = [randomUUID(), randomUUID()];
  const projects: string[] = [];

  beforeAll(async () => {
    await prisma.user.createMany({
      data: owners.map(id => ({ id, email: `${id}@checkpoint.test`, password: 'unused-fixture-password' })),
    });
  });

  afterAll(async () => {
    try {
      await prisma.studioProject.deleteMany({ where: { id: { in: projects } } });
      await prisma.user.deleteMany({ where: { id: { in: owners } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function makeProject(name: string) {
    const project = await prisma.studioProject.create({ data: { name, ownerId: owners[0] } });
    projects.push(project.id);
    return project.id;
  }

  function makePackage(projectId: string, name: string) {
    return prisma.ePackage.create({
      data: { name, nsPrefix: 'fixture', nsURI: `urn:fixture:${randomUUID()}`, userId: owners[0], projectId },
    });
  }

  it('rejects stale previews and preserves a restorable copy of the exact replaced graph', async () => {
    const projectId = await makeProject('Approved layout');
    const baselinePackage = await makePackage(projectId, 'Baseline package');
    const baseline = await projectCheckpointService.create(projectId, owners[0]);
    await prisma.studioProject.update({ where: { id: projectId }, data: { name: 'Draft layout' } });
    await prisma.ePackage.update({ where: { id: baselinePackage.id }, data: { name: 'Draft package' } });
    const laterPackage = await makePackage(projectId, 'Added after baseline');
    const membership = await prisma.projectMembership.create({
      data: { projectId, userId: owners[1], role: 'MODELER' },
    });

    const stale = await projectCheckpointService.previewRestore(projectId, baseline.id);
    expect(stale.currentProject.name).toBe('Draft layout');
    expect(stale.targetProject.name).toBe('Approved layout');
    expect(stale.diff.changed).toEqual([{ type: 'epackage', id: baselinePackage.id, name: baselinePackage.name }]);
    expect(stale.diff.removed).toEqual([{ type: 'epackage', id: laterPackage.id, name: laterPackage.name }]);
    await prisma.ePackage.update({ where: { id: laterPackage.id }, data: { name: 'Latest work' } });

    await expect(projectCheckpointService.restoreWithRecovery(
      projectId, baseline.id, baseline.contentHash, stale.diff.fromHash, owners[0]
    )).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('changed after the preview') });
    expect(await prisma.projectCheckpoint.count({ where: { projectId } })).toBe(1);

    const current = await projectCheckpointService.previewRestore(projectId, baseline.id);
    const result = await projectCheckpointService.restoreWithRecovery(
      projectId, baseline.id, current.diff.toHash, current.diff.fromHash, owners[0]
    );
    expect(result.contentHash).toBe(baseline.contentHash);
    expect(result.recoveryCheckpoint).toMatchObject({ sequence: 2, contentHash: current.diff.fromHash });
    expect((await projectCheckpointService.buildManifest(projectId)).contentHash).toBe(baseline.contentHash);
    expect(await prisma.ePackage.findUnique({ where: { id: laterPackage.id } })).toBeNull();
    expect(await prisma.projectMembership.findUnique({ where: { id: membership.id } })).toMatchObject({ role: 'MODELER' });

    const recovery = await projectCheckpointService.previewRestore(projectId, result.recoveryCheckpoint.id);
    await projectCheckpointService.restoreWithRecovery(
      projectId, result.recoveryCheckpoint.id, recovery.diff.toHash, recovery.diff.fromHash, owners[0]
    );
    expect((await projectCheckpointService.buildManifest(projectId)).contentHash).toBe(current.diff.fromHash);
    expect(await prisma.ePackage.findUnique({ where: { id: laterPackage.id } })).toMatchObject({ name: 'Latest work' });
  });

  it('rolls back the recovery checkpoint and local writes when an artifact ID belongs to another project', async () => {
    const projectId = await makeProject('Source project');
    const otherProjectId = await makeProject('Separate project');
    const packageRow = await makePackage(projectId, 'Original package');
    const baseline = await projectCheckpointService.create(projectId, owners[0]);
    await prisma.ePackage.update({
      where: { id: packageRow.id }, data: { projectId: otherProjectId, name: 'Other project package' },
    });
    await makePackage(projectId, 'Current local package');
    await prisma.studioProject.update({ where: { id: projectId }, data: { name: 'Current project name' } });

    const review = await projectCheckpointService.previewRestore(projectId, baseline.id);
    await expect(projectCheckpointService.restoreWithRecovery(
      projectId, baseline.id, review.diff.toHash, review.diff.fromHash, owners[0]
    )).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('conflicts with this restore') });

    expect(await prisma.ePackage.findUnique({ where: { id: packageRow.id } })).toMatchObject({
      projectId: otherProjectId, name: 'Other project package',
    });
    expect((await projectCheckpointService.buildManifest(projectId)).contentHash).toBe(review.diff.fromHash);
    expect(await prisma.projectCheckpoint.count({ where: { projectId } })).toBe(1);
  });
});
