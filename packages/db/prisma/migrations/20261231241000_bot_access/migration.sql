CREATE TABLE "bot_access" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bot_access_botId_userId_key" ON "bot_access"("botId", "userId");
CREATE INDEX "bot_access_spaceId_userId_idx" ON "bot_access"("spaceId", "userId");

ALTER TABLE "bot_access" ADD CONSTRAINT "bot_access_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bot_access" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bot_access_tenant" ON "bot_access"
    USING ("spaceId" = current_setting('app.space_id', true));
CREATE POLICY "bot_access_system" ON "bot_access"
    USING ((SELECT app_rls_bypass()));
