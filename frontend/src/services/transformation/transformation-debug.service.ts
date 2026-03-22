/**
 * Service for debug logging in transformation operations
 */
export class TransformationDebugService {
  private debugEnabled = true;
  private debugCategories = {
    PATTERN_MATCHING: true,
    REFERENCE_MATCHING: false,
    VF2_ALGORITHM: false,
    RULE_APPLICATION: true,
    GRAPH_CREATION: false
  };

  debug(category: keyof typeof this.debugCategories, message: string, data?: any): void {
    if (!this.debugEnabled || !this.debugCategories[category]) return;
    
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[${timestamp}] [${category}] ${message}`, data ? data : '');
  }

  debugError(category: keyof typeof this.debugCategories, message: string, error?: any): void {
    if (!this.debugEnabled || !this.debugCategories[category]) return;
    
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.error(`[${timestamp}] [${category}] ERROR: ${message}`, error ? error : '');
  }

  debugGroup(category: keyof typeof this.debugCategories, title: string): void {
    if (!this.debugEnabled || !this.debugCategories[category]) return;
    console.group(`🔍 ${title}`);
  }

  debugGroupEnd(category: keyof typeof this.debugCategories): void {
    if (!this.debugEnabled || !this.debugCategories[category]) return;
    console.groupEnd();
  }

  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  setCategoryEnabled(category: keyof typeof this.debugCategories, enabled: boolean): void {
    this.debugCategories[category] = enabled;
  }
}

export const transformationDebugService = new TransformationDebugService();
