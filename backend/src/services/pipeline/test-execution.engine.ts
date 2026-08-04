import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../middleware';
import { MetaClass, MetaReference, Metamodel, Model, TestValue } from '../../../../shared/types';
import { isSubtype, valueMatchesAttribute } from './model-validation.engine';

interface TestValueResult extends TestValue {
  result: boolean;
  passed: boolean;
  errorMessage?: string;
}

const referenceValueValidity = (
  value: unknown,
  reference: MetaReference,
  metamodel: Metamodel
): boolean => {
  let values: unknown[];
  if (value === null || value === undefined || (typeof value === 'string' && value.includes('Empty reference'))) {
    values = [];
  } else {
    values = Array.isArray(value) ? value : [value];
  }
  const maximum = reference.cardinality.upperBound;
  if (
    values.length < reference.cardinality.lowerBound
    || (maximum !== '*' && values.length > maximum)
  ) return false;

  return values.every(candidate => {
    if (typeof candidate === 'string') {
      if (candidate.includes('Invalid target type')) return false;
      return candidate.includes('Valid');
    }
    if (!candidate || typeof candidate !== 'object') return false;
    const typeName = (candidate as Record<string, unknown>).type;
    if (typeof typeName !== 'string') return true;
    const targetClass = metamodel.classes.find(metaClass => metaClass.name === typeName);
    return Boolean(targetClass && isSubtype(metamodel, targetClass.id, reference.target));
  });
};

export class TestExecutionEngine {
  async run(projectId: string, model: Model, metamodel: Metamodel): Promise<Record<string, any>> {
    const testCases = await prisma.testCase.findMany({
      where: {
        projectId,
        OR: [{ modelId: model.id }, { modelId: metamodel.id }],
      },
      orderBy: { id: 'asc' },
    });
    const classById = new Map(metamodel.classes.map(metaClass => [metaClass.id, metaClass]));
    const results: Array<Record<string, any>> = [];

    for (const testCase of testCases) {
      const metaClass = classById.get(testCase.targetMetaClassId);
      if (!metaClass) throw new ApiError(409, `Test ${testCase.name} targets an unknown metaclass`);
      const valueResults = this.evaluateValues(testCase, metaClass, metamodel);
      const passed = valueResults.every(result => result.passed);
      const errorMessage = passed
        ? null
        : valueResults.filter(result => !result.passed).map(result => result.errorMessage).join('; ');
      const actualOutput = { values: valueResults };
      await prisma.testCase.update({
        where: { id: testCase.id },
        data: {
          status: passed ? 'passed' : 'failed',
          errorMessage,
          actualOutput: actualOutput as unknown as Prisma.InputJsonValue,
        },
      });
      results.push({
        id: testCase.id,
        name: testCase.name,
        status: passed ? 'passed' : 'failed',
        values: valueResults,
      });
    }

    return {
      total: results.length,
      passed: results.filter(result => result.status === 'passed').length,
      failed: results.filter(result => result.status === 'failed').length,
      tests: results,
    };
  }

  private evaluateValues(testCase: any, metaClass: MetaClass, metamodel: Metamodel): TestValueResult[] {
    const testValues = Array.isArray(testCase.testValues) ? testCase.testValues as TestValue[] : [];
    if (testCase.type === 'constraint') {
      throw new ApiError(
        400,
        `Constraint test ${testCase.name} requires a sandboxed server OCL/JavaScript runtime, which is not supported by the headless subset`
      );
    }
    return testValues.map(testValue => {
      let valid = false;
      if (testCase.type === 'attribute') {
        const attribute = metaClass.attributes.find(candidate => (
          candidate.name === testCase.targetProperty || candidate.id === testCase.targetProperty
        ));
        if (!attribute) throw new ApiError(409, `Test ${testCase.name} targets an unknown attribute`);
        valid = valueMatchesAttribute(testValue.value, attribute);
      } else if (testCase.type === 'reference' || testCase.type === 'reference_attribute') {
        const reference = metaClass.references.find(candidate => (
          candidate.name === testCase.targetProperty || candidate.id === testCase.targetProperty
        ));
        if (!reference) throw new ApiError(409, `Test ${testCase.name} targets an unknown reference`);
        valid = referenceValueValidity(testValue.value, reference, metamodel);
      } else {
        throw new ApiError(400, `Unsupported test type ${testCase.type}`);
      }
      const passed = valid === testValue.expected;
      return {
        ...testValue,
        result: valid,
        passed,
        ...(!passed && {
          errorMessage: `Expected ${testValue.expected ? 'valid' : 'invalid'} but got ${valid ? 'valid' : 'invalid'}`,
        }),
      };
    });
  }
}

export const testExecutionEngine = new TestExecutionEngine();
