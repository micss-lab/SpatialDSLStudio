import { TransformationPattern, TransformationRule, TransformationExecution } from '../../models/types';
import { apiClient, API_ENDPOINTS } from '../core';

/**
 * Service for synchronizing transformation data with the API
 */
export class TransformationApiSyncService {
  private syncedToDb: Set<string> = new Set();

  async initializeFromAPI(): Promise<{
    patterns: TransformationPattern[];
    rules: TransformationRule[];
    executions: TransformationExecution[];
  }> {
    const patterns: TransformationPattern[] = [];
    const rules: TransformationRule[] = [];
    const executions: TransformationExecution[] = [];

    try {
      // Load rules from API (rules now contain embedded patterns)
      const apiRules = await apiClient.get<any[]>(API_ENDPOINTS.TRANSFORMATION_RULES);
      if (apiRules && apiRules.length > 0) {
        for (const r of apiRules) {
          // Extract embedded patterns from the rule
          const lhsPattern = r.lhsPattern || r.lhs;
          const rhsPattern = r.rhsPattern || r.rhs;
          const nacPatterns = r.nacPatterns || r.nacs || [];
          
          // Add patterns to our collection
          if (lhsPattern && typeof lhsPattern === 'object' && lhsPattern.id) {
            if (!patterns.find(p => p.id === lhsPattern.id)) {
              patterns.push(lhsPattern);
            }
          }
          if (rhsPattern && typeof rhsPattern === 'object' && rhsPattern.id) {
            if (!patterns.find(p => p.id === rhsPattern.id)) {
              patterns.push(rhsPattern);
            }
          }
          if (Array.isArray(nacPatterns)) {
            for (const nacPattern of nacPatterns) {
              if (nacPattern && typeof nacPattern === 'object' && nacPattern.id) {
                if (!patterns.find(p => p.id === nacPattern.id)) {
                  patterns.push(nacPattern);
                }
              }
            }
          }
          
          // Create the rule with pattern IDs
          const rule: TransformationRule = {
            id: r.id,
            name: r.name,
            description: r.description,
            lhs: typeof r.lhs === 'string' ? r.lhs : (lhsPattern?.id || ''),
            rhs: typeof r.rhs === 'string' ? r.rhs : (rhsPattern?.id || ''),
            nacs: Array.isArray(r.nacs) && r.nacs.every((n: any) => typeof n === 'string') 
              ? r.nacs 
              : (nacPatterns?.map((n: any) => n?.id).filter(Boolean) || []),
            conditions: r.conditions || [],
            priority: r.priority || 0,
            enabled: r.enabled !== false,
            isOwner: r.isOwner,
            ownerEmail: r.ownerEmail,
          };
          
          rules.push(rule);
          this.syncedToDb.add(`rule-${r.id}`);
        }
        
        console.log('Loaded transformations from API:', rules.length, 'rules,', patterns.length, 'patterns');
      }
      
      // Legacy: Also try to load standalone patterns
      try {
        const apiPatterns = await apiClient.get<TransformationPattern[]>(API_ENDPOINTS.TRANSFORMATION_PATTERNS);
        if (apiPatterns && apiPatterns.length > 0) {
          for (const p of apiPatterns) {
            if (!patterns.find(existing => existing.id === p.id)) {
              patterns.push(p);
              this.syncedToDb.add(p.id);
            }
          }
        }
      } catch (e) {
        // Patterns endpoint may return empty
      }
      
      // Load executions
      try {
        const apiExecutions = await apiClient.get<TransformationExecution[]>(API_ENDPOINTS.TRANSFORMATION_EXECUTIONS);
        if (apiExecutions && apiExecutions.length > 0) {
          executions.push(...apiExecutions);
        }
      } catch (e) {
        console.warn('Could not load executions from API:', e);
      }
      
      return { patterns, rules, executions };
    } catch (error) {
      console.error('Could not load from API:', error);
      return { patterns: [], rules: [], executions: [] };
    }
  }

  async syncPatternToAPI(pattern: TransformationPattern): Promise<void> {
    try {
      if (this.syncedToDb.has(pattern.id)) {
        await apiClient.put(`${API_ENDPOINTS.TRANSFORMATION_PATTERNS}/${pattern.id}`, pattern);
      } else {
        try {
          await apiClient.post(API_ENDPOINTS.TRANSFORMATION_PATTERNS, pattern);
          this.syncedToDb.add(pattern.id);
        } catch (e: any) {
          if (e.message?.includes('409') || e.message?.includes('conflict') || e.message?.includes('already exists')) {
            await apiClient.put(`${API_ENDPOINTS.TRANSFORMATION_PATTERNS}/${pattern.id}`, pattern);
            this.syncedToDb.add(pattern.id);
          } else {
            throw e;
          }
        }
      }
    } catch (error) {
      console.error('Error syncing pattern to API:', error);
    }
  }

  async syncRuleToAPI(rule: TransformationRule, patterns: TransformationPattern[]): Promise<void> {
    try {
      const lhsPattern = patterns.find(p => p.id === rule.lhs);
      const rhsPattern = patterns.find(p => p.id === rule.rhs);
      const nacPatterns = rule.nacs.map(nacId => patterns.find(p => p.id === nacId)).filter(Boolean);

      const ruleData = {
        id: rule.id,
        name: rule.name,
        description: rule.description,
        priority: rule.priority,
        enabled: rule.enabled,
        conditions: rule.conditions,
        lhs: lhsPattern || { id: rule.lhs, name: '', type: 'LHS', elements: [] },
        rhs: rhsPattern || { id: rule.rhs, name: '', type: 'RHS', elements: [] },
        nacs: nacPatterns,
      };

      if (this.syncedToDb.has(`rule-${rule.id}`)) {
        await apiClient.put(`${API_ENDPOINTS.TRANSFORMATION_RULES}/${rule.id}`, ruleData);
      } else {
        try {
          await apiClient.post(API_ENDPOINTS.TRANSFORMATION_RULES, ruleData);
          this.syncedToDb.add(`rule-${rule.id}`);
        } catch (e: any) {
          if (e.message?.includes('409') || e.message?.includes('conflict') || e.message?.includes('already exists')) {
            await apiClient.put(`${API_ENDPOINTS.TRANSFORMATION_RULES}/${rule.id}`, ruleData);
            this.syncedToDb.add(`rule-${rule.id}`);
          } else {
            throw e;
          }
        }
      }
      console.log('Rule synced to API:', rule.name);
    } catch (error) {
      console.error('Error syncing rule to API:', error);
    }
  }

  async syncAllToAPI(patterns: TransformationPattern[], rules: TransformationRule[]): Promise<void> {
    for (const pattern of patterns) {
      await this.syncPatternToAPI(pattern);
    }
    for (const rule of rules) {
      await this.syncRuleToAPI(rule, patterns);
    }
  }

  clearCache(): void {
    this.syncedToDb.clear();
  }
}

export const transformationApiSyncService = new TransformationApiSyncService();
