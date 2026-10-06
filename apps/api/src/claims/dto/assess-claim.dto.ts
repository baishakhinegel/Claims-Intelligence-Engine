import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, Length, MaxLength, ValidateIf } from 'class-validator';

export const CLAIM_CATEGORIES = [
  'EFFICACY',
  'CONSUMER_PERCEPTION',
  'SENSORY',
  'COMPARATIVE',
  'SAFETY',
  'FREE_FROM',
  'OTHER',
] as const;
export type ClaimCategoryDto = (typeof CLAIM_CATEGORIES)[number];

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * POST /api/claims/assess
 *
 * Either reference an existing claim (claimId) or describe a new one inline
 * (claimText [+ productName]). Evidence is always required.
 * Size limits protect the LLM budget and the DB.
 */
export class AssessClaimDto {
  @IsOptional()
  @IsUUID()
  claimId?: string;

  @ValidateIf((o: AssessClaimDto) => !o.claimId)
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  claimText?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  productName?: string;

  @IsOptional()
  @IsEnum(CLAIM_CATEGORIES)
  category?: ClaimCategoryDto;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 10)
  market?: string;

  @Transform(trim)
  @IsString()
  @Length(20, 20000, { message: 'evidence must be between 20 and 20,000 characters' })
  evidence!: string;
}
