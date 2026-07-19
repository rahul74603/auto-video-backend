/**
 * Tests for validating GitHub Actions workflow files exist and have correct syntax.
 * This ensures that CI/CD pipelines remain intact after changes.
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

// Helper to check if a string looks like valid YAML
function isValidYaml(content) {
  try {
    yaml.load(content);
    return true;
  } catch {
    return false;
  }
}

function getWorkflowFiles() {
  const dir = path.resolve(__dirname, "../../.github/workflows");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .sort();
}

describe("GitHub Actions Workflows", () => {
  const workflowsDir = path.resolve(__dirname, "../../.github/workflows");
  let workflowFiles;

  beforeAll(() => {
    workflowFiles = getWorkflowFiles();
  });

  test("workflow directory exists", () => {
    expect(fs.existsSync(workflowsDir)).toBe(true);
  });

  test("at least one workflow file exists", () => {
    expect(workflowFiles.length).toBeGreaterThan(0);
  });

  describe("syntax and structure validation", () => {
    const files = getWorkflowFiles();

    test.each(files)("workflow '%s' has valid YAML syntax", (file) => {
      const content = fs.readFileSync(path.join(workflowsDir, file), "utf8");
      expect(isValidYaml(content)).toBe(true);
    });

    test.each(files)(
      "workflow '%s' has required 'name' and 'on' fields",
      (file) => {
        const content = fs.readFileSync(path.join(workflowsDir, file), "utf8");
        const parsed = yaml.load(content);

        expect(parsed).toBeDefined();
        expect(typeof parsed).toBe("object");
        expect(parsed.name).toBeDefined();
        expect(typeof parsed.name).toBe("string");
        expect(parsed.name.length).toBeGreaterThan(0);
        expect(parsed.on).toBeDefined();
      }
    );

    test.each(files)(
      "workflow '%s' has at least one job",
      (file) => {
        const content = fs.readFileSync(path.join(workflowsDir, file), "utf8");
        const parsed = yaml.load(content);

        expect(parsed.jobs).toBeDefined();
        const jobNames = Object.keys(parsed.jobs);
        expect(jobNames.length).toBeGreaterThan(0);
      }
    );

    test.each(files)(
      "workflow '%s' jobs define 'runs-on'",
      (file) => {
        const content = fs.readFileSync(path.join(workflowsDir, file), "utf8");
        const parsed = yaml.load(content);

        for (const [jobName, job] of Object.entries(parsed.jobs)) {
          expect({ job: jobName, runsOn: job["runs-on"] }).toHaveProperty(
            "runsOn"
          );
        }
      }
    );

    test.each(files)(
      "workflow '%s' jobs have at least one step",
      (file) => {
        const content = fs.readFileSync(path.join(workflowsDir, file), "utf8");
        const parsed = yaml.load(content);

        for (const [jobName, job] of Object.entries(parsed.jobs)) {
          expect({ job: jobName, steps: job.steps }).toHaveProperty("steps");
          expect(job.steps.length).toBeGreaterThan(0);
        }
      }
    );
  });
});
