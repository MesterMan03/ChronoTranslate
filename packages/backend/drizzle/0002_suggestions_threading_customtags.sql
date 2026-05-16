ALTER TYPE "public"."translation_status" ADD VALUE 'superseded';--> statement-breakpoint
ALTER TABLE "translations" DROP CONSTRAINT "uq_translation_per_locale";--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "custom_tags" jsonb DEFAULT '[]'::jsonb NOT NULL;