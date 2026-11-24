import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../users/user.entity';
import { AdminAuditQueryDto } from './dto/admin-audit-query.dto';

@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
export class AdminAuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(@Query() query: AdminAuditQueryDto) {
    return this.auditService.list(query.page, query.limit, {
      query: query.q,
      action: query.action,
      targetType: query.targetType,
      country: query.country,
      from: query.from,
      to: query.to,
    });
  }
}
