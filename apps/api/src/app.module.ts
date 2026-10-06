import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClaimsModule } from './claims/claims.module';
import { HealthController } from './common/health.controller';
import { LlmModule } from './llm/llm.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, LlmModule, ClaimsModule],
  controllers: [HealthController],
})
export class AppModule {}
