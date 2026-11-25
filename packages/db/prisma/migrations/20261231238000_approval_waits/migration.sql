CREATE TABLE "approval_waits" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "approval" BOOLEAN NOT NULL,
    "askedAt" TIMESTAMP(3) NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_waits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "approval_waits_spaceId_answeredAt_idx" ON "approval_waits"("spaceId", "answeredAt");

ALTER TABLE "approval_waits" ADD CONSTRAINT "approval_waits_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_waits" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "approval_waits_tenant" ON "approval_waits"
    USING ("spaceId" = current_setting('app.space_id', true));
CREATE POLICY "approval_waits_system" ON "approval_waits"
    USING ((SELECT app_rls_bypass()));
