import { Metamodel, MetaClass, MetaAttribute, MetaReference, Constraint, Model, ModelElement } from '../../models/types';

// Search entity types
export type SearchEntityType = 'class' | 'attribute' | 'reference' | 'constraint' | 'element' | 'instance' | 'generic-attribute' | 'generic-reference';

// Search result entry
export interface SearchEntry {
  id: string;
  type: SearchEntityType;
  label: string;
  searchText: string; // Preprocessed text for matching
  metadata: {
    path: string[]; // Breadcrumb path (e.g., ['Person', 'name'])
    parentId?: string; // For attributes/references, the parent class ID
    parentName?: string; // For attributes/references, the parent class name
    classId?: string; // The class this belongs to
    itemId?: string; // The specific item ID (attribute, reference, constraint)
    position?: { x: number; y: number }; // Position if available
    targetClassName?: string; // For references, the target class name
    constraintType?: string; // For constraints, 'ocl' or 'javascript'
    elementType?: string; // For model elements, the MetaClass name
    attributeValues?: Record<string, any>; // For model elements, their attribute values
    attributeType?: string; // For attributes, their data type (string, number, boolean, etc.)
    attributeName?: string; // For generic attribute entries
    referenceName?: string; // For generic reference entries
  };
}

// Search result with match score
export interface SearchResult extends SearchEntry {
  score: number; // Match score (higher is better)
  matchedText: string; // The text that matched
}

// Search options
export interface SearchOptions {
  entityTypes?: SearchEntityType[]; // Filter by entity types
  caseSensitive?: boolean;
  fuzzy?: boolean; // Enable fuzzy matching
  maxResults?: number;
}

class SearchService {
  // Build search index for a metamodel
  buildMetamodelIndex(metamodel: Metamodel): SearchEntry[] {
    const entries: SearchEntry[] = [];

    // Index classes
    metamodel.classes.forEach(metaClass => {
      entries.push({
        id: metaClass.id,
        type: 'class',
        label: metaClass.name,
        searchText: this.preprocessText(metaClass.name),
        metadata: {
          path: [metaClass.name],
          classId: metaClass.id,
          position: metaClass.position
        }
      });

      // Index attributes
      metaClass.attributes.forEach(attr => {
        entries.push({
          id: attr.id,
          type: 'attribute',
          label: `${metaClass.name}.${attr.name}`,
          searchText: this.preprocessText(`${metaClass.name}.${attr.name} ${attr.name}`),
          metadata: {
            path: [metaClass.name, attr.name],
            parentId: metaClass.id,
            parentName: metaClass.name,
            classId: metaClass.id,
            itemId: attr.id,
            position: metaClass.position
          }
        });
      });

      // Index references
      metaClass.references.forEach(ref => {
        const targetClass = metamodel.classes.find(c => c.id === ref.target);
        const targetName = targetClass?.name || 'Unknown';
        
        entries.push({
          id: ref.id,
          type: 'reference',
          label: `${metaClass.name}.${ref.name}`,
          searchText: this.preprocessText(`${metaClass.name}.${ref.name} ${ref.name} ${targetName}`),
          metadata: {
            path: [metaClass.name, ref.name],
            parentId: metaClass.id,
            parentName: metaClass.name,
            classId: metaClass.id,
            itemId: ref.id,
            position: metaClass.position,
            targetClassName: targetName
          }
        });
      });

      // Index constraints
      if (metaClass.constraints) {
        metaClass.constraints.forEach(constraint => {
          entries.push({
            id: constraint.id,
            type: 'constraint',
            label: `${metaClass.name}.${constraint.name}`,
            searchText: this.preprocessText(
              `${metaClass.name}.${constraint.name} ${constraint.name} ${constraint.expression}`
            ),
            metadata: {
              path: [metaClass.name, 'constraints', constraint.name],
              parentId: metaClass.id,
              parentName: metaClass.name,
              classId: metaClass.id,
              itemId: constraint.id,
              position: metaClass.position,
              constraintType: constraint.type
            }
          });
        });
      }
    });

    return entries;
  }

