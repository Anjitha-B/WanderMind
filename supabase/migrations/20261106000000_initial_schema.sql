-- PROVISIONAL BASELINE. Replace with the output of `supabase db pull` before
-- running `migration repair`. See setup.md.
--
-- Built from setup.md plus the reported live policies, so the local stack can run.
-- It does not yet prove the live columns or function bodies match.
-- This file is marked applied on the live project and never runs there.

CREATE TABLE public.profiles (
    id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    firstname text,
    lastname text,
    date_of_birth date,
    home_country text,
    preferred_currency text DEFAULT 'USD'::text,
    preferrences text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    modified_at timestamp with time zone
);

CREATE TABLE public.itineraries (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    destination text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    interests jsonb,
    itinerary_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;

-- Live policies, which differ from setup.md's single FOR ALL profiles policy.
CREATE POLICY "Users can read own profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can manage their own itineraries"
ON public.itineraries FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id)
    VALUES (new.id);
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_profile_modification()
RETURNS trigger AS $$
BEGIN
    new.modified_at = now();
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_modified
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE PROCEDURE public.handle_profile_modification();
