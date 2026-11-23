import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "payment_invoices" })
export class PaymentInvoice {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: "invoice_number", length: 40, unique: true }) invoiceNumber!: string;
  @Column({ name: "payment_source", length: 20 }) paymentSource!: "candidate" | "employer";
  @Column({ name: "payment_reference", length: 100 }) paymentReference!: string;
  @Column({ name: "billing_name", length: 200 }) billingName!: string;
  @Column({ name: "billing_email", length: 320 }) billingEmail!: string;
  @Column({ length: 15, nullable: true }) gstin!: string | null;
  @Column({ name: "taxable_amount_paise", type: "integer" }) taxableAmountPaise!: number;
  @Column({ name: "tax_rate_basis_points", type: "integer", default: 0 }) taxRateBasisPoints!: number;
  @Column({ name: "tax_amount_paise", type: "integer", default: 0 }) taxAmountPaise!: number;
  @Column({ name: "total_amount_paise", type: "integer" }) totalAmountPaise!: number;
  @Column({ name: "generated_at", type: "timestamptz", default: () => "CURRENT_TIMESTAMP" }) generatedAt!: Date;
}
