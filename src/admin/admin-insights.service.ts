import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuditLog } from "../audit/audit-log.entity";
import { EmployerInterview } from "../employers/employer-interview.entity";
import { EmployerOrganizationMember } from "../employers/organization-member.entity";
import { EmployerOrganization } from "../employers/organization.entity";
import { Job } from "../jobs/job.entity";
import { CandidateApplication } from "../users/candidate-application.entity";
import { User, UserRole } from "../users/user.entity";

@Injectable()
export class AdminInsightsService {
  constructor(
    @InjectRepository(Job)
    private readonly jobs: Repository<Job>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(CandidateApplication)
    private readonly applications: Repository<CandidateApplication>,
    @InjectRepository(EmployerInterview)
    private readonly interviews: Repository<EmployerInterview>,
    @InjectRepository(EmployerOrganization)
    private readonly organizations: Repository<EmployerOrganization>,
    @InjectRepository(EmployerOrganizationMember)
    private readonly memberships: Repository<EmployerOrganizationMember>,
    @InjectRepository(AuditLog)
    private readonly auditLogs: Repository<AuditLog>,
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
      weeklyApplications,
      topJobs,
      applicationsByJob,
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
}
