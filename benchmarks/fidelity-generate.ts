/**
 * Generation half of the fidelity check (run by fidelity.py).
 *
 * Applies K seeded pose edits (move, rotate, elevate) to the bundled Smart
 * Warehouse model one after another, regenerates the layered OpenUSD bundle
 * and the Visual Components location files through the backend generation
 * engine after each edit, and writes the outputs plus the expected poses.
 * It also generates the unedited model twice and records whether the outputs
 * are byte-identical.
 *
 *   npm run fidelity:generate -- <out-dir> [K] [seed]
 */
import './lib/offline-env';
import fs from 'fs';
import path from 'path';
import { CodeGenerationTemplate, Metamodel, Model, ModelElement } from '../shared/types';
import { codeGenerationEngine } from '../backend/src/services/pipeline/code-generation.engine';
import { seededRandom } from './lib/synthetic-warehouse';

const repoRoot = path.resolve(__dirname, '..');
const outDir = path.resolve(process.argv[2] || path.join(__dirname, 'results', 'fidelity'));
const editCount = Number(process.argv[3] || 200);
const seed = Number(process.argv[4] || 20261011);

const readJson = (relativePath: string): any => JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
const metamodel = readJson('frontend/src/examples/data/smart-warehouse-metamodel.json') as Metamodel;
const baseModel = readJson('frontend/src/examples/data/smart-warehouse-model.json') as Model;
const omniverseTemplates = readJson('examples/codegen-projects/smart-warehouse-omniverse-project.json').templates as CodeGenerationTemplate[];
const visualComponentsTemplates = readJson('examples/codegen-projects/smart-warehouse-visual-components-project.json').templates as CodeGenerationTemplate[];

const USD_LAYERS = ['warehouse_layout.usda', 'warehouse_assets.usda', 'warehouse_physics.usda', 'warehouse_simulation.usda'];
const OMNIVERSE_FILES = [...USD_LAYERS, 'warehouse_layout.json'];
const VISUAL_COMPONENTS_FILES = [
  'PathwayAreaLocation.json', 'RobotLocation.json', 'ConveyorLocation.json', 'OutputLocation.json', 'ChargingStationLocation.json',
];

const classNames = new Map(metamodel.classes.map(metaClass => [metaClass.id, metaClass.name]));
const isPlaced = (element: ModelElement): boolean => Boolean(element.presentation?.position3D && element.presentation?.size3D);
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const generateAll = (model: Model) => ({
  omniverse: codeGenerationEngine.generate(model, metamodel, omniverseTemplates),
  visualComponents: codeGenerationEngine.generate(model, metamodel, visualComponentsTemplates),
});

const expectedPoses = (model: Model) => model.elements.filter(isPlaced).map(element => ({
  id: element.id,
  name: String(element.style?.name || element.name || element.id),
  className: classNames.get(element.modelElementId) || element.modelElementId,
  x: element.presentation!.position3D!.x,
  y: element.presentation!.position3D!.y,
  z: element.presentation!.position3D!.z,
  rotationZ: element.presentation!.rotationZ ?? 0,
  widthMm: element.presentation!.size3D!.widthMm,
  heightMm: element.presentation!.size3D!.heightMm,
  depthMm: element.presentation!.size3D!.depthMm,
}));

const writeOutputs = (directory: string, model: Model, outputs: ReturnType<typeof generateAll>): void => {
  fs.mkdirSync(path.join(directory, 'visual-components'), { recursive: true });
  const byName = (files: typeof outputs.omniverse) => new Map(files.map(file => [file.filename, file.content]));
  const omniverse = byName(outputs.omniverse);
  const visualComponents = byName(outputs.visualComponents);
  OMNIVERSE_FILES.forEach(name => fs.writeFileSync(path.join(directory, name), omniverse.get(name)!));
  VISUAL_COMPONENTS_FILES.forEach(name => fs.writeFileSync(path.join(directory, 'visual-components', name), visualComponents.get(name)!));
  // Layers reference assets as @omniverse-assets/...@ relative to the bundle root.
  const assetLink = path.join(directory, 'omniverse-assets');
  if (!fs.existsSync(assetLink)) fs.symlinkSync(path.join(repoRoot, 'examples', 'omniverse-assets'), assetLink, 'dir');
  fs.writeFileSync(path.join(directory, 'expected.json'), `${JSON.stringify(expectedPoses(model), null, 2)}\n`);
};

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// Determinism: the unedited model generated twice must give byte-identical files.
const first = generateAll(baseModel);
const second = generateAll(JSON.parse(JSON.stringify(baseModel)));
const allFiles = (outputs: ReturnType<typeof generateAll>) => [...outputs.omniverse, ...outputs.visualComponents];
const differing = allFiles(first)
  .filter((file, index) => {
    const other = allFiles(second)[index];
    return !other || other.filename !== file.filename || other.content !== file.content || other.contentHash !== file.contentHash;
  })
  .map(file => file.filename);
const determinism = {
  files: allFiles(first).length,
  byteIdentical: differing.length === 0 && allFiles(first).length === allFiles(second).length,
  differing,
  contentHashes: Object.fromEntries(allFiles(first).map(file => [file.filename, file.contentHash])),
};

const random = seededRandom(seed);
const model: Model = JSON.parse(JSON.stringify(baseModel));
const placed = model.elements.filter(isPlaced);
const edits: Array<Record<string, unknown>> = [];
const started = Date.now();
writeOutputs(path.join(outDir, 'edit-000'), model, first);

for (let index = 1; index <= editCount; index += 1) {
  const element = placed[Math.floor(random() * placed.length)];
  const presentation = element.presentation!;
  const before = { ...presentation.position3D!, rotationZ: presentation.rotationZ ?? 0 };
  const roll = random();
  let kind: string;
  if (roll < 1 / 3) {
    kind = 'move';
    presentation.position3D = {
      ...presentation.position3D!,
      x: round3(presentation.position3D!.x + (random() * 6000 - 3000)),
      y: round3(presentation.position3D!.y + (random() * 6000 - 3000)),
    };
  } else if (roll < 2 / 3) {
    kind = 'rotate';
    presentation.rotationZ = round3(random() * 360 - 180);
  } else {
    kind = 'elevate';
    presentation.position3D = { ...presentation.position3D!, z: round3(random() * 3000) };
  }
  edits.push({
    index,
    kind,
    element: element.style?.name,
    className: classNames.get(element.modelElementId),
    before,
    after: { ...presentation.position3D!, rotationZ: presentation.rotationZ ?? 0 },
  });
  writeOutputs(path.join(outDir, `edit-${String(index).padStart(3, '0')}`), model, generateAll(model));
}

fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify({
  seed,
  edits: editCount,
  placedElements: placed.length,
  omniverseFiles: OMNIVERSE_FILES,
  visualComponentsFiles: VISUAL_COMPONENTS_FILES,
  determinism,
  generationSeconds: Math.round((Date.now() - started) / 100) / 10,
  editLog: edits,
}, null, 2)}\n`);
process.stdout.write(`Generated ${editCount + 1} bundles in ${outDir}; determinism byte-identical: ${determinism.byteIdentical}\n`);
