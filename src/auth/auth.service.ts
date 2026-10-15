import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { AuthenticatedUser } from './auth.types';
import { RefreshSession } from './refresh-session.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { User, UserRole } from '../users/user.entity';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(RefreshSession)
    private readonly sessionsRepository: Repository<RefreshSession>,
  ) {}

  async registerCandidate(dto: RegisterDto): Promise<{ id: number; email: string }> {
    const email = this.normalizeEmail(dto.email);
    if (Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new BadRequestException(
        'Password must be no longer than 72 UTF-8 bytes',
      );
    }
    if (await this.usersRepository.findOneBy({ email })) {
      throw new ConflictException('An account with this email already exists');
    }

    const user = this.usersRepository.create({
      email,
      passwordHash: await hash(dto.password, 12),
      displayName: dto.displayName.trim(),
      role: UserRole.CANDIDATE,
    });
    const saved = await this.usersRepository.save(user);
    return { id: saved.id, email: saved.email };
  }

  async login(dto: LoginDto): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthenticatedUser;
  }> {
    if (Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new UnauthorizedException('Email or password is incorrect');
    }
    const email = this.normalizeEmail(dto.email);
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
    if (!user || !user.isActive || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Email or password is incorrect');
    }
    return this.createSession(user);
  }

  async refresh(token: string | undefined): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthenticatedUser;
  }> {
    if (!token) {
      throw new UnauthorizedException('A refresh session is required');
    }
    const tokenHash = this.hashToken(token);
    const session = await this.sessionsRepository.findOne({
      where: { tokenHash, revokedAt: IsNull() },
      relations: { user: true },
    });
    if (
      !session ||
      session.expiresAt.getTime() <= Date.now() ||
      !session.user.isActive
    ) {
      throw new UnauthorizedException('The refresh session is invalid or expired');
    }

    const rotation = await this.sessionsRepository.update(
      { tokenHash, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    if (rotation.affected !== 1) {
      throw new UnauthorizedException('The refresh session has already been used');
    }
    return this.createSession(session.user);
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) {
      return;
    }
    await this.sessionsRepository.update(
      { tokenHash: this.hashToken(token), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async getSafeUser(id: number): Promise<AuthenticatedUser> {
    const user = await this.usersRepository.findOneBy({ id, isActive: true });
    if (!user) {
      throw new UnauthorizedException('This account is unavailable');
    }
    return this.toSafeUser(user);
  }

  private async createSession(user: User): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthenticatedUser;
  }> {
    const refreshToken = randomBytes(48).toString('base64url');
    await this.sessionsRepository.save(
      this.sessionsRepository.create({
        tokenHash: this.hashToken(refreshToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        revokedAt: null,
      }),
    );
    const accessToken = await this.jwtService.signAsync(
      { sub: user.id },
      { expiresIn: ACCESS_TOKEN_TTL },
    );
    return { accessToken, refreshToken, user: this.toSafeUser(user) };
  }

  private toSafeUser(user: User): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
