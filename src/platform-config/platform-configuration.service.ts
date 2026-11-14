import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { CandidateApplication } from "../users/candidate-application.entity";
import {
  ApplicationWorkflowStage,
  DEFAULT_APPLICATION_STAGES,
} from "./default-application-stages";
import {
  DEFAULT_JOB_TAXONOMIES,
  JobTaxonomyKey,
} from "./default-job-taxonomies";
import { PlatformConfiguration } from "./platform-configuration.entity";
import {
  CONFIGURABLE_REPORT_KEYS,
  ConfigurableReportDefinition,
  DEFAULT_REPORT_DEFINITIONS,
} from "./report-definitions";

export const DEFAULT_PLATFORM_CONFIGURATION = {
  candidateRegistrationEnabled: true,
  employerRegistrationEnabled: true,
  employerApprovalRequired: true,
  jobApprovalRequired: true,
  ...DEFAULT_JOB_TAXONOMIES,
  applicationStages: DEFAULT_APPLICATION_STAGES,
  reportDefinitions: DEFAULT_REPORT_DEFINITIONS,
};

const REQUIRED_APPLICATION_STAGES = [
  "submitted",
  "in_review",
  "interview",
  "rejected",
];

@Injectable()
export class PlatformConfigurationService {
  constructor(
    @InjectRepository(PlatformConfiguration)
    private readonly configurations: Repository<PlatformConfiguration>,
    private readonly audit: AuditService,
    @InjectRepository(CandidateApplication)
    private readonly applications: Repository<CandidateApplication>,
  ) {}

  async get() {
    const configuration = await this.configurations.findOneBy({ id: 1 });
    return {
      ...DEFAULT_PLATFORM_CONFIGURATION,
      ...configuration,
      applicationStages: configuration?.applicationStages?.length
        ? configuration.applicationStages
        : DEFAULT_APPLICATION_STAGES,
      reportDefinitions:
        configuration?.reportDefinitions ?? DEFAULT_REPORT_DEFINITIONS,
      customized: configuration?.customized ?? false,
      updatedAt: configuration?.updatedAt ?? null,
    };
  }

  async assertRegistrationEnabled(accountType: "candidate" | "employer") {
    const configuration = await this.get();
    const enabled =
      accountType === "candidate"
        ? configuration.candidateRegistrationEnabled
        : configuration.employerRegistrationEnabled;
    if (!enabled)
      throw new ForbiddenException(
        `${accountType === "candidate" ? "Candidate" : "Employer"} registration is currently unavailable.`,
      );
  }

  async assertTaxonomyValue(
    key: Exclude<JobTaxonomyKey, "locations">,
    value: string | null | undefined,
  ) {
    if (!value?.trim()) return;
    const configuration = await this.get();
    if (!configuration[key].includes(value.trim()))
      throw new BadRequestException(`Choose a configured ${key}.`);
  }

  async jobOptions() {
    const configuration = await this.get();
    return {
      categories: configuration.jobCategories,
      industries: configuration.industries,
      locations: configuration.locations,
      employmentTypes: configuration.employmentTypes,
      workplaceTypes: configuration.workplaceTypes,
      applicationStages: configuration.applicationStages,
    };
  }

