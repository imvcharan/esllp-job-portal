(function (global) {
  "use strict";

  const MAX_CSV_SIZE = 1_000_000;
  const MAX_JOBS = 50;
  const COLUMNS = [
    "title",
    "location",
    "category",
    "industry",
    "workplaceType",
    "employmentType",
    "salaryMin",
    "salaryMax",
    "salaryCurrency",
    "salaryPeriod",
    "applicationDeadline",
    "numberOfOpenings",
    "experience",
    "skills",
    "description",
  ];

  function parseRows(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    let quoteClosed = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (character === '"') {
          if (text[index + 1] === '"') {
            field += '"';
            index += 1;
          } else {
            quoted = false;
            quoteClosed = true;
          }
        } else {
          field += character;
        }
        continue;
      }

      if (quoteClosed && character !== "," && character !== "\r" && character !== "\n") {
        throw new Error("CSV contains characters after a closing quote.");
      }
      if (character === '"') {
        if (field.length !== 0 || quoteClosed) {
          throw new Error("CSV contains a quote in an unquoted field.");
        }
        quoted = true;
      } else if (character === ",") {
        row.push(field);
        field = "";
        quoteClosed = false;
      } else if (character === "\r" || character === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        quoteClosed = false;
        if (character === "\r" && text[index + 1] === "\n") index += 1;
      } else {
        field += character;
        quoteClosed = false;
      }
    }

    if (quoted) throw new Error("CSV has an unclosed quoted field.");
    if (field.length || row.length || quoteClosed) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function parseEmployerJobCsv(input) {
    if (typeof input !== "string" || input.length > MAX_CSV_SIZE) {
      throw new Error("CSV file must be no larger than 1 MB.");
    }
    const rows = parseRows(input.replace(/^\uFEFF/, "")).filter(
      (row) => row.some((value) => value.trim() !== ""),
    );
    if (!rows.length) throw new Error("CSV file is empty.");

    const headers = rows[0].map((value) => value.trim());
    if (new Set(headers).size !== headers.length) {
      throw new Error("CSV contains duplicate column names.");
    }
    const unknownHeaders = headers.filter((header) => !COLUMNS.includes(header));
    if (unknownHeaders.length) {
      throw new Error(`Unknown CSV column: ${unknownHeaders[0]}.`);
    }
    for (const required of ["title", "location"]) {
      if (!headers.includes(required)) {
        throw new Error(`CSV must include the ${required} column.`);
      }
    }

    const dataRows = rows.slice(1);
    if (!dataRows.length) throw new Error("CSV has no job rows.");
    if (dataRows.length > MAX_JOBS) {
      throw new Error(`Import is limited to ${MAX_JOBS} jobs at a time.`);
    }

    const columnIndexes = new Map(headers.map((header, index) => [header, index]));
    return dataRows.map((values, index) => {
      const rowNumber = index + 2;
      if (values.length !== headers.length) {
        throw new Error(`CSV row ${rowNumber} has the wrong number of columns.`);
      }
      const value = (name) => {
        const column = columnIndexes.get(name);
        return column === undefined ? "" : values[column].trim();
      };
      const job = {};
      const title = value("title");
      const location = value("location");
      if (title.length < 2 || title.length > 160) {
        throw new Error(`CSV row ${rowNumber} needs a title between 2 and 160 characters.`);
      }
      if (location.length < 2 || location.length > 120) {
        throw new Error(`CSV row ${rowNumber} needs a location between 2 and 120 characters.`);
      }
      job.title = title;
      job.location = location;

      for (const name of [
        "workplaceType",
        "employmentType",
        "category",
        "industry",
        "salaryCurrency",
        "salaryPeriod",
        "applicationDeadline",
        "experience",
        "description",
      ]) {
        const cell = value(name);
        if (cell) job[name] = cell;
      }
      const skills = value("skills");
      if (skills) {
        job.skills = skills.split("|").map((skill) => skill.trim());
        if (
          job.skills.length > 30 ||
          job.skills.some((skill) => !skill || skill.length > 60)
        ) {
          throw new Error(`CSV row ${rowNumber} has invalid skills.`);
        }
      }
      for (const name of ["salaryMin", "salaryMax", "numberOfOpenings"]) {
        const cell = value(name);
        if (!cell) continue;
        const number = Number(cell);
        const minimum = name === "numberOfOpenings" ? 1 : 0;
        if (
          !/^\d+$/.test(cell) ||
          !Number.isSafeInteger(number) ||
          number < minimum ||
          number > 2_000_000_000
        ) {
          throw new Error(`CSV row ${rowNumber} has an invalid ${name} value.`);
        }
        job[name] = number;
      }
      return job;
    });
  }

  global.parseEmployerJobCsv = parseEmployerJobCsv;
})(window);
