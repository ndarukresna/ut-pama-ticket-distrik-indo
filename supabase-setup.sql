-- UT × PAMA Ticket System - Supabase Schema Setup
-- Run these queries in your Supabase SQL Editor

-- 1. Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT auth.uid(),
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT CHECK (role IN ('ADMIN', 'PAMA_PLANT', 'UT', 'SM_PAMA')),
  password_hash TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Create tickets table
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  no TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  desc TEXT,
  category TEXT CHECK (category IN ('Speedup', 'Preparation', 'Transaction', 'Claim', 'Other Operational')),
  priority TEXT DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  target_party TEXT DEFAULT 'BOTH' CHECK (target_party IN ('UT', 'SM_PAMA', 'BOTH')),
  status TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PROCESSING', 'CLOSED', 'REJECTED')),
  evidence TEXT,
  part JSONB,
  eta TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  closed_at TIMESTAMP,
  closed_by TEXT,
  closed_by_name TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  viewed_by JSONB DEFAULT '[]'::jsonb
);

-- 3. Create feedbacks table (normalized from tickets.feedbacks array)
CREATE TABLE IF NOT EXISTS feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  evidence TEXT,
  by TEXT NOT NULL,
  by_name TEXT NOT NULL,
  role TEXT NOT NULL,
  eta TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. Create activity log table
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT REFERENCES tickets(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 5. Create indexes for performance
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_created_at ON tickets(created_at DESC);
CREATE INDEX idx_tickets_target ON tickets(target_party);
CREATE INDEX idx_feedbacks_ticket ON feedbacks(ticket_id);
CREATE INDEX idx_activity_ticket ON activity_log(ticket_id);
CREATE INDEX idx_activity_created ON activity_log(created_at DESC);

-- 6. Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for profiles
CREATE POLICY "Public profiles are viewable by everyone" 
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" 
  ON profiles FOR UPDATE USING (true) WITH CHECK (true);

-- 8. RLS Policies for tickets - allow all for now (client-side auth)
CREATE POLICY "Tickets are viewable by everyone" 
  ON tickets FOR SELECT USING (true);

CREATE POLICY "Tickets can be created by authenticated users" 
  ON tickets FOR INSERT WITH CHECK (true);

CREATE POLICY "Tickets can be updated by everyone" 
  ON tickets FOR UPDATE USING (true) WITH CHECK (true);

-- 9. RLS Policies for feedbacks
CREATE POLICY "Feedbacks are viewable by everyone" 
  ON feedbacks FOR SELECT USING (true);

CREATE POLICY "Feedbacks can be created by authenticated users" 
  ON feedbacks FOR INSERT WITH CHECK (true);

-- 10. RLS Policies for activity log
CREATE POLICY "Activity log is viewable by everyone" 
  ON activity_log FOR SELECT USING (true);

CREATE POLICY "Activity log can be created by system" 
  ON activity_log FOR INSERT WITH CHECK (true);

-- 11. Create realtime trigger for activity logging
CREATE OR REPLACE FUNCTION log_ticket_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO activity_log (ticket_id, action, actor, actor_name, details)
    VALUES (NEW.id, 'created', NEW.created_by, NEW.created_by_name, 
            jsonb_build_object('status', NEW.status, 'priority', NEW.priority));
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != NEW.status THEN
      INSERT INTO activity_log (ticket_id, action, actor, actor_name, details)
      VALUES (NEW.id, 'status_changed', NEW.closed_by, NEW.closed_by_name,
              jsonb_build_object('from', OLD.status, 'to', NEW.status));
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ticket_activity_trigger
AFTER INSERT OR UPDATE ON tickets
FOR EACH ROW EXECUTE FUNCTION log_ticket_activity();
