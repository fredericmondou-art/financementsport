-- =============================================================================
-- Tâche 0.3 — Création automatique d'un `profiles` à chaque nouvel
-- `auth.users` (inscription Supabase Auth).
--
-- Pourquoi un trigger plutôt qu'un insert applicatif : garantit qu'AUCUN
-- chemin d'inscription (UI, admin, import) ne peut créer un auth.users sans
-- profil lié — invariant requis par les FK `profiles(id) REFERENCES
-- auth.users(id)` utilisées partout ailleurs dans le schéma.
--
-- Le rôle par défaut est 'client' (DEFAULT déjà dans le schéma). email et
-- full_name sont repris de auth.users / raw_user_meta_data.full_name si
-- fourni à l'inscription (voir app/(auth)/signup).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();
