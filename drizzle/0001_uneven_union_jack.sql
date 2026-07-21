CREATE TABLE "push_gate_funnel" (
	"visitor_id" uuid PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"shown_at" timestamp with time zone,
	"prompt_reached_at" timestamp with time zone,
	"granted_at" timestamp with time zone,
	CONSTRAINT "push_gate_funnel_platform_check" CHECK ("push_gate_funnel"."platform" in ('ios', 'other'))
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "push_gate_funnel" ADD CONSTRAINT "push_gate_funnel_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "message_translations_message_lang_idx" ON "message_translations" USING btree ("message_id","target_lang");