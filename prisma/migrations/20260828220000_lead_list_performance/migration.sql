-- Align the main lead list filters and ordering with their database indexes.
CREATE INDEX "leads_organization_id_archived_at_city_idx"
ON "leads"("organization_id", "archived_at", "city");

CREATE INDEX "leads_organization_id_archived_at_category_name_idx"
ON "leads"("organization_id", "archived_at", "category_name");

CREATE INDEX "leads_list_order_idx"
ON "leads"("organization_id", "archived_at", "next_follow_up_at", "priority" DESC, "created_at" DESC);

CREATE INDEX "leads_assignee_list_order_idx"
ON "leads"("organization_id", "assignee_id", "archived_at", "next_follow_up_at", "priority" DESC, "created_at" DESC);

-- The free-text search uses contains/ILIKE for these fields.
CREATE INDEX "leads_place_id_trgm_idx" ON "leads" USING GIN ("place_id" gin_trgm_ops);
CREATE INDEX "leads_phone_normalized_trgm_idx" ON "leads" USING GIN ("phone_normalized" gin_trgm_ops);
