-- Correcoes usadas pelo frontend do Hexa Vem.
-- Rode este arquivo no Supabase SQL Editor.

CREATE OR REPLACE VIEW public.v_pool_members AS
SELECT
  pm.pool_id,
  pm.user_id,
  COALESCE(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    u.email
  ) AS display_name,
  COALESCE(
    u.raw_user_meta_data ->> 'avatar_url',
    u.raw_user_meta_data ->> 'picture'
  ) AS avatar_url,
  pm.role,
  pm.status,
  pm.paid_value,
  pm.paid_date AS paid_at,
  pm.entered,
  p.name AS pool_name,
  p.code AS pool_code,
  p.ticket_value,
  CASE WHEN p.status THEN 'ATIVO' ELSE 'INATIVO' END AS pool_status
FROM public.pool_members pm
JOIN public.pools p ON p.id = pm.pool_id
JOIN auth.users u ON u.id = pm.user_id;

GRANT SELECT ON public.v_pool_members TO authenticated;
GRANT SELECT ON public.v_pool_matches TO authenticated;
GRANT SELECT ON public.v_pool_ranking TO authenticated;

GRANT SELECT ON public.pools TO authenticated;
GRANT SELECT ON public.pool_members TO authenticated;
GRANT SELECT ON public.matches TO authenticated;
GRANT SELECT ON public.pool_matches TO authenticated;
GRANT SELECT ON public.guesses TO authenticated;
GRANT SELECT ON public.pool_match_winners TO authenticated;

ALTER TABLE public.pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pool_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pool_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pool_match_winners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members can read own memberships" ON public.pool_members;
CREATE POLICY "members can read own memberships"
ON public.pool_members
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "pool admins can read pool memberships" ON public.pool_members;
CREATE POLICY "pool admins can read pool memberships"
ON public.pool_members
FOR SELECT
TO authenticated
USING (public.is_pool_admin(pool_id, auth.uid()));

DROP POLICY IF EXISTS "pool creators can read their pools" ON public.pools;
CREATE POLICY "pool creators can read their pools"
ON public.pools
FOR SELECT
TO authenticated
USING (created_by = auth.uid());

DROP POLICY IF EXISTS "members can read their pools" ON public.pools;
CREATE POLICY "members can read their pools"
ON public.pools
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.pool_members pm
    WHERE pm.pool_id = pools.id
      AND pm.user_id = auth.uid()
      AND pm.status <> 'REMOVIDO'
  )
);

DROP POLICY IF EXISTS "authenticated can read matches" ON public.matches;
CREATE POLICY "authenticated can read matches"
ON public.matches
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "members can read pool matches" ON public.pool_matches;
CREATE POLICY "members can read pool matches"
ON public.pool_matches
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.pool_members pm
    WHERE pm.pool_id = pool_matches.pool_id
      AND pm.user_id = auth.uid()
      AND pm.status <> 'REMOVIDO'
  )
);

DROP POLICY IF EXISTS "members can read own guesses" ON public.guesses;
CREATE POLICY "members can read own guesses"
ON public.guesses
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "members can read pool guesses" ON public.guesses;
CREATE POLICY "members can read pool guesses"
ON public.guesses
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.pool_members pm
    WHERE pm.pool_id = guesses.pool_id
      AND pm.user_id = auth.uid()
      AND pm.status <> 'REMOVIDO'
  )
);

DROP POLICY IF EXISTS "members can read pool winners" ON public.pool_match_winners;
CREATE POLICY "members can read pool winners"
ON public.pool_match_winners
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.pool_members pm
    WHERE pm.pool_id = pool_match_winners.pool_id
      AND pm.user_id = auth.uid()
      AND pm.status <> 'REMOVIDO'
  )
);

