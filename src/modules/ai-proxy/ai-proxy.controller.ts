import { Body, Controller, Get, Post } from '@nestjs/common';
import { AiProxyService, ChatTopic } from './ai-proxy.service';
import { ChatRequestDto } from './dto/chat-request.dto';

@Controller('ai')
export class AiProxyController {
  constructor(private readonly aiProxy: AiProxyService) {}

  @Post('chat')
  askChat(@Body() dto: ChatRequestDto): Promise<{ answer: string }> {
    return this.aiProxy.askChat(dto.message, dto.sessionId);
  }

  @Get('chat/topics')
  getTopics(): Promise<{ topics: ChatTopic[] }> {
    return this.aiProxy.getTopics();
  }
}
