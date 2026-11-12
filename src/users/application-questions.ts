import { BadRequestException } from "@nestjs/common";

export interface ApplicationQuestion {
  id: string;
  question: string;
  required: boolean;
}

export interface ApplicationAnswer {
  id: string;
  question: string;
  answer: string;
}

export function collectApplicationAnswers(
  questions: ApplicationQuestion[] | null | undefined,
  answers: Record<string, string> | undefined,
): ApplicationAnswer[] {
  const configuredQuestions = questions ?? [];
  const questionIds = new Set<string>();
  for (const question of configuredQuestions) {
    if (
      !question.id ||
      !question.question ||
      typeof question.required !== "boolean" ||
      questionIds.has(question.id)
    )
      throw new Error("Stored job application questions are invalid.");
    questionIds.add(question.id);
  }

  for (const [id, answer] of Object.entries(answers ?? {})) {
    if (!questionIds.has(id))
      throw new BadRequestException(
        "An answer was supplied for an unknown question.",
      );
    if (typeof answer !== "string" || answer.length > 2000)
      throw new BadRequestException(
        "Application answers must be text no longer than 2,000 characters.",
      );
  }

  const collected = configuredQuestions.flatMap((question) => {
    const answer = answers?.[question.id]?.trim() ?? "";
    if (question.required && !answer)
      throw new BadRequestException(
        `Answer the required question: ${question.question}`,
      );
    return answer ? [{ ...question, answer }] : [];
  });
  return collected;
}
