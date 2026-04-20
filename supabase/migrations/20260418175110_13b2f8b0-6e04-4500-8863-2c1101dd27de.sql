
-- Accounts: user-defined accounts (Cash, ISA, Crypto, etc.)
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  asset_class TEXT NOT NULL CHECK (asset_class IN ('Cash','Crypto','Shares')),
  target_allocation NUMERIC,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_accounts_user ON public.accounts(user_id);

-- Transactions
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  from_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  to_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  type TEXT NOT NULL CHECK (type IN ('Deposit','Withdrawal','Transfer','Investment','Profit Taken')),
  asset_class TEXT NOT NULL CHECK (asset_class IN ('Cash','Crypto','Shares')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tx_user_date ON public.transactions(user_id, occurred_on DESC);

-- Monthly snapshots: balances per account per month
CREATE TABLE public.snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  month DATE NOT NULL, -- first day of month
  amount_now NUMERIC NOT NULL,
  cash_portion NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, account_id, month)
);
CREATE INDEX idx_snap_user_month ON public.snapshots(user_id, month DESC);

-- Realised PnL entries
CREATE TABLE public.realised_pnl (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rpnl_user_date ON public.realised_pnl(user_id, occurred_on DESC);

-- Profile to track onboarding
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  onboarded BOOLEAN NOT NULL DEFAULT false,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_accounts_u BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tx_u BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_snap_u BEFORE UPDATE ON public.snapshots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_rpnl_u BEFORE UPDATE ON public.realised_pnl FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_profiles_u BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable RLS
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realised_pnl ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies: owner-only for everything
CREATE POLICY "own_accounts_select" ON public.accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_accounts_insert" ON public.accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_accounts_update" ON public.accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_accounts_delete" ON public.accounts FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "own_tx_select" ON public.transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_tx_insert" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_tx_update" ON public.transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_tx_delete" ON public.transactions FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "own_snap_select" ON public.snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_snap_insert" ON public.snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_snap_update" ON public.snapshots FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_snap_delete" ON public.snapshots FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "own_rpnl_select" ON public.realised_pnl FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_rpnl_insert" ON public.realised_pnl FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_rpnl_update" ON public.realised_pnl FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_rpnl_delete" ON public.realised_pnl FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "own_profile_select" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_profile_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_profile_update" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
