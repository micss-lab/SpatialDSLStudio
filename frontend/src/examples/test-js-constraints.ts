import { jsService } from '../services/constraint';
import { modelService } from '../services/model';
import { metamodelService } from '../services/metamodel';
import { createAllExampleConstraints } from './js-constraint-examples';
import { v4 as uuidv4 } from 'uuid';
import { Metamodel, MetaClass, Model, MetaReference, ModelElement } from '../models/types';

/**
 * Test script demonstrating JavaScript constraint validation
 * 
 * This script:
 * 1. Creates a simple test metamodel
 * 2. Adds JavaScript constraints to it
 * 3. Creates model elements
 * 4. Validates them against the constraints
 */

// Initialize services
jsService.setModelService(modelService);

/**
 * Create a test metamodel with classes for constraint validation
 */
const createTestMetamodel = (): Metamodel => {
  // Create the metamodel
  const metamodel: Metamodel = {
    id: uuidv4(),
    name: 'JavaScript Constraints Test Metamodel',
    uri: 'http://example.org/js-constraints-test',
    prefix: 'jstest',
    eClass: 'EPackage',
    classes: [],
    conformsTo: 'ecore'
  };
  
  // Create a Person class for email validation
  const personClass: MetaClass = {
    id: uuidv4(),
    name: 'Person',
    eClass: 'EClass',
    abstract: false,
    superTypes: [],
    attributes: [
      {
        id: uuidv4(),
        name: 'name',
        eClass: 'EAttribute',
        type: 'string',
        required: true,
        many: false
      },
      {
        id: uuidv4(),
        name: 'email',
        eClass: 'EAttribute',
        type: 'string',
        required: true,
        many: false
      },
      {
        id: uuidv4(),
        name: 'age',
        eClass: 'EAttribute',
        type: 'number',
        required: true,
        many: false
      }
    ],
    references: [],
    constraints: []
  };
  
  // Create a ShoppingCart class for collection constraints
  const cartClass: MetaClass = {
    id: uuidv4(),
    name: 'ShoppingCart',
    eClass: 'EClass',
    abstract: false,
    superTypes: [],
    attributes: [
      {
        id: uuidv4(),
        name: 'customerName',
        eClass: 'EAttribute',
        type: 'string',
        required: true,
        many: false
      },
      {
        id: uuidv4(),
        name: 'budget',
        eClass: 'EAttribute',
        type: 'number',
        required: true,
        many: false
      }
    ],
    references: [],
    constraints: []
  };
  
  // Create an Item class
  const itemClass: MetaClass = {
    id: uuidv4(),
    name: 'Item',
    eClass: 'EClass',
    abstract: false,
    superTypes: [],
    attributes: [
      {
        id: uuidv4(),
        name: 'name',
        eClass: 'EAttribute',
        type: 'string',
        required: true,
        many: false
      },
      {
        id: uuidv4(),
        name: 'price',
        eClass: 'EAttribute',
        type: 'number',
        required: true,
        many: false
      },
      {
        id: uuidv4(),
        name: 'quantity',
        eClass: 'EAttribute',
        type: 'number',
        required: true,
        many: false
      }
    ],
    references: [],
    constraints: []
  };
  
  // Create an Event class for date constraints
  const eventClass: MetaClass = {
    id: uuidv4(),
    name: 'Event',
    eClass: 'EClass',
    abstract: false,
    superTypes: [],
    attributes: [
      {
        id: uuidv4(),
        name: 'title',
        eClass: 'EAttribute',
        type: 'string',
        required: true,
        many: false
      },
      {
        id: uuidv4(),
        name: 'eventDate',
        eClass: 'EAttribute',
        type: 'string', // We'll use ISO dates
        required: true,
        many: false
      },
      {
        id: uuidv4(),
        name: 'registrationDeadline',
        eClass: 'EAttribute',
        type: 'string', // ISO date
        required: false,
        many: false
      }
    ],
    references: [],
    constraints: []
  };
  
  // Create a Document class for state-based constraints
  const documentClass: MetaClass = {
    id: uuidv4(),
    name: 'Document',
    eClass: 'EClass',
    abstract: false,
    superTypes: [],
    attributes: [
      {
        id: uuidv4(),
        name: 'title',
        eClass: 'EAttribute',
        type: 'string',
        required: false,
        many: false
      },
      {
        id: uuidv4(),
        name: 'description',
        eClass: 'EAttribute',
        type: 'string',
        required: false,
        many: false
      },
      {
        id: uuidv4(),
        name: 'author',
        eClass: 'EAttribute',
        type: 'string',
        required: false,
        many: false
      },
      {
        id: uuidv4(),
        name: 'state',
        eClass: 'EAttribute',
        type: 'string',
        required: true,
        many: false
      }
    ],
    references: [],
    constraints: []
  };
  
  // Create a ValueObject class for utility function tests
  const valueClass: MetaClass = {
    id: uuidv4(),
    name: 'ValueObject',
    eClass: 'EClass',
    abstract: false,
    superTypes: [],
    attributes: [
      {
        id: uuidv4(),
        name: 'name',
        eClass: 'EAttribute',
        type: 'string',
        required: true,
        many: false
      },
      {
        id: uuidv4(),
        name: 'value',
        eClass: 'EAttribute',
        type: 'number',
        required: true,
        many: false
      },
      {
        id: uuidv4(),
        name: 'minimum',
        eClass: 'EAttribute',
        type: 'number',
        required: true,
        many: false
      },
      {
        id: uuidv4(),
        name: 'maximum',
        eClass: 'EAttribute',
        type: 'number',
        required: true,
        many: false
      }
    ],
    references: [],
    constraints: []
  };
  
  // Create a reference from cart to item (one-to-many)
  const itemsRef: MetaReference = {
    id: uuidv4(),
    name: 'items',
    eClass: 'EReference',
    target: itemClass.id,
    containment: true,
    cardinality: {
      lowerBound: 0,
      upperBound: '*' as '*'
    }
  };

  // Create a reference from document to user (approvers - many)
  const approversRef: MetaReference = {
    id: uuidv4(),
    name: 'approvers',
    eClass: 'EReference',
    target: personClass.id,
    containment: false,
    cardinality: {
      lowerBound: 0,
      upperBound: '*' as '*'
    }
  };
  
  // Add references to classes
  cartClass.references.push(itemsRef);
  documentClass.references.push(approversRef);
  
  // Add all classes to the metamodel
  metamodel.classes.push(
    personClass, 
    cartClass, 
    itemClass, 
    eventClass, 
    documentClass, 
    valueClass
  );
  
  return metamodel;
};

