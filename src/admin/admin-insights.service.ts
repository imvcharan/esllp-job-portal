import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuditLog } from "../audit/audit-log.entity";
import { EmployerInterview } from "../employers/employer-interview.entity";
import { EmployerOrganizationMember } from "../employers/organization-member.entity";
import { EmployerOrganization } from "../employers/organization.entity";
import { EmployerSubscriptionPayment } from "../employers/employer-subscription-payment.entity";
import { Job } from "../jobs/job.entity";
import { CandidateApplication } from "../users/candidate-application.entity";
import { CandidateApplicationStatus } from "../users/candidate-application-status.entity";
import { CandidatePremiumOrder } from "../users/candidate-premium-order.entity";
import { User, UserRole } from "../users/user.entity";
import { PlatformConfigurationService } from "../platform-config/platform-configuration.service";

@Injectable()
export class AdminInsightsService {
  constructor(
    @InjectRepository(Job)
    private readonly jobs: Repository<Job>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(CandidateApplication)
    private readonly applications: Repository<CandidateApplication>,
    @InjectRepository(CandidateApplicationStatus)
    private readonly applicationStatuses: Repository<CandidateApplicationStatus>,
    @InjectRepository(EmployerInterview)
    private readonly interviews: Repository<EmployerInterview>,
    @InjectRepository(EmployerOrganization)
    private readonly organizations: Repository<EmployerOrganization>,
    @InjectRepository(EmployerOrganizationMember)
    private readonly memberships: Repository<EmployerOrganizationMember>,
    @InjectRepository(AuditLog)
    private readonly auditLogs: Repository<AuditLog>,
    @InjectRepository(EmployerSubscriptionPayment)
    private readonly employerPayments: Repository<EmployerSubscriptionPayment>,
    @InjectRepository(CandidatePremiumOrder)
    private readonly candidatePayments: Repository<CandidatePremiumOrder>,
    private readonly platformConfiguration: PlatformConfigurationService,
  ) {}

  async overview() {
    const [
      activeJobs,
      totalJobs,
      totalUsers,
      candidates,
      employers,
      totalApplications,
      scheduledInterviews,
      organizations,
      applicationsByStatus,
      applicationsBySource,
      weeklyApplications,
      topJobs,
      applicationsByJob,
      hiringMetrics,
      configuration,
    ] = await Promise.all([
      this.jobs.countBy({ isActive: true }),
      this.jobs.count(),
      this.users.count(),
      this.users.countBy({ role: UserRole.CANDIDATE }),
      this.users.countBy({ role: UserRole.EMPLOYER }),
      this.applications.count(),
      this.interviews.countBy({ status: "scheduled" }),
      this.organizations.count(),
      this.applications
        .createQueryBuilder("application")
        .select("application.status", "status")
        .addSelect("COUNT(*)", "count")
        .groupBy("application.status")
        .getRawMany<{ status: string; count: string }>(),
      this.applications
        .createQueryBuilder("application")
        .select(
          "COALESCE(application.source_attribution ->> 'source', 'unattributed')",
          "source",
        )
        .addSelect(
          "COALESCE(application.source_attribution ->> 'medium', 'unspecified')",
          "medium",
        )
        .addSelect(
          "COALESCE(application.source_attribution ->> 'campaign', '')",
          "campaign",
        )
        .addSelect("COUNT(*)", "applicationCount")
        .addSelect(
          "COUNT(*) FILTER (WHERE application.status = 'hired')",
          "hireCount",
        )
        .groupBy("source")
        .addGroupBy("medium")
        .addGroupBy("campaign")
        .orderBy("COUNT(*)", "DESC")
        .limit(30)
        .getRawMany<{
          source: string;
          medium: string;
          campaign: string;
          applicationCount: string;
          hireCount: string;
        }>(),
      this.applications
        .createQueryBuilder("application")
        .select("date_trunc('week', application.createdAt)", "week")
        .addSelect("COUNT(*)", "count")
        .where(
          "application.createdAt >= date_trunc('week', now()) - INTERVAL '7 weeks'",
        )
        .groupBy("week")
        .orderBy("week", "ASC")
        .getRawMany<{ week: Date | string; count: string }>(),
      this.applications
        .createQueryBuilder("application")
        .innerJoin("application.job", "job")
        .select("job.id", "id")
        .addSelect("job.title", "title")
        .addSelect("job.company", "company")
        .addSelect("job.location", "location")
        .addSelect("job.isActive", "isActive")
        .addSelect("COUNT(application.id)", "applicationCount")
        .groupBy("job.id")
        .orderBy("COUNT(application.id)", "DESC")
        .addOrderBy("job.createdAt", "DESC")
        .limit(5)
        .getRawMany<{
          id: number;
          title: string;
          company: string;
          location: string;
          isActive: boolean;
          applicationCount: string;
        }>(),
      this.applications
        .createQueryBuilder("application")
        .select("application.jobId", "jobId")
        .addSelect("COUNT(*)", "count")
        .groupBy("application.jobId")
        .getRawMany<{ jobId: number; count: string }>(),
      this.hiringMetrics(),
      this.platformConfiguration.get(),
    ]);

    const [candidateDelta, employerDelta] = await Promise.all([
      this.users.countBy({ role: UserRole.CANDIDATE, isActive: true }),
      this.users.countBy({ role: UserRole.EMPLOYER, isActive: true }),
    ]);

    return {
      metrics: {
        activeJobs,
        totalJobs,
        totalUsers,
        candidates,
        activeCandidates: candidateDelta,
        employers,
        activeEmployers: employerDelta,
        totalApplications,
        scheduledInterviews,
        organizations,
      },
      applicationsByStatus: applicationsByStatus.map((row) => ({
        status: row.status,
        count: Number(row.count),
      })),
      applicationsBySource: applicationsBySource.map((row) => {
        const applicationCount = Number(row.applicationCount);
        const hireCount = Number(row.hireCount);
        return {
          source: row.source,
          medium: row.medium,
          campaign: row.campaign || null,
          applicationCount,
          hireCount,
          hireConversionRate:
            applicationCount > 0
              ? Number(((hireCount / applicationCount) * 100).toFixed(1))
              : 0,
        };
      }),
      applicationStages: configuration.applicationStages,
      reportDefinitions: configuration.reportDefinitions,
      weeklyApplications: weeklyApplications.map((row) => ({
        week: new Date(row.week).toISOString(),
        count: Number(row.count),
      })),
      topJobs: topJobs.map((job) => ({
        ...job,
        id: Number(job.id),
        applicationCount: Number(job.applicationCount),
      })),
      applicationsByJob: applicationsByJob.map((row) => ({
        jobId: Number(row.jobId),
        count: Number(row.count),
      })),
      hiringMetrics,
    };
  }