  // Search in metamodel
  searchMetamodel(
    query: string,
    index: SearchEntry[],
    options: SearchOptions = {}
  ): SearchResult[] {
    if (!query.trim()) {
      return [];
    }

    const {
      entityTypes = ['class', 'attribute', 'reference', 'constraint'],
      caseSensitive = false,
      fuzzy = true,
      maxResults = 50
    } = options;

    const processedQuery = this.preprocessText(query, caseSensitive);
    
    // Check for qualified searches (e.g., "class:Person", "attr:name")
    const qualifiedMatch = query.match(/^(class|attr|attribute|ref|reference|constraint):(.+)$/i);
    let filteredTypes = entityTypes;
    let searchQuery = processedQuery;

    if (qualifiedMatch) {
      const qualifier = qualifiedMatch[1].toLowerCase();
      searchQuery = this.preprocessText(qualifiedMatch[2], caseSensitive);
      
      if (qualifier === 'class') filteredTypes = ['class'];
      else if (qualifier === 'attr' || qualifier === 'attribute') filteredTypes = ['attribute'];
      else if (qualifier === 'ref' || qualifier === 'reference') filteredTypes = ['reference'];
      else if (qualifier === 'constraint') filteredTypes = ['constraint'];
    }

    // Filter by entity type and search
    const results: SearchResult[] = [];

    for (const entry of index) {
      if (!filteredTypes.includes(entry.type)) {
        continue;
      }

      const score = this.calculateMatchScore(searchQuery, entry.searchText, fuzzy);
      
      if (score > 0) {
        results.push({
          ...entry,
          score,
          matchedText: entry.label
        });
      }
    }

    // Sort by score (descending) and limit results
    results.sort((a, b) => b.score - a.score);
    
    return results.slice(0, maxResults);
  }

  // Preprocess text for searching
  private preprocessText(text: string, caseSensitive: boolean = false): string {
    let processed = text.trim();
    if (!caseSensitive) {
      processed = processed.toLowerCase();
    }
    return processed;
  }

  // Calculate match score
  private calculateMatchScore(query: string, text: string, fuzzy: boolean): number {
    // Exact match
    if (text === query) {
      return 100;
    }

    // Starts with query (high priority)
    if (text.startsWith(query)) {
      return 90;
    }

    // Contains query (medium priority)
    if (text.includes(query)) {
      return 70;
    }

    // Fuzzy matching (lower priority)
    if (fuzzy) {
      const distance = this.levenshteinDistance(query, text);
      const maxLength = Math.max(query.length, text.length);
      const similarity = 1 - distance / maxLength;
      
      // Only consider matches with > 60% similarity
      if (similarity > 0.6) {
        return Math.floor(similarity * 50);
      }
    }

    // Word boundary matching
    const words = text.split(/[\s._-]+/);
    for (const word of words) {
      if (word.startsWith(query)) {
        return 60;
      }
      if (word.includes(query)) {
        return 50;
      }
    }

    return 0;
  }

  // Levenshtein distance for fuzzy matching
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  // Build search index for a model
  buildModelIndex(model: Model, metamodel: Metamodel): SearchEntry[] {
    const entries: SearchEntry[] = [];
    const genericAttributes = new Map<string, { type: string; count: number }>();

    model.elements.forEach(element => {
      const metaClass = metamodel.classes.find(c => c.id === element.modelElementId);
      if (!metaClass) return;

      const elementName = element.style?.name || element.name || `${metaClass.name} instance`;
      
      // Create instance entry
      const attributeTexts: string[] = [];
      Object.entries(element.style || {}).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          attributeTexts.push(`${key}:${value}`);
        }
      });

      entries.push({
        id: element.id,
        type: 'instance',
        label: elementName,
        searchText: this.preprocessText(
          `${elementName} ${metaClass.name} ${attributeTexts.join(' ')}`
        ),
        metadata: {
          path: [metaClass.name, elementName],
          classId: metaClass.id,
          elementType: metaClass.name,
          attributeValues: element.style || {}
        }
      });

