CREATE TABLE "Workspace" (
  "id" TEXT NOT NULL, "revision" INTEGER NOT NULL DEFAULT 0,
  "data" JSONB NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AlertDelivery" (
  "id" TEXT NOT NULL, "retryKey" TEXT NOT NULL,
  "message" TEXT NOT NULL, "sentAt" TIMESTAMP(3),
  CONSTRAINT "AlertDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AlertDelivery_retryKey_key" ON "AlertDelivery"("retryKey");
