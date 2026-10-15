import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RefreshSession } from './refresh-session.entity';
import { RolesGuard } from './roles.guard';
import { User } from '../users/user.entity';

const localDevelopmentSecret =
  'local-development-only-secret-change-before-deploying-2026';

@Module({
  imports: [
    JwtModule.register({
      secret:
        process.env.JWT_ACCESS_SECRET ??
        (process.env.NODE_ENV === 'production'
          ? undefined
          : localDevelopmentSecret),
      signOptions: { expiresIn: '15m' },
    }),
    TypeOrmModule.forFeature([User, RefreshSession]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  exports: [JwtAuthGuard, RolesGuard, JwtModule, TypeOrmModule],
})
export class AuthModule {}
