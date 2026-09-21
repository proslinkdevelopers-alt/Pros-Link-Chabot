-- =============================================================================
--  Pros-Link — platform tables and columns
--
--  Additive only. No table or column is dropped, renamed or rewritten, and no
--  existing row is updated.
--
--  * `department` on leads, customers, quotes, knowledge and bot events is
--    nullable with no default. The application stamps every row it writes
--    PROSLINK and filters on it; rows written by anything else stay NULL and
--    are never shown.
--  * Product catalogue: product_categories, brands, products.
--  * customer_assets: the machines a customer owns, for service history.
--  * Inbox fields on conversations (status, assignee, customer, tags, unread).
--  * Service fields on tickets (machine, model, serial, visit, attachments).
--  * Quote request fields on quotes; WhatsApp media references on messages.
-- =============================================================================

-- CreateEnum
CREATE TYPE "ProductAvailability" AS ENUM ('IN_STOCK', 'LIMITED_STOCK', 'OUT_OF_STOCK', 'ON_ORDER', 'ON_REQUEST', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "bot_events" ADD COLUMN     "department" "Department";

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "assigneeId" TEXT,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "intent" TEXT,
ADD COLUMN     "lastInboundAt" TIMESTAMP(3),
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "department" "Department",
ADD COLUMN     "lastInteractionAt" TIMESTAMP(3),
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "source" "LeadSource",
ADD COLUMN     "status" "CustomerStatus" NOT NULL DEFAULT 'PROSPECT',
ADD COLUMN     "whatsapp" TEXT;

-- AlterTable
ALTER TABLE "knowledge_base_marketing" ADD COLUMN     "department" "Department";

-- AlterTable
ALTER TABLE "marketing_leads" ADD COLUMN     "department" "Department",
ADD COLUMN     "preferredContact" TEXT,
ADD COLUMN     "productCategoryId" TEXT,
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "quantity" TEXT,
ADD COLUMN     "whatsapp" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "mediaId" TEXT,
ADD COLUMN     "mediaMime" TEXT,
ADD COLUMN     "mediaType" TEXT;

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "budget" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "conversationId" TEXT,
ADD COLUMN     "department" "Department",
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "preferredContact" TEXT,
ADD COLUMN     "productCategoryId" TEXT,
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "quantity" TEXT,
ADD COLUMN     "requirements" TEXT,
ADD COLUMN     "source" "LeadSource";

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "address" TEXT,
ADD COLUMN     "attachments" JSONB,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "company" TEXT,
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "dispatchedAt" TIMESTAMP(3),
ADD COLUMN     "machineBrand" TEXT,
ADD COLUMN     "machineModel" TEXT,
ADD COLUMN     "machineType" TEXT,
ADD COLUMN     "preferredDate" DATE,
ADD COLUMN     "preferredTime" TEXT,
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "serialNumber" TEXT,
ADD COLUMN     "source" "LeadSource";

-- CreateTable
CREATE TABLE "customer_assets" (
    "id" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT,
    "label" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "installedAt" DATE,
    "warrantyUntil" DATE,
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "website" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "slug" TEXT NOT NULL,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "categoryId" TEXT,
    "brandId" TEXT,
    "model" TEXT,
    "summary" TEXT,
    "description" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "specifications" JSONB,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "documents" JSONB,
    "availability" "ProductAvailability" NOT NULL DEFAULT 'ON_REQUEST',
    "status" "PublishState" NOT NULL DEFAULT 'DRAFT',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "relatedIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_assets_customerId_idx" ON "customer_assets"("customerId");

-- CreateIndex
CREATE INDEX "customer_assets_serialNumber_idx" ON "customer_assets"("serialNumber");

-- CreateIndex
CREATE INDEX "product_categories_department_isActive_sortOrder_idx" ON "product_categories"("department", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_department_slug_key" ON "product_categories"("department", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "brands_department_slug_key" ON "brands"("department", "slug");

-- CreateIndex
CREATE INDEX "products_department_status_categoryId_idx" ON "products"("department", "status", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "products_department_slug_key" ON "products"("department", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_department_sku_key" ON "products"("department", "sku");

-- CreateIndex
CREATE INDEX "bot_events_department_type_createdAt_idx" ON "bot_events"("department", "type", "createdAt");

-- CreateIndex
CREATE INDEX "conversations_department_status_updatedAt_idx" ON "conversations"("department", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "conversations_assigneeId_idx" ON "conversations"("assigneeId");

-- CreateIndex
CREATE INDEX "customers_department_name_idx" ON "customers"("department", "name");

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "knowledge_base_marketing_department_state_idx" ON "knowledge_base_marketing"("department", "state");

-- CreateIndex
CREATE INDEX "marketing_leads_department_stage_idx" ON "marketing_leads"("department", "stage");

-- CreateIndex
CREATE INDEX "marketing_leads_phone_idx" ON "marketing_leads"("phone");

-- CreateIndex
CREATE INDEX "notifications_userId_status_idx" ON "notifications"("userId", "status");

-- CreateIndex
CREATE INDEX "quotes_department_status_idx" ON "quotes"("department", "status");

-- CreateIndex
CREATE INDEX "tickets_department_status_idx" ON "tickets"("department", "status");

-- CreateIndex
CREATE INDEX "tickets_assigneeId_idx" ON "tickets"("assigneeId");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_leads" ADD CONSTRAINT "marketing_leads_productCategoryId_fkey" FOREIGN KEY ("productCategoryId") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_leads" ADD CONSTRAINT "marketing_leads_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_assets" ADD CONSTRAINT "customer_assets_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_assets" ADD CONSTRAINT "customer_assets_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_productCategoryId_fkey" FOREIGN KEY ("productCategoryId") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

