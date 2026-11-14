export interface ApplicationWorkflowStage {
  key: string;
  label: string;
  transitions: string[];
}

export const DEFAULT_APPLICATION_STAGES: ApplicationWorkflowStage[] = [
  {
    key: "submitted",
    label: "Submitted",
    transitions: ["in_review", "interview", "rejected"],
  },
  {
    key: "in_review",
    label: "In review",
    transitions: ["interview", "rejected"],
  },
  { key: "interview", label: "Interview", transitions: ["rejected"] },
  { key: "rejected", label: "Rejected", transitions: [] },
];