      // Create entries for each attribute value
      metaClass.attributes.forEach(attr => {
        const value = element.style?.[attr.name];
        if (value !== null && value !== undefined) {
          entries.push({
            id: `${element.id}-${attr.id}`,
            type: 'attribute',
            label: `${elementName}.${attr.name} = ${value}`,
            searchText: this.preprocessText(
              `${attr.name} ${value} ${elementName}`
            ),
            metadata: {
              path: [metaClass.name, elementName, attr.name],
              parentId: element.id,
              parentName: elementName,
              classId: metaClass.id,
              itemId: attr.id,
              attributeType: attr.type,
              attributeValues: element.style || {}
            }
          });

          // Track for generic attribute entries
          if (!genericAttributes.has(attr.name)) {
            genericAttributes.set(attr.name, { type: attr.type, count: 0 });
          }
          genericAttributes.get(attr.name)!.count++;
        }
      });

      // Create entries for each reference value and their attributes
      metaClass.references.forEach(ref => {
        const refValue = element.references?.[ref.name];
        if (refValue !== null && refValue !== undefined) {
          const targetClass = metamodel.classes.find(c => c.id === ref.target);
          const targetClassName = targetClass?.name || 'unknown';
          
          // Create entry for the reference itself
          const refValueStr = Array.isArray(refValue) ? refValue.join(', ') : String(refValue);
          entries.push({
            id: `${element.id}-ref-${ref.id}`,
            type: 'reference',
            label: `${elementName}.${ref.name} → ${refValueStr}`,
            searchText: this.preprocessText(
              `${ref.name} ${refValueStr} ${elementName}`
            ),
            metadata: {
              path: [metaClass.name, elementName, ref.name],
              parentId: element.id,
              parentName: elementName,
              classId: metaClass.id,
              itemId: ref.id,
              targetClassName: targetClassName,
              attributeValues: element.style || {}
            }
          });
          
          // If reference has attributes defined, create entries for those too
          if (ref.attributes && ref.attributes.length > 0) {
            ref.attributes.forEach(attr => {
              const attrValue = element.style?.[`${ref.name}.${attr.name}`];
              if (attrValue !== null && attrValue !== undefined) {
                entries.push({
                  id: `${element.id}-ref-${ref.id}-attr-${attr.id}`,
                  type: 'attribute',
                  label: `${elementName}.${ref.name}.${attr.name} = ${attrValue}`,
                  searchText: this.preprocessText(
                    `${ref.name} ${attr.name} ${attrValue} ${elementName}`
                  ),
                  metadata: {
                    path: [metaClass.name, elementName, ref.name, attr.name],
                    parentId: element.id,
                    parentName: elementName,
                    classId: metaClass.id,
                    itemId: attr.id,
                    attributeType: attr.type,
                    attributeValues: element.style || {}
                  }
                });
                
                // Track for generic attribute entries
                const fullAttrName = `${ref.name}.${attr.name}`;
                if (!genericAttributes.has(fullAttrName)) {
                  genericAttributes.set(fullAttrName, { type: attr.type, count: 0 });
                }
                genericAttributes.get(fullAttrName)!.count++;
              }
            });
          }
        }
      });
    });

    // Add generic attribute entries
    genericAttributes.forEach((info, attrName) => {
      entries.push({
        id: `generic-attr-${attrName}`,
        type: 'generic-attribute',
        label: `${attrName} (attribute)`,
        searchText: this.preprocessText(attrName),
        metadata: {
          path: [attrName],
          attributeName: attrName,
          attributeType: info.type
        }
      });
    });

    return entries;
  }

  // Parse search query for model attribute filters
  private parseModelQuery(query: string): {
    textQuery: string;
    typeFilter?: string;
    attributeFilters: Array<{
      attribute: string;
      operator: '=' | '>' | '<' | '>=' | '<=' | ':';
      value: any;
    }>;
  } {
    const attributeFilters: Array<{
      attribute: string;
      operator: '=' | '>' | '<' | '>=' | '<=' | ':';
      value: any;
    }> = [];
    
    let textQuery = query;
    let typeFilter: string | undefined;

    // Match type:ClassName
    const typeMatch = query.match(/type:(\w+)/i);
    if (typeMatch) {
      typeFilter = typeMatch[1];
      textQuery = textQuery.replace(typeMatch[0], '').trim();
    }

    // Match attribute filters: name:John, age>30, isActive=true, etc.
    const filterRegex = /(\w+)(:|=|>=|<=|>|<)([^\s]+)/g;
    let match;
    
    while ((match = filterRegex.exec(query)) !== null) {
      const attribute = match[1];
      const operator = match[2] as '=' | '>' | '<' | '>=' | '<=' | ':';
      let value: any = match[3];

      // Skip if it's the type: filter (already handled)
      if (attribute.toLowerCase() === 'type') continue;

      // Parse value type
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (!isNaN(Number(value))) value = Number(value);

      attributeFilters.push({ attribute, operator, value });
      
      // Remove from text query
      textQuery = textQuery.replace(match[0], '').trim();
    }

    return { textQuery, typeFilter, attributeFilters };
  }

  // Check if a value matches a filter
  private matchesFilter(
    elementValue: any,
    operator: '=' | '>' | '<' | '>=' | '<=' | ':',
    filterValue: any
  ): boolean {
    if (elementValue === null || elementValue === undefined) return false;

    switch (operator) {
      case '=':
        return elementValue === filterValue;
      case ':':
        // Partial string match
        return String(elementValue).toLowerCase().includes(String(filterValue).toLowerCase());
      case '>':
        return Number(elementValue) > Number(filterValue);
      case '<':
        return Number(elementValue) < Number(filterValue);
      case '>=':
        return Number(elementValue) >= Number(filterValue);
      case '<=':
        return Number(elementValue) <= Number(filterValue);
      default:
        return false;
    }
  }

  // Search in model
  searchModel(
    query: string,
    index: SearchEntry[],
    options: SearchOptions = {}
  ): SearchResult[] {
    if (!query.trim()) {
      return [];
    }

    const {
      caseSensitive = false,
      fuzzy = true,
      maxResults = 50
    } = options;

    // Parse the query
    const { textQuery, typeFilter, attributeFilters } = this.parseModelQuery(query);

    const results: SearchResult[] = [];
    const genericResults: SearchResult[] = [];

    for (const entry of index) {
      // Handle generic attribute entries separately
      if (entry.type === 'generic-attribute') {
        if (textQuery) {
          const processedQuery = this.preprocessText(textQuery, caseSensitive);
          const score = this.calculateMatchScore(processedQuery, entry.searchText, fuzzy);
          
          if (score > 0) {
            genericResults.push({
              ...entry,
              score: score + 1000, // Boost score to appear at top
              matchedText: entry.label
            });
          }
        }
        continue;
      }

      // Skip non-instance/attribute/reference entries
      if (!['instance', 'attribute', 'reference'].includes(entry.type)) continue;

      // Apply type filter (only for instances)
      if (typeFilter && entry.type === 'instance' && 
          entry.metadata.elementType?.toLowerCase() !== typeFilter.toLowerCase()) {
        continue;
      }

      // Apply attribute filters
      let passesAttributeFilters = true;
      for (const filter of attributeFilters) {
        const elementValue = entry.metadata.attributeValues?.[filter.attribute];
        if (!this.matchesFilter(elementValue, filter.operator, filter.value)) {
          passesAttributeFilters = false;
          break;
        }
      }

      if (!passesAttributeFilters) continue;

      // Apply text search if there's remaining text query
      let score = 100; // Default score if only filters are used
      
      if (textQuery) {
        const processedQuery = this.preprocessText(textQuery, caseSensitive);
        score = this.calculateMatchScore(processedQuery, entry.searchText, fuzzy);
        
        if (score === 0) continue;
      }

      results.push({
        ...entry,
        score,
        matchedText: entry.label
      });
    }

    // Combine generic results at the top, then regular results
    const allResults = [...genericResults, ...results];
    
    // Sort by score (descending) and limit results
    allResults.sort((a, b) => b.score - a.score);
    
    return allResults.slice(0, maxResults);
  }
}

export const searchService = new SearchService();
