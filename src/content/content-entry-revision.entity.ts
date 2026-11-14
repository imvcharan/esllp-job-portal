import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ContentType } from "./content-entry.entity";

@Entity("content_entry_revisions")
@Index("UQ_content_entry_revisions_version", ["contentEntryId", "version"], {
  unique: true,
})
export class ContentEntryRevision {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "content_entry_id", type: "integer" })
  contentEntryId!: number;

  @Column({ type: "integer" })
  version!: number;

  @Column({
    type: "enum",
    enum: ContentType,
    enumName: "content_entries_type_enum",
  })
  type!: ContentType;

  @Column({ type: "varchar", length: 120 })
  slug!: string;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  @Column({ type: "text", nullable: true })
  summary!: string | null;

  @Column({ type: "text" })
  body!: string;

  @Column({ name: "seo_title", type: "varchar", length: 200, nullable: true })
  seoTitle!: string | null;

  @Column({
    name: "seo_description",
    type: "varchar",
    length: 300,
    nullable: true,
  })
  seoDescription!: string | null;

  @Column({ name: "is_published", type: "boolean" })
  isPublished!: boolean;

  @Column({ name: "published_at", type: "timestamp", nullable: true })
  publishedAt!: Date | null;

  @Column({ name: "created_by_user_id", type: "integer", nullable: true })
  createdByUserId!: number | null;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt!: Date;
}
