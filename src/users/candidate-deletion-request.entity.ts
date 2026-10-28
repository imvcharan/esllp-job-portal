import {
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from "typeorm";

export enum CandidateDeletionRequestStatus {
  OPEN = "open",
  REVIEWING = "reviewing",
  DEFERRED = "deferred",
}

@Entity({ name: "candidate_deletion_requests" })
@Index("IDX_candidate_deletion_requests_status_created", [
  "status",
  "createdAt",
])
export class CandidateDeletionRequest {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "requester_user_id", type: "integer", nullable: true })
  requesterUserId!: number | null;

  @Column({
    type: "varchar",
    length: 20,
    default: CandidateDeletionRequestStatus.OPEN,
  })
  status!: CandidateDeletionRequestStatus;

  @Column({ type: "text", nullable: true })
  details!: string | null;

  @Column({
    name: "review_note",
    type: "varchar",
    length: 1000,
    nullable: true,
  })
  reviewNote!: string | null;

  @Column({ name: "reviewed_by_user_id", type: "integer", nullable: true })
  reviewedByUserId!: number | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
