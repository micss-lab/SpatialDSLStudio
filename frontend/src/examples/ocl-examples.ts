import { v4 as uuidv4 } from 'uuid';
import { Metamodel, MetaClass, Model, ModelElement, OCLConstraint } from '../models/types';

/**
 * Example OCL constraints for a simple Course Management System metamodel
 */

// Example metamodel for a Course Management System
export const createCourseMetamodel = (): Metamodel => {
  const metamodelId = uuidv4();
  
  // Create Course metaclass
  const courseClassId = uuidv4();
  const courseClass: MetaClass = {
    id: courseClassId,
    name: 'Course',
    eClass: '',
    abstract: false,
    superTypes: [],
    attributes: [
      {
        id: uuidv4(),
        name: 'name',
        eClass: '',
        type: 'string',
        required: true,
        many: false
      },
      {
        id: uuidv4(),
        name: 'creditHours',
        eClass: '',
        type: 'number',
        defaultValue: 3,
        required: true,
        many: false
      },
      {
        id: uuidv4(),
        name: 'maxEnrollment',
        eClass: '',
        type: 'number',
        defaultValue: 30,
        required: true,
        many: false
      }
    ],
    references: [
      {
        id: uuidv4(),
        name: 'enrolledStudents',
        eClass: '',
        target: '', // Will be set to Student class ID
        containment: false,
        cardinality: {
          lowerBound: 0,
          upperBound: '*'
        }
      },
      {
        id: uuidv4(),
        name: 'instructor',
        eClass: '',
        target: '', // Will be set to Instructor class ID
        containment: false,
        cardinality: {
          lowerBound: 0,
          upperBound: 1
        }
      }
    ],
    constraints: [] // We'll add constraints later
  };

  // Create Student metaclass
  const studentClassId = uuidv4();
  const studentClass: MetaClass = {
    id: studentClassId,
    name: 'Student',
    eClass: '',
    abstract: false,
    superTypes: [],
    attributes: [
      {
        id: uuidv4(),
        name: 'name',
        eClass: '',
        type: 'string',
        required: true,
        many: false
      },
      {
        id: uuidv4(),
        name: 'gpa',
        eClass: '',
        type: 'number',
        defaultValue: 0.0,
        required: true,
        many: false
      }
    ],
    references: [],
    constraints: []
  };

  // Create Instructor metaclass
  const instructorClassId = uuidv4();
  const instructorClass: MetaClass = {
    id: instructorClassId,
    name: 'Instructor',
    eClass: '',
    abstract: false,
    superTypes: [],
    attributes: [
      {
        id: uuidv4(),
        name: 'name',
        eClass: '',
        type: 'string',
        required: true,
        many: false
      },
      {
        id: uuidv4(),
        name: 'department',
        eClass: '',
        type: 'string',
        required: true,
        many: false
      }
    ],
    references: [],
    constraints: []
  };

  // Update the target references
  courseClass.references[0].target = studentClassId;
  courseClass.references[1].target = instructorClassId;

  // Create the metamodel
  const metamodel: Metamodel = {
    id: metamodelId,
    name: 'CourseManagementSystem',
    eClass: '',
    uri: 'http://cms.example.com',
    prefix: 'cms',
    classes: [courseClass, studentClass, instructorClass],
    conformsTo: '',
    constraints: []
  };

  // Add OCL constraints to Course class
  const courseConstraints: OCLConstraint[] = [
    // Simple range constraint - this should already work with the original implementation
    {
      id: uuidv4(),
      name: 'CreditHoursRange',
      contextClassName: 'Course',
      contextClassId: courseClassId,
      expression: 'context Course inv CreditHoursRange: self.creditHours >= 1 and self.creditHours <= 6',
      description: 'A course must have between 1 and 6 credit hours',
      isValid: true,
      severity: 'error',
      type: 'ocl'
    },
    // Complex constraint with collection operation (size)
    {
      id: uuidv4(),
      name: 'MaxEnrollmentCheck',
      contextClassName: 'Course',
      contextClassId: courseClassId,
      expression: 'context Course inv MaxEnrollmentCheck: self.enrolledStudents->size() <= self.maxEnrollment',
      description: 'The number of enrolled students cannot exceed the maximum enrollment',
      isValid: true,
      severity: 'error',
      type: 'ocl'
    },
    // Complex constraint with if-then-else structure
    {
      id: uuidv4(),
      name: 'HighCreditEnrollmentRequirement',
      contextClassName: 'Course',
      contextClassId: courseClassId,
      expression: 'context Course inv HighCreditEnrollmentRequirement: if self.creditHours > 3 then self.enrolledStudents->size() >= 2 else true endif',
      description: 'Courses with more than 3 credit hours must have at least 2 students enrolled',
      isValid: true,
      severity: 'error',
      type: 'ocl'
    },
    // Complex constraint with exists operation
    {
      id: uuidv4(),
      name: 'GoodStudentRequired',
      contextClassName: 'Course',
      contextClassId: courseClassId,
      expression: 'context Course inv GoodStudentRequired: self.enrolledStudents->exists(s | s.gpa >= 3.0)',
      description: 'At least one enrolled student must have a GPA of 3.0 or higher',
      isValid: true,
      severity: 'warning',
      type: 'ocl'
    }
  ];

  // Add the constraints to the Course class
  courseClass.constraints = courseConstraints;

  return metamodel;
};

