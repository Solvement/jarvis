CREATE TABLE "source_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"kind" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "source_documents_item_idx" ON "source_documents" USING btree ("item_id","fetched_at");