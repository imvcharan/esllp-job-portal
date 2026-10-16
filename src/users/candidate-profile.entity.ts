import {
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'candidate_profiles' })
export class CandidateProfile {
  @PrimaryColumn({ name: 'user_id', type: 'int' })
  userId!: number;

  @Column({ length: 160, default: '' })
  headline!: string;

  @Column({ length: 120, default: '' })
  location!: string;

  @Column({ length: 32, default: '' })
  phone!: string;

  @Column({ type: 'text' })
  summary!: string;

  @Column({ type: 'text' })
  skills!: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
