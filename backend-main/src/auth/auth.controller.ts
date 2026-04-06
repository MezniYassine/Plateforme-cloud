import {
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import * as authService_1 from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: authService_1.AuthService) { }

  @Post('register/enterprise')
  @HttpCode(HttpStatus.CREATED)
  registerEnterprise(@Body() body: authService_1.RegisterEnterpriseDto) {
    console.log(body);
    return this.authService.registerEnterprise(body);
  }

  @Post('register/developer')
  @HttpCode(HttpStatus.CREATED)
  registerDeveloper(@Body() body: authService_1.RegisterDeveloperDto) {
    console.log(body);
    return this.authService.registerDeveloper(body);
  }

  @Post('register/userC')
  @HttpCode(HttpStatus.CREATED)
  registerUserC(@Body() body: authService_1.RegisterUserCDto) {
    console.log(body);
    return this.authService.registerUserC(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: authService_1.LoginDto) {
    console.log(body);
    return this.authService.login(body);
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  verifyMFA(@Body('code') code: string) {
    console.log(code);
    return this.authService.verifyMFA(code);
  }
}
