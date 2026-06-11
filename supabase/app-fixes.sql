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

CREATE OR REPLACE VIEW public.v_pool_ranking AS
SELECT
  pm.pool_id,
  pm.user_id,
  COALESCE(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    u.email,
    'Usuario ' || LEFT(pm.user_id::TEXT, 8)
  ) AS display_name,
  COALESCE(
    u.raw_user_meta_data ->> 'avatar_url',
    u.raw_user_meta_data ->> 'picture'
  ) AS avatar_url,
  COUNT(w.user_id) AS total_wins,
  COALESCE(SUM(w.gain_value), 0) AS total_gain
FROM public.pool_members pm
JOIN auth.users u ON u.id = pm.user_id
LEFT JOIN public.pool_match_winners w
  ON w.pool_id = pm.pool_id
 AND w.user_id = pm.user_id
WHERE pm.status <> 'REMOVIDO'
GROUP BY
  pm.pool_id,
  pm.user_id,
  display_name,
  avatar_url
ORDER BY
  total_gain DESC,
  total_wins DESC,
  display_name ASC;

CREATE TABLE IF NOT EXISTS public.pool_match_entries (
  pool_id UUID NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  paid_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (pool_id, match_id, user_id)
);

CREATE OR REPLACE VIEW public.v_pool_matches AS
SELECT
  pm.pool_id,
  pm.match_id,
  m.id,
  m.external_api,
  m.external_match_id,
  m.championship,
  m.phase,
  m.home,
  m.away,
  m.start_date,
  m.home_goals,
  m.away_goals,
  m.game_minute,
  m.period,
  m.status,
  pm.status AS pool_status,
  pm.total_value_in_game AS prize_value,
  p.ticket_value
FROM public.pool_matches pm
JOIN public.matches m ON m.id = pm.match_id
JOIN public.pools p ON p.id = pm.pool_id;

CREATE OR REPLACE VIEW public.v_pool_match_entries AS
SELECT
  pme.pool_id,
  pme.match_id,
  pme.user_id,
  COALESCE(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    u.email,
    'Usuario ' || LEFT(pme.user_id::TEXT, 8)
  ) AS display_name,
  COALESCE(
    u.raw_user_meta_data ->> 'avatar_url',
    u.raw_user_meta_data ->> 'picture'
  ) AS avatar_url,
  pme.status,
  pme.paid_value,
  pme.paid_at,
  pme.created_at
FROM public.pool_match_entries pme
JOIN auth.users u ON u.id = pme.user_id;

GRANT SELECT ON public.v_pool_members TO authenticated;
GRANT SELECT ON public.v_pool_matches TO authenticated;
GRANT SELECT ON public.v_pool_ranking TO authenticated;
GRANT SELECT ON public.v_pool_match_entries TO authenticated;

GRANT SELECT ON public.pools TO authenticated;
GRANT SELECT ON public.pool_members TO authenticated;
GRANT SELECT ON public.matches TO authenticated;
GRANT SELECT ON public.pool_matches TO authenticated;
GRANT SELECT ON public.pool_match_entries TO authenticated;
GRANT SELECT ON public.guesses TO authenticated;
GRANT SELECT ON public.pool_match_winners TO authenticated;

ALTER TABLE public.pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pool_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pool_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pool_match_entries ENABLE ROW LEVEL SECURITY;
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

DROP POLICY IF EXISTS "members can read pool match entries" ON public.pool_match_entries;
CREATE POLICY "members can read pool match entries"
ON public.pool_match_entries
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.pool_members pm
    WHERE pm.pool_id = pool_match_entries.pool_id
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

  DELETE FROM public.pool_match_entries
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

  DELETE FROM public.pool_match_entries
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

CREATE OR REPLACE FUNCTION public.refresh_pool_match_total(
  p_pool_id UUID,
  p_match_id UUID
)
RETURNS NUMERIC AS $$
DECLARE
  v_total_value NUMERIC(10,2);
