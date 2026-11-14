import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { ContentAdminController } from "./content-admin.controller";
import { ContentController } from "./content.controller";
import { PublicContentPagesController } from "./public-content-pages.controller";
import { ContentEntry } from "./content-entry.entity";
import { ContentEntryRevision } from "./content-entry-revision.entity";
import { ContentService } from "./content.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([ContentEntry, ContentEntryRevision]),
    AuditModule,
    AuthModule,
  ],
  controllers: [
    ContentController,
    ContentAdminController,
    PublicContentPagesController,
  ],
  providers: [ContentService],
})
export class ContentModule {}