// Example model based on the Course Management System metamodel
export const createCourseModel = (metamodelId: string): Model => {
  const modelId = uuidv4();
  
  // Create an instructor
  const instructorId = uuidv4();
  const instructor: ModelElement = {
    id: instructorId,
    modelElementId: '', // Will be set when we have classes loaded
    style: {
      name: 'Professor Smith',
      department: 'Computer Science'
    },
    references: {}
  };

  // Create students
  const student1Id = uuidv4();
  const student1: ModelElement = {
    id: student1Id,
    modelElementId: '', // Will be set when we have classes loaded
    style: {
      name: 'John Doe',
      gpa: 3.5
    },
    references: {}
  };

  const student2Id = uuidv4();
  const student2: ModelElement = {
    id: student2Id,
    modelElementId: '', // Will be set when we have classes loaded
    style: {
      name: 'Jane Smith',
      gpa: 2.8
    },
    references: {}
  };

  // Create a course with valid constraints
  const validCourseId = uuidv4();
  const validCourse: ModelElement = {
    id: validCourseId,
    modelElementId: '', // Will be set when we have classes loaded
    style: {
      name: 'Introduction to Programming',
      creditHours: 3,
      maxEnrollment: 30
    },
    references: {
      enrolledStudents: [student1Id, student2Id],
      instructor: instructorId
    }
  };

  // Create a course that violates the high credit constraint
  const invalidCourseId = uuidv4();
  const invalidCourse: ModelElement = {
    id: invalidCourseId,
    modelElementId: '', // Will be set when we have classes loaded
    style: {
      name: 'Advanced Database Systems',
      creditHours: 4,
      maxEnrollment: 20
    },
    references: {
      enrolledStudents: [student2Id], // Only one student, violates HighCreditEnrollmentRequirement
      instructor: instructorId
    }
  };

  // Create the model
  const model: Model = {
    id: modelId,
    name: 'Course Model Example',
    metamodelId: metamodelId,
    conformsTo: metamodelId,
    elements: [instructor, student1, student2, validCourse, invalidCourse]
  };

  return model;
};

// Function to load the class IDs into the model elements based on the metamodel
export const prepareModelForValidation = (model: Model, metamodel: Metamodel): Model => {
  // Get the metaclasses from the metamodel
  const courseClass = metamodel.classes.find(c => c.name === 'Course');
  const studentClass = metamodel.classes.find(c => c.name === 'Student');
  const instructorClass = metamodel.classes.find(c => c.name === 'Instructor');

  if (!courseClass || !studentClass || !instructorClass) {
    throw new Error('Required metaclasses not found in metamodel');
  }

  // Update model elements with appropriate metaclass IDs
  const updatedElements = model.elements.map(element => {
    const clone = { ...element };
    
    if (element.style.name?.includes('Professor')) {
      clone.modelElementId = instructorClass.id;
    } else if (element.style.name?.includes('John') || element.style.name?.includes('Jane')) {
      clone.modelElementId = studentClass.id;
    } else {
      clone.modelElementId = courseClass.id;
    }
    
    return clone;
  });

  // Return the updated model
  return {
    ...model,
    elements: updatedElements
  };
}; 