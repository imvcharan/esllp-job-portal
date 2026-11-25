import { EmployerOrganization } from "./organization.entity";

export type EmployerPlanLimits = {
  activeJobs: number;
  seats: number;
  resumeCredits: number;
};

type EmployerPlanCatalog = Record<string, EmployerPlanLimits | undefined>;

type EmployerEntitlementConfiguration = {
  billingPolicy(): Promise<{ pastDueGraceDays: number }>;
  employerPlans(): Promise<EmployerPlanCatalog>;
};

export const FREE_EMPLOYER_LIMITS: EmployerPlanLimits = {
  activeJobs: 1,
  seats: 1,
  resumeCredits: 0,
};

export async function employerPlanLimits(
  organization: Pick<
    EmployerOrganization,
    | "planKey"
    | "subscriptionStatus"
    | "subscriptionCurrentPeriodEnd"
    | "subscriptionPlanSnapshot"
  >,
  configuration: EmployerEntitlementConfiguration,
): Promise<EmployerPlanLimits> {
  const paidStatus = ["active", "cancel_pending"].includes(
    organization.subscriptionStatus,
  );
  let withinPastDueGrace = false;
  if (
    organization.subscriptionStatus === "past_due" &&
    organization.subscriptionCurrentPeriodEnd
  ) {
    const { pastDueGraceDays } = await configuration.billingPolicy();
    withinPastDueGrace =
      Date.now() <=
      organization.subscriptionCurrentPeriodEnd.getTime() +
        pastDueGraceDays * 24 * 60 * 60 * 1000;
  }
  const paidPlanActive =
    organization.planKey !== "free" && (paidStatus || withinPastDueGrace);
  if (!paidPlanActive) return FREE_EMPLOYER_LIMITS;
  if (organization.subscriptionPlanSnapshot) {
    return {
      activeJobs: organization.subscriptionPlanSnapshot.activeJobs,
      seats: organization.subscriptionPlanSnapshot.seats,
      resumeCredits: organization.subscriptionPlanSnapshot.resumeCredits,
    };
  }
  const plans = await configuration.employerPlans();
  return plans[organization.planKey] ?? FREE_EMPLOYER_LIMITS;
}
