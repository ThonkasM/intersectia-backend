import { of } from 'rxjs';
import { AiProxyService } from './ai-proxy.service';

describe('AiProxyService', () => {
  let http: { post: jest.Mock; get: jest.Mock };
  let service: AiProxyService;

  const config = {
    get: jest.fn((key: string, fallback?: unknown) => {
      const values: Record<string, string> = {
        AI_SERVICE_URL: 'http://ai:8000',
        INTERNAL_SERVICE_TOKEN: 'secret-token',
      };
      return values[key] ?? fallback;
    }),
  };

  beforeEach(() => {
    http = {
      post: jest.fn().mockReturnValue(of({ data: { answer: 'x' } })),
      get: jest.fn().mockReturnValue(
        of({
          data: {
            topics: [{ slug: 'iot', titulo: 'IoT', categoria: 'Concepto' }],
          },
        }),
      ),
    };
    service = new AiProxyService(http as never, config as never);
  });

  it('askChat resolves the answer from the AI /chat endpoint with the internal token', async () => {
    await expect(service.askChat('hola', 'sess-1')).resolves.toEqual({
      answer: 'x',
    });
    expect(http.post).toHaveBeenCalledWith(
      'http://ai:8000/chat',
      { message: 'hola', sessionId: 'sess-1' },
      { headers: { 'X-Internal-Token': 'secret-token' } },
    );
  });

  it('askChat works without a sessionId', async () => {
    await expect(service.askChat('hola')).resolves.toEqual({ answer: 'x' });
    expect(http.post).toHaveBeenCalledWith(
      'http://ai:8000/chat',
      { message: 'hola', sessionId: undefined },
      { headers: { 'X-Internal-Token': 'secret-token' } },
    );
  });

  it('getTopics resolves the topics from the AI /chat/topics endpoint', async () => {
    await expect(service.getTopics()).resolves.toEqual({
      topics: [{ slug: 'iot', titulo: 'IoT', categoria: 'Concepto' }],
    });
    expect(http.get).toHaveBeenCalledWith('http://ai:8000/chat/topics', {
      headers: { 'X-Internal-Token': 'secret-token' },
    });
  });
});
