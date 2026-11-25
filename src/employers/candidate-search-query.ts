import { BadRequestException } from "@nestjs/common";

type SearchNode =
  | { kind: "term"; value: string }
  | { kind: "not"; value: SearchNode }
  | { kind: "and" | "or"; left: SearchNode; right: SearchNode };

type Token = {
  kind: "term" | "and" | "or" | "not" | "left" | "right";
  value: string;
};

export function compileCandidateSearchQuery(query: string) {
  const tokens: Token[] = [];
  const tokenPattern = /\(|\)|"(?:\\.|[^"\\])*"|\b(?:AND|OR|NOT)\b|[^\s()]+/gi;
  for (const match of query.matchAll(tokenPattern)) {
    const raw = match[0];
    if (raw === "(") tokens.push({ kind: "left", value: raw });
    else if (raw === ")") tokens.push({ kind: "right", value: raw });
    else if (/^(AND|OR|NOT)$/i.test(raw))
      tokens.push({ kind: raw.toLowerCase() as Token["kind"], value: raw });
    else if (raw.startsWith('"')) {
      tokens.push({
        kind: "term",
        value: raw.slice(1, -1).replace(/\\(["\\])/g, "$1"),
      });
    } else tokens.push({ kind: "term", value: raw });
  }
  if (!tokens.length) return null;
  if (tokens.filter((token) => token.kind === "term").length > 20)
    throw new BadRequestException("Use no more than 20 search terms.");

  let position = 0;
  const parseExpression = (): SearchNode => {
    let node = parseAnd();
    while (tokens[position]?.kind === "or") {
      position++;
      node = { kind: "or", left: node, right: parseAnd() };
    }
    return node;
  };
  const parseAnd = (): SearchNode => {
    let node = parseUnary();
    while (
      tokens[position]?.kind === "and" ||
      ["term", "not", "left"].includes(tokens[position]?.kind ?? "")
    ) {
      if (tokens[position]?.kind === "and") position++;
      node = { kind: "and", left: node, right: parseUnary() };
    }
    return node;
  };
  const parseUnary = (): SearchNode => {
    if (tokens[position]?.kind === "not") {
      position++;
      return { kind: "not", value: parseUnary() };
    }
    if (tokens[position]?.kind === "left") {
      position++;
      const node = parseExpression();
      if (tokens[position]?.kind !== "right")
        throw new BadRequestException("Close each parenthesized search group.");
      position++;
      return node;
    }
    const token = tokens[position++];
    if (!token || token.kind !== "term" || !token.value.trim())
      throw new BadRequestException("Check the Boolean search expression.");
    return { kind: "term", value: token.value };
  };

  const tree = parseExpression();
  if (position !== tokens.length)
    throw new BadRequestException("Check the Boolean search expression.");

  const parameters: Record<string, string> = {};
  const rankingTerms: string[] = [];
  let parameterIndex = 0;
  const termExpression = (name: string) => `(
      candidate.displayName ILIKE :${name} ESCAPE '\\'
      OR profile.headline ILIKE :${name} ESCAPE '\\'
      OR profile.location ILIKE :${name} ESCAPE '\\'
      OR profile.skills ILIKE :${name} ESCAPE '\\'
      OR profile.summary ILIKE :${name} ESCAPE '\\'
      OR profile.experience::text ILIKE :${name} ESCAPE '\\'
      OR profile.education::text ILIKE :${name} ESCAPE '\\'
      OR profile.certifications::text ILIKE :${name} ESCAPE '\\'
      OR profile.desired_job_titles::text ILIKE :${name} ESCAPE '\\'
      OR (
        profile.allow_recruiter_resume_access = true
        AND EXISTS (
          SELECT 1
          FROM candidate_resume_versions current_resume
          WHERE current_resume.user_id = profile.user_id
            AND current_resume.storage_path = profile.resume_path
            AND current_resume.parsed_text ILIKE :${name} ESCAPE '\\'
        )
      )
    )`;
  const compile = (node: SearchNode, negated = false): string => {
    if (node.kind === "not")
      return `(NOT ${compile(node.value, !negated)})`;
    if (node.kind === "and" || node.kind === "or")
      return `(${compile(node.left, negated)} ${node.kind.toUpperCase()} ${compile(node.right, negated)})`;
    if (node.kind === "term") {
      const name = `candidateSearch${parameterIndex++}`;
      const escaped = node.value
        .trim()
        .slice(0, 100)
        .replace(/[\\%_]/g, "\\$&");
      parameters[name] = `%${escaped}%`;
      if (!negated) rankingTerms.push(name);
      return termExpression(name);
    }
    throw new BadRequestException("Check the Boolean search expression.");
  };
  return {
    expression: compile(tree),
    parameters,
    rankExpression: rankingTerms.length
      ? rankingTerms
          .map((name) => `CASE WHEN ${termExpression(name)} THEN 1 ELSE 0 END`)
          .join(" + ")
      : null,
  };
}
