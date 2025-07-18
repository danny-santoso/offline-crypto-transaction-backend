import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';

interface TestResult {
  suite: string;
  passed: number;
  failed: number;
  duration: number;
  coverage?: number;
}

interface PipelineConfig {
  stages: string[];
  parallel: boolean;
  coverage: boolean;
  timeout: number;
}

class TestPipeline {
  private config: PipelineConfig;
  private results: TestResult[] = [];
  private hardhatNode: ChildProcess | null = null;

  constructor(config: PipelineConfig) {
    this.config = config;
  }

  async run(): Promise<boolean> {
    console.log('🚀 Starting automated testing pipeline...');
    
    try {
      // Step 1: Setup test environment
      await this.setupEnvironment();

      // Step 2: Run test stages
      const success = await this.runTestStages();

      // Step 3: Generate reports
      await this.generateReports();

      // Step 4: Cleanup
      await this.cleanup();

      return success;
    } catch (error) {
      console.error('❌ Pipeline failed:', error);
      await this.cleanup();
      return false;
    }
  }

  private async setupEnvironment(): Promise<void> {
    console.log('🔧 Setting up test environment...');

    // Start Hardhat node for integration tests
    console.log('Starting Hardhat node...');
    this.hardhatNode = spawn('npx', ['hardhat', 'node'], {
      cwd: path.join(__dirname, '../blockchain'),
      stdio: 'pipe'
    });

    // Wait for node to start
    await this.waitForHardhatNode();

    // Deploy contracts
    console.log('Deploying contracts...');
    await this.runCommand('npm', ['run', 'deploy:local']);

    // Setup OTM
    console.log('Setting up OTM...');
    await this.runCommand('npm', ['run', 'setup-otm:local']);

    console.log('✅ Environment setup complete');
  }

