import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "twilio_configuration" })
export class TwilioConfiguration {
  @PrimaryColumn({ type: "smallint" })
  id!: number;

  @Column({ type: "boolean", default: false })
  enabled!: boolean;

  @Column({
    name: "account_sid",
    type: "varchar",
    length: 64,
    nullable: true,
  })
  accountSid!: string | null;

  @Column({
    name: "auth_token_encrypted",
    type: "text",
    nullable: true,
    select: false,
  })
  authTokenEncrypted!: string | null;

  @Column({
    name: "from_number",
    type: "varchar",
    length: 40,
    nullable: true,
  })
  fromNumber!: string | null;

  @Column({ name: "whatsapp_enabled", type: "boolean", default: false })
  whatsappEnabled!: boolean;

  @Column({
    name: "whatsapp_from",
    type: "varchar",
    length: 40,
    nullable: true,
  })
  whatsappFrom!: string | null;

  @Column({
    name: "whatsapp_template_sid",
    type: "varchar",
    length: 64,
    nullable: true,
  })
  whatsappTemplateSid!: string | null;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
