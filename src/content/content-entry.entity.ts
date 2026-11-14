import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export enum ContentType {
  PAGE = "page",
  FAQ = "faq",
  BLOG = "blog",
  BANNER = "banner",
}

@Entity("content_entries")
@Index("IDX_content_entries_type_published", ["type", "isPublished"])
@Index("UQ_content_entries_slug", ["slug"], { unique: true })
export class ContentEntry {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "enum", enum: ContentType })
  type!: ContentType;

  @Column({ type: "varchar", length: 120 })
  slug!: string;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  @Column({ type: "text", nullable: true })
  summary!: string | null;

  @Column({ type: "text" })
  body!: string;

  @Column({ type: "varchar", length: 200, nullable: true })
  seoTitle!: string | null;

  @Column({ type: "varchar", length: 300, nullable: true })
  seoDescription!: string | null;

  @Column({ type: "boolean", default: false })
  isPublished!: boolean;

  @Column({ type: "timestamp", nullable: true })
  publishedAt!: Date | null;

  @Column({ type: "integer", nullable: true })
  createdByUserId!: number | null;

  @Column({ type: "integer", nullable: true })
  updatedByUserId!: number | null;

  @CreateDateColumn({ type: "timestamp" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updatedAt!: Date;
}