  async hiringMetrics() {
    const [acceptance, hires] = await Promise.all([
      this.applicationStatuses
        .createQueryBuilder("history")
        .innerJoin("history.application", "application")
        .select("COUNT(DISTINCT history.applicationId)::text", "acceptedOffers")
        .addSelect(
          "COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (history.createdAt - application.createdAt)) / 86400), 2), 0)::text",
          "averageDaysToAcceptance",
        )
        .where("history.toStatus = 'offer_accepted'")
        .andWhere("history.fromStatus = 'offer'")
        .andWhere("history.createdAt >= application.createdAt")
        .getRawOne<{
          acceptedOffers?: string;
          averageDaysToAcceptance?: string;
        }>(),
      this.applicationStatuses
        .createQueryBuilder("history")
        .innerJoin("history.application", "application")
        .select("COUNT(DISTINCT history.applicationId)::text", "hires")
        .addSelect(
          "COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (history.createdAt - application.createdAt)) / 86400), 2), 0)::text",
          "averageDaysToHire",
        )
        .where("history.toStatus = 'hired'")
        .andWhere("history.fromStatus = 'offer_accepted'")
        .andWhere("history.createdAt >= application.createdAt")
        .getRawOne<{
          hires?: string;
          averageDaysToHire?: string;
        }>(),
    ]);
    return {
      acceptedOffers: Number(acceptance?.acceptedOffers ?? 0),
      averageDaysToAcceptance: Number(
        acceptance?.averageDaysToAcceptance ?? 0,
      ),
      hires: Number(hires?.hires ?? 0),
      averageDaysToHire: Number(hires?.averageDaysToHire ?? 0),
    };
  }

  async companies() {
    const [organizations, jobCounts, memberCounts] = await Promise.all([
      this.organizations.find({ order: { createdAt: "DESC" } }),
      this.jobs
        .createQueryBuilder("job")
        .select("job.organizationId", "organizationId")
        .addSelect("COUNT(*)", "jobs")
        .addSelect("COUNT(*) FILTER (WHERE job.isActive = true)", "activeJobs")
        .where("job.organizationId IS NOT NULL")
        .groupBy("job.organizationId")
        .getRawMany<{
          organizationId: number;
          jobs: string;
          activeJobs: string;
        }>(),
      this.memberships
        .createQueryBuilder("member")
        .select("member.organizationId", "organizationId")
        .addSelect("COUNT(*) FILTER (WHERE member.status = 'active')", "active")
        .addSelect(
          "COUNT(*) FILTER (WHERE member.status = 'invited')",
          "invited",
        )
        .groupBy("member.organizationId")
        .getRawMany<{
          organizationId: number;
          active: string;
          invited: string;
        }>(),
    ]);
    const jobsByOrganization = new Map(
      jobCounts.map((row) => [Number(row.organizationId), row]),
    );
    const membersByOrganization = new Map(
      memberCounts.map((row) => [Number(row.organizationId), row]),
    );
    return organizations.map((organization) => {
      const jobs = jobsByOrganization.get(organization.id);
      const members = membersByOrganization.get(organization.id);
      return {
        id: organization.id,
        name: organization.name,
        website: organization.website,
        industry: organization.industry,
        companySize: organization.companySize,
        planKey: organization.planKey,
        subscriptionStatus: organization.subscriptionStatus,
        createdAt: organization.createdAt,
        jobs: Number(jobs?.jobs ?? 0),
        activeJobs: Number(jobs?.activeJobs ?? 0),
        activeMembers: Number(members?.active ?? 0),
        invitedMembers: Number(members?.invited ?? 0),
      };
    });
  }

