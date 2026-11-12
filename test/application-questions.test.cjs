const assert = require("node:assert/strict");
const { test } = require("node:test");
const { BadRequestException } = require("@nestjs/common");
const {
  collectApplicationAnswers,
} = require("../dist/users/application-questions.js");
const { EmployersService } = require("../dist/employers/employers.service.js");

const questions = [
  { id: "q1", question: "Why are you interested?", required: true },
  { id: "q2", question: "When can you start?", required: false },
];

test("application answers are normalized and retain their question snapshot", () => {
  assert.deepEqual(
    collectApplicationAnswers(questions, {
      q1: "  I enjoy the work.  ",
      q2: " Next month ",
    }),
    [
      {
        id: "q1",
        question: "Why are you interested?",
        required: true,
        answer: "I enjoy the work.",
      },
      {
        id: "q2",
        question: "When can you start?",
        required: false,
        answer: "Next month",
      },
    ],
  );
});

test("application answers reject missing required, unknown, and oversized values", () => {
  assert.throws(
    () => collectApplicationAnswers(questions, {}),
    BadRequestException,
  );
  assert.throws(
    () => collectApplicationAnswers(questions, { q1: "Ready", extra: "No" }),
    BadRequestException,
  );
  assert.throws(
    () => collectApplicationAnswers(questions, { q1: "a".repeat(2001) }),
    BadRequestException,
  );
});

test("employer job questions must have unique non-empty identifiers and prompts", () => {
  const service = Object.create(EmployersService.prototype);
  assert.deepEqual(
    service.normalizeApplicationQuestions([
      { id: "q1", question: "  Why?  ", required: true },
    ]),
    [{ id: "q1", question: "Why?", required: true }],
  );
  assert.throws(
    () =>
      service.normalizeApplicationQuestions([
        { id: "q1", question: "First", required: true },
        { id: "q1", question: "Second", required: false },
      ]),
    /unique/,
  );
});
