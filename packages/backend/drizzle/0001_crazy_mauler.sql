ALTER TABLE "translation_files" ADD CONSTRAINT "uq_file_per_project" UNIQUE("project_id","file_path");--> statement-breakpoint
ALTER TABLE "translation_keys" ADD CONSTRAINT "uq_key_per_file" UNIQUE("file_id","key");--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "uq_translation_per_locale" UNIQUE("key_id","locale_id");