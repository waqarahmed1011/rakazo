CREATE TABLE "browser_push_subscriptions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "sessionId" TEXT NOT NULL,
  "ciphertext" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "browser_push_subscriptions_userId_idx" ON "browser_push_subscriptions"("userId");
ALTER TABLE "browser_push_subscriptions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY browser_push_subscriptions_system ON "browser_push_subscriptions"
  USING ((SELECT app_rls_bypass()));
