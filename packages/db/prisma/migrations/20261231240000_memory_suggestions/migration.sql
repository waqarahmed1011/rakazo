CREATE TABLE "memory_suggestions" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "botId" TEXT,
    "path" TEXT NOT NULL,
    "content" TEXT,
    "baseRevision" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memory_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "memory_suggestions_spaceId_status_createdAt_idx" ON "memory_suggestions"("spaceId", "status", "createdAt");

ALTER TABLE "memory_suggestions" ADD CONSTRAINT "memory_suggestions_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "memory_suggestions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "memory_suggestions_tenant" ON "memory_suggestions"
    USING ("spaceId" = current_setting('app.space_id', true));
CREATE POLICY "memory_suggestions_system" ON "memory_suggestions"
    USING ((SELECT app_rls_bypass()));
