CREATE TABLE public.realised_pnl (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.realised_pnl ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_rpnl_select" ON public.realised_pnl FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_rpnl_insert" ON public.realised_pnl FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_rpnl_update" ON public.realised_pnl FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_rpnl_delete" ON public.realised_pnl FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER set_realised_pnl_updated_at
BEFORE UPDATE ON public.realised_pnl
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();