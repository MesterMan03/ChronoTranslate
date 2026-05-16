CREATE TABLE "project_bans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "banned_by" uuid REFERENCES "users"("id"),
  "banned_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_ban_per_project" UNIQUE("project_id", "user_id")
);