/**
 * Create a test model with various elements
 */
const createTestModel = (metamodel: Metamodel): Model => {
  const model: Model = {
    id: uuidv4(),
    name: 'JavaScript Constraints Test Model',
    metamodelId: metamodel.id,
    elements: [],
    conformsTo: metamodel.id
  };
  
  // Find the metamodel classes
  const personClass = metamodel.classes.find(c => c.name === 'Person');
  const cartClass = metamodel.classes.find(c => c.name === 'ShoppingCart');
  const itemClass = metamodel.classes.find(c => c.name === 'Item');
  const eventClass = metamodel.classes.find(c => c.name === 'Event');
  const documentClass = metamodel.classes.find(c => c.name === 'Document');
  const valueClass = metamodel.classes.find(c => c.name === 'ValueObject');
  
  if (!personClass || !cartClass || !itemClass || !eventClass || !documentClass || !valueClass) {
    throw new Error('Missing required classes in the metamodel');
  }
  
  // Create valid Person element
  const validPerson: ModelElement = {
    id: uuidv4(),
    modelElementId: personClass.id,
    style: {
      name: 'John Doe',
      email: 'john.doe@example.com',
      age: 30
    },
    references: {}
  };
  
  // Create invalid Person element (bad email)
  const invalidPerson: ModelElement = {
    id: uuidv4(),
    modelElementId: personClass.id,
    style: {
      name: 'Jane Smith',
      email: 'jane.smith@invalid', // Invalid email (missing TLD)
      age: 25
    },
    references: {}
  };
  
  // Create items for shopping cart
  const item1: ModelElement = {
    id: uuidv4(),
    modelElementId: itemClass.id,
    style: {
      name: 'Laptop',
      price: 1200,
      quantity: 1
    },
    references: {}
  };
  
  const item2: ModelElement = {
    id: uuidv4(),
    modelElementId: itemClass.id,
    style: {
      name: 'Mouse',
      price: 20,
      quantity: 1
    },
    references: {}
  };
  
  const item3: ModelElement = {
    id: uuidv4(),
    modelElementId: itemClass.id,
    style: {
      name: 'Keyboard',
      price: 80,
      quantity: 1
    },
    references: {}
  };
  
  // Create valid shopping cart
  const validCart: ModelElement = {
    id: uuidv4(),
    modelElementId: cartClass.id,
    style: {
      customerName: 'Alice Johnson',
      budget: 1500
    },
    references: {
      items: [item1.id, item2.id, item3.id]
    }
  };
  
  // Create invalid shopping cart (over budget)
  const invalidCart: ModelElement = {
    id: uuidv4(),
    modelElementId: cartClass.id,
    style: {
      customerName: 'Bob Brown',
      budget: 1000 // Not enough for all items
    },
    references: {
      items: [item1.id, item2.id, item3.id]
    }
  };
  
  // Create valid event (future date)
  const futureDate = new Date();
  futureDate.setMonth(futureDate.getMonth() + 1);
  
  const deadlineDate = new Date(futureDate);
  deadlineDate.setDate(deadlineDate.getDate() - 7);
  
  const validEvent: ModelElement = {
    id: uuidv4(),
    modelElementId: eventClass.id,
    style: {
      title: 'Conference',
      eventDate: futureDate.toISOString(),
      registrationDeadline: deadlineDate.toISOString()
    },
    references: {}
  };
  
  // Create invalid event (registration too close to event)
  const invalidDeadline = new Date(futureDate);
  invalidDeadline.setHours(invalidDeadline.getHours() - 1);
  
  const invalidEvent: ModelElement = {
    id: uuidv4(),
    modelElementId: eventClass.id,
    style: {
      title: 'Workshop',
      eventDate: futureDate.toISOString(),
      registrationDeadline: invalidDeadline.toISOString() // Less than 1 day before
    },
    references: {}
  };
  
  // Create documents in different states
  const draftDoc: ModelElement = {
    id: uuidv4(),
    modelElementId: documentClass.id,
    style: {
      title: '', // empty but ok in draft
      description: '',
      author: '',
      state: 'draft'
    },
    references: {
      approvers: []
    }
  };
  
  const submittedDoc: ModelElement = {
    id: uuidv4(),
    modelElementId: documentClass.id,
    style: {
      title: 'Proposal',
      description: 'Project proposal',
      author: 'Team Lead',
      state: 'submitted'
    },
    references: {
      approvers: []
    }
  };
  
  const invalidPublishedDoc: ModelElement = {
    id: uuidv4(),
    modelElementId: documentClass.id,
    style: {
      title: 'Final Report',
      description: 'Project final report',
      author: 'Team Lead',
      state: 'published'
    },
    references: {
      approvers: [validPerson.id] // Not enough approvers
    }
  };
  
  // Create value objects for utility function tests
  const validValue: ModelElement = {
    id: uuidv4(),
    modelElementId: valueClass.id,
    style: {
      name: 'Temperature',
      value: 25,
      minimum: 0,
      maximum: 100
    },
    references: {}
  };
  
  const invalidValue: ModelElement = {
    id: uuidv4(),
    modelElementId: valueClass.id,
    style: {
      name: 'Temperature',
      value: 120, // Exceeds maximum
      minimum: 0,
      maximum: 100
    },
    references: {}
  };
  
  // Add all elements to the model
  model.elements.push(
    validPerson,
    invalidPerson,
    item1,
    item2,
    item3,
    validCart,
    invalidCart,
    validEvent,
    invalidEvent,
    draftDoc,
    submittedDoc,
    invalidPublishedDoc,
    validValue,
    invalidValue
  );
  
  return model;
};

