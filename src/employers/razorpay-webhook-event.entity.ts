import { CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "razorpay_webhook_events" })
export class RazorpayWebhookEvent {
  @PrimaryColumn({ name: "event_id", type: "varchar", length: 100 })
  eventId!: string;

  @CreateDateColumn({ name: "received_at", type: "timestamptz" })
  receivedAt!: Date;
}
