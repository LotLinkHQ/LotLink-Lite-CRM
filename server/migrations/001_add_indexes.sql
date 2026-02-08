-- Performance Indexes for RV Sales Mini CRM
-- Run this migration to dramatically improve query performance

-- Leads table indexes
CREATE INDEX IF NOT EXISTS idx_leads_dealership_status 
  ON leads(dealership_id, status);

CREATE INDEX IF NOT EXISTS idx_leads_created_at 
  ON leads(created_at DESC);

-- Inventory table indexes  
CREATE INDEX IF NOT EXISTS idx_inventory_dealership_status 
  ON inventory(dealership_id, status);

CREATE INDEX IF NOT EXISTS idx_inventory_arrival_date 
  ON inventory(arrival_date DESC);

-- Matches table indexes
CREATE INDEX IF NOT EXISTS idx_matches_lead_id 
  ON matches(lead_id);

CREATE INDEX IF NOT EXISTS idx_matches_inventory_id 
  ON matches(inventory_id);

CREATE INDEX IF NOT EXISTS idx_matches_status 
  ON matches(status);

CREATE INDEX IF NOT EXISTS idx_matches_created_at 
  ON matches(created_at DESC);

-- Dealership sessions index
CREATE INDEX IF NOT EXISTS idx_sessions_token 
  ON dealership_sessions(session_token);

CREATE INDEX IF NOT EXISTS idx_sessions_expires 
  ON dealership_sessions(expires_at);
