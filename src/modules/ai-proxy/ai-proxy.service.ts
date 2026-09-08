import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout } from 'rxjs';

export interface ChatTopic {
  slug: string;
  titulo: string;
  categoria: string;
}

@Injectable()
export class AiProxyService {
  private readonly serviceUrl: string;
  private readonly internalToken: string;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.serviceUrl = config.get<string>(
      'AI_SERVICE_URL',
      'http://localhost:8000',
    );
    this.internalToken = config.get<string>(
      'INTERNAL_SERVICE_TOKEN',
      'dev-internal-token',
    );
  }

  async askChat(
    message: string,
    sessionId?: string,
  ): Promise<{ answer: string }> {
    const response = await firstValueFrom(
      this.http
        .post<{ answer: string }>(
          `${this.serviceUrl}/chat`,
          { message, sessionId },
          { headers: { 'X-Internal-Token': this.internalToken } },
        )
        .pipe(timeout(30000)),
    );
    return response.data;
  }

  async getTopics(): Promise<{ topics: ChatTopic[] }> {
    const response = await firstValueFrom(
      this.http
        .get<{ topics: ChatTopic[] }>(`${this.serviceUrl}/chat/topics`, {
          headers: { 'X-Internal-Token': this.internalToken },
        })
        .pipe(timeout(30000)),
    );
    return response.data;
  }
}
