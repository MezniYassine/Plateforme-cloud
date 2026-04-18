import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';

// --- DTOs ---
export interface RegisterEnterpriseDto {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  companyName: string;
  taxId: string;
}

export interface RegisterPersonalDto { // Renommé (anciennement Developer)
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  profession?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) { }

  // 1. Inscription d'une Entreprise (et de son premier Admin)
  async registerEnterprise(dto: RegisterEnterpriseDto) {
    if (!dto.email || !dto.password || !dto.companyName || !dto.firstName || !dto.lastName) {
      throw new BadRequestException('Missing required fields');
    }

    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const existingTaxId = await this.usersService.findByTaxId(dto.taxId);
    if (existingTaxId) {
      throw new ConflictException('An account with this tax ID already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    await this.usersService.createEnterprise({
      nom: dto.lastName,
      prenom: dto.firstName,
      email: dto.email,
      password: hashedPassword,
      companyName: dto.companyName,
      taxId: dto.taxId,
    });

    return { ok: true, message: 'Enterprise account created. Awaiting approval.' };
  }

  // 2. Inscription d'un Particulier (Anciennement Developer)
  async registerPersonal(dto: RegisterPersonalDto) {
    if (!dto.email || !dto.password || !dto.firstName || !dto.lastName) {
      throw new BadRequestException('Missing required fields');
    }

    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    await this.usersService.createPersonal({
      nom: dto.lastName,
      prenom: dto.firstName,
      email: dto.email,
      password: hashedPassword,
      profession: dto.profession ?? '',
    });

    return { ok: true, message: 'Personal account created successfully.' };
  }

  // 3. Connexion (Login Unifié pour TOUS les utilisateurs)
  async login(dto: LoginDto) {
    if (!dto.email || !dto.password) {
      throw new BadRequestException('Email and password are required');
    }

    // On récupère le Client (qui contient son rôle, son statut et ses relations)
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // --- SÉCURITÉ JWT ---
    // On injecte le VRAI rôle et statut de la base de données dans le token
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      entrepriseId: user.entreprise ? user.entreprise.id : null // Pratique pour le frontend
    };

    const token = this.jwtService.sign(payload);

    return {
      requiresMFA: user.mfaStatus === 'ACTIVE', // Dynamique selon la DB
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status
      }
    };
  }

  // 4. Vérification MFA (Inchangé)
  verifyMFA(code: string) {
    if (!code || code.length !== 6) {
      throw new BadRequestException('Invalid MFA code');
    }
    const token = this.jwtService.sign({ mfaVerified: true });
    return { token };
  }
}