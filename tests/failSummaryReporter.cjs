class FailSummaryReporter {
  onRunComplete(_, results) {
    const failedTests = [];
    results.testResults.forEach((suite) => {
      // Capture individual test failures
      suite.testResults.forEach((test) => {
        if (test.status === 'failed') {
          const fullName = [...test.ancestorTitles, test.title].join(' > ');
          failedTests.push(fullName);
        }
      });

      // Capture suites that failed before running any tests (e.g. syntax / transform errors)
      if (suite.numFailingTests === 0 && suite.status === 'failed') {
        failedTests.push(`[Suite Error] ${suite.testFilePath}`);
      }
    });

    const failedCount = results.numFailedTests || results.numFailedTestSuites;
    const print = () => {
      if (failedTests.length || failedCount) {
        if (failedTests.length === 0) {
          failedTests.push(`${failedCount} failure(s)`);
        }
        console.log('\n\u274C Test Failures Summary \u274C');
        failedTests.forEach((name, idx) => {
          console.log(`${idx + 1}. ${name}`);
        });
        console.log(`Total failed: ${failedTests.length}\n`);
      } else {
        console.log('\n\u2705 All tests passed\n');
      }
    };

    // Print now (default behavior)
    print();

    // Ensure it is the very last thing in the log (after any async logs)
    process.on('beforeExit', print);
  }
}

module.exports = FailSummaryReporter; 