  async activity() {
    const rows = await this.auditLogs.find({
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        createdAt: true,
      },
      order: { createdAt: "DESC", id: "DESC" },
      take: 20,
    });
    return rows.map(({ id, action, targetType, targetId, createdAt }) => ({
      id,
      action,
      targetType,
      targetId,
      createdAt,
    }));
  }

  async employerSubscriptionRevenue() {
    const monthExpression =
      "to_char(date_trunc('month', payment.paidAt AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM')";
    const totalsQuery = this.employerPayments
      .createQueryBuilder("payment")
      .select("payment.currency", "currency")
      .addSelect("COUNT(*)::text", "paidOrders")
      .addSelect(
        "ROUND(COALESCE(SUM(payment.amountPaise), 0)::numeric / 100, 2)::text",
        "grossAmount",
      )
      .groupBy("payment.currency")
      .orderBy("payment.currency", "ASC");
    const monthlyQuery = this.employerPayments
      .createQueryBuilder("payment")
      .select("payment.currency", "currency")
      .addSelect(monthExpression, "month")
      .addSelect("COUNT(*)::text", "paidOrders")
      .addSelect(
        "ROUND(COALESCE(SUM(payment.amountPaise), 0)::numeric / 100, 2)::text",
        "grossAmount",
      )
      .where(
        "payment.paidAt >= ((date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') - INTERVAL '11 months') AT TIME ZONE 'Asia/Kolkata')",
      )
      .groupBy("payment.currency")
      .addGroupBy(monthExpression)
      .orderBy(monthExpression, "ASC")
      .addOrderBy("payment.currency", "ASC");
    const planQuery = this.employerPayments
      .createQueryBuilder("payment")
      .select("payment.planKey", "planKey")
      .addSelect("payment.currency", "currency")
      .addSelect("COUNT(*)::text", "paidOrders")
      .addSelect(
        "ROUND(COALESCE(SUM(payment.amountPaise), 0)::numeric / 100, 2)::text",
        "grossAmount",
      )
      .groupBy("payment.planKey")
      .addGroupBy("payment.currency")
      .orderBy("payment.planKey", "ASC")
      .addOrderBy("payment.currency", "ASC");
    const [totalsByCurrency, monthly, byPlan] = await Promise.all([
      totalsQuery.getRawMany<{
        currency: string;
        paidOrders: string;
        grossAmount: string;
      }>(),
      monthlyQuery.getRawMany<{
        currency: string;
        month: string;
        paidOrders: string;
        grossAmount: string;
      }>(),
      planQuery.getRawMany<{
        planKey: string | null;
        currency: string;
        paidOrders: string;
        grossAmount: string;
      }>(),
    ]);
    return {
      scope: "employer_subscription_charges",
      totalsByCurrency,
      monthly,
      byPlan,
    };
  }

  async paymentReconciliation() {
    const [candidateOrders, employerPayments] = await Promise.all([
      this.candidatePayments.find({
        where: { paymentStatus: "paid" },
        order: { paidAt: "DESC", createdAt: "DESC" },
        take: 500,
      }),
      this.employerPayments.find({
        order: { paidAt: "DESC", id: "DESC" },
        take: 500,
      }),
    ]);
    const candidateItems = candidateOrders.map((order) => ({
      source: "candidate_service" as const,
      gatewayPaymentId: order.razorpayPaymentId,
      gatewayReferenceId: order.razorpayOrderId,
      invoiceId: null,
      amount: paiseToAmount(String(order.amountPaise)),
      currency: order.currency,
      status: order.razorpayPaymentId ? "captured" : "missing_payment_id",
      paidAt: order.paidAt?.toISOString() ?? null,
    }));
    const employerItems = employerPayments.map((payment) => ({
      source: "employer_subscription" as const,
      gatewayPaymentId: payment.razorpayPaymentId,
      gatewayReferenceId: payment.subscriptionId,
      invoiceId: payment.invoiceId,
      amount: paiseToAmount(payment.amountPaise),
      currency: payment.currency,
      status: "captured",
      paidAt: payment.paidAt.toISOString(),
    }));
    const items = [...candidateItems, ...employerItems]
      .sort((left, right) =>
        (right.paidAt ?? "").localeCompare(left.paidAt ?? ""),
      )
      .slice(0, 500);
    return { items, limit: 500 };
  }
}

function paiseToAmount(paise: string): string {
  const amount = BigInt(paise);
  const whole = amount / 100n;
  const fraction = String(amount % 100n).padStart(2, "0");
  return `${whole}.${fraction}`;
}
