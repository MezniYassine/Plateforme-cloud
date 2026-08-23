import { Body, Controller, Get, Post, HttpCode } from '@nestjs/common';
import { AppService } from './app.service';
import { MailService } from './mail/mail.service';

@Controller('api')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly mailService: MailService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('contact')
  @HttpCode(200)
  async handleContactForm(
    @Body() body: { name: string; email: string; subject: string; message: string },
  ) {
    if (!body.name || !body.email || !body.message) {
      return { success: false, message: 'Veuillez remplir tous les champs obligatoires.' };
    }
    
    await this.mailService.sendContactMessage({
      name: body.name,
      email: body.email,
      subject: body.subject || 'Nouveau message de contact',
      message: body.message,
    });
    
    return { success: true, message: 'Votre message a été envoyé avec succès.' };
  }
}
