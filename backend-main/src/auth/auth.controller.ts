import {
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import * as authService from './auth.service';

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
  verifyMFA(@Body('code') code: string) {
    console.log('MFA Code:', code);
    return this.authService.verifyMFA(code);
  }

  @Post('setup')
  @HttpCode(HttpStatus.OK)
  async setupPassword(
    @Body('token') token: string,
    @Body('password') password: string,
  ) {
    return this.authService.setupPassword(token, password);
  }
}
