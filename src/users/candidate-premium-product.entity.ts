import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { CandidatePremiumOrder } from "./candidate-premium-order.entity";

@Entity({ name: "candidate_premium_products" })
export class CandidatePremiumProduct {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 40, unique: true })
  key!: string;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ type: "varchar", length: 500 })
  description!: string;

  @Column({ name: "amount_paise", type: "integer" })
  amountPaise!: number;

  @Column({ name: "fulfillment_days", type: "integer", default: 0 })
  fulfillmentDays!: number;

  @Column({ type: "boolean", default: true })
  enabled!: boolean;

  @OneToMany(() => CandidatePremiumOrder, (order) => order.product)
  orders!: CandidatePremiumOrder[];

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
