import { Controller, Post, Body, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService } from './chat.service';
import { ChatMessageDto } from './dto/chat-message.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('message')
  async sendMessage(@Req() req: any, @Body() dto: ChatMessageDto) {
    if (!dto || !dto.message || !dto.message.trim()) {
      throw new BadRequestException('Le message ne peut pas être vide');
    }

    const userId = Number(req.user?.sub || req.user?.id || 0);
    const role = req.user?.role || 'CLIENT';

    return this.chatService.processUserMessage(userId, role, dto.message.trim(), dto.history || []);
  }
}
