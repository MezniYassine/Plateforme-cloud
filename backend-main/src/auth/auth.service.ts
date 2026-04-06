import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';

export interface RegisterEnterpriseDto {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  companyName: string;
  taxId: string;
  createdAt: string;
}

export interface RegisterDeveloperDto {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  techStack?: string;
}

export interface RegisterUserCDto {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  techStack?: string;
}

export interface LoginDto {
  email: string | null;
  password: string | null;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) { }

  async registerEnterprise(dto: RegisterEnterpriseDto) {
    if ((!dto.email || !dto.password || !dto.companyName || !dto.firstName || !dto.lastName)) {
      throw new BadRequestException('Missing required fields');
    }

    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    await this.usersService.createEnterprise({
      nom: dto.lastName,
      prenom: dto.firstName,
      email: dto.email,
      password: hashedPassword,
      companyName: dto.companyName,
      taxId: dto.taxId,
      createdAt: dto.createdAt,
    });

    return { ok: true, message: 'Enterprise account created. Awaiting approval.' };
  }

  async registerDeveloper(dto: RegisterDeveloperDto) {
    if (!dto.email || !dto.password) {
      throw new BadRequestException('Missing required fields');
    }

    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    await this.usersService.createDeveloper({
      nom: dto.lastName,
      prenom: dto.firstName,
      email: dto.email,
      password: hashedPassword,
      techStack: dto.techStack ?? '',
    });

    return { ok: true, message: 'Developer account created successfully.' };
  }

  async login(dto: LoginDto) {
    if (!dto.email || !dto.password) {
      throw new BadRequestException('Email and password are required');
    }

    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, email: user.email, role: dto.role };
    const token = this.jwtService.sign(payload);

    return {
      requiresMFA: false,
      token,
    };
  }

  verifyMFA(code: string) {
    // Stub: in production, validate a TOTP code against user's MFA secret
    if (!code || code.length !== 6) {
      throw new BadRequestException('Invalid MFA code');
    }
    // For now, any 6-digit code is accepted and we issue a fresh token
    const token = this.jwtService.sign({ mfaVerified: true });
    return { token };
  }

  async registerUserC(dto: RegisterUserCDto) {
    if (!dto.email || !dto.password) {
      throw new BadRequestException('Missing required fields');
    }

    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    await this.usersService.createUserC({
      nom: dto.lastName,
      prenom: dto.firstName,
      email: dto.email,
      password: hashedPassword,
    });

    return { ok: true, message: 'UserC account created successfully.' };
  }
}
