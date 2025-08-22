// Migration script to add 'type' field to existing constraints and fix duplicates

(function migrateConstraints() {
  try {
    console.log("****** STARTING CONSTRAINT MIGRATION ******");
    // Load models
    const modelsStorage = localStorage.getItem('obeo_like_tool_models');
    if (modelsStorage) {
      const models = JSON.parse(modelsStorage);
      console.log(`Found ${models.length} models to check`);
      // No changes needed for models
    }
    
    // Load metamodels and fix constraints
    const metamodelsStorage = localStorage.getItem('obeo_like_tool_metamodels');
    if (metamodelsStorage) {
      const metamodels = JSON.parse(metamodelsStorage);
      console.log(`Found ${metamodels.length} metamodels to check for constraint migration`);
      
      let constraintsMigrated = 0;
      let constraintsDeleted = 0;
      let constraintsFixed = 0;
      
      // Process all metamodels
      for (const metamodel of metamodels) {
        // Process class constraints
        for (const cls of metamodel.classes || []) {
          if (cls.constraints) {
            // First, check for duplicates by creating a map of constraint IDs
            const constraintMap = new Map();
            const duplicateIds = new Set();
            
            // Find duplicates
            for (const constraint of cls.constraints) {
              if (constraintMap.has(constraint.id)) {
                duplicateIds.add(constraint.id);
              } else {
                constraintMap.set(constraint.id, constraint);
              }
            }
            
            // Remove any duplicates found
            if (duplicateIds.size > 0) {
              const originalLength = cls.constraints.length;
              // Keep only the first occurrence of each duplicate
              cls.constraints = cls.constraints.filter((c, index) => {
                if (duplicateIds.has(c.id)) {
                  // Only keep the first occurrence of this ID
                  return cls.constraints.findIndex(c2 => c2.id === c.id) === index;
                }
                return true;
              });
              constraintsDeleted += (originalLength - cls.constraints.length);
              console.log(`Removed ${originalLength - cls.constraints.length} duplicate constraints from class ${cls.name}`);
            }
            
            // Now check all constraints and fix their type
            for (const constraint of cls.constraints) {
              // Fix JavaScript constraints first
              if (constraint.expression && 
                  (constraint.expression.includes('function(') || 
                   constraint.expression.includes('=>') || 
                   constraint.expression.includes('if (') || 
                   constraint.expression.includes('return '))) {
                // This looks like JavaScript
                constraint.type = 'javascript';
                constraintsFixed++;
                continue;
              }
              
              // Otherwise, assume it's OCL unless already marked
              if (!('type' in constraint)) {
                constraint.type = 'ocl';
                constraintsMigrated++;
              }
            }
          }
        }
        
        // Process global metamodel constraints (same logic as above)
        if (metamodel.constraints) {
          // Similar duplicate detection
          const constraintMap = new Map();
          const duplicateIds = new Set();
          
          // Find duplicates
          for (const constraint of metamodel.constraints) {
            if (constraintMap.has(constraint.id)) {
              duplicateIds.add(constraint.id);
            } else {
              constraintMap.set(constraint.id, constraint);
            }
          }
          
          // Remove any duplicates found
          if (duplicateIds.size > 0) {
            const originalLength = metamodel.constraints.length;
            metamodel.constraints = metamodel.constraints.filter((c, index) => {
              if (duplicateIds.has(c.id)) {
                return metamodel.constraints.findIndex(c2 => c2.id === c.id) === index;
              }
              return true;
            });
            constraintsDeleted += (originalLength - metamodel.constraints.length);
          }
          
          // Fix types
          for (const constraint of metamodel.constraints) {
            // Check for JavaScript constraints
            if (constraint.expression && 
                (constraint.expression.includes('function(') || 
                 constraint.expression.includes('=>') || 
                 constraint.expression.includes('if (') || 
                 constraint.expression.includes('return '))) {
              constraint.type = 'javascript';
              constraintsFixed++;
              continue;
            }
            
            // Otherwise, assume it's OCL unless already marked
            if (!('type' in constraint)) {
              constraint.type = 'ocl';
              constraintsMigrated++;
            }
          }
        }
      }
      
      // Save the updated metamodels
      if (constraintsMigrated > 0 || constraintsDeleted > 0 || constraintsFixed > 0) {
        console.log(`Migrations applied:`);
        console.log(`- Added type:'ocl' to ${constraintsMigrated} constraints`);
        console.log(`- Fixed type to 'javascript' for ${constraintsFixed} constraints`);
        console.log(`- Removed ${constraintsDeleted} duplicate constraints`);
        localStorage.setItem('obeo_like_tool_metamodels', JSON.stringify(metamodels));
      } else {
        console.log('No constraints needed migration');
      }
    }
    
    console.log('****** MIGRATION COMPLETE! ******');
  } catch (error) {
    console.error('Error during constraint migration:', error);
  }
})(); 