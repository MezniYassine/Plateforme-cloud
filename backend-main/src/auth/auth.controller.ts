import {
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  UseGuards,
  Get,
  Req,
  Res,
  Request,
} from '@nestjs/common';
import type { Response } from 'express';
import * as authService from './auth.service';
import { GoogleAuthGuard } from './google-auth.guard';
import { MicrosoftAuthGuard } from './microsoft-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: authService.AuthService) { }

  @Post('register/enterprise')
  @HttpCode(HttpStatus.CREATED)
  registerEnterprise(@Body() body: authService.RegisterEnterpriseDto) {
    console.log('Register Enterprise Payload:', body);
    return this.authService.registerEnterprise(body);
  }

  // Renommé de "developer" à "personal" pour respecter l'architecture
  @Post('register/personal')
  @HttpCode(HttpStatus.CREATED)
  registerPersonal(@Body() body: authService.RegisterPersonalDto) {
    console.log('Register Personal Payload:', body);
    return this.authService.registerPersonal(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: authService.LoginDto) {
    console.log('Login attempt for:', body.email);
    return this.authService.login(body);
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  verifyMFA(@Body('code') code: string, @Body('email') email: string) {
    return this.authService.verifyMFA(code, email);
  }

  /** Envoi OTP pour activer le MFA depuis le profil (utilis. connecté) */
  @UseGuards(JwtAuthGuard)
  @Post('mfa/send-otp')
  @HttpCode(HttpStatus.OK)
  sendMfaOtp(@Request() req: any) {
    return this.authService.sendMfaOtp(req.user.sub);
  }

  /** Vérification du code OTP et activation du MFA */
  @UseGuards(JwtAuthGuard)
  @Post('mfa/verify-activate')
  @HttpCode(HttpStatus.OK)
  verifyAndActivateMfa(@Request() req: any, @Body('code') code: string) {
    return this.authService.verifyAndActivateMfa(req.user.sub, code);
  }

  /** Envoi OTP lors du login si mfaStatus === ACTIVE */
  @Post('mfa/login-send-otp')
  @HttpCode(HttpStatus.OK)
  sendLoginMfaOtp(@Body('email') email: string) {
    return this.authService.sendLoginMfaOtp(email);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  @Post('setup')
  @HttpCode(HttpStatus.OK)
  async setupPassword(
    @Body('token') token: string,
    @Body('password') password: string,
  ) {
    return this.authService.setupPassword(token, password);
  }

  // 1. L'utilisateur clique sur "Se connecter avec Google" dans Angular
  // Ça appelle cette route, qui redirige vers la vraie page de login Google
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth(@Req() req) {
    // Rien à faire ici, le Guard s'occupe de la redirection vers Google
  }

  // 2. Google renvoie l'utilisateur ici après qu'il ait mis son mot de passe
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthRedirect(@Req() req, @Res() res: any) {
    // req.user contient les infos envoyées par la GoogleStrategy
    const jwtToken = await this.authService.googleLogin(req.user);

    // TRÈS IMPORTANT : On redirige vers ton FRONTEND Angular avec le token dans l'URL !
    return res.redirect(`http://localhost:4200/login/success?token=${jwtToken.access_token}`);
  }

  @Get('microsoft')
  @UseGuards(MicrosoftAuthGuard)
  async microsoftAuth(@Req() req) {
    // Redirige vers la page de login Microsoft
  }

  @Get('microsoft/callback')
  @UseGuards(MicrosoftAuthGuard)
  async microsoftAuthRedirect(@Req() req, @Res() res: Response) {
    const jwtToken = await this.authService.microsoftLogin(req.user);

    return res.redirect(`http://localhost:4200/login/success?token=${jwtToken.access_token}`);
  }
}
