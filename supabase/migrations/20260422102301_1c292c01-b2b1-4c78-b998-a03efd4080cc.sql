
-- Swing trades table
CREATE TABLE public.swing_trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  ticker TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  capital_invested NUMERIC NOT NULL,
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  exit_date DATE,
  stop_loss NUMERIC,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.swing_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_swing_trades_select" ON public.swing_trades FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_swing_trades_insert" ON public.swing_trades FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_swing_trades_update" ON public.swing_trades FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_swing_trades_delete" ON public.swing_trades FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_swing_trades_updated_at
  BEFORE UPDATE ON public.swing_trades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Swing settings table (one row per user)
CREATE TABLE public.swing_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  account_size NUMERIC,
  risk_percentage NUMERIC DEFAULT 1,
  finhub_api_key TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.swing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_swing_settings_select" ON public.swing_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_swing_settings_insert" ON public.swing_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_swing_settings_update" ON public.swing_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_swing_settings_delete" ON public.swing_settings FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_swing_settings_updated_at
  BEFORE UPDATE ON public.swing_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
