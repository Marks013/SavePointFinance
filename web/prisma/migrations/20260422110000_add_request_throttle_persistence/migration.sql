CREATE TABLE "RequestThrottle" (
  "id" TEXT NOT NULL,
  "namespace" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "hits" JSONB NOT NULL,
  "windowMs" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RequestThrottle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RequestThrottle_namespace_key_key" ON "RequestThrottle"("namespace", "key");
CREATE INDEX "RequestThrottle_updatedAt_idx" ON "RequestThrottle"("updatedAt");
