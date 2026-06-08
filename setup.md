### Step 1: Database Setup & Policy Configuration (Supabase Console)

To initialize your entire database infrastructure, relations, security policies, and sync triggers in a single step:

1. Log into your **Supabase Dashboard** and navigate to your project workspace.
2. Open the **SQL Editor** tab from the left sidebar navigation menu.
3. Click **New Query**, paste the complete initialization script below, and hit **Run**:

```sql
-- =====================================================================
-- 1. CLEAN UP STRUCTURE (Ensures a fresh setup if run multiple times)
-- =====================================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_profile_modified ON public.profiles;
DROP TABLE IF EXISTS public.itineraries;
DROP TABLE IF EXISTS public.profiles;

-- =====================================================================
-- 2. CREATE SCHEMAS & RELATIONSHIPS
-- =====================================================================

-- Table A: User Profile Metadata Context Cache
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

-- Table B: Itinerary Persistence & Travel Configurations
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

-- =====================================================================
-- 3. ROW LEVEL SECURITY (RLS) & POLICIES
-- =====================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;

-- Security Firewalls: Isolate data so users can only access their own records
CREATE POLICY "Users can manage their own profiles" 
ON public.profiles FOR ALL TO authenticated 
USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));

CREATE POLICY "Users can manage their own itineraries" 
ON public.itineraries FOR ALL TO authenticated 
USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

-- =====================================================================
-- 4. AUTOMATION PROCEDURES & TRIGGERS (PL/pgSQL)
-- =====================================================================

-- Sync Profiles instantly upon new user registration
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

-- Auto update 'modified_at' timestamps upon profile update edits
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