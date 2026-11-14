export interface ResumeExperienceSuggestion {
  title: string;
  company: string;
  period: string;
  startDate: string;
  endDate: string;
  current: boolean;
}

export interface ResumeEducationSuggestion {
  qualification: string;
  institution: string;
  period: string;
  startDate: string;
  endDate: string;
}

export interface ResumeSuggestions {
  skills: string[];
  experience: ResumeExperienceSuggestion[];
  education: ResumeEducationSuggestion[];
}

type ResumeSection = keyof ResumeSuggestions;

const sectionHeadings: Array<[ResumeSection, RegExp]> = [
  ["skills", /^(?:technical\s+)?skills(?:\s*(?:&|and)\s*competencies)?$/i],
  [
    "experience",
    /^(?:(?:professional|work|employment)\s+)?experience(?:\s+history)?$/i,
  ],
  ["education", /^(?:education|academic background|qualifications?)$/i],
];

const otherHeadings =
  /^(?:summary|profile|objective|certifications?|projects?|languages?|awards?|references?|interests?|volunteer(?:ing)?|publications?)$/i;

const monthNames: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

const dateToken =
  "(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\s+)?(?:19|20)\\d{2}(?:[-/]\\d{1,2})?";
const dateRangePattern = new RegExp(
  `(${dateToken})\\s*(?:to|[-–—])\\s*(present|current|${dateToken})`,
  "i",
);
const qualificationPattern =
  /\b(?:b\.?\s?tech|m\.?\s?tech|b\.?\s?e\.?|m\.?\s?e\.?|b\.?\s?sc|m\.?\s?sc|b\.?\s?com|m\.?\s?com|b\.?\s?ca|m\.?\s?ca|bachelor|master|mba|ph\.?d|doctorate|diploma|associate|high school|10th|12th)\b/i;

function cleanLine(value: string): string {
  return value
    .replace(/^\s*(?:[•●▪◦‣*]|\-)\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readSections(text: string): Record<ResumeSection, string[]> {
  const sections: Record<ResumeSection, string[]> = {
    skills: [],
    experience: [],
    education: [],
  };
  let active: ResumeSection | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = cleanLine(rawLine);
    if (!line) continue;
    const heading = sectionHeadings.find(([, pattern]) =>
      pattern.test(line.replace(/:$/, "").trim()),
    );
    if (heading) {
      active = heading[0];
      continue;
    }
    if (
      otherHeadings.test(line.replace(/:$/, "").trim()) ||
      /^[A-Z][A-Z\s&/]{2,40}$/.test(line)
    ) {
      active = null;
      continue;
    }
    if (active) sections[active].push(line);
  }
  return sections;
}

function normalizeDate(value: string): string {
  const normalized = value.trim().replace(/,/g, "");
  const yearMonth = normalized.match(/^((?:19|20)\d{2})[-/](\d{1,2})$/);
  if (yearMonth) {
    const month = Number(yearMonth[2]);
    return month >= 1 && month <= 12
      ? `${yearMonth[1]}-${String(month).padStart(2, "0")}`
      : "";
  }
  const monthYear = normalized.match(/^([A-Za-z]+)\s+((?:19|20)\d{2})$/);
  if (!monthYear) return "";
  const month = monthNames[monthYear[1].toLowerCase()];
  return month ? `${monthYear[2]}-${month}` : "";
}

function findDateRange(value: string) {
  const match = dateRangePattern.exec(value);
  if (!match) return null;
  const current = /^(?:present|current)$/i.test(match[2]);
  return {
    period: match[0].replace(/\s+/g, " ").trim(),
    startDate: normalizeDate(match[1]),
    endDate: current ? "" : normalizeDate(match[2]),
    current,
    header: value
      .replace(match[0], "")
      .replace(/[\s|,–—-]+$/, "")
      .trim(),
  };
}

function splitTitleAndOrganization(value: string) {
  const parts = value
    .split(/\s+(?:at|@)\s+|\s*[|•—–-]\s*|\s*,\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  return {
    first: parts[0].slice(0, 160),
    second: parts.slice(1).join(" - ").slice(0, 160),
  };
}

function datedLines(lines: string[]) {
  const entries: Array<{
    header: string;
    date: NonNullable<ReturnType<typeof findDateRange>>;
  }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const date = findDateRange(lines[index]);
    if (date) {
      const header = date.header || lines[index - 1] || "";
      if (header) entries.push({ header, date });
      continue;
    }
    const followingDate = lines[index + 1]
      ? findDateRange(lines[index + 1])
      : null;
    if (followingDate) {
      entries.push({ header: lines[index], date: followingDate });
      index += 1;
    }
  }
  return entries;
}

function extractSkills(lines: string[]): string[] {
  const values = lines
    .flatMap((line) => line.split(/[,;|•·]/))
    .map(cleanLine)
    .filter((value) => value.length >= 2 && value.length <= 60);
  const seen = new Set<string>();
  return values
    .filter((value) => {
      const key = value.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 30);
}

function extractExperience(lines: string[]): ResumeExperienceSuggestion[] {
  const suggestions: ResumeExperienceSuggestion[] = [];
  for (const { header, date } of datedLines(lines)) {
    const role = splitTitleAndOrganization(date.header || header);
    if (!role) continue;
    suggestions.push({
      title: role.first.slice(0, 120),
      company: role.second.slice(0, 120),
      period: date.period,
      startDate: date.startDate,
      endDate: date.endDate,
      current: date.current,
    });
  }
  return suggestions.slice(0, 20);
}

function extractEducation(lines: string[]): ResumeEducationSuggestion[] {
  const suggestions: ResumeEducationSuggestion[] = [];
  const entries = datedLines(lines);
  const candidates =
    entries.length > 0
      ? entries.map(({ header, date }) => ({
          header: date.header || header,
          date,
        }))
      : lines.map((header) => ({ header, date: null }));

  for (const { header, date } of candidates) {
    let pair = splitTitleAndOrganization(header);
    if (!pair) {
      const index = lines.indexOf(header);
      const nextLine = lines[index + 1];
      if (qualificationPattern.test(header) && nextLine) {
        pair = { first: header, second: nextLine };
      }
    }
    if (!pair || !qualificationPattern.test(pair.first)) continue;
    suggestions.push({
      qualification: pair.first.slice(0, 120),
      institution: pair.second.slice(0, 160),
      period: date?.period ?? "",
      startDate: date?.startDate ?? "",
      endDate: date?.endDate ?? "",
    });
  }
  return suggestions.slice(0, 20);
}

export function extractResumeSuggestions(text: string): ResumeSuggestions {
  const sections = readSections(text.slice(0, 100_000));
  return {
    skills: extractSkills(sections.skills),
    experience: extractExperience(sections.experience),
    education: extractEducation(sections.education),
  };
}
