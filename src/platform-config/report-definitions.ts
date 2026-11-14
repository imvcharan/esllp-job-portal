export const CONFIGURABLE_REPORT_KEYS = [
  "applications_by_week",
  "application_stages",
  "applications_by_source",
  "hiring_outcomes",
] as const;

export type ConfigurableReportKey = (typeof CONFIGURABLE_REPORT_KEYS)[number];

export interface ConfigurableReportDefinition {
  key: ConfigurableReportKey;
  label: string;
  enabled: boolean;
}

export const DEFAULT_REPORT_DEFINITIONS: ConfigurableReportDefinition[] = [
  {
    key: "applications_by_week",
    label: "Applications by week",
    enabled: true,
  },
  {
    key: "application_stages",
    label: "Application stages",
    enabled: true,
  },
  {
    key: "applications_by_source",
    label: "Applications by source",
    enabled: true,
  },
  {
    key: "hiring_outcomes",
    label: "Hiring outcomes",
    enabled: true,
  },
];
