import runOCLTests from './test-ocl';

/**
 * Simple script to run the OCL tests
 */
console.log('Starting OCL validation tests...');
console.log('===============================');

// Run the tests
runOCLTests()
  .then(() => {
    console.log('Tests completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Tests failed with error:', error);
    process.exit(1);
  }); 