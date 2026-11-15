import { useEffect, useState, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import StatusMessage from '../components/StatusMessage';
import type { ProfileFields, Status } from '../types/models';
import { PROFILE_COLUMNS } from '../types/models';
import { supabase } from '../utils/supabase';
import { useRequireAuth } from '../utils/useRequireAuth';
import { nameError } from '../utils/validation';

const MAX_AGE_YEARS = 120;

/** The message to show for a date of birth, or null when it is acceptable. */
function dateOfBirthError(dateOfBirth: string): string | null {
  if (!dateOfBirth) return null;
  const chosen = new Date(dateOfBirth);
  const today = new Date();
  if (chosen > today) return 'Date of birth cannot be a future calendar date.';

  const oldest = new Date();
  oldest.setFullYear(today.getFullYear() - MAX_AGE_YEARS);
  if (chosen < oldest) return 'Please input a realistic date of birth.';
  return null;
}

export default function Profile() {
  const session = useRequireAuth();
  const user = session?.user;
  const userId = user?.id;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Status | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [homeCountry, setHomeCountry] = useState('');
  const [preferredCurrency, setPreferredCurrency] = useState('USD');
  const [preferences, setPreferences] = useState('');
  const [profileExists, setProfileExists] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;

    const loadProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', userId)
        .maybeSingle<ProfileFields>();
      if (!active) return;

      if (error) {
        setMessage({
          type: 'error',
          text: `Unable to load traveler profile details. ${error.message || ''}`.trim(),
        });
      } else if (data) {
        setProfileExists(true);
        setFirstName(data.firstname ?? '');
        setLastName(data.lastname ?? '');
        setDateOfBirth(data.date_of_birth ?? '');
        setHomeCountry(data.home_country ?? '');
        setPreferredCurrency(data.preferred_currency ?? 'USD');
        setPreferences(data.preferences ?? '');
      }
      setLoading(false);
    };

    void loadProfile();
    return () => {
      active = false;
    };
  }, [userId]);

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    if (!userId) return;

    const cleanFirst = firstName.trim();
    const cleanLast = lastName.trim();
    const invalid = nameError(cleanFirst) ?? nameError(cleanLast) ?? dateOfBirthError(dateOfBirth);
    if (invalid) {
      setMessage({ type: 'error', text: invalid });
      return;
    }

    // The signup trigger creates every profile row, and profiles has no INSERT
    // policy, so a missing row cannot be fixed from here.
    if (!profileExists) {
      setMessage({
        type: 'error',
        text: 'Your traveler profile was not found. Please sign out and back in, or contact support.',
      });
      return;
    }

    setSaving(true);
    const fields: ProfileFields = {
      firstname: cleanFirst,
      lastname: cleanLast,
      date_of_birth: dateOfBirth || null,
      home_country: homeCountry,
      preferred_currency: preferredCurrency,
      preferences,
    };
    const { data: savedRow, error } = await supabase
      .from('profiles')
      .update(fields)
      .eq('id', userId)
      .select(PROFILE_COLUMNS)
      .maybeSingle<ProfileFields>();
    setSaving(false);

    if (error) {
      const context = [error.code, error.details, error.message].filter(Boolean).join(' - ');
      setMessage({
        type: 'error',
        text: context
          ? `Failed to update traveler details. ${context}`
          : 'Failed to update traveler details. Please try again.',
      });
    } else if (!savedRow) {
      // RLS hides rows that are not the user's own, so an update can match nothing.
      setMessage({
        type: 'error',
        text: 'Failed to update traveler details. No profile row was updated.',
      });
    } else {
      setMessage({ type: 'success', text: 'WanderMind profile updated successfully!' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-50">
        <p role="status" className="text-slate-500 animate-pulse font-medium">
          Loading your profile environment...
        </p>
      </div>
    );
  }

  const joinDate = user
    ? new Date(user.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        {/* Profile Top Banner Styling */}
        <div className="h-32 bg-[#652C15] w-full" />

        <div className="p-8 relative">
          {/* Circular Profile Avatar Overlay placement */}
          <div className="absolute -top-16 left-8">
            <Image
              src="/Profile-icon-2.png"
              alt="Traveler Avatar"
              width={96}
              height={96}
              className="w-24 h-24 rounded-full border-4 border-white object-cover shadow-md"
            />
          </div>

          <div className="pt-12">
            <h1 className="text-2xl font-bold text-slate-800">Traveler Profile</h1>
            <p className="text-sm text-slate-400 mb-6">
              Manage your core travel constraints and defaults
            </p>

            <StatusMessage status={message} className="mb-6" />

            <form onSubmit={handleSaveProfile} className="space-y-5">
              {/* Account Meta Columns (Read Only Sync with internal System) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Account Email
                  </label>
                  <input
                    type="text"
                    disabled
                    value={user?.email || ''}
                    className="w-full mt-1 p-2.5 bg-slate-100 text-slate-500 rounded-xl text-sm border-none outline-none cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Join Date (System Record)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={joinDate}
                    className="w-full mt-1 p-2.5 bg-slate-100 text-slate-500 rounded-xl text-sm border-none outline-none cursor-not-allowed"
                  />
                </div>
              </div>

              <hr className="border-slate-100 my-4" />

              {/* Editable Name Inputs Area */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    className="w-full mt-1 p-2.5 bg-white text-slate-700 rounded-xl text-sm border border-slate-200 focus:border-[#652C15] focus:ring-1 focus:ring-[#652C15] outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Last Name
                  </label>
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
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Home Country
                  </label>
                  <input
                    type="text"
                    value={homeCountry}
                    onChange={(e) => setHomeCountry(e.target.value)}
                    placeholder="e.g. United States, India"
                    className="w-full mt-1 p-2.5 bg-white text-slate-700 rounded-xl text-sm border border-slate-200 focus:border-[#652C15] focus:ring-1 focus:ring-[#652C15] outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Date of Birth
                  </label>
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
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Preferred Currency
                </label>
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
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Travel Preferences &amp; Dietary Restraints
                </label>
                <textarea
                  rows={3}
                  value={preferences}
                  onChange={(e) => setPreferences(e.target.value)}
                  placeholder="e.g., Vegetarian diet only, slow travel pacing, focused on cultural landmarks and historical museums, budget backpacker style."
                  className="w-full mt-1 p-2.5 bg-white text-slate-700 rounded-xl text-sm border border-slate-200 focus:border-[#652C15] focus:ring-1 focus:ring-[#652C15] outline-none transition resize-none"
                />
                <p className="text-slate-400 text-[11px] mt-1">
                  💡 These configurations will automatically guide the background agents when
                  formulating upcoming custom itineraries.
                </p>
              </div>

              {/* Navigation Elements Bar Footer Section */}
              <div className="mt-8 pt-6 border-t border-slate-100 flex justify-between items-center">
                <Link
                  href="/home"
                  className="px-5 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition font-medium text-sm"
                >
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
