import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getStatus(): { name: string; status: string } {
    return { name: 'IntersectIA Backend', status: 'ok' };
  }
}
