export const JOB_SALARY_CURRENCIES = [
  "INR",
  "USD",
  "GBP",
  "EUR",
  "AED",
  "CAD",
  "AUD",
  "SGD",
] as const;

export const JOB_SALARY_PERIODS = [
  "year",
  "month",
  "week",
  "day",
  "hour",
] as const;

export type JobSalaryCurrency = (typeof JOB_SALARY_CURRENCIES)[number];
export type JobSalaryPeriod = (typeof JOB_SALARY_PERIODS)[number];

export const MIN_JOB_DESCRIPTION_LENGTH = 100;

export function jobPublicationError(job: {
  title?: string | null;
  location?: string | null;
  description?: string | null;
}): string | null {
  if (!job.title?.trim() || !job.location?.trim()) {
    return "Add a job title and location before publishing.";
  }
  if ((job.description ?? "").trim().length < MIN_JOB_DESCRIPTION_LENGTH) {
    return `Add a job description of at least ${MIN_JOB_DESCRIPTION_LENGTH} characters before publishing.`;
  }
  return null;
}

export function currentJobDeadlineDate(): string {
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .filter((part) => part.type !== "literal")
    .reduce<Record<string, string>>((parts, part) => {
      parts[part.type] = part.value;
      return parts;
    }, {});

  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}
