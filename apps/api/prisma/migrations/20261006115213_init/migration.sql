-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PROPOSED', 'SCREENED', 'REJECTED', 'FORMULATED', 'EVIDENCE_SUBMITTED', 'ASSESSED');

-- CreateEnum
CREATE TYPE "ClaimCategory" AS ENUM ('EFFICACY', 'CONSUMER_PERCEPTION', 'SENSORY', 'COMPARATIVE', 'SAFETY', 'FREE_FROM', 'OTHER');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('JUSTIFIED', 'NOT_JUSTIFIED', 'INSUFFICIENT_EVIDENCE');

-- CreateTable
CREATE TABLE "Claim" (
    "id" UUID NOT NULL,
    "productName" VARCHAR(200) NOT NULL,
    "claimText" VARCHAR(500) NOT NULL,
    "category" "ClaimCategory" NOT NULL DEFAULT 'EFFICACY',
    "market" VARCHAR(10) NOT NULL DEFAULT 'EU',
    "status" "ClaimStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" UUID NOT NULL,
    "claimId" UUID NOT NULL,
    "evidenceText" TEXT NOT NULL,
    "inputHash" CHAR(64) NOT NULL,
    "verdict" "Verdict" NOT NULL,
    "isJustified" BOOLEAN NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT NOT NULL,
    "supportingPoints" TEXT[],
    "gaps" TEXT[],
    "criteria" JSONB NOT NULL,
    "guardrailFlags" TEXT[],
    "requiresHumanReview" BOOLEAN NOT NULL DEFAULT false,
    "provider" VARCHAR(30) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "promptVersion" VARCHAR(30) NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Claim_status_idx" ON "Claim"("status");

-- CreateIndex
CREATE INDEX "Claim_createdAt_idx" ON "Claim"("createdAt");

-- CreateIndex
CREATE INDEX "Assessment_claimId_createdAt_idx" ON "Assessment"("claimId", "createdAt");

-- CreateIndex
CREATE INDEX "Assessment_inputHash_idx" ON "Assessment"("inputHash");

-- CreateIndex
CREATE INDEX "Assessment_requiresHumanReview_idx" ON "Assessment"("requiresHumanReview");

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
