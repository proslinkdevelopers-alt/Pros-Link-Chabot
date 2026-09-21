-- =============================================================================
--  Pros-Link — enum values
--
--  Adds the tenant value PROSLINK and the pipeline, ticket, quote, role,
--  appointment and activity values the platform uses. Values are only ever
--  added: existing values stay, so rows written earlier remain valid.
--
--  Kept in its own migration because PostgreSQL cannot use an enum value in the
--  transaction that adds it; the next migration is free to.
-- =============================================================================

ALTER TYPE "ActivityType" ADD VALUE 'ASSIGNMENT';
ALTER TYPE "ActivityType" ADD VALUE 'STATUS_CHANGE';
ALTER TYPE "Department" ADD VALUE 'PROSLINK';
ALTER TYPE "LeadStage" ADD VALUE 'QUOTE_REQUESTED';
ALTER TYPE "LeadStage" ADD VALUE 'QUOTED';
ALTER TYPE "MeetingMode" ADD VALUE 'SITE_VISIT';
ALTER TYPE "MeetingMode" ADD VALUE 'PHONE_CALL';
ALTER TYPE "QuoteStatus" ADD VALUE 'REQUESTED';
ALTER TYPE "TicketCategory" ADD VALUE 'INSTALLATION';
ALTER TYPE "TicketCategory" ADD VALUE 'MAINTENANCE';
ALTER TYPE "TicketCategory" ADD VALUE 'REPAIR';
ALTER TYPE "TicketCategory" ADD VALUE 'SERVICE';
ALTER TYPE "TicketCategory" ADD VALUE 'PARTS';
ALTER TYPE "TicketCategory" ADD VALUE 'CALLBACK';
ALTER TYPE "TicketStatus" ADD VALUE 'ASSIGNED';
ALTER TYPE "TicketStatus" ADD VALUE 'TECHNICIAN_DISPATCHED';
ALTER TYPE "UserRole" ADD VALUE 'SALES';
ALTER TYPE "UserRole" ADD VALUE 'SUPPORT';
ALTER TYPE "UserRole" ADD VALUE 'TECHNICIAN';
ALTER TYPE "UserRole" ADD VALUE 'VIEWER';
