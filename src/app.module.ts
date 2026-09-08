import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { IntersectionManagerModule } from './modules/intersection-manager/intersection-manager.module';
import { SimulationMetricsModule } from './modules/simulation-metrics/simulation-metrics.module';
import { AiProxyModule } from './modules/ai-proxy/ai-proxy.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    IntersectionManagerModule,
    SimulationMetricsModule,
    AiProxyModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
