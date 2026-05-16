CREATE TABLE "source_suggestions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key_id" uuid NOT NULL REFERENCES "translation_keys"("id") ON DELETE CASCADE,
  "value" text NOT NULL,
  "status" "translation_status" NOT NULL DEFAULT 'pending',
  "submitted_by" uuid REFERENCES "users"("id"),
  "reviewed_by" uuid REFERENCES "users"("id"),
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_at" timestamp with time zone
);
