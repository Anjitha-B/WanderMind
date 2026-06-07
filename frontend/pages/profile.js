import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../utils/supabase';
import Link from 'next/link';

export default function Profile() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });
    
  // Explicit form state hooks matching your exact table structure
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [homeCountry, setHomeCountry] = useState('');
  const [preferredCurrency, setPreferredCurrency] = useState('USD');
  const [preferences, setPreferences] = useState('');
  const [columnProfile, setColumnProfile] = useState('default');
  const [profileColumns, setProfileColumns] = useState([]);
  const [profileExists, setProfileExists] = useState(false);

  const profileColumnMaps = {
    default: {
      firstName: 'first_name',
      lastName: 'last_name',
      dateOfBirth: 'date_of_birth',
      homeCountry: 'home_country',
      preferredCurrency: 'preferred_currency',
      preferences: 'preferences',
    },
    legacy: {
      firstName: 'firstname',
      lastName: 'lastname',
      dateOfBirth: 'date_of_birth',
      homeCountry: 'home_country',
      preferredCurrency: 'preferred_currency',
      preferences: 'preferences',
    },
  };

  useEffect(() => {
    const fetchProfileData = async () => {
      // 1. Grab active token user session details
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      
      const currentUser = session.user;
      setUser(currentUser);

      // 2. Fetch specific records matching your exact profile column parameters
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (error) {
        setMessage({
          type: 'error',
          text: `Unable to load traveler profile details. ${error.message || ''}`.trim(),
        });
        setLoading(false);
        return;
      }

      if (data) {
        const hasDefaultColumns =
          'first_name' in data ||
          'last_name' in data ||
          'preferred_currency' in data ||
          'preferences' in data;
        const hasLegacyColumns =
          'firstname' in data ||
          'lastname' in data ||
          'preferred_currency' in data ||
          'preferences' in data;

        const resolvedColumnProfile = hasDefaultColumns ? 'default' : hasLegacyColumns ? 'legacy' : 'default';
        setColumnProfile(resolvedColumnProfile);
        setProfileColumns(Object.keys(data || {}));
  setProfileExists(true);

        setFirstName(data.first_name ?? data.firstname ?? '');
        setLastName(data.last_name ?? data.lastname ?? '');
        setDateOfBirth(data.date_of_birth ?? '');
        setHomeCountry(data.home_country ?? '');
        setPreferredCurrency(data.preferred_currency ?? data.preferred_currency ?? 'USD');
        setPreferences(data.preferences ?? data.preferences ?? '');
      }
      setLoading(false);
    };

    fetchProfileData();
  }, [router]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    // --- VALIDATION CHECK BLOCK ---
  
    // Clean empty whitespace spaces
    const cleanFirst = firstName.trim();
    const cleanLast = lastName.trim();

    // Rule A: Enforce minimum string lengths for names
    if (cleanFirst.length < 2 || cleanLast.length < 2) {
        setMessage({ type: 'error', text: 'First name and Last name must be at least 2 characters long.' });
        return; // Stops the function here! Does NOT save to Supabase.
    }

    // Rule B: Prevent entering numeric symbols or gibberish in name spaces
    const nameRegex = /^[A-Za-z\s\-]+$/;
    if (!nameRegex.test(cleanFirst) || !nameRegex.test(cleanLast)) {
        setMessage({ type: 'error', text: 'Names can only contain alphabetical letters, spaces, or hyphens.' });
        return;
    }

    // Rule C: Validate logical Date of Birth boundaries
    if (dateOfBirth) {
        const chosenBirthDate = new Date(dateOfBirth);
        const today = new Date();
    
    // Check 1: Can't be born in the future
    if (chosenBirthDate > today) {
        setMessage({ type: 'error', text: 'Date of birth cannot be a future calendar date.' });
        return;
    }
    
    // Check 2: Logical upper age limit (e.g., older than 120 years)
    const maxAgeDate = new Date();
    maxAgeDate.setFullYear(today.getFullYear() - 120);
    if (chosenBirthDate < maxAgeDate) {
        setMessage({ type: 'error', text: 'Please input a realistic date of birth.' });
        return;
    }
    }

    // Save/Update records using clean upsert bound to user UUID
    setSaving(true);
    const activeColumnMap = profileColumnMaps[columnProfile] || profileColumnMaps.default;
    const buildPayload = (columnMap, includeId = false) => {
      const payload = {
        [columnMap.firstName]: cleanFirst,
        [columnMap.lastName]: cleanLast,
        [columnMap.dateOfBirth]: dateOfBirth || null,
        [columnMap.homeCountry]: homeCountry,
        [columnMap.preferredCurrency]: preferredCurrency,
        [columnMap.preferences]: preferences,
      };
      if (includeId) {
        payload.id = user.id;
      }
      return payload;
    };

  const payload = buildPayload(activeColumnMap, !profileExists);
    const defaultColumnSet = [
      'id',
      'first_name',
      'last_name',
      'date_of_birth',
      'home_country',
      'preferred_currency',
      'preferences',
    ];
    const legacyColumnSet = [
      'id',
      'firstname',
      'lastname',
      'date_of_birth',
      'home_country',
      'preferred_currency',
      'preferences',
    ];
    const allowedColumns = new Set([
      ...defaultColumnSet,
      ...legacyColumnSet,
      ...(profileColumns.length > 0 ? profileColumns : []),
    ]);

    const sanitizedPayload = Object.fromEntries(
      Object.entries(payload).filter(([key]) => allowedColumns.has(key))
    );

    const saveQuery = profileExists
      ? supabase.from('profiles').update(sanitizedPayload).eq('id', user.id).select().maybeSingle()
      : supabase.from('profiles').insert(sanitizedPayload).select().maybeSingle();

    let { data: savedRow, error } = await saveQuery;

    if (error && columnProfile !== 'legacy') {
      const fallbackMap = profileColumnMaps.legacy;
  const fallbackPayload = buildPayload(fallbackMap, !profileExists);
      const sanitizedFallback = Object.fromEntries(
        Object.entries(fallbackPayload).filter(([key]) => allowedColumns.has(key))
      );
      const fallbackQuery = profileExists
        ? supabase.from('profiles').update(sanitizedFallback).eq('id', user.id).select().maybeSingle()
        : supabase.from('profiles').insert(sanitizedFallback).select().maybeSingle();
      const fallbackResult = await fallbackQuery;
      error = fallbackResult.error;
      savedRow = fallbackResult.data;
      if (!error) {
        setColumnProfile('legacy');
      }
    }

    setSaving(false);
    if (!error && !savedRow) {
      error = {
        code: 'NO_ROWS_UPDATED',
        message: 'Update succeeded but no rows were returned. Verify profile ownership and RLS policies.',
      };
    }

    if (error) {
      const errorContext = [error.code, error.details, error.message].filter(Boolean).join(' - ');
      const errorText = errorContext
        ? `Failed to update traveler details. ${errorContext}`
        : 'Failed to update traveler details. Please try again.';
      setMessage({ type: 'error', text: errorText });
    } else {
      setMessage({ type: 'success', text: 'WanderMind profile updated successfully!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-50">
        <p className="text-slate-500 animate-pulse font-medium">Loading your profile environment...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        
        {/* Profile Top Banner Styling */}
        <div className="h-32 bg-[#652C15] w-full" />

        <div className="p-8 relative">
          
          {/* Circular Profile Avatar Overlay placement */}
          <div className="absolute -top-16 left-8">
            <img 
              src="/Profile-icon-2.png" 
              alt="Traveler Avatar" 
              className="w-24 h-24 rounded-full border-4 border-white object-cover shadow-md"
            />
          </div>

          <div className="pt-12">
            <h1 className="text-2xl font-bold text-slate-800">Traveler Profile</h1>
            <p className="text-sm text-slate-400 mb-6">Manage your core travel constraints and defaults</p>

            {/* Notification Feedback Toast Area */}
            {message.text && (
              <div className={`p-4 rounded-xl mb-6 text-sm font-medium ${
                message.type === 'success' 
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                  : 'bg-rose-50 text-rose-700 border border-rose-100'
              }`}>
                {message.text}
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-5">
              
              {/* Account Meta Columns (Read Only Sync with internal System) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Account Email</label>
                  <input type="text" disabled value={user?.email || ''} className="w-full mt-1 p-2.5 bg-slate-100 text-slate-500 rounded-xl text-sm border-none outline-none cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Join Date (System Record)</label>
                  <input 
                    type="text" 
                    disabled 
                    value={new Date(user?.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} 
                    className="w-full mt-1 p-2.5 bg-slate-100 text-slate-500 rounded-xl text-sm border-none outline-none cursor-not-allowed" 
                  />
                </div>
              </div>

              <hr className="border-slate-100 my-4" />

              {/* Editable Name Inputs Area */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">First Name</label>
                  <input 
                    type="text" 
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name" 
                    className="w-full mt-1 p-2.5 bg-white text-slate-700 rounded-xl text-sm border border-slate-200 focus:border-[#652C15] focus:ring-1 focus:ring-[#652C15] outline-none transition" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Name</label>
                  <input 
                    type="text" 
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name" 
                    className="w-full mt-1 p-2.5 bg-white text-slate-700 rounded-xl text-sm border border-slate-200 focus:border-[#652C15] focus:ring-1 focus:ring-[#652C15] outline-none transition" 
                  />
                </div>
              </div>

              {/* Home Country & Date of Birth Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Home Country</label>
                  <input 
                    type="text" 
                    value={homeCountry}
                    onChange={(e) => setHomeCountry(e.target.value)}
                    placeholder="e.g. United States, India" 
                    className="w-full mt-1 p-2.5 bg-white text-slate-700 rounded-xl text-sm border border-slate-200 focus:border-[#652C15] focus:ring-1 focus:ring-[#652C15] outline-none transition" 
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Date of Birth</label>
                  <input 
                    type="date" 
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full mt-1 p-2.5 bg-white text-slate-700 rounded-xl text-sm border border-slate-200 focus:border-[#652C15] focus:ring-1 focus:ring-[#652C15] outline-none transition cursor-pointer" 
                  />
                </div>
              </div>

              {/* Preferred Currency Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Preferred Currency</label>
                <select 
                  value={preferredCurrency}
                  onChange={(e) => setPreferredCurrency(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-white text-slate-700 rounded-xl text-sm border border-slate-200 focus:border-[#652C15] focus:ring-1 focus:ring-[#652C15] outline-none transition cursor-pointer"
                >
                  <option value="USD">USD ($) - US Dollar</option>
                  <option value="EUR">EUR (€) - Euro</option>
                  <option value="GBP">GBP (£) - British Pound</option>
                  <option value="INR">INR (₹) - Indian Rupee</option>
                  <option value="AUD">AUD ($) - Australian Dollar</option>
                  <option value="SGD">SGD ($) - Singapore Dollar</option>
                  <option value="JPY">JPY (¥) - Japanese Yen</option>
                </select>
              </div>

              {/* Preferences Configuration Box - Fuel for your future Agents! */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Travel Preferences & Dietary Restraints</label>
                <textarea 
                  rows={3}
                  value={preferences}
                  onChange={(e) => setPreferences(e.target.value)}
                  placeholder="e.g., Vegetarian diet only, slow travel pacing, focused on cultural landmarks and historical museums, budget backpacker style." 
                  className="w-full mt-1 p-2.5 bg-white text-slate-700 rounded-xl text-sm border border-slate-200 focus:border-[#652C15] focus:ring-1 focus:ring-[#652C15] outline-none transition resize-none"
                />
                <p className="text-slate-400 text-[11px] mt-1">
                  💡 These configurations will automatically guide the background agents when formulating upcoming custom itineraries.
                </p>
              </div>

              {/* Navigation Elements Bar Footer Section */}
              <div className="mt-8 pt-6 border-t border-slate-100 flex justify-between items-center">
                <Link href="/home" className="px-5 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition font-medium text-sm">
                  ← Back to Planner
                </Link>

                <button 
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 rounded-xl bg-[#652C15] text-white font-medium text-sm hover:bg-[#4a1f0e] disabled:bg-slate-300 transition duration-200 shadow-md"
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}