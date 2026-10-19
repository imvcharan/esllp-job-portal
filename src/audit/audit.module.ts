import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './audit-log.entity';
import { AuditService } from './audit.service';
import { AuditLocationService } from './audit-location.service';
import { User } from '../users/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, User])],
  providers: [AuditService, AuditLocationService],
  exports: [AuditService],
})
export class AuditModule {}
