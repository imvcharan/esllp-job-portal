import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "../users/user.entity";

@Entity({ name: "user_notifications" })
@Index(["userId", "createdAt"])
export class UserNotification {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "user_id", type: "integer" })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "varchar", length: 40 })
  type!: string;

  @Column({ type: "varchar", length: 180 })
  title!: string;

  @Column({ type: "text" })
  message!: string;

  @Column({ name: "link", type: "varchar", length: 500, nullable: true })
  link!: string | null;

  @Column({ name: "read_at", type: "timestamptz", nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
