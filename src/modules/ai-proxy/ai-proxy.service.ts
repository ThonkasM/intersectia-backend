import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout } from 'rxjs';

export interface ChatTopic {
  slug: string;
  titulo: string;
  categoria: string;
}

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

@Injectable()
export class AiProxyService {
  private readonly logger = new Logger(AiProxyService.name);
  private readonly serviceUrl: string;
  private readonly internalToken: string;
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

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

  private assertWithinRateLimit(key: string): void {
    const now = Date.now();
    if (this.hits.size > 1000) {
      for (const [k, entry] of this.hits) {
        if (entry.resetAt <= now) this.hits.delete(k);
      }
    }
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
      return;
    }
    if (entry.count >= RATE_LIMIT) {
      throw new HttpException(
        'Too many chat requests, slow down',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    entry.count += 1;
  }

  async askChat(
    message: string,
    sessionId?: string,
  ): Promise<{ answer: string }> {
    this.assertWithinRateLimit(sessionId ?? 'anon');
    try {
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
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.warn(`AI /chat failed: ${String(err)}`);
      throw new BadGatewayException('AI chat service unavailable');
    }
  }

  async getTopics(): Promise<{ topics: ChatTopic[] }> {
    try {
      const response = await firstValueFrom(
        this.http
          .get<{ topics: ChatTopic[] }>(`${this.serviceUrl}/chat/topics`, {
            headers: { 'X-Internal-Token': this.internalToken },
          })
          .pipe(timeout(30000)),
      );
      return response.data;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.warn(`AI /chat/topics failed: ${String(err)}`);
      throw new BadGatewayException('AI chat service unavailable');
    }
  }
}
