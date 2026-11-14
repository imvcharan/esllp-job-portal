const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { runInNewContext } = require("node:vm");
const { test } = require("node:test");

const browser = {};
runInNewContext(
  readFileSync("public/employer-job-csv.js", "utf8"),
  { window: browser },
);
const parseEmployerJobCsv = (text) =>
  JSON.parse(JSON.stringify(browser.parseEmployerJobCsv(text)));

test("CSV import parses quoted commas, escaped quotes, and multiline descriptions", () => {
  const jobs = parseEmployerJobCsv(
    'title,location,category,industry,description,salaryMin,numberOfOpenings\r\n' +
      '"Engineer, Senior",Remote,Engineering,Technology,"Build ""great"" things\nwith care",50000,2\r\n',
  );
  assert.deepEqual(jobs, [
    {
      title: "Engineer, Senior",
      location: "Remote",
      category: "Engineering",
      industry: "Technology",
      description: 'Build "great" things\nwith care',
      salaryMin: 50000,
      numberOfOpenings: 2,
    },
  ]);
});

test("CSV import accepts a BOM and ignores blank rows", () => {
  assert.deepEqual(
    parseEmployerJobCsv("\uFEFFtitle,location\n\nDeveloper,Remote\n\n"),
    [{ title: "Developer", location: "Remote" }],
  );
});

test("CSV import parses pipe-separated skills and rejects invalid skill values", () => {
  assert.deepEqual(
    parseEmployerJobCsv(
      "title,location,skills\nDeveloper,Remote,JavaScript| SQL |Communication\n",
    ),
    [
      {
        title: "Developer",
        location: "Remote",
        skills: ["JavaScript", "SQL", "Communication"],
      },
    ],
  );
  assert.throws(
    () => parseEmployerJobCsv("title,location,skills\nDeveloper,Remote,SQL||Java\n"),
    /invalid skills/,
  );
  assert.throws(
    () =>
      parseEmployerJobCsv(
        `title,location,skills\nDeveloper,Remote,${Array(31).fill("Skill").join("|")}\n`,
      ),
    /invalid skills/,
  );
});

test("CSV import rejects missing required columns and unknown columns", () => {
  assert.throws(() => parseEmployerJobCsv("title\nDeveloper\n"), /location/);
  assert.throws(
    () => parseEmployerJobCsv("title,location,salary\nDeveloper,Remote,50\n"),
    /Unknown CSV column/,
  );
});

test("CSV import rejects malformed rows and unsafe numeric values", () => {
  assert.throws(
    () => parseEmployerJobCsv("title,location\nDeveloper,Remote,extra\n"),
    /wrong number of columns/,
  );
  assert.throws(
    () => parseEmployerJobCsv("title,location,salaryMin\nDeveloper,Remote,1.5\n"),
    /invalid salaryMin/,
  );
  assert.throws(
    () => parseEmployerJobCsv("title,location,salaryMin\nDeveloper,Remote,0x10\n"),
    /invalid salaryMin/,
  );
});

test("CSV import enforces the 50-job and 1 MB limits", () => {
  const tooManyJobs = [
    "title,location",
    ...Array.from({ length: 51 }, (_, index) => `Job ${index + 1},Remote`),
  ].join("\n");
  assert.throws(() => parseEmployerJobCsv(tooManyJobs), /limited to 50/);
  assert.throws(() => parseEmployerJobCsv("x".repeat(1_000_001)), /1 MB/);
});

test("CSV import rejects invalid quoting", () => {
  assert.throws(
    () => parseEmployerJobCsv('title,location\nDev"eloper,Remote\n'),
    /quote in an unquoted field/,
  );
  assert.throws(
    () => parseEmployerJobCsv('title,location\n"Developer,Remote\n'),
    /unclosed quoted field/,
  );
});
