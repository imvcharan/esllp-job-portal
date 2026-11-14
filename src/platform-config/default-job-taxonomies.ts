export const DEFAULT_JOB_TAXONOMIES: Record<
  | "jobCategories"
  | "industries"
  | "locations"
  | "employmentTypes"
  | "workplaceTypes",
  string[]
> = {
  jobCategories: [
    "Accounting",
    "Administration",
    "Customer Service",
    "Design",
    "Education",
    "Engineering",
    "Finance",
    "Healthcare",
    "Human Resources",
    "Information Technology",
    "Legal",
    "Marketing",
    "Operations",
    "Sales",
    "Other",
  ],
  industries: [
    "Education",
    "Finance",
    "Government",
    "Healthcare",
    "Hospitality",
    "Manufacturing",
    "Media",
    "Retail",
    "Technology",
    "Other",
  ],
  locations: [
    "Bengaluru",
    "Chennai",
    "Delhi NCR",
    "Hyderabad",
    "Kolkata",
    "Mumbai",
    "Pune",
    "Remote",
  ],
  employmentTypes: [
    "full-time",
    "part-time",
    "contract",
    "internship",
    "temporary",
  ],
  workplaceTypes: ["onsite", "hybrid", "remote"],
};

export type JobTaxonomyKey = keyof typeof DEFAULT_JOB_TAXONOMIES;
