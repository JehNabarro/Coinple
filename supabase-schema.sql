-- ============================================================
-- Coinple — Supabase Schema
-- Colar no SQL Editor do Supabase e executar
-- ============================================================

-- 1. Casais
CREATE TABLE IF NOT EXISTS couples (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code  TEXT UNIQUE DEFAULT encode(gen_random_bytes(4), 'hex'),
  total_budget DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Perfis (um por utilizador autenticado)
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT,
  email      TEXT,
  photo_url  TEXT,
  couple_id  UUID REFERENCES couples(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Orçamentos por categoria por casal
CREATE TABLE IF NOT EXISTS budgets (
  couple_id UUID          NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  category  TEXT          NOT NULL,
  amount    DECIMAL(10,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (couple_id, category)
);

-- 4. Eventos do casal
CREATE TABLE IF NOT EXISTS couple_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id    UUID          NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  name         TEXT          NOT NULL,
  emoji        TEXT          NOT NULL DEFAULT '🎉',
  total_budget DECIMAL(10,2) NOT NULL DEFAULT 0,
  start_date   DATE          NOT NULL,
  end_date     DATE          NOT NULL,
  categories   JSONB         NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_couple_events_couple ON couple_events(couple_id);

-- 5. Despesas
CREATE TABLE IF NOT EXISTS expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id   UUID          NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  event_id    UUID          REFERENCES couple_events(id) ON DELETE SET NULL,
  amount      DECIMAL(10,2) NOT NULL,
  description TEXT,
  category    TEXT          NOT NULL,
  payer_id    UUID          NOT NULL REFERENCES profiles(id),
  payer_name  TEXT,
  date        DATE          NOT NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE couples        ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE couple_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses       ENABLE ROW LEVEL SECURITY;

-- Helper: devolve o couple_id do utilizador autenticado
CREATE OR REPLACE FUNCTION my_couple_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT couple_id FROM profiles WHERE id = auth.uid()
$$;

-- Perfis: cada utilizador vê/edita só o seu
DROP POLICY IF EXISTS "profiles_own"   ON profiles;
CREATE POLICY "profiles_own" ON profiles
  FOR ALL USING (id = auth.uid());

-- Casais: só membros do casal
DROP POLICY IF EXISTS "couples_member" ON couples;
CREATE POLICY "couples_member" ON couples
  FOR ALL USING (id = my_couple_id());

-- Orçamentos: só o casal
DROP POLICY IF EXISTS "budgets_couple" ON budgets;
CREATE POLICY "budgets_couple" ON budgets
  FOR ALL USING (couple_id = my_couple_id());

-- Eventos: só o casal
DROP POLICY IF EXISTS "events_couple" ON couple_events;
CREATE POLICY "events_couple" ON couple_events
  FOR ALL USING (couple_id = my_couple_id());

-- Despesas: só o casal
DROP POLICY IF EXISTS "expenses_couple" ON expenses;
CREATE POLICY "expenses_couple" ON expenses
  FOR ALL USING (couple_id = my_couple_id());

-- ============================================================
-- Trigger: criar perfil automaticamente ao registar
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, name, email, photo_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
