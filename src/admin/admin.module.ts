import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { User } from '../users/user.entity';
import { AdminUsersController } from './admin-users.controller';
import { AdminAuditController } from './admin-audit.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuditModule, AuthModule],
  controllers: [AdminUsersController, AdminAuditController],
  providers: [AdminUsersService],
})
export class AdminModule {}
