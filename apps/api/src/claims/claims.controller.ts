import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ClaimsService } from './claims.service';
import { AssessClaimDto } from './dto/assess-claim.dto';
import { AssessmentResponse } from './dto/assessment-response.dto';

/**
 * Thin controller: HTTP concerns only (routing, validation via DTO, status
 * codes). All business logic lives in ClaimsService so it can be unit-tested
 * and reused from a queue worker later.
 */
@Controller('claims')
export class ClaimsController {
  constructor(private readonly claims: ClaimsService) {}

  /** POST /api/claims/assess — judge evidence against a claim, persist, return the verdict. */
  @Post('assess')
  @HttpCode(HttpStatus.OK)
  assess(@Body() dto: AssessClaimDto): Promise<AssessmentResponse> {
    return this.claims.assess(dto);
  }

  /** GET /api/claims?limit=10 — recent claims with their latest assessment. */
  @Get()
  findRecent(@Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number) {
    return this.claims.findRecent(limit);
  }

  /** GET /api/claims/:id — claim with full assessment history. */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.claims.findOne(id);
  }
}