  async update(
    values: Partial<
      Pick<
        PlatformConfiguration,
        | "candidateRegistrationEnabled"
        | "employerRegistrationEnabled"
        | "employerApprovalRequired"
        | "jobApprovalRequired"
        | "applicationStages"
        | "reportDefinitions"
        | JobTaxonomyKey
      >
    >,
    reason: string,
    actor: AuthenticatedUser,
  ) {
    const current = await this.configurations.findOneBy({ id: 1 });
    const configuration =
      current ??
      this.configurations.create({
        id: 1,
        ...DEFAULT_PLATFORM_CONFIGURATION,
      });
    const previous = {
      candidateRegistrationEnabled: configuration.candidateRegistrationEnabled,
      employerRegistrationEnabled: configuration.employerRegistrationEnabled,
      employerApprovalRequired: configuration.employerApprovalRequired,
      jobApprovalRequired: configuration.jobApprovalRequired,
      jobCategories: configuration.jobCategories,
      industries: configuration.industries,
      locations: configuration.locations,
      employmentTypes: configuration.employmentTypes,
      workplaceTypes: configuration.workplaceTypes,
      applicationStages: configuration.applicationStages,
      reportDefinitions: configuration.reportDefinitions,
    };
    if (values.candidateRegistrationEnabled !== undefined)
      configuration.candidateRegistrationEnabled =
        values.candidateRegistrationEnabled;
    if (values.employerRegistrationEnabled !== undefined)
      configuration.employerRegistrationEnabled =
        values.employerRegistrationEnabled;
    if (values.employerApprovalRequired !== undefined)
      configuration.employerApprovalRequired = values.employerApprovalRequired;
    if (values.jobApprovalRequired !== undefined)
      configuration.jobApprovalRequired = values.jobApprovalRequired;
    const taxonomies = this.normalizeTaxonomies(values);
    for (const key of Object.keys(DEFAULT_JOB_TAXONOMIES) as JobTaxonomyKey[]) {
      if (taxonomies[key] !== undefined)
        configuration[key] = taxonomies[key] as string[];
    }
    if (values.applicationStages !== undefined) {
      const applicationStages = this.normalizeApplicationStages(
        values.applicationStages,
      );
      const nextKeys = new Set(applicationStages.map((stage) => stage.key));
      const removedKeys = (configuration.applicationStages ?? [])
        .map((stage) => stage.key)
        .filter((key) => !nextKeys.has(key));
      if (removedKeys.length) {
        const inUse = await this.applications.count({
          where: [
            { status: In(removedKeys) },
            { withdrawalRequestedFromStatus: In(removedKeys) },
          ],
        });
        if (inUse > 0) {
          throw new BadRequestException(
            "A stage cannot be removed while applications are currently in it.",
          );
        }
      }
      configuration.applicationStages = applicationStages;
    }
    if (values.reportDefinitions !== undefined) {
      configuration.reportDefinitions = this.normalizeReportDefinitions(
        values.reportDefinitions,
      );
    }
    configuration.customized = true;
    await this.configurations.save(configuration);
    await this.audit.record({
      actorUserId: actor.id,
      action: "admin.platform_configuration_updated",
      targetType: "platform_configuration",
      targetId: 1,
      details: {
        reason: reason.trim(),
        candidateRegistrationEnabled:
          configuration.candidateRegistrationEnabled,
        employerRegistrationEnabled: configuration.employerRegistrationEnabled,
        employerApprovalRequired: configuration.employerApprovalRequired,
        jobApprovalRequired: configuration.jobApprovalRequired,
        candidateRegistrationChanged:
          previous.candidateRegistrationEnabled !==
          configuration.candidateRegistrationEnabled,
        employerRegistrationChanged:
          previous.employerRegistrationEnabled !==
          configuration.employerRegistrationEnabled,
        employerApprovalChanged:
          previous.employerApprovalRequired !==
          configuration.employerApprovalRequired,
        jobApprovalChanged:
          previous.jobApprovalRequired !== configuration.jobApprovalRequired,
        applicationStagesChanged:
          JSON.stringify(previous.applicationStages) !==
          JSON.stringify(configuration.applicationStages),
        reportDefinitionsChanged:
          JSON.stringify(previous.reportDefinitions) !==
          JSON.stringify(configuration.reportDefinitions),
        taxonomiesChanged: (
          Object.keys(DEFAULT_JOB_TAXONOMIES) as JobTaxonomyKey[]
        ).some(
          (key) =>
            JSON.stringify(previous[key]) !==
            JSON.stringify(configuration[key]),
        ),
      },
    });
    return this.get();
  }

  async reset(reason: string, actor: AuthenticatedUser) {
    const configuration =
      (await this.configurations.findOneBy({ id: 1 })) ??
      this.configurations.create({
        id: 1,
        ...DEFAULT_PLATFORM_CONFIGURATION,
      });
    Object.assign(configuration, DEFAULT_PLATFORM_CONFIGURATION);
    configuration.customized = false;
    await this.configurations.save(configuration);
    await this.audit.record({
      actorUserId: actor.id,
      action: "admin.platform_configuration_reset",
      targetType: "platform_configuration",
      targetId: 1,
      details: { reason: reason.trim() },
    });
    return this.get();
  }