CREATE OR REPLACE FUNCTION public.delete_pool(p_pool_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_pool_admin(p_pool_id, auth.uid()) THEN
    RAISE EXCEPTION 'Apenas o administrador pode excluir o bolão.';
  END IF;

  DELETE FROM public.pool_match_winners
  WHERE pool_id = p_pool_id;

  DELETE FROM public.guesses
  WHERE pool_id = p_pool_id;

  DELETE FROM public.pool_matches
  WHERE pool_id = p_pool_id;

  DELETE FROM public.pool_members
  WHERE pool_id = p_pool_id;

  DELETE FROM public.pools
  WHERE id = p_pool_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bolão não encontrado.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.delete_pool(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_match_from_pool(
  p_pool_id UUID,
  p_match_id UUID
)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_pool_admin(p_pool_id, auth.uid()) THEN
    RAISE EXCEPTION 'Apenas o administrador pode remover jogos.';
  END IF;

  DELETE FROM public.pool_match_winners
  WHERE pool_id = p_pool_id
    AND match_id = p_match_id;

  DELETE FROM public.guesses
  WHERE pool_id = p_pool_id
    AND match_id = p_match_id;

  DELETE FROM public.pool_matches
  WHERE pool_id = p_pool_id
    AND match_id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jogo não encontrado neste bolão.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.remove_match_from_pool(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_pool_members(p_pool_id UUID)
RETURNS TABLE (
  pool_id UUID,
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  role public.member_role,
  status public.member_status,
  paid_value NUMERIC,
  paid_at TIMESTAMPTZ,
  entered TIMESTAMPTZ
) AS $$
  SELECT
    pm.pool_id,
    pm.user_id,
    COALESCE(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      u.email
    ) AS display_name,
    COALESCE(
      u.raw_user_meta_data ->> 'avatar_url',
      u.raw_user_meta_data ->> 'picture'
    ) AS avatar_url,
    pm.role,
    pm.status,
    pm.paid_value,
    pm.paid_date AS paid_at,
    pm.entered
  FROM public.pool_members pm
  JOIN auth.users u ON u.id = pm.user_id
  WHERE pm.pool_id = p_pool_id
    AND EXISTS (
      SELECT 1
      FROM public.pool_members viewer
      WHERE viewer.pool_id = p_pool_id
        AND viewer.user_id = auth.uid()
        AND viewer.status <> 'REMOVIDO'
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, auth;

GRANT EXECUTE ON FUNCTION public.get_pool_members(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_match_to_pool(
  p_pool_id UUID,
  p_match_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_total_value NUMERIC(10,2);
BEGIN
  IF NOT public.is_pool_admin(p_pool_id, auth.uid()) THEN
    RAISE EXCEPTION 'Apenas o administrador pode adicionar jogos.';
  END IF;

  SELECT
    COALESCE(SUM(pm.paid_value), 0) + COALESCE(MAX(p.current_accumulated), 0)
  INTO v_total_value
  FROM public.pools p
  LEFT JOIN public.pool_members pm
    ON pm.pool_id = p.id
   AND pm.status = 'PAGO'
  WHERE p.id = p_pool_id;

  INSERT INTO public.pool_matches (
    pool_id,
    match_id,
    total_value_in_game
  )
  VALUES (
    p_pool_id,
    p_match_id,
    COALESCE(v_total_value, 0)
  )
  ON CONFLICT (pool_id, match_id)
  DO UPDATE SET total_value_in_game = EXCLUDED.total_value_in_game;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.add_match_to_pool(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_member_payment(
  p_pool_id UUID,
  p_user_id UUID,
  p_paid_value NUMERIC
)
RETURNS VOID AS $$
DECLARE
  v_total_value NUMERIC(10,2);
BEGIN
  IF NOT public.is_pool_admin(p_pool_id, auth.uid()) THEN
    RAISE EXCEPTION 'Apenas o administrador pode confirmar pagamento.';
  END IF;

  UPDATE public.pool_members
  SET status = 'PAGO',
      paid_value = p_paid_value,
      paid_date = NOW()
  WHERE pool_id = p_pool_id
    AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participante não encontrado.';
  END IF;

  SELECT
    COALESCE(SUM(pm.paid_value), 0) + COALESCE(MAX(p.current_accumulated), 0)
  INTO v_total_value
  FROM public.pools p
  LEFT JOIN public.pool_members pm
    ON pm.pool_id = p.id
   AND pm.status = 'PAGO'
  WHERE p.id = p_pool_id;

  UPDATE public.pool_matches
  SET total_value_in_game = COALESCE(v_total_value, 0)
  WHERE pool_id = p_pool_id
    AND status = 'AGUARDANDO';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.confirm_member_payment(UUID, UUID, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_member_payment(
  p_pool_id UUID,
  p_user_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_total_value NUMERIC(10,2);
BEGIN
  IF NOT public.is_pool_admin(p_pool_id, auth.uid()) THEN
    RAISE EXCEPTION 'Apenas o administrador pode desfazer pagamento.';
  END IF;

  UPDATE public.pool_members
  SET status = 'PENDENTE',
      paid_value = 0,
      paid_date = NULL
  WHERE pool_id = p_pool_id
    AND user_id = p_user_id
    AND status <> 'REMOVIDO';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participante não encontrado ou removido.';
  END IF;

  SELECT
    COALESCE(SUM(pm.paid_value), 0) + COALESCE(MAX(p.current_accumulated), 0)
  INTO v_total_value
  FROM public.pools p
  LEFT JOIN public.pool_members pm
    ON pm.pool_id = p.id
   AND pm.status = 'PAGO'
  WHERE p.id = p_pool_id;

  UPDATE public.pool_matches
  SET total_value_in_game = COALESCE(v_total_value, 0)
  WHERE pool_id = p_pool_id
    AND status = 'AGUARDANDO';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.remove_member_payment(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_pool_member(
  p_pool_id UUID,
  p_user_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_total_value NUMERIC(10,2);
BEGIN
  IF NOT public.is_pool_admin(p_pool_id, auth.uid()) THEN
    RAISE EXCEPTION 'Apenas o administrador pode restaurar participante.';
  END IF;

  UPDATE public.pool_members
  SET status = 'PENDENTE',
      paid_value = 0,
      paid_date = NULL
  WHERE pool_id = p_pool_id
    AND user_id = p_user_id
    AND status = 'REMOVIDO';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participante removido não encontrado.';
  END IF;

  SELECT
    COALESCE(SUM(pm.paid_value), 0) + COALESCE(MAX(p.current_accumulated), 0)
  INTO v_total_value
  FROM public.pools p
  LEFT JOIN public.pool_members pm
    ON pm.pool_id = p.id
   AND pm.status = 'PAGO'
  WHERE p.id = p_pool_id;

  UPDATE public.pool_matches
  SET total_value_in_game = COALESCE(v_total_value, 0)
  WHERE pool_id = p_pool_id
    AND status = 'AGUARDANDO';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.restore_pool_member(UUID, UUID) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
