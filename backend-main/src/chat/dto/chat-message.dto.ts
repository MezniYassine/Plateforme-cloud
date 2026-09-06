import { IsNotEmpty, IsString, IsOptional, IsArray } from 'class-validator';

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export class ChatMessageDto {
  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  @IsArray()
  history?: ChatHistoryItem[];
}
