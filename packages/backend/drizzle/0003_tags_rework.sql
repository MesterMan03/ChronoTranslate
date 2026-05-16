-- Drop theme_colors column (now superseded by custom_tags with miniMessage format)
ALTER TABLE "projects" DROP COLUMN "theme_colors";

-- Reset custom_tags: old format was { name, display, color }, new format is { name, miniMessage }
UPDATE "projects" SET "custom_tags" = '[]'::jsonb;
