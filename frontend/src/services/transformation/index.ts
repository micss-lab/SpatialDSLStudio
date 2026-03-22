/**
 * Transformation Service - Graph Transformations using VF2 Pattern Matching
 * 
 * Architecture:
 * - transformation.service.ts: Main orchestrator (exports transformationService)
 * - transformation-debug.service.ts: Debug logging utilities
 * - transformation-api-sync.service.ts: API synchronization with backend
 * - transformation-crud.service.ts: CRUD operations for patterns, rules, executions
 * - transformation-vf2-graph.service.ts: VF2 graph construction from patterns/models
 * - transformation-core.service.ts: VF2 matching algorithm, rule application, helpers
 * - transformation-execution.service.ts: Transformation execution engine and diagram sync
 */

export { transformationService } from './transformation.service';
