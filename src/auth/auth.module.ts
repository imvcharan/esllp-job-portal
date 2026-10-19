import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RefreshSession } from "./refresh-session.entity";
import { AuthToken } from "./auth-token.entity";
import { RolesGuard } from "./roles.guard";
import { User } from "../users/user.entity";
import { EmailDeliveryService } from "./email-delivery.service";
import { EmployerOrganization } from "../employers/organization.entity";
import { EmployerOrganizationMember } from "../employers/organization-member.entity";
import { AuditModule } from "../audit/audit.module";

const localDevelopmentSecret =
  "local-development-only-secret-change-before-deploying-2026";

@Module({
  imports: [
    JwtModule.register({
      secret:
        process.env.JWT_ACCESS_SECRET ??
        (process.env.NODE_ENV === "production"
          ? undefined
          : localDevelopmentSecret),
      signOptions: { expiresIn: "15m" },
    }),
    TypeOrmModule.forFeature([
      User,
      RefreshSession,
      AuthToken,
      EmployerOrganization,
      EmployerOrganizationMember,
    ]),
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, EmailDeliveryService, JwtAuthGuard, RolesGuard],
  exports: [
    JwtAuthGuard,
    RolesGuard,
    JwtModule,
    TypeOrmModule,
    EmailDeliveryService,
  ],
})
export class AuthModule {}
