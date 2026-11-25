import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { DataSource, EntityManager } from "typeorm";
import { OpenSearchService } from "../infrastructure/open-search.service";
import { CandidateFileStorageService } from "./candidate-file-storage.service";
import { UserRole } from "./user.entity";
import { backgroundWorkersEnabled } from "../infrastructure/process-role";

interface DueDeletionRequest {
  id: number;
  requesterUserId: number | null;
}

interface CandidateAccount {
  id: number;
  email: string;
  role: UserRole;
}

interface StoredFile {
  path: string;
}

@Injectable()
export class CandidateDeletionProcessor
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CandidateDeletionProcessor.name);
  private worker: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly storage: CandidateFileStorageService,
    private readonly search: OpenSearchService,
  ) {}

  onModuleInit(): void {
    if (!backgroundWorkersEnabled()) return;
    this.worker = setInterval(() => this.runScheduledCycle(), 60_000);
    this.worker.unref();
    this.runScheduledCycle();
  }

  onModuleDestroy(): void {
    if (this.worker) clearInterval(this.worker);
  }

  private runScheduledCycle(): void {
    if (this.processing) return;
    this.processing = true;
    void this.processScheduledRequests()
      .catch((error: unknown) => {
        this.logger.error(
          `Scheduled candidate anonymization failed: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      })
      .finally(() => {
        this.processing = false;
      });
  }

  private async processScheduledRequests(): Promise<void> {
    for (let count = 0; count < 20; count += 1) {
      if (!(await this.processOneDueRequest())) return;
    }
  }

  private async processOneDueRequest(): Promise<boolean> {
    const completedRequestId = await this.dataSource.transaction(
      async (manager) => {
        const [request] = (await manager.query(
          `
          SELECT id, requester_user_id AS "requesterUserId"
          FROM candidate_deletion_requests
          WHERE status = 'scheduled'
            AND scheduled_for <= now()
          ORDER BY scheduled_for ASC, id ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `,
        )) as DueDeletionRequest[];

        if (!request) return null;

        if (request.requesterUserId !== null) {
          const [account] = (await manager.query(
            `
            SELECT id, email, role
            FROM users
            WHERE id = $1
            FOR UPDATE
          `,
            [request.requesterUserId],
          )) as CandidateAccount[];

          if (account) {
            if (account.role !== UserRole.CANDIDATE) {
              throw new Error(
                `Deletion request ${request.id} no longer belongs to a candidate account.`,
              );
            }
            await this.removePrivateFiles(manager, account.id);
            await this.anonymizeCandidate(manager, account);
            await this.search.removeCandidate(account.id, manager);
          }
        }

        await manager.query(
          `
          UPDATE candidate_deletion_requests
          SET status = 'completed',
              requester_user_id = NULL,
              details = NULL,
              review_note = NULL,
              completed_at = now()
          WHERE id = $1
        `,
          [request.id],
        );

        return request.id;
      },
    );

    if (completedRequestId === null) return false;
    this.logger.log(
      `Completed scheduled candidate anonymization request ${completedRequestId}.`,
    );
    return true;
  }

  private async removePrivateFiles(
    manager: EntityManager,
    candidateId: number,
  ): Promise<void> {
    const files = (await manager.query(
      `
      SELECT file_path AS path
      FROM candidate_application_documents
      WHERE user_id = $1
      UNION
      SELECT storage_path AS path
      FROM candidate_resume_versions
      WHERE user_id = $1
      UNION
      SELECT resume_path AS path
      FROM candidate_profiles
      WHERE user_id = $1 AND resume_path IS NOT NULL
      UNION
      SELECT photo_path AS path
      FROM candidate_profiles
      WHERE user_id = $1 AND photo_path IS NOT NULL
      UNION
      SELECT resume_path AS path
      FROM candidate_applications
      WHERE user_id = $1 AND resume_path IS NOT NULL
    `,
      [candidateId],
    )) as StoredFile[];

    await this.storage.enqueueCleanup(
      files.map(({ path }) => path),
      manager,
    );
  }

  private async anonymizeCandidate(
    manager: EntityManager,
    account: CandidateAccount,
  ): Promise<void> {
    const candidateId = account.id;
    const unusablePasswordHash = await hash(
      randomBytes(32).toString("hex"),
      10,
    );

    await manager.query("DELETE FROM refresh_sessions WHERE user_id = $1", [
      candidateId,
    ]);
    await manager.query("DELETE FROM auth_tokens WHERE user_id = $1", [
      candidateId,
    ]);
    await manager.query(
      "DELETE FROM candidate_application_messages WHERE sender_user_id = $1 OR application_id IN (SELECT id FROM candidate_applications WHERE user_id = $1)",
      [candidateId],
    );
    await manager.query(
      "DELETE FROM candidate_application_offers WHERE application_id IN (SELECT id FROM candidate_applications WHERE user_id = $1)",
      [candidateId],
    );
    await manager.query(
      "DELETE FROM employer_interviews WHERE application_id IN (SELECT id FROM candidate_applications WHERE user_id = $1)",
      [candidateId],
    );
    await manager.query(
      `
      UPDATE employer_application_scorecards
      SET scores = '{}'::jsonb, notes = NULL
      WHERE application_id IN (
        SELECT id FROM candidate_applications WHERE user_id = $1
      )
    `,
      [candidateId],
    );
    await manager.query(
      `
      UPDATE candidate_application_status_history
      SET note = NULL,
          changed_by_user_id = CASE
            WHEN changed_by_user_id = $1 THEN NULL
            ELSE changed_by_user_id
          END
      WHERE application_id IN (
        SELECT id FROM candidate_applications WHERE user_id = $1
      )
    `,
      [candidateId],
    );
    await manager.query(
      `
      UPDATE candidate_applications
      SET cover_letter = NULL,
          resume_path = NULL,
          resume_file_name = NULL,
          profile_shared = false,
          profile_snapshot = NULL,
          application_answers = '[]'::jsonb,
          source_attribution = NULL,
          withdrawal_requested_at = NULL,
          withdrawal_requested_from_status = NULL
      WHERE user_id = $1
    `,
      [candidateId],
    );
    await manager.query(
      "DELETE FROM candidate_application_documents WHERE user_id = $1",
      [candidateId],
    );
    await manager.query(
      "DELETE FROM candidate_resume_versions WHERE user_id = $1",
      [candidateId],
    );
    await manager.query("DELETE FROM candidate_saved_jobs WHERE user_id = $1", [
      candidateId,
    ]);
    await manager.query(
      "DELETE FROM candidate_saved_searches WHERE user_id = $1",
      [candidateId],
    );
    await manager.query(
      "DELETE FROM candidate_quick_apply_preferences WHERE user_id = $1",
      [candidateId],
    );
    await manager.query("DELETE FROM user_notifications WHERE user_id = $1", [
      candidateId,
    ]);
    await manager.query("DELETE FROM candidate_profiles WHERE user_id = $1", [
      candidateId,
    ]);
    await manager.query(
      `
      UPDATE candidate_premium_orders
      SET fulfillment_note = NULL
      WHERE user_id = $1
    `,
      [candidateId],
    );
    await manager.query(
      `
      UPDATE payment_refunds
      SET requester_user_id = NULL,
          reason = 'Anonymized account deletion',
          review_note = NULL
      WHERE requester_user_id = $1
         OR (
           payment_source = 'candidate'
           AND payment_reference IN (
             SELECT razorpay_order_id
             FROM candidate_premium_orders
             WHERE user_id = $1
             UNION
             SELECT razorpay_payment_id
             FROM candidate_premium_orders
             WHERE user_id = $1 AND razorpay_payment_id IS NOT NULL
           )
         )
    `,
      [candidateId],
    );
    await manager.query(
      `
      UPDATE payment_invoices
      SET billing_name = 'Anonymized account',
          billing_email = 'deleted-candidate-' || $1::text || '@anonymized.invalid',
          gstin = NULL
      WHERE payment_source = 'candidate'
        AND payment_reference IN (
          SELECT razorpay_order_id
          FROM candidate_premium_orders
          WHERE user_id = $1
          UNION
          SELECT razorpay_payment_id
          FROM candidate_premium_orders
          WHERE user_id = $1 AND razorpay_payment_id IS NOT NULL
        )
    `,
      [candidateId],
    );
    await manager.query(
      `
      UPDATE whatsapp_notification_outbox
      SET status = CASE
            WHEN status IN ('queued', 'sending') THEN 'cancelled'
            ELSE status
          END,
          to_number = NULL,
          template_variables = NULL,
          last_error = NULL,
          updated_at = now()
      WHERE user_id = $1
    `,
      [candidateId],
    );
    await manager.query(
      `
      UPDATE email_notification_outbox
      SET status = CASE
            WHEN status IN ('queued', 'sending', 'retrying') THEN 'failed'
            ELSE status
          END,
      failed_at = CASE
        WHEN status IN ('queued', 'sending', 'retrying') THEN now()
        ELSE failed_at
      END,
          recipient_email = NULL,
          subject = NULL,
          message = NULL,
          locked_at = NULL,
          last_error = NULL
      WHERE lower(recipient_email) = lower($1)
    `,
      [account.email],
    );
    await manager.query(
      `
      UPDATE audit_logs
      SET actor_user_id = NULL,
          details = NULL,
          ip_address = NULL,
          location_city = NULL,
          location_region = NULL,
          location_country = NULL,
          user_agent = NULL
      WHERE actor_user_id = $1
    `,
      [candidateId],
    );
    await manager.query(
      `
      UPDATE users
      SET email = $2,
          password_hash = $3,
          display_name = $4,
          username = $5,
          phone_e164 = NULL,
          pending_phone_e164 = NULL,
          phone_verified = false,
          company_name = NULL,
          company_website = NULL,
          email_verified = false,
          is_active = false,
          must_change_password = false,
          google_subject = NULL,
          updated_at = now()
      WHERE id = $1
    `,
      [
        candidateId,
        `deleted-candidate-${candidateId}@anonymized.invalid`,
        unusablePasswordHash,
        `Deleted Candidate ${candidateId}`,
        `deleted-${candidateId}`,
      ],
    );
  }
}
