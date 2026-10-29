CREATE TABLE "chat_turns" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"item_id" text NOT NULL,
	"question" text NOT NULL,
	"answer" text DEFAULT '' NOT NULL,
	"status" text NOT NULL,
	"model" text NOT NULL,
	"version" text NOT NULL,
	"context" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_collections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_collections" ADD CONSTRAINT "personal_collections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_user_item_idx" ON "chat_turns" USING btree ("user_id","item_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_one_stream_per_user" ON "chat_turns" USING btree ("user_id") WHERE "chat_turns"."status" = 'streaming';--> statement-breakpoint
CREATE INDEX "collections_user_idx" ON "personal_collections" USING btree ("user_id");