/**
 * Run the JavaScript constraint tests
 */
const runJSConstraintTests = (): void => {
  console.log('JavaScript Constraint Test');
  console.log('=========================');
  
  // Create a test metamodel
  const metamodel = createTestMetamodel();
  
  // Register it with the metamodel service
  metamodelService.createMetamodel(metamodel.name);
  
  // Add JavaScript constraints to the metamodel classes
  console.log('\nAdding JavaScript constraints...');
  
  const personClass = metamodel.classes.find(c => c.name === 'Person');
  const cartClass = metamodel.classes.find(c => c.name === 'ShoppingCart');
  const eventClass = metamodel.classes.find(c => c.name === 'Event');
  const documentClass = metamodel.classes.find(c => c.name === 'Document');
  const valueClass = metamodel.classes.find(c => c.name === 'ValueObject');
  
  if (personClass) {
    createAllExampleConstraints(metamodel.id, personClass.id);
    console.log(`- Added constraints to ${personClass.name} class`);
  }
  
  if (cartClass) {
    createAllExampleConstraints(metamodel.id, cartClass.id);
    console.log(`- Added constraints to ${cartClass.name} class`);
  }
  
  if (eventClass) {
    createAllExampleConstraints(metamodel.id, eventClass.id);
    console.log(`- Added constraints to ${eventClass.name} class`);
  }
  
  if (documentClass) {
    createAllExampleConstraints(metamodel.id, documentClass.id);
    console.log(`- Added constraints to ${documentClass.name} class`);
  }
  
  if (valueClass) {
    createAllExampleConstraints(metamodel.id, valueClass.id);
    console.log(`- Added constraints to ${valueClass.name} class`);
  }
  
  // Create a test model
  console.log('\nCreating test model...');
  const model = createTestModel(metamodel);
  
  // Register the model
  modelService.updateModel(model.id, model);
  
  // Validate the model
  console.log('\nValidating model against JavaScript constraints...');
  const validationResult = modelService.validateModel(model.id);
  
  // Display results
  console.log('\nValidation results:');
  console.log(`Model is valid: ${validationResult.valid ? 'Yes' : 'No'}`);
  console.log(`Found ${validationResult.issues.length} issues:`);
  
  validationResult.issues.forEach((issue, index) => {
    const elementType = model.elements.find(e => e.id === issue.elementId)?.modelElementId;
    const elementName = model.elements.find(e => e.id === issue.elementId)?.style.name;
    const elementClass = metamodel.classes.find(c => c.id === elementType)?.name;
    
    console.log(`\nIssue #${index + 1}:`);
    console.log(`- Element: ${elementName} (${elementClass})`);
    console.log(`- Severity: ${issue.severity}`);
    console.log(`- Message: ${issue.message}`);
    
    if ('constraintId' in issue) {
      const constraint = metamodel.classes
        .flatMap(c => c.constraints || [])
        .find(c => c.id === issue.constraintId);
      
      if (constraint) {
        console.log(`- Constraint: ${constraint.name}`);
      }
    }
  });
  
  console.log('\nJavaScript constraint test complete!');
};

// Run the tests
runJSConstraintTests(); 