import { createCourseMetamodel, createCourseModel, prepareModelForValidation } from './ocl-examples';
import { oclService } from '../services/constraint';
import { modelService } from '../services/model';
import { metamodelService } from '../services/metamodel';

/**
 * Test file for demonstrating OCL constraint validation using OCL.js
 */

// Set OCL service in model service for validation
oclService.setModelService(modelService);

// Helper function to run tests
const runOCLTests = async (): Promise<void> => {
  console.log('Running OCL.js Validation Tests');
  console.log('-------------------------------');

  // 1. Create example metamodel and model
  const exampleMetamodel = createCourseMetamodel();
  console.log('Created example metamodel:', exampleMetamodel.name);
  
  // 2. Register metamodel with metamodel service
  // Check if there's an existing metamodel with the same ID and update it if so
  const existingMetamodel = metamodelService.getMetamodelById(exampleMetamodel.id);
  if (existingMetamodel) {
    metamodelService.updateMetamodel(exampleMetamodel.id, exampleMetamodel);
    console.log('Updated existing metamodel');
  } else {
    // Create a new metamodel using the service API
    const createdMetamodel = metamodelService.createMetamodel(exampleMetamodel.name);
    // Update it with our example metamodel data
    metamodelService.updateMetamodel(createdMetamodel.id, {
      ...exampleMetamodel,
      id: createdMetamodel.id
    });
    // Update our reference to use the created metamodel's ID
    exampleMetamodel.id = createdMetamodel.id;
    console.log('Created new metamodel with ID:', createdMetamodel.id);
  }
  
  // 3. Create model based on metamodel
  const exampleModel = createCourseModel(exampleMetamodel.id);
  const preparedModel = prepareModelForValidation(exampleModel, exampleMetamodel);
  console.log('Created example model:', preparedModel.name);
  
  // 4. Register model with model service
  // Check if there's an existing model with the same ID and update it
  const existingModel = modelService.getModelById(preparedModel.id);
  if (existingModel) {
    modelService.updateModel(preparedModel.id, preparedModel);
    console.log('Updated existing model');
  } else {
    // Create a new model and update it with our data
    const createdModel = modelService.createModel(preparedModel.name, exampleMetamodel.id);
    // Update with our prepared model data
    modelService.updateModel(createdModel.id, {
      ...preparedModel,
      id: createdModel.id
    });
    // Update our reference
    preparedModel.id = createdModel.id;
    console.log('Created new model with ID:', createdModel.id);
  }
  
  // 5. Validate OCL constraints in metamodel
  console.log('\nValidating OCL constraint syntax:');
  const courseClass = exampleMetamodel.classes.find(c => c.name === 'Course');
  if (courseClass && courseClass.constraints) {
    for (const constraint of courseClass.constraints) {
      const validationResult = oclService.validateOCLSyntax(
        constraint.expression,
        exampleMetamodel,
        courseClass
      );
      
      console.log(`- ${constraint.name}: ${validationResult.valid ? 'Valid' : 'Invalid'}`);
      if (!validationResult.valid && validationResult.issues.length > 0) {
        console.log(`  Error: ${validationResult.issues[0].message}`);
      }
    }
  }
  
  // 6. Validate model against OCL constraints
  console.log('\nValidating model against OCL constraints:');
  const validationResult = oclService.validateModelAgainstConstraints(
    preparedModel.id,
    exampleMetamodel.id
  );
  
  console.log(`Overall validation result: ${validationResult.valid ? 'Valid' : 'Invalid'}`);
  console.log(`Found ${validationResult.issues.length} validation issues`);
  
  // Print validation issues
  if (validationResult.issues.length > 0) {
    console.log('\nValidation Issues:');
    for (const issue of validationResult.issues) {
      const element = preparedModel.elements.find(e => e.id === issue.elementId);
      const elementName = element ? element.style.name : 'Unknown';
      
      console.log(`- Element: ${elementName}`);
      console.log(`  Constraint: ${issue.constraintId}`);
      console.log(`  Message: ${issue.message}`);
      console.log(`  Severity: ${issue.severity}`);
      console.log('');
    }
  }
  
  // 7. Test individual validation
  console.log('\nValidating specific elements:');
  
  // Find valid and invalid courses
  const validCourse = preparedModel.elements.find(e => 
    e.style.name === 'Introduction to Programming'
  );
  
  const invalidCourse = preparedModel.elements.find(e => 
    e.style.name === 'Advanced Database Systems'
  );
  
  if (validCourse) {
    console.log('Testing valid course: Introduction to Programming');
    // Use the validateModelAgainstConstraints API to validate just this element
    const courseValidation = oclService.validateModelAgainstConstraints(
      preparedModel.id, 
      exampleMetamodel.id
    );
    
    console.log(`- Result: ${courseValidation.valid ? 'Valid' : 'Invalid'}`);
    if (!courseValidation.valid) {
      console.log(`- Issues: ${courseValidation.issues.length}`);
      courseValidation.issues.forEach(issue => {
        if (issue.elementId === validCourse.id) {
          console.log(`  - ${issue.message}`);
        }
      });
    }
  }
  
  if (invalidCourse) {
    console.log('\nTesting invalid course: Advanced Database Systems');
    // Use the validateModelAgainstConstraints API to validate just this element
    const courseValidation = oclService.validateModelAgainstConstraints(
      preparedModel.id,
      exampleMetamodel.id
    );
    
    console.log(`- Result: ${courseValidation.valid ? 'Valid' : 'Invalid'}`);
    const elementIssues = courseValidation.issues.filter(issue => issue.elementId === invalidCourse.id);
    if (elementIssues.length > 0) {
      console.log(`- Issues for this element: ${elementIssues.length}`);
      elementIssues.forEach(issue => {
        console.log(`  - ${issue.message}`);
      });
    } else {
      console.log('- No issues found specifically for this element');
    }
  }
  
  console.log('\nOCL.js Validation Tests Completed');
};

// Run the tests
runOCLTests().catch(error => {
  console.error('Error running OCL tests:', error);
});

// Export for possible use in other modules
export default runOCLTests; 