  private async waitForHardhatNode(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Hardhat node failed to start within timeout'));
      }, 30000);

      if (this.hardhatNode) {
        this.hardhatNode.stdout?.on('data', (data) => {
          const output = data.toString();
          if (output.includes('Started HTTP and WebSocket JSON-RPC server')) {
            clearTimeout(timeout);
            resolve();
          }
        });

        this.hardhatNode.stderr?.on('data', (data) => {
          console.error('Hardhat node error:', data.toString());
        });
      }
    });
  }

  private async runTestStages(): Promise<boolean> {
    console.log('🧪 Running test stages...');

    let allPassed = true;

    for (const stage of this.config.stages) {
      console.log(`\n📋 Running ${stage} tests...`);
      
      const startTime = Date.now();
      const result = await this.runTestStage(stage);
      const duration = Date.now() - startTime;

      this.results.push({
        suite: stage,
        passed: result.passed,
        failed: result.failed,
        duration,
        coverage: result.coverage
      });

      if (result.failed > 0) {
        console.log(`❌ ${stage} tests failed: ${result.failed} failures`);
        allPassed = false;
      } else {
        console.log(`✅ ${stage} tests passed: ${result.passed} tests`);
      }
    }

    return allPassed;
  }

  private async runTestStage(stage: string): Promise<{ passed: number; failed: number; coverage?: number }> {
    const testCommands: Record<string, string[]> = {
      'unit': ['test', '--testPathPattern=src/__tests__/(?!integration)', '--coverage'],
      'integration': ['test', '--testPathPattern=integration', '--runInBand'],
      'deployment': ['test', '--testPathPattern=deployment'],
      'performance': ['test', '--testPathPattern=apiPerformance', '--runInBand'],
      'e2e': ['test', '--testPathPattern=tokenLifecycle', '--runInBand']
    };

    const command = testCommands[stage];
    if (!command) {
      throw new Error(`Unknown test stage: ${stage}`);
    }

    try {
      const output = await this.runCommand('npm', command, { timeout: this.config.timeout });
      return this.parseTestOutput(output);
    } catch (error: any) {
      console.error(`Test stage ${stage} failed:`, error.message);
      return { passed: 0, failed: 1 };
    }
  }

  private parseTestOutput(output: string): { passed: number; failed: number; coverage?: number } {
    // Parse Jest output to extract test results
    const passedMatch = output.match(/(\d+) passed/);
    const failedMatch = output.match(/(\d+) failed/);
    const coverageMatch = output.match(/All files\s+\|\s+([\d.]+)/);

    return {
      passed: passedMatch ? parseInt(passedMatch[1]) : 0,
      failed: failedMatch ? parseInt(failedMatch[1]) : 0,
      coverage: coverageMatch ? parseFloat(coverageMatch[1]) : undefined
    };
  }

  private async generateReports(): Promise<void> {
    console.log('📊 Generating test reports...');

    const report = {
      timestamp: new Date().toISOString(),
      pipeline: this.config,
      results: this.results,
      summary: {
        totalTests: this.results.reduce((sum, r) => sum + r.passed + r.failed, 0),
        totalPassed: this.results.reduce((sum, r) => sum + r.passed, 0),
        totalFailed: this.results.reduce((sum, r) => sum + r.failed, 0),
        totalDuration: this.results.reduce((sum, r) => sum + r.duration, 0),
        averageCoverage: this.calculateAverageCoverage()
      }
    };

    // Save JSON report
    const reportPath = path.join(__dirname, '../test-reports/pipeline-report.json');
    await this.ensureDirectory(path.dirname(reportPath));
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Generate HTML report
    await this.generateHtmlReport(report, path.join(__dirname, '../test-reports/pipeline-report.html'));

    // Generate markdown summary
    await this.generateMarkdownSummary(report, path.join(__dirname, '../test-reports/pipeline-summary.md'));

    console.log('✅ Reports generated in test-reports/');
  }

  private calculateAverageCoverage(): number {
    const coverageResults = this.results.filter(r => r.coverage !== undefined);
    if (coverageResults.length === 0) return 0;
    
    const totalCoverage = coverageResults.reduce((sum, r) => sum + (r.coverage || 0), 0);
    return totalCoverage / coverageResults.length;
  }

  private async generateHtmlReport(report: any, filePath: string): Promise<void> {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Test Pipeline Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .metric { background: #e8f4fd; padding: 15px; border-radius: 5px; text-align: center; }
        .metric.failed { background: #fde8e8; }
        .metric.passed { background: #e8fde8; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background: #f5f5f5; }
        .status-passed { color: #28a745; font-weight: bold; }
        .status-failed { color: #dc3545; font-weight: bold; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Test Pipeline Report</h1>
        <p>Generated: ${report.timestamp}</p>
    </div>

    <div class="summary">
        <div class="metric ${report.summary.totalFailed > 0 ? 'failed' : 'passed'}">
            <h3>Total Tests</h3>
            <p>${report.summary.totalTests}</p>
        </div>
        <div class="metric passed">
            <h3>Passed</h3>
            <p>${report.summary.totalPassed}</p>
        </div>
        <div class="metric failed">
            <h3>Failed</h3>
            <p>${report.summary.totalFailed}</p>
        </div>
        <div class="metric">
            <h3>Duration</h3>
            <p>${(report.summary.totalDuration / 1000).toFixed(2)}s</p>
        </div>
        <div class="metric">
            <h3>Coverage</h3>
            <p>${report.summary.averageCoverage.toFixed(1)}%</p>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>Test Suite</th>
                <th>Status</th>
                <th>Passed</th>
                <th>Failed</th>
                <th>Duration</th>
                <th>Coverage</th>
            </tr>
        </thead>
        <tbody>
            ${report.results.map((result: TestResult) => `
                <tr>
                    <td>${result.suite}</td>
                    <td class="${result.failed > 0 ? 'status-failed' : 'status-passed'}">
                        ${result.failed > 0 ? 'FAILED' : 'PASSED'}
                    </td>
                    <td>${result.passed}</td>
                    <td>${result.failed}</td>
                    <td>${(result.duration / 1000).toFixed(2)}s</td>
                    <td>${result.coverage ? result.coverage.toFixed(1) + '%' : 'N/A'}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>
</body>
</html>`;

    fs.writeFileSync(filePath, html);
  }

  private async generateMarkdownSummary(report: any, filePath: string): Promise<void> {
    const markdown = `# Test Pipeline Summary

**Generated:** ${report.timestamp}

## Summary

- **Total Tests:** ${report.summary.totalTests}
- **Passed:** ${report.summary.totalPassed}
- **Failed:** ${report.summary.totalFailed}
- **Duration:** ${(report.summary.totalDuration / 1000).toFixed(2)}s
- **Average Coverage:** ${report.summary.averageCoverage.toFixed(1)}%

## Results by Suite

| Suite | Status | Passed | Failed | Duration | Coverage |
|-------|--------|--------|--------|----------|----------|
${report.results.map((result: TestResult) => 
  `| ${result.suite} | ${result.failed > 0 ? '❌ FAILED' : '✅ PASSED'} | ${result.passed} | ${result.failed} | ${(result.duration / 1000).toFixed(2)}s | ${result.coverage ? result.coverage.toFixed(1) + '%' : 'N/A'} |`
).join('\n')}

## Pipeline Configuration

- **Stages:** ${report.pipeline.stages.join(', ')}
- **Parallel:** ${report.pipeline.parallel ? 'Yes' : 'No'}
- **Coverage:** ${report.pipeline.coverage ? 'Enabled' : 'Disabled'}
- **Timeout:** ${report.pipeline.timeout / 1000}s
`;

    fs.writeFileSync(filePath, markdown);
  }

  private async runCommand(command: string, args: string[], options: { timeout?: number } = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 60000;
      let output = '';

      const child = spawn(command, args, {
        stdio: 'pipe',
        cwd: __dirname + '/..'
      });

      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.stderr?.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Command failed with code ${code}: ${output}`));
        }
      });
    });
  }

  private async ensureDirectory(dirPath: string): Promise<void> {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up...');

    // Kill Hardhat node
    if (this.hardhatNode) {
      this.hardhatNode.kill();
      this.hardhatNode = null;
    }

    // Kill any remaining processes
    try {
      await this.runCommand('pkill', ['-f', 'hardhat']);
    } catch (error) {
      // Ignore errors during cleanup
    }

    console.log('✅ Cleanup complete');
  }
}

// CLI interface
async function main() {
  const config: PipelineConfig = {
    stages: process.argv.includes('--quick') 
      ? ['unit', 'deployment'] 
      : ['unit', 'integration', 'deployment', 'performance', 'e2e'],
    parallel: process.argv.includes('--parallel'),
    coverage: !process.argv.includes('--no-coverage'),
    timeout: process.argv.includes('--quick') ? 30000 : 120000
  };

  const pipeline = new TestPipeline(config);
  const success = await pipeline.run();

  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main().catch(console.error);
}

export { TestPipeline, PipelineConfig, TestResult };