BEGIN
  SELECT COALESCE(SUM(pme.paid_value), 0)
  INTO v_total_value
  FROM public.pool_match_entries pme
  WHERE pme.pool_id = p_pool_id
    AND pme.match_id = p_match_id
    AND pme.status = 'PAGO';

  UPDATE public.pool_matches
  SET total_value_in_game = COALESCE(v_total_value, 0)
  WHERE pool_id = p_pool_id
    AND match_id = p_match_id;

  RETURN COALESCE(v_total_value, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.ensure_pool_match_entries(
  p_pool_id UUID,
  p_match_id UUID
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.pool_match_entries (
    pool_id,
    match_id,
    user_id,
    status,
    paid_value
  )
  SELECT
    pm.pool_id,
    p_match_id,
    pm.user_id,
    'PENDENTE',
    0
  FROM public.pool_members pm
  WHERE pm.pool_id = p_pool_id
    AND pm.status <> 'REMOVIDO'
  ON CONFLICT (pool_id, match_id, user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.refresh_pool_match_total(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_pool_match_entries(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_match_to_pool(
  p_pool_id UUID,
  p_match_id UUID
)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_pool_admin(p_pool_id, auth.uid()) THEN
    RAISE EXCEPTION 'Apenas o administrador pode adicionar jogos.';
  END IF;

  INSERT INTO public.pool_matches (
    pool_id,
    match_id,
    total_value_in_game
  )
  VALUES (
    p_pool_id,
    p_match_id,
    0
  )
  ON CONFLICT (pool_id, match_id)
  DO NOTHING;

  PERFORM public.ensure_pool_match_entries(p_pool_id, p_match_id);
  PERFORM public.refresh_pool_match_total(p_pool_id, p_match_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.add_match_to_pool(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_match_entry_payment(
  p_pool_id UUID,
  p_match_id UUID,
  p_user_id UUID,
  p_paid_value NUMERIC
)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_pool_admin(p_pool_id, auth.uid()) THEN
    RAISE EXCEPTION 'Apenas o administrador pode confirmar entrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.pool_members pm
    WHERE pm.pool_id = p_pool_id
      AND pm.user_id = p_user_id
      AND pm.status <> 'REMOVIDO'
  ) THEN
    RAISE EXCEPTION 'Participante não encontrado neste bolão.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.pool_matches pool_match
    WHERE pool_match.pool_id = p_pool_id
      AND pool_match.match_id = p_match_id
  ) THEN
    RAISE EXCEPTION 'Jogo não encontrado neste bolão.';
  END IF;

  INSERT INTO public.pool_match_entries (
    pool_id,
    match_id,
    user_id,
    status,
    paid_value,
    paid_at
  )
  VALUES (
    p_pool_id,
    p_match_id,
    p_user_id,
    'PAGO',
    p_paid_value,
    NOW()
  )
  ON CONFLICT (pool_id, match_id, user_id)
  DO UPDATE SET
    status = 'PAGO',
    paid_value = EXCLUDED.paid_value,
    paid_at = EXCLUDED.paid_at;

  PERFORM public.refresh_pool_match_total(p_pool_id, p_match_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.remove_match_entry_payment(
  p_pool_id UUID,
  p_match_id UUID,
  p_user_id UUID
)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_pool_admin(p_pool_id, auth.uid()) THEN
    RAISE EXCEPTION 'Apenas o administrador pode desfazer entrada.';
  END IF;

  INSERT INTO public.pool_match_entries (
    pool_id,
    match_id,
    user_id,
    status,
    paid_value,
    paid_at
  )
  VALUES (
    p_pool_id,
    p_match_id,
    p_user_id,
    'PENDENTE',
    0,
    NULL
  )
  ON CONFLICT (pool_id, match_id, user_id)
  DO UPDATE SET
    status = 'PENDENTE',
    paid_value = 0,
    paid_at = NULL;

  PERFORM public.refresh_pool_match_total(p_pool_id, p_match_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.confirm_match_entry_payment(UUID, UUID, UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_match_entry_payment(UUID, UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_member_payment(
  p_pool_id UUID,
  p_user_id UUID,
  p_paid_value NUMERIC
)
RETURNS VOID AS $$
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.confirm_member_payment(UUID, UUID, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_member_payment(
  p_pool_id UUID,
  p_user_id UUID
)
RETURNS VOID AS $$
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.remove_member_payment(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_pool_member(
  p_pool_id UUID,
  p_user_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_match_id UUID;
BEGIN
  IF NOT public.is_pool_admin(p_pool_id, auth.uid()) THEN
    RAISE EXCEPTION 'Apenas o administrador pode remover participante.';
  END IF;

  UPDATE public.pool_members
  SET status = 'REMOVIDO',
      paid_value = 0,
      paid_date = NULL
  WHERE pool_id = p_pool_id
    AND user_id = p_user_id
    AND status <> 'REMOVIDO';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participante não encontrado ou já removido.';
  END IF;

  FOR v_match_id IN
    SELECT pme.match_id
    FROM public.pool_match_entries pme
    WHERE pme.pool_id = p_pool_id
      AND pme.user_id = p_user_id
  LOOP
    UPDATE public.pool_match_entries
    SET status = 'REMOVIDO',
        paid_value = 0,
        paid_at = NULL
    WHERE pool_id = p_pool_id
      AND match_id = v_match_id
      AND user_id = p_user_id;

    PERFORM public.refresh_pool_match_total(p_pool_id, v_match_id);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.remove_pool_member(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_pool_member(
  p_pool_id UUID,
  p_user_id UUID
)
RETURNS VOID AS $$
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

  INSERT INTO public.pool_match_entries (
    pool_id,
    match_id,
    user_id,
    status,
    paid_value
  )
  SELECT
    pool_match.pool_id,
    pool_match.match_id,
    p_user_id,
    'PENDENTE',
    0
  FROM public.pool_matches pool_match
  WHERE pool_match.pool_id = p_pool_id
  ON CONFLICT (pool_id, match_id, user_id)
  DO UPDATE SET
    status = 'PENDENTE',
    paid_value = 0,
    paid_at = NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.restore_pool_member(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_guess(
  p_pool_id UUID,
  p_match_id UUID,
  p_home_goals INTEGER,
  p_away_goals INTEGER
)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.pool_members pm
    WHERE pm.pool_id = p_pool_id
      AND pm.user_id = auth.uid()
      AND pm.status <> 'REMOVIDO'
  ) THEN
    RAISE EXCEPTION 'Voce nao participa deste bolao.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE m.id = p_match_id
      AND m.start_date <= NOW()
  ) THEN
    RAISE EXCEPTION 'Palpites encerrados para este jogo.';
  END IF;

  INSERT INTO public.guesses (
    pool_id,
    match_id,
    user_id,
    home_goals,
    away_goals
  )
  VALUES (
    p_pool_id,
    p_match_id,
    auth.uid(),
    p_home_goals,
    p_away_goals
  )
  ON CONFLICT (pool_id, match_id, user_id)
  DO UPDATE SET
    home_goals = EXCLUDED.home_goals,
    away_goals = EXCLUDED.away_goals,
    updated_at = NOW();

  INSERT INTO public.pool_match_entries (
    pool_id,
    match_id,
    user_id,
    status,
    paid_value
  )
  VALUES (
    p_pool_id,
    p_match_id,
    auth.uid(),
    'PENDENTE',
    0
  )
  ON CONFLICT (pool_id, match_id, user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.upsert_guess(UUID, UUID, INTEGER, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.calculate_all_pools_for_match(
  p_match_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_home_goals INTEGER;
  v_away_goals INTEGER;
  v_pool_id UUID;
  v_total_value NUMERIC(10,2);
  v_winners_count INTEGER;
BEGIN
  SELECT m.home_goals, m.away_goals
  INTO v_home_goals, v_away_goals
  FROM public.matches m
  WHERE m.id = p_match_id;

  IF v_home_goals IS NULL OR v_away_goals IS NULL THEN
    RAISE EXCEPTION 'Placar final ainda nao disponivel.';
  END IF;

  DELETE FROM public.pool_match_winners
  WHERE match_id = p_match_id;

  FOR v_pool_id IN
    SELECT pool_match.pool_id
    FROM public.pool_matches pool_match
    WHERE pool_match.match_id = p_match_id
  LOOP
    SELECT public.refresh_pool_match_total(v_pool_id, p_match_id)
    INTO v_total_value;

    SELECT COUNT(*)
    INTO v_winners_count
    FROM public.guesses g
    JOIN public.pool_match_entries pme
      ON pme.pool_id = g.pool_id
     AND pme.match_id = g.match_id
     AND pme.user_id = g.user_id
    WHERE g.pool_id = v_pool_id
      AND g.match_id = p_match_id
      AND pme.status = 'PAGO'
      AND g.home_goals = v_home_goals
      AND g.away_goals = v_away_goals;

    IF v_total_value > 0 AND v_winners_count > 0 THEN
      INSERT INTO public.pool_match_winners (
        pool_id,
        match_id,
        user_id,
        gain_value
      )
      SELECT
        g.pool_id,
        g.match_id,
        g.user_id,
        v_total_value / v_winners_count
      FROM public.guesses g
      JOIN public.pool_match_entries pme
        ON pme.pool_id = g.pool_id
       AND pme.match_id = g.match_id
       AND pme.user_id = g.user_id
      WHERE g.pool_id = v_pool_id
        AND g.match_id = p_match_id
        AND pme.status = 'PAGO'
        AND g.home_goals = v_home_goals
        AND g.away_goals = v_away_goals;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.calculate_all_pools_for_match(UUID) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