  private normalizeTaxonomies<
    T extends Partial<Record<JobTaxonomyKey, string[]>>,
  >(values: T): T {
    const normalized = { ...values };
    for (const key of Object.keys(DEFAULT_JOB_TAXONOMIES) as JobTaxonomyKey[]) {
      const entries = normalized[key];
      if (entries === undefined) continue;
      if (!Array.isArray(entries) || entries.length > 100)
        throw new BadRequestException(
          `${key} must contain at most 100 options.`,
        );
      if (
        (key === "employmentTypes" || key === "workplaceTypes") &&
        entries.length === 0
      )
        throw new BadRequestException(
          `${key} must include at least one option.`,
        );
      const result: string[] = [];
      const seen = new Set<string>();
      for (const entry of entries) {
        const value = typeof entry === "string" ? entry.trim() : "";
        if (!value || value.length > 120)
          throw new BadRequestException(
            `${key} options must be 1–120 characters.`,
          );
        const dedupeKey = value.toLocaleLowerCase("en");
        if (seen.has(dedupeKey))
          throw new BadRequestException(
            `${key} cannot contain duplicate options.`,
          );
        seen.add(dedupeKey);
        result.push(value);
      }
      normalized[key] = result;
    }
    return normalized;
  }

  private normalizeApplicationStages(
    stages: ApplicationWorkflowStage[],
  ): ApplicationWorkflowStage[] {
    if (
      !Array.isArray(stages) ||
      stages.length < REQUIRED_APPLICATION_STAGES.length ||
      stages.length > 30
    ) {
      throw new BadRequestException(
        "Application stages must contain the required stages and no more than 30 entries.",
      );
    }
    const seen = new Set<string>();
    const normalized = stages.map((stage) => {
      if (
        !stage ||
        typeof stage.key !== "string" ||
        !/^[a-z][a-z0-9_]{0,19}$/.test(stage.key) ||
        typeof stage.label !== "string" ||
        !stage.label.trim() ||
        stage.label.trim().length > 80 ||
        !Array.isArray(stage.transitions) ||
        stage.transitions.length > 30 ||
        stage.transitions.some(
          (target) =>
            typeof target !== "string" ||
            !/^[a-z][a-z0-9_]{0,19}$/.test(target),
        )
      ) {
        throw new BadRequestException(
          "Each application stage needs a valid key, label, and transition list.",
        );
      }
      if (seen.has(stage.key)) {
        throw new BadRequestException("Application stage keys must be unique.");
      }
      seen.add(stage.key);
      const transitions = [...new Set(stage.transitions)];
      if (transitions.length !== stage.transitions.length) {
        throw new BadRequestException(
          "Application stage transitions cannot contain duplicates.",
        );
      }
      if (transitions.includes(stage.key)) {
        throw new BadRequestException(
          "An application stage cannot transition to itself.",
        );
      }
      if (stage.key === "rejected" && transitions.length) {
        throw new BadRequestException("Rejected must remain a terminal stage.");
      }
      return {
        key: stage.key,
        label: stage.label.trim(),
        transitions,
      };
    });
    for (const required of REQUIRED_APPLICATION_STAGES) {
      if (!seen.has(required)) {
        throw new BadRequestException(
          `The ${required} application stage cannot be removed.`,
        );
      }
    }
    const keys = new Set(normalized.map((stage) => stage.key));
    if (
      normalized.some((stage) =>
        stage.transitions.some((target) => !keys.has(target)),
      )
    ) {
      throw new BadRequestException(
        "Application stage transitions must target configured stages.",
      );
    }
    return normalized;
  }

  private normalizeReportDefinitions(
    definitions: ConfigurableReportDefinition[],
  ): ConfigurableReportDefinition[] {
    if (!Array.isArray(definitions) || definitions.length > 4) {
      throw new BadRequestException(
        "Report definitions must contain no more than four supported reports.",
      );
    }
    const seen = new Set<string>();
    return definitions.map((definition) => {
      if (
        !definition ||
        typeof definition.key !== "string" ||
        !CONFIGURABLE_REPORT_KEYS.some((key) => key === definition.key) ||
        typeof definition.label !== "string" ||
        !definition.label.trim() ||
        definition.label.trim().length > 80 ||
        typeof definition.enabled !== "boolean"
      ) {
        throw new BadRequestException(
          "Each report needs a supported key, label, and enabled setting.",
        );
      }
      if (seen.has(definition.key)) {
        throw new BadRequestException("Report keys must be unique.");
      }
      seen.add(definition.key);
      return {
        key: definition.key,
        label: definition.label.trim(),
        enabled: definition.enabled,
      };
    });
  }
}
