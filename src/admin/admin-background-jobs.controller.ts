import {
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Optional,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "../users/user.entity";
import { JobQueueService } from "../infrastructure/job-queue.service";
import { OpenSearchService } from "../infrastructure/open-search.service";
import { RedisCacheService } from "../infrastructure/redis-cache.service";
import { EmailDeliveryService } from "../auth/email-delivery.service";
import { RetrySearchIndexRecordDto } from "./dto/retry-search-index-record.dto";
import { CandidatePrivateFileProcessor } from "../users/candidate-private-file-processor.service";
import { WorkerHeartbeatService } from "../infrastructure/worker-heartbeat.service";
import { EmployersService } from "../employers/employers.service";
import { JobsService } from "../jobs/jobs.service";
import { InterviewReminderService } from "../employers/interview-reminder.service";

@Controller("admin/background-jobs")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
export class AdminBackgroundJobsController {
  constructor(
    private readonly queues: JobQueueService,
    private readonly search: OpenSearchService,
    private readonly cache: RedisCacheService,
    private readonly emailDelivery: EmailDeliveryService,
    private readonly audit: AuditService,
    private readonly privateFiles: CandidatePrivateFileProcessor,
    @Optional()
    private readonly workerHeartbeats: WorkerHeartbeatService | null = null,
    @Optional() private readonly employers: EmployersService | null = null,
    @Optional() private readonly jobs: JobsService | null = null,
    @Optional()
    private readonly interviewReminders: InterviewReminderService | null = null,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  async status() {
    const [
      queues,
      indexing,
      emailOutbox,
      privateFiles,
      workerHeartbeat,
      jobAlerts,
      whatsappOutbox,
    ] = await Promise.all([
      this.queues.operationalStatus(),
      this.search.operationalStatus(),
      this.emailDelivery.outboxOperationalStatus(),
      this.privateFiles.operationalStatus(),
      this.workerHeartbeats?.status() ?? Promise.resolve(null),
      this.jobs?.jobAlertOperationalStatus() ?? Promise.resolve(null),
      this.interviewReminders?.whatsappOutboxOperationalStatus() ??
        Promise.resolve(null),
    ]);
    return {
      cache: { enabled: this.cache.enabled, ready: this.cache.ready },
      queues,
      indexing,
      emailOutbox,
      privateFiles,
      workerHeartbeat,
      jobAlerts,
      whatsappOutbox,
    };
  }

  @Post("indexing/:id/retry")
  async retryIndexingRecord(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: RetrySearchIndexRecordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const retried = await this.search.retryIndexingRecord(id);
    if (!retried) {
      throw new NotFoundException("Search indexing record was not found.");
    }
    await this.audit.record({
      actorUserId: user.id,
      action: "admin.search_index_record_retried",
      targetType: "search_index_outbox",
      targetId: id,
      details: {
        entityType: retried.entityType,
        reason: dto.reason.trim(),
      },
    });
    return { queued: true };
  }

  @Post("subscriptions/reconcile")
  async reconcileSubscriptions(
    @Body() dto: RetrySearchIndexRecordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!this.employers)
      throw new NotFoundException(
        "Subscription reconciliation is unavailable.",
      );
    const result = await this.employers.reconcileSubscriptions();
    await this.audit.record({
      actorUserId: user.id,
      action: "admin.subscription_reconciliation_requested",
      targetType: "employer_subscriptions",
      targetId: "batch",
      details: {
        reason: dto.reason.trim(),
        checked: result.checked,
        failures: result.failures,
        discrepancyCount: result.discrepancies.length,
      },
    });
    return result;
  }

  @Post("job-alerts/:id/retry")
  async retryJobAlert(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: RetrySearchIndexRecordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!this.jobs)
      throw new NotFoundException("Job alert retry is unavailable.");
    const retried = await this.jobs.retryFailedJobAlert(id);
    if (!retried)
      throw new NotFoundException("Failed job alert generation was not found.");
    await this.audit.record({
      actorUserId: user.id,
      action: "admin.job_alert_generation_retried",
      targetType: "job",
      targetId: id,
      details: { reason: dto.reason.trim() },
    });
    return { queued: true };
  }

  @Post("whatsapp/:id/retry")
  async retryWhatsAppNotification(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: RetrySearchIndexRecordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!this.interviewReminders)
      throw new NotFoundException("WhatsApp retry is unavailable.");
    const retried =
      await this.interviewReminders.retryFailedWhatsAppNotification(id);
    if (!retried)
      throw new NotFoundException(
        "Failed WhatsApp delivery was not found or the recipient is no longer opted in.",
      );
    await this.audit.record({
      actorUserId: user.id,
      action: "admin.whatsapp_notification_retried",
      targetType: "whatsapp_notification",
      targetId: id,
      details: { reason: dto.reason.trim() },
    });
    return { queued: true };
  }
}
