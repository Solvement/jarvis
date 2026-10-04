CREATE TABLE "picks" (
	"edition" text NOT NULL,
	"item_id" text NOT NULL,
	"rank" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"payload" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "picks_edition_item_id_pk" PRIMARY KEY("edition","item_id")
);
--> statement-breakpoint
CREATE INDEX "picks_edition_idx" ON "picks" USING btree ("edition");