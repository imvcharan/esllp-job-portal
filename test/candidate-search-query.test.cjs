const assert = require("node:assert/strict");
const { test } = require("node:test");
const { BadRequestException } = require("@nestjs/common");
const {
  compileCandidateSearchQuery,
} = require("../dist/employers/candidate-search-query.js");

test("candidate Boolean search compiles terms into parameterized SQL", () => {
  const compiled = compileCandidateSearchQuery(
    'Python AND ("data engineer" OR analyst) NOT junior',
  );
  assert.ok(compiled);
  assert.match(compiled.expression, / AND /);
  assert.match(compiled.expression, / OR /);
  assert.match(compiled.expression, /NOT/);
  assert.doesNotMatch(compiled.expression, /Python|analyst|junior/);
  assert.deepEqual(Object.values(compiled.parameters), [
    "%Python%",
    "%data engineer%",
    "%analyst%",
    "%junior%",
  ]);
});

test("candidate Boolean search treats adjacent terms as AND and escapes wildcards", () => {
  const compiled = compileCandidateSearchQuery("Java data_analyst");
  assert.ok(compiled);
  assert.match(compiled.expression, / AND /);
  assert.deepEqual(Object.values(compiled.parameters), [
    "%Java%",
    "%data\\_analyst%",
  ]);
});

test("candidate Boolean search rejects malformed expressions", () => {
  for (const query of ["AND Python", "Python OR", "(Python AND Java"]) {
    assert.throws(
      () => compileCandidateSearchQuery(query),
      BadRequestException,
    );
  }
  assert.equal(compileCandidateSearchQuery("   "), null);
});
