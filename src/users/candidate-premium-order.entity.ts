import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "./user.entity";
import { CandidatePremiumProduct } from "./candidate-premium-product.entity";

export type CandidatePremiumFulfillmentStatus =
  "pending" | "in_progress" | "completed" | "cancelled";

@Entity({ name: "candidate_premium_orders" })
export class CandidatePremiumOrder {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ name: "razorpay_order_id", type: "varchar", length: 100 })
  razorpayOrderId!: string;

  @Index({ unique: true })
  @Column({
    name: "razorpay_payment_id",
    type: "varchar",
    length: 100,
    nullable: true,
  })
  razorpayPaymentId!: string | null;

  @Column({ name: "user_id", type: "integer" })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ name: "product_key", type: "varchar", length: 40 })
  productKey!: string;

  @ManyToOne(() => CandidatePremiumProduct, (product) => product.orders, {
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "product_key", referencedColumnName: "key" })
  product!: CandidatePremiumProduct;

  @Column({ name: "product_name", type: "varchar", length: 100 })
  productName!: string;

  @Column({ name: "product_description", type: "varchar", length: 500 })
  productDescription!: string;

  @Column({ name: "amount_paise", type: "integer" })
  amountPaise!: number;

  @Column({ name: "fulfillment_days", type: "integer", default: 0 })
  fulfillmentDays!: number;

  @Column({ type: "varchar", length: 3, default: "INR" })
  currency!: string;

  @Column({
    name: "payment_status",
    type: "varchar",
    length: 20,
    default: "pending",
  })
  paymentStatus!: "pending" | "paid";

  @Column({
    name: "fulfillment_status",
    type: "varchar",
    length: 20,
    default: "pending",
  })
  fulfillmentStatus!: CandidatePremiumFulfillmentStatus;

  @Column({ name: "fulfillment_note", type: "text", nullable: true })
  fulfillmentNote!: string | null;

  @Column({ name: "paid_at", type: "timestamptz", nullable: true })
  paidAt!: Date | null;

  @Column({ name: "fulfilled_at", type: "timestamptz", nullable: true })
  fulfilledAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
